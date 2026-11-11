/**
 * `PATCH /api/goals/:id` — edits one of the user's goals (JSON, `goalUpdateInput`).
 * `DELETE /api/goals/:id` — deletes it with its contributions (the 5-second undo happens in the browser).
 * Another user's id answers 404, exactly like a missing one.
 */
import type { APIRoute } from 'astro';
import { apiError, json, readJson } from '../../../lib/api';
import { db } from '../../../lib/db';
import { describeError, logError } from '../../../lib/errors';
import { ULID_PATTERN } from '../../../lib/id';
import { deleteGoal, updateGoal } from '../../../lib/plan/repo';
import { goalUpdateInput } from '../../../lib/plan/schema';

export const prerender = false;

const ROUTE = '/api/goals/[id]';

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const id = params['id'] ?? '';
  if (!ULID_PATTERN.test(id)) return apiError(404, 'NOT_FOUND');
  const body = await readJson(request, goalUpdateInput);
  if (!body.ok) return body.response;
  try {
    const result = await updateGoal(db, user.id, id, body.data);
    return result.ok ? json(200, { goal: result.goal }) : apiError(404, result.error);
  } catch (error) {
    await logError(ROUTE, 'GOAL_UPDATE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const id = params['id'] ?? '';
  if (!ULID_PATTERN.test(id)) return apiError(404, 'NOT_FOUND');
  try {
    return (await deleteGoal(db, user.id, id)) ? json(204) : apiError(404, 'NOT_FOUND');
  } catch (error) {
    await logError(ROUTE, 'GOAL_DELETE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};
