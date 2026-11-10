/** Labels for Stats in the user's language (server and island). Dates are `YYYY-MM-DD`, read as UTC. */
import type { Locale } from '../../i18n';
import { cycleLabel } from '../home/format';
import { centsToDecimal } from '../money';
import type { Period } from './period';

const intlLocale: Record<Locale, string> = { en: 'en-GB', es: 'es-ES' };

function utc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function dateRange(start: string, end: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatRange(utc(start), utc(end));
}

/**
 * "9–15 Nov 2026" (week), "November 2026" or the cycle's dates (month), "2026" (year of calendar months,
 * else its dates), the dates of a custom range.
 */
export function periodLabel(period: Period, startDay: number, locale: Locale): string {
  if (period.kind === 'month') return cycleLabel(period, startDay, locale);
  if (period.kind === 'year' && startDay === 1) return period.start.slice(0, 4);
  return dateRange(period.start, period.end, locale);
}

/** "Jun" / "jun" for the cycle that starts on `date`. */
export function shortMonth(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], { month: 'short', timeZone: 'UTC' })
    .format(utc(date))
    .replace('.', '');
}

/** Short money for chart labels: "€1.2K" / "1,2 mil €". */
export function compactMoney(cents: number, locale: Locale, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(centsToDecimal(Math.trunc(cents / 100) * 100)));
}

/** A ratio as a whole percentage without sign: 0.32 → "32 %" / "32 %"; the arrow says the direction. */
export function plainPercent(ratio: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    Math.abs(ratio),
  );
}

/** A list of names: ["July", "August"] → "July and August" / "julio y agosto". */
export function listOf(items: readonly string[], locale: Locale): string {
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(items);
}
