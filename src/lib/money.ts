/**
 * Money is stored as integer cents (never floats). Formatting happens only at the edge, with Intl.
 * The amount is passed to Intl as a decimal string, so no float rounding can creep in.
 */
import type { Locale } from '../i18n';

export const MAX_AMOUNT_CENTS = 99_999_999_999;

/** Converts integer cents to an exact decimal string: 48760 → "487.60", -5 → "-0.05". */
export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`Amount must be integer cents, got ${cents}`);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const units = Math.trunc(abs / 100);
  const rest = abs % 100;
  return `${sign}${units}.${String(rest).padStart(2, '0')}`;
}

interface FormatOptions {
  /** ISO 4217 code; one currency per account (default EUR). */
  currency?: string;
  /** Rounds down to whole currency units, e.g. for "about 23 a day". */
  wholeUnits?: boolean;
}

/** 48760 → "€487.60" (en) / "487,60 €" (es). Thousands are always grouped: "1.212,40 €". */
export function formatMoney(
  cents: number,
  locale: Locale,
  { currency = 'EUR', wholeUnits = false }: FormatOptions = {},
): string {
  const value = wholeUnits ? centsToDecimal(Math.trunc(cents / 100) * 100) : centsToDecimal(cents);
  const format = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    useGrouping: 'always',
    ...(wholeUnits && { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  });
  // Intl accepts decimal strings (exact); TypeScript's lib still types `format` as number | bigint.
  return format.format(value as unknown as number);
}

/** Whole-number percentage of `part` over `total`, rounded; 0 when total is 0. */
export function percent(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}
