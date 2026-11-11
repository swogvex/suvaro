import { and, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCategory,
  deleteCategory,
  listCategoryRows,
  updateCategory,
} from '../../src/lib/categories/repo';
import { categoryCreateInput, categoryUpdateInput } from '../../src/lib/categories/schema';
import { cycleStartingIn } from '../../src/lib/cycle';
import { createDb } from '../../src/lib/db/client';
import { budget, category, movement, recurring, user } from '../../src/lib/db/schema';
import { ulid } from '../../src/lib/id';

const { db, client } = createDb({ url: ':memory:' });
const nov = cycleStartingIn('2026-11', 1);

async function seedUser(name: string) {
  const id = ulid();
  await db.insert(user).values({ id, email: `${name}-${id}@example.com`, ageConfirmed: true });
  const food = ulid();
  const fun = ulid();
  await db.insert(category).values([
    { id: food, userId: id, name: 'Food', icon: 'utensils', color: 'c1', sort: 0 },
    { id: fun, userId: id, name: 'Leisure', icon: 'ticket', color: 'c2', sort: 1 },
  ]);
  await db.insert(movement).values([
    { id: ulid(), userId: id, type: 'expense', amountCents: 1_000, categoryId: food, date: '2026-11-03' },
    { id: ulid(), userId: id, type: 'expense', amountCents: 2_000, categoryId: food, date: '2026-10-03' },
    { id: ulid(), userId: id, type: 'income', amountCents: 9_000, date: '2026-11-01' },
  ]);
  return { id, food, fun };
}

let alice: Awaited<ReturnType<typeof seedUser>>;
let bob: Awaited<ReturnType<typeof seedUser>>;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: 'drizzle' });
  alice = await seedUser('alice');
  bob = await seedUser('bob');
});
afterAll(() => client.close());

const fields = (name: string) => ({ name, icon: 'coffee' as const, color: 4 });

describe('categories', () => {
  it('lists the user’s own, in order, with this cycle’s and all-time use', async () => {
    const rows = await listCategoryRows(db, alice.id, nov);
    expect(rows.map((row) => [row.name, row.thisMonth, row.total])).toEqual([
      ['Food', 1, 2],
      ['Leisure', 0, 0],
    ]);
    expect(rows[0]?.color).toBe(1);
  });

  it('creates at the end, refuses a name already used (case and accents ignored) and the 51st', async () => {
    const coffee = await createCategory(db, alice.id, { id: ulid(), ...fields('Café') });
    expect(coffee.ok).toBe(true);
    expect((await listCategoryRows(db, alice.id, nov)).at(-1)?.name).toBe('Café');
    expect(await createCategory(db, alice.id, { id: ulid(), ...fields('cafe') })).toEqual({
      ok: false,
      error: 'DUPLICATE_NAME',
    });
    // Another user may use the same name.
    expect((await createCategory(db, bob.id, { id: ulid(), ...fields('Café') })).ok).toBe(true);

    const extra = Array.from({ length: 47 }, (_, i) => ({
      id: ulid(),
      userId: alice.id,
      name: `Extra ${i}`,
      icon: 'dots',
      color: 'c7' as const,
    }));
    await db.insert(category).values(extra);
    expect(await createCategory(db, alice.id, { id: ulid(), ...fields('One too many') })).toEqual({
      ok: false,
      error: 'LIMIT_REACHED',
    });
    await db.delete(category).where(and(eq(category.userId, alice.id), eq(category.icon, 'dots')));
  });

  it('edits only the user’s own category', async () => {
    expect(await updateCategory(db, bob.id, alice.food, fields('Hijacked'))).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await updateCategory(db, alice.id, alice.food, fields('Leisure'))).toEqual({
      ok: false,
      error: 'DUPLICATE_NAME',
    });
    const renamed = await updateCategory(db, alice.id, alice.food, {
      ...fields('Groceries'),
      icon: 'shopping-cart',
    });
    expect(renamed).toEqual({ ok: true, value: { name: 'Groceries', icon: 'shopping-cart', color: 4 } });
  });

  it('deleting a used category moves its movements and templates first; its budget goes', async () => {
    const template = ulid();
    await db.insert(recurring).values({
      id: template,
      userId: alice.id,
      type: 'expense',
      amountCents: 500,
      categoryId: alice.food,
      frequency: 'monthly',
      anchorDate: '2026-11-01',
      mode: 'auto',
      nextDate: '2026-12-01',
    });
    await db
      .insert(budget)
      .values({ id: ulid(), userId: alice.id, categoryId: alice.food, limitCents: 10_000 });

    expect(await deleteCategory(db, alice.id, alice.food, null)).toEqual({
      ok: false,
      error: 'NEEDS_TARGET',
    });
    expect(await deleteCategory(db, alice.id, alice.food, alice.food)).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    expect(await deleteCategory(db, alice.id, alice.food, bob.fun)).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    expect(await deleteCategory(db, bob.id, alice.food, bob.fun)).toEqual({ ok: false, error: 'NOT_FOUND' });

    expect(await deleteCategory(db, alice.id, alice.food, alice.fun)).toEqual({
      ok: true,
      value: { moved: 2 },
    });
    const moved = await db.select().from(movement).where(eq(movement.categoryId, alice.fun));
    expect(moved).toHaveLength(2);
    const [templateRow] = await db.select().from(recurring).where(eq(recurring.id, template));
    expect(templateRow?.categoryId).toBe(alice.fun);
    expect(await db.select().from(budget).where(eq(budget.userId, alice.id))).toEqual([]);
    expect(await db.select().from(category).where(eq(category.id, alice.food))).toEqual([]);
    // Bob's data is untouched.
    expect(await listCategoryRows(db, bob.id, nov)).toHaveLength(3);
  });

  it('an unused category goes without a target; the last one never goes', async () => {
    const rows = await listCategoryRows(db, alice.id, nov);
    const coffee = rows.find((row) => row.name === 'Café');
    if (!coffee) throw new Error('missing');
    expect(await deleteCategory(db, alice.id, coffee.id, null)).toEqual({ ok: true, value: { moved: 0 } });
    expect(await deleteCategory(db, alice.id, alice.fun, null)).toEqual({
      ok: false,
      error: 'LAST_CATEGORY',
    });
  });
});

describe('category input', () => {
  it('trims and collapses spaces; refuses empty, long, unknown icons and colors', () => {
    expect(categoryUpdateInput.parse({ name: '  Day   care ', icon: 'baby', color: 3 }).name).toBe(
      'Day care',
    );
    expect(categoryUpdateInput.safeParse({ name: '   ', icon: 'baby', color: 3 }).success).toBe(false);
    expect(categoryUpdateInput.safeParse({ name: 'x'.repeat(31), icon: 'baby', color: 3 }).success).toBe(
      false,
    );
    expect(categoryUpdateInput.safeParse({ name: 'Kids', icon: 'rocket', color: 3 }).success).toBe(false);
    expect(categoryUpdateInput.safeParse({ name: 'Kids', icon: 'baby', color: 9 }).success).toBe(false);
    expect(categoryCreateInput.safeParse({ id: 'nope', name: 'Kids', icon: 'baby', color: 3 }).success).toBe(
      false,
    );
  });
});
