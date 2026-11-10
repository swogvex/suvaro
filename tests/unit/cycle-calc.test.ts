import { describe, expect, it } from 'vitest';
import {
  budgetsAtRisk,
  compareWithPrevious,
  cumulativeExpenses,
  cycleFigures,
  dailyExpenses,
  dailyAllowance,
  daysSoFar,
  mainIncome,
  monthlyNeed,
  monthsUntil,
} from '../../src/lib/calc';
import {
  cycleLength,
  cycleMonth,
  cycleOf,
  cycleStartingIn,
  dayOfCycle,
  daysLeft,
  normalizeStartDay,
  shiftCycle,
} from '../../src/lib/cycle';
import { formatMoney } from '../../src/lib/money';
import type { Movement } from '../../src/lib/movements/model';

let next = 0;
function m(
  type: Movement['type'],
  amountCents: number,
  date: string,
  categoryId: string | null = null,
): Movement {
  next += 1;
  return { id: `m${next}`, type, amountCents, date, categoryId, note: '', recurring: false };
}

describe('cycles', () => {
  it('a cycle starting on day 1 is the calendar month', () => {
    expect(cycleOf('2026-11-10', 1)).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(cycleOf('2026-02-28', 1)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(cycleOf('2028-02-29', 1)).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });

  it('a cycle starting on day 25 runs to the 24th of the next month', () => {
    expect(cycleOf('2026-11-10', 25)).toEqual({ start: '2026-10-25', end: '2026-11-24' });
    expect(cycleOf('2026-11-25', 25)).toEqual({ start: '2026-11-25', end: '2026-12-24' });
    expect(cycleOf('2026-11-24', 25)).toEqual({ start: '2026-10-25', end: '2026-11-24' });
    expect(cycleOf('2027-01-03', 25)).toEqual({ start: '2026-12-25', end: '2027-01-24' });
    expect(cycleOf('2026-03-27', 28)).toEqual({ start: '2026-02-28', end: '2026-03-27' });
  });

  it('shifts across years and keeps the start day', () => {
    const cycle = cycleStartingIn('2026-01', 15);
    expect(shiftCycle(cycle, -1, 15)).toEqual({ start: '2025-12-15', end: '2026-01-14' });
    expect(shiftCycle(cycle, 12, 15)).toEqual({ start: '2027-01-15', end: '2027-02-14' });
    expect(cycleMonth(cycle)).toBe('2026-01');
  });

  it('length, day of cycle and days left (both ends included)', () => {
    const feb = cycleStartingIn('2026-02', 10); // 10 Feb – 9 Mar
    expect(cycleLength(feb)).toBe(28);
    expect(dayOfCycle('2026-02-10', feb)).toBe(1);
    expect(dayOfCycle('2026-03-09', feb)).toBe(28);
    const nov = cycleStartingIn('2026-11', 1);
    expect(daysLeft(nov, '2026-11-10')).toBe(21);
    expect(daysLeft(nov, '2026-11-30')).toBe(1);
    expect(daysLeft(nov, '2026-12-01')).toBe(0);
    expect(daysLeft(nov, '2026-10-31')).toBe(30);
  });

  it('clamps a start day outside 1–28', () => {
    expect(normalizeStartDay(31)).toBe(28);
    expect(normalizeStartDay(0)).toBe(1);
    expect(normalizeStartDay(2.5)).toBe(1);
  });
});

describe('Home figures', () => {
  const nov = cycleStartingIn('2026-11', 1);

  it('the sample month gives 487.60 available, 637.60 savings and about 23 a day', () => {
    const movements = [
      m('income', 185_000, '2026-11-01'),
      m('expense', 85_000, '2026-11-01', 'housing'),
      m('expense', 24_600, '2026-11-08', 'food'),
      m('expense', 11_640, '2026-11-09', 'leisure'),
      m('income', 999_999, '2026-10-31'), // previous cycle: ignored
    ];
    const figures = cycleFigures(movements, 15_000, nov, '2026-11-10');
    expect(figures).toEqual({
      incomeCents: 185_000,
      expenseCents: 121_240,
      setAsideCents: 15_000,
      savingsCents: 63_760,
      availableCents: 48_760,
      daysLeft: 21,
      dailyAllowCents: 2_321,
    });
    expect(formatMoney(figures.availableCents, 'en')).toBe('€487.60');
    expect(formatMoney(figures.savingsCents, 'es')).toBe('637,60 €');
    expect(formatMoney(figures.dailyAllowCents ?? 0, 'en', { wholeUnits: true })).toBe('€23');
  });

  it('the daily allowance rounds down, goes negative when over, and stops once the cycle ends', () => {
    expect(dailyAllowance(100, 3)).toBe(33);
    expect(dailyAllowance(-100, 3)).toBe(-34);
    expect(dailyAllowance(48_760, 0)).toBeNull();
    expect(cycleFigures([], 0, nov, '2026-12-02').dailyAllowCents).toBeNull();
  });

  it('zero data gives zeros', () => {
    expect(cycleFigures([], 0, nov, '2026-11-10')).toMatchObject({
      incomeCents: 0,
      expenseCents: 0,
      availableCents: 0,
      dailyAllowCents: 0,
    });
  });

  it('cumulative spending per day ignores income and other cycles', () => {
    const movements = [
      m('expense', 500, '2026-11-01'),
      m('income', 9_999, '2026-11-02'),
      m('expense', 250, '2026-11-03'),
      m('expense', 100, '2026-11-03'),
      m('expense', 7_777, '2026-12-01'),
    ];
    expect(cumulativeExpenses(movements, nov, 4)).toEqual([500, 500, 850, 850]);
    expect(dailyExpenses(movements, nov).slice(0, 4)).toEqual([500, 0, 350, 0]);
    expect(dailyExpenses(movements, nov)).toHaveLength(30);
  });

  it('compares spending with the previous cycle by the same day', () => {
    const oct = cycleStartingIn('2026-10', 1);
    const current = [m('expense', 10_360, '2026-11-02'), m('expense', 5_000, '2026-11-11')];
    const previous = [m('expense', 10_000, '2026-10-09'), m('expense', 50_000, '2026-10-10')];
    const result = compareWithPrevious(current, nov, dailyExpenses(previous, oct), '2026-11-09');
    expect(result).toMatchObject({ day: 9, currentCents: 10_360, previousCents: 10_000 });
    expect(result.change).toBeCloseTo(0.036);
  });

  it('compares a longer cycle with a shorter one up to its last day', () => {
    const feb = cycleStartingIn('2026-02', 1);
    const mar = cycleStartingIn('2026-03', 1);
    const result = compareWithPrevious(
      [],
      mar,
      dailyExpenses([m('expense', 100, '2026-02-28')], feb),
      '2026-03-31',
    );
    expect(result).toMatchObject({ day: 31, previousCents: 100, change: -1 });
    expect(compareWithPrevious([], mar, dailyExpenses([], feb), '2026-03-05').change).toBeNull();
    // A past cycle compares whole cycles.
    expect(daysSoFar(feb, '2026-11-10')).toBe(28);
  });

  it('cycle start ≠ 1: totals follow the cycle, not the calendar month', () => {
    const cycle = cycleOf('2026-11-10', 25); // 25 Oct – 24 Nov
    const movements = [
      m('income', 200_000, '2026-10-25'),
      m('expense', 1_000, '2026-10-24'), // previous cycle
      m('expense', 3_000, '2026-11-24'),
      m('expense', 9_000, '2026-11-25'), // next cycle
    ];
    expect(cycleFigures(movements, 0, cycle, '2026-11-10')).toMatchObject({
      incomeCents: 200_000,
      expenseCents: 3_000,
      daysLeft: 15,
    });
  });

  it('budgets at risk: ≥ 80 %, highest first, at most 3, global limit left out', () => {
    const movements = [
      m('expense', 24_600, '2026-11-08', 'food'),
      m('expense', 9_700, '2026-11-08', 'leisure'),
      m('expense', 4_000, '2026-11-08', 'transport'),
      m('expense', 6_000, '2026-11-08', 'health'),
      m('expense', 1_000, '2026-11-08', 'gifts'),
      m('expense', 99_999, '2026-10-30', 'gifts'),
    ];
    const budgets = [
      { categoryId: null, limitCents: 1 },
      { categoryId: 'food', limitCents: 30_000 }, // 82 %
      { categoryId: 'leisure', limitCents: 10_000 }, // 97 %
      { categoryId: 'transport', limitCents: 5_000 }, // 80 %
      { categoryId: 'health', limitCents: 5_000 }, // 120 %
      { categoryId: 'gifts', limitCents: 5_000 }, // 20 %
    ];
    const risks = budgetsAtRisk(budgets, movements, nov);
    expect(risks.map((r) => [r.categoryId, r.pct])).toEqual([
      ['health', 120],
      ['leisure', 97],
      ['food', 82],
    ]);
    expect(risks[1]).toMatchObject({ leftCents: 300 });
    expect(risks[0]).toMatchObject({ leftCents: -1_000 });
  });

  it('months until a deadline and the monthly need', () => {
    expect(monthsUntil('2026-11-10', '2027-03-10')).toBe(4);
    expect(monthsUntil('2026-11-10', '2027-03-05')).toBe(3);
    expect(monthsUntil('2026-11-10', '2026-11-20')).toBe(1);
    expect(monthsUntil('2026-11-10', '2025-01-01')).toBe(1);
    expect(monthsUntil('2026-01-31', '2026-02-28')).toBe(1);
    expect(monthlyNeed(120_000, 30_001, '2027-05-10', '2026-11-10')).toBe(15_000);
    expect(monthlyNeed(100, 100, '2027-05-10', '2026-11-10')).toBe(0);
    expect(monthlyNeed(100, 0, null, '2026-11-10')).toBeNull();
  });

  it('main income is the largest of the cycle', () => {
    const salary = m('income', 185_000, '2026-11-01');
    const movements = [m('income', 5_000, '2026-11-03'), salary, m('income', 185_000, '2026-11-20')];
    expect(mainIncome(movements, nov)).toBe(salary);
    expect(mainIncome([], nov)).toBeNull();
  });
});
