import { z } from 'zod';
import { handle, jsonOk, readJson, localDateSchema, amountCentsSchema } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import {
  updateTransaction,
  deleteTransaction,
  getTransaction,
} from '@/domains/transactions/service';
import { transactionTypes } from '@/db/schema';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  type: z.enum(transactionTypes).optional(),
  amountCents: amountCentsSchema.optional(),
  description: z.string().trim().min(1).max(140).optional(),
  occurredOn: localDateSchema.optional(),
  categoryId: z.string().max(64).nullable().optional(),
  memberId: z.string().max(64).nullable().optional(),
});

export const GET = handle(async (_request, context) => {
  const app = await getAppContext();
  const { id } = await context.params;
  if (!id) throw errors.notFound();
  return jsonOk({ transaction: await getTransaction(app.db, app.household.id, id) });
});

export const PATCH = handle(async (request, context) => {
  const app = await getAppContext();
  const { id } = await context.params;
  if (!id) throw errors.notFound();

  const body = await readJson(request, patchSchema);
  const transaction = await updateTransaction(app.db, app.actor, id, body);
  return jsonOk({ transaction });
});

export const DELETE = handle(async (_request, context) => {
  const app = await getAppContext();
  const { id } = await context.params;
  if (!id) throw errors.notFound();

  await deleteTransaction(app.db, app.actor, id);
  return jsonOk({ ok: true });
});
