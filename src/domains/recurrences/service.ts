import { and, eq, asc, inArray } from 'drizzle-orm';
import type { Database } from '@/db';
import {
  incomeSources,
  recurringExpenses,
  recurringInstances,
  categories,
  householdMembers,
} from '@/db/schema';
import { ids } from '@/lib/ids';
import { errors } from '@/lib/errors';
import { isValidAmountCents } from '@/lib/money';
import type { LocalDate } from '@/lib/dates';
import { dueDateInCycle } from '@/domains/cycles/cycle-math';
import { boundsOf, type CycleRow, type HouseholdRow } from '@/domains/cycles/service';
import { createTransaction, type ActorContext,
  assertCanWriteMovement,
} from '@/domains/transactions/service';
import { writeAudit, trackEvent } from '@/domains/analytics/audit';
import type { PendingItem } from '@/domains/financial-engine/engine';
import { chunkRows } from '@/db/batch';

export type IncomeSourceRow = typeof incomeSources.$inferSelect;
export type RecurringExpenseRow = typeof recurringExpenses.$inferSelect;
export type RecurringInstanceRow = typeof recurringInstances.$inferSelect;

export interface RecurringInstanceView extends RecurringInstanceRow {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  memberName: string | null;
}

function assertDay(day: number): number {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw errors.validation('O dia precisa estar entre 1 e 31.');
  }
  return day;
}

function assertAmount(amountCents: number): number {
  if (!isValidAmountCents(amountCents)) {
    throw errors.validation('Informe um valor maior que zero.');
  }
  return amountCents;
}

function assertName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw errors.validation('Dê um nome para este item.');
  return trimmed.slice(0, 80);
}

/* ------------------------------------------------------------------------ */
/* Recurring incomes                                                         */
/* ------------------------------------------------------------------------ */

export interface IncomeSourceInput {
  name: string;
  amountCents: number;
  dayOfMonth: number;
  memberId?: string | null;
  categoryId?: string | null;
}

export async function createIncomeSource(
  db: Database,
  householdId: string,
  actorUserId: string,
  input: IncomeSourceInput,
): Promise<IncomeSourceRow> {
  const now = new Date();
  const id = ids.incomeSource();

  await db.insert(incomeSources).values({
    id,
    householdId,
    memberId: input.memberId ?? null,
    name: assertName(input.name),
    amountCents: assertAmount(input.amountCents),
    dayOfMonth: assertDay(input.dayOfMonth),
    categoryId: input.categoryId ?? (await defaultCategoryId(db, householdId, 'salario')),
    active: true,
    createdAt: now,
    updatedAt: now,
  });

  await writeAudit(db, {
    householdId,
    actorUserId,
    action: 'income_source.created',
    entity: 'income_source',
    entityId: id,
    meta: { amountCents: input.amountCents, dayOfMonth: input.dayOfMonth },
  });

  await trackEvent(db, { name: 'recurring_created', householdId, userId: actorUserId, props: { kind: 'income' } });

  return getIncomeSource(db, householdId, id);
}

export async function getIncomeSource(
  db: Database,
  householdId: string,
  id: string,
): Promise<IncomeSourceRow> {
  const rows = await db
    .select()
    .from(incomeSources)
    .where(and(eq(incomeSources.id, id), eq(incomeSources.householdId, householdId)))
    .limit(1);
  if (!rows[0]) throw errors.notFound('Receita não encontrada.');
  return rows[0];
}

export async function listIncomeSources(
  db: Database,
  householdId: string,
  includeInactive = false,
): Promise<IncomeSourceRow[]> {
  const where = includeInactive
    ? eq(incomeSources.householdId, householdId)
    : and(eq(incomeSources.householdId, householdId), eq(incomeSources.active, true));

  return db.select().from(incomeSources).where(where).orderBy(asc(incomeSources.dayOfMonth));
}

