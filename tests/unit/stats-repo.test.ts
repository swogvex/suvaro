import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '../../src/lib/db/client';
import { category, movement, user } from '../../src/lib/db/schema';
import { ulid } from '../../src/lib/id';
import { choosePeriod, type PeriodSettings } from '../../src/lib/stats/period';
import { loadStats } from '../../src/lib/stats/repo';

const { db, client } = createDb({ url: ':memory:' });
const settings: PeriodSettings = { startDay: 1, weekStart: 1 };
const today = '2026-11-10';

/** Four months of Leisure (40 a month, then 60 so far in November), salary each month, one old note. */
async function seedUser(name: string) {
  const id = ulid();
  await db.insert(user).values({ id, email: `${name}-${id}@example.com`, ageConfirmed: true });
  const leisure = ulid();
  await db.insert(category).values({ id: leisure, userId: id, name: 'Leisure', icon: 'ticket', color: 'c2' });
  const rows = ['2026-08', '2026-09', '2026-10'].flatMap((month) => [
    { id: ulid(), userId: id, type: 'income' as const, amountCents: 200_000, date: `${month}-01` },
    {
      id: ulid(),
      userId: id,
      type: 'expense' as const,
      amountCents: 4_000,
      categoryId: leisure,
      date: `${month}-03`,
    },
  ]);
  await db.insert(movement).values([
    ...rows,
    { id: ulid(), userId: id, type: 'income', amountCents: 185_000, date: '2026-11-01', note: 'Salary' },
    {
      id: ulid(),
      userId: id,
      type: 'expense',
      amountCents: 6_000,
      categoryId: leisure,
      date: '2026-11-05',
      note: 'Gig',
    },
  ]);
  return { id, leisure };
}

let alice: Awaited<ReturnType<typeof seedUser>>;
let bob: Awaited<ReturnType<typeof seedUser>>;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: 'drizzle' });
  alice = await seedUser('alice');
  bob = await seedUser('bob');
  // Bob has more in November: it must never show up in Alice's numbers.
  await db.insert(movement).values({
    id: ulid(),
    userId: bob.id,
    type: 'expense',
    amountCents: 99_900,
    categoryId: bob.leisure,
    date: '2026-11-06',
  });
});
afterAll(() => client.close());

describe('Stats data', () => {
  it('loads the current cycle with every block', async () => {
    const choice = choosePeriod(new URLSearchParams(), settings, today);
    if (!choice) throw new Error('valid');
    const stats = await loadStats(db, alice.id, choice, settings, today);
    expect(stats.period).toEqual({ kind: 'month', start: '2026-11-01', end: '2026-11-30' });
    expect(stats.totals).toEqual({ incomeCents: 185_000, expenseCents: 6_000, savingsCents: 179_000 });
    expect(stats.categories).toEqual([
      { categoryId: alice.leisure, currentCents: 6_000, previousCents: 4_000 },
    ]);
    expect(stats.trends).toEqual([
      { categoryId: alice.leisure, currentCents: 6_000, averageCents: 4_000, change: 0.5 },
    ]);
    expect(stats.months.map((bar) => bar.incomeCents)).toEqual([0, 0, 200_000, 200_000, 200_000, 185_000]);
    expect(stats.averageIncomeCents).toBe(196_250);
    expect(stats.savingsRate).toEqual({ rate: 0.98, months: 3 });
    expect(stats.savings).toHaveLength(10);
    expect(stats.savings.at(-1)?.cents).toBe(179_000);
    expect(stats.movements.map((m) => m.note)).toEqual(['Gig', 'Salary']);
  });

  it('never mixes users', async () => {
    const choice = choosePeriod(new URLSearchParams('period=week'), settings, today);
    if (!choice) throw new Error('valid');
    const stats = await loadStats(db, bob.id, choice, settings, today);
    expect(stats.movements).toEqual([]);
    const month = choosePeriod(new URLSearchParams(), settings, today);
    if (!month) throw new Error('valid');
    const own = await loadStats(db, bob.id, month, settings, today);
    expect(own.totals.expenseCents).toBe(105_900);
    expect(own.categories.every((row) => row.categoryId === bob.leisure)).toBe(true);
  });
});
