import { and, eq, gte, lte, desc, asc, sql, inArray, type SQL } from 'drizzle-orm';
import type { Database } from '@/db';
import {
  transactions,
  categories,
  householdMembers,
  financialCycles,
  recurringInstances,
  type TransactionType,
} from '@/db/schema';
import { ids } from '@/lib/ids';
import { errors } from '@/lib/errors';
import { isValidAmountCents } from '@/lib/money';
import { isLocalDate, todayIn, addMonths, type LocalDate } from '@/lib/dates';
import { closingBalance } from '@/domains/financial-engine/engine';
import {
  ensureCurrentCycle,
  findCycleForDate,
  getCycleTotals,
  type CycleRow,
  type HouseholdRow,
} from '@/domains/cycles/service';
import { writeAudit, trackEvent } from '@/domains/analytics/audit';

export type TransactionRow = typeof transactions.$inferSelect;

export interface TransactionView extends TransactionRow {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  categorySlug: string | null;
  memberName: string | null;
}

export interface CreateTransactionInput {
  type: TransactionType;
  amountCents: number;
  description: string;
  occurredOn?: LocalDate;
  categoryId?: string | null;
  categorySlug?: string | null;
  memberId?: string | null;
  goalId?: string | null;
  recurringInstanceId?: string | null;
  source?: 'manual' | 'assistant' | 'recurrence' | 'seed';
}

export interface ActorContext {
  household: HouseholdRow;
  userId: string;
  /** Membership id of the acting user, used as the default owner of a movement. */
  memberId: string;
}

function assertAmount(amountCents: number): void {
  if (!isValidAmountCents(amountCents)) {
    throw errors.validation('Informe um valor maior que zero.');
  }
}

function assertDescription(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) throw errors.validation('Descreva o movimento.');
  if (trimmed.length > 140) return trimmed.slice(0, 140);
  return trimmed;
}

function assertDate(value: string | undefined, timezone: string): LocalDate {
  const today = todayIn(timezone);
  if (!value) return today;
  if (!isLocalDate(value)) throw errors.validation('Data inválida.');
  // A movement more than a year ahead is almost certainly a typo.
  if (value > addMonths(today, 12)) {
    throw errors.validation('Essa data está muito no futuro.');
  }
  return value;
}

/** Resolves a category id inside this household, by id or by slug. */
async function resolveCategoryId(
  db: Database,
  householdId: string,
  input: { categoryId?: string | null; categorySlug?: string | null },
): Promise<string | null> {
  if (input.categoryId) {
    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(eq(categories.id, input.categoryId), eq(categories.householdId, householdId)),
      )
      .limit(1);
    if (!rows[0]) throw errors.validation('Categoria não encontrada.');
    return rows[0].id;
  }

  if (input.categorySlug) {
    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.slug, input.categorySlug),
          eq(categories.householdId, householdId),
        ),
      )
      .limit(1);
    return rows[0]?.id ?? null;
  }

  return null;
}

/** Validates that a member id, when given, belongs to this household. */
async function resolveMemberId(
  db: Database,
  householdId: string,
  memberId: string | null | undefined,
): Promise<string | null> {
  if (memberId === undefined) return null;
  if (memberId === null) return null;

  const rows = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.id, memberId),
        eq(householdMembers.householdId, householdId),
      ),
    )
    .limit(1);

  if (!rows[0]) throw errors.validation('Pessoa não encontrada neste espaço.');
  return rows[0].id;
}

async function resolveCycleForDate(
  db: Database,
  household: HouseholdRow,
  date: LocalDate,
): Promise<CycleRow> {
  const existing = await findCycleForDate(db, household.id, date);
  if (existing) return existing;
  // Dates outside any materialised cycle land in the current one, which is
  // also what makes the very first movements work during onboarding.
  return ensureCurrentCycle(db, household);
}

/**
 * Rewrites opening balances for every cycle after `fromStartDate`.
 *
 * Editing history is allowed, but a closed cycle's snapshot must not go stale:
 * this walks forward and re-derives each opening balance from the previous
 * cycle's real movements.
 */
