/**
 * Recurring queries (server only). Every user-facing function takes the signed-in user's id and filters by
 * it, so a foreign id behaves exactly like a missing one. `materialiseTemplate` is shared with the daily
 * cron and is idempotent: it advances `next_date` with a compare-and-set inside the same transaction that
 * writes the movements (or pending rows), so a second run for the same day creates nothing.
 */
import { and, asc, count, eq, isNull, lte, or } from 'drizzle-orm';
import { addDays } from '../dates';
import type { Database } from '../db/client';
import { movement, profile, recurring, recurringPending } from '../db/schema';
import { ulid } from '../id';
import { MAX_MOVEMENTS, type Movement } from '../movements/model';
import { ownsCategory, toMovement } from '../movements/repo';
import {
  compareRecurring,
  MAX_RECURRING,
  type PendingItem,
  type Recurring,
  type RecurringData,
} from './model';
import { dueBetween, firstDue } from './schedule';
import type { RecurringCreateInput, RecurringUpdateInput } from './schema';

type Row = typeof recurring.$inferSelect;

/** Occurrences one template may create in one run; the rest follow on the next run. */
export const CATCH_UP_LIMIT = 60;

export function toRecurring(row: Row): Recurring {
  return {
    id: row.id,
    type: row.type,
    amountCents: row.amountCents,
    categoryId: row.categoryId,
    note: row.note,
    frequency: row.frequency,
    intervalDays: row.intervalDays,
    anchorDate: row.anchorDate,
    endDate: row.endDate,
    mode: row.mode,
    nextDate: row.nextDate,
  };
}

export async function countRecurring(db: Database, userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(recurring).where(eq(recurring.userId, userId));
  return row?.n ?? 0;
}

export async function listPending(db: Database, userId: string): Promise<PendingItem[]> {
  const rows = await db
    .select({
      id: recurringPending.id,
      recurringId: recurringPending.recurringId,
      dueDate: recurringPending.dueDate,
      type: recurring.type,
      amountCents: recurring.amountCents,
      categoryId: recurring.categoryId,
      note: recurring.note,
    })
    .from(recurringPending)
    .innerJoin(recurring, eq(recurring.id, recurringPending.recurringId))
    .where(eq(recurringPending.userId, userId))
    .orderBy(asc(recurringPending.dueDate), asc(recurringPending.id));
  return rows;
}

export async function countPending(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(recurringPending)
    .where(eq(recurringPending.userId, userId));
  return row?.n ?? 0;
}

export async function loadRecurring(db: Database, userId: string): Promise<RecurringData> {
  const [rows, pending] = await Promise.all([
    db.select().from(recurring).where(eq(recurring.userId, userId)),
    listPending(db, userId),
  ]);
  return { items: rows.map(toRecurring).sort(compareRecurring), pending };
}

async function getRow(db: Database, userId: string, id: string): Promise<Row | null> {
  const [row] = await db
    .select()
    .from(recurring)
    .where(and(eq(recurring.id, id), eq(recurring.userId, userId)))
    .limit(1);
  return row ?? null;
}

/**
 * Creates the movements (`auto`) or pending rows (`confirm`) due by `today` (the user's date) and advances
 * the template's next date. Returns how many occurrences it handled (0 when another run got there first).
 */
export async function materialiseTemplate(db: Database, row: Row, today: string): Promise<number> {
  if (row.nextDate > today) return 0;
  const { dates, next } = dueBetween(row, row.nextDate, today, CATCH_UP_LIMIT);
  if (next === row.nextDate) return 0;

  return db.transaction(async (tx) => {
    // Compare-and-set first: it takes the write lock, and a concurrent or repeated run matches no row.
    const claimed = await tx
      .update(recurring)
      .set({ nextDate: next })
      .where(and(eq(recurring.id, row.id), eq(recurring.nextDate, row.nextDate)))
      .returning({ id: recurring.id });
    if (claimed.length === 0 || dates.length === 0) return 0;

    if (row.mode === 'confirm') {
      await tx
        .insert(recurringPending)
        .values(dates.map((dueDate) => ({ id: ulid(), userId: row.userId, recurringId: row.id, dueDate })))
        .onConflictDoNothing();
      return dates.length;
    }

    const [total] = await tx.select({ n: count() }).from(movement).where(eq(movement.userId, row.userId));
    const room = Math.max(0, MAX_MOVEMENTS - (total?.n ?? 0));
    const fitting = dates.slice(0, room);
    if (fitting.length > 0) {
      await tx.insert(movement).values(
        fitting.map((date) => ({
          id: ulid(),
          userId: row.userId,
          type: row.type,
          amountCents: row.amountCents,
          categoryId: row.categoryId,
          date,
          note: row.note,
          recurringId: row.id,
        })),
      );
    }
    return fitting.length;
  });
}

export type RecurringError = 'INVALID_CATEGORY' | 'LIMIT_REACHED' | 'ID_TAKEN' | 'NOT_FOUND';
export type RecurringResult = { ok: true; recurring: Recurring } | { ok: false; error: RecurringError };

