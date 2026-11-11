/**
 * The demo's data and its API, in memory (`/demo`, `/es/demo`). Pure TypeScript: the demo pages use it on the
 * server for the first paint, and the browser uses the same state to answer the islands' `/api/*` calls
 * (`./client.ts` swaps `fetch`), so the demo makes no network request and stores nothing.
 *
 * Every answer has the shape of the real endpoint, computed with the same pure functions the server's
 * repositories use (`calc.ts`, `stats/calc.ts`, `recurring/schedule.ts`).
 */
import { dailyExpenses } from '../calc';
import { cycleOf, shiftCycle, type Cycle } from '../cycle';
import { addDays, monthEnd, monthOf, monthStart } from '../dates';
import type { HomeData } from '../home/model';
import { chooseCycle } from '../home/cycle-param';
import { ulid } from '../id';
import { parseAmount } from '../money';
import { dateRange, parseFilters, type Filters } from '../movements/filters';
import type { CategoryOption, Movement } from '../movements/model';
import type { BudgetLimitRow, BudgetStatus, Contribution, Goal, PlanData } from '../plan/model';
import { compareRecurring, type PendingItem, type Recurring, type RecurringData } from '../recurring/model';
import { firstDue, nextAfter } from '../recurring/schedule';
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
} from '../stats/calc';
import type { StatsData } from '../stats/model';
import { choosePeriod, shiftPeriod, type PeriodChoice } from '../stats/period';

export type ColorIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface DemoCategory {
  id: string;
  name: string;
  icon: string;
  color: ColorIndex;
}

export interface DemoGoal {
  id: string;
  name: string;
  icon: string;
  color: ColorIndex;
  targetCents: number;
  deadline: string | null;
  pinned: boolean;
  completedAt: string | null;
}

export interface DemoPending {
  id: string;
  recurringId: string;
  dueDate: string;
}

/** Everything the demo shows. Serialised into the page once; the browser keeps changing its copy. */
export interface DemoState {
  today: string;
  locale: 'en' | 'es';
  currency: string;
  startDay: number;
  weekStart: 1 | 7;
  name: string;
  categories: DemoCategory[];
  movements: Movement[];
  budgets: BudgetLimitRow[];
  goals: DemoGoal[];
  contributions: Contribution[];
  recurring: Recurring[];
  pending: DemoPending[];
}

const newestFirst = (a: Movement, b: Movement) =>
  a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1;

const inRange = (date: string, from: string | null, to: string | null) =>
  (from === null || date >= from) && (to === null || date <= to);

// -------------------------------------------------------------------------------------------- reads

export function categoryOptions(state: DemoState): CategoryOption[] {
  const since = addDays(state.today, -90);
  return state.categories.map((category) => ({
    ...category,
    uses: state.movements.filter((m) => m.categoryId === category.id && m.date >= since).length,
  }));
}

export function homeData(state: DemoState, cycle: Cycle, previousCycle: Cycle): HomeData {
  const pinned = state.goals.find((goal) => goal.pinned);
  return {
    cycle,
    previousCycle,
    movements: state.movements.filter((m) => inRange(m.date, cycle.start, cycle.end)).sort(newestFirst),
    previousDaily: dailyExpenses(
      state.movements.filter(
        (m) => m.type === 'expense' && inRange(m.date, previousCycle.start, previousCycle.end),
      ),
      previousCycle,
    ),
    setAsideCents: state.contributions
      .filter((c) => inRange(c.date, cycle.start, cycle.end))
      .reduce((sum, c) => sum + c.amountCents, 0),
    budgets: state.budgets.map(({ categoryId, limitCents }) => ({ categoryId, limitCents })),
    goal: pinned
      ? {
          id: pinned.id,
          name: pinned.name,
          icon: pinned.icon,
          color: pinned.color,
          targetCents: pinned.targetCents,
          deadline: pinned.deadline,
          savedCents: savedFor(state, pinned.id),
        }
      : null,
  };
}

function matches(state: DemoState, filters: Filters): (m: Movement) => boolean {
  const range = dateRange(filters, state.today);
  return (m) =>
    inRange(m.date, range.from, range.to) &&
    (filters.type === null || m.type === filters.type) &&
    (filters.categories.length === 0 ||
      (m.categoryId !== null && filters.categories.includes(m.categoryId))) &&
    (filters.minCents === null || m.amountCents >= filters.minCents) &&
    (filters.maxCents === null || m.amountCents <= filters.maxCents);
}

export function monthPage(state: DemoState, filters: Filters, month: string) {
  const all = state.movements.filter(matches(state, filters)).sort(newestFirst);
  const items = all.filter((m) => inRange(m.date, monthStart(month), monthEnd(month)));
  const older = all.find((m) => m.date < monthStart(month));
  return { month, items, next: older ? monthOf(older.date) : null };
}

