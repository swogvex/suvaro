/**
 * `GET /api/cron/daily` — run by Vercel Cron at 03:00 UTC (`vercel.json`). Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}`; anything else is refused, and without the variable the route is
 * closed. Answers with counts only (no personal data). Steps: `src/lib/cron/daily.ts`.
 */
import type { APIRoute } from 'astro';
import { CRON_SECRET } from 'astro:env/server';
import { timingSafeEqual } from 'node:crypto';
import { apiError, json } from '../../../lib/api';
import { runDaily } from '../../../lib/cron/daily';
import { db } from '../../../lib/db';
import { authBaseURL } from '../../../lib/deployment';
import { buildEmail, sendEmail } from '../../../lib/email';
import { describeError, logError } from '../../../lib/errors';
import { signInPath } from '../../../lib/routes';

export const prerender = false;

const ROUTE = '/api/cron/daily';

/** Constant-time comparison, so the response time says nothing about the secret. */
function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const GET: APIRoute = async ({ request }) => {
  if (!authorized(request.headers.get('authorization'), CRON_SECRET)) return apiError(401, 'UNAUTHORIZED');
  try {
    const report = await runDaily({
      db,
      now: new Date(),
      send: async (to, kind, locale, vars) => sendEmail(to, await buildEmail(kind, locale, vars)),
      log: (code, message) => logError(ROUTE, code, message),
      signInUrl: (locale, mode) => `${authBaseURL()}${signInPath(locale, mode)}`,
    });
    return json(report.failedSteps.length > 0 ? 500 : 200, report);
  } catch (error) {
    await logError(ROUTE, 'CRON_FAILED', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};
