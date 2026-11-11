/** Deleting a whole account (server only). Used by the daily cron now and by Settings › Privacy later. */
import { eq } from 'drizzle-orm';
import type { Database } from './db/client';
import { movement, recurring, user } from './db/schema';

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Deletes a user and every row they own. Movements and recurring templates go first: they point at
 * categories with `ON DELETE RESTRICT`, which would block the cascade from `user` to `category`.
 * Everything else (profile, sessions, passkeys, categories, budgets, goals…) cascades from `user`.
 * Call it inside a transaction.
 */
export async function deleteUserRows(executor: Executor, userId: string): Promise<void> {
  await executor.delete(movement).where(eq(movement.userId, userId));
  await executor.delete(recurring).where(eq(recurring.userId, userId));
  await executor.delete(user).where(eq(user.id, userId));
}
