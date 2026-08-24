import { handle, jsonOk } from '@/server/api';
import { getRuntime, isProduction } from '@/server/context';
import { getPaymentProvider, isMockBillingEnabled, mockSecret } from '@/domains/billing/registry';
import { MockPaymentProvider } from '@/domains/billing/providers/mock';
import { applyWebhook } from '@/domains/billing/subscription';
import { getCheckoutSession } from '@/domains/billing/subscription';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * The simulated gateway's "payment approved" button.
 *
 * It builds a real payload, signs it with the mock provider's HMAC secret and
 * pushes it through the SAME verification and idempotency path a real webhook
 * takes. Nothing here shortcuts the subscription logic.
 *
 * REFUSED IN PRODUCTION, twice over: `isMockBillingEnabled` is false when
 * APP_ENV=production, and `getPaymentProvider` throws for a mock provider in
 * production anyway.
 */
export const POST = handle(async (_request, context) => {
  const { env, db } = await getRuntime();

  if (isProduction(env) || !isMockBillingEnabled(env)) {
    throw errors.notFound();
  }

  const { id } = await context.params;
  const checkout = await getCheckoutSession(db, id ?? '');
  if (!checkout) throw errors.notFound('Compra não encontrada.');

  const provider = getPaymentProvider(env);

  const payload = JSON.stringify({
    id: `evt_mock_${checkout.id}`,
    type: 'checkout.paid',
    checkoutId: checkout.id,
  });

  const signature = await MockPaymentProvider.sign(mockSecret(env), payload);
  const headers = new Headers({ 'x-mock-signature': signature });

  const outcome = await provider.verifyWebhook(payload, headers);
  const result = await applyWebhook(db, provider.id, outcome);

  return jsonOk({ ok: true, ...result });
});