export function firstMonthPage(state: DemoState, filters: Filters) {
  const all = state.movements.filter(matches(state, filters)).sort(newestFirst);
  const summary = {
    count: all.length,
    netCents: all.reduce((sum, m) => sum + (m.type === 'income' ? m.amountCents : -m.amountCents), 0),
  };
  const newest = all[0];
  const page = newest
    ? monthPage(state, filters, monthOf(newest.date))
    : { month: null, items: [], next: null };
  return { ...page, summary };
}

export function search(state: DemoState, query: string): Movement[] {
  const text = query.trim().slice(0, 60).toLowerCase();
  if (!text) return [];
  const cents = parseAmount(text, state.locale);
  const names = new Map(state.categories.map((c) => [c.id, c.name.toLowerCase()]));
  return state.movements
    .filter(
      (m) =>
        m.note.toLowerCase().includes(text) ||
        (m.categoryId !== null && (names.get(m.categoryId) ?? '').includes(text)) ||
        (cents !== null && cents > 0 && m.amountCents === cents),
    )
    .sort(newestFirst)
    .slice(0, 20);
}

const settingsOf = (state: DemoState) => ({ startDay: state.startDay, weekStart: state.weekStart });

export function statsData(state: DemoState, { period, previous }: PeriodChoice): StatsData {
  const settings = settingsOf(state);
  const lastBar = lastBarCycle(period, state.today, settings.startDay);
  const firstBar = shiftCycle(lastBar, 1 - MONTH_BARS, settings.startDay);
  const oldestTrend = shiftPeriod(period, -TREND_PERIODS, settings);
  const from = oldestTrend.start < firstBar.start ? oldestTrend.start : firstBar.start;
  const to = period.end > lastBar.end ? period.end : lastBar.end;
  const rows = state.movements.filter((m) => inRange(m.date, from, to));
  const first = state.movements.reduce<string | null>(
    (min, m) => (min === null || m.date < min ? m.date : min),
    null,
  );
  const months = monthBars(rows, lastBar, settings.startDay, state.today);
  return {
    period,
    previous,
    totals: sums(rows, period),
    categories: categoryComparison(rows, period, previous, state.today),
    trends: categoryTrends(rows, period, settings, state.today, first),
    savingsRate: savingsRate(months),
    months,
    averageIncomeCents: averageIncome(months),
    savings: savingsSeries(rows, period, state.today, settings.startDay),
    movements: state.movements.filter((m) => inRange(m.date, period.start, period.end)).sort(newestFirst),
  };
}

export const currentCycleOf = (state: DemoState): Cycle => cycleOf(state.today, state.startDay);

function savedFor(state: DemoState, goalId: string): number {
  return state.contributions.filter((c) => c.goalId === goalId).reduce((sum, c) => sum + c.amountCents, 0);
}

function toGoal(state: DemoState, goal: DemoGoal): Goal {
  const own = state.contributions
    .filter((c) => c.goalId === goal.id)
    .sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1));
  return {
    ...goal,
    savedCents: own.reduce((sum, c) => sum + c.amountCents, 0),
    firstDate: own.at(-1)?.date ?? null,
    contributions: own.slice(0, 10),
  };
}

function spending(state: DemoState, cycle: Cycle) {
  const spent: Record<string, number> = {};
  let total = 0;
  for (const m of state.movements) {
    if (m.type !== 'expense' || !inRange(m.date, cycle.start, cycle.end)) continue;
    total += m.amountCents;
    if (m.categoryId) spent[m.categoryId] = (spent[m.categoryId] ?? 0) + m.amountCents;
  }
  return { spent, total };
}

export function planData(state: DemoState): PlanData {
  const cycle = currentCycleOf(state);
  const { spent, total } = spending(state, cycle);
  return {
    cycle,
    goals: state.goals.map((goal) => toGoal(state, goal)),
    budgets: state.budgets,
    spent,
    totalSpentCents: total,
  };
}

export function budgetStatus(state: DemoState): BudgetStatus {
  const cycle = currentCycleOf(state);
  const limits = state.budgets.flatMap((b) =>
    b.categoryId === null ? [] : [{ categoryId: b.categoryId, limitCents: b.limitCents }],
  );
  return { cycle, limits, spent: limits.length > 0 ? spending(state, cycle).spent : {} };
}

export function recurringData(state: DemoState): RecurringData {
  const byId = new Map(state.recurring.map((r) => [r.id, r]));
  const pending: PendingItem[] = state.pending.flatMap((p) => {
    const template = byId.get(p.recurringId);
    return template
      ? [
          {
            id: p.id,
            recurringId: p.recurringId,
            dueDate: p.dueDate,
            type: template.type,
            amountCents: template.amountCents,
            categoryId: template.categoryId,
            note: template.note,
          },
        ]
      : [];
  });
  return { items: [...state.recurring].sort(compareRecurring), pending };
}

