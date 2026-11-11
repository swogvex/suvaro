/**
 * "Download all my data" (Settings › Privacy, GDPR access and portability): every row the user owns, as
 * one `data.json` plus one CSV per table, zipped. Only the signed-in user's rows; secrets are left out
 * (session tokens, passkey keys, auth provider tokens, sign-in codes).
 */
import { eq } from 'drizzle-orm';
import { useTranslations, type Locale } from '../i18n';
import type { Database } from './db/client';
import {
  alertSeen,
  budget,
  category,
  contribution,
  emailQueue,
  goal,
  movement,
  passkey,
  profile,
  recurring,
  recurringPending,
  session,
  user,
} from './db/schema';
import { csvCell } from './stats/csv';
import { zip, type ZipFile } from './zip';

type Row = Record<string, unknown>;

/** Dates as ISO strings, everything else as stored. */
function plain(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
  );
}

export async function collectUserData(db: Database, userId: string): Promise<Record<string, Row[]>> {
  const goals = await db.select().from(goal).where(eq(goal.userId, userId));
  const templates = await db.select().from(recurring).where(eq(recurring.userId, userId));
  const budgets = await db.select().from(budget).where(eq(budget.userId, userId));
  const [
    account,
    profiles,
    categories,
    movements,
    contributions,
    pending,
    alerts,
    passkeys,
    sessions,
    emails,
  ] = await Promise.all([
    db
      .select({
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        locale: user.locale,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(eq(user.id, userId)),
    db.select().from(profile).where(eq(profile.userId, userId)),
    db.select().from(category).where(eq(category.userId, userId)),
    db.select().from(movement).where(eq(movement.userId, userId)),
    db.select().from(contribution).where(eq(contribution.userId, userId)),
    db.select().from(recurringPending).where(eq(recurringPending.userId, userId)),
    db.select().from(alertSeen).where(eq(alertSeen.userId, userId)),
    db
      .select({
        id: passkey.id,
        name: passkey.name,
        deviceType: passkey.deviceType,
        backedUp: passkey.backedUp,
        createdAt: passkey.createdAt,
      })
      .from(passkey)
      .where(eq(passkey.userId, userId)),
    db
      .select({
        id: session.id,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })
      .from(session)
      .where(eq(session.userId, userId)),
    db
      .select({
        id: emailQueue.id,
        kind: emailQueue.kind,
        day: emailQueue.scheduledFor,
        sentAt: emailQueue.sentAt,
      })
      .from(emailQueue)
      .where(eq(emailQueue.userId, userId)),
  ]);

  return {
    account,
    profile: profiles,
    categories,
    movements,
    recurring: templates,
    recurring_pending: pending,
    budgets,
    budget_alerts: alerts,
    goals,
    contributions,
    passkeys,
    sessions,
    emails,
  };
}

/** One table as CSV: header from the first row's keys, comma-separated, CRLF, formula-safe cells. */
export function tableCsv(rows: readonly Row[]): string {
  const first = rows[0];
  if (!first) return '';
  const columns = Object.keys(first);
  const cell = (value: unknown) =>
    csvCell(
      value === null || value === undefined
        ? ''
        : value instanceof Date
          ? value.toISOString()
          : String(value),
      ',',
    );
  const lines = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => cell(row[column])).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** README.txt in the user's language (copy from the dictionaries). */
function readme(locale: Locale): string {
  const t = useTranslations(locale);
  return `${t('export.readmeTitle')}\n\n${t('export.readmeFiles')}\n${t('export.readmeFormat')}\n${t('export.readmeSecrets')}\n`;
}

export async function exportUserData(
  db: Database,
  userId: string,
  locale: Locale,
  now: Date = new Date(),
): Promise<Uint8Array<ArrayBuffer>> {
  const tables = await collectUserData(db, userId);
  const json = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.map(plain)]));
  const files: ZipFile[] = [
    { name: 'README.txt', content: readme(locale) },
    { name: 'data.json', content: JSON.stringify({ exportedAt: now.toISOString(), ...json }, null, 2) },
    ...Object.entries(tables).map(([name, rows]) => ({ name: `csv/${name}.csv`, content: tableCsv(rows) })),
  ];
  return zip(files, now);
}
