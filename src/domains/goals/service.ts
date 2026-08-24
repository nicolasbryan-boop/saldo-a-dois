import { and, eq, desc, sql } from 'drizzle-orm';
import type { Database } from '@/db';
import { goals, goalContributions, transactions } from '@/db/schema';
import { ids } from '@/lib/ids';
import { errors } from '@/lib/errors';
import { isValidAmountCents } from '@/lib/money';
import { todayIn, isLocalDate, type LocalDate } from '@/lib/dates';
import { createTransaction, type ActorContext } from '@/domains/transactions/service';
import { ensureCurrentCycle } from '@/domains/cycles/service';
import { writeAudit, trackEvent } from '@/domains/analytics/audit';

export type GoalRow = typeof goals.$inferSelect;

/**
 * Goals are the couple's own bookkeeping, not a bank product. A contribution
 * records that money was set aside: it creates a `reserve` movement, which
 * lowers the balance and lowers the remaining reserve by the same amount, so
 * "livre para gastar" is unchanged. Setting money aside is not spending it and
 * must not look like a windfall either.
 */

export interface GoalInput {
  name: string;
  targetCents: number;
  monthlyPlanCents?: number;
  currentCents?: number;
  icon?: string;
}

function assertName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw errors.validation('Dê um nome para a meta.');
  return trimmed.slice(0, 80);
}

export async function createGoal(
  db: Database,
  householdId: string,
  actorUserId: string,
  input: GoalInput,
): Promise<GoalRow> {
  if (!isValidAmountCents(input.targetCents)) {
    throw errors.validation('Informe quanto vocês querem juntar.');
  }

  const now = new Date();
  const id = ids.goal();

  await db.insert(goals).values({
    id,
    householdId,
    name: assertName(input.name),
    targetCents: input.targetCents,
    currentCents: Math.max(0, input.currentCents ?? 0),
    monthlyPlanCents: Math.max(0, input.monthlyPlanCents ?? 0),
    icon: input.icon ?? 'Target',
    active: true,
    createdAt: now,
    updatedAt: now,
  });

  await writeAudit(db, {
    householdId,
    actorUserId,
    action: 'goal.created',
    entity: 'goal',
    entityId: id,
    meta: { targetCents: input.targetCents },
  });

  await trackEvent(db, { name: 'goal_created', householdId, userId: actorUserId });

  return getGoal(db, householdId, id);
}

export async function getGoal(
  db: Database,
  householdId: string,
  id: string,
): Promise<GoalRow> {
  const rows = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.householdId, householdId)))
    .limit(1);
  if (!rows[0]) throw errors.notFound('Meta não encontrada.');
  return rows[0];
}

export async function listGoals(
  db: Database,
  householdId: string,
  includeInactive = false,
): Promise<GoalRow[]> {
  const where = includeInactive
    ? eq(goals.householdId, householdId)
    : and(eq(goals.householdId, householdId), eq(goals.active, true));

  return db.select().from(goals).where(where).orderBy(desc(goals.createdAt));
}

export async function updateGoal(
  db: Database,
  householdId: string,
  actorUserId: string,
  id: string,
  input: Partial<GoalInput> & { active?: boolean },
): Promise<GoalRow> {
  await getGoal(db, householdId, id);

  const patch: Partial<typeof goals.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = assertName(input.name);
  if (input.targetCents !== undefined) {
    if (!isValidAmountCents(input.targetCents)) {
      throw errors.validation('Informe um objetivo maior que zero.');
    }
    patch.targetCents = input.targetCents;
  }
  if (input.monthlyPlanCents !== undefined) {
    patch.monthlyPlanCents = Math.max(0, input.monthlyPlanCents);
  }
  if (input.currentCents !== undefined) patch.currentCents = Math.max(0, input.currentCents);
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.active !== undefined) patch.active = input.active;

  await db
    .update(goals)
    .set(patch)
    .where(and(eq(goals.id, id), eq(goals.householdId, householdId)));

  await writeAudit(db, {
    householdId,
    actorUserId,
    action: 'goal.updated',
    entity: 'goal',
    entityId: id,
    meta: { fields: Object.keys(input) },
  });

  return getGoal(db, householdId, id);
}

