/** Labels for Home in the user's language (server and island). Dates are `YYYY-MM-DD`, read as UTC. */
import type { Locale } from '../../i18n';
import { cycleMonth, type Cycle } from '../cycle';
import { daysBetween } from '../dates';
import { monthName, monthOnly } from '../movements/format';

const intlLocale: Record<Locale, string> = { en: 'en-GB', es: 'es-ES' };

function utc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** "November 2026" for calendar-month cycles; "25 Oct – 24 Nov 2026" when the cycle starts on another day. */
export function cycleLabel(cycle: Cycle, startDay: number, locale: Locale): string {
  if (startDay === 1) return monthName(cycleMonth(cycle), locale);
  return new Intl.DateTimeFormat(intlLocale[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatRange(utc(cycle.start), utc(cycle.end));
}

/** "November" for calendar-month cycles; null otherwise (the caller says "this cycle" / "last cycle"). */
export function cycleMonthName(cycle: Cycle, startDay: number, locale: Locale): string | null {
  return startDay === 1 ? monthOnly(cycleMonth(cycle), locale) : null;
}

/** "Tuesday, 10 November" / "martes, 10 de noviembre". */
export function longWeekday(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(utc(date));
}

/** "1 Nov" / "1 nov". */
export function dayMonth(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(utc(date));
}

/** "today", "yesterday", "3 days ago" within a week; "2 Nov" before that (and for future dates). */
export function relativeDay(date: string, today: string, locale: Locale): string {
  const days = daysBetween(date, today);
  if (days < 0 || days > 6) return dayMonth(date, locale);
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day');
}

/** A ratio as a signed percentage with one decimal: 0.036 → "+3.6%" / "+3,6 %". */
export function signedPercent(ratio: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(ratio);
}
