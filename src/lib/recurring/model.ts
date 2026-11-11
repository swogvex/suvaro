/**
 * Recurring shapes and pure helpers shared by the server and the islands (no Zod here; request validation
 * lives in `./schema.ts`). Amounts are positive integer cents; the sign comes from `type`.
 */
import type { MovementType } from '../movements/model';
import { isEnded, monthlyCents, type Frequency } from './schedule';

/** Templates per user (`03-architecture.md`). */
export const MAX_RECURRING = 50;

export const frequencies = ['monthly', 'weekly', 'yearly', 'every_n_days'] as const satisfies Frequency[];
export type RecurringMode = 'auto' | 'confirm';

export interface Recurring {
  id: string;
  type: MovementType;
  amountCents: number;
  categoryId: string | null;
  note: string;
  frequency: Frequency;
  intervalDays: number | null;
  anchorDate: string;
  endDate: string | null;
  mode: RecurringMode;
  /** Next date the cron creates (or asks about); past `endDate` once the template has ended. */
  nextDate: string;
}

/** The fields a template is created or edited with. */
export type RecurringFields = Omit<Recurring, 'id' | 'nextDate'>;

/** An occurrence of a `confirm` template waiting for the user. */
export interface PendingItem {
  id: string;
  recurringId: string;
  dueDate: string;
  type: MovementType;
  amountCents: number;
  categoryId: string | null;
  note: string;
}

export interface RecurringData {
  items: Recurring[];
  pending: PendingItem[];
}

export function ended(item: Pick<Recurring, 'endDate' | 'nextDate'>): boolean {
  return isEnded(item, item.nextDate);
}

export interface RecurringSummary {
  /** Monthly equivalent of every active income template that is not yearly. */
  incomeMonthlyCents: number;
  /** Monthly equivalent of every active expense template that is not yearly. */
  expenseMonthlyCents: number;
  /** Sum of the active yearly expense templates (once a year). */
  expenseYearlyCents: number;
}

/** The three summary cards of the Recurring view. Ended templates count for nothing. */
export function summarize(items: readonly Recurring[]): RecurringSummary {
  const summary: RecurringSummary = { incomeMonthlyCents: 0, expenseMonthlyCents: 0, expenseYearlyCents: 0 };
  for (const item of items) {
    if (ended(item)) continue;
    if (item.frequency === 'yearly') {
      if (item.type === 'expense') summary.expenseYearlyCents += item.amountCents;
      continue;
    }
    const monthly = monthlyCents(item.amountCents, item);
    if (item.type === 'income') summary.incomeMonthlyCents += monthly;
    else summary.expenseMonthlyCents += monthly;
  }
  return summary;
}

/** Active templates first by next date, ended ones last. */
export function compareRecurring(a: Recurring, b: Recurring): number {
  const endedA = ended(a);
  const endedB = ended(b);
  if (endedA !== endedB) return endedA ? 1 : -1;
  if (a.nextDate !== b.nextDate) return a.nextDate < b.nextDate ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
