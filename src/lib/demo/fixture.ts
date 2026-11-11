/**
 * The demo's sample data, always relative to `today` (server only: it reads the dictionaries).
 * The current month reproduces the design's sample month exactly (`sampleMonth` in site.ts): income
 * 1,850.00, expenses 1,212.40, set aside 150.00, available 487.60, Food 246.00 of a 300.00 budget.
 * Its expenses are spread over the days so far, so the numbers hold on any day of the month.
 * Five earlier months (a little more or less each) fill Stats; three goals and four recurring templates
 * (one waiting for confirmation) fill Plan and Recurring.
 */
import { useTranslations, type Locale, type UiKey } from '../../i18n';
import { addMonths, daysInMonth, monthOf, shiftMonth } from '../dates';
import { defaultCategories } from '../default-categories';
import { ulid } from '../id';
import type { Movement } from '../movements/model';
import type { Contribution } from '../plan/model';
import type { Recurring } from '../recurring/model';
import { nextAfter } from '../recurring/schedule';
import type { ColorIndex, DemoState } from './store';

type Key = (typeof defaultCategories)[number]['key'];
type Note =
  | 'rent'
  | 'supermarket'
  | 'market'
  | 'bakery'
  | 'dinner'
  | 'transport'
  | 'electricity'
  | 'internet'
  | 'music'
  | 'streaming'
  | 'cinema'
  | 'concert'
  | 'pharmacy'
  | 'tshirt'
  | 'book'
  | 'gift';

/** The sample month's expenses (Σ 1,212.40; Food Σ 246.00). `fixed` ones repeat unchanged every month. */
const EXPENSES: readonly { note: Note; category: Key; cents: number; fixed?: boolean }[] = [
  { note: 'rent', category: 'housing', cents: 65_000, fixed: true },
  { note: 'supermarket', category: 'food', cents: 8_640 },
  { note: 'transport', category: 'transport', cents: 4_000, fixed: true },
  { note: 'electricity', category: 'housing', cents: 5_830 },
  { note: 'bakery', category: 'food', cents: 1_285 },
  { note: 'music', category: 'subscriptions', cents: 1_099, fixed: true },
  { note: 'cinema', category: 'leisure', cents: 1_850 },
  { note: 'internet', category: 'subscriptions', cents: 3_500, fixed: true },
  { note: 'pharmacy', category: 'health', cents: 1_680 },
  { note: 'market', category: 'food', cents: 7_215 },
  { note: 'streaming', category: 'subscriptions', cents: 1_399, fixed: true },
  { note: 'tshirt', category: 'clothing', cents: 2_500 },
  { note: 'concert', category: 'leisure', cents: 4_500 },
  { note: 'book', category: 'education', cents: 2_290 },
  { note: 'gift', category: 'gifts', cents: 2_992 },
  { note: 'dinner', category: 'food', cents: 7_460 },
];

const INCOME = 185_000;
/** How much each earlier month spent on the non-fixed items, newest first. */
const MONTH_FACTORS = [1.08, 0.92, 1.15, 0.97, 1.04];

const day = (month: string, d: number) => `${month}-${String(d).padStart(2, '0')}`;

