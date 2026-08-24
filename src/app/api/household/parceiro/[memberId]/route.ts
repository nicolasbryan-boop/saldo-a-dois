import { handle, jsonOk } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import { detachPartner } from '@/domains/households/invites';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export const DELETE = handle(async (_request, context) => {
  const app = await getAppContext();
  const { memberId } = await context.params;
  if (!memberId) throw errors.notFound();

  await detachPartner(app.db, app.household.id, app.user.id, memberId);
  return jsonOk({ ok: true });
});
