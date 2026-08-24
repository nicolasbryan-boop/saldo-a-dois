import { z } from 'zod';
import { handle, jsonOk, readJson, rateLimit } from '@/server/api';
import { getRuntime, getAppUrl } from '@/server/context';
import { getPaymentProvider } from '@/domains/billing/registry';
import {
  createCheckoutSession,
  attachProviderRef,
} from '@/domains/billing/subscription';
import { isTransparent } from '@/domains/billing/provider';
import { trackEvent } from '@/domains/analytics/audit';
import { getPlan, planIds, pricing, branding } from '@/config';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('pix'),
    email: z.email('Informe um e-mail válido').max(160),
    planId: z.enum(planIds).default(pricing.defaultPlanId),
  }),
  z.object({
    method: z.literal('card'),
    email: z.email('Informe um e-mail válido').max(160),
    planId: z.enum(planIds).default(pricing.defaultPlanId),
    /**
     * Minted in the browser by the gateway's SDK. This is the only piece of
     * card information that exists on our side, and it is single-use.
     */
    cardToken: z.string().min(8).max(256),
    payerDocument: z.string().min(11).max(20).optional(),
    installments: z.number().int().min(1).max(12).optional(),
  }),
]);

/**
 * Transparent checkout: takes the payment without leaving our domain.
 *
 * The amount always comes from our own catalogue, never from the request —
 * same rule as the redirect flow. The browser picks WHICH plan; it does not
 * get to say what that plan costs.
 *
 * Card numbers are never accepted here. The schema has no field for one; what
 * arrives is a token the gateway already minted, so there is no code path in
 * which this backend could see or store a card.
 */
export const POST = handle(async (request) => {
  await rateLimit(request, 'checkout', { max: 10, windowSeconds: 600 });

  const body = await readJson(request, schema);
  const { db, env } = await getRuntime();

  const provider = getPaymentProvider(env);

  if (!isTransparent(provider)) {
    throw errors.notConfigured(
      'O meio de pagamento atual não suporta pagamento dentro do site.',
    );
  }

  const plan = getPlan(body.planId);
  const appUrl = getAppUrl(env);
  const notificationUrl = `${appUrl}/api/webhooks/payment/${provider.id}`;

  const checkout = await createCheckoutSession(db, {
    email: body.email,
    provider: provider.id,
    planId: plan.id,
  });

  const description = `${branding.name} — plano ${plan.name}`;

  if (body.method === 'pix') {
    const charge = await provider.createPixCharge({
      checkoutId: checkout.id,
      email: checkout.email,
      planId: plan.id,
      amountCents: plan.priceCents,
      description,
      notificationUrl,
    });

    await attachProviderRef(db, checkout.id, charge.providerRef);

    await trackEvent(db, {
      name: 'checkout_started',
      props: { provider: provider.id, plan: plan.id, method: 'pix' },
    });

    return jsonOk({
      method: 'pix',
      checkoutId: checkout.id,
      planId: plan.id,
      amountCents: plan.priceCents,
      code: charge.code,
      qrCodeBase64: charge.qrCodeBase64,
      expiresAt: charge.expiresAt?.toISOString() ?? null,
    });
  }

  const result = await provider.createCardCharge({
    checkoutId: checkout.id,
    email: checkout.email,
    planId: plan.id,
    amountCents: plan.priceCents,
    description,
    notificationUrl,
    cardToken: body.cardToken,
    payerDocument: body.payerDocument,
    installments: body.installments,
  });

  await attachProviderRef(db, checkout.id, result.providerRef);

  await trackEvent(db, {
    name: 'checkout_started',
    props: { provider: provider.id, plan: plan.id, method: 'card' },
  });

  // Approval is still only confirmed by the webhook. This response tells the
  // browser what to show; it never activates a subscription on its own.
  return jsonOk({
    method: 'card',
    checkoutId: checkout.id,
    planId: plan.id,
    amountCents: plan.priceCents,
    status: result.status,
    statusDetail: result.statusDetail,
  });
});
