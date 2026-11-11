/**
 * The daily cron (`/api/cron/daily`, 03:00 UTC). Every step is idempotent: running it twice the same day
 * changes nothing the second time. A failing step is logged to `error_log` (no personal data) and the
 * next steps still run. The clock, the email sender and the logger are injected, so tests use a fake clock.
 *
 * Inactivity is counted in whole UTC days from the day of the last activity (D):
 *   day D + 26 → "deleted on …" email · D + 30 → "deleted tomorrow" email · D + 31 → account deleted.
 * So an account is deleted after at least 30 full days without use, on a date the warnings can name.
 * Nobody is deleted without both warnings: each step needs the previous one sent on an earlier day. When
 * the daily email cap (or a failed send) holds an email back, it goes on the next run and every later step
 * moves one day too; the warnings name the date that results.
 */
import { and, eq, isNotNull, isNull, lt, lte, type SQL } from 'drizzle-orm';
import type { Locale } from '../../i18n';
import { deleteUserRows } from '../account';
import { addDays, isTimeZone, todayIn } from '../dates';
import type { Database } from '../db/client';
import { emailQueue, errorLog, profile, session, user, verification } from '../db/schema';
import { DAILY_EMAIL_CAP, emailsSentOn, recordEmail, utcDay } from '../email-ledger';
import { dueTemplates, materialiseTemplate } from '../recurring/repo';

export type CronEmailKind = 'inactivity-25' | 'inactivity-29' | 'account-deleted' | 'unverified-deleted';

export interface CronDeps {
  db: Database;
  now: Date;
  /** Renders and sends one email; throws when it could not be sent. */
  send: (to: string, kind: CronEmailKind, locale: Locale, vars: Record<string, string>) => Promise<void>;
  /** Writes one row to the error log (never personal data). */
  log: (code: string, message: string) => Promise<void>;
  /** Absolute sign-in page for a language (links in the emails); `create` opens "Create account". */
  signInUrl: (locale: Locale, mode: 'sign-in' | 'create') => string;
}

export interface CronReport {
  occurrences: number;
  warned25: number;
  warned29: number;
  deletedInactive: number;
  deletedUnverified: number;
  /** Emails not sent because the day's cap was reached. */
  capped: number;
  failedSteps: string[];
}

const DAY_MS = 86_400_000;
export const WARN_FIRST_DAYS = 25;
export const WARN_LAST_DAYS = 29;
export const DELETE_AFTER_DAYS = 30;
export const UNVERIFIED_MS = 72 * 60 * 60 * 1000;
export const ERROR_LOG_DAYS = 14;
export const EMAIL_LEDGER_DAYS = 14;
/** The cron's scheduled hour (UTC): deletion dates in emails are shown at this time in the user's zone. */
const CRON_HOUR_UTC = 3;
/** UTC+14, the first time zone to start a new day: no user's today is later than its today. */
const EARLIEST_ZONE = 'Pacific/Kiritimati';

