import { defineMiddleware } from 'astro:middleware';
import { getAuth } from './lib/auth';
import { db } from './lib/db';
import { authBaseURL } from './lib/deployment';
import { ensureProfile, touchActivity } from './lib/profile';
import { APP_WRITES, hitRateLimit } from './lib/rate-limit';
import { isAllowedOrigin, isSafeMethod, onboardingRedirect, routeKind } from './lib/request-guards';
import { applySecurityHeaders } from './lib/security-headers';

const SIGN_IN_PATH = '/sign-in';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const onRequest = defineMiddleware(async (context, next) => {
  // Prerendered pages run this at build time only; they get their headers from vercel.json.
  if (context.isPrerendered) {
    const response = await next();
    applySecurityHeaders(response.headers);
    return response;
  }

  const { request, url, locals } = context;
  const kind = routeKind(url.pathname);

  const response = await (async (): Promise<Response> => {
    if (!isAllowedOrigin(request.method, request.headers.get('origin'), [url.origin, authBaseURL()])) {
      return json(403, { error: 'FORBIDDEN_ORIGIN' });
    }

    if (kind !== 'app' && kind !== 'api' && kind !== 'sign-in') return next();

    const result = await getAuth().api.getSession({ headers: request.headers, returnHeaders: true });
    const session = result.response;
    // Session renewal (sliding 30 days) arrives as Set-Cookie headers; forward them on the final response.
    const renewCookies = result.headers.getSetCookie();
    const withCookies = (res: Response) => {
      for (const cookie of renewCookies) res.headers.append('Set-Cookie', cookie);
      return res;
    };

    if (kind === 'sign-in') {
      if (session) return withCookies(context.redirect('/app', 303));
      return next();
    }

    if (!session) {
      return kind === 'api' ? json(401, { error: 'UNAUTHORIZED' }) : context.redirect(SIGN_IN_PATH, 303);
    }

    const profile = await ensureProfile(db, session.user);
    locals.user = session.user;
    locals.session = session.session;
    locals.profile = profile;
    await touchActivity(db, profile);

    if (!isSafeMethod(request.method)) {
      const limit = await hitRateLimit(db, `writes:${session.user.id}`, APP_WRITES);
      if (!limit.allowed) {
        const tooMany = json(429, { error: 'TOO_MANY_REQUESTS' });
        tooMany.headers.set('Retry-After', String(limit.retryAfter));
        return tooMany;
      }
    }

    if (kind === 'app') {
      const target = onboardingRedirect(url.pathname, profile.onboardingDone);
      if (target) return withCookies(context.redirect(target, 303));
    }

    const res = await next();
    res.headers.set('Cache-Control', 'private, no-store');
    return withCookies(res);
  })();

  applySecurityHeaders(response.headers);
  return response;
});
