/** Labels for movements in the user's language (browser and server). Dates are `YYYY-MM-DD`, read as UTC. */
import type { Locale } from '../../i18n';
import type { Translate } from '../../i18n/client';
import { addDays } from '../dates';
import { formatMoney } from '../money';
import { signedCents, type CategoryOption, type Movement } from './model';

const intlLocale: Record<Locale, string> = { en: 'en-GB', es: 'es-ES' };

function utc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function format(date: string, locale: Locale, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlLocale[locale], { ...options, timeZone: 'UTC' }).format(utc(date));
}

/** "Monday, 9 Nov" / "lunes, 9 nov". */
export function weekdayDate(date: string, locale: Locale): string {
  return format(date, locale, { weekday: 'long', day: 'numeric', month: 'short' });
}

/** "9 November 2026" / "9 de noviembre de 2026". */
export function longDate(date: string, locale: Locale): string {
  return format(date, locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** "9 Nov 2026" / "9 nov 2026". */
export function shortDate(date: string, locale: Locale): string {
  return format(date, locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "November 2026" / "noviembre de 2026". */
export function monthName(month: string, locale: Locale): string {
  return format(`${month}-01`, locale, { month: 'long', year: 'numeric' });
}

/** "November" / "noviembre". */
export function monthOnly(month: string, locale: Locale): string {
  return format(`${month}-01`, locale, { month: 'long' });
}

/** Weekday names in grid order: ["Mon", …] or ["Sun", …]. */
export function weekdayNames(locale: Locale, weekStart: 1 | 7, style: 'short' | 'long'): string[] {
  // 2026-11-09 is a Monday.
  const first = weekStart === 1 ? '2026-11-09' : '2026-11-08';
  return Array.from({ length: 7 }, (_, i) => format(addDays(first, i), locale, { weekday: style }));
}

/** Group header: "Today · Monday, 9 Nov", "Yesterday · …" or just the date. */
export function dayHeading(date: string, today: string, locale: Locale, t: Translate): string {
  const label = weekdayDate(date, locale);
  if (date === today) return `${t('movements.today')} · ${label}`;
  if (date === addDays(today, -1)) return `${t('movements.yesterday')} · ${label}`;
  return label;
}

/** "−23.85 €" / "+1,850.00 €". */
export function signedMoney(cents: number, locale: Locale, currency: string): string {
  return formatMoney(cents, locale, { currency, sign: true });
}

export function movementAmount(movement: Movement, locale: Locale, currency: string): string {
  return signedMoney(signedCents(movement), locale, currency);
}

/** The row title: the note, else the category name, else "Income". */
export function movementName(movement: Movement, category: CategoryOption | undefined, t: Translate): string {
  return (
    movement.note ||
    category?.name ||
    t(movement.type === 'income' ? 'movements.income' : 'movements.noCategory')
  );
}