export async function updateIncomeSource(
  db: Database,
  householdId: string,
  actorUserId: string,
  id: string,
  input: Partial<IncomeSourceInput> & { active?: boolean },
): Promise<IncomeSourceRow> {
  await getIncomeSource(db, householdId, id);

  const patch: Partial<typeof incomeSources.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = assertName(input.name);
  if (input.amountCents !== undefined) patch.amountCents = assertAmount(input.amountCents);
  if (input.dayOfMonth !== undefined) patch.dayOfMonth = assertDay(input.dayOfMonth);
  if (input.memberId !== undefined) patch.memberId = input.memberId;
  if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
  if (input.active !== undefined) patch.active = input.active;

  await db
    .update(incomeSources)
    .set(patch)
    .where(and(eq(incomeSources.id, id), eq(incomeSources.householdId, householdId)));

  await syncPendingInstances(db, householdId, 'income', id, patch);

  await writeAudit(db, {
    householdId,
    actorUserId,
    action: 'income_source.updated',
    entity: 'income_source',
    entityId: id,
    meta: { fields: Object.keys(input) },
  });

  return getIncomeSource(db, householdId, id);
}

export async function deleteIncomeSource(
  db: Database,
  householdId: string,
  actorUserId: string,
  id: string,
): Promise<void> {
  await getIncomeSource(db, householdId, id);

  // Pending instances disappear with the source; settled ones stay as history.
  await db
    .delete(recurringInstances)
    .where(
      and(
        eq(recurringInstances.householdId, householdId),
        eq(recurringInstances.sourceType, 'income'),
        eq(recurringInstances.sourceId, id),
        eq(recurringInstances.status, 'pending'),
      ),
    );

  await db
    .delete(incomeSources)
    .where(and(eq(incomeSources.id, id), eq(incomeSources.householdId, householdId)));

  await writeAudit(db, {
    householdId,
    actorUserId,
    action: 'income_source.deleted',
    entity: 'income_source',
    entityId: id,
  });
}

/* ------------------------------------------------------------------------ */
/* Recurring expenses                                                        */
/* ------------------------------------------------------------------------ */

export interface RecurringExpenseInput {
  name: string;
  amountCents: number;
  dayOfMonth: number;
  categoryId?: string | null;
  memberId?: string | null;
}

export async function createRecurringExpense(
  db: Database,
  householdId: string,
  actorUserId: string,
  input: RecurringExpenseInput,
): Promise<RecurringExpenseRow> {
  const now = new Date();
  const id = ids.recurringExpense();

  await db.insert(recurringExpenses).values({
    id,
    householdId,
    memberId: input.memberId ?? null,
    name: assertName(input.name),
    amountCents: assertAmount(input.amountCents),
    dayOfMonth: assertDay(input.dayOfMonth),
    categoryId: input.categoryId ?? (await defaultCategoryId(db, householdId, 'moradia')),
    active: true,
    createdAt: now,
    updatedAt: now,
  });

  await writeAudit(db, {
    householdId,
    actorUserId,
    action: 'recurring_expense.created',
    entity: 'recurring_expense',
    entityId: id,
    meta: { amountCents: input.amountCents, dayOfMonth: input.dayOfMonth },
  });

  await trackEvent(db, { name: 'recurring_created', householdId, userId: actorUserId, props: { kind: 'expense' } });

  return getRecurringExpense(db, householdId, id);
}

export async function getRecurringExpense(
  db: Database,
  householdId: string,
  id: string,
): Promise<RecurringExpenseRow> {
  const rows = await db
    .select()
    .from(recurringExpenses)
    .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.householdId, householdId)))
    .limit(1);
  if (!rows[0]) throw errors.notFound('Conta não encontrada.');
  return rows[0];
}

