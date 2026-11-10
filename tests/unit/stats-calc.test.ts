import { describe, expect, it } from 'vitest';
import { cycleStartingIn } from '../../src/lib/cycle';
import { todayIn } from '../../src/lib/dates';
import {
  averageIncome,
  categoryComparison,
  categoryTrends,
  lastBarCycle,
  monthBars,
  savingsRate,
  savingsSeries,
  sums,
  type StatsRow,
} from '../../src/lib/stats/calc';
import {
  choosePeriod,
  daysSoFar,
  periodLength,
  periodOf,
  periodQuery,
  shiftPeriod,
  type Period,
  type PeriodSettings,
} from '../../src/lib/stats/period';

const monthly: PeriodSettings = { startDay: 1, weekStart: 1 };
const payday: PeriodSettings = { startDay: 25, weekStart: 1 };

const expense = (amountCents: number, date: string, categoryId: string | null = 'food'): StatsRow => ({
  type: 'expense',
  amountCents,
  categoryId,
  date,
});
const income = (amountCents: number, date: string): StatsRow => ({
  type: 'income',
  amountCents,
  categoryId: null,
  date,
});

const query = (text: string) => new URLSearchParams(text);

describe('periods', () => {
  it('weeks start on Monday by default and on Sunday when the profile says so', () => {
    // 2026-11-10 is a Tuesday.
    expect(periodOf('week', '2026-11-10', monthly)).toEqual({
      kind: 'week',
      start: '2026-11-09',
      end: '2026-11-15',
    });
    expect(periodOf('week', '2026-11-09', monthly).start).toBe('2026-11-09');
    expect(periodOf('week', '2026-11-15', monthly).start).toBe('2026-11-09');
    expect(periodOf('week', '2026-11-10', { ...monthly, weekStart: 7 })).toEqual({
      kind: 'week',
      start: '2026-11-08',
      end: '2026-11-14',
    });
    // Across a year end.
    expect(periodOf('week', '2027-01-01', monthly)).toEqual({
      kind: 'week',
      start: '2026-12-28',
      end: '2027-01-03',
    });
  });

  it('a month is the user’s cycle', () => {
    expect(periodOf('month', '2026-11-10', monthly)).toEqual({
      kind: 'month',
      start: '2026-11-01',
      end: '2026-11-30',
    });
    expect(periodOf('month', '2026-11-10', payday)).toEqual({
      kind: 'month',
      start: '2026-10-25',
      end: '2026-11-24',
    });
    expect(periodOf('month', '2026-11-25', payday).start).toBe('2026-11-25');
  });

  it('a year is the twelve cycles that start in it', () => {
    expect(periodOf('year', '2026-11-10', monthly)).toEqual({
      kind: 'year',
      start: '2026-01-01',
      end: '2026-12-31',
    });
    expect(periodOf('year', '2026-11-10', payday)).toEqual({
      kind: 'year',
      start: '2026-01-25',
      end: '2027-01-24',
    });
    // 10 January 2027 still belongs to the cycle that started on 25 December 2026.
    expect(periodOf('year', '2027-01-10', payday).start).toBe('2026-01-25');
  });

  it('moves by whole periods; a custom range by its own length', () => {
    const week = periodOf('week', '2026-11-10', monthly);
    expect(shiftPeriod(week, -1, monthly)).toEqual({ kind: 'week', start: '2026-11-02', end: '2026-11-08' });
    const march = periodOf('month', '2026-03-10', monthly);
    expect(shiftPeriod(march, -1, monthly)).toEqual({
      kind: 'month',
      start: '2026-02-01',
      end: '2026-02-28',
    });
    expect(shiftPeriod(periodOf('year', '2026-05-01', payday), -1, payday)).toEqual({
      kind: 'year',
      start: '2025-01-25',
      end: '2026-01-24',
    });
    const custom: Period = { kind: 'custom', start: '2026-11-01', end: '2026-11-10' };
    expect(periodLength(custom)).toBe(10);
    expect(shiftPeriod(custom, -1, monthly)).toEqual({
      kind: 'custom',
      start: '2026-10-22',
      end: '2026-10-31',
    });
  });

  it('counts the days that have happened', () => {
    const nov = periodOf('month', '2026-11-10', monthly);
    expect(daysSoFar(nov, '2026-11-10')).toBe(10);
    expect(daysSoFar(nov, '2026-12-03')).toBe(30);
    expect(daysSoFar(nov, '2026-10-31')).toBe(0);
  });

  it('“today” depends on the user’s time zone', () => {
    const now = new Date('2026-11-30T23:30:00Z');
    expect(periodOf('month', todayIn('Europe/Madrid', now), monthly).start).toBe('2026-12-01');
    expect(periodOf('month', todayIn('America/New_York', now), monthly).start).toBe('2026-11-01');
    // Sunday 29 November in New York is still the week of the 23rd; Monday 30 in Tokyo starts a new one.
    const sunday = new Date('2026-11-29T20:00:00Z');
    expect(periodOf('week', todayIn('America/New_York', sunday), monthly).start).toBe('2026-11-23');
    expect(periodOf('week', todayIn('Asia/Tokyo', sunday), monthly).start).toBe('2026-11-30');
  });
});

