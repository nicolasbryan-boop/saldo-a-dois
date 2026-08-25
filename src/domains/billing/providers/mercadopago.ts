import type {
  TransparentPaymentProvider,
  CreateCheckoutParams,
  CreateCheckoutResult,
  WebhookOutcome,
  RemoteSubscription,
  PixChargeParams,
  PixCharge,
  CardChargeParams,
  CardChargeResult,
} from '../provider';
import { errors } from '@/lib/errors';
import { getPlan, type PlanId } from '@/config';
import { timingSafeEqual } from './mock';

/**
 * Mercado Pago implementation, transparent checkout.
 *
 * Written against the REST API with `fetch`, so it runs unchanged on Workers.
 *
 * WHY TRANSPARENT: the customer stays on our domain. Pix comes back as a QR
 * code and a copy-paste string we render ourselves; card details are tokenised
 * in the browser by Mercado Pago's own SDK and reach us only as a single-use
 * token. No card number, CVV or expiry ever touches this backend or our
 * database — there is no code path that could store one.
 *
 * INERT until credentials exist: MERCADOPAGO_ACCESS_TOKEN,
 * MERCADOPAGO_PUBLIC_KEY and MERCADOPAGO_WEBHOOK_SECRET. Without them every
 * entry point throws `not_configured` naming the exact missing variable. It
 * never guesses and never falls back to the mock.
 *
 * NOT YET EXERCISED AGAINST THE LIVE API. Every request shape here is written
 * from Mercado Pago's documented contract, but no call has been made with real
 * credentials, because none exist in this project yet. Treat the first run in
 * a Mercado Pago *test* account as the real integration test.
 */

const MP_API = 'https://api.mercadopago.com';

/** Reject webhook timestamps older than this to blunt replay attempts. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Pix cannot be a recurring authorisation at Mercado Pago — it settles once.
 * A Pix purchase therefore buys exactly one plan period, and the customer
 * renews by paying again. Card can be a real `preapproval` subscription.
 */
type Rendered = Record<string, unknown>;

