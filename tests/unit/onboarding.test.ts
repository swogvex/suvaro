import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '../../src/lib/db/client';
import { category, movement, profile, rateLimit, recurring, session, user } from '../../src/lib/db/schema';
import { defaultCategoryKeys } from '../../src/lib/default-categories';
import {
  completeOnboarding,
  initialState,
  readState,
  stepOfError,
  validateAll,
  validateStep,
  type OnboardingState,
} from '../../src/lib/onboarding';
import { ensureProfile, touchActivity } from '../../src/lib/profile';
import { hitRateLimit } from '../../src/lib/rate-limit';

const base = initialState('en', 'EUR', 'Europe/Madrid');
const names = (key: string) => `name:${key}`;

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

describe('onboarding form state', () => {
  it('starts with every default category and a monthly income', () => {
    expect(base.categories).toEqual(defaultCategoryKeys);
    expect(base.repeatIncome).toBe(true);
  });

  it('reads posted answers and keeps earlier ones when a field is absent', () => {
    const state = readState(
      form([
        ['currency', 'usd'],
        ['locale', 'es'],
        ['timezone', 'America/New_York'],
        ['income', ' 1.850,00 '],
      ]),
      base,
    );
    expect(state).toMatchObject({
      currency: 'USD',
      locale: 'es',
      timezone: 'America/New_York',
      income: '1.850,00',
      repeatIncome: true,
      categories: defaultCategoryKeys,
    });
  });

  it('ignores unknown languages, time zones and categories', () => {
    const state = readState(
      form([
        ['locale', 'fr'],
        ['timezone', 'Nowhere/City'],
        ['categoriesSent', '1'],
        ['categories', 'food'],
        ['categories', 'casino'],
        ['categories', 'food'],
      ]),
      base,
    );
    expect(state.locale).toBe('en');
    expect(state.timezone).toBe('Europe/Madrid');
    expect(state.categories).toEqual(['food']);
  });

  it('reads the "repeat monthly" checkbox from its hidden off value', () => {
    expect(readState(form([['repeatIncome', 'off']]), base).repeatIncome).toBe(false);
    expect(
      readState(
        form([
          ['repeatIncome', 'off'],
          ['repeatIncome', 'on'],
        ]),
        base,
      ).repeatIncome,
    ).toBe(true);
  });

  it('validates each step', () => {
    expect(validateStep(1, { ...base, currency: 'XXQ' })).toEqual({ currency: 'onboarding.errorCurrency' });
    expect(validateStep(2, { ...base, income: '-5' })).toEqual({ income: 'onboarding.errorAmount' });
    expect(validateStep(2, { ...base, income: '0' })).toEqual({ income: 'onboarding.errorAmount' });
    expect(validateStep(2, { ...base, savings: '0' })).toEqual({});
    expect(validateStep(2, base)).toEqual({});
    expect(validateStep(3, { ...base, categories: [] })).toEqual({
      categories: 'onboarding.errorCategories',
    });
  });

  it('points to the first step with an error', () => {
    const errors = validateAll({ ...base, income: 'abc', categories: [] });
    expect(stepOfError(errors)).toBe(2);
    expect(stepOfError({})).toBeNull();
  });
});

