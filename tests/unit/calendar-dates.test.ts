import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  calendarWeeks,
  daysInMonth,
  isIsoDate,
  isIsoMonth,
  monthEnd,
  shiftMonth,
  todayIn,
  weekday,
} from '../../src/lib/dates';

describe('calendar dates', () => {
  it('knows leap years', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(monthEnd('2028-02')).toBe('2028-02-29');
  });

  it.each([
    ['2026-11-10', true],
    ['2028-02-29', true],
    ['2026-02-29', false],
    ['2026-13-01', false],
    ['2026-1-01', false],
    ['1969-12-31', false],
    ['2026-11-10T00:00', false],
  ])('isIsoDate(%s) = %s', (value, expected) => {
    expect(isIsoDate(value)).toBe(expected);
  });

  it('validates months', () => {
    expect(isIsoMonth('2026-11')).toBe(true);
    expect(isIsoMonth('2026-00')).toBe(false);
    expect(isIsoMonth('2026-11-01')).toBe(false);
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    // DST change in Europe (29 March 2026) does not matter: dates have no time.
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
  });

  it('adds months clamped to the month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-10', -13)).toBe('2024-12-10');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('gives ISO weekdays', () => {
    expect(weekday('2026-11-09')).toBe(1);
    expect(weekday('2026-11-15')).toBe(7);
  });

  it('builds whole weeks from the profile week start', () => {
    const monday = calendarWeeks('2026-11', 1);
    expect(monday[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(monday.at(-1)?.[0]).toBe('2026-11-30');
    expect(monday).toHaveLength(6);

    const sunday = calendarWeeks('2026-11', 7);
    expect(sunday[0]?.[0]).toBe('2026-11-01');
    expect(sunday).toHaveLength(5);

    // February 2027 starts on a Monday and has 28 days: exactly 4 rows.
    expect(calendarWeeks('2027-02', 1)).toHaveLength(4);
    for (const week of monday) expect(week).toHaveLength(7);
  });

  it('computes today in the user time zone', () => {
    const lateNightUtc = new Date('2026-11-10T23:30:00Z');
    expect(todayIn('Europe/Madrid', lateNightUtc)).toBe('2026-11-11');
    expect(todayIn('America/New_York', lateNightUtc)).toBe('2026-11-10');
    // Spring-forward night in Madrid.
    expect(todayIn('Europe/Madrid', new Date('2026-03-29T01:30:00Z'))).toBe('2026-03-29');
  });
});
