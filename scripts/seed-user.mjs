// Seeds a signed-in test user with realistic data in the LOCAL database (Lighthouse CI, e2e and manual
// checks of the app pages) and prints the session cookie to send. Running it again replaces that user.
//
//   node scripts/seed-user.mjs [label]            → seeds, then prints `__Host-suvaro.session=…`
//   node scripts/seed-user.mjs [label] --cookie   → only prints the cookie (no database access)
//
// `label` (default "lighthouse") gives each caller its own user. Seed BEFORE the server starts writing (a
// second writer on the SQLite file makes the server's own writes fail with SQLITE_BUSY); e2e does it in the
// Playwright webServer command and then only asks for the cookie.
// Never runs against Turso: it refuses when TURSO_DATABASE_URL or BETTER_AUTH_SECRET is set, because the
// cookie is signed with the development secret, exactly like Better Auth signs it.
import { createHmac, randomBytes } from 'node:crypto';
import { createClient } from '@libsql/client';

if (process.env.TURSO_DATABASE_URL || process.env.BETTER_AUTH_SECRET) {
  console.error('seed-user only runs on the local database with the development secret.');
  process.exit(1);
}

const args = process.argv.slice(2);
const cookieOnly = args.includes('--cookie');
const label =
  (args.find((arg) => !arg.startsWith('--')) ?? 'lighthouse').replace(/[^a-z0-9-]/gi, '').slice(0, 20) ||
  'lighthouse';
const SECRET = 'development-only-secret-not-used-on-vercel-000000';
const COOKIE = '__Host-suvaro.session';
const USER_ID = `seed-user-${label}`;
const TOKEN = `seeded-${label}-session-token-0000000000`;
const EMAIL = `seed-${label}@example.com`;

const signature = createHmac('sha256', SECRET).update(TOKEN).digest('base64');
const cookie = `${COOKIE}=${encodeURIComponent(`${TOKEN}.${signature}`)}`;
if (cookieOnly) {
  console.log(cookie);
  process.exit(0);
}

const db = createClient({ url: 'file:local.db' });

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let lastTime = 0;
let seq = 0;
/** Sortable ids (ULID-like) so rows of the same day keep their insertion order. */
function id() {
  const now = Date.now();
  seq = now === lastTime ? seq + 1 : 0;
  lastTime = now;
  let time = '';
  for (let t = now, i = 0; i < 10; i += 1, t = Math.floor(t / 32)) time = CROCKFORD[t % 32] + time;
  const tail = [...randomBytes(16)].map((b) => CROCKFORD[b % 32]).join('');
  return time + String(seq).padStart(4, '0') + tail.slice(0, 12);
}

