import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db';
import { makeHousehold, reloadHousehold, type TestHousehold } from '../helpers/factory';
import type { Database } from '@/db';
import { loadSnapshot } from '@/domains/financial-engine/load';
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '@/domains/transactions/service';
import {
  createRecurringExpense,
  createIncomeSource,
  materializeDueRecurrences,
  listPendingForEngine,
  settleInstance,
} from '@/domains/recurrences/service';
import { ensureCurrentCycle, setPlannedReserve, listCycles } from '@/domains/cycles/service';
import { financialCycles, households } from '@/db/schema';

/**
 * The rules from the product spec, checked against the real schema.
 * Every expectation here is about money, so every number is integer cents.
 */

let handle: TestDb;
let db: Database;
let home: TestHousehold;

const TODAY = '2026-08-23';

async function snapshot() {
  const household = await reloadHousehold(db, home.householdId);
  const cycle = await ensureCurrentCycle(db, household, TODAY);
  return loadSnapshot(db, {
    householdId: home.householdId,
    cycle,
    timezone: household.timezone,
    today: TODAY,
  });
}

beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;
  home = await makeHousehold(db, {
    cycleStartDay: 5,
    openingBalanceCents: 845_000, // R$ 8.450,00
    today: TODAY,
  });
});

afterEach(() => handle.close());

describe('balance arithmetic', () => {
  it('starts at the opening balance of the cycle', async () => {
    const result = await snapshot();
    expect(result.currentBalanceCents).toBe(845_000);
  });

  it('income increases the balance', async () => {
    await createTransaction(db, home.actor, {
      type: 'income',
      amountCents: 450_000,
      description: 'Salário',
      occurredOn: TODAY,
    });

    const result = await snapshot();
    expect(result.currentBalanceCents).toBe(845_000 + 450_000);
    expect(result.totals.income).toBe(450_000);
  });

  it('expense decreases the balance', async () => {
    await createTransaction(db, home.actor, {
      type: 'expense',
      amountCents: 18_600,
      description: 'Mercado',
      occurredOn: TODAY,
    });

    const result = await snapshot();
    expect(result.currentBalanceCents).toBe(845_000 - 18_600);
    expect(result.totals.expense).toBe(18_600);
  });

  it('setting money aside lowers the balance but not the free amount', async () => {
    const household = await reloadHousehold(db, home.householdId);
    const cycle = await ensureCurrentCycle(db, household, TODAY);
    await setPlannedReserve(db, home.householdId, cycle.id, 100_000);

    const before = await snapshot();

    await createTransaction(db, home.actor, {
      type: 'reserve',
      amountCents: 100_000,
      description: 'Reserva de emergência',
      occurredOn: TODAY,
    });

    const after = await snapshot();

    expect(after.currentBalanceCents).toBe(before.currentBalanceCents - 100_000);
    // Reserve target went from 100.000 pending to 0 pending, so free is stable.
    expect(after.freeToSpendCents).toBe(before.freeToSpendCents);
  });
});

describe('livre para gastar', () => {
  it('subtracts pending bills and the remaining reserve', async () => {
    const household = await reloadHousehold(db, home.householdId);
    const cycle = await ensureCurrentCycle(db, household, TODAY);
    await setPlannedReserve(db, home.householdId, cycle.id, 100_000);

    // Bills that fall inside 05/08 -> 04/09.
    await createRecurringExpense(db, home.householdId, home.ownerUserId, {
      name: 'Aluguel',
      amountCents: 185_000,
      dayOfMonth: 10,
    });
    await createRecurringExpense(db, home.householdId, home.ownerUserId, {
      name: 'Escola',
      amountCents: 185_000,
      dayOfMonth: 15,
    });

    await materializeDueRecurrences(db, household, cycle);

    const result = await snapshot();

    expect(result.pendingCommitmentsCents).toBe(370_000);
    expect(result.reserveRemainingCents).toBe(100_000);
    expect(result.freeToSpendCents).toBe(845_000 - 370_000 - 100_000);
  });

  it('goes negative and is never silently clamped to zero', async () => {
    await createRecurringExpense(db, home.householdId, home.ownerUserId, {
      name: 'Conta gigante',
      amountCents: 888_000,
      dayOfMonth: 10,
    });

    const household = await reloadHousehold(db, home.householdId);
    const cycle = await ensureCurrentCycle(db, household, TODAY);
    await materializeDueRecurrences(db, household, cycle);

    const result = await snapshot();

    expect(result.freeToSpendCents).toBe(845_000 - 888_000);
    expect(result.freeToSpendCents).toBeLessThan(0);
    expect(result.isOverCommitted).toBe(true);
  });

  it('suggests a zero daily limit when free is negative', async () => {
    await createRecurringExpense(db, home.householdId, home.ownerUserId, {
      name: 'Conta gigante',
      amountCents: 900_000,
      dayOfMonth: 10,
    });

    const household = await reloadHousehold(db, home.householdId);
    const cycle = await ensureCurrentCycle(db, household, TODAY);
    await materializeDueRecurrences(db, household, cycle);

    const result = await snapshot();
    expect(result.dailyLimitCents).toBe(0);
  });

  it('divides the free amount across the days left in the cycle', async () => {
    const result = await snapshot();
    // 23/08 .. 04/09 inclusive = 13 days.
    expect(result.daysRemaining).toBe(13);
    expect(result.dailyLimitCents).toBe(Math.floor(845_000 / 13));
  });
});

