import type { Database } from '@/db';
import { computeSnapshot, type FinancialSnapshot } from './engine';
import { getCycleTotals, boundsOf, type CycleRow } from '@/domains/cycles/service';
import { listPendingForEngine } from '@/domains/recurrences/service';
import { todayIn, type LocalDate } from '@/lib/dates';

/**
 * Database-backed entry point to the engine.
 *
 * Three queries total: cycle totals grouped by type, pending recurrences, and
 * whatever the caller already holds. The arithmetic itself stays in the pure
 * `computeSnapshot`.
 */
export async function loadSnapshot(
  db: Database,
  params: { householdId: string; cycle: CycleRow; timezone: string; today?: LocalDate },
): Promise<FinancialSnapshot> {
  const { householdId, cycle } = params;
  const today = params.today ?? todayIn(params.timezone);

  const [totals, pending] = await Promise.all([
    getCycleTotals(db, householdId, cycle.id),
    listPendingForEngine(db, householdId, cycle.id),
  ]);

  return computeSnapshot({
    bounds: boundsOf(cycle),
    today,
    openingBalanceCents: cycle.openingBalanceCents,
    plannedReserveCents: cycle.plannedReserveCents,
    totals,
    pending,
  });
}
