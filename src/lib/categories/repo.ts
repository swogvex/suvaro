/**
 * Settings › Categories (server). Every query is scoped to the signed-in user's id; another user's id
 * behaves exactly like a missing one (NOT_FOUND).
 *
 * Deleting a category that movements or recurring templates use needs a target category: they are moved
 * there first, in one transaction, then the category goes (its budget with it, by cascade).
 */
import { and, count, eq, max, ne, sql } from 'drizzle-orm';
import type { Cycle } from '../cycle';
import type { Database } from '../db/client';
import { category, movement, recurring } from '../db/schema';
import { colorIndex, type CategoryColor } from '../default-categories';
import { CATEGORY_MAX, type CategoryRow, type ColorIndex } from './model';
import type { CategoryCreateInput, CategoryUpdateInput } from './schema';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const colorOf = (n: number) => `c${n}` as CategoryColor;

/** The user's categories in their order, with this cycle's and all-time movement counts. */
export async function listCategoryRows(db: Database, userId: string, cycle: Cycle): Promise<CategoryRow[]> {
  const usage = db
    .select({
      categoryId: movement.categoryId,
      total: count().as('total'),
      thisMonth:
        sql<number>`sum(case when ${movement.date} >= ${cycle.start} and ${movement.date} <= ${cycle.end} then 1 else 0 end)`.as(
          'this_month',
        ),
    })
    .from(movement)
    .where(eq(movement.userId, userId))
    .groupBy(movement.categoryId)
    .as('usage');
  const rows = await db
    .select({
      id: category.id,
      name: category.name,
      icon: category.icon,
      color: category.color,
      total: sql<number>`coalesce(${usage.total}, 0)`,
      thisMonth: sql<number>`coalesce(${usage.thisMonth}, 0)`,
    })
    .from(category)
    .leftJoin(usage, eq(usage.categoryId, category.id))
    .where(and(eq(category.userId, userId), eq(category.archived, false)))
    .orderBy(category.sort, category.name);
  return rows.map((row) => ({
    ...row,
    color: colorIndex(row.color),
    total: Number(row.total),
    thisMonth: Number(row.thisMonth),
  }));
}

/** Another active category of the user with the same name (case and accents ignored). */
async function nameTaken(db: Database, userId: string, name: string, exceptId?: string): Promise<boolean> {
  const others = await db
    .select({ name: category.name })
    .from(category)
    .where(
      and(
        eq(category.userId, userId),
        eq(category.archived, false),
        ...(exceptId ? [ne(category.id, exceptId)] : []),
      ),
    );
  const key = (text: string) =>
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase();
  return others.some((row) => key(row.name) === key(name));
}

export async function createCategory(
  db: Database,
  userId: string,
  input: CategoryCreateInput,
): Promise<Result<CategoryRow>> {
  const [stats] = await db
    .select({ n: count(), last: max(category.sort) })
    .from(category)
    .where(and(eq(category.userId, userId), eq(category.archived, false)));
  if ((stats?.n ?? 0) >= CATEGORY_MAX) return { ok: false, error: 'LIMIT_REACHED' };
  if (await nameTaken(db, userId, input.name)) return { ok: false, error: 'DUPLICATE_NAME' };
  const [existing] = await db.select({ id: category.id }).from(category).where(eq(category.id, input.id));
  if (existing) return { ok: false, error: 'DUPLICATE_ID' };
  await db.insert(category).values({
    id: input.id,
    userId,
    name: input.name,
    icon: input.icon,
    color: colorOf(input.color),
    sort: (stats?.last ?? -1) + 1,
  });
  return {
    ok: true,
    value: {
      id: input.id,
      name: input.name,
      icon: input.icon,
      color: input.color as ColorIndex,
      thisMonth: 0,
      total: 0,
    },
  };
}

export async function updateCategory(
  db: Database,
  userId: string,
  id: string,
  input: CategoryUpdateInput,
): Promise<Result<{ name: string; icon: string; color: ColorIndex }>> {
  if (await nameTaken(db, userId, input.name, id)) return { ok: false, error: 'DUPLICATE_NAME' };
  const updated = await db
    .update(category)
    .set({ name: input.name, icon: input.icon, color: colorOf(input.color), updatedAt: new Date() })
    .where(and(eq(category.id, id), eq(category.userId, userId), eq(category.archived, false)))
    .returning({ id: category.id });
  if (updated.length === 0) return { ok: false, error: 'NOT_FOUND' };
  return { ok: true, value: { name: input.name, icon: input.icon, color: input.color as ColorIndex } };
}

/**
 * Deletes a category. With movements or recurring templates, `moveTo` (another active category of the
 * user) receives them first. The last category cannot go: expenses always need one.
 */
export async function deleteCategory(
  db: Database,
  userId: string,
  id: string,
  moveTo: string | null,
): Promise<Result<{ moved: number }>> {
  const mine = and(eq(category.userId, userId), eq(category.archived, false));
  const active = await db.select({ id: category.id }).from(category).where(mine);
  if (!active.some((row) => row.id === id)) return { ok: false, error: 'NOT_FOUND' };
  if (active.length === 1) return { ok: false, error: 'LAST_CATEGORY' };

  const [used] = await db
    .select({ n: count() })
    .from(movement)
    .where(and(eq(movement.userId, userId), eq(movement.categoryId, id)));
  const [templates] = await db
    .select({ n: count() })
    .from(recurring)
    .where(and(eq(recurring.userId, userId), eq(recurring.categoryId, id)));
  const moved = used?.n ?? 0;
  const needsTarget = moved + (templates?.n ?? 0) > 0;

  if (needsTarget) {
    if (!moveTo) return { ok: false, error: 'NEEDS_TARGET' };
    if (moveTo === id || !active.some((row) => row.id === moveTo))
      return { ok: false, error: 'INVALID_TARGET' };
  }

  await db.transaction(async (tx) => {
    if (needsTarget && moveTo) {
      await tx
        .update(movement)
        .set({ categoryId: moveTo })
        .where(and(eq(movement.userId, userId), eq(movement.categoryId, id)));
      await tx
        .update(recurring)
        .set({ categoryId: moveTo })
        .where(and(eq(recurring.userId, userId), eq(recurring.categoryId, id)));
    }
    await tx.delete(category).where(and(eq(category.id, id), eq(category.userId, userId)));
  });
  return { ok: true, value: { moved } };
}
