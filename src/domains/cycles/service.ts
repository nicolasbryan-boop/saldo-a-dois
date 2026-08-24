import { and, eq, desc, sql } from 'drizzle-orm';
import type { Database } from '@/db';
import { financialCycles, transactions, households, recurringInstances } from '@/db/schema';
import type { TransactionType } from '@/db/schema';
import { ids } from '@/lib/ids';
import { errors } from '@/lib/errors';
import { todayIn, type LocalDate } from '@/lib/dates';
import {
  cycleBoundsFor,
  cycleLabel,
  nextCycleBounds,
  type CycleBounds,
} from './cycle-math';
import { closingBalance, totalsFromRows, type TransactionTotals } from '@/domains/financial-engine/engine';

export type CycleRow = typeof financialCycles.$inferSelect;
export type HouseholdRow = typeof households.$inferSelect;

/** Guard against an unbounded catch-up loop if a household sat idle for years. */
const MAX_ROLLOVER_STEPS = 60;

export async function getCycleTotals(
  db: Database,
  householdId: string,
  cycleId: string,
): Promise<TransactionTotals> {
  const rows = await db
    .select({
      type: transactions.type,
      total: sql<number>`sum(${transactions.amountCents})`,
    })
    .from(transactions)
    .where(and(eq(transactions.householdId, householdId), eq(transactions.cycleId, cycleId)))
    .groupBy(transactions.type);

  return totalsFromRows(
    rows.map((row) => ({
      type: row.type as TransactionType,
      amountCents: Number(row.total ?? 0),
    })),
  );
}

export function boundsOf(cycle: CycleRow): CycleBounds {
  return { startDate: cycle.startDate, endDate: cycle.endDate };
}

async function insertCycle(
  db: Database,
  householdId: string,
  bounds: CycleBounds,
  openingBalanceCents: number,
  plannedReserveCents: number,
): Promise<CycleRow> {
  const id = ids.cycle();
  await db.insert(financialCycles).values({
    id,
    householdId,
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    label: cycleLabel(bounds),
    status: 'open',
    openingBalanceCents,
    plannedReserveCents,
    createdAt: new Date(),
  });

  const rows = await db
    .select()
    .from(financialCycles)
    .where(eq(financialCycles.id, id))
    .limit(1);
  if (!rows[0]) throw errors.internal();
  return rows[0];
}

