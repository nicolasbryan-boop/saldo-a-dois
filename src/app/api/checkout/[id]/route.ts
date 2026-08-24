import { handle, jsonOk } from '@/server/api';
import { getRuntime } from '@/server/context';
import { getCheckoutSession, isCheckoutClaimable } from '@/domains/billing/subscription';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * Status of a checkout, polled by the return page.
 *
 * The status returned here is whatever the verified webhook wrote to the row.
 * A browser cannot make this say "paid".
 */
export const GET = handle(async (_request, context) => {
  const { id } = await context.params;
  if (!id) throw errors.notFound();

  const { db } = await getRuntime();
  const checkout = await getCheckoutSession(db, id);
  if (!checkout) throw errors.notFound('Compra não encontrada.');

  return jsonOk({
    id: checkout.id,
    status: checkout.status,
    email: checkout.email,
    claimable: isCheckoutClaimable(checkout),
    amountCents: checkout.amountCents,
    planId: checkout.planId,
  });
});
