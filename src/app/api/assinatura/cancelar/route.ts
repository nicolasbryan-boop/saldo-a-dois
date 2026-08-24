import { handle, jsonOk } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import { getRuntime } from '@/server/context';
import { getPaymentProvider } from '@/domains/billing/registry';
import { markCancelAtPeriodEnd } from '@/domains/billing/subscription';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * Requests cancellation at the end of the paid period.
 *
 * Only the owner may do this — a partner has full access to the money but not
 * to the billing relationship.
 */
export const POST = handle(async () => {
  const context = await getAppContext();

  if (context.role !== 'owner') {
    throw errors.forbidden('Só quem criou o espaço pode gerenciar a assinatura.');
  }
  if (!context.subscription) throw errors.notFound('Assinatura não encontrada.');

  const { env } = await getRuntime();
  const provider = getPaymentProvider(env);

  if (context.subscription.providerSubscriptionId) {
    await provider.cancelSubscription(context.subscription.providerSubscriptionId);
  }

  await markCancelAtPeriodEnd(context.db, context.household.id, context.user.id);

  return jsonOk({ ok: true });
});
