import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Locale } from '../../src/i18n';
import { addDays } from '../../src/lib/dates';
import { createDb } from '../../src/lib/db/client';
import {
  category,
  emailQueue,
  errorLog,
  movement,
  profile,
  recurring,
  session,
  user,
} from '../../src/lib/db/schema';
import {
  deletionDay,
  formatDeletionDate,
  runDaily,
  type CronDeps,
  type CronEmailKind,
} from '../../src/lib/cron/daily';
import { DAILY_EMAIL_CAP, recordEmail } from '../../src/lib/email-ledger';
import { renderEmail } from '../../src/lib/email-render';
import { ulid } from '../../src/lib/id';
import { touchActivity } from '../../src/lib/profile';

const { db, client } = createDb({ url: ':memory:' });

interface Sent {
  to: string;
  kind: CronEmailKind;
  locale: Locale;
  vars: Record<string, string>;
  day: string;
}

let outbox: Sent[] = [];
let logs: string[] = [];
let failSends = false;

/** The cron at 03:00 UTC on `day`. */
function deps(day: string, minutes = 0): CronDeps {
  const now = new Date(`${day}T03:${String(minutes).padStart(2, '0')}:00Z`);
  return {
    db,
    now,
    send: async (to, kind, locale, vars) => {
      if (failSends) throw new Error('Resend answered 500');
      outbox.push({ to, kind, locale, vars, day });
    },
    log: async (code) => {
      logs.push(code);
    },
    signInUrl: (locale, mode) => `https://suvaro.test/${locale}/${mode}`,
  };
}

async function seedUser(options: {
  lastActiveAt: Date;
  timezone?: string;
  locale?: Locale;
  verified?: boolean;
  createdAt?: Date;
}) {
  const id = ulid();
  const email = `user-${id}@example.com`;
  await db.insert(user).values({
    id,
    email,
    ageConfirmed: true,
    emailVerified: options.verified ?? true,
    locale: options.locale ?? 'en',
    ...(options.createdAt ? { createdAt: options.createdAt } : {}),
  });
  await db.insert(profile).values({
    userId: id,
    lastActiveAt: options.lastActiveAt,
    timezone: options.timezone ?? 'Europe/Madrid',
    locale: options.locale ?? 'en',
    onboardingDone: true,
  });
  return { id, email };
}

async function exists(userId: string): Promise<boolean> {
  return (await db.select({ id: user.id }).from(user).where(eq(user.id, userId))).length > 0;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: 'drizzle' });
});

afterAll(() => client.close());

beforeEach(async () => {
  outbox = [];
  logs = [];
  failSends = false;
  await db.delete(emailQueue);
});

