import { handle, jsonOk } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import { assertOwner } from '@/domains/households/service';
import { revokePendingInvites } from '@/domains/households/invites';

export const dynamic = 'force-dynamic';

/**
 * Cancels the household's pending invite.
 *
 * Only the owner, and only their own household — the household is resolved
 * from the session, never from the request, so there is no id to tamper with.
 *
 * Revoking frees the second seat, which is the only way to invite a different
 * person before the current invite expires.
 */
export const DELETE = handle(async () => {
  const context = await getAppContext();
  await assertOwner(context.db, context.user.id, context.household.id);

  await revokePendingInvites(context.db, context.household.id);

  return jsonOk({ ok: true });
});
