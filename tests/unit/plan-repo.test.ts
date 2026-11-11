import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cycleFigures } from '../../src/lib/calc';
import { cycleStartingIn } from '../../src/lib/cycle';
import { createDb } from '../../src/lib/db/client';
import { alertSeen, category, goal, movement, user } from '../../src/lib/db/schema';
import { loadHome } from '../../src/lib/home/repo';
import { ulid } from '../../src/lib/id';
import {
  budgetStatus,
  createContribution,
  createGoal,
  deleteContribution,
  deleteGoal,
  listContributions,
  loadPlan,
  markAlertsRead,
  saveBudgets,
  syncAlerts,
  unreadAlerts,
  updateContribution,
  updateGoal,
} from '../../src/lib/plan/repo';

const { db, client } = createDb({ url: ':memory:' });
const nov = cycleStartingIn('2026-11', 25); // 25 Nov – 24 Dec
const oct = cycleStartingIn('2026-10', 25); // 25 Oct – 24 Nov

async function seedUser(name: string) {
  const id = ulid();
  await db.insert(user).values({ id, email: `${name}-${id}@example.com`, ageConfirmed: true });
  const food = ulid();
  const fun = ulid();
  await db.insert(category).values([
    { id: food, userId: id, name: 'Food', icon: 'utensils', color: 'c1' },
    { id: fun, userId: id, name: 'Leisure', icon: 'ticket', color: 'c2' },
  ]);
  await db.insert(movement).values([
    { id: ulid(), userId: id, type: 'income', amountCents: 185_000, date: '2026-11-25' },
    { id: ulid(), userId: id, type: 'expense', amountCents: 20_000, categoryId: food, date: '2026-11-26' },
    // Belongs to the October cycle (start day 25): not counted in November's budgets.
    { id: ulid(), userId: id, type: 'expense', amountCents: 9_000, categoryId: food, date: '2026-11-24' },
  ]);
  return { id, food, fun };
}

const goalInput = (pinned = false) => ({
  id: ulid(),
  name: 'Trip',
  icon: 'plane' as const,
  color: 5,
  targetCents: 50_000,
  deadline: null,
  pinned,
});

/** The editable fields (an edit never sends the id). */
const goalFields = (pinned = false) => ({
  name: 'Trip',
  icon: 'plane' as const,
  color: 5,
  targetCents: 50_000,
  deadline: null,
  pinned,
});

let alice: Awaited<ReturnType<typeof seedUser>>;
let bob: Awaited<ReturnType<typeof seedUser>>;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: 'drizzle' });
  alice = await seedUser('alice');
  bob = await seedUser('bob');
});
afterAll(() => client.close());

describe('set-aside math', () => {
  it('contributions lower available, not expenses or savings', async () => {
    const created = await createGoal(db, alice.id, goalInput());
    if (!created.ok) throw new Error(created.error);
    const before = await loadHome(db, alice.id, nov, oct);
    const figuresBefore = cycleFigures(before.movements, before.setAsideCents, nov, '2026-11-30');

    await createContribution(db, alice.id, created.goal.id, {
      id: ulid(),
      amountCents: 15_000,
      date: '2026-11-28',
    });
    // Outside the cycle: counts for the goal, not for November's set-aside.
    await createContribution(db, alice.id, created.goal.id, {
      id: ulid(),
      amountCents: 5_000,
      date: '2026-11-20',
    });

    const after = await loadHome(db, alice.id, nov, oct);
    const figures = cycleFigures(after.movements, after.setAsideCents, nov, '2026-11-30');
    expect(after.setAsideCents).toBe(15_000);
    expect(figures.expenseCents).toBe(figuresBefore.expenseCents);
    expect(figures.savingsCents).toBe(figuresBefore.savingsCents);
    expect(figures.availableCents).toBe(figuresBefore.availableCents - 15_000);

    const plan = await loadPlan(db, alice.id, nov);
    expect(plan.goals[0]).toMatchObject({ savedCents: 20_000, firstDate: '2026-11-20', completedAt: null });
    expect(plan.totalSpentCents).toBe(20_000);
    await deleteGoal(db, alice.id, created.goal.id);
  });
});

describe('goals', () => {
  it('completion follows what is saved, both ways', async () => {
    const created = await createGoal(db, alice.id, goalInput());
    if (!created.ok) throw new Error(created.error);
    const id = created.goal.id;
    const c1 = ulid();
    const first = await createContribution(db, alice.id, id, {
      id: c1,
      amountCents: 30_000,
      date: '2026-11-26',
    });
    expect(first.ok && first.goal.completedAt).toBeNull();
    const second = await createContribution(db, alice.id, id, {
      id: ulid(),
      amountCents: 20_000,
      date: '2026-11-27',
    });
    expect(second.ok && second.goal.completedAt).toEqual(expect.any(String));

    const edited = await updateContribution(db, alice.id, c1, { amountCents: 10_000, date: '2026-11-26' });
    expect(edited.ok && edited.goal).toMatchObject({ savedCents: 30_000, completedAt: null });

    const raisedTarget = await updateGoal(db, alice.id, id, { ...goalFields(), targetCents: 30_000 });
    expect(raisedTarget.ok && raisedTarget.goal.completedAt).toEqual(expect.any(String));

    const afterDelete = await deleteContribution(db, alice.id, c1);
    expect(afterDelete).toMatchObject({ savedCents: 20_000, completedAt: null });
    expect(await listContributions(db, alice.id, id)).toHaveLength(1);
    expect(await deleteGoal(db, alice.id, id)).toBe(true);
  });

  it('at most one goal is pinned: pinning another unpins the first', async () => {
    const a = await createGoal(db, alice.id, goalInput(true));
    const b = await createGoal(db, alice.id, goalInput(true));
    if (!a.ok || !b.ok) throw new Error('not created');
    const pinned = await db.select({ id: goal.id }).from(goal).where(eq(goal.pinned, true));
    expect(pinned.filter((row) => [a.goal.id, b.goal.id].includes(row.id))).toEqual([{ id: b.goal.id }]);
    await deleteGoal(db, alice.id, a.goal.id);
    await deleteGoal(db, alice.id, b.goal.id);
  });

  it('refuses more than 20 goals and repeats an identical create (lost response)', async () => {
    const owner = await seedUser('many');
    const first = goalInput();
    expect((await createGoal(db, owner.id, first)).ok).toBe(true);
    expect((await createGoal(db, owner.id, first)).ok).toBe(true);
    for (let i = 1; i < 20; i += 1) await createGoal(db, owner.id, goalInput());
    expect(await createGoal(db, owner.id, goalInput())).toEqual({ ok: false, error: 'LIMIT_REACHED' });
  });
});

