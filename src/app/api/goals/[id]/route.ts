import { z } from 'zod';
import { handle, jsonOk, readJson, amountCentsSchema } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import { updateGoal, deleteGoal } from '@/domains/goals/service';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  targetCents: amountCentsSchema.optional(),
  monthlyPlanCents: z.number().int().min(0).optional(),
  currentCents: z.number().int().min(0).optional(),
  icon: z.string().max(40).optional(),
  active: z.boolean().optional(),
});

export const PATCH = handle(async (request, context) => {
  const app = await getAppContext();
  const { id } = await context.params;
  if (!id) throw errors.notFound();

  const body = await readJson(request, schema);
  const goal = await updateGoal(app.db, app.household.id, app.user.id, id, body);
  return jsonOk({ goal });
});

export const DELETE = handle(async (_request, context) => {
  const app = await getAppContext();
  const { id } = await context.params;
  if (!id) throw errors.notFound();

  await deleteGoal(app.db, app.household.id, app.user.id, id);
  return jsonOk({ ok: true });
});
