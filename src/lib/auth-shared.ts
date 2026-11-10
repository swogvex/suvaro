/**
 * Auth constants shared by the server and the sign-in island. Keep this file free of server imports and of
 * Zod so the browser bundle stays small.
 */

/** Header the sign-in page sends so a code email for a new address goes out in the page language. */
export const LOCALE_HEADER = 'x-suvaro-locale';

/** Own error codes (server messages are for logs; the UI shows translated text keyed by code). */
export const authErrorCodes = {
  AGE_CONFIRMATION_REQUIRED: 'Confirm that you are 18 or older and accept the terms.',
  ACCOUNT_EXISTS: 'An account with this email already exists.',
  INVALID_EMAIL: 'Invalid email.',
  EMAIL_SEND_FAILED: 'The email could not be sent.',
} as const;

export type AuthErrorCode = keyof typeof authErrorCodes;
