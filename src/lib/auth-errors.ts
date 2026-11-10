/** Maps Better Auth / WebAuthn errors to a translated message key (pure; unit-tested). */
import type { UiKey } from '../i18n';

export interface AuthErrorLike {
  code?: string | undefined;
  status?: number | undefined;
}

const byCode: Record<string, UiKey> = {
  AGE_CONFIRMATION_REQUIRED: 'signIn.errorAge',
  ACCOUNT_EXISTS: 'signIn.errorExists',
  INVALID_EMAIL: 'signIn.errorEmail',
  EMAIL_SEND_FAILED: 'signIn.errorEmailSend',
  INVALID_OTP: 'signIn.errorCodeWrong',
  OTP_EXPIRED: 'signIn.errorCodeExpired',
  TOO_MANY_ATTEMPTS: 'signIn.errorCodeAttempts',
  AUTH_CANCELLED: 'signIn.errorPasskeyCancelled',
  ERROR_CEREMONY_ABORTED: 'signIn.errorPasskeyCancelled',
  REGISTRATION_CANCELLED: 'signIn.errorPasskeyCancelled',
  PASSKEY_NOT_FOUND: 'signIn.errorPasskeyUnknown',
  AUTHENTICATION_FAILED: 'signIn.errorPasskeyUnknown',
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: 'signIn.errorPasskeyUsed',
  PREVIOUSLY_REGISTERED: 'signIn.errorPasskeyUsed',
};

export function authErrorKey(error: AuthErrorLike | null | undefined): UiKey {
  if (!error) return 'signIn.errorGeneric';
  if (error.status === 429) return 'signIn.errorTooMany';
  if (error.code && error.code in byCode) return byCode[error.code] as UiKey;
  if (error.status === 0 || error.code === 'NETWORK_ERROR') return 'signIn.errorNetwork';
  return 'signIn.errorGeneric';
}

/** Loose email check before calling the server (the server validates for real). */
export function looksLikeEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
