import { and, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '../../src/lib/db/client';
import { category, movement, profile, recurring, recurringPending, user } from '../../src/lib/db/schema';
import { ulid } from '../../src/lib/id';
import { MAX_RECURRING, summarize } from '../../src/lib/recurring/model';
import {
  confirmPending,
  countPending,
  createRecurring,
  deleteRecurring,
  loadRecurring,
  materialiseTemplate,
  skipPending,
  updateRecurring,
} from '../../src/lib/recurring/repo';
import { recurringCreateInput, type RecurringCreateInput } from '../../src/lib/recurring/schema';

const { db, client } = createDb({ url: ':memory:' });

async function seedUser(name: string) {
  const id = ulid();
  await db.insert(user).values({ id, email: `${name}-${id}@example.com`, ageConfirmed: true });
  await db.insert(profile).values({ userId: id, lastActiveAt: new Date(), timezone: 'Europe/Madrid' });
  const food = ulid();
  await db.insert(category).values({ id: food, userId: id, name: 'Food', icon: 'utensils', color: 'c1' });
  return { id, food };
}

const input = (overrides: Partial<RecurringCreateInput> = {}): RecurringCreateInput => ({
  id: ulid(),
  type: 'income',
  amountCents: 185_000,
  categoryId: null,
  note: 'Salary',
  frequency: 'monthly',
  intervalDays: null,
  anchorDate: '2026-12-01',
  endDate: null,
  mode: 'auto',
  ...overrides,
});

async function movementsOf(recurringId: string) {
  return db
    .select({ date: movement.date })
    .from(movement)
    .where(eq(movement.recurringId, recurringId))
    .orderBy(movement.date);
}

async function rowOf(id: string) {
  const [row] = await db.select().from(recurring).where(eq(recurring.id, id));
  if (!row) throw new Error('missing');
  return row;
}

let alice: Awaited<ReturnType<typeof seedUser>>;
let bob: Awaited<ReturnType<typeof seedUser>>;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: 'drizzle' });
  alice = await seedUser('alice');
  bob = await seedUser('bob');
});

afterAll(() => client.close());

describe('validation', () => {
  it('accepts a valid template and rejects inconsistent ones', () => {
    expect(recurringCreateInput.safeParse(input()).success).toBe(true);
    expect(recurringCreateInput.safeParse(input({ type: 'expense' })).success).toBe(false);
    expect(recurringCreateInput.safeParse(input({ frequency: 'every_n_days' })).success).toBe(false);
    expect(recurringCreateInput.safeParse(input({ intervalDays: 5 })).success).toBe(false);
    expect(recurringCreateInput.safeParse(input({ endDate: '2026-11-30' })).success).toBe(false);
    expect(recurringCreateInput.safeParse({ ...input(), extra: 1 }).success).toBe(false);
  });
});

describe('createRecurring', () => {
  it('starts on the anchor when it is in the future and creates nothing yet', async () => {
    const result = await createRecurring(db, alice.id, input(), '2026-11-11');
    expect(result.ok && result.recurring.nextDate).toBe('2026-12-01');
    if (result.ok) expect(await movementsOf(result.recurring.id)).toEqual([]);
  });

  it('does not fill in past dates and creates today’s occurrence at once', async () => {
    const result = await createRecurring(
      db,
      alice.id,
      input({ anchorDate: '2026-08-11', type: 'expense', categoryId: alice.food, amountCents: 299 }),
      '2026-11-11',
    );
    if (!result.ok) throw new Error(result.error);
    expect(await movementsOf(result.recurring.id)).toEqual([{ date: '2026-11-11' }]);
    expect(result.recurring.nextDate).toBe('2026-12-11');
  });

  it('returns the same row when the create is sent twice', async () => {
    const body = input();
    const first = await createRecurring(db, alice.id, body, '2026-11-11');
    const second = await createRecurring(db, alice.id, body, '2026-11-11');
    expect(second).toEqual(first);
    expect(await createRecurring(db, bob.id, body, '2026-11-11')).toEqual({ ok: false, error: 'ID_TAKEN' });
  });

  it('refuses another user’s category', async () => {
    const result = await createRecurring(
      db,
      bob.id,
      input({ type: 'expense', categoryId: alice.food }),
      '2026-11-11',
    );
    expect(result).toEqual({ ok: false, error: 'INVALID_CATEGORY' });
  });

  it('stops at 50 templates', async () => {
    const carol = await seedUser('carol');
    await db.insert(recurring).values(
      Array.from({ length: MAX_RECURRING }, () => ({
        ...input(),
        id: ulid(),
        userId: carol.id,
        nextDate: '2026-12-01',
      })),
    );
    expect(await createRecurring(db, carol.id, input(), '2026-11-11')).toEqual({
      ok: false,
      error: 'LIMIT_REACHED',
    });
  });
});

