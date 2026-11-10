/**
 * Home figures (`02-concepts.md` formulas), pure and shared by the server and the Home island.
 * All amounts are integer cents; percentages are whole numbers unless stated.
 */
import { addMonths } from './dates';
import { cycleLength, dayOfCycle, daysLeft as cycleDaysLeft, inCycle, type Cycle } from './cycle';
import { percent } from './money';
import type { Movement } from './movements/model';

export interface CycleFigures {
  incomeCents: number;
  expenseCents: number;
  setAsideCents: number;
  /** income − expenses. */
  savingsCents: number;
  /** income − expenses − set aside. */
  availableCents: number;
  /** Days from today to the cycle's end, both included; 0 for a past cycle. */
  daysLeft: number;
  /** floor(available / daysLeft); null when no days are left. */
  dailyAllowCents: number | null;
}

/** floor(available / daysLeft) in cents (shown as "about X a day" in whole units), or null with no days left. */
export function dailyAllowance(availableCents: number, daysLeft: number): number | null {
  return daysLeft > 0 ? Math.floor(availableCents / daysLeft) : null;
}

/** The cycle's totals. Movements outside the cycle are ignored. */
export function cycleFigures(
  movements: readonly Movement[],
  setAsideCents: number,
  cycle: Cycle,
  today: string,
): CycleFigures {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const movement of movements) {
    if (!inCycle(movement.date, cycle)) continue;
    if (movement.type === 'income') incomeCents += movement.amountCents;
    else expenseCents += movement.amountCents;
  }
  const availableCents = incomeCents - expenseCents - setAsideCents;
  const daysLeft = cycleDaysLeft(cycle, today);
  return {
    incomeCents,
    expenseCents,
    setAsideCents,
    savingsCents: incomeCents - expenseCents,
    availableCents,
    daysLeft,
    dailyAllowCents: dailyAllowance(availableCents, daysLeft),
  };
}

/** How far into the cycle the numbers go: today's day for the current cycle, the whole cycle once it's over. */
export function daysSoFar(cycle: Cycle, today: string): number {
  if (today > cycle.end) return cycleLength(cycle);
  if (today < cycle.start) return 0;
  return dayOfCycle(today, cycle);
}

/** Expenses per day of the cycle (not cumulative): element 0 is day 1, one element per day of the cycle. */
export function dailyExpenses(
  movements: readonly Pick<Movement, 'type' | 'amountCents' | 'date'>[],
  cycle: Cycle,
): number[] {
  const perDay = Array.from({ length: cycleLength(cycle) }, () => 0);
  for (const movement of movements) {
    if (movement.type !== 'expense' || !inCycle(movement.date, cycle)) continue;
    const index = dayOfCycle(movement.date, cycle) - 1;
    perDay[index] = (perDay[index] ?? 0) + movement.amountCents;
  }
  return perDay;
}

/** Running totals: [5, 0, 3] → [5, 5, 8]. */
export function runningTotal(values: readonly number[]): number[] {
  let total = 0;
  return values.map((value) => (total += value));
}

/** Running total of expenses by day of the cycle, for the first `days` days: element 0 is day 1. */
export function cumulativeExpenses(movements: readonly Movement[], cycle: Cycle, days: number): number[] {
  return runningTotal(dailyExpenses(movements, cycle).slice(0, days));
}

export interface Comparison {
  /** Day of the cycle the comparison goes up to (1-based). */
  day: number;
  /** Expenses of this cycle up to `day`. */
  currentCents: number;
  /** Expenses of the previous cycle up to the same day (or its last day, when it was shorter). */
  previousCents: number;
  /** (current − previous) / previous; null when the previous cycle had no expenses by then. */
  change: number | null;
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/**
 * `vsLastCycle`: this cycle's spending so far against the previous cycle's by the same day.
 * `previousDaily` is the previous cycle's `dailyExpenses`.
 */
export function compareWithPrevious(
  movements: readonly Movement[],
  cycle: Cycle,
  previousDaily: readonly number[],
  today: string,
): Comparison {
  const day = daysSoFar(cycle, today);
  const currentCents = sum(dailyExpenses(movements, cycle).slice(0, day));
  const previousCents = sum(previousDaily.slice(0, Math.min(day, previousDaily.length)));
  return {
    day,
    currentCents,
    previousCents,
    change: previousCents > 0 ? (currentCents - previousCents) / previousCents : null,
  };
}

export interface BudgetLimit {
  /** Null = the global limit. */
  categoryId: string | null;
  limitCents: number;
}

export interface BudgetRisk {
  categoryId: string;
  spentCents: number;
  limitCents: number;
  /** round(spent / limit × 100). */
  pct: number;
  /** limit − spent; negative when over. */
  leftCents: number;
}

export const AT_RISK_PCT = 80;

/** Category budgets at ≥ 80 % in the cycle, highest first (ties: most over first), at most `max`. */
export function budgetsAtRisk(
  budgets: readonly BudgetLimit[],
  movements: readonly Movement[],
  cycle: Cycle,
  max = 3,
): BudgetRisk[] {
  const spent = new Map<string, number>();
  for (const movement of movements) {
    if (movement.type !== 'expense' || !movement.categoryId || !inCycle(movement.date, cycle)) continue;
    spent.set(movement.categoryId, (spent.get(movement.categoryId) ?? 0) + movement.amountCents);
  }
  return budgets
    .flatMap((budget): BudgetRisk[] => {
      if (budget.categoryId === null || budget.limitCents <= 0) return [];
      const spentCents = spent.get(budget.categoryId) ?? 0;
      const pct = percent(spentCents, budget.limitCents);
      if (pct < AT_RISK_PCT) return [];
      return [
        {
          categoryId: budget.categoryId,
          spentCents,
          limitCents: budget.limitCents,
          pct,
          leftCents: budget.limitCents - spentCents,
        },
      ];
    })
    .sort((a, b) => b.pct - a.pct || a.leftCents - b.leftCents)
    .slice(0, max);
}

/** Whole months from `today` until `deadline`, at least 1 (a past or near deadline still needs one month). */
export function monthsUntil(today: string, deadline: string): number {
  let months = (Number(deadline.slice(0, 4)) - Number(today.slice(0, 4))) * 12;
  months += Number(deadline.slice(5, 7)) - Number(today.slice(5, 7));
  // Not a whole month yet when the deadline's day comes before today's (clamped at month ends).
  if (months > 0 && addMonths(today, months) > deadline) months -= 1;
  return Math.max(months, 1);
}

/** `monthlyNeed` = ceil((target − saved) / monthsLeft); 0 once reached; null without a deadline. */
export function monthlyNeed(
  targetCents: number,
  savedCents: number,
  deadline: string | null,
  today: string,
): number | null {
  if (deadline === null) return null;
  const remaining = targetCents - savedCents;
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / monthsUntil(today, deadline));
}

/** The cycle's main income: the largest one (earliest on a tie), or null when there is none. */
export function mainIncome(movements: readonly Movement[], cycle: Cycle): Movement | null {
  let main: Movement | null = null;
  for (const movement of movements) {
    if (movement.type !== 'income' || !inCycle(movement.date, cycle)) continue;
    if (
      !main ||
      movement.amountCents > main.amountCents ||
      (movement.amountCents === main.amountCents && movement.date < main.date)
    ) {
      main = movement;
    }
  }
  return main;
}
