import { describe, expect, it } from 'vitest';
import { todayIn } from '../../src/lib/dates';
import {
  dueBetween,
  isEnded,
  monthlyCents,
  nextAfter,
  nextOnOrAfter,
  occurrence,
  type Schedule,
} from '../../src/lib/recurring/schedule';

const rule = (overrides: Partial<Schedule>): Schedule => ({
  frequency: 'monthly',
  intervalDays: null,
  anchorDate: '2026-01-31',
  endDate: null,
  ...overrides,
});

describe('occurrence', () => {
  it('monthly on the 31st clamps to each month end without drifting', () => {
    const monthly = rule({});
    expect([0, 1, 2, 3, 4].map((k) => occurrence(monthly, k))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
  });

  it('monthly on the 30th or 29th uses 29 February in a leap year', () => {
    expect(occurrence(rule({ anchorDate: '2027-12-30' }), 2)).toBe('2028-02-29');
    expect(occurrence(rule({ anchorDate: '2026-01-29' }), 1)).toBe('2026-02-28');
  });

  it('yearly on 29 February falls on the 28th in common years and back on the 29th', () => {
    const leap = rule({ frequency: 'yearly', anchorDate: '2028-02-29' });
    expect([1, 2, 3, 4].map((k) => occurrence(leap, k))).toEqual([
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });

  it('weekly and every N days cross month and year ends', () => {
    expect(occurrence(rule({ frequency: 'weekly', anchorDate: '2026-12-29' }), 1)).toBe('2027-01-05');
    expect(
      occurrence(rule({ frequency: 'every_n_days', intervalDays: 10, anchorDate: '2028-02-25' }), 1),
    ).toBe('2028-03-06');
  });
});

describe('nextOnOrAfter / nextAfter', () => {
  it('returns the anchor for dates before it', () => {
    expect(nextOnOrAfter(rule({}), '2025-06-01')).toBe('2026-01-31');
  });

  it('finds the next monthly date from any day', () => {
    const monthly = rule({});
    expect(nextOnOrAfter(monthly, '2026-02-28')).toBe('2026-02-28');
    expect(nextAfter(monthly, '2026-02-28')).toBe('2026-03-31');
    expect(nextOnOrAfter(monthly, '2026-03-01')).toBe('2026-03-31');
    expect(nextOnOrAfter(monthly, '2031-08-15')).toBe('2031-08-31');
  });

  it('finds the next weekly and every-N-days date', () => {
    const weekly = rule({ frequency: 'weekly', anchorDate: '2026-11-02' });
    expect(nextOnOrAfter(weekly, '2026-11-10')).toBe('2026-11-16');
    expect(nextOnOrAfter(weekly, '2026-11-16')).toBe('2026-11-16');
    const every = rule({ frequency: 'every_n_days', intervalDays: 3, anchorDate: '2026-11-01' });
    expect(nextAfter(every, '2026-11-04')).toBe('2026-11-07');
  });

  it('stops at the end date (inclusive)', () => {
    const ending = rule({ anchorDate: '2026-01-15', endDate: '2026-03-15' });
    expect(nextOnOrAfter(ending, '2026-03-15')).toBe('2026-03-15');
    expect(nextAfter(ending, '2026-03-15')).toBeNull();
  });
});

describe('dueBetween', () => {
  it('lists every missed date up to today and the following next date', () => {
    expect(dueBetween(rule({}), '2026-01-31', '2026-04-30', 50)).toEqual({
      dates: ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'],
      next: '2026-05-31',
    });
  });

  it('returns nothing when the next date has not come yet', () => {
    expect(dueBetween(rule({}), '2026-02-28', '2026-02-27', 50)).toEqual({ dates: [], next: '2026-02-28' });
  });

  it('respects the limit and resumes from the returned next date', () => {
    const daily = rule({ frequency: 'every_n_days', intervalDays: 2, anchorDate: '2026-01-01' });
    const first = dueBetween(daily, '2026-01-01', '2026-01-31', 3);
    expect(first).toEqual({ dates: ['2026-01-01', '2026-01-03', '2026-01-05'], next: '2026-01-07' });
    const rest = dueBetween(daily, first.next ?? '', '2026-01-31', 50);
    expect(rest.dates[0]).toBe('2026-01-07');
    expect(rest.dates.at(-1)).toBe('2026-01-31');
  });

  it('stops at the end date and stores a next date past it (ended)', () => {
    const ending = rule({ frequency: 'weekly', anchorDate: '2026-11-02', endDate: '2026-11-20' });
    const due = dueBetween(ending, '2026-11-02', '2026-12-31', 50);
    expect(due).toEqual({ dates: ['2026-11-02', '2026-11-09', '2026-11-16'], next: '2026-11-23' });
    expect(isEnded(ending, due.next)).toBe(true);
    expect(isEnded(ending, '2026-11-16')).toBe(false);
    expect(dueBetween(ending, due.next, '2027-01-31', 50).dates).toEqual([]);
  });

  it('uses the calendar date in the user time zone, also on DST change days', () => {
    // 03:00 UTC cron on the day Europe/Madrid leaves summer time, and on the US spring-forward day.
    const madrid = todayIn('Europe/Madrid', new Date('2026-10-25T03:00:00Z'));
    const losAngeles = todayIn('America/Los_Angeles', new Date('2027-03-14T03:00:00Z'));
    const kiritimati = todayIn('Pacific/Kiritimati', new Date('2026-12-31T03:00:00Z'));
    expect(madrid).toBe('2026-10-25');
    expect(losAngeles).toBe('2027-03-13');
    expect(kiritimati).toBe('2026-12-31');
    const weekly = rule({ frequency: 'weekly', anchorDate: '2026-10-18' });
    expect(dueBetween(weekly, '2026-10-25', madrid, 50).dates).toEqual(['2026-10-25']);
    const monthly = rule({ anchorDate: '2026-12-14' });
    expect(dueBetween(monthly, '2027-03-14', losAngeles, 50).dates).toEqual([]);
  });
});

describe('monthlyCents', () => {
  it('converts every frequency to a monthly amount', () => {
    expect(monthlyCents(1_000, { frequency: 'monthly', intervalDays: null })).toBe(1_000);
    expect(monthlyCents(1_200, { frequency: 'weekly', intervalDays: null })).toBe(5_200);
    expect(monthlyCents(12_000, { frequency: 'yearly', intervalDays: null })).toBe(1_000);
    expect(monthlyCents(1_000, { frequency: 'every_n_days', intervalDays: 10 })).toBe(3_042);
  });
});