// ------------------------------------------------------------------------------------------- writes

type Body = Record<string, unknown>;

function syncCompletion(state: DemoState, goalId: string): void {
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal) return;
  const reached = savedFor(state, goalId) >= goal.targetCents;
  if (reached && !goal.completedAt) goal.completedAt = new Date().toISOString();
  if (!reached) goal.completedAt = null;
}

function movementFrom(id: string, body: Body, recurring = false): Movement {
  return {
    id,
    type: body['type'] === 'income' ? 'income' : 'expense',
    amountCents: Number(body['amountCents']),
    categoryId: body['type'] === 'income' ? null : ((body['categoryId'] as string | null) ?? null),
    date: String(body['date']),
    note: String(body['note'] ?? ''),
    recurring,
  };
}

/** Creates today's occurrence of a new or edited template, like the server does, then moves `nextDate` on. */
function materialiseToday(state: DemoState, template: Recurring): void {
  if (template.nextDate !== state.today) return;
  if (template.mode === 'auto') {
    state.movements.push(
      movementFrom(ulid(), { ...template, date: template.nextDate } as unknown as Body, true),
    );
  } else {
    state.pending.push({ id: ulid(), recurringId: template.id, dueDate: template.nextDate });
  }
  template.nextDate = nextAfter(template, template.nextDate) ?? addDays(template.endDate ?? state.today, 1);
}

// --------------------------------------------------------------------------------------------- router

