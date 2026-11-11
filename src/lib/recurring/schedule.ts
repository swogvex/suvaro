/**
 * Pure schedule math for recurring templates (shared by the server, the cron and the islands).
 * Dates are `YYYY-MM-DD` calendar dates in the user's time zone, so DST never shifts a day.
 *
 * Occurrence `k` is always computed from the anchor date (never from the previous occurrence), so a monthly
 * template on the 31st gives 31 Jan, 28 Feb, 31 Mar… without drifting to the 28th.
 */
import { addDays, addMonths, daysBetween } from '../dates';

export type Frequency = 'weekly' | 'monthly' | 'yearly' | 'every_n_days';

export interface Schedule {
  frequency: Frequency;
  /** Days between occurrences for `every_n_days` (2–365); ignored otherwise. */
  intervalDays: number | null;
  /** First occurrence. */
  anchorDate: string;
  /** Last day an occurrence may fall on (inclusive), or null for no end. */
  endDate: string | null;
}

export const MIN_INTERVAL_DAYS = 2;
export const MAX_INTERVAL_DAYS = 365;

/** Occurrence number `k` (0 = the anchor). */
export function occurrence(schedule: Schedule, k: number): string {
  const { frequency, anchorDate } = schedule;
  switch (frequency) {
    case 'weekly':
      return addDays(anchorDate, 7 * k);
    case 'every_n_days':
      return addDays(anchorDate, step(schedule) * k);
    case 'monthly':
      return addMonths(anchorDate, k);
    case 'yearly':
      return addMonths(anchorDate, 12 * k);
  }
}

function step(schedule: Schedule): number {
  const days = schedule.intervalDays ?? MIN_INTERVAL_DAYS;
  return Math.min(MAX_INTERVAL_DAYS, Math.max(MIN_INTERVAL_DAYS, Math.trunc(days)));
}

function monthIndex(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

/** A first guess for the number of the first occurrence on or after `date` (corrected by the caller). */
function estimate(schedule: Schedule, date: string): number {
  const { frequency, anchorDate } = schedule;
  if (frequency === 'weekly' || frequency === 'every_n_days') {
    const days = frequency === 'weekly' ? 7 : step(schedule);
    return Math.ceil(daysBetween(anchorDate, date) / days);
  }
  const months = monthIndex(date) - monthIndex(anchorDate);
  return frequency === 'monthly' ? months : Math.floor(months / 12);
}

/** The first occurrence on or after `date`, ignoring the end date (never before the anchor). */
function firstOnOrAfter(schedule: Schedule, date: string): string {
  if (date <= schedule.anchorDate) return schedule.anchorDate;
  let k = Math.max(0, estimate(schedule, date) - 1);
  while (k > 0 && occurrence(schedule, k - 1) >= date) k -= 1;
  while (occurrence(schedule, k) < date) k += 1;
  return occurrence(schedule, k);
}

/** The first occurrence on or after `date`, or null when the template has ended by then. */
export function nextOnOrAfter(schedule: Schedule, date: string): string | null {
  const next = firstOnOrAfter(schedule, date);
  return schedule.endDate !== null && next > schedule.endDate ? null : next;
}

/** The first occurrence strictly after `date`, or null when there is none before the end date. */
export function nextAfter(schedule: Schedule, date: string): string | null {
  return nextOnOrAfter(schedule, addDays(date, 1));
}

/**
 * True when nothing is left to create: the stored next date is past the end date. (The next date is kept
 * as the following occurrence even then, so `next_date` is never null.)
 */
export function isEnded(schedule: Pick<Schedule, 'endDate'>, nextDate: string): boolean {
  return schedule.endDate !== null && nextDate > schedule.endDate;
}

/**
 * Occurrences due from `from` (usually the stored next date) through `to`, oldest first, at most `limit`
 * and never past the end date; plus the next date to store: the occurrence after the last one listed
 * (past the end date when the template has ended, see `isEnded`).
 */
export function dueBetween(
  schedule: Schedule,
  from: string,
  to: string,
  limit: number,
): { dates: string[]; next: string } {
  const dates: string[] = [];
  let current = firstOnOrAfter(schedule, from);
  while (current <= to && !isEnded(schedule, current) && dates.length < limit) {
    dates.push(current);
    current = firstOnOrAfter(schedule, addDays(current, 1));
  }
  return { dates, next: current };
}

/** The next date to store for a template that starts counting on `from` (see `dueBetween`). */
export function firstDue(schedule: Schedule, from: string): string {
  return firstOnOrAfter(schedule, from);
}

/** Monthly-equivalent amount of a template, in cents (weekly × 52 / 12, every N days × 365 / N / 12). */
export function monthlyCents(
  amountCents: number,
  schedule: Pick<Schedule, 'frequency' | 'intervalDays'>,
): number {
  switch (schedule.frequency) {
    case 'monthly':
      return amountCents;
    case 'weekly':
      return Math.round((amountCents * 52) / 12);
    case 'every_n_days':
      return Math.round((amountCents * 365) / step({ ...schedule, anchorDate: '', endDate: null }) / 12);
    case 'yearly':
      return Math.round(amountCents / 12);
  }
}
