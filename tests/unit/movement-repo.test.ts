import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '../../src/lib/db/client';
import { category, recurring, user } from '../../src/lib/db/schema';
import { ulid } from '../../src/lib/id';
import { emptyFilters, parseFilters, type Filters } from '../../src/lib/movements/filters';
import { createInput, type CreateInput } from '../../src/lib/movements/schema';
import {
  createMovement,
  deleteMovement,
  getMovement,
  latestMonth,
  listCategories,
  listMonth,
  searchMovements,
  summarize,
  updateMovement,
} from '../../src/lib/movements/repo';

const { db, client } = createDb({ url: ':memory:' });
const today = '2026-11-10';

async function addUser(name: string) {
  const id = ulid();
  await db.insert(user).values({ id, email: `${name}-${id}@example.com`, ageConfirmed: true });
  const food = ulid();
  const leisure = ulid();
  await db.insert(category).values([
    { id: food, userId: id, name: 'Food', icon: 'utensils', color: 'c1', sort: 0 },
    { id: leisure, userId: id, name: 'Leisure', icon: 'ticket', color: 'c2', sort: 1 },
  ]);
  return { id, food, leisure };
}

function input(values: Partial<CreateInput> & Pick<CreateInput, 'categoryId'>): CreateInput {
  return createInput.parse({
    id: ulid(),
    type: 'expense',
    amountCents: 1_000,
    date: today,
    note: '',
    ...values,
  });
}

const filters = (query: string): Filters => parseFilters(new URLSearchParams(query)).filters;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: 'drizzle' });
});
afterAll(() => client.close());

