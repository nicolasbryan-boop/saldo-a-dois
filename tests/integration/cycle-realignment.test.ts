import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db';
import { makeHousehold, reloadHousehold, type TestHousehold } from '../helpers/factory';
import type { Database } from '@/db';
import { households, financialCycles } from '@/db/schema';
import { ensureCurrentCycle, listCycles, setOpeningBalance } from '@/domains/cycles/service';
import { createTransaction } from '@/domains/transactions/service';
import { createRecurringExpense, materializeDueRecurrences } from '@/domains/recurrences/service';
import { loadSnapshot } from '@/domains/financial-engine/load';

/**
 * Changing the cycle start day must not leave two cycles covering the same
 * date. Overlapping cycles are the kind of bug where the balance depends on
 * which row a query happens to pick.
 */

let handle: TestDb;
let db: Database;
let home: TestHousehold;

const TODAY = '2026-08-23';

beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;
  home = await makeHousehold(db, { cycleStartDay: 1, today: TODAY });
});

afterEach(() => handle.close());

async function changeStartDay(day: number) {
  await db
    .update(households)
    .set({ cycleStartDay: day, updatedAt: new Date() })
    .where(eq(households.id, home.householdId));
  return reloadHousehold(db, home.householdId);
}

describe('changing the cycle start day', () => {
  it('discards an untouched cycle instead of overlapping it', async () => {
    const first = await ensureCurrentCycle(db, await reloadHousehold(db, home.householdId), TODAY);
    expect(first.startDate).toBe('2026-08-01');
    expect(first.endDate).toBe('2026-08-31');

    const household = await changeStartDay(5);
    const second = await ensureCurrentCycle(db, household, TODAY);

    expect(second.startDate).toBe('2026-08-05');
    expect(second.endDate).toBe('2026-09-04');

    const cycles = await listCycles(db, home.householdId, 50);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.id).toBe(second.id);
  });

  it('never leaves two cycles covering the same day', async () => {
    await ensureCurrentCycle(db, await reloadHousehold(db, home.householdId), TODAY);
    const household = await changeStartDay(5);
    await ensureCurrentCycle(db, household, TODAY);

    const cycles = await listCycles(db, home.householdId, 50);
    const covering = cycles.filter(
      (cycle) => cycle.startDate <= TODAY && cycle.endDate >= TODAY,
    );
    expect(covering).toHaveLength(1);
  });

  it('keeps a cycle that already has movements, closing it instead of deleting', async () => {
    const first = await ensureCurrentCycle(db, await reloadHousehold(db, home.householdId), TODAY);
    await setOpeningBalance(db, home.householdId, first.id, 100_000);

    await createTransaction(db, home.actor, {
      type: 'expense',
      amountCents: 25_000,
      description: 'Gasto do ciclo antigo',
      occurredOn: TODAY,
    });

    const household = await changeStartDay(5);
    await ensureCurrentCycle(db, household, TODAY);

    const cycles = await listCycles(db, home.householdId, 50);
    expect(cycles).toHaveLength(2);

    const kept = cycles.find((cycle) => cycle.id === first.id);
    expect(kept?.status).toBe('closed');
    expect(kept?.closingBalanceCents).toBe(75_000);

    // The movement itself is untouched.
    const movements = await db.query.transactions.findMany();
    expect(movements).toHaveLength(1);
    expect(movements[0]!.description).toBe('Gasto do ciclo antigo');
  });

  it('produces one consistent snapshot after the change', async () => {
    const first = await ensureCurrentCycle(db, await reloadHousehold(db, home.householdId), TODAY);
    await setOpeningBalance(db, home.householdId, first.id, 845_000);

    const household = await changeStartDay(5);
    const cycle = await ensureCurrentCycle(db, household, TODAY);
    await setOpeningBalance(db, home.householdId, cycle.id, 845_000);

    await createRecurringExpense(db, home.householdId, home.ownerUserId, {
      name: 'Aluguel',
      amountCents: 185_000,
      dayOfMonth: 10,
    });
    await materializeDueRecurrences(db, household, cycle);

    const fresh = (
      await db.select().from(financialCycles).where(eq(financialCycles.id, cycle.id))
    )[0]!;

    const snapshot = await loadSnapshot(db, {
      householdId: home.householdId,
      cycle: fresh,
      timezone: household.timezone,
      today: TODAY,
    });

    expect(snapshot.currentBalanceCents).toBe(845_000);
    expect(snapshot.pendingCommitmentsCents).toBe(185_000);
    expect(snapshot.freeToSpendCents).toBe(845_000 - 185_000);
  });

  it('is idempotent: repeated calls keep exactly one open cycle', async () => {
    await ensureCurrentCycle(db, await reloadHousehold(db, home.householdId), TODAY);
    const household = await changeStartDay(15);

    for (let i = 0; i < 4; i += 1) {
      await ensureCurrentCycle(db, household, TODAY);
    }

    const cycles = await listCycles(db, home.householdId, 50);
    const open = cycles.filter((cycle) => cycle.status === 'open');
    expect(open).toHaveLength(1);
    expect(open[0]!.startDate).toBe('2026-08-15');
  });
});
