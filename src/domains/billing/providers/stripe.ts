import type {
  PaymentProvider,
  CreateCheckoutParams,
  CreateCheckoutResult,
  WebhookOutcome,
  RemoteSubscription,
} from '../provider';
import { errors } from '@/lib/errors';
import { getPlan, type PlanId } from '@/config';
import { timingSafeEqual } from './mock';

/**
 * Stripe implementation.
 *
 * Written against Stripe's REST API with `fetch` rather than the Node SDK, so
 * it runs unchanged on Workers.
 *
 * INERT until credentials exist: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and
 * a Price ID for the plan being sold. Without them it throws `not_configured`
 * naming the exact missing variable — it never guesses a price and never falls
 * back to the mock.
 *
 * Prices are per plan, so a partially configured account can sell the plans it
 * has prices for and refuse the others, rather than charging the wrong amount.
 */

const STRIPE_API = 'https://api.stripe.com/v1';
/** Reject webhook timestamps older than this to blunt replay attempts. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

export class StripePaymentProvider implements PaymentProvider {
  readonly id = 'stripe';
  readonly isReal = true;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly priceIds: Record<PlanId, string>,
  ) {}

  /**
   * @param planId when given, the price for that plan is required too.
   *               Webhook verification does not need any price.
   */
  private assertConfigured(planId?: PlanId): void {
    const missing: string[] = [];
    if (!this.secretKey) missing.push('STRIPE_SECRET_KEY');
    if (!this.webhookSecret) missing.push('STRIPE_WEBHOOK_SECRET');

    if (planId && !this.priceIds[planId]) {
      missing.push(getPlan(planId).stripePriceEnv);
    }

    if (missing.length) {
      throw errors.notConfigured(
        `Pagamentos não configurados. Faltam: ${missing.join(', ')}.`,
      );
    }
  }

  private async request(
    path: string,
    init: { method: 'GET' | 'POST'; form?: Record<string, string> },
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${STRIPE_API}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2025-10-29.clover',
      },
      body: init.form ? new URLSearchParams(init.form).toString() : undefined,
    });

    const payload = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const detail = (payload.error as { message?: string } | undefined)?.message;
      // The gateway's message is not shown to the user verbatim.
      console.error('[stripe] erro', response.status, detail ?? '');
      throw errors.internal('Não conseguimos falar com o meio de pagamento.');
    }

    return payload;
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    this.assertConfigured(params.planId);

    const session = await this.request('/checkout/sessions', {
      method: 'POST',
      form: {
        mode: 'subscription',
        'line_items[0][price]': this.priceIds[params.planId],
        'line_items[0][quantity]': '1',
        customer_email: params.email,
        client_reference_id: params.checkoutId,
        'metadata[checkout_id]': params.checkoutId,
        'metadata[plan_id]': params.planId,
        // Carried onto the subscription so a later webhook still knows the plan.
        'subscription_data[metadata][checkout_id]': params.checkoutId,
        'subscription_data[metadata][plan_id]': params.planId,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        locale: 'pt-BR',
      },
    });

    const url = typeof session.url === 'string' ? session.url : '';
    const id = typeof session.id === 'string' ? session.id : '';
    if (!url || !id) throw errors.internal('Resposta inesperada do meio de pagamento.');

    return { url, providerRef: id };
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookOutcome> {
    this.assertConfigured();

    const header = headers.get('stripe-signature') ?? '';
    const parts = Object.fromEntries(
      header.split(',').map((part) => {
        const [key, ...rest] = part.split('=');
        return [key?.trim() ?? '', rest.join('=')];
      }),
    );

    const timestamp = parts.t;
    const signature = parts.v1;
    if (!timestamp || !signature) {
      throw errors.forbidden('Assinatura do webhook ausente.');
    }

    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) {
      throw errors.forbidden('Webhook expirado.');
    }

    const expected = await hmacHex(this.webhookSecret, `${timestamp}.${rawBody}`);
    if (!timingSafeEqual(signature, expected)) {
      throw errors.forbidden('Assinatura do webhook inválida.');
    }

    const event = JSON.parse(rawBody) as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };

    const object = event.data?.object ?? {};

    if (event.type === 'checkout.session.completed') {
      const checkoutId =
        (object.client_reference_id as string | undefined) ??
        ((object.metadata as Record<string, string> | undefined)?.checkout_id ?? '');

      if (!checkoutId) return { kind: 'ignored', eventId: event.id, type: event.type };

      return {
        kind: 'checkout_paid',
        eventId: event.id,
        checkoutId,
        providerRef: String(object.id ?? ''),
        customerId: (object.customer as string | null) ?? null,
        subscriptionId: (object.subscription as string | null) ?? null,
        currentPeriodEnd: null,
      };
    }

    if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted' ||
      event.type === 'invoice.payment_failed'
    ) {
      const subscriptionId =
        event.type === 'invoice.payment_failed'
          ? String(object.subscription ?? '')
          : String(object.id ?? '');

      if (!subscriptionId) return { kind: 'ignored', eventId: event.id, type: event.type };

      const status =
        event.type === 'invoice.payment_failed'
          ? 'past_due'
          : mapStripeStatus(String(object.status ?? ''));

      const periodEndRaw = object.current_period_end;

      return {
        kind: 'subscription_updated',
        eventId: event.id,
        subscriptionId,
        status,
        currentPeriodEnd:
          typeof periodEndRaw === 'number' ? new Date(periodEndRaw * 1000) : null,
        cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
      };
    }

    return { kind: 'ignored', eventId: event.id, type: event.type };
  }

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    this.assertConfigured();
    await this.request(`/subscriptions/${providerSubscriptionId}`, {
      method: 'POST',
      form: { cancel_at_period_end: 'true' },
    });
  }

  async getSubscription(providerSubscriptionId: string): Promise<RemoteSubscription | null> {
    this.assertConfigured();
    const payload = await this.request(`/subscriptions/${providerSubscriptionId}`, {
      method: 'GET',
    });

    const periodEnd = payload.current_period_end;

    return {
      id: String(payload.id ?? providerSubscriptionId),
      status: mapStripeStatus(String(payload.status ?? '')),
      currentPeriodEnd: typeof periodEnd === 'number' ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: Boolean(payload.cancel_at_period_end),
    };
  }
}

function mapStripeStatus(status: string): 'active' | 'past_due' | 'canceled' | 'expired' {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    case 'incomplete_expired':
      return 'expired';
    default:
      return 'past_due';
  }
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}