describe('inactivity over a month of daily runs', () => {
  it('warns on day 25 and 29, deletes on day 30, each exactly once (twice-run days included)', async () => {
    const lastActive = new Date('2026-10-01T10:00:00Z');
    const madrid = await seedUser({ lastActiveAt: lastActive, locale: 'es' });
    const food = ulid();
    await db
      .insert(category)
      .values({ id: food, userId: madrid.id, name: 'Food', icon: 'utensils', color: 'c1' });
    await db.insert(recurring).values({
      id: ulid(),
      userId: madrid.id,
      type: 'expense',
      amountCents: 999,
      categoryId: food,
      frequency: 'monthly',
      anchorDate: '2027-01-01',
      mode: 'auto',
      nextDate: '2027-01-01',
    });
    await db.insert(movement).values({
      id: ulid(),
      userId: madrid.id,
      type: 'expense',
      amountCents: 500,
      categoryId: food,
      date: '2026-09-30',
    });

    for (let day = '2026-10-02'; day <= '2026-11-05'; day = addDays(day, 1)) {
      await runDaily(deps(day));
      await runDaily(deps(day, 40)); // A retry within the same hour changes nothing.
    }

    const mine = outbox.filter((email) => email.to === madrid.email);
    expect(mine.map(({ kind, day }) => [kind, day])).toEqual([
      ['inactivity-25', '2026-10-27'],
      ['inactivity-29', '2026-10-31'],
      ['account-deleted', '2026-11-01'],
    ]);
    expect(mine[0]?.locale).toBe('es');
    expect(mine[0]?.vars).toEqual({
      deleteDate: '1 de noviembre de 2026',
      signInUrl: 'https://suvaro.test/es/sign-in',
    });
    expect(mine[1]?.vars['deleteDate']).toBe('1 de noviembre de 2026');
    expect(mine[2]?.vars).toEqual({ signInUrl: 'https://suvaro.test/es/create' });
    expect(await exists(madrid.id)).toBe(false);
    // Categories are referenced by movements and templates with RESTRICT: the deletion still went through.
    expect(await db.select().from(category).where(eq(category.userId, madrid.id))).toEqual([]);
    expect(logs).toEqual([]);
  });

  it('activity resets the warnings, so the cycle starts over', async () => {
    const ana = await seedUser({ lastActiveAt: new Date('2026-10-01T10:00:00Z') });
    await runDaily(deps('2026-10-27'));
    expect(outbox.map((email) => email.kind)).toEqual(['inactivity-25']);

    const [row] = await db.select().from(profile).where(eq(profile.userId, ana.id));
    if (!row) throw new Error('missing');
    await touchActivity(db, row, new Date('2026-10-28T09:00:00Z'));

    for (let day = '2026-10-28'; day <= '2026-11-23'; day = addDays(day, 1)) await runDaily(deps(day));
    expect(outbox.map((email) => [email.kind, email.day])).toEqual([
      ['inactivity-25', '2026-10-27'],
      ['inactivity-25', '2026-11-23'],
    ]);
    expect(await exists(ana.id)).toBe(true);
    await db.delete(user).where(eq(user.id, ana.id));
  });

  it('names the deletion date as the cron run falls in the user’s time zone', () => {
    const lastActive = new Date('2026-10-01T10:00:00Z');
    expect(deletionDay(lastActive, '2026-10-27', 'inactivity-25')).toBe('2026-11-01');
    expect(deletionDay(lastActive, '2026-10-31', 'inactivity-29')).toBe('2026-11-01');
    // Late warnings push the date: every remaining step needs its own run.
    expect(deletionDay(lastActive, '2026-11-03', 'inactivity-25')).toBe('2026-11-05');
    expect(deletionDay(lastActive, '2026-11-04', 'inactivity-29')).toBe('2026-11-05');
    expect(formatDeletionDate('2026-11-01', 'en', 'Europe/Madrid')).toBe('1 November 2026');
    // 03:00 UTC on 1 November is the evening of 31 October in Los Angeles.
    expect(formatDeletionDate('2026-11-01', 'en', 'America/Los_Angeles')).toBe('31 October 2026');
    expect(formatDeletionDate('2026-11-01', 'es', 'Not/AZone')).toBe('1 de noviembre de 2026');
  });

  it('a late account still gets both warnings, a day apart, before it is deleted', async () => {
    const late = await seedUser({ lastActiveAt: new Date('2026-10-01T10:00:00Z') });
    for (let day = '2026-10-31'; day <= '2026-11-03'; day = addDays(day, 1)) {
      await runDaily(deps(day));
      await runDaily(deps(day, 30));
    }
    expect(outbox.map(({ kind, day, vars }) => [kind, day, vars['deleteDate']])).toEqual([
      ['inactivity-25', '2026-10-31', '2 November 2026'],
      ['inactivity-29', '2026-11-01', '2 November 2026'],
      ['account-deleted', '2026-11-02', undefined],
    ]);
    expect(await exists(late.id)).toBe(false);
  });
});

