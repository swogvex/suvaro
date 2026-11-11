/**
 * `PATCH /api/passkeys/:id` — renames one of the user's passkeys (`{ name }`, 1–40 characters).
 * `DELETE /api/passkeys/:id` — removes it; the last one only when the email is confirmed (409 LAST_PASSKEY).
 * Another user's id answers 404, exactly like a missing one.
 */
import type { APIRoute } from 'astro';
import { apiError, json, readJson } from '../../../lib/api';
import { db } from '../../../lib/db';
import { describeError, logError } from '../../../lib/errors';
import { passkeyRenameInput, removePasskey, renamePasskey } from '../../../lib/settings/passkeys';

export const prerender = false;

const ROUTE = '/api/passkeys/[id]';
const validId = (id: string) => id.length > 0 && id.length <= 64;

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const id = params['id'] ?? '';
  if (!validId(id)) return apiError(404, 'NOT_FOUND');
  const body = await readJson(request, passkeyRenameInput);
  if (!body.ok) return body.response;
  try {
    const result = await renamePasskey(db, user.id, id, body.data.name);
    return result.ok ? json(200, { name: body.data.name }) : apiError(404, result.error);
  } catch (error) {
    await logError(ROUTE, 'PASSKEY_RENAME', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const id = params['id'] ?? '';
  if (!validId(id)) return apiError(404, 'NOT_FOUND');
  try {
    const result = await removePasskey(db, user, id);
    if (result.ok) return json(204);
    return apiError(result.error === 'NOT_FOUND' ? 404 : 409, result.error);
  } catch (error) {
    await logError(ROUTE, 'PASSKEY_REMOVE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};
