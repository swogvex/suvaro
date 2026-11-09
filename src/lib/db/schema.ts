import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
