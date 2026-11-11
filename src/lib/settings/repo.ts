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
