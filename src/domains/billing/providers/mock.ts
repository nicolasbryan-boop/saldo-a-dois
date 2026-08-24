import type {
  PaymentProvider,
  CreateCheckoutParams,
  CreateCheckoutResult,
  WebhookOutcome,
  RemoteSubscription,
} from '../provider';
import { errors } from '@/lib/errors';
import { getPlan, periodEndFor } from '@/config';

/**
 * Development-only payment provider.
 *
 * It renders a local page that stands in for the gateway and posts a signed
 * webhook back to our own endpoint, so the *whole* real flow — checkout row,
 * webhook verification, idempotency, subscription activation — is exercised
 * without a gateway account.
 *
 * The registry refuses to construct this in production. There is no code path
 * in which a production request can reach it.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly id = 'mock';
  readonly isReal = false;

  constructor(
    private readonly appUrl: string,
    private readonly secret: string,
  ) {}

  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const providerRef = `mock_ref_${params.checkoutId}`;
    const url = `${this.appUrl}/checkout/simulado/${params.checkoutId}`;
    return { url, providerRef };
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookOutcome> {
    const signature = headers.get('x-mock-signature') ?? '';
    const expected = await hmacHex(this.secret, rawBody);

    if (!signature || !timingSafeEqual(signature, expected)) {
      throw errors.forbidden('Assinatura do webhook inválida.');
    }

    const payload = JSON.parse(rawBody) as {
      id?: string;
      type?: string;
      checkoutId?: string;
      subscriptionId?: string;
      status?: string;
      planId?: string;
    };

    const eventId = payload.id ?? '';
    if (!eventId) throw errors.validation('Evento sem identificador.');

    if (payload.type === 'checkout.paid' && payload.checkoutId) {
      return {
        kind: 'checkout_paid',
        eventId,
        checkoutId: payload.checkoutId,
        providerRef: `mock_ref_${payload.checkoutId}`,
        customerId: `mock_cus_${payload.checkoutId}`,
        subscriptionId: `mock_sub_${payload.checkoutId}`,
        // Left to the plan: the caller derives the period from the plan bought,
        // so a yearly plan does not get a one-month period in development.
        currentPeriodEnd: null,
      };
    }

    if (payload.type === 'subscription.updated' && payload.subscriptionId) {
      const status = payload.status;
      const known = ['active', 'past_due', 'canceled', 'expired'] as const;
      const resolved = known.find((value) => value === status) ?? 'active';
      const periodEnd = periodEndFor(getPlan(payload.planId), new Date());
      return {
        kind: 'subscription_updated',
        eventId,
        subscriptionId: payload.subscriptionId,
        status: resolved,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      };
    }

    return { kind: 'ignored', eventId, type: payload.type ?? 'unknown' };
  }

  async cancelSubscription(): Promise<void> {
    // Nothing remote to cancel; the local subscription row is the source of
    // truth in development.
  }

  async getSubscription(providerSubscriptionId: string): Promise<RemoteSubscription | null> {
    const periodEnd = periodEndFor(getPlan(null), new Date());
    return {
      id: providerSubscriptionId,
      status: 'active',
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    };
  }

  /** Exposed so the simulated checkout page can sign its own callback. */
  static async sign(secret: string, body: string): Promise<string> {
    return hmacHex(secret, body);
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

/** Constant-time comparison so a signature cannot be discovered by timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export { hmacHex };