describe('budgets and alerts', () => {
  it('saves every limit at once, keeps ids on changes and drops left-out categories', async () => {
    const saved = await saveBudgets(db, alice.id, {
      globalCents: 150_000,
      categories: [
        { categoryId: alice.food, limitCents: 30_000 },
        { categoryId: alice.fun, limitCents: 10_000 },
      ],
    });
    if (!saved.ok) throw new Error(saved.error);
    const foodId = saved.budgets.find((b) => b.categoryId === alice.food)?.id;

    const again = await saveBudgets(db, alice.id, {
      globalCents: null,
      categories: [{ categoryId: alice.food, limitCents: 25_000 }],
    });
    if (!again.ok) throw new Error(again.error);
    expect(again.budgets).toEqual([{ id: foodId, categoryId: alice.food, limitCents: 25_000 }]);

    const status = await budgetStatus(db, alice.id, nov);
    expect(status).toMatchObject({
      limits: [{ categoryId: alice.food, limitCents: 25_000 }],
      spent: { [alice.food]: 20_000 },
    });
  });

  it('refuses another user’s category', async () => {
    expect(
      await saveBudgets(db, alice.id, {
        globalCents: null,
        categories: [{ categoryId: bob.food, limitCents: 1 }],
      }),
    ).toEqual({ ok: false, error: 'INVALID_CATEGORY' });
  });

  it('each alert shows once per cycle, respecting the cycle start day', async () => {
    // Food: 20,000 of 25,000 = 80 % in November's cycle (the 9,000 on 24 Nov is October's).
    const first = await syncAlerts(db, alice.id, nov);
    expect(first.map((a) => [a.level, a.pct])).toEqual([[80, 80]]);
    expect(await syncAlerts(db, alice.id, nov)).toEqual([]);
    expect(await unreadAlerts(db, alice.id, nov)).toBe(1);

    await db.insert(movement).values({
      id: ulid(),
      userId: alice.id,
      type: 'expense',
      amountCents: 6_000,
      categoryId: alice.food,
      date: '2026-12-01',
    });
    expect((await syncAlerts(db, alice.id, nov)).map((a) => a.level)).toEqual([100]);
    expect(await syncAlerts(db, alice.id, nov)).toEqual([]);

    await markAlertsRead(db, alice.id, nov);
    expect(await unreadAlerts(db, alice.id, nov)).toBe(0);

    // The next cycle starts clean.
    const dec = cycleStartingIn('2026-12', 25);
    expect(await syncAlerts(db, alice.id, dec)).toEqual([]);
    // Concurrent page loads: one of them records each alert.
    const rows = await db.select().from(alertSeen).where(eq(alertSeen.userId, alice.id));
    expect(rows).toHaveLength(2);
  });

  it('two requests at once record each alert only once', async () => {
    const owner = await seedUser('race');
    await saveBudgets(db, owner.id, {
      globalCents: null,
      categories: [{ categoryId: owner.food, limitCents: 20_000 }],
    });
    const [a, b] = await Promise.all([syncAlerts(db, owner.id, nov), syncAlerts(db, owner.id, nov)]);
    expect([...a, ...b].map((x) => x.level).sort()).toEqual([100, 80]);
  });
});

describe('isolation', () => {
  it('another user’s goals and contributions behave as missing', async () => {
    const created = await createGoal(db, alice.id, goalInput());
    if (!created.ok) throw new Error(created.error);
    const id = created.goal.id;
    const contributionId = ulid();
    await createContribution(db, alice.id, id, {
      id: contributionId,
      amountCents: 1_000,
      date: '2026-11-26',
    });

    expect(await updateGoal(db, bob.id, id, goalFields())).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await deleteGoal(db, bob.id, id)).toBe(false);
    expect(
      await createContribution(db, bob.id, id, { id: ulid(), amountCents: 1, date: '2026-11-26' }),
    ).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(
      await updateContribution(db, bob.id, contributionId, { amountCents: 1, date: '2026-11-26' }),
    ).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await deleteContribution(db, bob.id, contributionId)).toBeNull();
    expect((await loadPlan(db, bob.id, nov)).goals.map((g) => g.id)).not.toContain(id);
    // Reusing another user's ids is refused, never merged.
    expect(await createGoal(db, bob.id, { ...goalInput(), id })).toEqual({ ok: false, error: 'ID_TAKEN' });
    expect(
      await createContribution(db, bob.id, id, { id: contributionId, amountCents: 1, date: '2026-11-26' }),
    ).toEqual({ ok: false, error: 'ID_TAKEN' });
    expect((await loadPlan(db, alice.id, nov)).goals.find((g) => g.id === id)?.savedCents).toBe(1_000);
  });
});
