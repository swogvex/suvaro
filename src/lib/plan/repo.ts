/**
 * Plan queries (server only): goals, contributions, budgets and budget alerts. Every function takes the
 * signed-in user's id and filters by it, so a foreign id behaves exactly like a missing one.
 */
import { and, count, desc, eq, gte, inArray, isNull, lte, min, ne, sql } from 'drizzle-orm';
import type { Cycle } from '../cycle';
import type { Database } from '../db/client';
import { alertSeen, budget, category, contribution, goal, movement } from '../db/schema';
import { colorIndex, type CategoryColor } from '../default-categories';
import { ulid } from '../id';
import { budgetRows, newAlerts, alertKey } from './calc';
import {
  CONTRIBUTIONS_SHOWN,
  MAX_GOALS,
  type BudgetAlert,
  type BudgetLimitRow,
  type BudgetStatus,
  type Contribution,
  type Goal,
  type PlanData,
} from './model';
import type {
  BudgetsInput,
  ContributionCreateInput,
  ContributionUpdateInput,
  GoalCreateInput,
  GoalUpdateInput,
} from './schema';

type GoalRow = typeof goal.$inferSelect;

const colorOf = (index: number) => `c${index}` as CategoryColor;

function toContribution(row: typeof contribution.$inferSelect): Contribution {
  return { id: row.id, goalId: row.goalId, amountCents: row.amountCents, date: row.date };
}

/** Expenses per category in the cycle, and their total. */
async function cycleSpending(
  db: Database,
  userId: string,
  cycle: Cycle,
): Promise<{ spent: Record<string, number>; total: number }> {
  const rows = await db
    .select({ categoryId: movement.categoryId, total: sql<number>`sum(${movement.amountCents})` })
    .from(movement)
    .where(
      and(
        eq(movement.userId, userId),
        eq(movement.type, 'expense'),
        gte(movement.date, cycle.start),
        lte(movement.date, cycle.end),
      ),
    )
    .groupBy(movement.categoryId);
  const spent: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    const cents = Number(row.total ?? 0);
    total += cents;
    if (row.categoryId) spent[row.categoryId] = cents;
  }
  return { spent, total };
}

async function listBudgets(db: Database, userId: string): Promise<BudgetLimitRow[]> {
  return db
    .select({ id: budget.id, categoryId: budget.categoryId, limitCents: budget.limitCents })
    .from(budget)
    .where(eq(budget.userId, userId));
}

/** Every goal with what it has saved, its first contribution and the newest contributions. */
export async function listGoals(db: Database, userId: string): Promise<Goal[]> {
  const [goals, totals, recent] = await Promise.all([
    db.select().from(goal).where(eq(goal.userId, userId)).orderBy(goal.createdAt, goal.id),
    db
      .select({
        goalId: contribution.goalId,
        saved: sql<number>`sum(${contribution.amountCents})`,
        first: min(contribution.date),
      })
      .from(contribution)
      .where(eq(contribution.userId, userId))
      .groupBy(contribution.goalId),
    // The newest few per goal (window function: SQLite ≥ 3.25, libSQL has it).
    db.all<{ id: string; goal_id: string; amount_cents: number; date: string }>(sql`
      select id, goal_id, amount_cents, date from (
        select id, goal_id, amount_cents, date,
          row_number() over (partition by goal_id order by date desc, id desc) as n
        from ${contribution} where user_id = ${userId}
      ) where n <= ${CONTRIBUTIONS_SHOWN} order by date desc, id desc`),
  ]);
  const byGoal = new Map(totals.map((row) => [row.goalId, row]));
  return goals.map((row) => toGoal(row, byGoal.get(row.id), recent));
}

function toGoal(
  row: GoalRow,
  totals: { saved: number; first: string | null } | undefined,
  recent: readonly { id: string; goal_id: string; amount_cents: number; date: string }[],
): Goal {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: colorIndex(row.color),
    targetCents: row.targetCents,
    deadline: row.deadline,
    pinned: row.pinned,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    savedCents: Number(totals?.saved ?? 0),
    firstDate: totals?.first ?? null,
    contributions: recent
      .filter((c) => c.goal_id === row.id)
      .map((c) => ({ id: c.id, goalId: c.goal_id, amountCents: Number(c.amount_cents), date: c.date })),
  };
}

