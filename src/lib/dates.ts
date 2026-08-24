/**
 * Calendar helpers.
 *
 * Financial dates are plain local calendar dates ('YYYY-MM-DD') in the
 * household timezone — America/Sao_Paulo by default. A bill due on the 10th is
 * due on the 10th in Brazil, regardless of where the Worker executes, so the
 * day is never derived from a UTC timestamp.
 *
 * Internally, arithmetic uses Date.UTC purely as a calendar calculator: the
 * timezone offset is neutralised on both ends, so no DST shift can leak in.
 */

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export type LocalDate = string; // 'YYYY-MM-DD'

const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const WEEKDAY_NAMES_PT = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string' || !LOCAL_DATE_RE.test(value)) return false;
  const parts = splitDate(value);
  if (!parts) return false;
  const { year, month, day } = parts;
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function splitDate(date: LocalDate): { year: number; month: number; day: number } | null {
  const [y, m, d] = date.split('-');
  if (!y || !m || !d) return null;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  return { year, month, day };
}

function partsOf(date: LocalDate): { year: number; month: number; day: number } {
  const parts = splitDate(date);
  if (!parts) throw new Error(`Data local inválida: ${date}`);
  return parts;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function makeLocalDate(year: number, month: number, day: number): LocalDate {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Today's calendar date in the given timezone. */
export function todayIn(timezone: string = DEFAULT_TIMEZONE, now: Date = new Date()): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Current hour (0-23) in the given timezone — used for the greeting. */
export function hourIn(timezone: string = DEFAULT_TIMEZONE, now: Date = new Date()): number {
  const value = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  }).format(now);
  return Number(value.replace(/[^\d]/g, ''));
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = partsOf(date);
  const ms = Date.UTC(year, month - 1, day) + days * 86_400_000;
  const d = new Date(ms);
  return makeLocalDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Add months keeping the day-of-month, clamped to the target month's length.
 * addMonths('2026-01-31', 1) -> '2026-02-28'
 */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const { year, month, day } = partsOf(date);
  const totalMonths = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return makeLocalDate(targetYear, targetMonth, clampedDay);
}

/** Whole days from `a` to `b` (negative when b is before a). */
export function diffDays(a: LocalDate, b: LocalDate): number {
  const pa = partsOf(a);
  const pb = partsOf(b);
  const ms = Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day);
  return Math.round(ms / 86_400_000);
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBetween(date: LocalDate, start: LocalDate, end: LocalDate): boolean {
  return date >= start && date <= end;
}

export function clampDayToMonth(year: number, month: number, day: number): number {
  return Math.min(Math.max(1, day), daysInMonth(year, month));
}

/** '2026-08-23' -> '23/08/2026' */
export function formatDateBR(date: LocalDate): string {
  const { year, month, day } = partsOf(date);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

/** '2026-08-23' -> '23 de agosto' */
export function formatDayMonthBR(date: LocalDate): string {
  const { month, day } = partsOf(date);
  const name = MONTH_NAMES_PT[month - 1]?.toLowerCase() ?? '';
  return `${day} de ${name}`;
}

export function monthLabelBR(date: LocalDate): string {
  const { year, month } = partsOf(date);
  return `${MONTH_NAMES_PT[month - 1]} ${year}`;
}

export function weekdayBR(date: LocalDate): string {
  const { year, month, day } = partsOf(date);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return WEEKDAY_NAMES_PT[weekday] ?? '';
}

/** Human-friendly label used in movement lists. */
export function relativeDateLabelBR(date: LocalDate, today: LocalDate): string {
  const delta = diffDays(today, date);
  if (delta === 0) return 'Hoje';
  if (delta === -1) return 'Ontem';
  if (delta === 1) return 'Amanhã';
  if (delta < 0 && delta > -7) return weekdayBR(date);
  return formatDateBR(date);
}

/** Epoch milliseconds for the start of a local date in the given timezone. */
export function localDateToEpochMs(date: LocalDate, timezone: string = DEFAULT_TIMEZONE): number {
  const { year, month, day } = partsOf(date);
  const naiveUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  // Resolve the zone offset at that instant, then correct for it.
  const offset = timezoneOffsetMs(new Date(naiveUtc), timezone);
  return naiveUtc - offset;
}

function timezoneOffsetMs(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return asUtc - at.getTime();
}

export const monthNamesPt = MONTH_NAMES_PT;
