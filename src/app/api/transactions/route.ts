import { z } from 'zod';
import { handle, jsonOk, readJson, localDateSchema, amountCentsSchema } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import {
  createTransaction,
  listTransactions,
  countTransactions,
} from '@/domains/transactions/service';
import { transactionTypes } from '@/db/schema';

export const dynamic = 'force-dynamic';

/**
 * Movements of the authenticated household.
 *
 * There is no `householdId` parameter anywhere in this file — the household is
 * resolved from the session, which is what makes cross-tenant access
 * impossible rather than merely checked.
 */

const createSchema = z.object({
  type: z.enum(transactionTypes),
  amountCents: amountCentsSchema,
  description: z.string().trim().min(1, 'Descreva o movimento').max(140),
  occurredOn: localDateSchema.optional(),
  categoryId: z.string().max(64).nullable().optional(),
  memberId: z.string().max(64).nullable().optional(),
});

export const GET = handle(async (request) => {
  const context = await getAppContext();
  const url = new URL(request.url);

  const types = url.searchParams
    .getAll('type')
    .filter((value): value is (typeof transactionTypes)[number] =>
      (transactionTypes as readonly string[]).includes(value),
    );

  const filters = {
    cycleId: url.searchParams.get('cycleId') ?? undefined,
    types: types.length ? types : undefined,
    memberIds: url.searchParams.getAll('memberId').filter(Boolean),
    categoryIds: url.searchParams.getAll('categoryId').filter(Boolean),
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    limit: Number(url.searchParams.get('limit') ?? 50),
    offset: Number(url.searchParams.get('offset') ?? 0),
  };

  const [items, total] = await Promise.all([
    listTransactions(context.db, context.household.id, filters),
    countTransactions(context.db, context.household.id, filters),
  ]);

  return jsonOk({ items, total });
});

export const POST = handle(async (request) => {
  const context = await getAppContext();
  const body = await readJson(request, createSchema);

  const transaction = await createTransaction(context.db, context.actor, {
    type: body.type,
    amountCents: body.amountCents,
    description: body.description,
    occurredOn: body.occurredOn,
    categoryId: body.categoryId ?? null,
    memberId: body.memberId === undefined ? undefined : body.memberId,
    source: 'manual',
  });

  return jsonOk({ transaction }, { status: 201 });
});