export async function recomputeOpeningBalances(
  db: Database,
  householdId: string,
  fromStartDate: LocalDate,
): Promise<void> {
  const cycles = await db
    .select()
    .from(financialCycles)
    .where(
      and(
        eq(financialCycles.householdId, householdId),
        gte(financialCycles.startDate, fromStartDate),
      ),
    )
    .orderBy(asc(financialCycles.startDate));

  let carry: number | null = null;

  for (const cycle of cycles) {
    const opening = carry ?? cycle.openingBalanceCents;
    const totals = await getCycleTotals(db, householdId, cycle.id);
    const closing = closingBalance(opening, totals);

    if (opening !== cycle.openingBalanceCents || (cycle.status === 'closed' && cycle.closingBalanceCents !== closing)) {
      await db
        .update(financialCycles)
        .set({
          openingBalanceCents: opening,
          closingBalanceCents: cycle.status === 'closed' ? closing : null,
        })
        .where(eq(financialCycles.id, cycle.id));
    }

    carry = closing;
  }
}

export async function createTransaction(
  db: Database,
  actor: ActorContext,
  input: CreateTransactionInput,
): Promise<TransactionRow> {
  assertAmount(input.amountCents);
  const description = assertDescription(input.description);
  const occurredOn = assertDate(input.occurredOn, actor.household.timezone);

  const cycle = await resolveCycleForDate(db, actor.household, occurredOn);
  const categoryId = await resolveCategoryId(db, actor.household.id, input);

  const memberId =
    input.memberId === undefined
      ? actor.memberId
      : await resolveMemberId(db, actor.household.id, input.memberId);

  const now = new Date();
  const id = ids.transaction();

  await db.insert(transactions).values({
    id,
    householdId: actor.household.id,
    cycleId: cycle.id,
    memberId,
    type: input.type,
    amountCents: input.amountCents,
    categoryId,
    description,
    occurredOn,
    recurringInstanceId: input.recurringInstanceId ?? null,
    goalId: input.goalId ?? null,
    source: input.source ?? 'manual',
    createdByUserId: actor.userId,
    createdAt: now,
    updatedAt: now,
  });

  if (cycle.status === 'closed') {
    await recomputeOpeningBalances(db, actor.household.id, cycle.startDate);
  }

  await writeAudit(db, {
    householdId: actor.household.id,
    actorUserId: actor.userId,
    action: 'transaction.created',
    entity: 'transaction',
    entityId: id,
    meta: { type: input.type, amountCents: input.amountCents, source: input.source ?? 'manual' },
  });

  await trackEvent(db, {
    name: 'transaction_created',
    householdId: actor.household.id,
    userId: actor.userId,
    props: { type: input.type, source: input.source ?? 'manual' },
  });

  return getTransaction(db, actor.household.id, id);
}

export async function getTransaction(
  db: Database,
  householdId: string,
  id: string,
): Promise<TransactionRow> {
  const rows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.householdId, householdId)))
    .limit(1);
  if (!rows[0]) throw errors.notFound('Movimento não encontrado.');
  return rows[0];
}

export interface UpdateTransactionInput {
  amountCents?: number;
  description?: string;
  occurredOn?: LocalDate;
  categoryId?: string | null;
  memberId?: string | null;
  type?: TransactionType;
}