describe('email cap and failures', () => {
  it('over the daily cap warnings and deletions wait for the next run, so the notice always goes', async () => {
    const warned = await seedUser({ lastActiveAt: new Date('2026-10-01T10:00:00Z') });
    const gone = await seedUser({ lastActiveAt: new Date('2026-09-01T10:00:00Z') });
    await db
      .update(profile)
      .set({ warned25At: new Date('2026-10-20T03:00:00Z'), warned29At: new Date('2026-10-26T03:00:00Z') })
      .where(eq(profile.userId, gone.id));
    const now = new Date('2026-10-27T03:00:00Z');
    for (let i = 0; i < DAILY_EMAIL_CAP; i++) await recordEmail(db, 'otp', null, now);

    const report = await runDaily(deps('2026-10-27'));
    expect(outbox).toEqual([]);
    expect(report.capped).toBe(2);
    expect(report.deletedInactive).toBe(0);
    expect(await exists(gone.id)).toBe(true);
    expect(logs).toContain('CRON_EMAIL_CAP');

    await runDaily(deps('2026-10-28'));
    expect(outbox.map((email) => [email.to, email.kind])).toEqual([
      [gone.email, 'account-deleted'],
      [warned.email, 'inactivity-25'],
    ]);
    expect(await exists(gone.id)).toBe(false);
    await db.delete(user).where(eq(user.id, warned.id));
  });

  it('a failed send is logged and retried on the next run', async () => {
    const retry = await seedUser({ lastActiveAt: new Date('2026-10-01T10:00:00Z') });
    failSends = true;
    await runDaily(deps('2026-10-27'));
    expect(logs).toEqual(['CRON_EMAIL_FAILED']);
    failSends = false;
    await runDaily(deps('2026-10-28'));
    expect(outbox.map((email) => email.kind)).toEqual(['inactivity-25']);
    await db.delete(user).where(eq(user.id, retry.id));
  });

  it('counts every email sent in the ledger, without any address', async () => {
    const counted = await seedUser({ lastActiveAt: new Date('2026-10-01T10:00:00Z') });
    await runDaily(deps('2026-10-27'));
    const rows = await db.select().from(emailQueue);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'inactivity-25', userId: counted.id, scheduledFor: '2026-10-27' });
    await db.delete(user).where(eq(user.id, counted.id));
  });
});

describe('unverified accounts', () => {
  it('deletes accounts unconfirmed after 72 hours and emails them once', async () => {
    const now = new Date('2026-11-11T03:00:00Z');
    const hours = (h: number) => new Date(now.getTime() - h * 3_600_000);
    const old = await seedUser({ lastActiveAt: now, verified: false, createdAt: hours(73), locale: 'es' });
    const recent = await seedUser({ lastActiveAt: now, verified: false, createdAt: hours(71) });
    const verified = await seedUser({ lastActiveAt: now, verified: true, createdAt: hours(500) });

    await runDaily(deps('2026-11-11'));
    await runDaily(deps('2026-11-11', 20));
    expect(outbox.map(({ to, kind, locale }) => [to, kind, locale])).toEqual([
      [old.email, 'unverified-deleted', 'es'],
    ]);
    expect(await exists(old.id)).toBe(false);
    expect(await exists(recent.id)).toBe(true);
    expect(await exists(verified.id)).toBe(true);
    await db.delete(user).where(eq(user.id, recent.id));
    await db.delete(user).where(eq(user.id, verified.id));
  });
});

