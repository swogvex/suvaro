/**
 * `DELETE /api/account` — deletes the signed-in account right away (Settings › Privacy).
 * Needs a fresh sign-in: the page asks for a passkey or an email code first, which starts a new session;
 * this session must be at most 5 minutes old (403 REAUTH_REQUIRED). The body names the account the page
 * was showing (`{ userId }`): a passkey that signed in to another account answers 409 WRONG_ACCOUNT.
 * Then: sign out (cookie cleared), delete every row (`deleteUserRows`), send the confirmation email.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { deleteUserRows, FRESH_SIGN_IN_MS } from '../../../lib/account';
import { apiError, json, readJson } from '../../../lib/api';
import { getAuth } from '../../../lib/auth';
import { db } from '../../../lib/db';
import { authBaseURL } from '../../../lib/deployment';
import { buildEmail, sendEmail } from '../../../lib/email';
import { recordEmail } from '../../../lib/email-ledger';
import { describeError, logError } from '../../../lib/errors';
import { signInPath } from '../../../lib/routes';

export const prerender = false;

const ROUTE = '/api/account';

const input = z.strictObject({ userId: z.string().min(1).max(64) });

export const DELETE: APIRoute = async ({ request, locals }) => {
  const { user, session, profile } = locals;
  if (!user || !session || !profile) return apiError(401, 'UNAUTHORIZED');
  const body = await readJson(request, input);
  if (!body.ok) return body.response;
  if (body.data.userId !== user.id) return apiError(409, 'WRONG_ACCOUNT');
  if (Date.now() - new Date(session.createdAt).getTime() > FRESH_SIGN_IN_MS) {
    return apiError(403, 'REAUTH_REQUIRED');
  }

  const { email } = user;
  const locale = profile.locale;
  let cookies: string[] = [];
  try {
    const signedOut = await getAuth().api.signOut({ headers: request.headers, returnHeaders: true });
    cookies = signedOut.headers.getSetCookie();
    await db.transaction((tx) => deleteUserRows(tx, user.id));
  } catch (error) {
    await logError(ROUTE, 'ACCOUNT_DELETE', describeError(error));
    return apiError(500, 'SERVER_ERROR');
  }

  // The account is gone either way; a failed email is logged, not reported to the page.
  try {
    const signInUrl = `${authBaseURL()}${signInPath(locale, 'create')}`;
    await sendEmail(email, await buildEmail('account-deleted-by-user', locale, { signInUrl }));
    await recordEmail(db, 'account-deleted-by-user', null).catch(() => undefined);
  } catch (error) {
    await logError(ROUTE, 'EMAIL_SEND_FAILED', describeError(error));
  }

  const response = json(200, { deleted: true });
  for (const cookie of cookies) response.headers.append('Set-Cookie', cookie);
  return response;
};
