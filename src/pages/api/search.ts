/**
 * `GET /api/search?q=…` — the user's movements matching a note, a category name or an exact amount,
 * newest first, at most 20. Settings pages are matched in the browser (they are a fixed list).
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { apiError, json } from '../../lib/api';
import { db } from '../../lib/db';
import { SEARCH_MAX_LENGTH, searchMovements } from '../../lib/movements/repo';

export const prerender = false;

const query = z.strictObject({ q: z.string().max(SEARCH_MAX_LENGTH) });

export const GET: APIRoute = async ({ url, locals }) => {
  const { user, profile } = locals;
  if (!user || !profile) return apiError(401, 'UNAUTHORIZED');
  const parsed = query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success || url.searchParams.getAll('q').length !== 1) return apiError(400, 'INVALID_QUERY');
  return json(200, { movements: await searchMovements(db, user.id, parsed.data.q, profile.locale) });
};
