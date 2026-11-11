/**
 * Movement queries (server only). Every function takes the signed-in user's id and filters by it, so a
 * user can never read or change another user's rows: a foreign id behaves exactly like a missing one.
 */
import { and, count, desc, eq, gte, inArray, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import { addDays, addMonths, monthEnd, monthOf, monthStart } from '../dates';
import type { Database } from '../db/client';
import { category, movement, recurring } from '../db/schema';
import { colorIndex } from '../default-categories';
import { parseAmount } from '../money';
import type { Locale } from '../../i18n';
import { dateRange, type Filters } from './filters';
import { MAX_MOVEMENTS, type CategoryOption, type Movement } from './model';
import type { CreateInput, UpdateInput } from './schema';

type Row = typeof movement.$inferSelect;

export function toMovement(row: Row): Movement {
  return {
    id: row.id,
    type: row.type,
    amountCents: row.amountCents,
    categoryId: row.categoryId,
    date: row.date,
    note: row.note,
    recurring: row.recurringId !== null,
  };
}

/** Categories in their sort order, with how often each was used in the last 90 days. */
export async function listCategories(db: Database, userId: string, today: string): Promise<CategoryOption[]> {
  const since = addDays(today, -90);
  const usage = db
    .select({ categoryId: movement.categoryId, uses: count().as('uses') })
    .from(movement)
    .where(and(eq(movement.userId, userId), gte(movement.date, since)))
    .groupBy(movement.categoryId)
    .as('usage');
  const rows = await db
    .select({
      id: category.id,
      name: category.name,
      icon: category.icon,
      color: category.color,
      uses: sql<number>`coalesce(${usage.uses}, 0)`,
    })
    .from(category)
    .leftJoin(usage, eq(usage.categoryId, category.id))
    .where(and(eq(category.userId, userId), eq(category.archived, false)))
    .orderBy(category.sort, category.name);
  return rows.map((row) => ({ ...row, color: colorIndex(row.color), uses: Number(row.uses) }));
}

/** SQL conditions for the user's filters (the period is resolved against the user's today). */
function filterConditions(userId: string, filters: Filters, today: string): SQL[] {
  const conditions: SQL[] = [eq(movement.userId, userId)];
  const range = dateRange(filters, today);
  if (range.from) conditions.push(gte(movement.date, range.from));
  if (range.to) conditions.push(lte(movement.date, range.to));
  if (filters.type) conditions.push(eq(movement.type, filters.type));
  if (filters.categories.length > 0) conditions.push(inArray(movement.categoryId, filters.categories));
  if (filters.minCents !== null) conditions.push(gte(movement.amountCents, filters.minCents));
  if (filters.maxCents !== null) conditions.push(lte(movement.amountCents, filters.maxCents));
  return conditions;
}

const maxDate = sql<string | null>`max(${movement.date})`;

/** The newest month with a matching movement (where the list starts), or null when nothing matches. */
export async function latestMonth(
  db: Database,
  userId: string,
  filters: Filters,
  today: string,
): Promise<string | null> {
  const [row] = await db
    .select({ date: maxDate })
    .from(movement)
    .where(and(...filterConditions(userId, filters, today)));
  return row?.date ? monthOf(row.date) : null;
}

export interface MonthPage {
  /** `YYYY-MM`. */
  month: string;
  items: Movement[];
  /** The next older month with matching movements, or null at the end. */
  next: string | null;
}

/** One month of matching movements, newest first, plus the next older month that has any. */
export async function listMonth(
  db: Database,
  userId: string,
  filters: Filters,
  today: string,
  month: string,
): Promise<MonthPage> {
  const conditions = filterConditions(userId, filters, today);
  const [rows, older] = await Promise.all([
    db
      .select()
      .from(movement)
      .where(and(...conditions, gte(movement.date, monthStart(month)), lte(movement.date, monthEnd(month))))
      .orderBy(desc(movement.date), desc(movement.id)),
    db
      .select({ date: maxDate })
      .from(movement)
      .where(and(...conditions, lt(movement.date, monthStart(month)))),
  ]);
  const olderDate = older[0]?.date;
  return { month, items: rows.map(toMovement), next: olderDate ? monthOf(olderDate) : null };
}

export interface Summary {
  count: number;
  /** Income − expenses of every matching movement. */
  netCents: number;
}

export async function summarize(
  db: Database,
  userId: string,
  filters: Filters,
  today: string,
): Promise<Summary> {
  const [row] = await db
    .select({
      count: count(),
      net: sql<number>`coalesce(sum(case when ${movement.type} = 'income' then ${movement.amountCents} else -${movement.amountCents} end), 0)`,
    })
    .from(movement)
    .where(and(...filterConditions(userId, filters, today)));
  return { count: row?.count ?? 0, netCents: Number(row?.net ?? 0) };
}

export async function getMovement(db: Database, userId: string, id: string): Promise<Movement | null> {
  const [row] = await db
    .select()
    .from(movement)
    .where(and(eq(movement.id, id), eq(movement.userId, userId)))
    .limit(1);
  return row ? toMovement(row) : null;
}

export type WriteError = 'INVALID_CATEGORY' | 'LIMIT_REACHED' | 'ID_TAKEN' | 'NOT_FOUND';
export type WriteResult = { ok: true; movement: Movement } | { ok: false; error: WriteError };

/** The category must be one of the user's own, not archived. */
export async function ownsCategory(
  db: Database,
  userId: string,
  categoryId: string | null,
): Promise<boolean> {
  if (categoryId === null) return true;
  const [row] = await db
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.id, categoryId), eq(category.userId, userId), eq(category.archived, false)))
    .limit(1);
  return Boolean(row);
}

