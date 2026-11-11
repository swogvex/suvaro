/** Settings writes (server). Every query is scoped to the signed-in user's id. */
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { profile } from '../db/schema';
import type { Profile } from '../profile';
import type { ProfilePatch } from './schema';

/** Saves the given profile fields and returns the updated row. */
export async function updateProfile(db: Database, userId: string, patch: ProfilePatch): Promise<Profile> {
  const [row] = await db.update(profile).set(patch).where(eq(profile.userId, userId)).returning();
  if (!row) throw new Error('Profile not found');
  return row;
}

/** What Settings can change, as the API answers it (no ids, timestamps or inactivity fields). */
export function editableFields(row: Profile) {
  return {
    displayName: row.displayName,
    avatar: row.avatar,
    currency: row.currency,
    locale: row.locale,
    weekStart: row.weekStart,
    cycleStartDay: row.cycleStartDay,
    mode: row.mode,
    themeDay: row.themeDay,
    themeNight: row.themeNight,
  };
}
