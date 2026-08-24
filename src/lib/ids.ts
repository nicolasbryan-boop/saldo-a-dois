/**
 * Identifier helpers. All ids are opaque, random and unguessable so that no
 * row id doubles as a guessable capability.
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** URL-safe random string, ~5.16 bits per character. */
export function randomId(length = 21): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** Prefixed id, e.g. `hh_9f3k...`. The prefix aids log reading only. */
export function prefixedId(prefix: string, length = 21): string {
  return `${prefix}_${randomId(length)}`;
}

/** 256-bit token rendered as hex — used for invites and checkout claims. */
export function secureToken(): string {
  const bytes = randomBytes(32);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Readable temporary password for partner provisioning (no ambiguous chars). */
export function temporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export const ids = {
  household: () => prefixedId('hh'),
  member: () => prefixedId('mb'),
  cycle: () => prefixedId('cy'),
  category: () => prefixedId('ct'),
  transaction: () => prefixedId('tx'),
  recurringExpense: () => prefixedId('re'),
  incomeSource: () => prefixedId('is'),
  recurringInstance: () => prefixedId('ri'),
  goal: () => prefixedId('gl'),
  goalContribution: () => prefixedId('gc'),
  subscription: () => prefixedId('sb'),
  checkout: () => prefixedId('co'),
  paymentEvent: () => prefixedId('pe'),
  invite: () => prefixedId('iv'),
  message: () => prefixedId('ms'),
  event: () => prefixedId('ev'),
  audit: () => prefixedId('au'),
  email: () => prefixedId('em'),
  error: () => prefixedId('er'),
};
