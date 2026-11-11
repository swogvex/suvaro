/**
 * `PATCH /api/profile` — saves some profile fields (`profilePatchInput`) from Settings › Profile,
 * Preferences and Appearance, and the light/dark toggle. Answers the editable fields as saved.
 */
import type { APIRoute } from 'astro';
import { apiError, json, readJson } from '../../lib/api';
import { db } from '../../lib/db';
import { describeError, logError } from '../../lib/errors';
import { editableFields, updateProfile } from '../../lib/settings/repo';
import { profilePatchInput } from '../../lib/settings/schema';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, locals }) => {
  const { user } = locals;
  if (!user) return apiError(401, 'UNAUTHORIZED');
  const body = await readJson(request, profilePatchInput);
  if (!body.ok) return body.response;
  try {
    const row = await updateProfile(db, user.id, body.data);
    return json(200, { profile: editableFields(row) });
  } catch (error) {
    await logError('/api/profile', 'PROFILE_UPDATE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};