/**
 * Creates a movement with the client's ULID. With `repeat`, it also creates a monthly recurring template
 * (same day each month, clamped to the month's end) that the daily cron materialises from next month.
 * Sending the same create twice (a lost response) returns the existing row.
 */
export async function createMovement(db: Database, userId: string, input: CreateInput): Promise<WriteResult> {
  const [existing] = await db
    .select({ userId: movement.userId })
    .from(movement)
    .where(eq(movement.id, input.id))
    .limit(1);
  if (existing) {
    const same = existing.userId === userId ? await getMovement(db, userId, input.id) : null;
    return same ? { ok: true, movement: same } : { ok: false, error: 'ID_TAKEN' };
  }
  if (!(await ownsCategory(db, userId, input.categoryId))) return { ok: false, error: 'INVALID_CATEGORY' };
  const [total] = await db.select({ n: count() }).from(movement).where(eq(movement.userId, userId));
  if ((total?.n ?? 0) >= MAX_MOVEMENTS) return { ok: false, error: 'LIMIT_REACHED' };

  const { id, repeat, ...values } = input;
  const recurringId = repeat ? id : null;
  const insertMovement = db
    .insert(movement)
    .values({ id, userId, ...values, recurringId })
    .returning();
  const rows = repeat
    ? (
        await db.batch([
          db.insert(recurring).values({
            id,
            userId,
            type: values.type,
            amountCents: values.amountCents,
            categoryId: values.categoryId,
            note: values.note,
            frequency: 'monthly',
            anchorDate: values.date,
            mode: 'auto',
            nextDate: addMonths(values.date, 1),
          }),
          insertMovement,
        ])
      )[1]
    : await insertMovement;
  const [row] = rows;
  if (!row) throw new Error('Movement was not created');
  return { ok: true, movement: toMovement(row) };
}

export async function updateMovement(
  db: Database,
  userId: string,
  id: string,
  input: UpdateInput,
): Promise<WriteResult> {
  if (!(await getMovement(db, userId, id))) return { ok: false, error: 'NOT_FOUND' };
  if (!(await ownsCategory(db, userId, input.categoryId))) return { ok: false, error: 'INVALID_CATEGORY' };
  const [row] = await db
    .update(movement)
    .set(input)
    .where(and(eq(movement.id, id), eq(movement.userId, userId)))
    .returning();
  return row ? { ok: true, movement: toMovement(row) } : { ok: false, error: 'NOT_FOUND' };
}

/** Hard delete. Returns false when the id is not one of the user's movements. */
export async function deleteMovement(db: Database, userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(movement)
    .where(and(eq(movement.id, id), eq(movement.userId, userId)))
    .returning({ id: movement.id });
  return deleted.length > 0;
}

export const SEARCH_LIMIT = 20;
export const SEARCH_MAX_LENGTH = 60;

/** Escapes LIKE wildcards so "50%" searches for the text "50%". */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * Searches the user's movements by note, category name or exact amount ("23,85" in Spanish), newest first,
 * at most 20.
 */
export async function searchMovements(
  db: Database,
  userId: string,
  query: string,
  locale: Locale,
): Promise<Movement[]> {
  const text = query.trim().slice(0, SEARCH_MAX_LENGTH);
  if (!text) return [];
  const pattern = likePattern(text.toLowerCase());
  const matches: SQL[] = [
    sql`lower(${movement.note}) like ${pattern} escape '\\'`,
    sql`lower(${category.name}) like ${pattern} escape '\\'`,
  ];
  const cents = parseAmount(text, locale);
  if (cents !== null && cents > 0) matches.push(eq(movement.amountCents, cents));
  const rows = await db
    .select({ movement })
    .from(movement)
    .leftJoin(category, eq(category.id, movement.categoryId))
    .where(and(eq(movement.userId, userId), or(...matches)))
    .orderBy(desc(movement.date), desc(movement.id))
    .limit(SEARCH_LIMIT);
  return rows.map((row) => toMovement(row.movement));
}
