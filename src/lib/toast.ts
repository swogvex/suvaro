/** Shows a toast from any script or island in the app layout (see `src/components/app/Toaster.astro`). */
export const TOAST_EVENT = 'suvaro:toast';

export interface ToastDetail {
  message: string;
}

export function showToast(message: string): void {
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message } }));
}

/** Server-side flash messages after a form post: `?done=<key>` on the page the form redirects to. */
export const flashKeys = {
  'session-revoked': 'security.sessionRevoked',
  'others-revoked': 'security.othersRevoked',
  'passkey-added': 'security.passkeySaved',
  'email-verified': 'verify.done',
} as const;

export type FlashKey = keyof typeof flashKeys;

export function flashMessageKey(value: string | null): (typeof flashKeys)[FlashKey] | undefined {
  return value && value in flashKeys ? flashKeys[value as FlashKey] : undefined;
}