async function findCycleByStart(
  db: Database,
  householdId: string,
  startDate: LocalDate,
): Promise<CycleRow | null> {
  const rows = await db
    .select()
    .from(financialCycles)
    .where(
      and(
        eq(financialCycles.householdId, householdId),
        eq(financialCycles.startDate, startDate),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Repairs cycles whose bounds no longer match the household's cycle start day.
 *
 * Changing the start day would otherwise leave the previous cycle overlapping
 * the new one, and two cycles covering the same date is the kind of bug that
 * shows a different balance depending on which one a query happens to pick.
 *
 * An untouched misaligned cycle is simply removed. One that already holds
 * movements is closed with a real balance snapshot instead — history is never
 * discarded to tidy up geometry.
 */
export async function realignOpenCycles(
  db: Database,
  household: HouseholdRow,
): Promise<{ carriedOpeningBalanceCents: number | null }> {
  let carriedOpeningBalanceCents: number | null = null;
  const open = await db
    .select()
    .from(financialCycles)
    .where(
      and(
        eq(financialCycles.householdId, household.id),
        eq(financialCycles.status, 'open'),
      ),
    );

  for (const cycle of open) {
    const expected = cycleBoundsFor(household.cycleStartDay, cycle.startDate);
    const aligned =
      expected.startDate === cycle.startDate && expected.endDate === cycle.endDate;
    if (aligned) continue;

    const used = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.cycleId, cycle.id))
      .limit(1);

    if (used.length === 0) {
      // Nothing was recorded in it, but the opening balance came from the
      // couple during onboarding — carry it into the replacement cycle.
      carriedOpeningBalanceCents = cycle.openingBalanceCents;
      await db
        .delete(recurringInstances)
        .where(eq(recurringInstances.cycleId, cycle.id));
      await db.delete(financialCycles).where(eq(financialCycles.id, cycle.id));
      continue;
    }

    const totals = await getCycleTotals(db, household.id, cycle.id);
    await db
      .update(financialCycles)
      .set({
        status: 'closed',
        closingBalanceCents: closingBalance(cycle.openingBalanceCents, totals),
        closedAt: new Date(),
      })
      .where(eq(financialCycles.id, cycle.id));
  }

  return { carriedOpeningBalanceCents };
}

/**
 * Returns the cycle that contains `today`, creating and closing cycles as
 * needed to catch up.
 *
 * Rolling over never deletes anything: the previous cycle is marked closed with
 * a balance snapshot, and that snapshot becomes the next cycle's opening
 * balance. History stays exactly where it was.
 */
export async function ensureCurrentCycle(
  db: Database,
  household: HouseholdRow,
  todayDate?: LocalDate,
): Promise<CycleRow> {
  const today = todayDate ?? todayIn(household.timezone);
  const targetBounds = cycleBoundsFor(household.cycleStartDay, today);

  const { carriedOpeningBalanceCents } = await realignOpenCycles(db, household);

  const existing = await findCycleByStart(db, household.id, targetBounds.startDate);
  if (existing) {
    if (existing.status === 'closed') {
      await db
        .update(financialCycles)
        .set({ status: 'open', closedAt: null, closingBalanceCents: null })
        .where(eq(financialCycles.id, existing.id));
      return { ...existing, status: 'open', closedAt: null, closingBalanceCents: null };
    }
    return existing;
  }

  // No cycle for today. Walk forward from the latest known cycle, or start one.
  const latestRows = await db
    .select()
    .from(financialCycles)
    .where(eq(financialCycles.householdId, household.id))
    .orderBy(desc(financialCycles.startDate))
    .limit(1);

  let cursor = latestRows[0] ?? null;

  if (!cursor) {
    return insertCycle(
      db,
      household.id,
      targetBounds,
      carriedOpeningBalanceCents ?? 0,
      household.monthlyReserveCents,
    );
  }

  // A start-day change breaks the chain: the stored cycles follow the old
  // geometry, so walking forward from them would manufacture cycles that
  // overlap the target. Start a fresh chain seeded with the real closing
  // balance instead.
  const cursorBounds = cycleBoundsFor(household.cycleStartDay, cursor.startDate);
  if (
    cursorBounds.startDate !== cursor.startDate ||
    cursorBounds.endDate !== cursor.endDate
  ) {
    const totals = await getCycleTotals(db, household.id, cursor.id);
    return insertCycle(
      db,
      household.id,
      targetBounds,
      cursor.closingBalanceCents ?? closingBalance(cursor.openingBalanceCents, totals),
      household.monthlyReserveCents,
    );
  }

  for (let step = 0; step < MAX_ROLLOVER_STEPS; step += 1) {
    if (cursor.startDate === targetBounds.startDate) return cursor;

    if (cursor.startDate > targetBounds.startDate) {
      // The stored cycle is in the future (cycle day was moved backwards).
      // Create the target cycle standalone rather than rewriting history.
      return insertCycle(
        db,
        household.id,
        targetBounds,
        cursor.openingBalanceCents,
        household.monthlyReserveCents,
      );
    }

    const totals = await getCycleTotals(db, household.id, cursor.id);
    const closing = closingBalance(cursor.openingBalanceCents, totals);

    if (cursor.status === 'open') {
      await db
        .update(financialCycles)
        .set({ status: 'closed', closingBalanceCents: closing, closedAt: new Date() })
        .where(eq(financialCycles.id, cursor.id));
    }

    const next = nextCycleBounds(boundsOf(cursor), household.cycleStartDay);
    const alreadyThere = await findCycleByStart(db, household.id, next.startDate);
    cursor =
      alreadyThere ??
      (await insertCycle(
        db,
        household.id,
        next,
        closing,
        household.monthlyReserveCents,
      ));
  }

  throw errors.internal('Não foi possível atualizar o ciclo financeiro.');
}

export async function getCycleById(
  db: Database,
  householdId: string,
  cycleId: string,
): Promise<CycleRow> {
  const rows = await db
    .select()
    .from(financialCycles)
    .where(
      and(eq(financialCycles.id, cycleId), eq(financialCycles.householdId, householdId)),
    )
    .limit(1);
  if (!rows[0]) throw errors.notFound('Ciclo não encontrado.');
  return rows[0];
}

export async function listCycles(
  db: Database,
  householdId: string,
  limit = 24,
): Promise<CycleRow[]> {
  return db
    .select()
    .from(financialCycles)
    .where(eq(financialCycles.householdId, householdId))
    .orderBy(desc(financialCycles.startDate))
    .limit(limit);
}

export async function findPreviousCycle(
  db: Database,
  householdId: string,
  startDate: LocalDate,
): Promise<CycleRow | null> {
  const rows = await db
    .select()
    .from(financialCycles)
    .where(
      and(
        eq(financialCycles.householdId, householdId),
        sql`${financialCycles.startDate} < ${startDate}`,
      ),
    )
    .orderBy(desc(financialCycles.startDate))
    .limit(1);
  return rows[0] ?? null;
}

/** The cycle a given date belongs to, if it has been materialised. */
export async function findCycleForDate(
  db: Database,
  householdId: string,
  date: LocalDate,
): Promise<CycleRow | null> {
  const rows = await db
    .select()
    .from(financialCycles)
    .where(
      and(
        eq(financialCycles.householdId, householdId),
        sql`${financialCycles.startDate} <= ${date}`,
        sql`${financialCycles.endDate} >= ${date}`,
      ),
    )
    .orderBy(desc(financialCycles.startDate))
    .limit(1);
  return rows[0] ?? null;
}

/** Sets the opening balance of the household's very first cycle (onboarding). */
export async function setOpeningBalance(
  db: Database,
  householdId: string,
  cycleId: string,
  openingBalanceCents: number,
): Promise<void> {
  await db
    .update(financialCycles)
    .set({ openingBalanceCents })
    .where(
      and(eq(financialCycles.id, cycleId), eq(financialCycles.householdId, householdId)),
    );
}

export async function setPlannedReserve(
  db: Database,
  householdId: string,
  cycleId: string,
  plannedReserveCents: number,
): Promise<void> {
  await db
    .update(financialCycles)
    .set({ plannedReserveCents: Math.max(0, plannedReserveCents) })
    .where(
      and(eq(financialCycles.id, cycleId), eq(financialCycles.householdId, householdId)),
    );
}
