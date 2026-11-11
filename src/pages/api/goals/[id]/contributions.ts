/**
 * `POST /api/goals/:id/contributions` — sets money aside for one of the user's goals
 * (JSON, `contributionCreateInput`); 201 with the contribution and the goal as it is now.
 */
import type { APIRoute } from 'astro';
import { apiError, json, readJson } from '../../../../lib/api';
import { db } from '../../../../lib/db';
import { describeError, logError } from '../../../../lib/errors';
import { ULID_PATTERN } from '../../../../lib/id';
import { createContribution } from '../../../../lib/plan/repo';
import { contributionCreateInput } from '../../../../lib/plan/schema';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const goalId = params['id'] ?? '';
  if (!ULID_PATTERN.test(goalId)) return apiError(404, 'NOT_FOUND');
  const body = await readJson(request, contributionCreateInput);
  if (!body.ok) return body.response;
  try {
    const result = await createContribution(db, user.id, goalId, body.data);
    if (result.ok) return json(201, { contribution: result.contribution, goal: result.goal });
    return apiError(result.error === 'NOT_FOUND' ? 404 : 409, result.error);
  } catch (error) {
    await logError('/api/goals/[id]/contributions', 'CONTRIBUTION_CREATE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};
