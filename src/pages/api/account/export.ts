/**
 * `GET /api/account/export` — "Download all my data": a ZIP with data.json and one CSV per table, only the
 * signed-in user's rows (`exportUserData`). Private, never cached.
 */
import type { APIRoute } from 'astro';
import { exportUserData } from '../../../lib/account-export';
import { apiError } from '../../../lib/api';
import { db } from '../../../lib/db';
import { describeError, logError } from '../../../lib/errors';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const { user, profile } = locals;
  if (!user || !profile) return apiError(401, 'UNAUTHORIZED');
  try {
    const now = new Date();
    const archive = await exportUserData(db, user.id, profile.locale, now);
    return new Response(archive, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="suvaro-data-${now.toISOString().slice(0, 10)}.zip"`,
        'Content-Length': String(archive.length),
      },
    });
  } catch (error) {
    await logError('/api/account/export', 'EXPORT_FAILED', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }
};