export async function listRecurringExpenses(
  db: Database,
  householdId: string,
  includeInactive = false,
): Promise<RecurringExpenseRow[]> {
  const where = includeInactive
    ? eq(recurringExpenses.householdId, householdId)
    : and(eq(recurringExpenses.householdId, householdId), eq(recurringExpenses.active, true));

  return db
    .select()
    .from(recurringExpenses)
    .where(where)
    .orderBy(asc(recurringExpenses.dayOfMonth));
}

export async function updateRecurringExpense(
  db: Database,
  householdId: string,
  actorUserId: string,
  id: string,
  input: Partial<RecurringExpenseInput> & { active?: boolean },
): Promise<RecurringExpenseRow> {
  await getRecurringExpense(db, householdId, id);

  const patch: Partial<typeof recurringExpenses.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = assertName(input.name);
  if (input.amountCents !== undefined) patch.amountCents = assertAmount(input.amountCents);
  if (input.dayOfMonth !== undefined) patch.dayOfMonth = assertDay(input.dayOfMonth);
  if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
  if (input.memberId !== undefined) patch.memberId = input.memberId;
  if (input.active !== undefined) patch.active = input.active;

  await db
    .update(recurringExpenses)
    .set(patch)
    .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.householdId, householdId)));

  await syncPendingInstances(db, householdId, 'expense', id, patch);

  await writeAudit(db, {
    householdId,
    actorUserId,
    action: 'recurring_expense.updated',
    entity: 'recurring_expense',
    entityId: id,
    meta: { fields: Object.keys(input) },
  });

  return getRecurringExpense(db, householdId, id);
}

export async function deleteRecurringExpense(
  db: Database,
  householdId: string,
  actorUserId: string,
  id: string,
): Promise<void> {
  await getRecurringExpense(db, householdId, id);

  await db
    .delete(recurringInstances)
    .where(
      and(
        eq(recurringInstances.householdId, householdId),
        eq(recurringInstances.sourceType, 'expense'),
        eq(recurringInstances.sourceId, id),
        eq(recurringInstances.status, 'pending'),
      ),
    );

  await db
    .delete(recurringExpenses)
    .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.householdId, householdId)));

  await writeAudit(db, {
    householdId,
    actorUserId,
    action: 'recurring_expense.deleted',
    entity: 'recurring_expense',
    entityId: id,
  });
}

/** Keeps not-yet-paid instances aligned with an edited source. */
async function syncPendingInstances(
  db: Database,
  householdId: string,
  sourceType: 'income' | 'expense',
  sourceId: string,
  patch: { name?: string; amountCents?: number; categoryId?: string | null; memberId?: string | null; active?: boolean },
): Promise<void> {
  if (patch.active === false) {
    await db
      .delete(recurringInstances)
      .where(
        and(
          eq(recurringInstances.householdId, householdId),
          eq(recurringInstances.sourceType, sourceType),
          eq(recurringInstances.sourceId, sourceId),
          eq(recurringInstances.status, 'pending'),
        ),
      );
    return;
  }

  const update: Partial<typeof recurringInstances.$inferInsert> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.amountCents !== undefined) update.amountCents = patch.amountCents;
  if (patch.categoryId !== undefined) update.categoryId = patch.categoryId;
  if (patch.memberId !== undefined) update.memberId = patch.memberId;
  if (Object.keys(update).length === 0) return;

  await db
    .update(recurringInstances)
    .set(update)
    .where(
      and(
        eq(recurringInstances.householdId, householdId),
        eq(recurringInstances.sourceType, sourceType),
        eq(recurringInstances.sourceId, sourceId),
        eq(recurringInstances.status, 'pending'),
      ),
    );
}

async function defaultCategoryId(
  db: Database,
  householdId: string,
  slug: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.householdId, householdId), eq(categories.slug, slug)))
    .limit(1);
  return rows[0]?.id ?? null;
}

/* ------------------------------------------------------------------------ */
/* Materialisation                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Creates the occurrences of every active recurring source inside `cycle`.
 *
 * IDEMPOTENT BY CONSTRUCTION: each row targets the unique index
 * (source_type, source_id, cycle_id) and inserts with ON CONFLICT DO NOTHING.
 * Calling this on every dashboard load is safe and cannot duplicate a bill.
 *
 * Returns how many new occurrences were created.
 */
