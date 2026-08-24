import {
  addDays,
  addMonths,
  clampDayToMonth,
  daysInMonth,
  diffDays,
  makeLocalDate,
  monthLabelBR,
  type LocalDate,
} from '@/lib/dates';

/**
 * Financial cycle geometry.
 *
 * A cycle runs from `cycleStartDay` of one month to the day before the same
 * day of the next month: with day 5, 05/08 → 04/09. Everything here is a pure
 * function over calendar dates so it can be reasoned about and tested without
 * a database or a clock.
 */

export interface CycleBounds {
  startDate: LocalDate;
  endDate: LocalDate;
}

function partsOf(date: LocalDate): { year: number; month: number; day: number } {
  const [y, m, d] = date.split('-');
  return { year: Number(y), month: Number(m), day: Number(d) };
}

/** Bounds of the cycle that contains `date`. */
export function cycleBoundsFor(cycleStartDay: number, date: LocalDate): CycleBounds {
  const { year, month, day } = partsOf(date);
  const startDayThisMonth = clampDayToMonth(year, month, cycleStartDay);

  const startDate =
    day >= startDayThisMonth
      ? makeLocalDate(year, month, startDayThisMonth)
      : previousMonthStart(year, month, cycleStartDay);

  return { startDate, endDate: endDateFor(startDate, cycleStartDay) };
}

function previousMonthStart(year: number, month: number, cycleStartDay: number): LocalDate {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return makeLocalDate(prevYear, prevMonth, clampDayToMonth(prevYear, prevMonth, cycleStartDay));
}

/** The cycle ends the day before the next cycle starts. */
function endDateFor(startDate: LocalDate, cycleStartDay: number): LocalDate {
  return addDays(nextStartAfter(startDate, cycleStartDay), -1);
}

function nextStartAfter(startDate: LocalDate, cycleStartDay: number): LocalDate {
  const { year, month } = partsOf(startDate);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return makeLocalDate(nextYear, nextMonth, clampDayToMonth(nextYear, nextMonth, cycleStartDay));
}

/** Bounds of the cycle immediately after `bounds`. */
export function nextCycleBounds(bounds: CycleBounds, cycleStartDay: number): CycleBounds {
  const startDate = addDays(bounds.endDate, 1);
  return { startDate, endDate: endDateFor(startDate, cycleStartDay) };
}

export function previousCycleBounds(bounds: CycleBounds, cycleStartDay: number): CycleBounds {
  const endDate = addDays(bounds.startDate, -1);
  const { year, month, day } = partsOf(bounds.startDate);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  void day;
  const startDate = makeLocalDate(
    prevYear,
    prevMonth,
    clampDayToMonth(prevYear, prevMonth, cycleStartDay),
  );
  return { startDate, endDate };
}

/** Label shown in the UI. The cycle is named after the month it starts in. */
export function cycleLabel(bounds: CycleBounds): string {
  return monthLabelBR(bounds.startDate);
}

export function isWithinCycle(date: LocalDate, bounds: CycleBounds): boolean {
  return date >= bounds.startDate && date <= bounds.endDate;
}

/**
 * The single date inside this cycle on which a bill due on `dayOfMonth` falls.
 * Returns null when the day does not occur in the cycle window at all.
 */
export function dueDateInCycle(dayOfMonth: number, bounds: CycleBounds): LocalDate | null {
  const start = partsOf(bounds.startDate);
  const end = partsOf(bounds.endDate);

  const candidates: LocalDate[] = [
    makeLocalDate(start.year, start.month, clampDayToMonth(start.year, start.month, dayOfMonth)),
  ];

  if (start.month !== end.month || start.year !== end.year) {
    candidates.push(
      makeLocalDate(end.year, end.month, clampDayToMonth(end.year, end.month, dayOfMonth)),
    );
  }

  for (const candidate of candidates) {
    if (isWithinCycle(candidate, bounds)) return candidate;
  }
  return null;
}

/** Total days in the cycle, inclusive of both ends. */
export function cycleLength(bounds: CycleBounds): number {
  return diffDays(bounds.startDate, bounds.endDate) + 1;
}

/**
 * Days left in the cycle counting today. Always at least 1, so the daily limit
 * never divides by zero on the last day.
 */
export function daysRemainingInCycle(bounds: CycleBounds, today: LocalDate): number {
  if (today < bounds.startDate) return cycleLength(bounds);
  if (today > bounds.endDate) return 1;
  return Math.max(1, diffDays(today, bounds.endDate) + 1);
}

export function daysElapsedInCycle(bounds: CycleBounds, today: LocalDate): number {
  if (today < bounds.startDate) return 0;
  const clamped = today > bounds.endDate ? bounds.endDate : today;
  return diffDays(bounds.startDate, clamped) + 1;
}

/** Suggests a cycle start day from the biggest recurring income. */
export function suggestCycleStartDay(
  incomes: Array<{ amountCents: number; dayOfMonth: number }>,
): number {
  if (incomes.length === 0) return 1;
  const biggest = [...incomes].sort((a, b) => b.amountCents - a.amountCents)[0]!;
  return Math.min(28, Math.max(1, biggest.dayOfMonth));
}

export { addMonths, daysInMonth };
