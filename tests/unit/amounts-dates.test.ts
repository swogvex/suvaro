import { describe, expect, it } from 'vitest';
import { firstOfMonth, firstOfNextMonth, isTimeZone, todayIn } from '../../src/lib/dates';
import { MAX_AMOUNT_CENTS, parseAmount } from '../../src/lib/money';

describe('parseAmount', () => {
  it.each([
    ['1850', 185_000],
    ['1850.5', 185_050],
    ['1,850.00', 185_000],
    ['1,234,567.89', 123_456_789],
    ['€ 12.30', 1_230],
    ['0.05', 5],
    ['  42 ', 4_200],
    ['12,345', 1_234_500],
  ])('en: %s → %i', (input, cents) => {
    expect(parseAmount(input, 'en')).toBe(cents);
  });

  it.each([
    ['1850', 185_000],
    ['1.850,00', 185_000],
    ['1850,5', 185_050],
    ['12,30 €', 1_230],
    ['1 850,00', 185_000],
    // The other decimal separator is forgiven when it cannot be grouping.
    ['12.5', 1_250],
    ['12.50', 1_250],
    // Three digits after a dot is grouping in Spanish.
    ['1.850', 185_000],
  ])('es: %s → %i', (input, cents) => {
    expect(parseAmount(input, 'es')).toBe(cents);
  });

  it.each(['', 'abc', '-5', '1.2.3,4,5', '12,34,5', '1,85,0.00', '1.2345', ',5', '5,'])(
    'rejects %j in English',
    (input) => {
      expect(parseAmount(input, 'en')).toBeNull();
    },
  );

  it.each(['', '-5', '1,234', '12,3,4', '1.85.0,00'])('rejects %j in Spanish', (input) => {
    expect(parseAmount(input, 'es')).toBeNull();
  });

  it('keeps the exact cents (no float rounding) and caps the maximum', () => {
    expect(parseAmount('0.29', 'en')).toBe(29);
    expect(parseAmount('1.15', 'en')).toBe(115);
    expect(parseAmount('999999999.99', 'en')).toBe(MAX_AMOUNT_CENTS);
    expect(parseAmount('1000000000', 'en')).toBeNull();
  });
});

describe('dates', () => {
  it('gives today in the user time zone, across a date line', () => {
    const lateUtc = new Date('2026-11-30T23:30:00Z');
    expect(todayIn('UTC', lateUtc)).toBe('2026-11-30');
    expect(todayIn('Europe/Madrid', lateUtc)).toBe('2026-12-01');
    expect(todayIn('America/Mexico_City', new Date('2026-12-01T03:00:00Z'))).toBe('2026-11-30');
  });

  it('finds the first day of this and the next month, including December', () => {
    expect(firstOfMonth('2026-11-10')).toBe('2026-11-01');
    expect(firstOfNextMonth('2026-11-10')).toBe('2026-12-01');
    expect(firstOfNextMonth('2026-12-31')).toBe('2027-01-01');
  });

  it('validates IANA time zones', () => {
    expect(isTimeZone('Europe/Madrid')).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
    expect(isTimeZone('')).toBe(false);
  });
});
