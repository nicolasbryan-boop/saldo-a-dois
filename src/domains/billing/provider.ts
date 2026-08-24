import { pricing } from '@/config';

/**
 * PAYMENT ABSTRACTION
 * ===================
 * Nothing in the product talks to a gateway directly. Everything goes through
 * this interface, so swapping Stripe for Pagar.me / Asaas / Mercado Pago is a
 * new implementation, not a refactor of the product.
 *
 * Two rules are enforced by the registry in `index.ts`:
 *  1. The mock provider refuses to load when APP_ENV=production.
 *  2. A real provider without credentials fails loudly instead of pretending.
 */

export interface CreateCheckoutParams {
  /** Our own checkout row id — the correlation key across the whole flow. */
  checkoutId: string;
  email: string;
  planId: string;
  amountCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutResult {
  /** Where the browser should be sent. */
  url: string;
  /** Gateway-side identifier, stored on the checkout row. */
  providerRef: string;
}

export type WebhookOutcome =
  | {
      kind: 'checkout_paid';
      eventId: string;
      checkoutId: string;
      providerRef: string;
      customerId: string | null;
      subscriptionId: string | null;
      currentPeriodEnd: Date | null;
    }
  | {
      kind: 'subscription_updated';
      eventId: string;
      subscriptionId: string;
      status: 'active' | 'past_due' | 'canceled' | 'expired';
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
    }
  | { kind: 'ignored'; eventId: string; type: string };

export interface RemoteSubscription {
  id: string;
  status: 'active' | 'past_due' | 'canceled' | 'expired';
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface PaymentProvider {
  readonly id: string;
  /** True when this provider may be used to take real money. */
  readonly isReal: boolean;

  createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult>;

  /**
   * Verifies the signature and parses the payload. MUST throw when the
   * signature does not check out — an unverified webhook is not an event.
   */
  verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookOutcome>;

  cancelSubscription(providerSubscriptionId: string): Promise<void>;

  getSubscription(providerSubscriptionId: string): Promise<RemoteSubscription | null>;
}

export const PLAN = pricing.plan;
