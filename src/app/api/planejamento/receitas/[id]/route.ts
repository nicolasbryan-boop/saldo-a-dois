import { z } from 'zod';
import { handle, jsonOk, readJson, amountCentsSchema } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import { updateIncomeSource, deleteIncomeSource } from '@/domains/recurrences/service';
import { assertOwnsRecurring } from '@/domains/recurrences/service';
import { resolveOwnMemberId } from '@/domains/transactions/service';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  amountCents: amountCentsSchema.optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  memberId: z.string().max(64).nullable().optional(),
  categoryId: z.string().max(64).nullable().optional(),
  active: z.boolean().optional(),
});

export const PATCH = handle(async (request, context) => {
  const app = await getAppContext();
  const { id } = await context.params;
  if (!id) throw errors.notFound();

  const body = await readJson(request, schema);
  await assertOwnsRecurring(app.db, app.actor, 'income', id);
  const item = await updateIncomeSource(app.db, app.household.id, app.user.id, id, {
    ...body,
    memberId:
      body.memberId === undefined
        ? undefined
        : resolveOwnMemberId(app.actor, body.memberId),
  });
  return jsonOk({ item });
});

export const DELETE = handle(async (_request, context) => {
  const app = await getAppContext();
  const { id } = await context.params;
  if (!id) throw errors.notFound();

  await assertOwnsRecurring(app.db, app.actor, 'income', id);
  await deleteIncomeSource(app.db, app.household.id, app.user.id, id);
  return jsonOk({ ok: true });
});
