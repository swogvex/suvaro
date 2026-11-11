/** `POST /api/goals` — creates a goal (JSON, `goalCreateInput`); 201 with the goal. At most 20 per user. */
import type { APIRoute } from 'astro';
import { apiError, json, readJson } from '../../../lib/api';
import { db } from '../../../lib/db';
import { describeError, logError } from '../../../lib/errors';
import { createGoal } from '../../../lib/plan/repo';
import { goalCreateInput } from '../../../lib/plan/schema';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const body = await readJson(request, goalCreateInput);
  if (!body.ok) return body.response;
  try {
    const result = await createGoal(db, user.id, body.data);
    return result.ok ? json(201, { goal: result.goal }) : apiError(409, result.error);
  } catch (error) {
    await logError('/api/goals', 'GOAL_CREATE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};
