/** What the Home page and `GET /api/home` return for one cycle (no Zod: this ships to the island). */
import type { BudgetLimit } from '../calc';
import type { Cycle } from '../cycle';
import type { Movement } from '../movements/model';

export interface PinnedGoal {
  id: string;
  name: string;
  icon: string;
  color: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  targetCents: number;
  /** `YYYY-MM-DD` or null. */
  deadline: string | null;
  /** Σ of every contribution to the goal. */
  savedCents: number;
}

export interface HomeData {
  cycle: Cycle;
  previousCycle: Cycle;
  /** The cycle's movements, newest first. */
  movements: Movement[];
  /**
   * The previous cycle's expenses per day (element 0 = its day 1), for the comparison and the dashed line.
   * Totals instead of rows keep the page small: the island only needs the shape of last month.
   */
  previousDaily: number[];
  /** Σ of contributions dated in the cycle. */
  setAsideCents: number;
  budgets: BudgetLimit[];
  goal: PinnedGoal | null;
}
