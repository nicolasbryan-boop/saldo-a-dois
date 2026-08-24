import { z } from 'zod';
import { handle, jsonOk, readJson, amountCentsSchema } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import { createGoal, listGoals } from '@/domains/goals/service';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().trim().min(1, 'Dê um nome para a meta').max(80),
  targetCents: amountCentsSchema,
  monthlyPlanCents: z.number().int().min(0).optional(),
  currentCents: z.number().int().min(0).optional(),
  icon: z.string().max(40).optional(),
});

export const GET = handle(async () => {
  const context = await getAppContext();
  return jsonOk({ items: await listGoals(context.db, context.household.id) });
});

export const POST = handle(async (request) => {
  const context = await getAppContext();
  const body = await readJson(request, schema);
  const goal = await createGoal(context.db, context.household.id, context.user.id, body);
  return jsonOk({ goal }, { status: 201 });
});
