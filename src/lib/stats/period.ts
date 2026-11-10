/**
 * Stats periods (`10-spec-stats.md`): week, month (= the user's cycle), year (the twelve cycles that start
 * in that calendar year) and custom (any range up to a year). Dates are `YYYY-MM-DD` in the user's time zone.
 */
import { cycleOf, cycleStartingIn, shiftCycle } from '../cycle';
import { addDays, daysBetween, isIsoDate, weekday } from '../dates';

export const PERIOD_KINDS = ['week', 'month', 'year', 'custom'] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export interface Period {
  kind: PeriodKind;
  /** First day, `YYYY-MM-DD`. */
  start: string;
  /** Last day (included), `YYYY-MM-DD`. */
  end: string;
}

export interface PeriodSettings {
  /** Profile cycle start day (1–28). */
  startDay: number;
  /** 1 = Monday, 7 = Sunday. */
  weekStart: 1 | 7;
}

/** Longest custom range, in days (both ends included). */
export const MAX_CUSTOM_DAYS = 366;

export function isPeriodKind(value: string): value is PeriodKind {
  return (PERIOD_KINDS as readonly string[]).includes(value);
}

/** The week containing `date`. */
export function weekOf(date: string, weekStart: 1 | 7): Period {
  const start = addDays(date, -((weekday(date) - weekStart + 7) % 7));
  return { kind: 'week', start, end: addDays(start, 6) };
}

/** The year of cycles containing `date`: from the cycle that starts in January to the one that starts in December. */
export function yearOf(date: string, startDay: number): Period {
  const year = cycleOf(date, startDay).start.slice(0, 4);
  return {
    kind: 'year',
    start: cycleStartingIn(`${year}-01`, startDay).start,
    end: cycleStartingIn(`${year}-12`, startDay).end,
  };
}

/** The week, cycle or year containing `date`. */
export function periodOf(
  kind: Exclude<PeriodKind, 'custom'>,
  date: string,
  settings: PeriodSettings,
): Period {
  if (kind === 'week') return weekOf(date, settings.weekStart);
  if (kind === 'year') return yearOf(date, settings.startDay);
  return { kind: 'month', ...cycleOf(date, settings.startDay) };
}

/** Days in the period, both ends included. */
export function periodLength(period: Pick<Period, 'start' | 'end'>): number {
  return daysBetween(period.start, period.end) + 1;
}

/** The period `count` periods away (negative = earlier). A custom range moves by its own length. */
export function shiftPeriod(period: Period, count: number, settings: PeriodSettings): Period {
  switch (period.kind) {
    case 'week':
      return { kind: 'week', start: addDays(period.start, count * 7), end: addDays(period.end, count * 7) };
    case 'month':
      return { kind: 'month', ...shiftCycle(period, count, settings.startDay) };
    case 'year': {
      const year = Number(period.start.slice(0, 4)) + count;
      return yearOf(`${year}-06-15`, settings.startDay);
    }
    case 'custom': {
      const days = periodLength(period) * count;
      return { kind: 'custom', start: addDays(period.start, days), end: addDays(period.end, days) };
    }
  }
}

/** How many days of the period have happened: today's position, all of it once over, 0 before it starts. */
export function daysSoFar(period: Pick<Period, 'start' | 'end'>, today: string): number {
  if (today > period.end) return periodLength(period);
  if (today < period.start) return 0;
  return daysBetween(period.start, today) + 1;
}

/** The first `days` days of a period (at most all of it); null for 0 days. */
export function firstDays(
  period: Pick<Period, 'start' | 'end'>,
  days: number,
): { start: string; end: string } | null {
  if (days <= 0) return null;
  return { start: period.start, end: addDays(period.start, Math.min(days, periodLength(period)) - 1) };
}

export interface PeriodChoice {
  period: Period;
  /** The period right before, same kind. */
  previous: Period;
}

/**
 * Reads the Stats query: `period=week|month|year&date=YYYY-MM-DD` (any day inside it) or
 * `period=custom&from=…&to=…`. No query = the current cycle. Null when invalid or starting after today.
 */
export function choosePeriod(
  params: URLSearchParams,
  settings: PeriodSettings,
  today: string,
): PeriodChoice | null {
  const allowed = new Set(['period', 'date', 'from', 'to']);
  for (const key of params.keys()) if (!allowed.has(key) || params.getAll(key).length > 1) return null;

  const kind = params.get('period') ?? 'month';
  if (!isPeriodKind(kind)) return null;

  let period: Period;
  if (kind === 'custom') {
    const from = params.get('from');
    const to = params.get('to');
    if (params.has('date') || !from || !to || !isIsoDate(from) || !isIsoDate(to) || from > to) return null;
    period = { kind, start: from, end: to };
    if (periodLength(period) > MAX_CUSTOM_DAYS) return null;
  } else {
    if (params.has('from') || params.has('to')) return null;
    const date = params.get('date') ?? today;
    if (!isIsoDate(date)) return null;
    period = periodOf(kind, date, settings);
  }
  if (period.start > today) return null;
  return { period, previous: shiftPeriod(period, -1, settings) };
}

/** The query that reaches `period` (empty for the current cycle, the default). */
export function periodQuery(period: Period, today: string, settings: PeriodSettings): string {
  if (period.kind === 'custom') return `?period=custom&from=${period.start}&to=${period.end}`;
  const current = periodOf(period.kind, today, settings);
  if (period.kind === 'month' && current.start === period.start) return '';
  if (current.start === period.start) return `?period=${period.kind}`;
  return `?period=${period.kind}&date=${period.start}`;
}