describe('materialiseTemplate', () => {
  it('creates every missed date once, even when run twice', async () => {
    const id = ulid();
    await db
      .insert(recurring)
      .values({ ...input({ id, anchorDate: '2026-01-31' }), userId: alice.id, nextDate: '2026-01-31' });
    const row = await rowOf(id);
    expect(await materialiseTemplate(db, row, '2026-04-30')).toBe(4);
    // A second run with the same (now stale) row, and one with the fresh row: nothing new.
    expect(await materialiseTemplate(db, row, '2026-04-30')).toBe(0);
    expect(await materialiseTemplate(db, await rowOf(id), '2026-04-30')).toBe(0);
    expect(await movementsOf(id)).toEqual([
      { date: '2026-01-31' },
      { date: '2026-02-28' },
      { date: '2026-03-31' },
      { date: '2026-04-30' },
    ]);
    expect((await rowOf(id)).nextDate).toBe('2026-05-31');
  });

  it('creates pending rows for confirm templates instead of movements', async () => {
    const id = ulid();
    await db.insert(recurring).values({
      ...input({ id, frequency: 'weekly', anchorDate: '2026-11-02', mode: 'confirm' }),
      userId: bob.id,
      nextDate: '2026-11-02',
    });
    expect(await materialiseTemplate(db, await rowOf(id), '2026-11-10')).toBe(2);
    expect(await materialiseTemplate(db, await rowOf(id), '2026-11-10')).toBe(0);
    expect(await movementsOf(id)).toEqual([]);
    const { pending } = await loadRecurring(db, bob.id);
    expect(pending.filter((p) => p.recurringId === id).map((p) => p.dueDate)).toEqual([
      '2026-11-02',
      '2026-11-09',
    ]);
  });

  it('stops at the end date and keeps the template as ended', async () => {
    const id = ulid();
    await db.insert(recurring).values({
      ...input({
        id,
        frequency: 'every_n_days',
        intervalDays: 10,
        anchorDate: '2026-10-01',
        endDate: '2026-10-25',
      }),
      userId: alice.id,
      nextDate: '2026-10-01',
    });
    expect(await materialiseTemplate(db, await rowOf(id), '2026-11-11')).toBe(3);
    expect((await rowOf(id)).nextDate).toBe('2026-10-31');
    expect(await materialiseTemplate(db, await rowOf(id), '2026-12-31')).toBe(0);
  });
});

describe('confirm and skip', () => {
  it('confirm creates the movement on the due date; skip creates nothing; foreign ids are 404', async () => {
    const id = ulid();
    await db.insert(recurring).values({
      ...input({
        id,
        type: 'expense',
        categoryId: alice.food,
        amountCents: 299,
        note: 'Photo cloud',
        mode: 'confirm',
        anchorDate: '2026-11-05',
      }),
      userId: alice.id,
      nextDate: '2026-11-05',
    });
    await materialiseTemplate(db, await rowOf(id), '2026-12-05');
    const pending = (await loadRecurring(db, alice.id)).pending.filter((p) => p.recurringId === id);
    expect(pending.map((p) => p.dueDate)).toEqual(['2026-11-05', '2026-12-05']);
    const [first, second] = pending;
    if (!first || !second) throw new Error('missing');

    expect(await confirmPending(db, bob.id, first.id)).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await skipPending(db, bob.id, first.id)).toBe(false);

    const confirmed = await confirmPending(db, alice.id, first.id);
    expect(confirmed.ok && confirmed.movement).toMatchObject({
      date: '2026-11-05',
      amountCents: 299,
      note: 'Photo cloud',
      recurring: true,
    });
    expect(await confirmPending(db, alice.id, first.id)).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await skipPending(db, alice.id, second.id)).toBe(true);
    expect(await movementsOf(id)).toEqual([{ date: '2026-11-05' }]);
    expect(
      await db
        .select()
        .from(recurringPending)
        .where(and(eq(recurringPending.recurringId, id))),
    ).toEqual([]);
  });
});

describe('update and delete', () => {
  it('an edit after today’s occurrence starts tomorrow, so it never creates it twice', async () => {
    const created = await createRecurring(
      db,
      bob.id,
      input({ frequency: 'weekly', anchorDate: '2026-11-11' }),
      '2026-11-11',
    );
    if (!created.ok) throw new Error(created.error);
    const fields: Omit<RecurringCreateInput, 'id'> = input({
      frequency: 'every_n_days',
      intervalDays: 2,
      anchorDate: '2026-11-11',
      amountCents: 1_000,
    });
    delete (fields as Partial<RecurringCreateInput>).id;
    const updated = await updateRecurring(db, bob.id, created.recurring.id, fields, '2026-11-11');
    expect(updated.ok && updated.recurring.nextDate).toBe('2026-11-13');
    expect(await movementsOf(created.recurring.id)).toEqual([{ date: '2026-11-11' }]);
    expect(await updateRecurring(db, alice.id, created.recurring.id, fields, '2026-11-11')).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  it('delete keeps the movements it made and removes its pending rows; foreign ids are 404', async () => {
    const created = await createRecurring(
      db,
      bob.id,
      input({ anchorDate: '2026-11-11', mode: 'confirm' }),
      '2026-11-11',
    );
    if (!created.ok) throw new Error(created.error);
    const before = await countPending(db, bob.id);
    expect(await deleteRecurring(db, alice.id, created.recurring.id)).toBe(false);
    expect(await deleteRecurring(db, bob.id, created.recurring.id)).toBe(true);
    expect(await countPending(db, bob.id)).toBe(before - 1);
  });
});

describe('summarize', () => {
  it('adds monthly equivalents and keeps yearly expenses apart; ended ones count for nothing', () => {
    const base = {
      categoryId: null,
      note: '',
      anchorDate: '2026-01-01',
      mode: 'auto' as const,
      intervalDays: null,
      endDate: null,
      nextDate: '2026-12-01',
    };
    expect(
      summarize([
        { ...base, id: '1', type: 'income', amountCents: 185_000, frequency: 'monthly' },
        { ...base, id: '2', type: 'expense', amountCents: 1_200, frequency: 'weekly' },
        { ...base, id: '3', type: 'expense', amountCents: 2_999, frequency: 'monthly' },
        { ...base, id: '4', type: 'expense', amountCents: 9_900, frequency: 'yearly' },
        {
          ...base,
          id: '5',
          type: 'expense',
          amountCents: 5_000,
          frequency: 'monthly',
          endDate: '2026-11-30',
        },
      ]),
    ).toEqual({ incomeMonthlyCents: 185_000, expenseMonthlyCents: 5_200 + 2_999, expenseYearlyCents: 9_900 });
  });
});
