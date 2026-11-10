/**
 * Where this server runs, from Vercel's system variables (read at runtime, server only).
 * Local dev, CI and e2e have no `VERCEL_ENV`: they count as development.
 */
export type Deployment = 'production' | 'preview' | 'development';

type Env = Record<string, string | undefined>;

export function deployment(env: Env = process.env): Deployment {
  const value = env['VERCEL_ENV'];
  return value === 'production' || value === 'preview' ? value : 'development';
}

export const PRODUCTION_URL = 'https://suvaro.xyz';
export const DEVELOPMENT_URL = 'http://localhost:4321';

/**
 * Origin that serves sign-in; passkeys are bound to its host name (WebAuthn `rpID`).
 * - `BETTER_AUTH_URL` wins when set.
 * - Production: the apex domain.
 * - Previews: the stable branch URL Vercel assigns (`VERCEL_BRANCH_URL`), so sign in on that URL.
 * - Development, CI and e2e: localhost.
 */
export function authBaseURL(env: Env = process.env): string {
  const explicit = env['BETTER_AUTH_URL'];
  if (explicit) return new URL(explicit).origin;
  switch (deployment(env)) {
    case 'production':
      return PRODUCTION_URL;
    case 'preview': {
      const host = env['VERCEL_BRANCH_URL'] ?? env['VERCEL_URL'];
      if (!host) throw new Error('VERCEL_BRANCH_URL is not set on this preview');
      return `https://${host}`;
    }
    case 'development':
      return DEVELOPMENT_URL;
  }
}
