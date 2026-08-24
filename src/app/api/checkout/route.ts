import { z } from 'zod';
import { handle, jsonOk, readJson, rateLimit } from '@/server/api';
import { getRuntime, getAppUrl } from '@/server/context';
import { getPaymentProvider } from '@/domains/billing/registry';
import {
  createCheckoutSession,
  attachProviderRef,
} from '@/domains/billing/subscription';
import { trackEvent } from '@/domains/analytics/audit';
import { getPlan, planIds, pricing } from '@/config';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.email('Informe um e-mail válido').max(160),
  // Only an id from our catalogue is accepted; the price is looked up here.
  planId: z.enum(planIds).default(pricing.defaultPlanId),
});

/**
 * Starts a purchase.
 *
 * Creates our own checkout row first, then asks the gateway for a session
 * carrying that row id. The row id is the correlation key the webhook uses
 * later — nothing about payment status is decided here.
 */
export const POST = handle(async (request) => {
  await rateLimit(request, 'checkout', { max: 10, windowSeconds: 600 });

  const { email, planId } = await readJson(request, schema);
  const { db, env } = await getRuntime();

  const plan = getPlan(planId);
  const provider = getPaymentProvider(env);
  const checkout = await createCheckoutSession(db, {
    email,
    provider: provider.id,
    planId: plan.id,
  });

  const appUrl = getAppUrl(env);
  const result = await provider.createCheckout({
    checkoutId: checkout.id,
    email: checkout.email,
    planId: plan.id,
    amountCents: plan.priceCents,
    currency: pricing.currency,
    successUrl: `${appUrl}/checkout/retorno/${checkout.id}`,
    cancelUrl: `${appUrl}/checkout?cancelado=1`,
  });

  await attachProviderRef(db, checkout.id, result.providerRef);

  await trackEvent(db, {
    name: 'checkout_started',
    props: { provider: provider.id, plan: plan.id },
  });

  return jsonOk({ checkoutId: checkout.id, url: result.url, planId: plan.id });
});
