/**
 * Session actions from Settings › Security (plain form posts, no JS needed):
 * - `revoke` + `id`: signs out one of the user's other sessions.
 * - `revoke-others`: signs out every session except this one.
 * - `sign-out`: signs out this device and goes to the sign-in page.
 * Only the signed-in user's own sessions can be touched; an unknown id answers 404.
 */
import type { APIRoute } from 'astro';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { getAuth } from '../../lib/auth';
import { db } from '../../lib/db';
import { session } from '../../lib/db/schema';
import { appPaths, signInPath } from '../../lib/routes';

export const prerender = false;

const input = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('revoke'), id: z.string().min(1).max(64) }),
  z.strictObject({ action: z.literal('revoke-others') }),
  z.strictObject({ action: z.literal('sign-out') }),
]);

function seeOther(location: string, headers?: Headers): Response {
  const response = new Response(null, { status: 303, headers: { Location: location } });
  for (const cookie of headers?.getSetCookie() ?? []) response.headers.append('Set-Cookie', cookie);
  return response;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const { user, session: current, profile } = locals;
  if (!user || !current || !profile) return new Response(null, { status: 401 });

  const parsed = input.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return new Response(null, { status: 400 });
  const data = parsed.data;

  if (data.action === 'sign-out' || (data.action === 'revoke' && data.id === current.id)) {
    const result = await getAuth().api.signOut({ headers: request.headers, returnHeaders: true });
    return seeOther(signInPath(profile.locale), result.headers);
  }

  if (data.action === 'revoke-others') {
    await db.delete(session).where(and(eq(session.userId, user.id), ne(session.id, current.id)));
    return seeOther(`${appPaths.security}?done=others-revoked`);
  }

  const deleted = await db
    .delete(session)
    .where(and(eq(session.id, data.id), eq(session.userId, user.id)))
    .returning({ id: session.id });
  if (deleted.length === 0) return new Response(null, { status: 404 });
  return seeOther(`${appPaths.security}?done=session-revoked`);
};
