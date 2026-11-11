/**
 * Plan figures (`02-concepts.md`), pure and shared by the server and the Plan island.
 * Amounts are integer cents; percentages are whole numbers.
 */
import { budgetLevel, type BudgetLevel } from '../budget';
import { monthlyNeed, monthsUntil } from '../calc';
import { addMonths, monthOf } from '../dates';
import { percent } from '../money';
import type { BudgetAlert, BudgetLimitRow } from './model';

/** goalPct = round(saved / target × 100). */
export function goalPct(savedCents: number, targetCents: number): number {
  return percent(savedCents, targetCents);
}

export type GoalTip =
  | { kind: 'reached' }
  /** "Set aside {cents} a month to get there" (goal with a deadline). */
  | { kind: 'need'; cents: number }
  /** "At your current pace you'll get there in {month}" (`YYYY-MM`). */
  | { kind: 'pace'; month: string }
  /** No deadline and nothing saved yet: no pace to project. */
  | { kind: 'start' };

/**
 * The tip under a goal. With a deadline: `monthlyNeed`. Without one: the month it would be reached at the
 * average monthly pace since the first contribution (that month counts as one).
 */
export function goalTip(
  goal: { targetCents: number; savedCents: number; deadline: string | null; firstDate: string | null },
  today: string,
): GoalTip {
  if (goal.savedCents >= goal.targetCents) return { kind: 'reached' };
  const need = monthlyNeed(goal.targetCents, goal.savedCents, goal.deadline, today);
  if (need !== null) return { kind: 'need', cents: need };
  if (!goal.firstDate || goal.savedCents <= 0) return { kind: 'start' };
  const months = goal.firstDate >= today ? 1 : monthsUntil(goal.firstDate, today);
  const pace = goal.savedCents / months;
  const monthsToGo = Math.ceil((goal.targetCents - goal.savedCents) / pace);
  return { kind: 'pace', month: monthOf(addMonths(today, monthsToGo)) };
}

export interface BudgetRow {
  budgetId: string;
  categoryId: string;
  limitCents: number;
  spentCents: number;
  /** budgetPct = round(spent / limit × 100). */
  pct: number;
  /** limit − spent; negative when over. */
  leftCents: number;
  level: BudgetLevel;
}

/** One row per category budget, highest % first (ties: most over first, then by limit). */
export function budgetRows(
  budgets: readonly BudgetLimitRow[],
  spent: Readonly<Record<string, number>>,
): BudgetRow[] {
  return budgets
    .flatMap((budget): BudgetRow[] => {
      if (budget.categoryId === null) return [];
      const spentCents = spent[budget.categoryId] ?? 0;
      const pct = percent(spentCents, budget.limitCents);
      return [
        {
          budgetId: budget.id,
          categoryId: budget.categoryId,
          limitCents: budget.limitCents,
          spentCents,
          pct,
          leftCents: budget.limitCents - spentCents,
          level: budgetLevel(pct),
        },
      ];
    })
    .sort((a, b) => b.pct - a.pct || a.leftCents - b.leftCents || b.limitCents - a.limitCents);
}

export interface GlobalBudget {
  limitCents: number;
  spentCents: number;
  pct: number;
  leftCents: number;
  level: BudgetLevel;
  /** floor(left / daysLeft), or null when nothing is left or no days are left. */
  perDayCents: number | null;
}

/** The global limit against all of the cycle's expenses. */
export function globalBudget(limitCents: number, spentCents: number, daysLeft: number): GlobalBudget {
  const pct = percent(spentCents, limitCents);
  const leftCents = limitCents - spentCents;
  return {
    limitCents,
    spentCents,
    pct,
    leftCents,
    level: budgetLevel(pct),
    perDayCents: leftCents > 0 && daysLeft > 0 ? Math.floor(leftCents / daysLeft) : null,
  };
}

export const ALERT_LEVELS = [80, 100] as const;

/** The alert levels a percentage has reached: [], [80] or [80, 100]. */
export function reachedLevels(pct: number): (80 | 100)[] {
  return ALERT_LEVELS.filter((level) => pct >= level);
}

/** Key of one alert in one cycle (`alert_seen` has one row per key). */
export const alertKey = (budgetId: string, level: number) => `${budgetId}:${level}`;

/**
 * Alerts reached in the cycle and not seen yet (`seen` holds `alertKey`s of the cycle). A budget that
 * reached 100 % before anything was shown gives both levels, so the 80 % alert never shows later.
 */
export function newAlerts(rows: readonly BudgetRow[], seen: ReadonlySet<string>): BudgetAlert[] {
  return rows.flatMap((row) =>
    reachedLevels(row.pct)
      .filter((level) => !seen.has(alertKey(row.budgetId, level)))
      .map((level) => ({ budgetId: row.budgetId, categoryId: row.categoryId, level, pct: row.pct })),
  );
}

/** One alert per budget for the toast: the highest level, highest % first. */
export function alertsToShow(alerts: readonly BudgetAlert[]): BudgetAlert[] {
  const best = new Map<string, BudgetAlert>();
  for (const alert of alerts) {
    const current = best.get(alert.budgetId);
    if (!current || alert.level > current.level) best.set(alert.budgetId, alert);
  }
  return [...best.values()].sort((a, b) => b.pct - a.pct);
}

/**
 * The editor's notice: the category's % after saving, when it would reach 80 % or more; else null.
 * `previous` is the movement being edited (its old amount no longer counts once it changes).
 */
export function budgetAfterSave(
  limitCents: number,
  spentCents: number,
  amountCents: number,
  previousCents = 0,
): number | null {
  if (limitCents <= 0) return null;
  const pct = percent(spentCents - previousCents + amountCents, limitCents);
  return pct >= ALERT_LEVELS[0] ? pct : null;
}
