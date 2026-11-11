/**
 * `GET /api/recurring` — the user's templates (active first by next date, ended last) and the occurrences
 *   waiting for confirmation.
 * `POST /api/recurring` — creates a template (JSON, `recurringCreateInput`); 201 with it. An occurrence due
 *   today is created at once.
 */
import type { APIRoute } from 'astro';
import { apiError, json, readJson } from '../../../lib/api';
import { todayIn } from '../../../lib/dates';
import { db } from '../../../lib/db';
import { describeError, logError } from '../../../lib/errors';
import { createRecurring, loadRecurring } from '../../../lib/recurring/repo';
import { recurringCreateInput } from '../../../lib/recurring/schema';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  return json(200, await loadRecurring(db, user.id));
};

export const POST: APIRoute = async ({ request, locals }) => {
  const { user, profile } = locals;
  if (!user || !profile) return apiError(401, 'UNAUTHORIZED');
  const body = await readJson(request, recurringCreateInput);
  if (!body.ok) return body.response;
  try {
    const result = await createRecurring(db, user.id, body.data, todayIn(profile.timezone));
    if (result.ok) return json(201, { recurring: result.recurring });
    return apiError(result.error === 'INVALID_CATEGORY' ? 400 : 409, result.error);
  } catch (error) {
    await logError('/api/recurring', 'RECURRING_CREATE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};