describe('period query', () => {
  const today = '2026-11-10';

  it('defaults to the current cycle', () => {
    expect(choosePeriod(query(''), payday, today)).toEqual({
      period: { kind: 'month', start: '2026-10-25', end: '2026-11-24' },
      previous: { kind: 'month', start: '2026-09-25', end: '2026-10-24' },
    });
  });

  it('reads week, year and custom periods', () => {
    expect(choosePeriod(query('period=week&date=2026-11-04'), monthly, today)?.period.start).toBe(
      '2026-11-02',
    );
    expect(choosePeriod(query('period=year'), monthly, today)?.period.start).toBe('2026-01-01');
    expect(
      choosePeriod(query('period=custom&from=2026-10-01&to=2026-11-30'), monthly, today)?.previous,
    ).toEqual({
      kind: 'custom',
      start: '2026-08-01',
      end: '2026-09-30',
    });
  });

  it('refuses bad or future queries', () => {
    for (const text of [
      'period=day',
      'period=week&date=2026-02-30',
      'period=week&date=2026-11-16',
      'period=custom&from=2026-11-10',
      'period=custom&from=2026-11-10&to=2026-11-01',
      'period=custom&from=2025-01-01&to=2026-01-02',
      'period=custom&from=2026-11-11&to=2026-11-12',
      'period=custom&from=2026-11-01&to=2026-11-02&date=2026-11-01',
      'period=month&from=2026-11-01',
      'period=month&period=week',
      'cycle=2026-10',
    ]) {
      expect(choosePeriod(query(text), monthly, today), text).toBeNull();
    }
    // A range may end after today: it only counts what has happened.
    expect(choosePeriod(query('period=custom&from=2026-11-01&to=2026-11-30'), monthly, today)).not.toBeNull();
  });

  it('writes the shortest query back', () => {
    const settings = monthly;
    expect(periodQuery(periodOf('month', today, settings), today, settings)).toBe('');
    expect(periodQuery(periodOf('week', today, settings), today, settings)).toBe('?period=week');
    expect(periodQuery(periodOf('month', '2026-10-03', settings), today, settings)).toBe(
      '?period=month&date=2026-10-01',
    );
    expect(periodQuery({ kind: 'custom', start: '2026-10-01', end: '2026-10-31' }, today, settings)).toBe(
      '?period=custom&from=2026-10-01&to=2026-10-31',
    );
    const round = choosePeriod(
      query(periodQuery(periodOf('year', '2025-03-01', settings), today, settings)),
      settings,
      today,
    );
    expect(round?.period).toEqual(periodOf('year', '2025-03-01', settings));
  });
});

