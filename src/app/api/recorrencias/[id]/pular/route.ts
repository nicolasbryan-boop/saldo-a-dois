import { handle, jsonOk } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import { skipInstance, unskipInstance } from '@/domains/recurrences/service';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export const POST = handle(async (_request, context) => {
  const app = await getAppContext();
  const { id } = await context.params;
  if (!id) throw errors.notFound();

  await skipInstance(app.db, app.household.id, app.user.id, id);
  return jsonOk({ ok: true });
});

export const DELETE = handle(async (_request, context) => {
  const app = await getAppContext();
  const { id } = await context.params;
  if (!id) throw errors.notFound();

  await unskipInstance(app.db, app.household.id, id);
  return jsonOk({ ok: true });
});
