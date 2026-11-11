/**
 * `GET /api/plan` — goals, budgets and the current cycle's spending (the Plan island refreshes with it when
 * the tab comes back or a movement changes). No query parameters.
 */
import type { APIRoute } from 'astro';
import { apiError, json } from '../../lib/api';
import { db } from '../../lib/db';
import { currentCycle } from '../../lib/plan/notify';
import { loadPlan } from '../../lib/plan/repo';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const { user, profile } = locals;
  if (!user || !profile) return apiError(401, 'UNAUTHORIZED');
  if ([...url.searchParams.keys()].length > 0) return apiError(400, 'INVALID_QUERY');
  return json(200, await loadPlan(db, user.id, currentCycle(profile)));
};