export async function getGoal(db: Database, userId: string, id: string): Promise<Goal | null> {
  return (await listGoals(db, userId)).find((g) => g.id === id) ?? null;
}

/** Everything the Plan page shows for the cycle. */
export async function loadPlan(db: Database, userId: string, cycle: Cycle): Promise<PlanData> {
  const [goals, budgets, spending] = await Promise.all([
    listGoals(db, userId),
    listBudgets(db, userId),
    cycleSpending(db, userId, cycle),
  ]);
  return { cycle, goals, budgets, spent: spending.spent, totalSpentCents: spending.total };
}

/** Category limits and spending in the cycle, for the editor's notice. */
export async function budgetStatus(db: Database, userId: string, cycle: Cycle): Promise<BudgetStatus> {
  const [budgets, spending] = await Promise.all([listBudgets(db, userId), cycleSpending(db, userId, cycle)]);
  const limits = budgets.flatMap((b) =>
    b.categoryId === null ? [] : [{ categoryId: b.categoryId, limitCents: b.limitCents }],
  );
  return { cycle, limits, spent: limits.length > 0 ? spending.spent : {} };
}

// ---------------------------------------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------------------------------------

export type GoalError = 'LIMIT_REACHED' | 'ID_TAKEN' | 'NOT_FOUND';
export type GoalResult = { ok: true; goal: Goal } | { ok: false; error: GoalError };

/** Pinning one goal unpins the others first (at most one is pinned: a unique index guards it). */
function unpinOthers(db: Database, userId: string, keepId: string) {
  return db
    .update(goal)
    .set({ pinned: false })
    .where(and(eq(goal.userId, userId), eq(goal.pinned, true), ne(goal.id, keepId)));
}

/** Completion follows what is saved: set when it reaches the target, cleared when it drops below. */
async function syncCompletion(db: Database, userId: string, goalId: string): Promise<void> {
  const [[row], [total]] = await Promise.all([
    db
      .select({ target: goal.targetCents, completedAt: goal.completedAt })
      .from(goal)
      .where(and(eq(goal.id, goalId), eq(goal.userId, userId)))
      .limit(1),
    db
      .select({ saved: sql<number>`coalesce(sum(${contribution.amountCents}), 0)` })
      .from(contribution)
      .where(and(eq(contribution.goalId, goalId), eq(contribution.userId, userId))),
  ]);
  if (!row) return;
  const reached = Number(total?.saved ?? 0) >= row.target;
  if (reached === (row.completedAt !== null)) return;
  await db
    .update(goal)
    .set({ completedAt: reached ? new Date() : null })
    .where(and(eq(goal.id, goalId), eq(goal.userId, userId)));
}

export async function createGoal(db: Database, userId: string, input: GoalCreateInput): Promise<GoalResult> {
  const [existing] = await db
    .select({ userId: goal.userId })
    .from(goal)
    .where(eq(goal.id, input.id))
    .limit(1);
  if (existing) {
    const same = existing.userId === userId ? await getGoal(db, userId, input.id) : null;
    return same ? { ok: true, goal: same } : { ok: false, error: 'ID_TAKEN' };
  }
  const [total] = await db.select({ n: count() }).from(goal).where(eq(goal.userId, userId));
  if ((total?.n ?? 0) >= MAX_GOALS) return { ok: false, error: 'LIMIT_REACHED' };

  const { color, ...values } = input;
  const insert = db.insert(goal).values({ ...values, color: colorOf(color), userId });
  if (input.pinned) await db.batch([unpinOthers(db, userId, input.id), insert]);
  else await insert;
  const created = await getGoal(db, userId, input.id);
  if (!created) throw new Error('Goal was not created');
  return { ok: true, goal: created };
}

export async function updateGoal(
  db: Database,
  userId: string,
  id: string,
  input: GoalUpdateInput,
): Promise<GoalResult> {
  const [row] = await db
    .select({ id: goal.id })
    .from(goal)
    .where(and(eq(goal.id, id), eq(goal.userId, userId)))
    .limit(1);
  if (!row) return { ok: false, error: 'NOT_FOUND' };
  const { color, ...values } = input;
  const update = db
    .update(goal)
    .set({ ...values, color: colorOf(color) })
    .where(and(eq(goal.id, id), eq(goal.userId, userId)));
  if (input.pinned) await db.batch([unpinOthers(db, userId, id), update]);
  else await update;
  await syncCompletion(db, userId, id);
  const updated = await getGoal(db, userId, id);
  return updated ? { ok: true, goal: updated } : { ok: false, error: 'NOT_FOUND' };
}

