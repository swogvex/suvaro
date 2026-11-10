/**
 * `PATCH /api/movements/:id` — edits one of the user's movements (JSON, `updateInput`).
 * `DELETE /api/movements/:id` — deletes it for good (the 5-second undo happens in the browser first).
 * Another user's id answers 404, exactly like a missing one.
 */
import type { APIRoute } from 'astro';
import { apiError, json, readJson } from '../../../lib/api';
import { db } from '../../../lib/db';
import { describeError, logError } from '../../../lib/errors';
import { ULID_PATTERN } from '../../../lib/id';
import { updateInput } from '../../../lib/movements/schema';
import { deleteMovement, updateMovement } from '../../../lib/movements/repo';

export const prerender = false;

const ROUTE = '/api/movements/[id]';

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const id = params['id'] ?? '';
  if (!ULID_PATTERN.test(id)) return apiError(404, 'NOT_FOUND');

  const body = await readJson(request, updateInput);
  if (!body.ok) return body.response;
  try {
    const result = await updateMovement(db, user.id, id, body.data);
    if (result.ok) return json(200, { movement: result.movement });
    return apiError(result.error === 'NOT_FOUND' ? 404 : 400, result.error);
  } catch (error) {
    await logError(ROUTE, 'MOVEMENT_UPDATE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const id = params['id'] ?? '';
  if (!ULID_PATTERN.test(id)) return apiError(404, 'NOT_FOUND');
  try {
    return (await deleteMovement(db, user.id, id)) ? json(204) : apiError(404, 'NOT_FOUND');
  } catch (error) {
    await logError(ROUTE, 'MOVEMENT_DELETE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};
