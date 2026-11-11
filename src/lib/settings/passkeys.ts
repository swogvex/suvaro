/**
 * Settings › Security: rename and remove the signed-in user's passkeys (server). Better Auth's own
 * update/delete endpoints are disabled (`disabledPaths` in auth.ts) so this rule can't be skipped:
 * the last passkey can only go when the email is confirmed (the email code is then the way back in).
 */
import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/client';
import { passkey } from '../db/schema';

export const PASSKEY_NAME_MAX = 40;

export const passkeyRenameInput = z.strictObject({
  name: z
    .string()
    .max(PASSKEY_NAME_MAX * 2)
    .transform((name) => name.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1).max(PASSKEY_NAME_MAX)),
});

type Result = { ok: true } | { ok: false; error: 'NOT_FOUND' | 'LAST_PASSKEY' };

export async function renamePasskey(db: Database, userId: string, id: string, name: string): Promise<Result> {
  const updated = await db
    .update(passkey)
    .set({ name })
    .where(and(eq(passkey.id, id), eq(passkey.userId, userId)))
    .returning({ id: passkey.id });
  return updated.length > 0 ? { ok: true } : { ok: false, error: 'NOT_FOUND' };
}

export async function removePasskey(
  db: Database,
  user: { id: string; emailVerified: boolean },
  id: string,
): Promise<Result> {
  const [own] = await db
    .select({ id: passkey.id })
    .from(passkey)
    .where(and(eq(passkey.id, id), eq(passkey.userId, user.id)));
  if (!own) return { ok: false, error: 'NOT_FOUND' };
  const [total] = await db.select({ n: count() }).from(passkey).where(eq(passkey.userId, user.id));
  if ((total?.n ?? 0) <= 1 && !user.emailVerified) return { ok: false, error: 'LAST_PASSKEY' };
  await db.delete(passkey).where(and(eq(passkey.id, id), eq(passkey.userId, user.id)));
  return { ok: true };
}