export async function materializeDueRecurrences(
  db: Database,
  household: HouseholdRow,
  cycle: CycleRow,
): Promise<number> {
  const bounds = boundsOf(cycle);
  const now = new Date();

  const [incomes, expenses] = await Promise.all([
    listIncomeSources(db, household.id),
    listRecurringExpenses(db, household.id),
  ]);

  const rows: Array<typeof recurringInstances.$inferInsert> = [];

  for (const source of incomes) {
    const dueDate = dueDateInCycle(source.dayOfMonth, bounds);
    if (!dueDate) continue;
    rows.push({
      id: ids.recurringInstance(),
      householdId: household.id,
      cycleId: cycle.id,
      sourceType: 'income',
      sourceId: source.id,
      name: source.name,
      amountCents: source.amountCents,
      dueDate,
      categoryId: source.categoryId,
      memberId: source.memberId,
      status: 'pending',
      createdAt: now,
    });
  }

  for (const source of expenses) {
    const dueDate = dueDateInCycle(source.dayOfMonth, bounds);
    if (!dueDate) continue;
    rows.push({
      id: ids.recurringInstance(),
      householdId: household.id,
      cycleId: cycle.id,
      sourceType: 'expense',
      sourceId: source.id,
      name: source.name,
      amountCents: source.amountCents,
      dueDate,
      categoryId: source.categoryId,
      memberId: source.memberId,
      status: 'pending',
      createdAt: now,
    });
  }

  if (rows.length === 0) return 0;

  const before = await countInstances(db, household.id, cycle.id);

  // 12 bound columns per row; batched for D1's 100-parameter limit.
  for (const batch of chunkRows(rows, 12)) {
    await db
      .insert(recurringInstances)
      .values(batch)
      .onConflictDoNothing({
        target: [
          recurringInstances.sourceType,
          recurringInstances.sourceId,
          recurringInstances.cycleId,
        ],
      });
  }

  const after = await countInstances(db, household.id, cycle.id);
  return after - before;
}

async function countInstances(
  db: Database,
  householdId: string,
  cycleId: string,
): Promise<number> {
  const rows = await db
    .select({ id: recurringInstances.id })
    .from(recurringInstances)
    .where(
      and(
        eq(recurringInstances.householdId, householdId),
        eq(recurringInstances.cycleId, cycleId),
      ),
    );
  return rows.length;
}

export async function listInstances(
  db: Database,
  householdId: string,
  cycleId: string,
  statuses: Array<'pending' | 'settled' | 'skipped'> = ['pending', 'settled', 'skipped'],
): Promise<RecurringInstanceView[]> {
  const rows = await db
    .select({
      instance: recurringInstances,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      memberName: householdMembers.displayName,
    })
    .from(recurringInstances)
    .leftJoin(categories, eq(categories.id, recurringInstances.categoryId))
    .leftJoin(householdMembers, eq(householdMembers.id, recurringInstances.memberId))
    .where(
      and(
        eq(recurringInstances.householdId, householdId),
        eq(recurringInstances.cycleId, cycleId),
        inArray(recurringInstances.status, statuses),
      ),
    )
    .orderBy(asc(recurringInstances.dueDate));

  return rows.map((row) => ({
    ...row.instance,
    categoryName: row.categoryName,
    categoryIcon: row.categoryIcon,
    categoryColor: row.categoryColor,
    memberName: row.memberName,
  }));
}