describe('recurring and pruning', () => {
  it('creates due movements in each user’s time zone, once', async () => {
    const now = new Date('2026-11-11T03:00:00Z');
    const madrid = await seedUser({ lastActiveAt: now, timezone: 'Europe/Madrid' });
    const la = await seedUser({ lastActiveAt: now, timezone: 'America/Los_Angeles' });
    for (const owner of [madrid, la]) {
      await db.insert(recurring).values({
        id: ulid(),
        userId: owner.id,
        type: 'income',
        amountCents: 100_000,
        frequency: 'monthly',
        anchorDate: '2026-10-11',
        mode: 'auto',
        nextDate: '2026-11-11',
      });
    }
    const first = await runDaily(deps('2026-11-11'));
    const second = await runDaily(deps('2026-11-11', 50));
    expect([first.occurrences, second.occurrences]).toEqual([1, 0]);
    const dates = async (userId: string) =>
      (await db.select({ date: movement.date }).from(movement).where(eq(movement.userId, userId))).map(
        (r) => r.date,
      );
    expect(await dates(madrid.id)).toEqual(['2026-11-11']);
    expect(await dates(la.id)).toEqual([]); // Still 10 November in Los Angeles.
    await runDaily(deps('2026-11-12'));
    expect(await dates(la.id)).toEqual(['2026-11-11']);
    await db.delete(movement);
    await db.delete(recurring);
    await db.delete(user).where(eq(user.id, madrid.id));
    await db.delete(user).where(eq(user.id, la.id));
  });

  it('prunes old error logs, old ledger rows and expired sessions', async () => {
    const now = new Date('2026-11-11T03:00:00Z');
    const owner = await seedUser({ lastActiveAt: now });
    await db.insert(errorLog).values([
      { at: now.getTime() - 15 * 86_400_000, route: '/x', code: 'OLD', message: 'old' },
      { at: now.getTime() - 86_400_000, route: '/x', code: 'NEW', message: 'new' },
    ]);
    await recordEmail(db, 'otp', null, new Date('2026-10-20T10:00:00Z'));
    await recordEmail(db, 'otp', null, new Date('2026-11-10T10:00:00Z'));
    await db.insert(session).values([
      { id: ulid(), token: ulid(), userId: owner.id, expiresAt: new Date(now.getTime() - 1) },
      { id: ulid(), token: ulid(), userId: owner.id, expiresAt: new Date(now.getTime() + 86_400_000) },
    ]);
    const report = await runDaily(deps('2026-11-11'));
    expect(report.failedSteps).toEqual([]);
    expect((await db.select().from(errorLog)).map((row) => row.code)).toEqual(['NEW']);
    expect((await db.select().from(emailQueue)).map((row) => row.scheduledFor)).toEqual(['2026-11-10']);
    expect(await db.select().from(session)).toHaveLength(1);
    await db.delete(user).where(eq(user.id, owner.id));
  });
});

describe('cron emails in English and Spanish', () => {
  const kinds: CronEmailKind[] = ['inactivity-25', 'inactivity-29', 'account-deleted', 'unverified-deleted'];
  const vars = { deleteDate: '1 November 2026', signInUrl: 'https://suvaro.xyz/sign-in?mode=create' };

  /** Frontmatter `key: value` (optionally single-quoted) and the Markdown body. */
  async function load(locale: Locale, kind: CronEmailKind) {
    const raw = await readFile(`src/content/emails/${locale}/${kind}.md`, 'utf8');
    const [, front = '', body = ''] = raw.split(/^---$/m);
    const field = (name: string) =>
      (new RegExp(`^${name}: (.*)$`, 'm').exec(front)?.[1] ?? '').replace(/^'(.*)'$/, '$1');
    return { subject: field('subject'), preheader: field('preheader'), markdown: body.trim() };
  }

  for (const locale of ['en', 'es'] as const) {
    for (const kind of kinds) {
      it(`${locale}/${kind} renders with its placeholders filled`, async () => {
        const source = await load(locale, kind);
        expect(source.subject.length).toBeGreaterThan(0);
        expect(source.subject.length).toBeLessThanOrEqual(80);
        expect(source.preheader.length).toBeLessThanOrEqual(120);
        // The HTML part as the content layer renders a Markdown link: percent-encoded placeholder.
        const html = `<p><a href="%7B%7BsignInUrl%7D%7D">link</a> ${source.markdown}</p>`;
        const email = renderEmail({ ...source, html }, vars, locale);
        expect(email.text).toContain(vars.signInUrl);
        expect(email.html).toContain('href="https://suvaro.xyz/sign-in?mode=create"');
        expect(`${email.subject} ${email.text} ${email.html}`).not.toMatch(/\{\{|%7B%7B/);
        if (kind.startsWith('inactivity')) expect(email.text).toContain(vars.deleteDate);
      });
    }
  }
});