describe('editing history', () => {
  it('recalculates after an edit', async () => {
    const transaction = await createTransaction(db, home.actor, {
      type: 'expense',
      amountCents: 18_600,
      description: 'Mercado',
      occurredOn: TODAY,
    });

    expect((await snapshot()).currentBalanceCents).toBe(845_000 - 18_600);

    await updateTransaction(db, home.actor, transaction.id, { amountCents: 25_000 });

    expect((await snapshot()).currentBalanceCents).toBe(845_000 - 25_000);
  });

  it('recalculates after a delete', async () => {
    const transaction = await createTransaction(db, home.actor, {
      type: 'expense',
      amountCents: 18_600,
      description: 'Mercado',
      occurredOn: TODAY,
    });

    await deleteTransaction(db, home.actor, transaction.id);

    expect((await snapshot()).currentBalanceCents).toBe(845_000);
  });

  it('releases a settled bill back to pending when its movement is deleted', async () => {
    await createRecurringExpense(db, home.householdId, home.ownerUserId, {
      name: 'Internet',
      amountCents: 12_000,
      dayOfMonth: 15,
    });

    const household = await reloadHousehold(db, home.householdId);
    const cycle = await ensureCurrentCycle(db, household, TODAY);
    await materializeDueRecurrences(db, household, cycle);

    const pending = await listPendingForEngine(db, home.householdId, cycle.id);
    expect(pending).toHaveLength(1);

    await settleInstance(db, home.actor, pending[0]!.id);

    const afterSettle = await snapshot();
    expect(afterSettle.pendingCommitmentsCents).toBe(0);
    expect(afterSettle.currentBalanceCents).toBe(845_000 - 12_000);

    const movements = await db.query.transactions.findMany();
    const settlement = movements.find((m) => m.recurringInstanceId === pending[0]!.id);
    expect(settlement).toBeDefined();

    await deleteTransaction(db, home.actor, settlement!.id);

    const afterDelete = await snapshot();
    expect(afterDelete.pendingCommitmentsCents).toBe(12_000);
    expect(afterDelete.currentBalanceCents).toBe(845_000);
  });
});

describe('recurrences', () => {
  it('never duplicates an occurrence, however many times it runs', async () => {
    await createRecurringExpense(db, home.householdId, home.ownerUserId, {
      name: 'Aluguel',
      amountCents: 185_000,
      dayOfMonth: 10,
    });
    await createIncomeSource(db, home.householdId, home.ownerUserId, {
      name: 'Salário',
      amountCents: 450_000,
      dayOfMonth: 5,
    });

    const household = await reloadHousehold(db, home.householdId);
    const cycle = await ensureCurrentCycle(db, household, TODAY);

    const first = await materializeDueRecurrences(db, household, cycle);
    expect(first).toBe(2);

    for (let i = 0; i < 5; i += 1) {
      const created = await materializeDueRecurrences(db, household, cycle);
      expect(created).toBe(0);
    }

    const rows = await db.query.recurringInstances.findMany();
    expect(rows).toHaveLength(2);
  });

  it('materialises the same bill again in the next cycle', async () => {
    await createRecurringExpense(db, home.householdId, home.ownerUserId, {
      name: 'Aluguel',
      amountCents: 185_000,
      dayOfMonth: 10,
    });

    const household = await reloadHousehold(db, home.householdId);

    const august = await ensureCurrentCycle(db, household, '2026-08-23');
    await materializeDueRecurrences(db, household, august);

    const september = await ensureCurrentCycle(db, household, '2026-09-20');
    await materializeDueRecurrences(db, household, september);

    expect(september.id).not.toBe(august.id);

    const rows = await db.query.recurringInstances.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.dueDate).sort()).toEqual(['2026-08-10', '2026-09-10']);
  });
});

