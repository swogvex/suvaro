/**
 * `POST /api/categories` — creates a category (JSON, `categoryCreateInput`); 201 with the row.
 * At most 50 per user (409 LIMIT_REACHED); names are unique per user, ignoring case and accents (409).
 */
import type { APIRoute } from 'astro';
import { apiError, json, readJson } from '../../../lib/api';
import { createCategory } from '../../../lib/categories/repo';
import { categoryCreateInput } from '../../../lib/categories/schema';
import { db } from '../../../lib/db';
import { describeError, logError } from '../../../lib/errors';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const body = await readJson(request, categoryCreateInput);
  if (!body.ok) return body.response;
  try {
    const result = await createCategory(db, user.id, body.data);
    return result.ok ? json(201, { category: result.value }) : apiError(409, result.error);
  } catch (error) {
    await logError('/api/categories', 'CATEGORY_CREATE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};
