import { describe, expect, it } from 'vitest';
import { alertMessage } from '../../src/lib/plan/alerts';
import {
  alertKey,
  alertsToShow,
  budgetAfterSave,
  budgetRows,
  globalBudget,
  goalPct,
  goalTip,
  newAlerts,
  reachedLevels,
} from '../../src/lib/plan/calc';
import { useTranslations } from '../../src/i18n';

const limits = [
  { id: 'b-food', categoryId: 'food', limitCents: 30_000 },
  { id: 'b-fun', categoryId: 'fun', limitCents: 10_000 },
  { id: 'b-home', categoryId: 'home', limitCents: 100_000 },
  { id: 'b-all', categoryId: null, limitCents: 150_000 },
];

describe('goals', () => {
  it('goalPct rounds saved / target', () => {
    expect(goalPct(35_000, 120_000)).toBe(29);
    expect(goalPct(0, 120_000)).toBe(0);
    expect(goalPct(130_000, 120_000)).toBe(108);
  });

  it('with a deadline, the tip is monthlyNeed', () => {
    const goal = {
      targetCents: 120_000,
      savedCents: 35_000,
      deadline: '2027-06-10',
      firstDate: '2026-10-02',
    };
    // 85,000 left over 7 whole months (10 Nov → 10 Jun) = 12,142.86 → 12,143.
    expect(goalTip(goal, '2026-11-10')).toEqual({ kind: 'need', cents: 12_143 });
  });

  it('without a deadline, the tip projects the average monthly pace', () => {
    // 30,000 saved since 10 Sep (2 months) = 15,000 a month; 90,000 left → 6 more months.
    const goal = { targetCents: 120_000, savedCents: 30_000, deadline: null, firstDate: '2026-09-10' };
    expect(goalTip(goal, '2026-11-10')).toEqual({ kind: 'pace', month: '2027-05' });
  });

  it('a first contribution this month counts as one month of pace', () => {
    const goal = { targetCents: 40_000, savedCents: 10_000, deadline: null, firstDate: '2026-11-10' };
    expect(goalTip(goal, '2026-11-10')).toEqual({ kind: 'pace', month: '2027-02' });
  });

  it('no deadline and nothing saved asks for a first contribution; a reached goal says so', () => {
    expect(goalTip({ targetCents: 1, savedCents: 0, deadline: null, firstDate: null }, '2026-11-10')).toEqual(
      {
        kind: 'start',
      },
    );
    expect(
      goalTip(
        { targetCents: 500, savedCents: 500, deadline: '2027-01-01', firstDate: '2026-11-01' },
        '2026-11-10',
      ),
    ).toEqual({
      kind: 'reached',
    });
  });
});

describe('budgets', () => {
  const spent = { food: 24_600, fun: 11_500, home: 30_000, other: 9_999 };

  it('budgetRows: one row per category budget, highest % first, colors by level', () => {
    const rows = budgetRows(limits, spent);
    expect(rows.map((r) => [r.categoryId, r.pct, r.level, r.leftCents])).toEqual([
      ['fun', 115, 'over', -1_500],
      ['food', 82, 'warning', 5_400],
      ['home', 30, 'ok', 70_000],
    ]);
  });

  it('a budget with nothing spent is at 0 %', () => {
    expect(budgetRows([{ id: 'b', categoryId: 'x', limitCents: 100 }], {})[0]).toMatchObject({
      pct: 0,
      spentCents: 0,
    });
  });

  it('globalBudget: left and about X a day; nothing a day when over', () => {
    expect(globalBudget(150_000, 66_100, 21)).toMatchObject({
      pct: 44,
      leftCents: 83_900,
      perDayCents: 3_995,
    });
    expect(globalBudget(150_000, 160_000, 21)).toMatchObject({
      pct: 107,
      leftCents: -10_000,
      perDayCents: null,
      level: 'over',
    });
    expect(globalBudget(150_000, 0, 0).perDayCents).toBeNull();
  });

  it('the editor notice shows from 80 % and leaves out the movement being edited', () => {
    expect(budgetAfterSave(30_000, 20_000, 3_000)).toBeNull(); // 77 %
    expect(budgetAfterSave(30_000, 20_000, 4_000)).toBe(80);
    expect(budgetAfterSave(10_000, 9_000, 2_500)).toBe(115);
    // Editing a 5,000 expense down to 1,000: 26,000 − 5,000 + 1,000 = 22,000 → 73 %.
    expect(budgetAfterSave(30_000, 26_000, 1_000, 5_000)).toBeNull();
    expect(budgetAfterSave(0, 100, 100)).toBeNull();
  });
});

describe('alerts once per cycle', () => {
  it('reachedLevels', () => {
    expect(reachedLevels(79)).toEqual([]);
    expect(reachedLevels(80)).toEqual([80]);
    expect(reachedLevels(100)).toEqual([80, 100]);
  });

  it('newAlerts gives only levels not seen in the cycle', () => {
    const rows = budgetRows(limits, { food: 24_600, fun: 11_500 });
    expect(newAlerts(rows, new Set())).toEqual([
      { budgetId: 'b-fun', categoryId: 'fun', level: 80, pct: 115 },
      { budgetId: 'b-fun', categoryId: 'fun', level: 100, pct: 115 },
      { budgetId: 'b-food', categoryId: 'food', level: 80, pct: 82 },
    ]);
    const seen = new Set([alertKey('b-fun', 80), alertKey('b-fun', 100), alertKey('b-food', 80)]);
    expect(newAlerts(rows, seen)).toEqual([]);
    // Food later crosses 100 %: only that level is new.
    expect(newAlerts(budgetRows(limits, { food: 31_000, fun: 11_500 }), seen)).toEqual([
      { budgetId: 'b-food', categoryId: 'food', level: 100, pct: 103 },
    ]);
  });

  it('the toast shows one alert per budget, the highest level, and words several as one', () => {
    const alerts = newAlerts(budgetRows(limits, { food: 24_600, fun: 11_500 }), new Set());
    expect(alertsToShow(alerts).map((a) => [a.categoryId, a.level])).toEqual([
      ['fun', 100],
      ['food', 80],
    ]);
    const names = (id: string) => ({ food: 'Food', fun: 'Leisure' })[id] ?? '';
    const en = useTranslations('en');
    expect(alertMessage(alerts, names, en)).toBe('2 budgets need a look. Open Plan to see them.');
    expect(alertMessage(alerts.slice(2), names, en)).toBe('Food is at 82 % of its budget.');
    expect(alertMessage(alerts.slice(0, 2), names, useTranslations('es'))).toBe(
      'Leisure se ha pasado de su presupuesto: 115 %.',
    );
    expect(alertMessage([], names, en)).toBeNull();
  });
});
