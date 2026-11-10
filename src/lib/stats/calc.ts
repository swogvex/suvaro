/**
 * Stats aggregates (`10-spec-stats.md`, `02-concepts.md`), pure: the server computes them from the user's
 * movements and the island only renders them. Amounts are integer cents.
 */
import { cycleOf, shiftCycle, type Cycle } from '../cycle';
import { addDays } from '../dates';
import type { Movement } from '../movements/model';
import { daysSoFar, firstDays, periodLength, shiftPeriod, type Period, type PeriodSettings } from './period';

export type StatsRow = Pick<Movement, 'type' | 'amountCents' | 'categoryId' | 'date'>;

interface Range {
  start: string;
  end: string;
}

const within = (date: string, range: Range | null) =>
  range !== null && date >= range.start && date <= range.end;

export interface Sums {
  incomeCents: number;
  expenseCents: number;
  /** income − expenses. */
  savingsCents: number;
}

export function sums(rows: readonly StatsRow[], range: Range | null): Sums {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const row of rows) {
    if (!within(row.date, range)) continue;
    if (row.type === 'income') incomeCents += row.amountCents;
    else expenseCents += row.amountCents;
  }
  return { incomeCents, expenseCents, savingsCents: incomeCents - expenseCents };
}

/** Expenses per category (null = no category) inside the range. */
export function expensesByCategory(
  rows: readonly StatsRow[],
  range: Range | null,
): Map<string | null, number> {
  const totals = new Map<string | null, number>();
  for (const row of rows) {
    if (row.type !== 'expense' || !within(row.date, range)) continue;
    totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0) + row.amountCents);
  }
  return totals;
}

/**
 * The part of `period` that has happened, and the matching part of an earlier period "to the same day":
 * its first N days, N = days so far. Once `period` is over, the earlier period counts whole (so a 31-day
 * cycle is not cut to 28 when compared with February).
 */
export function sameDayRanges(
  period: Period,
  earlier: Period,
  today: string,
): { current: Range | null; earlier: Range | null } {
  const days = daysSoFar(period, today);
  const over = today > period.end;
  return {
    current: firstDays(period, days),
    earlier: over ? { start: earlier.start, end: earlier.end } : firstDays(earlier, days),
  };
}

export interface CategoryRow {
  /** Null = movements without a category. */
  categoryId: string | null;
  currentCents: number;
  /** The previous period up to the same day. */
  previousCents: number;
}

/** Spend per category this period vs the previous one to the same day, biggest current spend first. */
export function categoryComparison(
  rows: readonly StatsRow[],
  period: Period,
  previous: Period,
  today: string,
): CategoryRow[] {
  const ranges = sameDayRanges(period, previous, today);
  const current = expensesByCategory(rows, ranges.current);
  const before = expensesByCategory(rows, ranges.earlier);
  const ids = new Set([...current.keys(), ...before.keys()]);
  return [...ids]
    .map((categoryId) => ({
      categoryId,
      currentCents: current.get(categoryId) ?? 0,
      previousCents: before.get(categoryId) ?? 0,
    }))
    .sort((a, b) => b.currentCents - a.currentCents || b.previousCents - a.previousCents);
}

export interface CategoryTrend {
  categoryId: string;
  currentCents: number;
  /** Mean of the 3 previous periods, each to the same day. */
  averageCents: number;
  /** (current − average) / average. */
  change: number;
}

export const TREND_PERIODS = 3;
export const TREND_MIN_CHANGE = 0.15;
/** Both values must reach 10 currency units. */
export const TREND_MIN_CENTS = 1_000;
export const MAX_TRENDS = 3;

/**
 * Trends (`02-concepts.md`): each category's spend so far against the mean of the previous 3 periods to the
 * same day; only |change| ≥ 15 % with both values ≥ 10 units, the largest changes first, at most 3.
 * `since` (the user's first movement) avoids averaging months before they started: with less than three
 * periods of history there are no trends.
 */
