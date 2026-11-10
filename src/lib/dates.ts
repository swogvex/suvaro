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
