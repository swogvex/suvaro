/**
 * Home queries (server only). Every query filters by the signed-in user's id.
 * Totals are computed from the cycle's movements with the pure functions in `calc.ts`, so the server and the
 * island (optimistic updates) always agree.
 */
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { dailyExpenses } from '../calc';
import type { Cycle } from '../cycle';
import type { Database } from '../db/client';
import { budget, contribution, goal, movement } from '../db/schema';
import { colorIndex } from '../default-categories';
import { toMovement } from '../movements/repo';
import type { HomeData, PinnedGoal } from './model';

function inRange(cycle: Cycle) {
  return [gte(movement.date, cycle.start), lte(movement.date, cycle.end)];
}

async function pinnedGoal(db: Database, userId: string): Promise<PinnedGoal | null> {
  const [row] = await db
    .select({
      id: goal.id,
      name: goal.name,
      icon: goal.icon,
      color: goal.color,
      targetCents: goal.targetCents,
      deadline: goal.deadline,
    })
    .from(goal)
    .where(and(eq(goal.userId, userId), eq(goal.pinned, true)))
    .limit(1);
  if (!row) return null;
  const [saved] = await db
    .select({ total: sql<number>`coalesce(sum(${contribution.amountCents}), 0)` })
    .from(contribution)
    .where(and(eq(contribution.userId, userId), eq(contribution.goalId, row.id)));
  return { ...row, color: colorIndex(row.color), savedCents: Number(saved?.total ?? 0) };
}

export async function loadHome(
  db: Database,
  userId: string,
  cycle: Cycle,
  previousCycle: Cycle,
): Promise<HomeData> {
  const [rows, previousRows, setAside, budgets, pinned] = await Promise.all([
    db
      .select()
      .from(movement)
      .where(and(eq(movement.userId, userId), ...inRange(cycle)))
      .orderBy(desc(movement.date), desc(movement.id)),
    db
      .select({ type: movement.type, amountCents: movement.amountCents, date: movement.date })
      .from(movement)
      .where(and(eq(movement.userId, userId), eq(movement.type, 'expense'), ...inRange(previousCycle))),
    db
      .select({ total: sql<number>`coalesce(sum(${contribution.amountCents}), 0)` })
      .from(contribution)
      .where(
        and(
          eq(contribution.userId, userId),
          gte(contribution.date, cycle.start),
          lte(contribution.date, cycle.end),
        ),
      ),
    db
      .select({ categoryId: budget.categoryId, limitCents: budget.limitCents })
      .from(budget)
      .where(eq(budget.userId, userId)),
    pinnedGoal(db, userId),
  ]);
  return {
    cycle,
    previousCycle,
    movements: rows.map(toMovement),
    previousDaily: dailyExpenses(previousRows, previousCycle),
    setAsideCents: Number(setAside[0]?.total ?? 0),
    budgets,
    goal: pinned,
  };
}