describe('database: onboarding, profile, isolation, limits', () => {
  const { db, client } = createDb({ url: ':memory:' });
  const now = new Date('2026-11-10T09:00:00Z');

  async function addUser(id: string) {
    await db.insert(user).values({ id, email: `${id}@example.com`, ageConfirmed: true });
    return ensureProfile(db, { id, locale: 'es' });
  }

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'drizzle' });
  });
  afterAll(() => client.close());

  it('creates one profile per user, in the sign-up language', async () => {
    const first = await addUser('u1');
    const again = await ensureProfile(db, { id: 'u1', locale: 'en' });
    expect(first.locale).toBe('es');
    expect(again).toEqual(first);
    expect(first.onboardingDone).toBe(false);
  });

  it('saves the onboarding once: profile, categories, this month’s income and the monthly rule', async () => {
    const state: OnboardingState = {
      ...base,
      locale: 'es',
      currency: 'USD',
      income: '1.850,00',
      savings: '2.500',
      categories: ['food', 'housing'],
    };
    await completeOnboarding(db, 'u1', state, names, now);
    await completeOnboarding(db, 'u1', state, names, now); // double submit: no duplicates

    const [row] = await db.select().from(profile).where(eq(profile.userId, 'u1'));
    expect(row).toMatchObject({
      currency: 'USD',
      locale: 'es',
      onboardingDone: true,
      startingSavingsCents: 250_000,
    });

    const cats = await db.select().from(category).where(eq(category.userId, 'u1')).orderBy(category.sort);
    expect(cats.map(({ name, sort }) => [name, sort])).toEqual([
      ['name:housing', 0],
      ['name:food', 1],
    ]);

    const [income] = await db.select().from(movement).where(eq(movement.userId, 'u1'));
    const rules = await db.select().from(recurring).where(eq(recurring.userId, 'u1'));
    expect(income).toMatchObject({
      type: 'income',
      amountCents: 185_000,
      date: '2026-11-01',
      categoryId: null,
    });
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ frequency: 'monthly', mode: 'auto', nextDate: '2026-12-01' });
    expect(income?.recurringId).toBe(rules[0]?.id);
  });

  it('notes a one-off income today when "repeat monthly" is off, and nothing without an income', async () => {
    await addUser('u2');
    await completeOnboarding(db, 'u2', { ...base, income: '300', repeatIncome: false }, names, now);
    const rows = await db.select().from(movement).where(eq(movement.userId, 'u2'));
    expect(rows.map(({ date, recurringId }) => [date, recurringId])).toEqual([['2026-11-10', null]]);
    expect(await db.select().from(recurring).where(eq(recurring.userId, 'u2'))).toEqual([]);

    await addUser('u3');
    await completeOnboarding(db, 'u3', base, names, now);
    expect(await db.select().from(movement).where(eq(movement.userId, 'u3'))).toEqual([]);
    expect(await db.select().from(category).where(eq(category.userId, 'u3'))).toHaveLength(12);
  });

  it('refuses invalid answers', async () => {
    await addUser('u4');
    await expect(completeOnboarding(db, 'u4', { ...base, categories: [] }, names, now)).rejects.toThrow();
    const [row] = await db.select().from(profile).where(eq(profile.userId, 'u4'));
    expect(row?.onboardingDone).toBe(false);
  });

  it('keeps users apart: one user’s onboarding never touches another user’s rows', async () => {
    const u1Cats = await db.select().from(category).where(eq(category.userId, 'u1'));
    const u2Cats = await db.select().from(category).where(eq(category.userId, 'u2'));
    expect(u1Cats).toHaveLength(2);
    expect(u2Cats).toHaveLength(12);
    expect(u1Cats.every((row) => row.userId === 'u1')).toBe(true);
  });

  it('marks activity at most every 15 minutes and clears inactivity warnings', async () => {
    const before = await addUser('u5');
    await db.update(profile).set({ warned25At: now }).where(eq(profile.userId, 'u5'));
    await touchActivity(db, { ...before, lastActiveAt: now }, new Date(now.getTime() + 60_000));
    let [row] = await db.select().from(profile).where(eq(profile.userId, 'u5'));
    expect(row?.warned25At).not.toBeNull();

    const later = new Date(now.getTime() + 16 * 60_000);
    await touchActivity(db, { ...before, lastActiveAt: now }, later);
    [row] = await db.select().from(profile).where(eq(profile.userId, 'u5'));
    expect(row?.lastActiveAt).toEqual(later);
    expect(row?.warned25At).toBeNull();
  });

  it('deleting a user removes every row of theirs (cascade)', async () => {
    await db.insert(session).values({ id: 's1', token: 't1', userId: 'u1', expiresAt: now });
    await db.delete(user).where(eq(user.id, 'u1'));
    for (const table of [profile, category, movement, recurring, session]) {
      expect(await db.select().from(table).where(eq(table.userId, 'u1'))).toEqual([]);
    }
    expect(await db.select().from(category).where(eq(category.userId, 'u2'))).toHaveLength(12);
  });

  it('rate-limits per key in fixed windows, atomically', async () => {
    const rule = { window: 60, max: 3 };
    const t0 = 1_000_000;
    const results = await Promise.all([1, 2, 3, 4].map(() => hitRateLimit(db, 'k', rule, t0)));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect(results.find((r) => !r.allowed)?.retryAfter).toBe(60);

    expect((await hitRateLimit(db, 'k', rule, t0 + 30_000)).retryAfter).toBe(30);
    expect((await hitRateLimit(db, 'k', rule, t0 + 60_000)).allowed).toBe(true);
    expect((await hitRateLimit(db, 'other', rule, t0)).allowed).toBe(true);

    const keys = await db.select({ key: rateLimit.key }).from(rateLimit);
    expect(keys.map(({ key }) => key).sort()).toEqual(['app:k', 'app:other']);
  });
});