describe('aggregates', () => {
  const nov = periodOf('month', '2026-11-10', monthly);
  const oct = shiftPeriod(nov, -1, monthly);

  it('sums income, expenses and savings in a range', () => {
    const rows = [
      income(185_000, '2026-11-01'),
      expense(96_640, '2026-11-01'),
      expense(24_760, '2026-11-09'),
      expense(500, '2026-10-31'),
    ];
    expect(sums(rows, nov)).toEqual({ incomeCents: 185_000, expenseCents: 121_400, savingsCents: 63_600 });
    expect(sums(rows, null)).toEqual({ incomeCents: 0, expenseCents: 0, savingsCents: 0 });
  });

  it('compares categories with the previous period up to the same day', () => {
    const rows = [
      expense(3_000, '2026-11-02'),
      expense(1_000, '2026-11-04', 'fun'),
      expense(2_000, '2026-10-05'),
      expense(9_000, '2026-10-20'), // after day 10 of October: left out
      expense(400, '2026-10-03', null),
    ];
    expect(categoryComparison(rows, nov, oct, '2026-11-10')).toEqual([
      { categoryId: 'food', currentCents: 3_000, previousCents: 2_000 },
      { categoryId: 'fun', currentCents: 1_000, previousCents: 0 },
      { categoryId: null, currentCents: 0, previousCents: 400 },
    ]);
  });

  it('compares a finished period with the whole previous one', () => {
    const feb = periodOf('month', '2026-02-10', monthly);
    const jan = shiftPeriod(feb, -1, monthly);
    const rows = [expense(1_000, '2026-02-20'), expense(2_000, '2026-01-31')];
    expect(categoryComparison(rows, feb, jan, '2026-03-05')).toEqual([
      { categoryId: 'food', currentCents: 1_000, previousCents: 2_000 },
    ]);
  });

  it('compares cycles that start on the 25th by day of the cycle', () => {
    const cycle = periodOf('month', '2026-11-10', payday); // 25 Oct – 24 Nov
    const before = shiftPeriod(cycle, -1, payday); // 25 Sep – 24 Oct
    const rows = [expense(1_000, '2026-10-25'), expense(3_000, '2026-09-25'), expense(5_000, '2026-10-15')];
    // Day 17 of the cycle: 25 Sep – 11 Oct.
    expect(categoryComparison(rows, cycle, before, '2026-11-10')).toEqual([
      { categoryId: 'food', currentCents: 1_000, previousCents: 3_000 },
    ]);
  });
});

describe('trends', () => {
  const today = '2026-11-10';
  const nov = periodOf('month', today, monthly);
  // Leisure: 60 so far vs 40 a month on average (+50 %). Food: 105 vs 100 (+5 %, too small).
  // Taxi: 9 vs 30 (too little now). Books: 30 vs 6 average (average below 10).
  const rows = [
    ...['2026-08-03', '2026-09-03', '2026-10-03'].flatMap((date) => [
      expense(4_000, date, 'leisure'),
      expense(10_000, date, 'food'),
      expense(3_000, date, 'taxi'),
    ]),
    expense(1_800, '2026-09-04', 'books'),
    expense(6_000, '2026-11-05', 'leisure'),
    expense(10_500, '2026-11-05', 'food'),
    expense(900, '2026-11-05', 'taxi'),
    expense(3_000, '2026-11-05', 'books'),
    expense(50_000, '2026-10-20', 'leisure'), // after day 10: not part of the average
  ];

  it('keeps changes of 15 % or more with both values ≥ 10 units', () => {
    expect(categoryTrends(rows, nov, monthly, today, '2026-08-01')).toEqual([
      { categoryId: 'leisure', currentCents: 6_000, averageCents: 4_000, change: 0.5 },
    ]);
  });

  it('shows drops too, largest change first, at most three', () => {
    const more = [
      ...rows,
      ...['2026-08-04', '2026-09-04', '2026-10-04'].map((date) => expense(10_000, date, 'home')),
      expense(2_000, '2026-11-06', 'home'), // −80 %
    ];
    expect(categoryTrends(more, nov, monthly, today, '2026-08-01').map((t) => t.categoryId)).toEqual([
      'home',
      'leisure',
    ]);
    expect(categoryTrends(more, nov, monthly, today, '2026-08-01', 1)).toHaveLength(1);
  });

  it('needs three periods of history', () => {
    expect(categoryTrends(rows, nov, monthly, today, '2026-09-02')).toEqual([]);
    expect(categoryTrends(rows, nov, monthly, today, null)).toEqual([]);
    expect(categoryTrends(rows, nov, monthly, today, '2026-08-31')).toHaveLength(1);
  });

  it('works for weeks', () => {
    const week = periodOf('week', today, monthly); // Mon 9 – Sun 15 Nov, 2 days so far
    const weekly = [
      ...['2026-10-19', '2026-10-26', '2026-11-02'].map((date) => expense(2_000, date, 'leisure')),
      expense(2_000, '2026-11-04', 'leisure'), // Wednesday: after the same day
      expense(3_000, '2026-11-10', 'leisure'),
    ];
    expect(categoryTrends(weekly, week, monthly, today, '2026-10-01')).toEqual([
      { categoryId: 'leisure', currentCents: 3_000, averageCents: 2_000, change: 0.5 },
    ]);
  });
});