/** Deletes the goal and its contributions (cascade). False when it is not one of the user's goals. */
export async function deleteGoal(db: Database, userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(goal)
    .where(and(eq(goal.id, id), eq(goal.userId, userId)))
    .returning({ id: goal.id });
  return deleted.length > 0;
}

// ---------------------------------------------------------------------------------------------------------
// Contributions (set-aside: they lower "available" but are not expenses)
// ---------------------------------------------------------------------------------------------------------

export type ContributionError = 'ID_TAKEN' | 'NOT_FOUND';
export type ContributionResult =
  { ok: true; contribution: Contribution; goal: Goal } | { ok: false; error: ContributionError };

async function ownedContribution(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(contribution)
    .where(and(eq(contribution.id, id), eq(contribution.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function withGoal(db: Database, userId: string, row: typeof contribution.$inferSelect) {
  await syncCompletion(db, userId, row.goalId);
  const owner = await getGoal(db, userId, row.goalId);
  if (!owner) return { ok: false, error: 'NOT_FOUND' } as const;
  return { ok: true, contribution: toContribution(row), goal: owner } as const;
}

export async function createContribution(
  db: Database,
  userId: string,
  goalId: string,
  input: ContributionCreateInput,
): Promise<ContributionResult> {
  const [existing] = await db
    .select({ userId: contribution.userId })
    .from(contribution)
    .where(eq(contribution.id, input.id))
    .limit(1);
  if (existing) {
    const same = existing.userId === userId ? await ownedContribution(db, userId, input.id) : null;
    return same && same.goalId === goalId ? withGoal(db, userId, same) : { ok: false, error: 'ID_TAKEN' };
  }
  const [owner] = await db
    .select({ id: goal.id })
    .from(goal)
    .where(and(eq(goal.id, goalId), eq(goal.userId, userId)))
    .limit(1);
  if (!owner) return { ok: false, error: 'NOT_FOUND' };
  const [row] = await db
    .insert(contribution)
    .values({ ...input, goalId, userId })
    .returning();
  if (!row) throw new Error('Contribution was not created');
  return withGoal(db, userId, row);
}

export async function updateContribution(
  db: Database,
  userId: string,
  id: string,
  input: ContributionUpdateInput,
): Promise<ContributionResult> {
  if (!(await ownedContribution(db, userId, id))) return { ok: false, error: 'NOT_FOUND' };
  const [row] = await db
    .update(contribution)
    .set(input)
    .where(and(eq(contribution.id, id), eq(contribution.userId, userId)))
    .returning();
  return row ? withGoal(db, userId, row) : { ok: false, error: 'NOT_FOUND' };
}

/** Deletes a contribution; returns its goal afterwards, or null when it is not one of the user's. */
export async function deleteContribution(db: Database, userId: string, id: string): Promise<Goal | null> {
  const [row] = await db
    .delete(contribution)
    .where(and(eq(contribution.id, id), eq(contribution.userId, userId)))
    .returning({ goalId: contribution.goalId });
  if (!row) return null;
  await syncCompletion(db, userId, row.goalId);
  return getGoal(db, userId, row.goalId);
}

// ---------------------------------------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------------------------------------

export type BudgetsResult =
  { ok: true; budgets: BudgetLimitRow[] } | { ok: false; error: 'INVALID_CATEGORY' };

/**
 * Replaces every limit. Existing rows keep their id when their amount changes (so this cycle's alerts stay
 * de-duplicated); categories left out lose their budget. No rollover: limits are per cycle.
 */
export async function saveBudgets(db: Database, userId: string, input: BudgetsInput): Promise<BudgetsResult> {
  const ids = input.categories.map((row) => row.categoryId);
  if (ids.length > 0) {
    const owned = await db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.userId, userId), inArray(category.id, ids), eq(category.archived, false)));
    if (owned.length !== ids.length) return { ok: false, error: 'INVALID_CATEGORY' };
  }

  const current = await listBudgets(db, userId);
  const byCategory = new Map(current.map((row) => [row.categoryId, row]));
  const wanted = new Map<string | null, number>(
    input.categories.map((row) => [row.categoryId, row.limitCents]),
  );
  if (input.globalCents !== null) wanted.set(null, input.globalCents);

  const removed = current.filter((row) => !wanted.has(row.categoryId)).map((row) => row.id);
  const statements = [];
  if (removed.length > 0) {
    statements.push(db.delete(budget).where(and(eq(budget.userId, userId), inArray(budget.id, removed))));
  }
  for (const [categoryId, limitCents] of wanted) {
    const existing = byCategory.get(categoryId);
    if (!existing) statements.push(db.insert(budget).values({ id: ulid(), userId, categoryId, limitCents }));
    else if (existing.limitCents !== limitCents) {
      statements.push(
        db
          .update(budget)
          .set({ limitCents })
          .where(and(eq(budget.id, existing.id), eq(budget.userId, userId))),
      );
    }
  }
  const [first, ...rest] = statements;
  if (first) await db.batch([first, ...rest]);
  return { ok: true, budgets: await listBudgets(db, userId) };
}

// ---------------------------------------------------------------------------------------------------------
// Alerts: each category budget alerts once per cycle at 80 % and once at 100 %.
// ---------------------------------------------------------------------------------------------------------

/**
 * Records the alerts the cycle has reached and not recorded yet, and returns those (to show as a toast).
 * Safe to call concurrently: the unique index keeps one row per alert, and only the request that inserted
 * it gets it back.
 */
export async function syncAlerts(db: Database, userId: string, cycle: Cycle): Promise<BudgetAlert[]> {
  const budgets = (await listBudgets(db, userId)).filter((b) => b.categoryId !== null);
  if (budgets.length === 0) return [];
  const [spending, seenRows] = await Promise.all([
    cycleSpending(db, userId, cycle),
    db
      .select({ budgetId: alertSeen.budgetId, level: alertSeen.level })
      .from(alertSeen)
      .where(and(eq(alertSeen.userId, userId), eq(alertSeen.cycleStart, cycle.start))),
  ]);
  const seen = new Set(seenRows.map((row) => alertKey(row.budgetId, row.level)));
  const pending = newAlerts(budgetRows(budgets, spending.spent), seen);
  if (pending.length === 0) return [];
  const inserted = await db
    .insert(alertSeen)
    .values(
      pending.map((alert) => ({
        id: ulid(),
        userId,
        budgetId: alert.budgetId,
        cycleStart: cycle.start,
        level: alert.level,
      })),
    )
    .onConflictDoNothing()
    .returning({ budgetId: alertSeen.budgetId, level: alertSeen.level });
  const fresh = new Set(inserted.map((row) => alertKey(row.budgetId, row.level)));
  return pending.filter((alert) => fresh.has(alertKey(alert.budgetId, alert.level)));
}

/** Alerts of the cycle not read on Plan yet (the dot on the Plan tab). */
export async function unreadAlerts(db: Database, userId: string, cycle: Cycle): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(alertSeen)
    .where(
      and(eq(alertSeen.userId, userId), eq(alertSeen.cycleStart, cycle.start), isNull(alertSeen.readAt)),
    );
  return row?.n ?? 0;
}

/** Opening Plan reads the cycle's alerts. */
export async function markAlertsRead(db: Database, userId: string, cycle: Cycle): Promise<void> {
  await db
    .update(alertSeen)
    .set({ readAt: new Date() })
    .where(
      and(eq(alertSeen.userId, userId), eq(alertSeen.cycleStart, cycle.start), isNull(alertSeen.readAt)),
    );
}

/** Newest contributions first, for tests and exports. */
export async function listContributions(
  db: Database,
  userId: string,
  goalId: string,
): Promise<Contribution[]> {
  const rows = await db
    .select()
    .from(contribution)
    .where(and(eq(contribution.userId, userId), eq(contribution.goalId, goalId)))
    .orderBy(desc(contribution.date), desc(contribution.id));
  return rows.map(toContribution);
}
