/**
 * Cycles: the "month" the app reasons about. With `cycle_start_day = d` (1–28) a cycle runs from day `d` of
 * a month to the day before `d` of the next month, both included. A cycle is named by the month it starts
 * in (`YYYY-MM`). Dates are `YYYY-MM-DD` calendar dates (see `dates.ts`).
 */
import { addDays, addMonths, daysBetween, daysInMonth, monthOf, shiftMonth } from './dates';

export interface Cycle {
  /** First day, `YYYY-MM-DD`. */
  start: string;
  /** Last day (included), `YYYY-MM-DD`. */
  end: string;
}

export const MIN_START_DAY = 1;
export const MAX_START_DAY = 28;

/** Start days outside 1–28 are clamped, so a bad profile value can never produce an impossible cycle. */
export function normalizeStartDay(startDay: number): number {
  if (!Number.isInteger(startDay)) return MIN_START_DAY;
  return Math.min(Math.max(startDay, MIN_START_DAY), MAX_START_DAY);
}

/** The cycle that starts in `month` (`YYYY-MM`). */
export function cycleStartingIn(month: string, startDay: number): Cycle {
  const day = String(normalizeStartDay(startDay)).padStart(2, '0');
  const start = `${month}-${day}`;
  return { start, end: addDays(addMonths(start, 1), -1) };
}

/** The cycle that contains `date`. */
export function cycleOf(date: string, startDay: number): Cycle {
  const day = normalizeStartDay(startDay);
  const month = monthOf(date);
  return cycleStartingIn(Number(date.slice(8, 10)) >= day ? month : shiftMonth(month, -1), day);
}

/** The month a cycle is named by: "2026-11-25" → "2026-11". */
export function cycleMonth(cycle: Cycle): string {
  return monthOf(cycle.start);
}

/** The cycle `count` cycles away (negative = earlier). */
export function shiftCycle(cycle: Cycle, count: number, startDay: number): Cycle {
  return cycleStartingIn(shiftMonth(cycleMonth(cycle), count), startDay);
}

/** Days in the cycle: 28–31. */
export function cycleLength(cycle: Cycle): number {
  const year = Number(cycle.start.slice(0, 4));
  const month = Number(cycle.start.slice(5, 7));
  return daysInMonth(year, month);
}

export function inCycle(date: string, cycle: Cycle): boolean {
  return date >= cycle.start && date <= cycle.end;
}

/** 1-based position of `date` in the cycle: the start is day 1. */
export function dayOfCycle(date: string, cycle: Cycle): number {
  return daysBetween(cycle.start, date) + 1;
}

/**
 * Days from `today` to the cycle's last day, both included (`02-concepts.md`). 0 once the cycle is over;
 * the whole cycle when it has not started yet.
 */
export function daysLeft(cycle: Cycle, today: string): number {
  if (today > cycle.end) return 0;
  if (today < cycle.start) return cycleLength(cycle);
  return cycleLength(cycle) - dayOfCycle(today, cycle) + 1;
}