export async function updateTransaction(
  db: Database,
  actor: ActorContext,
  id: string,
  input: UpdateTransactionInput,
): Promise<TransactionRow> {
  const existing = await getTransaction(db, actor.household.id, id);

  const patch: Partial<typeof transactions.$inferInsert> = { updatedAt: new Date() };

  if (input.amountCents !== undefined) {
    assertAmount(input.amountCents);
    patch.amountCents = input.amountCents;
  }
  if (input.description !== undefined) patch.description = assertDescription(input.description);
  if (input.type !== undefined) patch.type = input.type;
  if (input.categoryId !== undefined) {
    patch.categoryId = await resolveCategoryId(db, actor.household.id, {
      categoryId: input.categoryId,
    });
  }
  if (input.memberId !== undefined) {
    patch.memberId = await resolveMemberId(db, actor.household.id, input.memberId);
  }

  let affectedFrom = existing.occurredOn;

  if (input.occurredOn !== undefined) {
    const occurredOn = assertDate(input.occurredOn, actor.household.timezone);
    patch.occurredOn = occurredOn;
    const cycle = await resolveCycleForDate(db, actor.household, occurredOn);
    patch.cycleId = cycle.id;
    affectedFrom = occurredOn < existing.occurredOn ? occurredOn : existing.occurredOn;
  }

  await db
    .update(transactions)
    .set(patch)
    .where(
      and(eq(transactions.id, id), eq(transactions.householdId, actor.household.id)),
    );

  await recomputeFrom(db, actor.household.id, affectedFrom);

  await writeAudit(db, {
    householdId: actor.household.id,
    actorUserId: actor.userId,
    action: 'transaction.updated',
    entity: 'transaction',
    entityId: id,
    meta: { fields: Object.keys(input) },
  });

  await trackEvent(db, {
    name: 'transaction_updated',
    householdId: actor.household.id,
    userId: actor.userId,
  });

  return getTransaction(db, actor.household.id, id);
}

export async function deleteTransaction(
  db: Database,
  actor: ActorContext,
  id: string,
): Promise<void> {
  const existing = await getTransaction(db, actor.household.id, id);

  await db
    .delete(transactions)
    .where(
      and(eq(transactions.id, id), eq(transactions.householdId, actor.household.id)),
    );

  // A movement that settled a bill releases that bill back to pending.
  if (existing.recurringInstanceId) {
    await db
      .update(recurringInstances)
      .set({ status: 'pending', transactionId: null, settledAt: null })
      .where(
        and(
          eq(recurringInstances.id, existing.recurringInstanceId),
          eq(recurringInstances.householdId, actor.household.id),
        ),
      );
  }

  await recomputeFrom(db, actor.household.id, existing.occurredOn);

  await writeAudit(db, {
    householdId: actor.household.id,
    actorUserId: actor.userId,
    action: 'transaction.deleted',
    entity: 'transaction',
    entityId: id,
    meta: { type: existing.type, amountCents: existing.amountCents },
  });

  await trackEvent(db, {
    name: 'transaction_deleted',
    householdId: actor.household.id,
    userId: actor.userId,
  });
}

async function recomputeFrom(
  db: Database,
  householdId: string,
  date: LocalDate,
): Promise<void> {
  const cycle = await findCycleForDate(db, householdId, date);
  if (cycle) await recomputeOpeningBalances(db, householdId, cycle.startDate);
}

export interface TransactionFilters {
  cycleId?: string;
  types?: TransactionType[];
  memberIds?: string[];
  categoryIds?: string[];
  from?: LocalDate;
  to?: LocalDate;
  limit?: number;
  offset?: number;
}

