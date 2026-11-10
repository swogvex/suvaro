/**
 * Movement shapes and pure helpers shared by the server and the islands (no Zod here: it would ship to the
 * browser; request validation lives in `./schema.ts`).
 * Amounts are positive integer cents; the sign comes from `type`. Income has no category.
 */

export const NOTE_MAX = 140;
/** Movements per user (`03-architecture.md`). */
export const MAX_MOVEMENTS = 50_000;

export type MovementType = 'income' | 'expense';

/** A movement as the API returns it and the islands keep it. */
export interface Movement {
  id: string;
  type: MovementType;
  amountCents: number;
  categoryId: string | null;
  date: string;
  note: string;
  /** Created by (or turned into) a recurring template. */
  recurring: boolean;
}

/** A category as the islands need it (names are already in the user's language). */
export interface CategoryOption {
  id: string;
  name: string;
  icon: string;
  color: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** Movements in the last 90 days, for "most used first". */
  uses: number;
}

/** Signed cents for totals: income adds, expense subtracts. */
export function signedCents(movement: Pick<Movement, 'type' | 'amountCents'>): number {
  return movement.type === 'income' ? movement.amountCents : -movement.amountCents;
}

export interface DayGroup {
  date: string;
  /** Income − expenses of the day, in cents. */
  totalCents: number;
  items: Movement[];
}

/** Newest first. Same day: the latest created (ULIDs sort by creation time) first. */
export function compareMovements(a: Movement, b: Movement): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Groups movements by day, newest day first, each with its signed total. */
export function groupByDay(movements: readonly Movement[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const movement of [...movements].sort(compareMovements)) {
    let group = groups.at(-1);
    if (!group || group.date !== movement.date) {
      group = { date: movement.date, totalCents: 0, items: [] };
      groups.push(group);
    }
    group.items.push(movement);
    group.totalCents += signedCents(movement);
  }
  return groups;
}

export interface Totals {
  count: number;
  incomeCents: number;
  expenseCents: number;
  /** Income − expenses. */
  netCents: number;
}

export function totals(movements: readonly Movement[]): Totals {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const movement of movements) {
    if (movement.type === 'income') incomeCents += movement.amountCents;
    else expenseCents += movement.amountCents;
  }
  return { count: movements.length, incomeCents, expenseCents, netCents: incomeCents - expenseCents };
}
