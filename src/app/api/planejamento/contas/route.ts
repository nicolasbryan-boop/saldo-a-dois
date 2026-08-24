import { z } from 'zod';
import { handle, jsonOk, readJson, amountCentsSchema } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import {
  createRecurringExpense,
  listRecurringExpenses,
} from '@/domains/recurrences/service';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().trim().min(1, 'Dê um nome para a conta').max(80),
  amountCents: amountCentsSchema,
  dayOfMonth: z.number().int().min(1).max(31),
  categoryId: z.string().max(64).nullable().optional(),
  memberId: z.string().max(64).nullable().optional(),
});

export const GET = handle(async () => {
  const context = await getAppContext();
  return jsonOk({ items: await listRecurringExpenses(context.db, context.household.id) });
});

export const POST = handle(async (request) => {
  const context = await getAppContext();
  const body = await readJson(request, schema);

  const item = await createRecurringExpense(
    context.db,
    context.household.id,
    context.user.id,
    body,
  );

  return jsonOk({ item }, { status: 201 });
});
