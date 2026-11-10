import { describe, expect, it } from 'vitest';
import { budgetLevel } from '../../src/lib/budget';
import { MAX_AMOUNT_CENTS, centsToDecimal, formatMoney, percent } from '../../src/lib/money';
import { sampleMonth } from '../../src/lib/site';

// Intl uses narrow no-break spaces in some locales; compare with plain spaces.
const plain = (text: string) => text.replace(/[  ]/g, ' ');

describe('centsToDecimal', () => {
  it.each([
    [48_760, '487.60'],
    [5, '0.05'],
    [0, '0.00'],
    [-5, '-0.05'],
    [-121_240, '-1212.40'],
    [MAX_AMOUNT_CENTS, '999999999.99'],
  ])('%i → %s', (cents, expected) => {
    expect(centsToDecimal(cents)).toBe(expected);
  });

  it('rejects non-integer amounts', () => {
    expect(() => centsToDecimal(1.5)).toThrow(RangeError);
    expect(() => centsToDecimal(Number.NaN)).toThrow(RangeError);
  });
});

describe('formatMoney', () => {
  it('formats euros in English and Spanish', () => {
    expect(plain(formatMoney(48_760, 'en'))).toBe('€487.60');
    expect(plain(formatMoney(48_760, 'es'))).toBe('487,60 €');
  });

  it('always groups thousands, also four-digit amounts in Spanish', () => {
    expect(plain(formatMoney(123_456, 'en'))).toBe('€1,234.56');
    expect(plain(formatMoney(123_456, 'es'))).toBe('1.234,56 €');
  });

  it('keeps exact cents for the largest allowed amount', () => {
    expect(plain(formatMoney(MAX_AMOUNT_CENTS, 'en'))).toBe('€999,999,999.99');
  });

  it('formats negative amounts', () => {
    expect(plain(formatMoney(-1_050, 'en'))).toBe('-€10.50');
  });

  it('rounds down to whole units when asked', () => {
    expect(plain(formatMoney(2_399, 'en', { wholeUnits: true }))).toBe('€23');
    expect(plain(formatMoney(2_399, 'es', { wholeUnits: true }))).toBe('23 €');
  });

  it('uses the account currency', () => {
    expect(plain(formatMoney(1_000, 'en', { currency: 'USD' }))).toBe('$10.00');
    expect(plain(formatMoney(1_000, 'es', { currency: 'USD' }))).toBe('10,00 US$');
  });
});

describe('sample month', () => {
  const m = sampleMonth;

  it('matches the formulas: available = income − expenses − set-aside', () => {
    expect(m.incomeCents - m.expensesCents - m.setAsideCents).toBe(m.availableCents);
  });

  it('gives about 23 a day over 21 days', () => {
    expect(plain(formatMoney(Math.floor(m.availableCents / m.daysLeft), 'en', { wholeUnits: true }))).toBe(
      '€23',
    );
  });

  it('puts the food budget at risk (82 %)', () => {
    const pct = percent(m.foodSpentCents, m.foodLimitCents);
    expect(pct).toBe(82);
    expect(budgetLevel(pct)).toBe('warning');
  });
});

describe('percent and budgetLevel', () => {
  it('returns 0 for a zero total', () => {
    expect(percent(500, 0)).toBe(0);
  });

  it.each([
    [0, 'ok'],
    [79, 'ok'],
    [80, 'warning'],
    [94, 'warning'],
    [95, 'over'],
    [130, 'over'],
  ] as const)('%i %% → %s', (pct, level) => {
    expect(budgetLevel(pct)).toBe(level);
  });
});
