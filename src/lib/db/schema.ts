import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Unix time in milliseconds, read and written as `Date` (Better Auth expects dates). */
const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });
const createdAt = () =>
  timestamp('created_at')
    .notNull()
    .default(sql`(unixepoch() * 1000)`);
const updatedAt = () =>
  timestamp('updated_at')
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date());

/**
 * Own error log (Vercel Hobby keeps runtime logs for about one hour).
 * Never stores personal data: no user id, email, IP or amounts. Pruned after 14 days by the daily cron.
 */
export const errorLog = sqliteTable(
  'error_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Unix time in milliseconds. */
    at: integer('at').notNull(),
    route: text('route').notNull(),
    code: text('code').notNull(),
    message: text('message').notNull(),
  },
  (table) => [index('error_log_at_idx').on(table.at)],
);

// ---------------------------------------------------------------------------------------------------------
// Better Auth tables. Property names are the field names Better Auth uses; columns are snake_case.
// ---------------------------------------------------------------------------------------------------------

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default(''),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  /** Ticked "I'm 18 or older and accept the terms" when the account was created. */
  ageConfirmed: integer('age_confirmed', { mode: 'boolean' }).notNull().default(false),
  /** Language of the page where the account was created; seeds `profile.locale`. */
  locale: text('locale', { enum: ['en', 'es'] })
    .notNull()
    .default('en'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const passkey = sqliteTable(
  'passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
    transports: text('transports'),
    createdAt: timestamp('created_at'),
    aaguid: text('aaguid'),
  },
  (table) => [
    index('passkey_user_id_idx').on(table.userId),
    index('passkey_credential_id_idx').on(table.credentialID),
  ],
);

/** Shared by Better Auth's limiter (sign-in, codes) and the app's own write limiter (`src/lib/rate-limit.ts`). */
export const rateLimit = sqliteTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  /** Unix time in milliseconds. */
  lastRequest: integer('last_request').notNull(),
});

// ---------------------------------------------------------------------------------------------------------
// App tables. Every query filters by the session's user id (see `src/lib/db/scoped.ts`).
// ---------------------------------------------------------------------------------------------------------

const userId = () =>
  text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' });

export const avatars = [
  'leaf',
  'stone',
  'fern',
  'mushroom',
  'wave',
  'mountain',
  'feather',
  'pinecone',
  'moon',
] as const;

export const profile = sqliteTable('profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull().default(''),
  avatar: text('avatar', { enum: avatars }).notNull().default('leaf'),
  /** ISO 4217; format only, amounts are never converted. */
  currency: text('currency').notNull().default('EUR'),
  locale: text('locale', { enum: ['en', 'es'] })
    .notNull()
    .default('en'),
  /** IANA time zone, e.g. `Europe/Madrid`. */
  timezone: text('timezone').notNull().default('UTC'),
  cycleStartDay: integer('cycle_start_day').notNull().default(1),
  /** 1 = Monday, 7 = Sunday. */
  weekStart: integer('week_start').notNull().default(1),
  mode: text('mode', { enum: ['light', 'dark', 'system'] })
    .notNull()
    .default('system'),
  themeDay: text('theme_day', { enum: ['blue', 'red', 'green'] })
    .notNull()
    .default('blue'),
  themeNight: text('theme_night', { enum: ['blue', 'red', 'green'] })
    .notNull()
    .default('blue'),
  onboardingDone: integer('onboarding_done', { mode: 'boolean' }).notNull().default(false),
  startingSavingsCents: integer('starting_savings_cents'),
  lastActiveAt: timestamp('last_active_at').notNull(),
  warned25At: timestamp('warned_25_at'),
  warned29At: timestamp('warned_29_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const category = sqliteTable(
  'category',
  {
    id: text('id').primaryKey(),
    userId: userId(),
    name: text('name').notNull(),
    icon: text('icon').notNull(),
    /** Category color `c1`…`c8`. */
    color: text('color', { enum: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'] }).notNull(),
    sort: integer('sort').notNull().default(0),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('category_user_id_idx').on(table.userId, table.sort)],
);

export const movement = sqliteTable(
  'movement',
  {
    id: text('id').primaryKey(),
    userId: userId(),
    type: text('type', { enum: ['income', 'expense'] }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    /** Null for income (income has no category). */
    categoryId: text('category_id').references(() => category.id, { onDelete: 'restrict' }),
    /** Calendar date `YYYY-MM-DD` in the user's time zone. */
    date: text('date').notNull(),
    note: text('note').notNull().default(''),
    recurringId: text('recurring_id').references(() => recurring.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('movement_user_date_idx').on(table.userId, table.date),
    index('movement_user_category_date_idx').on(table.userId, table.categoryId, table.date),
  ],
);

export const recurring = sqliteTable(
  'recurring',
  {
    id: text('id').primaryKey(),
    userId: userId(),
    type: text('type', { enum: ['income', 'expense'] }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    /** Null for income. */
    categoryId: text('category_id').references(() => category.id, { onDelete: 'restrict' }),
    note: text('note').notNull().default(''),
    frequency: text('frequency', { enum: ['weekly', 'monthly', 'yearly', 'every_n_days'] }).notNull(),
    intervalDays: integer('interval_days'),
    /** `YYYY-MM-DD`. */
    anchorDate: text('anchor_date').notNull(),
    endDate: text('end_date'),
    mode: text('mode', { enum: ['auto', 'confirm'] }).notNull(),
    /** Next date to materialise, `YYYY-MM-DD` (daily cron). */
    nextDate: text('next_date').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('recurring_user_next_idx').on(table.userId, table.nextDate)],
);