describe('months and savings', () => {
  const rows = [
    income(200_000, '2026-06-01'),
    expense(150_000, '2026-06-10'),
    income(200_000, '2026-07-01'),
    expense(230_000, '2026-07-10'),
    income(100_000, '2026-11-01'),
    expense(20_000, '2026-11-05'),
  ];

  it('builds the last six cycles, the running one marked', () => {
    const last = lastBarCycle(periodOf('week', '2026-11-10', monthly), '2026-11-10', 1);
    const bars = monthBars(rows, last, 1, '2026-11-10');
    expect(bars.map((bar) => bar.start)).toEqual([
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
      '2026-11-01',
    ]);
    expect(bars[1]).toMatchObject({ incomeCents: 200_000, expenseCents: 230_000, inProgress: false });
    expect(bars[5]?.inProgress).toBe(true);
    // Months without income don't pull the average down.
    expect(averageIncome(bars)).toBe(166_667);
    // Finished months only: (400,000 − 380,000) / 400,000.
    expect(savingsRate(bars)).toEqual({ rate: 0.05, months: 2 });
  });

  it('ends on the period’s last cycle for past periods, with cycles starting on the 25th', () => {
    const year2025 = periodOf('year', '2025-06-01', payday);
    const last = lastBarCycle(year2025, '2026-11-10', 25);
    expect(last).toEqual(cycleStartingIn('2025-12', 25));
    expect(monthBars([], last, 25, '2026-11-10')[0]?.start).toBe('2025-07-25');
    expect(averageIncome(monthBars([], last, 25, '2026-11-10'))).toBeNull();
    expect(savingsRate(monthBars([], last, 25, '2026-11-10'))).toBeNull();
  });

  it('adds up savings day by day for a month, stopping today', () => {
    const nov = periodOf('month', '2026-11-10', monthly);
    const series = savingsSeries(rows, nov, '2026-11-06', 1);
    expect(series).toHaveLength(6);
    expect(series.map((point) => point.cents)).toEqual([100_000, 100_000, 100_000, 100_000, 80_000, 80_000]);
    expect(savingsSeries(rows, nov, '2026-10-31', 1)).toEqual([]);
  });

  it('adds up savings cycle by cycle for a year, clipped to the period', () => {
    const year = periodOf('year', '2026-06-01', payday); // 25 Jan 2026 – 24 Jan 2027
    const series = savingsSeries(
      [
        income(10_000, '2026-01-26'),
        expense(4_000, '2026-02-24'),
        expense(1_000, '2026-02-25'),
        income(500, '2026-01-20'),
      ],
      year,
      '2026-03-30',
      25,
    );
    expect(series).toEqual([
      { start: '2026-01-25', end: '2026-02-24', cents: 6_000 },
      { start: '2026-02-25', end: '2026-03-24', cents: 5_000 },
      { start: '2026-03-25', end: '2026-03-30', cents: 5_000 },
    ]);
  });
});
