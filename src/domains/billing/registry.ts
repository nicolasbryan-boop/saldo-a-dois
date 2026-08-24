import type { PaymentProvider } from './provider';
import { MockPaymentProvider } from './providers/mock';
import { StripePaymentProvider } from './providers/stripe';
import { readEnv, isProduction, getAppUrl } from '@/server/context';

/**
 * Provider registry.
 *
 * PRODUCTION SAFETY: asking for the mock provider while APP_ENV=production
 * throws. There is deliberately no flag, header or query parameter that can
 * relax this — a subscription in production can only be created by a webhook
 * whose signature was verified by a real gateway.
 */
export function getPaymentProvider(env?: Partial<CloudflareEnv>): PaymentProvider {
  const configured = readEnv(env, 'PAYMENT_PROVIDER') || 'mock';
  const production = isProduction(env);

  if (configured === 'stripe') {
    return new StripePaymentProvider(
      readEnv(env, 'STRIPE_SECRET_KEY'),
      readEnv(env, 'STRIPE_WEBHOOK_SECRET'),
      readEnv(env, 'STRIPE_PRICE_ID'),
    );
  }

  if (production) {
    throw new Error(
      `PAYMENT_PROVIDER="${configured}" não é permitido em produção. Configure um gateway real.`,
    );
  }

  return new MockPaymentProvider(getAppUrl(env), mockSecret(env));
}

/**
 * Secret used to sign simulated webhooks. Derived from the auth secret so the
 * simulated gateway is still doing real signature verification.
 */
export function mockSecret(env?: Partial<CloudflareEnv>): string {
  return `${readEnv(env, 'BETTER_AUTH_SECRET') || 'dev-secret'}:mock-webhook`;
}

export function isMockBillingEnabled(env?: Partial<CloudflareEnv>): boolean {
  if (isProduction(env)) return false;
  const configured = readEnv(env, 'PAYMENT_PROVIDER') || 'mock';
  return configured === 'mock';
}