/** Pending occurrences shaped for the financial engine. */
export async function listPendingForEngine(
  db: Database,
  householdId: string,
  cycleId: string,
): Promise<PendingItem[]> {
  const rows = await db
    .select()
    .from(recurringInstances)
    .where(
      and(
        eq(recurringInstances.householdId, householdId),
        eq(recurringInstances.cycleId, cycleId),
        eq(recurringInstances.status, 'pending'),
      ),
    )
    .orderBy(asc(recurringInstances.dueDate));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    amountCents: row.amountCents,
    dueDate: row.dueDate as LocalDate,
    categoryId: row.categoryId,
    sourceType: row.sourceType,
  }));
}

export async function getInstance(
  db: Database,
  householdId: string,
  id: string,
): Promise<RecurringInstanceRow> {
  const rows = await db
    .select()
    .from(recurringInstances)
    .where(
      and(eq(recurringInstances.id, id), eq(recurringInstances.householdId, householdId)),
    )
    .limit(1);
  if (!rows[0]) throw errors.notFound('Lançamento recorrente não encontrado.');
  return rows[0];
}

/**
 * Turns a pending occurrence into a real movement.
 * The occurrence carries the movement id so deleting the movement releases it.
 */
export async function settleInstance(
  db: Database,
  actor: ActorContext,
  instanceId: string,
  options: { amountCents?: number; occurredOn?: LocalDate } = {},
): Promise<void> {
  const instance = await getInstance(db, actor.household.id, instanceId);
  assertCanWriteMovement(actor, instance);

  if (instance.status === 'settled') {
    throw errors.conflict('Este lançamento já foi registrado.');
  }

  const amountCents = options.amountCents ?? instance.amountCents;

  const transaction = await createTransaction(db, actor, {
    type: instance.sourceType === 'income' ? 'income' : 'expense',
    amountCents,
    description: instance.name,
    occurredOn: options.occurredOn ?? (instance.dueDate as LocalDate),
    categoryId: instance.categoryId,
    memberId: instance.memberId,
    recurringInstanceId: instance.id,
    source: 'recurrence',
  });

  await db
    .update(recurringInstances)
    .set({ status: 'settled', transactionId: transaction.id, settledAt: new Date() })
    .where(
      and(
        eq(recurringInstances.id, instanceId),
        eq(recurringInstances.householdId, actor.household.id),
      ),
    );

  await trackEvent(db, {
    name: 'bill_settled',
    householdId: actor.household.id,
    userId: actor.userId,
    props: { kind: instance.sourceType },
  });
}

export async function skipInstance(
  db: Database,
  householdId: string,
  actorUserId: string,
  instanceId: string,
): Promise<void> {
  const instance = await getInstance(db, householdId, instanceId);
  if (instance.status === 'settled') {
    throw errors.conflict('Já registrado. Exclua o movimento para desfazer.');
  }

  await db
    .update(recurringInstances)
    .set({ status: 'skipped' })
    .where(
      and(
        eq(recurringInstances.id, instanceId),
        eq(recurringInstances.householdId, householdId),
      ),
    );

  await writeAudit(db, {
    householdId,
    actorUserId,
    action: 'recurring_instance.skipped',
    entity: 'recurring_instance',
    entityId: instanceId,
  });
}

export async function unskipInstance(
  db: Database,
  householdId: string,
  instanceId: string,
): Promise<void> {
  const instance = await getInstance(db, householdId, instanceId);
  if (instance.status !== 'skipped') return;

  await db
    .update(recurringInstances)
    .set({ status: 'pending' })
    .where(
      and(
        eq(recurringInstances.id, instanceId),
        eq(recurringInstances.householdId, householdId),
      ),
    );
}

/**
 * Recurring sources are per-person too: your salary and your gym bill are
 * yours. Routes call this before writing, so neither an existing row nor a
 * create payload can be pointed at the partner.
 */
export async function assertOwnsRecurring(
  db: Database,
  actor: ActorContext,
  kind: 'income' | 'expense',
  id: string,
): Promise<void> {
  const row =
    kind === 'income'
      ? await getIncomeSource(db, actor.household.id, id)
      : await getRecurringExpense(db, actor.household.id, id);
  assertCanWriteMovement(actor, row);
}