export async function deleteGoal(
  db: Database,
  householdId: string,
  actorUserId: string,
  id: string,
): Promise<void> {
  await getGoal(db, householdId, id);

  await db
    .delete(goals)
    .where(and(eq(goals.id, id), eq(goals.householdId, householdId)));

  await writeAudit(db, {
    householdId,
    actorUserId,
    action: 'goal.deleted',
    entity: 'goal',
    entityId: id,
  });
}

export async function contributeToGoal(
  db: Database,
  actor: ActorContext,
  goalId: string,
  amountCents: number,
  occurredOn?: LocalDate,
): Promise<void> {
  const goal = await getGoal(db, actor.household.id, goalId);

  if (!isValidAmountCents(amountCents)) {
    throw errors.validation('Informe um valor maior que zero.');
  }

  const date = occurredOn ?? todayIn(actor.household.timezone);
  if (!isLocalDate(date)) throw errors.validation('Data inválida.');

  const cycle = await ensureCurrentCycle(db, actor.household);

  const transaction = await createTransaction(db, actor, {
    type: 'reserve',
    amountCents,
    description: `Guardado: ${goal.name}`,
    occurredOn: date,
    goalId,
    source: 'manual',
  });

  const now = new Date();
  await db.insert(goalContributions).values({
    id: ids.goalContribution(),
    householdId: actor.household.id,
    goalId,
    cycleId: cycle.id,
    transactionId: transaction.id,
    amountCents,
    occurredOn: date,
    createdByUserId: actor.userId,
    createdAt: now,
  });

  const nextTotal = goal.currentCents + amountCents;
  await db
    .update(goals)
    .set({
      currentCents: nextTotal,
      achievedAt: nextTotal >= goal.targetCents ? (goal.achievedAt ?? now) : null,
      updatedAt: now,
    })
    .where(eq(goals.id, goalId));

  await writeAudit(db, {
    householdId: actor.household.id,
    actorUserId: actor.userId,
    action: 'goal.contribution',
    entity: 'goal',
    entityId: goalId,
    meta: { amountCents },
  });
}

/** Total set aside in a cycle, across all goals. */
export async function reservedInCycle(
  db: Database,
  householdId: string,
  cycleId: string,
): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`sum(${goalContributions.amountCents})` })
    .from(goalContributions)
    .where(
      and(
        eq(goalContributions.householdId, householdId),
        eq(goalContributions.cycleId, cycleId),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Removes a contribution and the reserve movement behind it, then rewinds the
 * goal total. Kept here so the two sides never drift apart.
 */
export async function removeContribution(
  db: Database,
  householdId: string,
  actorUserId: string,
  contributionId: string,
): Promise<void> {
  const rows = await db
    .select()
    .from(goalContributions)
    .where(
      and(
        eq(goalContributions.id, contributionId),
        eq(goalContributions.householdId, householdId),
      ),
    )
    .limit(1);

  const contribution = rows[0];
  if (!contribution) throw errors.notFound('Aporte não encontrado.');

  if (contribution.transactionId) {
    await db
      .delete(transactions)
      .where(
        and(
          eq(transactions.id, contribution.transactionId),
          eq(transactions.householdId, householdId),
        ),
      );
  }

  await db.delete(goalContributions).where(eq(goalContributions.id, contributionId));

  const goal = await getGoal(db, householdId, contribution.goalId);
  const nextTotal = Math.max(0, goal.currentCents - contribution.amountCents);

  await db
    .update(goals)
    .set({
      currentCents: nextTotal,
      achievedAt: nextTotal >= goal.targetCents ? goal.achievedAt : null,
      updatedAt: new Date(),
    })
    .where(eq(goals.id, contribution.goalId));

  await writeAudit(db, {
    householdId,
    actorUserId,
    action: 'goal.contribution_removed',
    entity: 'goal',
    entityId: contribution.goalId,
    meta: { amountCents: contribution.amountCents },
  });
}