export function categoryTrends(
  rows: readonly StatsRow[],
  period: Period,
  settings: PeriodSettings,
  today: string,
  since: string | null,
  max = MAX_TRENDS,
): CategoryTrend[] {
  const oldest = shiftPeriod(period, -TREND_PERIODS, settings);
  if (since === null || since > oldest.end) return [];

  const current = expensesByCategory(rows, sameDayRanges(period, period, today).current);
  const sumsBefore = new Map<string, number>();
  for (let i = 1; i <= TREND_PERIODS; i++) {
    const earlier = shiftPeriod(period, -i, settings);
    for (const [id, cents] of expensesByCategory(rows, sameDayRanges(period, earlier, today).earlier)) {
      if (id !== null) sumsBefore.set(id, (sumsBefore.get(id) ?? 0) + cents);
    }
  }

  const trends: CategoryTrend[] = [];
  for (const [categoryId, total] of sumsBefore) {
    const averageCents = Math.round(total / TREND_PERIODS);
    const currentCents = current.get(categoryId) ?? 0;
    if (averageCents < TREND_MIN_CENTS || currentCents < TREND_MIN_CENTS) continue;
    const change = (currentCents - averageCents) / averageCents;
    if (Math.abs(change) < TREND_MIN_CHANGE) continue;
    trends.push({ categoryId, currentCents, averageCents, change });
  }
  return trends.sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, max);
}

export interface MonthBar {
  start: string;
  end: string;
  incomeCents: number;
  expenseCents: number;
  /** The cycle contains today (drawn as a dashed outline). */
  inProgress: boolean;
}

export const MONTH_BARS = 6;

/** The cycle the monthly bars end on: the one holding the period's last day, or today's while it runs. */
export function lastBarCycle(period: Period, today: string, startDay: number): Cycle {
  return cycleOf(period.end < today ? period.end : today, startDay);
}

/** Income and expenses of the `count` cycles ending with `last`, oldest first. */
export function monthBars(
  rows: readonly StatsRow[],
  last: Cycle,
  startDay: number,
  today: string,
  count = MONTH_BARS,
): MonthBar[] {
  return Array.from({ length: count }, (_, i) => {
    const cycle = shiftCycle(last, i - count + 1, startDay);
    const { incomeCents, expenseCents } = sums(rows, cycle);
    return { ...cycle, incomeCents, expenseCents, inProgress: today >= cycle.start && today <= cycle.end };
  });
}

/** Mean income of the bars that have any (months before the user started don't pull it down); null if none. */
export function averageIncome(bars: readonly MonthBar[]): number | null {
  const withIncome = bars.filter((bar) => bar.incomeCents > 0);
  if (withIncome.length === 0) return null;
  return Math.round(withIncome.reduce((total, bar) => total + bar.incomeCents, 0) / withIncome.length);
}

export interface SavingsRate {
  /** Σ savings / Σ income of the finished months with income. */
  rate: number;
  months: number;
}

/** Average savings rate of the finished cycles among the bars (a running cycle would overstate it). */
export function savingsRate(bars: readonly MonthBar[]): SavingsRate | null {
  const done = bars.filter((bar) => !bar.inProgress && bar.incomeCents > 0);
  if (done.length === 0) return null;
  const income = done.reduce((total, bar) => total + bar.incomeCents, 0);
  const expenses = done.reduce((total, bar) => total + bar.expenseCents, 0);
  return { rate: (income - expenses) / income, months: done.length };
}

export interface SavingsPoint {
  start: string;
  end: string;
  /** Running total of income − expenses from the period's start to `end`. */
  cents: number;
}

/** Periods up to this many days are drawn day by day; longer ones by cycle. */
export const DAILY_POINTS_MAX = 62;

/**
 * Cumulative savings through the period, one point per day (week, month, short custom ranges) or per cycle
 * (year, long custom ranges, clipped to the range). Stops at today.
 */
export function savingsSeries(
  rows: readonly StatsRow[],
  period: Period,
  today: string,
  startDay: number,
): SavingsPoint[] {
  const last = today < period.end ? today : period.end;
  if (last < period.start) return [];
  const buckets: Range[] = [];
  if (periodLength(period) <= DAILY_POINTS_MAX) {
    for (let day = period.start; day <= last; day = addDays(day, 1)) buckets.push({ start: day, end: day });
  } else {
    for (
      let cycle = cycleOf(period.start, startDay);
      cycle.start <= last;
      cycle = shiftCycle(cycle, 1, startDay)
    ) {
      buckets.push({
        start: cycle.start < period.start ? period.start : cycle.start,
        end: cycle.end > last ? last : cycle.end,
      });
    }
  }
  const net = new Map<number, number>();
  for (const row of rows) {
    if (row.date < period.start || row.date > last) continue;
    const index = buckets.findIndex((bucket) => row.date <= bucket.end);
    const signed = row.type === 'income' ? row.amountCents : -row.amountCents;
    net.set(index, (net.get(index) ?? 0) + signed);
  }
  let total = 0;
  return buckets.map((bucket, index) => ({ ...bucket, cents: (total += net.get(index) ?? 0) }));
}
