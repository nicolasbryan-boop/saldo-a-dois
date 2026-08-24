/**
 * Money is always an integer number of cents. No float ever reaches the
 * database, and no float is used for arithmetic in the financial engine.
 */

export const CENTS_PER_UNIT = 100;

/** Largest amount a single movement may carry: R$ 100.000.000,00. */
export const MAX_AMOUNT_CENTS = 10_000_000_000;

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const decimalFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Intl inserts U+00A0 after "R$"; normalise it so output is predictable. */
function normalizeSpaces(value: string): string {
  return value.replace(/[\u00A0\u202F]/g, ' ');
}

/** 123456 -> "R$ 1.234,56"  |  -43000 -> "-R$ 430,00" */
export function formatBRL(cents: number): string {
  return normalizeSpaces(brlFormatter.format(cents / CENTS_PER_UNIT));
}

/** 123456 -> "1.234,56" (no currency symbol). */
export function formatAmount(cents: number): string {
  return normalizeSpaces(decimalFormatter.format(cents / CENTS_PER_UNIT));
}

/**
 * Compact form for dense UI: 1234567 -> "R$ 12,3 mil".
 * Falls back to the full format below R$ 10.000.
 */
export function formatBRLCompact(cents: number): string {
  const abs = Math.abs(cents);
  if (abs < 1_000_000) return formatBRL(cents);
  const sign = cents < 0 ? '-' : '';
  const units = abs / CENTS_PER_UNIT;
  if (units >= 1_000_000) {
    return `${sign}R$ ${normalizeSpaces(
      new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(units / 1_000_000),
    )} mi`;
  }
  return `${sign}R$ ${normalizeSpaces(
    new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(units / 1000),
  )} mil`;
}

/**
 * Parse user-typed money into cents.
 *
 * Accepts the shapes people actually type in pt-BR:
 *   "120"        -> 12000
 *   "120,50"     -> 12050
 *   "1.234,56"   -> 123456
 *   "R$ 89,90"   -> 8990
 *   "120.50"     -> 12050   (dot used as decimal separator)
 *   "1.234"      -> 123400  (dot used as thousands separator)
 *
 * Returns null when the input is not a usable amount.
 */
export function parseMoneyToCents(input: string): number | null {
  if (typeof input !== 'string') return null;

  let raw = input.trim().toLowerCase();
  if (!raw) return null;

  const negative = raw.startsWith('-');
  raw = raw
    .replace(/^-/, '')
    .replace(/r\$/g, '')
    .replace(/reais?/g, '')
    .replace(/\s/g, '');

  if (!/^[\d.,]+$/.test(raw)) return null;

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');

  let normalized: string;

  if (lastComma >= 0 && lastDot >= 0) {
    // Both present: the rightmost one is the decimal separator.
    if (lastComma > lastDot) {
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = raw.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    // Only commas. Grouping-shaped ("1,234,567") means thousands.
    normalized = /^\d{1,3}(,\d{3})+$/.test(raw)
      ? raw.replace(/,/g, '')
      : raw.replace(',', '.');
  } else if (lastDot >= 0) {
    // Only dots. Grouping-shaped ("1.234" / "1.234.567") means thousands.
    normalized = /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, '') : raw;
  } else {
    normalized = raw;
  }

  // More than one separator left means the input was malformed.
  if ((normalized.match(/\./g) ?? []).length > 1) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;

  const cents = Math.round(value * CENTS_PER_UNIT);
  if (!Number.isSafeInteger(cents)) return null;

  return negative ? -cents : cents;
}

/** True when the value is a legal stored amount: positive integer, in range. */
export function isValidAmountCents(cents: unknown): cents is number {
  return (
    typeof cents === 'number' &&
    Number.isInteger(cents) &&
    cents > 0 &&
    cents <= MAX_AMOUNT_CENTS
  );
}

/**
 * Split `totalCents` into `parts` integer cents that sum exactly to the total.
 * Used for even distributions where rounding must not create or destroy money.
 */
export function distributeCents(totalCents: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}
