/**
 * `GET /api/budgets` — category limits and the current cycle's spending (the editor's budget notice).
 * `PUT /api/budgets` — replaces every limit at once (`budgetsInput`): the global one and the categories'.
 */
import type { APIRoute } from 'astro';
import { apiError, json, readJson } from '../../lib/api';
import { db } from '../../lib/db';
import { describeError, logError } from '../../lib/errors';
import { currentCycle } from '../../lib/plan/notify';
import { budgetStatus, saveBudgets } from '../../lib/plan/repo';
import { budgetsInput } from '../../lib/plan/schema';

export const prerender = false;

/** 50 categories with their limits fit comfortably. */
const MAX_BYTES = 8_192;

export const GET: APIRoute = async ({ url, locals }) => {
  const { user, profile } = locals;
  if (!user || !profile) return apiError(401, 'UNAUTHORIZED');
  if ([...url.searchParams.keys()].length > 0) return apiError(400, 'INVALID_QUERY');
  return json(200, await budgetStatus(db, user.id, currentCycle(profile)));
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const body = await readJson(request, budgetsInput, MAX_BYTES);
  if (!body.ok) return body.response;
  try {
    const result = await saveBudgets(db, user.id, body.data);
    return result.ok ? json(200, { budgets: result.budgets }) : apiError(400, result.error);
  } catch (error) {
    await logError('/api/budgets', 'BUDGETS_SAVE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};
