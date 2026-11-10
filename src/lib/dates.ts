/**
 * Calendar dates as `YYYY-MM-DD` strings in the user's time zone (no time, no Date arithmetic on local time).
 */

/** True when the runtime knows this IANA time zone. */
export function isTimeZone(value: string): boolean {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Today's date in `timeZone`, e.g. "2026-11-10". */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** First day of the month of `date`: "2026-11-10" → "2026-11-01". */
export function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** First day of the next month: "2026-12-10" → "2027-01-01". */
export function firstOfNextMonth(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

/** Days in a month (`month` 1–12), leap years included. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** True for a real calendar date `YYYY-MM-DD` between 1970 and 2199 ("2026-02-30" is false). */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return (
    year >= 1970 && year < 2200 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
  );
}

/** True for a month `YYYY-MM` between 1970 and 2199. */
export function isIsoMonth(value: string): boolean {
  const match = ISO_MONTH.exec(value);
  if (!match) return false;
  const [year, month] = [Number(match[1]), Number(match[2])];
  return year >= 1970 && year < 2200 && month >= 1 && month <= 12;
}

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "2026-02-28" + 1 → "2026-03-01". Pure calendar arithmetic, no time zones involved. */
export function addDays(date: string, days: number): string {
  const value = toUtc(date);
  value.setUTCDate(value.getUTCDate() + days);
  return fromUtc(value);
}

/** Same day `months` later, clamped to the month's end: "2026-01-31" + 1 → "2026-02-28". */
export function addMonths(date: string, months: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1 + months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = (((month % 12) + 12) % 12) + 1;
  const day = Math.min(Number(date.slice(8, 10)), daysInMonth(targetYear, targetMonth));
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "2026-11-10" → "2026-11". */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** "2026-11" → "2026-11-01". */
export function monthStart(month: string): string {
  return `${month}-01`;
}

/** "2026-02" → "2026-02-28". */
export function monthEnd(month: string): string {
  const year = Number(month.slice(0, 4));
  const value = Number(month.slice(5, 7));
  return `${month}-${String(daysInMonth(year, value)).padStart(2, '0')}`;
}

/** "2026-01" − 1 → "2025-12". */
export function shiftMonth(month: string, months: number): string {
  return monthOf(addMonths(monthStart(month), months));
}

/** ISO weekday of a date: 1 = Monday … 7 = Sunday. */
export function weekday(date: string): number {
  const day = toUtc(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Month grid for a calendar: whole weeks starting on `weekStart` (1 Monday, 7 Sunday). Days outside the
 * month are `null`, so the grid always has 4–6 rows of 7.
 */
export function calendarWeeks(month: string, weekStart: 1 | 7): (string | null)[][] {
  const first = monthStart(month);
  const last = monthEnd(month);
  const lead = (weekday(first) - weekStart + 7) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = first; day <= last; day = addDays(day, 1)) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