function json(status: number, body?: unknown): Response {
  return body === undefined
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const notFound = () => json(404, { error: 'NOT_FOUND' });
const badQuery = () => json(400, { error: 'INVALID_QUERY' });

/**
 * Answers one `/api/*` request from the in-memory state, like the real endpoint would. Anything the demo does
 * not offer (settings, account, auth) answers 403 DEMO, so an island shows its usual error toast.
 */
export function handleDemoRequest(state: DemoState, url: URL, method: string, body: Body | null): Response {
  const path = url.pathname.replace(/^\/api\//, '').split('/');
  const [root, id, sub] = path;
  const params = url.searchParams;

  if (root === 'home' && method === 'GET') {
    const choice = chooseCycle(params.get('cycle'), state.startDay, state.today);
    return choice ? json(200, homeData(state, choice.cycle, choice.previousCycle)) : badQuery();
  }

  if (root === 'stats' && method === 'GET') {
    const choice = choosePeriod(params, settingsOf(state), state.today);
    return choice ? json(200, statsData(state, choice)) : badQuery();
  }

  if (root === 'search' && method === 'GET')
    return json(200, { movements: search(state, params.get('q') ?? '') });

  if (root === 'movements') {
    if (!id && method === 'GET') {
      const { filters, valid } = parseFilters(params);
      if (!valid) return badQuery();
      const month = params.get('month');
      return json(200, month ? monthPage(state, filters, month) : firstMonthPage(state, filters));
    }
    if (!id && method === 'POST' && body) {
      const movementId = String(body['id']);
      const existing = state.movements.find((m) => m.id === movementId);
      if (existing) return json(201, { movement: existing, alert: null });
      const created = movementFrom(movementId, body, body['repeat'] === true);
      state.movements.push(created);
      return json(201, { movement: created, alert: null });
    }
    const index = state.movements.findIndex((m) => m.id === id);
    if (index < 0) return notFound();
    if (method === 'PATCH' && body) {
      const before = state.movements[index] as Movement;
      const updated = { ...movementFrom(before.id, body, before.recurring) };
      state.movements[index] = updated;
      return json(200, { movement: updated, alert: null });
    }
    if (method === 'DELETE') {
      state.movements.splice(index, 1);
      return json(204);
    }
  }

  if (root === 'plan' && method === 'GET') return json(200, planData(state));

  if (root === 'budgets') {
    if (method === 'GET') return json(200, budgetStatus(state));
    if (method === 'PUT' && body) {
      const wanted = new Map<string | null, number>(
        ((body['categories'] as { categoryId: string; limitCents: number }[]) ?? []).map((row) => [
          row.categoryId,
          row.limitCents,
        ]),
      );
      if (typeof body['globalCents'] === 'number') wanted.set(null, body['globalCents']);
      const byCategory = new Map(state.budgets.map((b) => [b.categoryId, b]));
      state.budgets = [...wanted].map(([categoryId, limitCents]) => ({
        id: byCategory.get(categoryId)?.id ?? ulid(),
        categoryId,
        limitCents,
      }));
      return json(200, { budgets: state.budgets });
    }
  }

  if (root === 'goals') {
    if (!id && method === 'POST' && body) {
      const goal: DemoGoal = {
        id: String(body['id']),
        name: String(body['name']),
        icon: String(body['icon']),
        color: Number(body['color']) as ColorIndex,
        targetCents: Number(body['targetCents']),
        deadline: (body['deadline'] as string | null) ?? null,
        pinned: body['pinned'] === true,
        completedAt: null,
      };
      if (goal.pinned) for (const other of state.goals) other.pinned = false;
      state.goals.push(goal);
      return json(201, { goal: toGoal(state, goal) });
    }
    const goal = state.goals.find((g) => g.id === id);
    if (!goal) return notFound();
    if (sub === 'contributions' && method === 'POST' && body) {
      const contribution: Contribution = {
        id: String(body['id']),
        goalId: goal.id,
        amountCents: Number(body['amountCents']),
        date: String(body['date']),
      };
      state.contributions.push(contribution);
      syncCompletion(state, goal.id);
      return json(201, { contribution, goal: toGoal(state, goal) });
    }
    if (method === 'PATCH' && body) {
      if (body['pinned'] === true) for (const other of state.goals) other.pinned = false;
      Object.assign(goal, {
        name: String(body['name']),
        icon: String(body['icon']),
        color: Number(body['color']) as ColorIndex,
        targetCents: Number(body['targetCents']),
        deadline: (body['deadline'] as string | null) ?? null,
        pinned: body['pinned'] === true,
      });
      syncCompletion(state, goal.id);
      return json(200, { goal: toGoal(state, goal) });
    }
    if (method === 'DELETE') {
      state.goals = state.goals.filter((g) => g.id !== goal.id);
      state.contributions = state.contributions.filter((c) => c.goalId !== goal.id);
      return json(204);
    }
  }

  if (root === 'contributions') {
    const contribution = state.contributions.find((c) => c.id === id);
    if (!contribution) return notFound();
    const goal = state.goals.find((g) => g.id === contribution.goalId);
    if (!goal) return notFound();
    if (method === 'PATCH' && body) {
      contribution.amountCents = Number(body['amountCents']);
      contribution.date = String(body['date']);
      syncCompletion(state, goal.id);
      return json(200, { contribution, goal: toGoal(state, goal) });
    }
    if (method === 'DELETE') {
      state.contributions = state.contributions.filter((c) => c.id !== contribution.id);
      syncCompletion(state, goal.id);
      return json(200, { goal: toGoal(state, goal) });
    }
  }

  if (root === 'recurring') {
    if (!id && method === 'GET') return json(200, recurringData(state));
    const fields = (source: Body) => ({
      type: source['type'] === 'income' ? ('income' as const) : ('expense' as const),
      amountCents: Number(source['amountCents']),
      categoryId: source['type'] === 'income' ? null : ((source['categoryId'] as string | null) ?? null),
      note: String(source['note'] ?? ''),
      frequency: source['frequency'] as Recurring['frequency'],
      intervalDays: (source['intervalDays'] as number | null) ?? null,
      anchorDate: String(source['anchorDate']),
      endDate: (source['endDate'] as string | null) ?? null,
      mode: source['mode'] === 'confirm' ? ('confirm' as const) : ('auto' as const),
    });
    if (!id && method === 'POST' && body) {
      const values = fields(body);
      const from = values.anchorDate > state.today ? values.anchorDate : state.today;
      const template: Recurring = { id: String(body['id']), ...values, nextDate: firstDue(values, from) };
      state.recurring.push(template);
      materialiseToday(state, template);
      return json(201, { recurring: template });
    }
    const template = state.recurring.find((r) => r.id === id);
    if (!template) return notFound();
    if (method === 'PATCH' && body) {
      const values = fields(body);
      const from = template.nextDate > state.today ? addDays(state.today, 1) : state.today;
      Object.assign(template, values, {
        nextDate: firstDue(values, values.anchorDate > from ? values.anchorDate : from),
      });
      materialiseToday(state, template);
      return json(200, { recurring: template });
    }
    if (method === 'DELETE') {
      state.recurring = state.recurring.filter((r) => r.id !== template.id);
      state.pending = state.pending.filter((p) => p.recurringId !== template.id);
      for (const m of state.movements) if (m.id === template.id) m.recurring = false;
      return json(204);
    }
  }

  if (root === 'recurring-pending') {
    const pending = state.pending.find((p) => p.id === id);
    if (!pending) return notFound();
    state.pending = state.pending.filter((p) => p.id !== pending.id);
    if (method === 'DELETE') return json(204);
    const template = state.recurring.find((r) => r.id === pending.recurringId);
    if (method === 'POST' && template) {
      const created = movementFrom(ulid(), { ...template, date: pending.dueDate } as unknown as Body, true);
      state.movements.push(created);
      return json(201, { movement: created, alert: null });
    }
  }

  return json(403, { error: 'DEMO' });
}
