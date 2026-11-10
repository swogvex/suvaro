import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cycleFigures } from '../../src/lib/calc';
import { cycleStartingIn } from '../../src/lib/cycle';
import { createDb } from '../../src/lib/db/client';
import { budget, category, contribution, goal, movement, user } from '../../src/lib/db/schema';
import { chooseCycle } from '../../src/lib/home/cycle-param';
import { loadHome } from '../../src/lib/home/repo';
import { ulid } from '../../src/lib/id';

const { db, client } = createDb({ url: ':memory:' });
const nov = cycleStartingIn('2026-11', 1);
const oct = cycleStartingIn('2026-10', 1);

/** A user with the sample month (Nov 2026), one October expense, a pinned goal and a Food budget. */
async function seedUser(name: string) {
  const id = ulid();
  await db.insert(user).values({ id, email: `${name}-${id}@example.com`, ageConfirmed: true });
  const food = ulid();
  const housing = ulid();
  await db.insert(category).values([
    { id: food, userId: id, name: 'Food', icon: 'utensils', color: 'c1' },
    { id: housing, userId: id, name: 'Housing', icon: 'house', color: 'c5' },
  ]);
  await db.insert(movement).values([
    { id: ulid(), userId: id, type: 'income', amountCents: 185_000, date: '2026-11-01', note: 'Salary' },
    { id: ulid(), userId: id, type: 'expense', amountCents: 96_640, categoryId: housing, date: '2026-11-01' },
    { id: ulid(), userId: id, type: 'expense', amountCents: 24_600, categoryId: food, date: '2026-11-08' },
    { id: ulid(), userId: id, type: 'expense', amountCents: 5_000, categoryId: food, date: '2026-10-20' },
    { id: ulid(), userId: id, type: 'income', amountCents: 1_000, date: '2026-10-21' },
  ]);
  const trip = ulid();
  await db.insert(goal).values([
    { id: trip, userId: id, name: 'Trip', icon: 'plane', color: 'c5', targetCents: 120_000, pinned: true },
    { id: ulid(), userId: id, name: 'Bike', icon: 'target', color: 'c3', targetCents: 50_000 },
  ]);
  await db.insert(contribution).values([
    { id: ulid(), userId: id, goalId: trip, amountCents: 15_000, date: '2026-11-02' },
    { id: ulid(), userId: id, goalId: trip, amountCents: 20_000, date: '2026-10-02' },
  ]);
  await db.insert(budget).values({ id: ulid(), userId: id, categoryId: food, limitCents: 30_000 });
  return { id, food };
}

let alice: Awaited<ReturnType<typeof seedUser>>;
let bob: Awaited<ReturnType<typeof seedUser>>;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: 'drizzle' });
  alice = await seedUser('alice');
  bob = await seedUser('bob');
});
afterAll(() => client.close());

describe('Home data', () => {
  it('loads the cycle: movements, previous expenses, set-aside, budgets and the pinned goal', async () => {
    const home = await loadHome(db, alice.id, nov, oct);
    expect(home.movements.map((m) => m.date)).toEqual(['2026-11-08', '2026-11-01', '2026-11-01']);
    expect(home.previousDaily).toHaveLength(31);
    expect(home.previousDaily[19]).toBe(5_000); // 20 October
    expect(home.previousDaily.reduce((a, b) => a + b, 0)).toBe(5_000);
    expect(home.setAsideCents).toBe(15_000);
    expect(home.budgets).toEqual([{ categoryId: alice.food, limitCents: 30_000 }]);
    expect(home.goal).toMatchObject({ name: 'Trip', color: 5, targetCents: 120_000, savedCents: 35_000 });

    const figures = cycleFigures(home.movements, home.setAsideCents, home.cycle, '2026-11-10');
    expect(figures).toMatchObject({ availableCents: 48_760, savingsCents: 63_760, dailyAllowCents: 2_321 });
  });

  it('an empty account gives empty data, not errors', async () => {
    const id = ulid();
    await db.insert(user).values({ id, email: `empty-${id}@example.com`, ageConfirmed: true });
    expect(await loadHome(db, id, nov, oct)).toEqual({
      cycle: nov,
      previousCycle: oct,
      movements: [],
      previousDaily: Array.from({ length: 31 }, () => 0),
      setAsideCents: 0,
      budgets: [],
      goal: null,
    });
  });

  it('never mixes users: each sees only their own rows', async () => {
    const [mine, theirs] = await Promise.all([
      loadHome(db, alice.id, nov, oct),
      loadHome(db, bob.id, nov, oct),
    ]);
    const mineIds = new Set(mine.movements.map((m) => m.id));
    expect(theirs.movements.some((m) => mineIds.has(m.id))).toBe(false);
    expect(mine.goal?.id).not.toBe(theirs.goal?.id);
    expect(mine.setAsideCents).toBe(15_000);
    expect(mine.budgets.every((b) => b.categoryId === alice.food)).toBe(true);
  });

  it('allows one pinned goal and one global limit per user', async () => {
    await expect(
      db.insert(goal).values({
        id: ulid(),
        userId: alice.id,
        name: 'Second',
        icon: 'target',
        color: 'c1',
        targetCents: 1,
        pinned: true,
      }),
    ).rejects.toThrow();
    await db.insert(budget).values({ id: ulid(), userId: alice.id, categoryId: null, limitCents: 100 });
    await expect(
      db.insert(budget).values({ id: ulid(), userId: alice.id, categoryId: null, limitCents: 200 }),
    ).rejects.toThrow();
    await expect(
      db.insert(budget).values({ id: ulid(), userId: alice.id, categoryId: alice.food, limitCents: 1 }),
    ).rejects.toThrow();
  });
});

describe('cycle query', () => {
  it('defaults to the current cycle and refuses invalid or future ones', () => {
    expect(chooseCycle(null, 1, '2026-11-10')).toEqual({ cycle: nov, previousCycle: oct, current: nov });
    expect(chooseCycle('2026-10', 1, '2026-11-10')?.cycle).toEqual(oct);
    expect(chooseCycle('2026-12', 1, '2026-11-10')).toBeNull();
    expect(chooseCycle('2026-13', 1, '2026-11-10')).toBeNull();
    expect(chooseCycle('nov', 1, '2026-11-10')).toBeNull();
    // Start day 25: on 10 Nov the current cycle is the one that started in October.
    expect(chooseCycle(null, 25, '2026-11-10')?.cycle).toEqual({ start: '2026-10-25', end: '2026-11-24' });
    expect(chooseCycle('2026-11', 25, '2026-11-10')).toBeNull();
  });
});
