/**
 * `GET /api/movements` — one month of the user's movements, newest first.
 *   Query: the shared filters (`src/lib/movements/filters.ts`) + optional `month=YYYY-MM`.
 *   Without `month` it starts at the newest month with matching movements and also returns the summary
 *   ("17 movements · −333.20 €"). `next` is the next older month to load (infinite scroll), or null.
 * `POST /api/movements` — creates one movement (JSON, `createInput`); 201 with the movement and `alert`, the
 *   toast for a budget it took past 80 % or 100 % this cycle (or null).
 */
import type { APIRoute } from 'astro';
import { apiError, json, readJson } from '../../../lib/api';
import { isIsoMonth, todayIn } from '../../../lib/dates';
import { db } from '../../../lib/db';
import { describeError, logError } from '../../../lib/errors';
import { parseFilters, unknownKeys } from '../../../lib/movements/filters';
import { createInput } from '../../../lib/movements/schema';
import { createMovement, latestMonth, listMonth, summarize } from '../../../lib/movements/repo';
import { safeAlertMessage } from '../../../lib/plan/notify';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const { user, profile } = locals;
  if (!user || !profile) return apiError(401, 'UNAUTHORIZED');

  const params = url.searchParams;
  const { filters, valid } = parseFilters(params);
  const month = params.get('month');
  if (!valid || unknownKeys(params, ['month']).length > 0 || (month !== null && !isIsoMonth(month))) {
    return apiError(400, 'INVALID_QUERY');
  }

  const today = todayIn(profile.timezone);
  if (month) return json(200, await listMonth(db, user.id, filters, today, month));

  const [start, summary] = await Promise.all([
    latestMonth(db, user.id, filters, today),
    summarize(db, user.id, filters, today),
  ]);
  const page = start
    ? await listMonth(db, user.id, filters, today, start)
    : { month: null, items: [], next: null };
  return json(200, { ...page, summary });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const { user, profile } = locals;
  if (!user || !profile) return apiError(401, 'UNAUTHORIZED');

  const body = await readJson(request, createInput);
  if (!body.ok) return body.response;
  try {
    const result = await createMovement(db, user.id, body.data);
    if (result.ok) {
      const alert = await safeAlertMessage(db, user.id, profile);
      return json(201, { movement: result.movement, alert });
    }
    return apiError(result.error === 'INVALID_CATEGORY' ? 400 : 409, result.error);
  } catch (error) {
    await logError('/api/movements', 'MOVEMENT_CREATE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};