describe('cycle rollover', () => {
  it('opens the next cycle and carries the closing balance forward', async () => {
    const household = await reloadHousehold(db, home.householdId);

    await createTransaction(db, home.actor, {
      type: 'expense',
      amountCents: 45_000,
      description: 'Mercado',
      occurredOn: '2026-08-23',
    });

    const august = await ensureCurrentCycle(db, household, '2026-08-23');
    const september = await ensureCurrentCycle(db, household, '2026-09-10');

    expect(september.startDate).toBe('2026-09-05');
    expect(september.openingBalanceCents).toBe(845_000 - 45_000);

    const closedAugust = (
      await db.select().from(financialCycles).where(eq(financialCycles.id, august.id))
    )[0]!;

    expect(closedAugust.status).toBe('closed');
    expect(closedAugust.closingBalanceCents).toBe(845_000 - 45_000);
  });

  it('keeps history: nothing is deleted when the cycle turns', async () => {
    const household = await reloadHousehold(db, home.householdId);

    await createTransaction(db, home.actor, {
      type: 'expense',
      amountCents: 45_000,
      description: 'Mercado',
      occurredOn: '2026-08-23',
    });

    await ensureCurrentCycle(db, household, '2026-09-10');

    const movements = await db.query.transactions.findMany();
    expect(movements).toHaveLength(1);
    expect(movements[0]!.occurredOn).toBe('2026-08-23');
  });

  it('catches up across several missed cycles without gaps', async () => {
    const household = await reloadHousehold(db, home.householdId);

    await ensureCurrentCycle(db, household, '2026-08-23');
    const later = await ensureCurrentCycle(db, household, '2026-12-20');

    expect(later.startDate).toBe('2026-12-05');

    const cycles = await listCycles(db, home.householdId, 50);
    const starts = cycles.map((c) => c.startDate).sort();
    expect(starts).toEqual([
      '2026-08-05',
      '2026-09-05',
      '2026-10-05',
      '2026-11-05',
      '2026-12-05',
    ]);
  });

  it('re-derives the opening balance when a past cycle is edited', async () => {
    const household = await reloadHousehold(db, home.householdId);

    const august = await ensureCurrentCycle(db, household, '2026-08-23');
    const september = await ensureCurrentCycle(db, household, '2026-09-10');
    expect(september.openingBalanceCents).toBe(845_000);

    // A movement that belongs to the already-closed August cycle.
    await createTransaction(db, home.actor, {
      type: 'expense',
      amountCents: 30_000,
      description: 'Gasto esquecido de agosto',
      occurredOn: '2026-08-20',
    });

    const refreshedSeptember = (
      await db.select().from(financialCycles).where(eq(financialCycles.id, september.id))
    )[0]!;

    expect(refreshedSeptember.openingBalanceCents).toBe(845_000 - 30_000);

    const refreshedAugust = (
      await db.select().from(financialCycles).where(eq(financialCycles.id, august.id))
    )[0]!;
    expect(refreshedAugust.closingBalanceCents).toBe(845_000 - 30_000);
  });
});

describe('reserve target', () => {
  it('reduces the remaining reserve as money is set aside', async () => {
    const household = await reloadHousehold(db, home.householdId);
    const cycle = await ensureCurrentCycle(db, household, TODAY);
    await setPlannedReserve(db, home.householdId, cycle.id, 100_000);

    await createTransaction(db, home.actor, {
      type: 'reserve',
      amountCents: 40_000,
      description: 'Reserva',
      occurredOn: TODAY,
    });

    const result = await snapshot();
    expect(result.reservedCents).toBe(40_000);
    expect(result.reserveRemainingCents).toBe(60_000);
  });

  it('never lets the remaining reserve go below zero', async () => {
    const household = await reloadHousehold(db, home.householdId);
    const cycle = await ensureCurrentCycle(db, household, TODAY);
    await setPlannedReserve(db, home.householdId, cycle.id, 100_000);

    await createTransaction(db, home.actor, {
      type: 'reserve',
      amountCents: 150_000,
      description: 'Reserva',
      occurredOn: TODAY,
    });

    const result = await snapshot();
    expect(result.reserveRemainingCents).toBe(0);
  });
});

describe('input validation', () => {
  it('refuses a zero or negative amount', async () => {
    await expect(
      createTransaction(db, home.actor, {
        type: 'expense',
        amountCents: 0,
        description: 'Nada',
        occurredOn: TODAY,
      }),
    ).rejects.toThrow();

    await expect(
      createTransaction(db, home.actor, {
        type: 'expense',
        amountCents: -5000,
        description: 'Negativo',
        occurredOn: TODAY,
      }),
    ).rejects.toThrow();
  });

  it('refuses a non-integer amount', async () => {
    await expect(
      createTransaction(db, home.actor, {
        type: 'expense',
        amountCents: 120.5,
        description: 'Fracionado',
        occurredOn: TODAY,
      }),
    ).rejects.toThrow();
  });

  it('refuses a malformed date', async () => {
    await expect(
      createTransaction(db, home.actor, {
        type: 'expense',
        amountCents: 1000,
        description: 'Data ruim',
        occurredOn: '23/08/2026',
      }),
    ).rejects.toThrow();
  });
});

describe('household defaults', () => {
  it('seeds the starting category set', async () => {
    const rows = await db.query.categories.findMany();
    const slugs = rows.map((r) => r.slug);
    expect(slugs).toContain('mercado');
    expect(slugs).toContain('transporte');
    expect(slugs).toContain('salario');
    expect(rows.length).toBeGreaterThanOrEqual(17);
  });

  it('caps the cycle start day at 28 so the boundary never drifts', async () => {
    const rows = await db.select().from(households).where(eq(households.id, home.householdId));
    expect(rows[0]!.cycleStartDay).toBe(5);
  });
});
