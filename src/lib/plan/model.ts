/** What the Plan page and `GET /api/plan` return (no Zod: this ships to the island). */
import type { Cycle } from '../cycle';
import type { IconName } from '../icons';

export const MAX_GOALS = 20;
export const GOAL_NAME_MAX = 40;
/** Contributions sent to the browser per goal (the newest); older ones still count in `savedCents`. */
export const CONTRIBUTIONS_SHOWN = 10;

/** Icons offered for goals. */
export const goalIcons = [
  'target',
  'plane',
  'house',
  'gift',
  'heart-pulse',
  'book',
  'smartphone',
  'monitor',
  'shirt',
  'paw',
  'ticket',
  'wallet',
] as const satisfies readonly IconName[];

export type GoalIcon = (typeof goalIcons)[number];
export type ColorIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface Contribution {
  id: string;
  goalId: string;
  amountCents: number;
  /** `YYYY-MM-DD`. */
  date: string;
}

export interface Goal {
  id: string;
  name: string;
  icon: string;
  color: ColorIndex;
  targetCents: number;
  /** `YYYY-MM-DD` or null. */
  deadline: string | null;
  pinned: boolean;
  /** ISO timestamp, or null while in progress. */
  completedAt: string | null;
  /** Σ of every contribution. */
  savedCents: number;
  /** Date of the first contribution (for the pace tip), or null. */
  firstDate: string | null;
  /** The newest contributions, newest first (at most `CONTRIBUTIONS_SHOWN`). */
  contributions: Contribution[];
}

export interface BudgetLimitRow {
  id: string;
  /** Null = the global limit. */
  categoryId: string | null;
  limitCents: number;
}

export interface PlanData {
  cycle: Cycle;
  goals: Goal[];
  budgets: BudgetLimitRow[];
  /** Expenses per category in the cycle (categories with none are left out). */
  spent: Record<string, number>;
  /** All expenses in the cycle. */
  totalSpentCents: number;
}

/** A budget alert the user has not been shown yet. */
export interface BudgetAlert {
  budgetId: string;
  categoryId: string;
  level: 80 | 100;
  pct: number;
}

/** What the editor needs for its budget notice (`GET /api/budgets`). */
export interface BudgetStatus {
  cycle: Cycle;
  limits: { categoryId: string; limitCents: number }[];
  spent: Record<string, number>;
}
