/**
 * Ledger of sent emails (`email_queue`) for the daily cap: Resend's free plan sends 100 emails a day.
 * Sign-in codes are always sent (and counted); the cron stops sending warnings once the day is full.
 */
import { count, eq } from 'drizzle-orm';
import type { Database } from './db/client';
import { emailQueue } from './db/schema';
import { ulid } from './id';

export const DAILY_EMAIL_CAP = 100;

export type LedgerKind = (typeof emailQueue.$inferInsert)['kind'];

/** The UTC day an email counts toward (Resend counts by UTC day). */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function emailsSentOn(db: Database, day: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(emailQueue).where(eq(emailQueue.scheduledFor, day));
  return row?.n ?? 0;
}

/** Records one sent email. `userId` is null when the account no longer exists (or is not created yet). */
export async function recordEmail(
  db: Database,
  kind: LedgerKind,
  userId: string | null,
  now: Date = new Date(),
): Promise<void> {
  await db
    .insert(emailQueue)
    .values({ id: ulid(now.getTime()), kind, userId, scheduledFor: utcDay(now), sentAt: now.getTime() });
}
