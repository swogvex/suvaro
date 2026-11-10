/** Pure request checks used by the middleware (unit-tested). */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

/**
 * CSRF guard: every state-changing request must come from one of our origins. Browsers always send `Origin`
 * on POST/PUT/PATCH/DELETE, so a missing header is rejected too.
 */
export function isAllowedOrigin(method: string, origin: string | null, allowed: readonly string[]): boolean {
  if (isSafeMethod(method)) return true;
  return origin !== null && allowed.includes(origin);
}

export type RouteKind = 'app' | 'api' | 'auth' | 'cron' | 'sign-in' | 'public';

/** Signed-in-only areas: `/app/...` pages and own JSON endpoints (not Better Auth's, not the cron). */
export function routeKind(pathname: string): RouteKind {
  if (pathname === '/app' || pathname.startsWith('/app/')) return 'app';
  if (pathname.startsWith('/api/auth/')) return 'auth';
  if (pathname.startsWith('/api/cron/')) return 'cron';
  if (pathname.startsWith('/api/')) return 'api';
  if (pathname === '/sign-in' || pathname === '/es/acceso') return 'sign-in';
  return 'public';
}

export const ONBOARDING_PATH = '/app/welcome';

/** Where a signed-in user must go instead of `pathname`, or null to continue. */
export function onboardingRedirect(pathname: string, onboardingDone: boolean): string | null {
  if (!onboardingDone && pathname !== ONBOARDING_PATH) return ONBOARDING_PATH;
  if (onboardingDone && pathname === ONBOARDING_PATH) return '/app';
  return null;
}

/** Activity is written at most once per 15 minutes per user. */
export const ACTIVITY_THROTTLE_MS = 15 * 60 * 1000;

export function shouldTouchActivity(lastActiveAt: Date, now: Date): boolean {
  return now.getTime() - lastActiveAt.getTime() >= ACTIVITY_THROTTLE_MS;
}
