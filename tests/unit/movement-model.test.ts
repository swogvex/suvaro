import { describe, expect, it } from 'vitest';
import { ulid } from '../../src/lib/id';
import {
  dateRange,
  emptyFilters,
  filtersToParams,
  hasFilters,
  parseFilters,
  unknownKeys,
} from '../../src/lib/movements/filters';
import { groupByDay, signedCents, totals, type Movement } from '../../src/lib/movements/model';
import { createInput, updateInput } from '../../src/lib/movements/schema';
import { MAX_AMOUNT_CENTS } from '../../src/lib/money';

const cat = ulid();

function m(date: string, type: Movement['type'], amountCents: number, id = ulid()): Movement {
  return {
    id,
    type,
    amountCents,
    categoryId: type === 'expense' ? cat : null,
    date,
    note: '',
    recurring: false,
  };
}

describe('movement validation', () => {
  const valid = {
    id: ulid(),
    type: 'expense',
    amountCents: 2385,
    categoryId: cat,
    date: '2026-11-09',
    note: ' Coffee ',
  };

  it('accepts a valid expense and trims the note', () => {
    const parsed = createInput.parse(valid);
    expect(parsed.note).toBe('Coffee');
    expect(parsed.repeat).toBe(false);
  });

  it.each([
    ['zero amount', { amountCents: 0 }],
    ['negative amount', { amountCents: -5 }],
    ['float amount', { amountCents: 12.5 }],
    ['amount over the max', { amountCents: MAX_AMOUNT_CENTS + 1 }],
    ['impossible date', { date: '2026-02-30' }],
    ['note over 140', { note: 'x'.repeat(141) }],
    ['expense without category', { categoryId: null }],
    ['bad id', { id: 'not-a-ulid' }],
    ['unknown key', { userId: 'someone' }],
  ])('rejects %s', (_label, change) => {
    expect(createInput.safeParse({ ...valid, ...change }).success).toBe(false);
  });

  it('accepts the max amount', () => {
    expect(createInput.safeParse({ ...valid, amountCents: MAX_AMOUNT_CENTS }).success).toBe(true);
  });

  it('income has no category', () => {
    expect(
      updateInput.safeParse({
        type: 'income',
        amountCents: 1,
        categoryId: null,
        date: '2026-11-01',
        note: '',
      }).success,
    ).toBe(true);
    expect(
      updateInput.safeParse({ type: 'income', amountCents: 1, categoryId: cat, date: '2026-11-01', note: '' })
        .success,
    ).toBe(false);
  });

  it('edits cannot change the id', () => {
    expect(updateInput.safeParse({ ...valid }).success).toBe(false);
  });
});

describe('movement totals', () => {
  it('signs by type', () => {
    expect(signedCents(m('2026-11-01', 'income', 185_000))).toBe(185_000);
    expect(signedCents(m('2026-11-01', 'expense', 2_385))).toBe(-2_385);
  });

  it('reproduces the sample month in cents', () => {
    const list = [
      m('2026-11-01', 'income', 185_000),
      m('2026-11-03', 'expense', 100_000),
      m('2026-11-09', 'expense', 21_240),
    ];
    expect(totals(list)).toEqual({ count: 3, incomeCents: 185_000, expenseCents: 121_240, netCents: 63_760 });
  });

  it('adds many small amounts exactly (no float drift)', () => {
    const list = Array.from({ length: 1000 }, () => m('2026-11-01', 'expense', 10));
    expect(totals(list).netCents).toBe(-10_000);
  });

  it('groups by day, newest first, with signed day totals', () => {
    const first = m('2026-11-09', 'expense', 380, ulid(1_000));
    const second = m('2026-11-09', 'expense', 2_385, ulid(2_000));
    const groups = groupByDay([
      m('2026-11-01', 'income', 185_000),
      first,
      second,
      m('2026-10-31', 'expense', 999),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-11-09', '2026-11-01', '2026-10-31']);
    expect(groups[0]?.totalCents).toBe(-2_765);
    // Same day: last created first.
    expect(groups[0]?.items.map((i) => i.id)).toEqual([second.id, first.id]);
    expect(groups[1]?.totalCents).toBe(185_000);
  });
});

describe('movement filters in the URL', () => {
  it('round-trips every filter', () => {
    const query = `period=custom&from=2026-11-01&to=2026-11-30&cat=${cat}&type=expense&min=10.5&max=200`;
    const { filters, valid } = parseFilters(new URLSearchParams(query));
    expect(valid).toBe(true);
    expect(filters).toEqual({
      period: 'custom',
      from: '2026-11-01',
      to: '2026-11-30',
      categories: [cat],
      type: 'expense',
      minCents: 1_050,
      maxCents: 20_000,
    });
    expect(filtersToParams(filters).toString()).toBe(
      `period=custom&from=2026-11-01&to=2026-11-30&cat=${cat}&type=expense&min=10.50&max=200.00`,
    );
  });

  it('no filters means an empty query', () => {
    expect(filtersToParams(emptyFilters).toString()).toBe('');
    expect(hasFilters(emptyFilters)).toBe(false);
  });

  it.each([
    'period=yesterday',
    'from=2026-11-01',
    'period=custom&from=2026-11-31',
    'cat=abc',
    'type=both',
    'min=-1',
    'min=1,5',
    'min=20&max=10',
    'type=income&type=expense',
    'period=custom&from=2026-12-01&to=2026-11-01',
  ])('drops a malformed filter and reports it: %s', (query) => {
    expect(parseFilters(new URLSearchParams(query)).valid).toBe(false);
  });

  it('lists unknown keys', () => {
    expect(unknownKeys(new URLSearchParams('type=income&month=2026-11&evil=1'), ['month'])).toEqual(['evil']);
  });

  it('resolves periods against the user today', () => {
    const at = (period: string) =>
      dateRange(parseFilters(new URLSearchParams(`period=${period}`)).filters, '2026-01-15');
    expect(at('this-month')).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(at('last-month')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(at('3-months')).toEqual({ from: '2025-11-01', to: '2026-01-31' });
    expect(dateRange(emptyFilters, '2026-01-15')).toEqual({ from: null, to: null });
  });
});
