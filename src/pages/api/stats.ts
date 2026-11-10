/**
 * `GET /api/stats?period=week|month|year&date=YYYY-MM-DD` or `?period=custom&from=…&to=…` — everything Stats
 * needs for one period (the current cycle without a query). Future periods and bad queries are refused (400).
 */
import type { APIRoute } from 'astro';
import { apiError, json } from '../../lib/api';
import { todayIn } from '../../lib/dates';
import { db } from '../../lib/db';
import { choosePeriod } from '../../lib/stats/period';
import { loadStats } from '../../lib/stats/repo';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const { user, profile } = locals;
  if (!user || !profile) return apiError(401, 'UNAUTHORIZED');

  const today = todayIn(profile.timezone);
  const settings = { startDay: profile.cycleStartDay, weekStart: profile.weekStart === 7 ? 7 : 1 } as const;
  const choice = choosePeriod(url.searchParams, settings, today);
  if (!choice) return apiError(400, 'INVALID_QUERY');
  return json(200, await loadStats(db, user.id, choice, settings, today));
};
