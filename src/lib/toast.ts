/** Shows a toast from any script or island in the app layout (see `src/components/app/Toaster.astro`). */
export const TOAST_EVENT = 'suvaro:toast';

/** How long a toast stays (and how long Undo is offered). */
export const TOAST_MS = 5_000;

export interface ToastOptions {
  /** Offers "Undo · 5 s" with a visible countdown; called when the user presses it. */
  undo?: () => void;
  /**
   * Called once when the toast goes away without Undo: timeout, close button, replaced by another toast,
   * or the page being left (then it must not wait for anything, e.g. use `fetch(…, { keepalive: true })`).
   */
  onDismiss?: () => void;
  /** Waits for the current toast to end instead of replacing it (e.g. a budget alert after "Saved · Undo"). */
  queue?: boolean;
}

export interface ToastDetail extends ToastOptions {
  message: string;
}

export function showToast(message: string, options: ToastOptions = {}): void {
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message, ...options } }));
}

/** Server-side flash messages after a form post: `?done=<key>` on the page the form redirects to. */
export const flashKeys = {
  'session-revoked': 'security.sessionRevoked',
  'others-revoked': 'security.othersRevoked',
  'passkey-added': 'security.passkeySaved',
  'email-verified': 'verify.done',
  saved: 'settings.saved',
} as const;

export type FlashKey = keyof typeof flashKeys;

export function flashMessageKey(value: string | null): (typeof flashKeys)[FlashKey] | undefined {
  return value && value in flashKeys ? flashKeys[value as FlashKey] : undefined;
}

/**
 * Shows the dot on the Plan tab (header and dock): there are budget alerts not read on Plan yet.
 * Not while Plan itself is open (the alert is on screen there).
 */
export function showPlanDot(): void {
  for (const dot of document.querySelectorAll<HTMLElement>('[data-plan-dot]')) {
    if (dot.closest('a')?.getAttribute('aria-current') !== 'page') dot.hidden = false;
  }
}
