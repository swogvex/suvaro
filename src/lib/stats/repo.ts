/**
 * Stats queries (server only). Every query filters by the signed-in user's id. Aggregates are computed with
 * the pure functions in `calc.ts`; only the period's own movements travel with their notes.
 */
import { and, desc, eq, gte, lte, min } from 'drizzle-orm';
import { shiftCycle } from '../cycle';
import type { Database } from '../db/client';
import { movement } from '../db/schema';
import { toMovement } from '../movements/repo';
import {
  averageIncome,
  categoryComparison,
  categoryTrends,
  lastBarCycle,
  MONTH_BARS,
  monthBars,
  savingsRate,
  savingsSeries,
  sums,
  TREND_PERIODS,
} from './calc';
import type { StatsData } from './model';
import { shiftPeriod, type PeriodChoice, type PeriodSettings } from './period';

export async function loadStats(
  db: Database,
  userId: string,
  { period, previous }: PeriodChoice,
  settings: PeriodSettings,
  today: string,
): Promise<StatsData> {
  const lastBar = lastBarCycle(period, today, settings.startDay);
  const firstBar = shiftCycle(lastBar, 1 - MONTH_BARS, settings.startDay);
  const oldestTrend = shiftPeriod(period, -TREND_PERIODS, settings);
  const from = oldestTrend.start < firstBar.start ? oldestTrend.start : firstBar.start;
  const to = period.end > lastBar.end ? period.end : lastBar.end;

  const mine = eq(movement.userId, userId);
  const [first, rows, own] = await Promise.all([
    db
      .select({ date: min(movement.date) })
      .from(movement)
      .where(mine),
    db
      .select({
        type: movement.type,
        amountCents: movement.amountCents,
        categoryId: movement.categoryId,
        date: movement.date,
      })
      .from(movement)
      .where(and(mine, gte(movement.date, from), lte(movement.date, to))),
    db
      .select()
      .from(movement)
      .where(and(mine, gte(movement.date, period.start), lte(movement.date, period.end)))
      .orderBy(desc(movement.date), desc(movement.id)),
  ]);

  const months = monthBars(rows, lastBar, settings.startDay, today);
  return {
    period,
    previous,
    totals: sums(rows, period),
    categories: categoryComparison(rows, period, previous, today),
    trends: categoryTrends(rows, period, settings, today, first[0]?.date ?? null),
    savingsRate: savingsRate(months),
    months,
    averageIncomeCents: averageIncome(months),
    savings: savingsSeries(rows, period, today, settings.startDay),
    movements: own.map(toMovement),
  };
}
