/**
 * `PATCH /api/contributions/:id` — edits one of the user's contributions (`contributionUpdateInput`).
 * `DELETE /api/contributions/:id` — deletes it. Both answer with the goal as it is now.
 * Another user's id answers 404, exactly like a missing one.
 */
import type { APIRoute } from 'astro';
import { apiError, json, readJson } from '../../../lib/api';
import { db } from '../../../lib/db';
import { describeError, logError } from '../../../lib/errors';
import { ULID_PATTERN } from '../../../lib/id';
import { deleteContribution, updateContribution } from '../../../lib/plan/repo';
import { contributionUpdateInput } from '../../../lib/plan/schema';

export const prerender = false;

const ROUTE = '/api/contributions/[id]';

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const id = params['id'] ?? '';
  if (!ULID_PATTERN.test(id)) return apiError(404, 'NOT_FOUND');
  const body = await readJson(request, contributionUpdateInput);
  if (!body.ok) return body.response;
  try {
    const result = await updateContribution(db, user.id, id, body.data);
    if (result.ok) return json(200, { contribution: result.contribution, goal: result.goal });
    return apiError(404, result.error);
  } catch (error) {
    await logError(ROUTE, 'CONTRIBUTION_UPDATE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const id = params['id'] ?? '';
  if (!ULID_PATTERN.test(id)) return apiError(404, 'NOT_FOUND');
  try {
    const owner = await deleteContribution(db, user.id, id);
    return owner ? json(200, { goal: owner }) : apiError(404, 'NOT_FOUND');
  } catch (error) {
    await logError(ROUTE, 'CONTRIBUTION_DELETE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};
