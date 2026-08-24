import type { LocalDate } from '@/lib/dates';
import {
  cycleLength,
  daysElapsedInCycle,
  daysRemainingInCycle,
  type CycleBounds,
} from '@/domains/cycles/cycle-math';
import type { TransactionType } from '@/db/schema';

/**
 * THE FINANCIAL ENGINE
 * ====================
 * This module is the only place that decides what money means in this product.
 * It is pure: plain numbers in, plain numbers out, no database, no clock, no
 * React. The AI never runs any of this and never produces any of these values.
 *
 * All amounts are integer cents.
 *
 *   saldo atual        = abertura do ciclo + entradas - saídas
 *   comprometido       = contas do ciclo ainda não pagas
 *   reserva restante   = meta do ciclo - o que já foi guardado
 *   livre para gastar  = saldo - comprometido - reserva restante
 *
 * "Livre para gastar" is allowed to be negative and is never clamped to zero:
 * a couple that owes more than it holds must see that.
 */

/** Direction each movement type applies to the balance. */
export const TRANSACTION_SIGN: Record<TransactionType, 1 | -1> = {
  income: 1,
  expense: -1,
  reserve: -1,
  adjustment_in: 1,
  adjustment_out: -1,
};

export function signedAmount(type: TransactionType, amountCents: number): number {
  return TRANSACTION_SIGN[type] * amountCents;
}

export interface TransactionTotals {
  income: number;
  expense: number;
  reserve: number;
  adjustmentIn: number;
  adjustmentOut: number;
}

export const EMPTY_TOTALS: TransactionTotals = {
  income: 0,
  expense: 0,
  reserve: 0,
  adjustmentIn: 0,
  adjustmentOut: 0,
};

export function totalsFromRows(
  rows: Array<{ type: TransactionType; amountCents: number }>,
): TransactionTotals {
  const totals: TransactionTotals = { ...EMPTY_TOTALS };
  for (const row of rows) {
    switch (row.type) {
      case 'income':
        totals.income += row.amountCents;
        break;
      case 'expense':
        totals.expense += row.amountCents;
        break;
      case 'reserve':
        totals.reserve += row.amountCents;
        break;
      case 'adjustment_in':
        totals.adjustmentIn += row.amountCents;
        break;
      case 'adjustment_out':
        totals.adjustmentOut += row.amountCents;
        break;
    }
  }
  return totals;
}

export interface PendingItem {
  id: string;
  name: string;
  amountCents: number;
  dueDate: LocalDate;
  categoryId: string | null;
  sourceType: 'income' | 'expense';
}

export interface SnapshotInput {
  bounds: CycleBounds;
  today: LocalDate;
  openingBalanceCents: number;
  plannedReserveCents: number;
  totals: TransactionTotals;
  /** Recurring instances still pending inside this cycle. */
  pending: PendingItem[];
}

export interface FinancialSnapshot {
  /** Money the couple has right now, per what they registered here. */
  currentBalanceCents: number;
  /** Bills of this cycle that are still unpaid. */
  pendingCommitmentsCents: number;
  /** Income of this cycle that has not arrived yet (informational only). */
  pendingIncomeCents: number;
  /** Reserve target for the cycle. */
  plannedReserveCents: number;
  /** Reserve already set aside in this cycle. */
  reservedCents: number;
  /** Reserve still to be set aside. Never negative. */
  reserveRemainingCents: number;
  /** THE number. May be negative. */
  freeToSpendCents: number;
  /** Suggested spend per remaining day. Zero when free is negative. */
  dailyLimitCents: number;
  daysRemaining: number;
  daysElapsed: number;
  cycleLengthDays: number;
  totals: TransactionTotals;
  /** True when commitments exceed what is available. */
  isOverCommitted: boolean;
  nextBill: PendingItem | null;
  nextIncome: PendingItem | null;
  pendingBills: PendingItem[];
  pendingIncomes: PendingItem[];
}

export function computeSnapshot(input: SnapshotInput): FinancialSnapshot {
  const { totals, bounds, today } = input;

  const currentBalanceCents =
    input.openingBalanceCents +
    totals.income +
    totals.adjustmentIn -
    totals.expense -
    totals.reserve -
    totals.adjustmentOut;

  const pendingBills = input.pending
    .filter((item) => item.sourceType === 'expense')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const pendingIncomes = input.pending
    .filter((item) => item.sourceType === 'income')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const pendingCommitmentsCents = pendingBills.reduce((sum, item) => sum + item.amountCents, 0);
  const pendingIncomeCents = pendingIncomes.reduce((sum, item) => sum + item.amountCents, 0);

  const reservedCents = totals.reserve;
  const reserveRemainingCents = Math.max(0, input.plannedReserveCents - reservedCents);

  const freeToSpendCents =
    currentBalanceCents - pendingCommitmentsCents - reserveRemainingCents;

  const daysRemaining = daysRemainingInCycle(bounds, today);
  const daysElapsed = daysElapsedInCycle(bounds, today);

  const dailyLimitCents =
    freeToSpendCents > 0 ? Math.floor(freeToSpendCents / daysRemaining) : 0;

  return {
    currentBalanceCents,
    pendingCommitmentsCents,
    pendingIncomeCents,
    plannedReserveCents: input.plannedReserveCents,
    reservedCents,
    reserveRemainingCents,
    freeToSpendCents,
    dailyLimitCents,
    daysRemaining,
    daysElapsed,
    cycleLengthDays: cycleLength(bounds),
    totals,
    isOverCommitted: freeToSpendCents < 0,
    nextBill: pendingBills[0] ?? null,
    nextIncome: pendingIncomes[0] ?? null,
    pendingBills,
    pendingIncomes,
  };
}

/**
 * Projection helper for "dá pra gastar X hoje?".
 * Purely arithmetic — it states a consequence, it does not give advice.
 */
export interface SpendProjection {
  amountCents: number;
  freeAfterCents: number;
  dailyLimitAfterCents: number;
  fits: boolean;
}

export function projectSpend(
  snapshot: FinancialSnapshot,
  amountCents: number,
): SpendProjection {
  const freeAfterCents = snapshot.freeToSpendCents - amountCents;
  return {
    amountCents,
    freeAfterCents,
    dailyLimitAfterCents:
      freeAfterCents > 0 ? Math.floor(freeAfterCents / snapshot.daysRemaining) : 0,
    fits: freeAfterCents >= 0,
  };
}

/** Balance a cycle closes with, used as the next cycle's opening balance. */
export function closingBalance(
  openingBalanceCents: number,
  totals: TransactionTotals,
): number {
  return (
    openingBalanceCents +
    totals.income +
    totals.adjustmentIn -
    totals.expense -
    totals.reserve -
    totals.adjustmentOut
  );
}
