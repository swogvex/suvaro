/**
 * Movement filters, shared by the list and the calendar and kept in the URL query (bookmarkable):
 * `period` (this-month | last-month | 3-months | custom + `from`/`to`), `cat` (repeated category ids),
 * `type` (income | expense), `min`/`max` (amounts as "12.50"). No `period` means all time.
 */
import { isIsoDate, monthEnd, monthOf, monthStart, shiftMonth } from '../dates';
import { ULID_PATTERN } from '../id';
import { centsToDecimal, MAX_AMOUNT_CENTS } from '../money';
import type { Movement, MovementType } from './model';

export const periods = ['this-month', 'last-month', '3-months', 'custom'] as const;
export type Period = (typeof periods)[number];

/** Category ids in one filter (a user has at most 50 categories). */
const MAX_FILTER_CATEGORIES = 50;

export interface Filters {
  period: Period | null;
  /** Only with `period: 'custom'`; either end may be open. */
  from: string | null;
  to: string | null;
  categories: string[];
  type: MovementType | null;
  minCents: number | null;
  maxCents: number | null;
}

export const emptyFilters: Filters = {
  period: null,
  from: null,
  to: null,
  categories: [],
  type: null,
  minCents: null,
  maxCents: null,
};

const FILTER_KEYS = new Set(['period', 'from', 'to', 'cat', 'type', 'min', 'max']);

/** "12.5" / "12.50" / "12" → cents. Dot decimals only: these are URL values, not typed text. */
function parseUrlAmount(value: string): number | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return cents <= MAX_AMOUNT_CENTS ? cents : null;
}

export interface ParsedFilters {
  filters: Filters;
  /** False when a filter value was malformed (it is dropped from `filters`). */
  valid: boolean;
}

/**
 * Reads filters from a URL query. Malformed values are dropped (a bookmark never breaks the page) and
 * reported with `valid: false` so the API can answer 400. Other keys are ignored here.
 */
export function parseFilters(params: URLSearchParams): ParsedFilters {
  let valid = true;
  const one = (key: string): string | null => {
    const values = params.getAll(key);
    if (values.length > 1) valid = false;
    return values[0] ?? null;
  };
  const check = <T>(raw: string | null, parse: (value: string) => T | null): T | null => {
    if (raw === null) return null;
    const value = parse(raw);
    if (value === null) valid = false;
    return value;
  };

  const period = check(one('period'), (value) =>
    (periods as readonly string[]).includes(value) ? (value as Period) : null,
  );
  const custom = period === 'custom';
  const date = (value: string) => (isIsoDate(value) ? value : null);
  let from = check(one('from'), date);
  let to = check(one('to'), date);
  if (!custom) {
    if (from !== null || to !== null) valid = false;
    from = null;
    to = null;
  } else if (from && to && from > to) {
    valid = false;
    [from, to] = [to, from];
  }

  const rawCategories = params.getAll('cat');
  const categories = [...new Set(rawCategories.filter((value) => ULID_PATTERN.test(value)))];
  if (categories.length !== rawCategories.length || categories.length > MAX_FILTER_CATEGORIES) valid = false;

  const type = check(one('type'), (value) => (value === 'income' || value === 'expense' ? value : null));
  const minCents = check(one('min'), parseUrlAmount);
  const maxCents = check(one('max'), parseUrlAmount);
  if (minCents !== null && maxCents !== null && minCents > maxCents) valid = false;

  return {
    filters: {
      period,
      from,
      to,
      categories: categories.slice(0, MAX_FILTER_CATEGORIES),
      type,
      minCents,
      maxCents,
    },
    valid,
  };
}

/** Keys of `params` that are not filters and not in `allowed` (the API rejects unknown keys). */
export function unknownKeys(params: URLSearchParams, allowed: readonly string[] = []): string[] {
  return [...new Set(params.keys())].filter((key) => !FILTER_KEYS.has(key) && !allowed.includes(key));
}

/** Writes filters to a query, in a stable order. Empty filters give an empty query. */
export function filtersToParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.period) params.set('period', filters.period);
  if (filters.period === 'custom') {
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
  }
  for (const id of filters.categories) params.append('cat', id);
  if (filters.type) params.set('type', filters.type);
  if (filters.minCents !== null) params.set('min', centsToDecimal(filters.minCents));
  if (filters.maxCents !== null) params.set('max', centsToDecimal(filters.maxCents));
  return params;
}

export interface DateRange {
  from: string | null;
  to: string | null;
}

/** Dates covered by the period filter, relative to `today` (the user's today). */
export function dateRange(filters: Filters, today: string): DateRange {
  const month = monthOf(today);
  switch (filters.period) {
    case 'this-month':
      return { from: monthStart(month), to: monthEnd(month) };
    case 'last-month': {
      const last = shiftMonth(month, -1);
      return { from: monthStart(last), to: monthEnd(last) };
    }
    case '3-months':
      return { from: monthStart(shiftMonth(month, -2)), to: monthEnd(month) };
    case 'custom':
      return { from: filters.from, to: filters.to };
    default:
      return { from: null, to: null };
  }
}

export function hasFilters(filters: Filters): boolean {
  return filtersToParams(filters).size > 0;
}

/** Same filters (for skipping reloads). */
export function sameFilters(a: Filters, b: Filters): boolean {
  return filtersToParams(a).toString() === filtersToParams(b).toString();
}

/** Client-side twin of the SQL filters: does this movement belong in the filtered view? */
export function matchesFilters(movement: Movement, filters: Filters, today: string): boolean {
  const range = dateRange(filters, today);
  if (range.from && movement.date < range.from) return false;
  if (range.to && movement.date > range.to) return false;
  if (filters.type && movement.type !== filters.type) return false;
  if (filters.categories.length > 0 && !filters.categories.includes(movement.categoryId ?? '')) return false;
  if (filters.minCents !== null && movement.amountCents < filters.minCents) return false;
  if (filters.maxCents !== null && movement.amountCents > filters.maxCents) return false;
  return true;
}
