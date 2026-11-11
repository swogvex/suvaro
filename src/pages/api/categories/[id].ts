/**
 * `PATCH /api/categories/:id` — renames / recolors a category (`categoryUpdateInput`).
 * `DELETE /api/categories/:id` — deletes it (`categoryDeleteInput`): with movements or recurring templates,
 *   `moveTo` names the category that receives them (400 NEEDS_TARGET / INVALID_TARGET otherwise).
 *   The last category cannot be deleted (409 LAST_CATEGORY).
 * Another user's id answers 404, exactly like a missing one.
 */
import type { APIRoute } from 'astro';
import { apiError, json, readJson } from '../../../lib/api';
import { deleteCategory, updateCategory } from '../../../lib/categories/repo';
import { categoryDeleteInput, categoryUpdateInput } from '../../../lib/categories/schema';
import { db } from '../../../lib/db';
import { describeError, logError } from '../../../lib/errors';
import { ULID_PATTERN } from '../../../lib/id';

export const prerender = false;

const ROUTE = '/api/categories/[id]';

const status: Record<string, number> = {
  NOT_FOUND: 404,
  DUPLICATE_NAME: 409,
  LAST_CATEGORY: 409,
  NEEDS_TARGET: 400,
  INVALID_TARGET: 400,
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const id = params['id'] ?? '';
  if (!ULID_PATTERN.test(id)) return apiError(404, 'NOT_FOUND');
  const body = await readJson(request, categoryUpdateInput);
  if (!body.ok) return body.response;
  try {
    const result = await updateCategory(db, user.id, id, body.data);
    if (result.ok) return json(200, { category: { id, ...result.value } });
    return apiError(status[result.error] ?? 400, result.error);
  } catch (error) {
    await logError(ROUTE, 'CATEGORY_UPDATE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const id = params['id'] ?? '';
  if (!ULID_PATTERN.test(id)) return apiError(404, 'NOT_FOUND');
  const body = await readJson(request, categoryDeleteInput);
  if (!body.ok) return body.response;
  try {
    const result = await deleteCategory(db, user.id, id, body.data.moveTo);
    if (result.ok) return json(200, result.value);
    return apiError(status[result.error] ?? 400, result.error);
  } catch (error) {
    await logError(ROUTE, 'CATEGORY_DELETE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};
