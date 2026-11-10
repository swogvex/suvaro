/** What the Stats page and `GET /api/stats` return for one period (no Zod: this ships to the island). */
import type { Movement } from '../movements/model';
import type { CategoryRow, CategoryTrend, MonthBar, SavingsPoint, SavingsRate, Sums } from './calc';
import type { Period } from './period';

export interface StatsData {
  period: Period;
  previous: Period;
  /** Totals of the period (up to today). */
  totals: Sums;
  /** This period vs the previous one to the same day, by category. */
  categories: CategoryRow[];
  /** Categories against their 3-period average (at most 3). */
  trends: CategoryTrend[];
  /** Average savings of the finished months among `months`. */
  savingsRate: SavingsRate | null;
  /** The last 6 cycles up to the period, oldest first. */
  months: MonthBar[];
  averageIncomeCents: number | null;
  /** Cumulative savings through the period. */
  savings: SavingsPoint[];
  /** The period's movements, newest first (tables, CSV and print). */
  movements: Movement[];
}
