import { describe, it, expect } from 'vitest';
import {
  formatBRL,
  parseMoneyToCents,
  isValidAmountCents,
  distributeCents,
} from '@/lib/money';

describe('formatBRL', () => {
  it('formats cents in Brazilian currency', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(2090)).toBe('R$ 20,90');
    expect(formatBRL(0)).toBe('R$ 0,00');
  });

  it('keeps negative amounts visible instead of hiding them', () => {
    expect(formatBRL(-43000)).toBe('-R$ 430,00');
  });
});

describe('parseMoneyToCents', () => {
  it('parses the shapes people actually type', () => {
    expect(parseMoneyToCents('120')).toBe(12000);
    expect(parseMoneyToCents('120,50')).toBe(12050);
    expect(parseMoneyToCents('1.234,56')).toBe(123456);
    expect(parseMoneyToCents('R$ 89,90')).toBe(8990);
    expect(parseMoneyToCents('  86,5 ')).toBe(8650);
  });

  it('reads a lone dot as a decimal separator when it is not grouping', () => {
    expect(parseMoneyToCents('120.50')).toBe(12050);
  });

  it('reads a lone dot as thousands when the shape is grouping', () => {
    expect(parseMoneyToCents('1.234')).toBe(123400);
    expect(parseMoneyToCents('1.234.567')).toBe(123456700);
  });

  it('rejects things that are not amounts', () => {
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('abc')).toBeNull();
    expect(parseMoneyToCents('12.34.56')).toBeNull();
  });

  it('never produces a fractional cent', () => {
    const cents = parseMoneyToCents('0,015');
    expect(cents === null || Number.isInteger(cents)).toBe(true);
  });
});

describe('isValidAmountCents', () => {
  it('accepts positive integers only', () => {
    expect(isValidAmountCents(1)).toBe(true);
    expect(isValidAmountCents(0)).toBe(false);
    expect(isValidAmountCents(-100)).toBe(false);
    expect(isValidAmountCents(12.5)).toBe(false);
    expect(isValidAmountCents('100')).toBe(false);
    expect(isValidAmountCents(Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});

describe('distributeCents', () => {
  it('splits without creating or destroying money', () => {
    const parts = distributeCents(100, 3);
    expect(parts).toEqual([34, 33, 33]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
  });
});