describe('movement repository', () => {
  it('creates, edits and deletes the user own movements', async () => {
    const ana = await addUser('ana');
    const created = await createMovement(
      db,
      ana.id,
      input({ categoryId: ana.food, amountCents: 2_385, note: 'Market' }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.movement).toMatchObject({ amountCents: 2_385, note: 'Market', recurring: false });

    const edited = await updateMovement(db, ana.id, created.movement.id, {
      type: 'expense',
      amountCents: 2_400,
      categoryId: ana.leisure,
      date: '2026-11-09',
      note: 'Cinema',
    });
    expect(edited.ok && edited.movement).toMatchObject({
      amountCents: 2_400,
      categoryId: ana.leisure,
      date: '2026-11-09',
    });

    expect(await deleteMovement(db, ana.id, created.movement.id)).toBe(true);
    expect(await getMovement(db, ana.id, created.movement.id)).toBeNull();
    expect(await deleteMovement(db, ana.id, created.movement.id)).toBe(false);
  });

  it('treats a repeated create with the same id as the same movement', async () => {
    const ana = await addUser('ana');
    const values = input({ categoryId: ana.food });
    await createMovement(db, ana.id, values);
    const again = await createMovement(db, ana.id, values);
    expect(again.ok).toBe(true);
    expect((await summarize(db, ana.id, emptyFilters, today)).count).toBe(1);
  });

  it('Repeat creates a monthly recurring template from next month (clamped)', async () => {
    const ana = await addUser('ana');
    const result = await createMovement(
      db,
      ana.id,
      input({ categoryId: ana.food, date: '2026-01-31', repeat: true }),
    );
    expect(result.ok && result.movement.recurring).toBe(true);
    const [template] = await db.select().from(recurring).where(eq(recurring.userId, ana.id));
    expect(template).toMatchObject({
      frequency: 'monthly',
      mode: 'auto',
      anchorDate: '2026-01-31',
      nextDate: '2026-02-28',
    });
  });

  it('lists by month, newest first, skipping empty months, with filters', async () => {
    const ana = await addUser('ana');
    for (const [date, amountCents, categoryId] of [
      ['2026-11-09', 380, ana.food],
      ['2026-11-01', 5_000, ana.leisure],
      ['2026-08-15', 1_250, ana.food],
    ] as const) {
      await createMovement(db, ana.id, input({ date, amountCents, categoryId }));
    }
    await createMovement(
      db,
      ana.id,
      input({ type: 'income', categoryId: null, amountCents: 185_000, date: '2026-11-01' }),
    );

    expect(await latestMonth(db, ana.id, emptyFilters, today)).toBe('2026-11');
    const november = await listMonth(db, ana.id, emptyFilters, today, '2026-11');
    expect(november.items.map((m) => m.date)).toEqual(['2026-11-09', '2026-11-01', '2026-11-01']);
    expect(november.next).toBe('2026-08');
    const august = await listMonth(db, ana.id, emptyFilters, today, '2026-08');
    expect(august.next).toBeNull();

    expect(await summarize(db, ana.id, emptyFilters, today)).toEqual({
      count: 4,
      netCents: 185_000 - 380 - 5_000 - 1_250,
    });
    expect(await summarize(db, ana.id, filters('type=expense&period=this-month'), today)).toEqual({
      count: 2,
      netCents: -5_380,
    });
    expect(await summarize(db, ana.id, filters(`cat=${ana.food}`), today)).toEqual({
      count: 2,
      netCents: -1_630,
    });
    expect(await summarize(db, ana.id, filters('min=10&max=50'), today)).toEqual({
      count: 2,
      netCents: -6_250,
    });
    expect((await summarize(db, ana.id, filters('period=last-month'), today)).count).toBe(0);
    expect(await latestMonth(db, ana.id, filters('period=last-month'), today)).toBeNull();
  });

  it('orders categories and counts recent uses', async () => {
    const ana = await addUser('ana');
    await createMovement(db, ana.id, input({ categoryId: ana.leisure }));
    await createMovement(db, ana.id, input({ categoryId: ana.leisure, date: '2026-01-01' }));
    const categories = await listCategories(db, ana.id, today);
    expect(categories.map((c) => [c.name, c.uses])).toEqual([
      ['Food', 0],
      ['Leisure', 1],
    ]);
  });

  it('searches note, category name and exact amount', async () => {
    const ana = await addUser('ana');
    await createMovement(db, ana.id, input({ categoryId: ana.food, note: 'Coffee 50%', amountCents: 380 }));
    await createMovement(db, ana.id, input({ categoryId: ana.leisure, note: 'Cinema', amountCents: 2_385 }));
    expect((await searchMovements(db, ana.id, 'coffee', 'en')).map((m) => m.note)).toEqual(['Coffee 50%']);
    expect((await searchMovements(db, ana.id, 'leis', 'en')).map((m) => m.note)).toEqual(['Cinema']);
    expect((await searchMovements(db, ana.id, '23,85', 'es')).map((m) => m.note)).toEqual(['Cinema']);
    // LIKE wildcards are literal text.
    expect((await searchMovements(db, ana.id, '%', 'en')).map((m) => m.note)).toEqual(['Coffee 50%']);
    expect(await searchMovements(db, ana.id, '   ', 'en')).toEqual([]);
  });
});

describe('movement isolation between users', () => {
  it('a user cannot read, edit, delete or reuse another user rows', async () => {
    const ana = await addUser('ana');
    const bob = await addUser('bob');
    const created = await createMovement(db, ana.id, input({ categoryId: ana.food, note: 'Ana secret' }));
    if (!created.ok) throw new Error('setup');
    const { id } = created.movement;

    expect(await getMovement(db, bob.id, id)).toBeNull();
    expect(
      await updateMovement(db, bob.id, id, {
        type: 'expense',
        amountCents: 1,
        categoryId: bob.food,
        date: today,
        note: '',
      }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await deleteMovement(db, bob.id, id)).toBe(false);
    expect(await getMovement(db, ana.id, id)).toMatchObject({ amountCents: 1_000, note: 'Ana secret' });

    // Bob cannot take Ana's id, nor file a movement under Ana's category.
    expect(await createMovement(db, bob.id, input({ id, categoryId: bob.food }))).toEqual({
      ok: false,
      error: 'ID_TAKEN',
    });
    expect(await createMovement(db, bob.id, input({ categoryId: ana.food }))).toEqual({
      ok: false,
      error: 'INVALID_CATEGORY',
    });
    // Ana cannot move her movement into Bob's category either.
    expect(
      await updateMovement(db, ana.id, id, {
        type: 'expense',
        amountCents: 1,
        categoryId: bob.food,
        date: today,
        note: '',
      }),
    ).toEqual({ ok: false, error: 'INVALID_CATEGORY' });

    expect(await summarize(db, bob.id, emptyFilters, today)).toEqual({ count: 0, netCents: 0 });
    expect(await latestMonth(db, bob.id, emptyFilters, today)).toBeNull();
    expect((await listMonth(db, bob.id, filters(`cat=${ana.food}`), today, '2026-11')).items).toEqual([]);
    expect(await searchMovements(db, bob.id, 'secret', 'en')).toEqual([]);
    expect((await listCategories(db, bob.id, today)).map((c) => c.id).sort()).toEqual(
      [bob.food, bob.leisure].sort(),
    );
  });

  it('archived categories are not offered and cannot be used', async () => {
    const ana = await addUser('ana');
    await db.update(category).set({ archived: true }).where(eq(category.id, ana.leisure));
    expect((await listCategories(db, ana.id, today)).map((c) => c.id)).toEqual([ana.food]);
    expect(await createMovement(db, ana.id, input({ categoryId: ana.leisure }))).toEqual({
      ok: false,
      error: 'INVALID_CATEGORY',
    });
  });
});