export async function listTransactions(
  db: Database,
  householdId: string,
  filters: TransactionFilters = {},
): Promise<TransactionView[]> {
  const conditions: SQL[] = [eq(transactions.householdId, householdId)];

  if (filters.cycleId) conditions.push(eq(transactions.cycleId, filters.cycleId));
  if (filters.types?.length) conditions.push(inArray(transactions.type, filters.types));
  if (filters.categoryIds?.length) {
    conditions.push(inArray(transactions.categoryId, filters.categoryIds));
  }
  if (filters.memberIds?.length) {
    conditions.push(inArray(transactions.memberId, filters.memberIds));
  }
  if (filters.from) conditions.push(gte(transactions.occurredOn, filters.from));
  if (filters.to) conditions.push(lte(transactions.occurredOn, filters.to));

  const rows = await db
    .select({
      transaction: transactions,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      categorySlug: categories.slug,
      memberName: householdMembers.displayName,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(householdMembers, eq(householdMembers.id, transactions.memberId))
    .where(and(...conditions))
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
    .limit(Math.min(filters.limit ?? 50, 200))
    .offset(filters.offset ?? 0);

  return rows.map((row) => ({
    ...row.transaction,
    categoryName: row.categoryName,
    categoryIcon: row.categoryIcon,
    categoryColor: row.categoryColor,
    categorySlug: row.categorySlug,
    memberName: row.memberName,
  }));
}

export async function countTransactions(
  db: Database,
  householdId: string,
  filters: TransactionFilters = {},
): Promise<number> {
  const conditions: SQL[] = [eq(transactions.householdId, householdId)];
  if (filters.cycleId) conditions.push(eq(transactions.cycleId, filters.cycleId));
  if (filters.types?.length) conditions.push(inArray(transactions.type, filters.types));
  if (filters.categoryIds?.length) {
    conditions.push(inArray(transactions.categoryId, filters.categoryIds));
  }
  if (filters.memberIds?.length) {
    conditions.push(inArray(transactions.memberId, filters.memberIds));
  }
  if (filters.from) conditions.push(gte(transactions.occurredOn, filters.from));
  if (filters.to) conditions.push(lte(transactions.occurredOn, filters.to));

  const rows = await db
    .select({ total: sql<number>`count(*)` })
    .from(transactions)
    .where(and(...conditions));

  return Number(rows[0]?.total ?? 0);
}

/** Spend per category inside a cycle, biggest first. */
export async function spendingByCategory(
  db: Database,
  householdId: string,
  cycleId: string,
): Promise<Array<{ categoryId: string | null; name: string; color: string; icon: string; totalCents: number }>> {
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      name: categories.name,
      color: categories.color,
      icon: categories.icon,
      totalCents: sql<number>`sum(${transactions.amountCents})`,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.cycleId, cycleId),
        eq(transactions.type, 'expense'),
      ),
    )
    .groupBy(transactions.categoryId, categories.name, categories.color, categories.icon)
    .orderBy(desc(sql`sum(${transactions.amountCents})`));

  return rows.map((row) => ({
    categoryId: row.categoryId,
    name: row.name ?? 'Sem categoria',
    color: row.color ?? 'stone',
    icon: row.icon ?? 'Circle',
    totalCents: Number(row.totalCents ?? 0),
  }));
}

/** Spend per person inside a cycle. Null member id means shared/household. */
export async function spendingByMember(
  db: Database,
  householdId: string,
  cycleId: string,
): Promise<Array<{ memberId: string | null; name: string; totalCents: number }>> {
  const rows = await db
    .select({
      memberId: transactions.memberId,
      name: householdMembers.displayName,
      totalCents: sql<number>`sum(${transactions.amountCents})`,
    })
    .from(transactions)
    .leftJoin(householdMembers, eq(householdMembers.id, transactions.memberId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.cycleId, cycleId),
        eq(transactions.type, 'expense'),
      ),
    )
    .groupBy(transactions.memberId, householdMembers.displayName);

  return rows.map((row) => ({
    memberId: row.memberId,
    name: row.name ?? 'Casa',
    totalCents: Number(row.totalCents ?? 0),
  }));
}

/** Total spent in a category over a date range — used by the assistant. */
export async function spentInCategory(
  db: Database,
  householdId: string,
  categorySlug: string,
  from: LocalDate,
  to: LocalDate,
): Promise<number> {
  const rows = await db
    .select({ totalCents: sql<number>`sum(${transactions.amountCents})` })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, 'expense'),
        eq(categories.slug, categorySlug),
        gte(transactions.occurredOn, from),
        lte(transactions.occurredOn, to),
      ),
    );

  return Number(rows[0]?.totalCents ?? 0);
}

export async function totalSpentBetween(
  db: Database,
  householdId: string,
  from: LocalDate,
  to: LocalDate,
): Promise<number> {
  const rows = await db
    .select({ totalCents: sql<number>`sum(${transactions.amountCents})` })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, 'expense'),
        gte(transactions.occurredOn, from),
        lte(transactions.occurredOn, to),
      ),
    );

  return Number(rows[0]?.totalCents ?? 0);
}
