import { describe, it, expect } from 'vitest';
import {
  cycleBoundsFor,
  nextCycleBounds,
  dueDateInCycle,
  cycleLength,
  daysRemainingInCycle,
  cycleLabel,
  suggestCycleStartDay,
} from '@/domains/cycles/cycle-math';
import { addMonths, daysInMonth, todayIn, formatDateBR } from '@/lib/dates';

describe('cycleBoundsFor', () => {
  it('runs from the chosen day to the day before the next one', () => {
    expect(cycleBoundsFor(5, '2026-08-23')).toEqual({
      startDate: '2026-08-05',
      endDate: '2026-09-04',
    });
  });

  it('puts a date before the start day in the previous cycle', () => {
    expect(cycleBoundsFor(5, '2026-09-02')).toEqual({
      startDate: '2026-08-05',
      endDate: '2026-09-04',
    });
  });

  it('handles day 1 as a plain calendar month', () => {
    expect(cycleBoundsFor(1, '2026-08-23')).toEqual({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
  });

  it('crosses the year boundary', () => {
    expect(cycleBoundsFor(10, '2026-01-05')).toEqual({
      startDate: '2025-12-10',
      endDate: '2026-01-09',
    });
  });

  it('clamps the start day in February', () => {
    expect(cycleBoundsFor(28, '2026-03-01')).toEqual({
      startDate: '2026-02-28',
      endDate: '2026-03-27',
    });
  });
});

describe('nextCycleBounds', () => {
  it('starts the day after the previous cycle ends, with no gap', () => {
    const first = cycleBoundsFor(5, '2026-08-23');
    const second = nextCycleBounds(first, 5);
    expect(second).toEqual({ startDate: '2026-09-05', endDate: '2026-10-04' });
  });

  it('chains without ever losing or duplicating a day', () => {
    let bounds = cycleBoundsFor(15, '2026-01-20');
    for (let i = 0; i < 24; i += 1) {
      const next = nextCycleBounds(bounds, 15);
      const gap = new Date(`${next.startDate}T00:00:00Z`).getTime() -
        new Date(`${bounds.endDate}T00:00:00Z`).getTime();
      expect(gap).toBe(86_400_000);
      bounds = next;
    }
  });
});

describe('dueDateInCycle', () => {
  const bounds = { startDate: '2026-08-05', endDate: '2026-09-04' };

  it('places a due day that falls in the first month', () => {
    expect(dueDateInCycle(10, bounds)).toBe('2026-08-10');
  });

  it('places a due day that falls in the second month', () => {
    expect(dueDateInCycle(2, bounds)).toBe('2026-09-02');
  });

  it('places the boundary days correctly', () => {
    expect(dueDateInCycle(5, bounds)).toBe('2026-08-05');
    expect(dueDateInCycle(4, bounds)).toBe('2026-09-04');
  });

  it('clamps day 31 to the last day of a short month', () => {
    const febBounds = { startDate: '2026-02-01', endDate: '2026-02-28' };
    expect(dueDateInCycle(31, febBounds)).toBe('2026-02-28');
  });

  it('gives every day of the month exactly one slot in the cycle', () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 31; day += 1) {
      const due = dueDateInCycle(day, bounds);
      expect(due).not.toBeNull();
      if (due) seen.add(`${day}`);
    }
    expect(seen.size).toBe(31);
  });
});

describe('cycle length and remaining days', () => {
  it('counts both ends of the cycle', () => {
    expect(cycleLength({ startDate: '2026-08-05', endDate: '2026-09-04' })).toBe(31);
  });

  it('counts today as a remaining day', () => {
    const bounds = { startDate: '2026-08-05', endDate: '2026-09-04' };
    expect(daysRemainingInCycle(bounds, '2026-09-04')).toBe(1);
    expect(daysRemainingInCycle(bounds, '2026-08-05')).toBe(31);
  });

  it('never returns zero, so a daily limit cannot divide by zero', () => {
    const bounds = { startDate: '2026-08-05', endDate: '2026-09-04' };
    expect(daysRemainingInCycle(bounds, '2026-12-01')).toBeGreaterThanOrEqual(1);
  });
});

describe('labels and suggestions', () => {
  it('names the cycle after the month it starts in', () => {
    expect(cycleLabel({ startDate: '2026-08-05', endDate: '2026-09-04' })).toBe('Agosto 2026');
  });

  it('suggests the day of the biggest salary', () => {
    expect(
      suggestCycleStartDay([
        { amountCents: 450000, dayOfMonth: 5 },
        { amountCents: 500000, dayOfMonth: 20 },
      ]),
    ).toBe(20);
    expect(suggestCycleStartDay([])).toBe(1);
  });
});

describe('date helpers', () => {
  it('clamps when adding months to a month-end date', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('knows month lengths including leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  it('formats dates the Brazilian way', () => {
    expect(formatDateBR('2026-08-23')).toBe('23/08/2026');
  });

  it('reads today in the household timezone, not UTC', () => {
    // 2026-08-24T02:00Z is still 2026-08-23 in São Paulo (UTC-3).
    const at = new Date('2026-08-24T02:00:00Z');
    expect(todayIn('America/Sao_Paulo', at)).toBe('2026-08-23');
    expect(todayIn('UTC', at)).toBe('2026-08-24');
  });
});