async function hmacHex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export class MercadoPagoPaymentProvider implements TransparentPaymentProvider {
  readonly id = 'mercadopago';
  readonly isReal = true;
  readonly supportsTransparent = true;

  constructor(
    private readonly accessToken: string,
    readonly publicKey: string,
    private readonly webhookSecret: string,
  ) {}

  private assertConfigured(needsPublicKey = false): void {
    const missing: string[] = [];
    if (!this.accessToken) missing.push('MERCADOPAGO_ACCESS_TOKEN');
    if (!this.webhookSecret) missing.push('MERCADOPAGO_WEBHOOK_SECRET');
    if (needsPublicKey && !this.publicKey) missing.push('MERCADOPAGO_PUBLIC_KEY');

    if (missing.length) {
      throw errors.notConfigured(
        `Pagamentos não configurados. Faltam: ${missing.join(', ')}.`,
      );
    }
  }

  private async call(
    path: string,
    init: { method: string; body?: unknown; idempotencyKey?: string },
  ): Promise<Rendered> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };

    // Mercado Pago dedupes on this key, so a retried request cannot charge
    // the same person twice.
    if (init.idempotencyKey) headers['X-Idempotency-Key'] = init.idempotencyKey;

    const response = await fetch(`${MP_API}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    const text = await response.text();
    let payload: Rendered = {};
    try {
      payload = text ? (JSON.parse(text) as Rendered) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      // Surface the gateway's own message; it is written for the payer.
      const message =
        typeof payload.message === 'string'
          ? payload.message
          : `Mercado Pago respondeu ${response.status}.`;
      throw errors.internal(message);
    }

    return payload;
  }

  /**
   * Fallback redirect flow, kept so this provider still satisfies the base
   * interface. The product uses the transparent methods below; this exists so
   * a caller that only knows `createCheckout` is not left without a payment.
   */
  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    this.assertConfigured();

    const plan = getPlan(params.planId);

    const preference = await this.call('/checkout/preferences', {
      method: 'POST',
      idempotencyKey: params.checkoutId,
      body: {
        items: [
          {
            id: plan.id,
            title: `${plan.name} — Saldo a Dois`,
            quantity: 1,
            currency_id: 'BRL',
            unit_price: params.amountCents / 100,
          },
        ],
        payer: { email: params.email },
        external_reference: params.checkoutId,
        back_urls: { success: params.successUrl, failure: params.cancelUrl },
        auto_return: 'approved',
      },
    });

    const url =
      typeof preference.init_point === 'string' ? preference.init_point : '';
    const id = typeof preference.id === 'string' ? preference.id : String(preference.id ?? '');

    if (!url || !id) throw errors.internal('Resposta inesperada do meio de pagamento.');
    return { url, providerRef: id };
  }

  async createPixCharge(params: PixChargeParams): Promise<PixCharge> {
    this.assertConfigured();

    const payment = await this.call('/v1/payments', {
      method: 'POST',
      idempotencyKey: `pix_${params.checkoutId}`,
      body: {
        transaction_amount: params.amountCents / 100,
        description: params.description,
        payment_method_id: 'pix',
        payer: {
          email: params.email,
          ...(params.payerName ? { first_name: params.payerName } : {}),
          ...(params.payerDocument
            ? { identification: { type: 'CPF', number: params.payerDocument } }
            : {}),
        },
        // The correlation key across our whole flow, echoed back on webhooks.
        external_reference: params.checkoutId,
        notification_url: params.notificationUrl,
        metadata: { checkout_id: params.checkoutId, plan_id: params.planId },
      },
    });

    const interaction = payment.point_of_interaction as
      | { transaction_data?: Record<string, unknown> }
      | undefined;
    const data = interaction?.transaction_data ?? {};

    const code = typeof data.qr_code === 'string' ? data.qr_code : '';
    const qrCodeBase64 = typeof data.qr_code_base64 === 'string' ? data.qr_code_base64 : '';

    if (!code) {
      throw errors.internal('Mercado Pago não devolveu o código Pix.');
    }

    const expiration =
      typeof payment.date_of_expiration === 'string' ? payment.date_of_expiration : null;

    return {
      providerRef: String(payment.id ?? ''),
      code,
      qrCodeBase64,
      expiresAt: expiration ? new Date(expiration) : null,
    };
  }

  async createCardCharge(params: CardChargeParams): Promise<CardChargeResult> {
    this.assertConfigured(true);

    const plan = getPlan(params.planId);

    // A card can carry a real recurring authorisation, so this creates a
    // preapproval rather than a one-off charge. The customer is charged on
    // the plan's own cadence without us storing anything about the card.
    const preapproval = await this.call('/preapproval', {
      method: 'POST',
      idempotencyKey: `card_${params.checkoutId}`,
      body: {
        reason: `${plan.name} — Saldo a Dois`,
        external_reference: params.checkoutId,
        payer_email: params.email,
        card_token_id: params.cardToken,
        auto_recurring: {
          frequency: plan.intervalMonths,
          frequency_type: 'months',
          transaction_amount: params.amountCents / 100,
          currency_id: 'BRL',
        },
        // A page the buyer can land on — not the webhook endpoint.
        back_url: params.backUrl,
        status: 'authorized',
      },
    });

    const status = String(preapproval.status ?? '');

    return {
      providerRef: String(preapproval.id ?? ''),
      status:
        status === 'authorized'
          ? 'approved'
          : status === 'pending'
            ? 'pending'
            : 'rejected',
      statusDetail: String(preapproval.reason ?? status),
      subscriptionId: String(preapproval.id ?? '') || null,
    };
  }

  /**
   * Mercado Pago signs with `x-signature: ts=...,v1=...` over a manifest built
   * from the resource id, the request id and the timestamp.
   *
   * The notification body carries only an id, so this then fetches the real
   * resource. That is deliberate on their side: it means a forged body cannot
   * assert a payment was approved, because we ask the gateway, not the caller.
   */
  async verifyWebhook(
    rawBody: string,
    headers: Headers,
    url: string,
  ): Promise<WebhookOutcome> {
    this.assertConfigured();

    const header = headers.get('x-signature') ?? '';
    const parts = Object.fromEntries(
      header.split(',').map((part) => {
        const [key, ...rest] = part.split('=');
        return [key?.trim() ?? '', rest.join('=').trim()];
      }),
    );

    const timestamp = parts.ts;
    const signature = parts.v1;
    if (!timestamp || !signature) {
      throw errors.forbidden('Assinatura do webhook ausente.');
    }

    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) {
      throw errors.forbidden('Webhook expirado.');
    }

    const body = JSON.parse(rawBody) as {
      id?: string | number;
      type?: string;
      action?: string;
      data?: { id?: string | number };
    };

    // Mercado Pago signs the id exactly as it appears in the query string
    // (`?type=payment&data.id=123`), not as it appears in the body. Building
    // the manifest from the body makes every signature fail. The body is only
    // a fallback for a delivery that carries no query parameters.
    let queryId: string | null = null;
    try {
      queryId = new URL(url).searchParams.get('data.id');
    } catch {
      // A malformed URL should end as a refused signature, not a 500.
      queryId = null;
    }

    const resourceId = queryId ?? String(body.data?.id ?? '');

    // Lowercased for the manifest only. A preapproval id is an alphanumeric
    // hash and IS case sensitive, so every lookup below uses the raw id.
    const signedId = resourceId.toLowerCase();
    const requestId = headers.get('x-request-id') ?? '';

    const manifest = `id:${signedId};request-id:${requestId};ts:${timestamp};`;
    const expected = await hmacHex(this.webhookSecret, manifest);

    if (!timingSafeEqual(signature, expected)) {
      throw errors.forbidden('Assinatura do webhook inválida.');
    }

    // The event id we deduplicate on. Mercado Pago may deliver the same
    // notification more than once, and the id plus the resource is what makes
    // the retry a no-op upstream in `payment_events`.
    const eventId = `${body.type ?? 'unknown'}:${resourceId}:${body.action ?? ''}`;

    if (body.type === 'payment') {
      const payment = await this.call(`/v1/payments/${resourceId}`, { method: 'GET' });
      const status = String(payment.status ?? '');
      const checkoutId = String(payment.external_reference ?? '');

      if (!checkoutId) return { kind: 'ignored', eventId, type: 'payment' };

      if (status === 'approved') {
        return {
          kind: 'checkout_paid',
          eventId,
          checkoutId,
          providerRef: resourceId,
          customerId: String(
            (payment.payer as { id?: string | number } | undefined)?.id ?? '',
          ) || null,
          // A Pix payment is a single settlement, not a subscription.
          subscriptionId: null,
          currentPeriodEnd: null,
        };
      }

      return { kind: 'ignored', eventId, type: `payment.${status}` };
    }

    if (body.type === 'subscription_preapproval' || body.type === 'preapproval') {
      const preapproval = await this.call(`/preapproval/${resourceId}`, { method: 'GET' });
      const status = String(preapproval.status ?? '');

      return {
        kind: 'subscription_updated',
        eventId,
        subscriptionId: resourceId,
        status:
          status === 'authorized'
            ? 'active'
            : status === 'paused'
              ? 'past_due'
              : status === 'cancelled'
                ? 'canceled'
                : 'expired',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: status === 'cancelled',
      };
    }

    return { kind: 'ignored', eventId, type: String(body.type ?? 'unknown') };
  }

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    this.assertConfigured();
    await this.call(`/preapproval/${providerSubscriptionId}`, {
      method: 'PUT',
      body: { status: 'cancelled' },
    });
  }

  async getSubscription(
    providerSubscriptionId: string,
  ): Promise<RemoteSubscription | null> {
    this.assertConfigured();

    const preapproval = await this.call(`/preapproval/${providerSubscriptionId}`, {
      method: 'GET',
    });

    const status = String(preapproval.status ?? '');
    const nextPayment =
      typeof preapproval.next_payment_date === 'string'
        ? new Date(preapproval.next_payment_date)
        : null;

    return {
      id: providerSubscriptionId,
      status:
        status === 'authorized'
          ? 'active'
          : status === 'paused'
            ? 'past_due'
            : status === 'cancelled'
              ? 'canceled'
              : 'expired',
      currentPeriodEnd: nextPayment,
      cancelAtPeriodEnd: status === 'cancelled',
    };
  }
}

/** Plans a Mercado Pago account can actually sell right now. */
export function mercadoPagoConfigured(env: {
  accessToken: string;
  publicKey: string;
  webhookSecret: string;
}): boolean {
  return Boolean(env.accessToken && env.publicKey && env.webhookSecret);
}

export type { PlanId };
