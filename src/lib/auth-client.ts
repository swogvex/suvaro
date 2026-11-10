/** Browser auth client (islands only): passkeys + email codes against `/api/auth`. */
import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import type { Locale } from '../i18n';
import { LOCALE_HEADER } from './auth-shared';

export function createClient(locale: Locale) {
  return createAuthClient({
    basePath: '/api/auth',
    plugins: [emailOTPClient(), passkeyClient()],
    fetchOptions: { headers: { [LOCALE_HEADER]: locale } },
  });
}

export type AuthClient = ReturnType<typeof createClient>;

/** True when the browser can create and use passkeys at all. */
export function supportsPasskeys(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
}