function startOfUtcDay(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** Last active before this instant = inactive for at least `days` full UTC days. */
export function inactiveCutoff(now: Date, days: number): Date {
  return new Date(startOfUtcDay(now) - days * DAY_MS);
}

/**
 * UTC day the account will be deleted, when a warning of `kind` goes out on `today`: day 30 of inactivity
 * at the earliest, and never sooner than the remaining steps allow (one run per day each).
 */
export function deletionDay(
  lastActiveAt: Date,
  today: string,
  kind: 'inactivity-25' | 'inactivity-29',
): string {
  const earliest = addDays(utcDay(lastActiveAt), DELETE_AFTER_DAYS + 1);
  const afterSteps = addDays(today, kind === 'inactivity-25' ? 2 : 1);
  return earliest > afterSteps ? earliest : afterSteps;
}

/** "15 December 2026" / "15 de diciembre de 2026", as that day's cron run falls in the user's zone. */
export function formatDeletionDate(day: string, locale: Locale, timeZone: string): string {
  const instant = new Date(`${day}T0${CRON_HOUR_UTC}:00:00Z`);
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'es-ES', {
    dateStyle: 'long',
    timeZone: isTimeZone(timeZone) ? timeZone : 'UTC',
  }).format(instant);
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export async function runDaily(deps: CronDeps): Promise<CronReport> {
  const report: CronReport = {
    occurrences: 0,
    warned25: 0,
    warned29: 0,
    deletedInactive: 0,
    deletedUnverified: 0,
    capped: 0,
    failedSteps: [],
  };
  const steps: [string, (deps: CronDeps, report: CronReport) => Promise<void>][] = [
    ['RECURRING', materialiseRecurring],
    ['INACTIVITY', handleInactivity],
    ['UNVERIFIED', deleteUnverified],
    ['PRUNE', prune],
  ];
  for (const [name, step] of steps) {
    try {
      await step(deps, report);
    } catch (error) {
      report.failedSteps.push(name);
      await deps.log(`CRON_${name}`, errorText(error));
    }
  }
  return report;
}

/** Room left in today's email cap. */
async function capLeft(deps: CronDeps): Promise<number> {
  return DAILY_EMAIL_CAP - (await emailsSentOn(deps.db, utcDay(deps.now)));
}

/** Sends one email if the cap allows it; never throws (a failed email is logged). Returns true if sent. */
async function trySend(
  deps: CronDeps,
  report: CronReport,
  to: string,
  kind: CronEmailKind,
  locale: Locale,
  vars: Record<string, string>,
  userId: string | null,
): Promise<boolean> {
  if ((await capLeft(deps)) <= 0) {
    report.capped += 1;
    await deps.log('CRON_EMAIL_CAP', `Daily cap reached, ${kind} not sent`);
    return false;
  }
  try {
    await deps.send(to, kind, locale, vars);
  } catch (error) {
    await deps.log('CRON_EMAIL_FAILED', `${kind}: ${errorText(error)}`);
    return false;
  }
  await recordEmail(deps.db, kind, userId, deps.now);
  return true;
}

// ----------------------------------------------------------------------------------- 1. recurring

/** Creates the movements and pending confirmations due today, each template in its owner's time zone. */
async function materialiseRecurring(deps: CronDeps, report: CronReport): Promise<void> {
  const rows = await dueTemplates(deps.db, todayIn(EARLIEST_ZONE, deps.now));
  let failures = 0;
  for (const { row, timezone } of rows) {
    const today = todayIn(isTimeZone(timezone) ? timezone : 'UTC', deps.now);
    try {
      report.occurrences += await materialiseTemplate(deps.db, row, today);
    } catch (error) {
      failures += 1;
      await deps.log('CRON_RECURRING_TEMPLATE', errorText(error));
    }
  }
  if (failures > 0) throw new Error(`${failures} of ${rows.length} templates failed`);
}

// ---------------------------------------------------------------------------------- 2. inactivity

async function handleInactivity(deps: CronDeps, report: CronReport): Promise<void> {
  // Deletion first: it frees no cap, but it is the step that must not wait behind new warnings.
  await deleteInactive(deps, report);
  await warn(deps, report, 'inactivity-29');
  await warn(deps, report, 'inactivity-25');
}

/** Profiles last active before `cutoff` (plus an optional extra condition), with what the emails need. */
const inactiveUsers = (db: Database, cutoff: Date, extra?: SQL) =>
  db
    .select({
      userId: profile.userId,
      email: user.email,
      locale: profile.locale,
      timezone: profile.timezone,
      lastActiveAt: profile.lastActiveAt,
    })
    .from(profile)
    .innerJoin(user, eq(user.id, profile.userId))
    .where(and(lt(profile.lastActiveAt, cutoff), extra));

/**
 * Day 30: deletes the account and says so by email. Only after the day-29 warning went out on an earlier
 * day; with no room left in today's cap the deletion waits for the next run, so the notice always goes.
 */
async function deleteInactive(deps: CronDeps, report: CronReport): Promise<void> {
  const cutoff = inactiveCutoff(deps.now, DELETE_AFTER_DAYS);
  const today = new Date(startOfUtcDay(deps.now));
  const ready = and(isNotNull(profile.warned29At), lt(profile.warned29At, today));
  for (const candidate of await inactiveUsers(deps.db, cutoff, ready)) {
    if ((await capLeft(deps)) <= 0) {
      report.capped += 1;
      await deps.log('CRON_EMAIL_CAP', 'Daily cap reached, deletions wait for tomorrow');
      return;
    }
    const deleted = await deps.db.transaction(async (tx) => {
      // Re-checked inside the transaction: a sign-in a moment ago (which clears the warnings) keeps it.
      const [still] = await tx
        .select({ userId: profile.userId })
        .from(profile)
        .where(and(eq(profile.userId, candidate.userId), lt(profile.lastActiveAt, cutoff), ready));
      if (!still) return false;
      await deleteUserRows(tx, candidate.userId);
      return true;
    });
    if (!deleted) continue;
    report.deletedInactive += 1;
    await trySend(
      deps,
      report,
      candidate.email,
      'account-deleted',
      candidate.locale,
      { signInUrl: deps.signInUrl(candidate.locale, 'create') },
      null,
    );
  }
}

/**
 * Day 25 and day 29 warnings, once each and in that order (day 29 needs day 25 sent on an earlier day).
 * The warning is claimed (`warned_*_at` set only if still empty) before sending, so two runs never send it
 * twice; a failed send clears the claim to retry on the next run. Activity clears both (`touchActivity`).
 */
async function warn(
  deps: CronDeps,
  report: CronReport,
  kind: 'inactivity-25' | 'inactivity-29',
): Promise<void> {
  const last = kind === 'inactivity-29';
  const cutoff = inactiveCutoff(deps.now, last ? WARN_LAST_DAYS : WARN_FIRST_DAYS);
  const today = utcDay(deps.now);
  const due = last
    ? and(
        isNull(profile.warned29At),
        isNotNull(profile.warned25At),
        lt(profile.warned25At, new Date(startOfUtcDay(deps.now))),
      )
    : isNull(profile.warned25At);
  const candidates = await inactiveUsers(deps.db, cutoff, due);

  for (const candidate of candidates) {
    if ((await capLeft(deps)) <= 0) {
      report.capped += 1;
      await deps.log('CRON_EMAIL_CAP', `Daily cap reached, ${kind} waits for tomorrow`);
      return;
    }
    const claimed = await deps.db
      .update(profile)
      .set(last ? { warned29At: deps.now } : { warned25At: deps.now })
      .where(and(eq(profile.userId, candidate.userId), lt(profile.lastActiveAt, cutoff), due))
      .returning({ userId: profile.userId });
    if (claimed.length === 0) continue;

    const day = deletionDay(candidate.lastActiveAt, today, kind);
    const sent = await trySend(
      deps,
      report,
      candidate.email,
      kind,
      candidate.locale,
      {
        deleteDate: formatDeletionDate(day, candidate.locale, candidate.timezone),
        signInUrl: deps.signInUrl(candidate.locale, 'sign-in'),
      },
      candidate.userId,
    );
    if (sent) {
      if (last) report.warned29 += 1;
      else report.warned25 += 1;
      continue;
    }
    await deps.db
      .update(profile)
      .set(last ? { warned29At: null } : { warned25At: null })
      .where(eq(profile.userId, candidate.userId));
  }
}

// --------------------------------------------------------------------------------- 3. unverified

/** Accounts created with a passkey whose email was never confirmed within 72 hours. */
async function deleteUnverified(deps: CronDeps, report: CronReport): Promise<void> {
  const cutoff = new Date(deps.now.getTime() - UNVERIFIED_MS);
  const candidates = await deps.db
    .select({ id: user.id, email: user.email, locale: user.locale })
    .from(user)
    .where(and(eq(user.emailVerified, false), lt(user.createdAt, cutoff)));
  for (const candidate of candidates) {
    const deleted = await deps.db.transaction(async (tx) => {
      const [still] = await tx
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.id, candidate.id), eq(user.emailVerified, false)));
      if (!still) return false;
      await deleteUserRows(tx, candidate.id);
      return true;
    });
    if (!deleted) continue;
    report.deletedUnverified += 1;
    await trySend(
      deps,
      report,
      candidate.email,
      'unverified-deleted',
      candidate.locale,
      { signInUrl: deps.signInUrl(candidate.locale, 'create') },
      null,
    );
  }
}

// -------------------------------------------------------------------------------------- 4. prune

async function prune(deps: CronDeps): Promise<void> {
  const now = deps.now.getTime();
  await deps.db.batch([
    deps.db.delete(errorLog).where(lt(errorLog.at, now - ERROR_LOG_DAYS * DAY_MS)),
    deps.db
      .delete(emailQueue)
      .where(lt(emailQueue.scheduledFor, addDays(utcDay(deps.now), -EMAIL_LEDGER_DAYS))),
    deps.db.delete(session).where(lte(session.expiresAt, deps.now)),
    deps.db.delete(verification).where(lte(verification.expiresAt, deps.now)),
  ]);
}
