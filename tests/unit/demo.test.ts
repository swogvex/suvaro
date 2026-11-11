import { describe, expect, it } from 'vitest';
import { cycleFigures } from '../../src/lib/calc';
import { buildDemoState } from '../../src/lib/demo/fixture';
import { demoHref } from '../../src/lib/demo/client';
import {
  currentCycleOf,
  handleDemoRequest,
  homeData,
  planData,
  type DemoState,
} from '../../src/lib/demo/store';
import { shiftCycle } from '../../src/lib/cycle';
import { ulid } from '../../src/lib/id';
import { sampleMonth } from '../../src/lib/site';

function figures(state: DemoState) {
  const cycle = currentCycleOf(state);
  const home = homeData(state, cycle, shiftCycle(cycle, -1, state.startDay));
  return { home, ...cycleFigures(home.movements, home.setAsideCents, cycle, state.today) };
}

async function call(state: DemoState, method: string, path: string, body: unknown = null) {
  const response = handleDemoRequest(
    state,
    new URL(path, 'http://demo.test'),
    method,
    body as Record<string, unknown>,
  );
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}

describe('demo sample month', () => {
  for (const today of ['2026-11-01', '2026-11-04', '2026-11-11', '2026-02-28', '2026-12-31']) {
    it(`matches the design's sample month on ${today}`, () => {
      const state = buildDemoState(today, 'en');
      const result = figures(state);
      expect(result.incomeCents).toBe(sampleMonth.incomeCents);
      expect(result.expenseCents).toBe(sampleMonth.expensesCents);
      expect(result.setAsideCents).toBe(sampleMonth.setAsideCents);
      expect(result.availableCents).toBe(sampleMonth.availableCents);
      expect(state.movements.every((m) => m.date <= today)).toBe(true);
      const food = state.categories.find((c) => c.name === 'Food');
      const plan = planData(state);
      expect(plan.spent[food?.id ?? '']).toBe(sampleMonth.foodSpentCents);
      expect(plan.budgets.find((b) => b.categoryId === food?.id)?.limitCents).toBe(
        sampleMonth.foodLimitCents,
      );
      expect(state.pending).toHaveLength(1);
      expect(result.home.goal?.savedCents).toBe(45_000);
    });
  }

  it('speaks Spanish in /es/demo', () => {
    const state = buildDemoState('2026-11-11', 'es');
    expect(state.categories.map((c) => c.name)).toContain('Comida');
    expect(state.movements.some((m) => m.note === 'Nómina')).toBe(true);
  });
});

describe('demo API in memory', () => {
  it('creates, edits and deletes a movement; Home follows', async () => {
    const state = buildDemoState('2026-11-11', 'en');
    const id = ulid();
    const food = state.categories[1]?.id;
    const created = await call(state, 'POST', '/api/movements', {
      id,
      type: 'expense',
      amountCents: 1_000,
      categoryId: food,
      date: '2026-11-11',
      note: 'Coffee',
    });
    expect(created.status).toBe(201);
    expect(figures(state).availableCents).toBe(sampleMonth.availableCents - 1_000);
    expect(
      (await call(state, 'PATCH', `/api/movements/${id}`, { ...created.data.movement, amountCents: 500 }))
        .status,
    ).toBe(200);
    expect(figures(state).availableCents).toBe(sampleMonth.availableCents - 500);
    expect((await call(state, 'DELETE', `/api/movements/${id}`)).status).toBe(204);
    expect(figures(state).availableCents).toBe(sampleMonth.availableCents);
    expect((await call(state, 'DELETE', `/api/movements/${id}`)).status).toBe(404);
  });

  it('lists months, searches, and answers stats and plan', async () => {
    const state = buildDemoState('2026-11-11', 'en');
    const list = await call(state, 'GET', '/api/movements');
    expect(list.data.month).toBe('2026-11');
    expect(list.data.next).toBe('2026-10');
    expect(list.data.summary.count).toBe(state.movements.length);
    expect((await call(state, 'GET', '/api/movements?month=2026-06')).data.items.length).toBeGreaterThan(10);
    expect((await call(state, 'GET', '/api/search?q=rent')).data.movements.length).toBeGreaterThan(0);
    const stats = await call(state, 'GET', '/api/stats');
    expect(stats.data.months).toHaveLength(6);
    expect(stats.data.totals.expenseCents).toBe(sampleMonth.expensesCents);
    expect((await call(state, 'GET', '/api/stats?period=nope')).status).toBe(400);
    expect((await call(state, 'GET', '/api/plan')).data.goals).toHaveLength(3);
  });

  it('confirms the pending gym and contributes to a goal', async () => {
    const state = buildDemoState('2026-11-11', 'en');
    const pending = state.pending[0];
    const confirmed = await call(state, 'POST', `/api/recurring-pending/${pending?.id}`);
    expect(confirmed.status).toBe(201);
    expect(confirmed.data.movement.date).toBe(pending?.dueDate);
    expect(state.pending).toHaveLength(0);
    const goal = state.goals[0];
    const added = await call(state, 'POST', `/api/goals/${goal?.id}/contributions`, {
      id: ulid(),
      amountCents: 75_000,
      date: '2026-11-11',
    });
    expect(added.data.goal.savedCents).toBe(120_000);
    expect(added.data.goal.completedAt).not.toBeNull();
  });

  it('refuses what the demo does not offer', async () => {
    const state = buildDemoState('2026-11-11', 'en');
    expect((await call(state, 'PATCH', '/api/profile', { mode: 'dark' })).status).toBe(403);
    expect((await call(state, 'DELETE', '/api/account', { userId: 'x' })).status).toBe(403);
  });

  it('keeps links inside the demo', () => {
    expect(demoHref('/app', '/demo')).toBe('/demo');
    expect(demoHref('/app/stats?period=week', '/es/demo')).toBe('/es/demo/stats?period=week');
    expect(demoHref('/apple', '/demo')).toBe('/apple');
    expect(demoHref('/sign-in', '/demo')).toBe('/sign-in');
  });
});