/**
 * Creates a template. Its first date is the first occurrence on or after today (dates before today are not
 * filled in); an occurrence due today is created at once, so the user sees it without waiting for the cron.
 * Sending the same create twice (a lost response) returns the existing row.
 */
export async function createRecurring(
  db: Database,
  userId: string,
  input: RecurringCreateInput,
  today: string,
): Promise<RecurringResult> {
  const [existing] = await db
    .select({ userId: recurring.userId })
    .from(recurring)
    .where(eq(recurring.id, input.id))
    .limit(1);
  if (existing) {
    const same = existing.userId === userId ? await getRow(db, userId, input.id) : null;
    return same ? { ok: true, recurring: toRecurring(same) } : { ok: false, error: 'ID_TAKEN' };
  }
  if (!(await ownsCategory(db, userId, input.categoryId))) return { ok: false, error: 'INVALID_CATEGORY' };
  if ((await countRecurring(db, userId)) >= MAX_RECURRING) return { ok: false, error: 'LIMIT_REACHED' };

  const nextDate = firstDue(input, input.anchorDate > today ? input.anchorDate : today);
  const [row] = await db
    .insert(recurring)
    .values({ ...input, userId, nextDate })
    .returning();
  if (!row) throw new Error('Recurring was not created');
  await materialiseTemplate(db, row, today);
  return { ok: true, recurring: toRecurring((await getRow(db, userId, row.id)) ?? row) };
}

/**
 * Edits a template. Changes apply from now on: movements already created stay as they are. If today's
 * occurrence was already handled, the new schedule starts tomorrow, so an edit never creates it twice.
 */
export async function updateRecurring(
  db: Database,
  userId: string,
  id: string,
  input: RecurringUpdateInput,
  today: string,
): Promise<RecurringResult> {
  const current = await getRow(db, userId, id);
  if (!current) return { ok: false, error: 'NOT_FOUND' };
  if (!(await ownsCategory(db, userId, input.categoryId))) return { ok: false, error: 'INVALID_CATEGORY' };

  const handledToday = current.nextDate > today;
  const from = handledToday ? addDays(today, 1) : today;
  const nextDate = firstDue(input, input.anchorDate > from ? input.anchorDate : from);
  const [row] = await db
    .update(recurring)
    .set({ ...input, nextDate })
    .where(and(eq(recurring.id, id), eq(recurring.userId, userId)))
    .returning();
  if (!row) return { ok: false, error: 'NOT_FOUND' };
  await materialiseTemplate(db, row, today);
  return { ok: true, recurring: toRecurring((await getRow(db, userId, id)) ?? row) };
}

/** Deletes a template and its pending confirmations; movements it created stay (no longer "recurring"). */
export async function deleteRecurring(db: Database, userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(recurring)
    .where(and(eq(recurring.id, id), eq(recurring.userId, userId)))
    .returning({ id: recurring.id });
  return deleted.length > 0;
}

export type ConfirmResult =
  { ok: true; movement: Movement } | { ok: false; error: 'NOT_FOUND' | 'LIMIT_REACHED' };

/** Confirms a pending occurrence: creates its movement and removes it from the waiting list, atomically. */
export async function confirmPending(db: Database, userId: string, id: string): Promise<ConfirmResult> {
  const [total] = await db.select({ n: count() }).from(movement).where(eq(movement.userId, userId));
  if ((total?.n ?? 0) >= MAX_MOVEMENTS) return { ok: false, error: 'LIMIT_REACHED' };
  return db.transaction(async (tx) => {
    const [pending] = await tx
      .delete(recurringPending)
      .where(and(eq(recurringPending.id, id), eq(recurringPending.userId, userId)))
      .returning();
    if (!pending) return { ok: false, error: 'NOT_FOUND' } as const;
    const [template] = await tx
      .select()
      .from(recurring)
      .where(and(eq(recurring.id, pending.recurringId), eq(recurring.userId, userId)))
      .limit(1);
    if (!template) return { ok: false, error: 'NOT_FOUND' } as const;
    const [row] = await tx
      .insert(movement)
      .values({
        id: ulid(),
        userId,
        type: template.type,
        amountCents: template.amountCents,
        categoryId: template.categoryId,
        date: pending.dueDate,
        note: template.note,
        recurringId: template.id,
      })
      .returning();
    if (!row) throw new Error('Movement was not created');
    return { ok: true, movement: toMovement(row) } as const;
  });
}

/** Skips a pending occurrence ("Skip this time"): nothing is created. */
export async function skipPending(db: Database, userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(recurringPending)
    .where(and(eq(recurringPending.id, id), eq(recurringPending.userId, userId)))
    .returning({ id: recurringPending.id });
  return deleted.length > 0;
}

/**
 * Templates any user may have due by `latestToday` (the latest calendar date on Earth right now), with the
 * owner's time zone. The cron filters each by the owner's own today.
 */
export async function dueTemplates(db: Database, latestToday: string) {
  return db
    .select({ row: recurring, timezone: profile.timezone })
    .from(recurring)
    .innerJoin(profile, eq(profile.userId, recurring.userId))
    .where(
      and(
        lte(recurring.nextDate, latestToday),
        or(isNull(recurring.endDate), lte(recurring.nextDate, recurring.endDate)),
      ),
    );
}
