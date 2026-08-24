import { handle, jsonOk } from '@/server/api';
import { getRuntime } from '@/server/context';
import { getPaymentProvider } from '@/domains/billing/registry';
import { applyWebhook } from '@/domains/billing/subscription';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * Gateway webhook.
 *
 * Order matters and is deliberate:
 *   1. read the RAW body (a re-serialised body would break the signature);
 *   2. verify the signature — an unverified request is not an event;
 *   3. apply exactly once, guarded by the payment_events unique index.
 *
 * A verification failure answers 403 and changes nothing. A duplicate answers
 * 200 with `duplicate` so the gateway stops retrying.
 */
export const POST = handle(async (request, context) => {
  const { provider: providerId } = await context.params;
  const { db, env } = await getRuntime();

  const provider = getPaymentProvider(env);
  if (providerId !== provider.id) {
    throw errors.notFound('Provedor de pagamento desconhecido.');
  }

  const rawBody = await request.text();
  const outcome = await provider.verifyWebhook(rawBody, request.headers);
  const result = await applyWebhook(db, provider.id, outcome);

  return jsonOk({ received: true, ...result });
});
