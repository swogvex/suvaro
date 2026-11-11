/**
 * Browser side of Plan: thin calls to the API. The Plan island updates its own state first (optimistic),
 * calls these, and rolls back with an error toast when one fails (`ApiError`).
 */
import { ApiError, call } from '../movements/client';
import type { BudgetLimitRow, BudgetStatus, Contribution, Goal, PlanData } from './model';

export { ApiError };

/** The fields a goal is created or edited with. */
export type GoalFields = Pick<Goal, 'name' | 'icon' | 'color' | 'targetCents' | 'deadline' | 'pinned'>;

const fields = (goal: GoalFields): GoalFields => ({
  name: goal.name,
  icon: goal.icon,
  color: goal.color,
  targetCents: goal.targetCents,
  deadline: goal.deadline,
  pinned: goal.pinned,
});

async function read<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function createGoal(id: string, goal: GoalFields): Promise<Goal> {
  return (await read<{ goal: Goal }>(await call('POST', '/api/goals', { id, ...fields(goal) }))).goal;
}

export async function updateGoal(id: string, goal: GoalFields): Promise<Goal> {
  return (await read<{ goal: Goal }>(await call('PATCH', `/api/goals/${id}`, fields(goal)))).goal;
}

/** keepalive: sent when the Undo toast ends, possibly while the page is being left. */
export async function deleteGoal(id: string): Promise<void> {
  await call('DELETE', `/api/goals/${id}`, undefined, true);
}

export interface ContributionResponse {
  contribution: Contribution;
  goal: Goal;
}

export async function addContribution(
  goalId: string,
  contribution: Contribution,
): Promise<ContributionResponse> {
  const { id, amountCents, date } = contribution;
  return read(await call('POST', `/api/goals/${goalId}/contributions`, { id, amountCents, date }));
}

export async function updateContribution(contribution: Contribution): Promise<ContributionResponse> {
  const { id, amountCents, date } = contribution;
  return read(await call('PATCH', `/api/contributions/${id}`, { amountCents, date }));
}

export async function deleteContribution(id: string): Promise<Goal> {
  return (await read<{ goal: Goal }>(await call('DELETE', `/api/contributions/${id}`, undefined, true))).goal;
}

export interface BudgetsBody {
  globalCents: number | null;
  categories: { categoryId: string; limitCents: number }[];
}

export async function saveBudgets(body: BudgetsBody): Promise<BudgetLimitRow[]> {
  return (await read<{ budgets: BudgetLimitRow[] }>(await call('PUT', '/api/budgets', body))).budgets;
}

export async function fetchPlan(signal?: AbortSignal): Promise<PlanData> {
  const response = await fetch('/api/plan', signal ? { signal } : {});
  if (!response.ok) throw new ApiError(`HTTP_${response.status}`);
  return read(response);
}

export async function fetchBudgetStatus(signal?: AbortSignal): Promise<BudgetStatus> {
  const response = await fetch('/api/budgets', signal ? { signal } : {});
  if (!response.ok) throw new ApiError(`HTTP_${response.status}`);
  return read(response);
}
