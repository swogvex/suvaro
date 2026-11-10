/**
 * `GET /api/home?cycle=YYYY-MM` — everything Home needs for one cycle (the current one without `cycle`).
 * Future cycles are refused (400). The island calls it when the cycle selector changes.
 */
import type { APIRoute } from 'astro';
import { apiError, json } from '../../lib/api';
import { todayIn } from '../../lib/dates';
import { db } from '../../lib/db';
import { chooseCycle } from '../../lib/home/cycle-param';
import { loadHome } from '../../lib/home/repo';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const { user, profile } = locals;
  if (!user || !profile) return apiError(401, 'UNAUTHORIZED');

  const params = url.searchParams;
  const choice = chooseCycle(params.get('cycle'), profile.cycleStartDay, todayIn(profile.timezone));
  const onlyCycle = [...params.keys()].every((key) => key === 'cycle');
  if (!choice || !onlyCycle || params.getAll('cycle').length > 1) return apiError(400, 'INVALID_QUERY');
  return json(200, await loadHome(db, user.id, choice.cycle, choice.previousCycle));
};
