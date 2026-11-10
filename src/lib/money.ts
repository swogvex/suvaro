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
  /** Shows "+" on positive amounts too (signed movement amounts). */
  sign?: boolean;
}

/** 48760 → "€487.60" (en) / "487,60 €" (es). Thousands are always grouped: "1.212,40 €". */
export function formatMoney(
  cents: number,
  locale: Locale,
  { currency = 'EUR', wholeUnits = false, sign = false }: FormatOptions = {},
): string {
  const value = wholeUnits ? centsToDecimal(Math.trunc(cents / 100) * 100) : centsToDecimal(cents);
  const format = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    useGrouping: 'always',
    ...(sign && { signDisplay: 'exceptZero' as const }),
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

export const decimalSeparator: Record<Locale, string> = { en: '.', es: ',' };

/** Cents as the user would type them back: 2385 → "23.85" (en) / "23,85" (es), no grouping, no symbol. */
export function centsToInput(cents: number, locale: Locale): string {
  return centsToDecimal(cents).replace('.', decimalSeparator[locale]);
}

/** The currency symbol in this locale: EUR → "€", USD → "$" (en) / "US$" (es). */
export function currencySymbol(locale: Locale, currency: string): string {
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0);
  return parts.find((part) => part.type === 'currency')?.value ?? currency;
}

/**
 * Parses an amount typed by the user into integer cents, or null when it is not a valid positive amount.
 * Accepts the locale's decimal separator, grouping separators and a currency symbol, and forgives the other
 * decimal separator when it cannot be grouping ("12.5" in Spanish): "1.234,56" (es) / "1,234.56" (en) → 123456.
 */
export function parseAmount(input: string, locale: Locale): number | null {
  const text = input.replace(/[\s\u00A0\u202F]/g, '').replace(/[^\d.,-]/g, '');
  if (!/^\d[\d.,]*$/.test(text)) return null;

  const decimal = decimalSeparator[locale];
  const grouping = decimal === '.' ? ',' : '.';
  let whole = text;
  let fraction = '';

  const lastDecimal = text.lastIndexOf(decimal);
  if (lastDecimal !== -1) {
    whole = text.slice(0, lastDecimal);
    fraction = text.slice(lastDecimal + 1);
    if (whole.includes(decimal)) return null;
  } else {
    const lastGrouping = text.lastIndexOf(grouping);
    const tail = lastGrouping === -1 ? '' : text.slice(lastGrouping + 1);
    const once = text.indexOf(grouping) === lastGrouping;
    if (lastGrouping !== -1 && once && tail.length > 0 && tail.length <= 2) {
      whole = text.slice(0, lastGrouping);
      fraction = tail;
    }
  }

  if (!/^\d{1,2}$|^$/.test(fraction)) return null;
  const groups = whole.split(grouping);
  if (groups.some((group) => group === '' || !/^\d+$/.test(group))) return null;
  if (groups.length > 1 && groups.slice(1).some((group) => group.length !== 3)) return null;

  const cents = Number(groups.join('')) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > MAX_AMOUNT_CENTS) return null;
  return cents;
}