export function buildDemoState(today: string, locale: Locale): DemoState {
  const t = useTranslations(locale);
  const note = (key: Note | 'salary' | 'gym') => t(`demo.note.${key}` as UiKey);
  const thisMonth = monthOf(today);
  const todayDay = Number(today.slice(8, 10));

  const categories = defaultCategories.map((category, i) => ({
    id: ulid(Date.UTC(2026, 0, 1) + i),
    name: t(`category.${category.key}` as UiKey),
    icon: category.icon,
    color: Number(category.color.slice(1)) as ColorIndex,
  }));
  const categoryId = (key: Key) => categories[defaultCategories.findIndex((c) => c.key === key)]?.id ?? null;

  const movements: Movement[] = [];
  const add = (
    date: string,
    type: Movement['type'],
    cents: number,
    category: Key | null,
    text: string,
    recurring = false,
  ) =>
    movements.push({
      id: ulid(Date.parse(`${date}T12:00:00Z`) + movements.length),
      type,
      amountCents: cents,
      categoryId: category ? categoryId(category) : null,
      date,
      note: text,
      recurring,
    });

  // This month: income and rent on day 1, the rest spread over the days so far.
  add(day(thisMonth, 1), 'income', INCOME, null, note('salary'), true);
  EXPENSES.forEach((item, i) => {
    const d = item.note === 'rent' ? 1 : 1 + Math.floor((i * todayDay) / EXPENSES.length);
    add(
      day(thisMonth, Math.min(d, todayDay)),
      'expense',
      item.cents,
      item.category,
      note(item.note),
      item.fixed === true && item.note === 'rent',
    );
  });

  // Five earlier months, spread over the same days as this one (days 1 to today's day). Same shape every
  // month, so "this month vs the same days last month" and the trends compare like with like.
  MONTH_FACTORS.forEach((factor, k) => {
    const month = shiftMonth(thisMonth, -(k + 1));
    const length = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
    add(day(month, 1), 'income', INCOME, null, note('salary'), true);
    add(day(month, 5), 'expense', 3_500, 'health', note('gym'), true);
    EXPENSES.forEach((item, i) => {
      const span = Math.min(todayDay, length);
      const d = item.note === 'rent' ? 1 : 1 + Math.floor((i * span) / EXPENSES.length);
      const cents = item.fixed ? item.cents : Math.round((item.cents * factor) / 5) * 5;
      add(day(month, d), 'expense', cents, item.category, note(item.note), item.note === 'rent');
    });
  });

  // Goals: Lisbon (pinned, 150.00 a month for 3 months: this month's is the 150.00 set aside),
  // an emergency fund, and a phone already bought (completed).
  const goals = [
    {
      key: 'lisbon',
      icon: 'plane',
      color: 5,
      targetCents: 120_000,
      deadline: day(shiftMonth(thisMonth, 7), 1),
      pinned: true,
    },
    { key: 'emergency', icon: 'wallet', color: 3, targetCents: 300_000, deadline: null, pinned: false },
    { key: 'phone', icon: 'smartphone', color: 2, targetCents: 40_000, deadline: null, pinned: false },
  ].map((goal, i) => ({
    id: ulid(Date.UTC(2026, 0, 2) + i),
    name: t(`demo.goal.${goal.key}` as UiKey),
    icon: goal.icon,
    color: goal.color as ColorIndex,
    targetCents: goal.targetCents,
    deadline: goal.deadline,
    pinned: goal.pinned,
    completedAt: goal.key === 'phone' ? `${day(shiftMonth(thisMonth, -4), 2)}T10:00:00.000Z` : null,
  }));
  const [lisbon, emergency, phone] = goals;
  const contributions: Contribution[] = [];
  const contribute = (goalId: string | undefined, date: string, cents: number) => {
    if (goalId)
      contributions.push({
        id: ulid(Date.parse(`${date}T13:00:00Z`) + contributions.length),
        goalId,
        amountCents: cents,
        date,
      });
  };
  for (let k = 2; k >= 0; k--) contribute(lisbon?.id, day(shiftMonth(thisMonth, -k), 1), 15_000);
  for (let k = 5; k >= 1; k--) contribute(emergency?.id, day(shiftMonth(thisMonth, -k), 2), 20_000);
  contribute(phone?.id, day(shiftMonth(thisMonth, -5), 2), 20_000);
  contribute(phone?.id, day(shiftMonth(thisMonth, -4), 2), 20_000);

  // Budgets: Food 300.00 (82 % used), Leisure 75.00 (85 %), Transport 60.00.
  const budgets = (
    [
      ['food', 30_000],
      ['leisure', 7_500],
      ['transport', 6_000],
    ] as const
  ).map(([key, limitCents], i) => ({
    id: ulid(Date.UTC(2026, 0, 3) + i),
    categoryId: categoryId(key),
    limitCents,
  }));

  // Recurring: salary and rent on day 1, music on day 6 (auto); the gym on day 5 asks first.
  const firstMonth = shiftMonth(thisMonth, -MONTH_FACTORS.length);
  const template = (
    i: number,
    type: Recurring['type'],
    cents: number,
    category: Key | null,
    text: string,
    anchorDay: number,
    mode: Recurring['mode'],
  ): Recurring => {
    const anchorDate = day(firstMonth, anchorDay);
    const schedule = { frequency: 'monthly' as const, intervalDays: null, anchorDate, endDate: null };
    const thisOne = day(thisMonth, anchorDay);
    return {
      id: ulid(Date.UTC(2026, 0, 4) + i),
      type,
      amountCents: cents,
      categoryId: category ? categoryId(category) : null,
      note: text,
      ...schedule,
      mode,
      nextDate: thisOne > today ? thisOne : (nextAfter(schedule, thisOne) ?? addMonths(thisOne, 1)),
    };
  };
  const gym = template(3, 'expense', 3_500, 'health', note('gym'), 5, 'confirm');
  const recurring = [
    template(0, 'income', INCOME, null, note('salary'), 1, 'auto'),
    template(1, 'expense', 65_000, 'housing', note('rent'), 1, 'auto'),
    template(2, 'expense', 1_099, 'subscriptions', note('music'), 6, 'auto'),
    gym,
  ];
  // The gym's latest occurrence waits for confirmation (this month's when day 5 has come, else last month's).
  const gymDue = todayDay >= 5 ? day(thisMonth, 5) : day(shiftMonth(thisMonth, -1), 5);
  if (todayDay < 5) {
    const lastGym = movements.findIndex((m) => m.date === gymDue && m.note === note('gym'));
    if (lastGym >= 0) movements.splice(lastGym, 1);
  }
  gym.nextDate = nextAfter(gym, gymDue) ?? addMonths(gymDue, 1);
  const pending = [{ id: ulid(Date.parse(`${gymDue}T06:00:00Z`)), recurringId: gym.id, dueDate: gymDue }];

  return {
    today,
    locale,
    currency: 'EUR',
    startDay: 1,
    weekStart: 1,
    name: t('demo.name'),
    categories,
    movements,
    budgets,
    goals,
    contributions,
    recurring,
    pending,
  };
}
