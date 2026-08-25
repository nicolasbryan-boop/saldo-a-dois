import type { PaymentProvider } from './provider';
import { MockPaymentProvider } from './providers/mock';
import { StripePaymentProvider } from './providers/stripe';
import { MercadoPagoPaymentProvider } from './providers/mercadopago';
import { readEnv, isProduction, getAppUrl } from '@/server/context';
import { planIds, planList, type PlanId } from '@/config';

/**
 * Provider registry.
 *
 * PRODUCTION SAFETY: asking for the mock provider while APP_ENV=production
 * throws. There is deliberately no flag, header or query parameter that can
 * relax this — a subscription in production can only be created by a webhook
 * whose signature was verified by a real gateway.
 */
/**
 * Strips what a paste commonly drags along.
 *
 * Whitespace around a token produces an invalid Authorization header, which
 * the runtime drops silently — the gateway then reports no authorization at
 * all, which reads like a missing secret rather than a malformed one. Quotes
 * survive a copy from a JSON snippet and break the header the same way.
 *
 * Nothing inside the credential is touched.
 */
function cleanCredential(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '').trim();
}

export function getPaymentProvider(env?: Partial<CloudflareEnv>): PaymentProvider {
  const configured = readEnv(env, 'PAYMENT_PROVIDER') || 'mock';
  const production = isProduction(env);

  if (configured === 'stripe') {
    return new StripePaymentProvider(
      readEnv(env, 'STRIPE_SECRET_KEY'),
      readEnv(env, 'STRIPE_WEBHOOK_SECRET'),
      stripePriceIds(env),
    );
  }

  if (configured === 'mercadopago') {
    return new MercadoPagoPaymentProvider(
      cleanCredential(readEnv(env, 'MERCADOPAGO_ACCESS_TOKEN')),
      cleanCredential(readEnv(env, 'MERCADOPAGO_PUBLIC_KEY')),
      cleanCredential(readEnv(env, 'MERCADOPAGO_WEBHOOK_SECRET')),
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
 * Stripe Price ID per plan, read from the env var each plan declares.
 *
 * A missing entry is left empty rather than defaulted: the provider then
 * refuses that specific plan and names the variable, instead of silently
 * charging the wrong price.
 */
export function stripePriceIds(env?: Partial<CloudflareEnv>): Record<PlanId, string> {
  const entries = planList.map((plan) => [plan.id, readEnv(env, plan.stripePriceEnv)]);
  return Object.fromEntries(entries) as Record<PlanId, string>;
}

/**
 * Plans that can actually be sold right now.
 *
 * Only Stripe needs a per-plan price registered upstream. Mercado Pago and
 * the mock take the amount from our own catalogue, so every plan is sellable
 * as soon as the account credentials exist.
 */
export function configuredPlanIds(env?: Partial<CloudflareEnv>): PlanId[] {
  const configured = readEnv(env, 'PAYMENT_PROVIDER') || 'mock';
  if (configured !== 'stripe') return [...planIds];

  const prices = stripePriceIds(env);
  return planIds.filter((id) => prices[id].length > 0);
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
