/**
 * `POST /api/recurring-pending/:id` — confirms an occurrence waiting for confirmation: creates its movement
 *   on the due date; 201 with the movement and `alert` (a budget it took past 80 % or 100 %, or null).
 * `DELETE /api/recurring-pending/:id` — "Skip this time": nothing is created.
 * Another user's id answers 404, exactly like a missing one.
 */
import type { APIRoute } from 'astro';
import { apiError, json } from '../../../lib/api';
import { db } from '../../../lib/db';
import { describeError, logError } from '../../../lib/errors';
import { ULID_PATTERN } from '../../../lib/id';
import { safeAlertMessage } from '../../../lib/plan/notify';
import { confirmPending, skipPending } from '../../../lib/recurring/repo';

export const prerender = false;

const ROUTE = '/api/recurring-pending/[id]';

export const POST: APIRoute = async ({ params, locals }) => {
  const { user, profile } = locals;
  if (!user || !profile) return apiError(401, 'UNAUTHORIZED');
  const id = params['id'] ?? '';
  if (!ULID_PATTERN.test(id)) return apiError(404, 'NOT_FOUND');
  try {
    const result = await confirmPending(db, user.id, id);
    if (!result.ok) return apiError(result.error === 'NOT_FOUND' ? 404 : 409, result.error);
    const alert = await safeAlertMessage(db, user.id, profile);
    return json(201, { movement: result.movement, alert });
  } catch (error) {
    await logError(ROUTE, 'PENDING_CONFIRM', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const id = params['id'] ?? '';
  if (!ULID_PATTERN.test(id)) return apiError(404, 'NOT_FOUND');
  try {
    return (await skipPending(db, user.id, id)) ? json(204) : apiError(404, 'NOT_FOUND');
  } catch (error) {
    await logError(ROUTE, 'PENDING_SKIP', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};