const iso = (date) => date.toISOString().slice(0, 10);
const day = (base, n) => {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const today = iso(new Date());
const cycleStart = `${today.slice(0, 7)}-01`;
/** First day of the month `n` months before the current one. */
const monthsBack = (n) => {
  const d = new Date(`${cycleStart}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return iso(d);
};
const previousStart = monthsBack(1);
const daysSoFar = Number(today.slice(8, 10));

const categories = [
  ['housing', 'Housing', 'house', 'c7'],
  ['food', 'Food', 'utensils', 'c1'],
  ['transport', 'Transport', 'bus', 'c5'],
  ['leisure', 'Leisure', 'ticket', 'c2'],
  ['health', 'Health', 'heart-pulse', 'c6'],
  ['subscriptions', 'Subscriptions', 'repeat', 'c4'],
].map(([key, name, icon, color], sort) => ({ key, id: id(), name, icon, color, sort }));
const cat = Object.fromEntries(categories.map((c) => [c.key, c.id]));

/** One cycle of movements: salary on day 1, rent, then a few expenses spread over the days so far. */
function cycleMovements(start, days, scale) {
  const rows = [
    ['income', 185_000, null, 0, 'Salary'],
    ['expense', 85_000, cat.housing, 0, 'Rent'],
    ['expense', 1_299, cat.subscriptions, 2, 'Music'],
    // Day 1 already has 5 movements and Leisure at 86 % of its budget, whatever day the seed runs.
    ['expense', 8_600, cat.leisure, 0, 'Concert tickets'],
    ['expense', 2_385, cat.food, 0, 'Groceries'],
    ['expense', 980, cat.food, 0, 'Coffee'],
  ];
  const pattern = [
    [cat.food, 2_385, 'Groceries'],
    [cat.transport, 1_200, 'Bus pass top-up'],
    [cat.leisure, 3_150, 'Cinema and dinner'],
    [cat.food, 4_710, 'Market'],
    [cat.health, 1_890, 'Pharmacy'],
    [cat.food, 1_640, ''],
    [cat.leisure, 2_200, 'Concert'],
  ];
  for (let d = 1; d < days; d += 1) {
    const [categoryId, cents, note] = pattern[d % pattern.length];
    rows.push(['expense', Math.round(cents * scale), categoryId, d, note]);
    if (d % 3 === 0) rows.push(['expense', Math.round(980 * scale), cat.food, d, 'Coffee']);
  }
  return rows
    .filter((r) => r[3] < days)
    .map(([type, amount, categoryId, offset, note]) => ({
      type,
      amount,
      categoryId,
      date: day(start, offset),
      note,
    }));
}

const previousDays = Math.round(
  (new Date(`${cycleStart}T00:00:00Z`) - new Date(`${previousStart}T00:00:00Z`)) / 864e5,
);
const daysIn = (start, next) =>
  Math.round((new Date(`${next}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 864e5);
// Three older, lighter months, so Stats has trends (current vs the 3-month average) and six months of bars.
const older = [4, 3, 2].flatMap((n) =>
  cycleMovements(monthsBack(n), daysIn(monthsBack(n), monthsBack(n - 1)), 0.7),
);
const movements = [
  ...older,
  ...cycleMovements(previousStart, previousDays, 0.92),
  ...cycleMovements(cycleStart, daysSoFar, 1),
];

const expires = Date.now() + 30 * 864e5;
const goalId = id();

await db.batch(
  [
    { sql: 'delete from session where token = ?', args: [TOKEN] },
    { sql: 'delete from user where id = ? or email = ?', args: [USER_ID, EMAIL] },
    {
      sql: 'insert into user (id, email, email_verified, age_confirmed, locale) values (?, ?, 1, 1, ?)',
      args: [USER_ID, EMAIL, 'en'],
    },
    {
      sql: `insert into profile (user_id, display_name, currency, locale, timezone, onboarding_done, last_active_at)
            values (?, 'Alex', 'EUR', 'en', 'UTC', 1, ?)`,
      args: [USER_ID, Date.now()],
    },
    {
      sql: 'insert into session (id, expires_at, token, user_id, user_agent) values (?, ?, ?, ?, ?)',
      args: [id(), expires, TOKEN, USER_ID, 'seed-user script'],
    },
    ...categories.map((c) => ({
      sql: 'insert into category (id, user_id, name, icon, color, sort) values (?, ?, ?, ?, ?, ?)',
      args: [c.id, USER_ID, c.name, c.icon, c.color, c.sort],
    })),
    ...movements.map((m) => ({
      sql: 'insert into movement (id, user_id, type, amount_cents, category_id, date, note) values (?, ?, ?, ?, ?, ?, ?)',
      args: [id(), USER_ID, m.type, m.amount, m.categoryId, m.date, m.note],
    })),
    {
      sql: `insert into goal (id, user_id, name, icon, color, target_cents, deadline, pinned)
            values (?, ?, 'Trip to Lisbon', 'plane', 'c5', 120000, ?, 1)`,
      args: [goalId, USER_ID, day(cycleStart, 200)],
    },
    {
      sql: 'insert into contribution (id, user_id, goal_id, amount_cents, date) values (?, ?, ?, 20000, ?), (?, ?, ?, 15000, ?)',
      args: [id(), USER_ID, goalId, previousStart, id(), USER_ID, goalId, cycleStart],
    },
    ...[
      [cat.food, 30_000],
      [cat.leisure, 10_000],
      [cat.transport, 15_000],
      [null, 140_000],
    ].map(([categoryId, limit]) => ({
      sql: 'insert into budget (id, user_id, category_id, limit_cents) values (?, ?, ?, ?)',
      args: [id(), USER_ID, categoryId, limit],
    })),
  ],
  'write',
);

console.log(cookie);
