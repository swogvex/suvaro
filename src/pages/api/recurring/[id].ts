/**
 * `PATCH /api/recurring/:id` — edits a template (JSON, `recurringUpdateInput`). Changes apply from the next
 *   date on; movements already created stay.
 * `DELETE /api/recurring/:id` — deletes it and its pending confirmations; its movements stay.
 * Another user's id answers 404, exactly like a missing one.
 */
import type { APIRoute } from 'astro';
import { apiError, json, readJson } from '../../../lib/api';
import { todayIn } from '../../../lib/dates';
import { db } from '../../../lib/db';
import { describeError, logError } from '../../../lib/errors';
import { ULID_PATTERN } from '../../../lib/id';
import { deleteRecurring, updateRecurring } from '../../../lib/recurring/repo';
import { recurringUpdateInput } from '../../../lib/recurring/schema';

export const prerender = false;

const ROUTE = '/api/recurring/[id]';

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const { user, profile } = locals;
  if (!user || !profile) return apiError(401, 'UNAUTHORIZED');
  const id = params['id'] ?? '';
  if (!ULID_PATTERN.test(id)) return apiError(404, 'NOT_FOUND');
  const body = await readJson(request, recurringUpdateInput);
  if (!body.ok) return body.response;
  try {
    const result = await updateRecurring(db, user.id, id, body.data, todayIn(profile.timezone));
    if (result.ok) return json(200, { recurring: result.recurring });
    return apiError(result.error === 'INVALID_CATEGORY' ? 400 : 404, result.error);
  } catch (error) {
    await logError(ROUTE, 'RECURRING_UPDATE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const id = params['id'] ?? '';
  if (!ULID_PATTERN.test(id)) return apiError(404, 'NOT_FOUND');
  try {
    return (await deleteRecurring(db, user.id, id)) ? json(204) : apiError(404, 'NOT_FOUND');
  } catch (error) {
    await logError(ROUTE, 'RECURRING_DELETE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};
