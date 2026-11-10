/**
 * Own fixed-window rate limiter in the `rate_limit` table (shared with Better Auth; our keys start with
 * `app:`). One atomic upsert per hit, so concurrent requests cannot both pass a stale read.
 */
import { sql } from 'drizzle-orm';
import type { Database } from './db/client';
import { rateLimit } from './db/schema';
import { ulid } from './id';

export interface RateRule {
  /** Window length in seconds. */
  window: number;
  /** Requests allowed per window. */
  max: number;
}

export interface RateResult {
  allowed: boolean;
  /** Seconds until the window resets (for `Retry-After`). */
  retryAfter: number;
}

/** App writes (POST/PUT/PATCH/DELETE on `/app` pages and own `/api` endpoints): 120 per minute per user. */
export const APP_WRITES: RateRule = { window: 60, max: 120 };
/** "Send me a code" on the email confirmation page: 3 per minute per user. */
export const VERIFY_EMAIL_SENDS: RateRule = { window: 60, max: 3 };

export async function hitRateLimit(
  database: Database,
  key: string,
  rule: RateRule,
  now: number = Date.now(),
): Promise<RateResult> {
  const windowMs = rule.window * 1000;
  const expired = sql`${now} - ${rateLimit.lastRequest} >= ${windowMs}`;
  const [row] = await database
    .insert(rateLimit)
    .values({ id: ulid(now), key: `app:${key}`, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimit.count} + 1 END`,
        lastRequest: sql`CASE WHEN ${expired} THEN ${now} ELSE ${rateLimit.lastRequest} END`,
      },
    })
    .returning({ count: rateLimit.count, lastRequest: rateLimit.lastRequest });

  if (!row) return { allowed: true, retryAfter: 0 };
  const retryAfter = Math.max(1, Math.ceil((row.lastRequest + windowMs - now) / 1000));
  return { allowed: row.count <= rule.max, retryAfter };
}
