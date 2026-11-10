/** The signed-in user's profile row (one per user), created on first use. */
import { eq } from 'drizzle-orm';
import { isLocale } from '../i18n';
import type { Database } from './db/client';
import { profile } from './db/schema';
import { shouldTouchActivity } from './request-guards';

export type Profile = typeof profile.$inferSelect;

export async function ensureProfile(
  database: Database,
  user: { id: string; locale?: unknown },
): Promise<Profile> {
  const [existing] = await database.select().from(profile).where(eq(profile.userId, user.id)).limit(1);
  if (existing) return existing;
  const locale = isLocale(user.locale) ? user.locale : 'en';
  await database
    .insert(profile)
    .values({ userId: user.id, locale, lastActiveAt: new Date() })
    .onConflictDoNothing();
  const [created] = await database.select().from(profile).where(eq(profile.userId, user.id)).limit(1);
  if (!created) throw new Error('Profile could not be created');
  return created;
}

/** Marks the user active (throttled) and clears pending inactivity warnings. */
export async function touchActivity(database: Database, row: Profile, now: Date = new Date()): Promise<void> {
  if (!shouldTouchActivity(row.lastActiveAt, now)) return;
  await database
    .update(profile)
    .set({ lastActiveAt: now, warned25At: null, warned29At: null })
    .where(eq(profile.userId, row.userId));
}
