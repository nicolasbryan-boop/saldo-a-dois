import type { PlanId } from '@/config';

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
  /** Which recurring plan is being bought. Selects the gateway price. */
  planId: PlanId;
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
  /**
   * @param url the full request URL. Mercado Pago signs the resource id that
   *            travels as a query parameter, so the body alone is not enough
   *            to rebuild the signature. Providers that do not need it ignore
   *            it.
   */
  verifyWebhook(rawBody: string, headers: Headers, url: string): Promise<WebhookOutcome>;

  cancelSubscription(providerSubscriptionId: string): Promise<void>;

  getSubscription(providerSubscriptionId: string): Promise<RemoteSubscription | null>;
}


/**
 * TRANSPARENT CHECKOUT
 * ====================
 * An optional second capability. A provider that implements it can take the
 * payment without sending the customer to another domain: Pix renders as a QR
 * code inside our page, and card details are tokenised in the browser by the
 * gateway's own script.
 *
 * Card data never reaches our backend. What crosses the wire to us is a
 * single-use token minted by the gateway — we could not store a card number
 * if we wanted to, which is exactly the point.
 *
 * Providers that only know how to redirect simply do not implement this, and
 * the checkout page falls back to `createCheckout`.
 */

export interface PixChargeParams {
  checkoutId: string;
  email: string;
  planId: PlanId;
  amountCents: number;
  /** Shown on the payer's bank statement. */
  description: string;
  notificationUrl: string;
  /**
   * Payer tax id (CPF). Brazilian acquirers usually require it for Pix, and
   * an account configured that way rejects the charge without it.
   */
  payerDocument?: string;
  payerName?: string;
}

export interface PixCharge {
  providerRef: string;
  /** Copy-and-paste Pix string. */
  code: string;
  /** PNG, base64, no data: prefix. */
  qrCodeBase64: string;
  expiresAt: Date | null;
}

export interface CardChargeParams {
  checkoutId: string;
  email: string;
  planId: PlanId;
  amountCents: number;
  description: string;
  notificationUrl: string;
  /** Where the browser returns after authorisation. A page, not the webhook. */
  backUrl: string;
  /** Single-use token minted by the gateway's browser SDK. */
  cardToken: string;
  /** Payer tax id (CPF), required by Brazilian acquirers. */
  payerDocument?: string;
  installments?: number;
}

export interface CardChargeResult {
  providerRef: string;
  status: 'approved' | 'pending' | 'rejected';
  /** Gateway's own reason code, surfaced to the customer as a friendly message. */
  statusDetail: string;
  /** Set when the charge created a recurring subscription. */
  subscriptionId: string | null;
}

export interface TransparentPaymentProvider extends PaymentProvider {
  readonly supportsTransparent: true;
  /** Publishable key for the browser SDK. Safe to render in HTML. */
  readonly publicKey: string;

  createPixCharge(params: PixChargeParams): Promise<PixCharge>;
  createCardCharge(params: CardChargeParams): Promise<CardChargeResult>;
}

export function isTransparent(
  provider: PaymentProvider,
): provider is TransparentPaymentProvider {
  return (provider as TransparentPaymentProvider).supportsTransparent === true;
}
