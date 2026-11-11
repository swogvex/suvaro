/**
 * Theme model (GitHub-style): a mode (light / dark / system) plus a day accent and a night accent.
 * `<html data-mode data-accent>` drives the tokens in `src/styles/tokens.css`.
 * Signed in, the choice is saved to the profile (Settings › Appearance, the light/dark toggle).
 * Logged-out pages keep the mode in localStorage (a user preference, no cookie) and always use blue.
 */
export const modes = ['system', 'light', 'dark'] as const;
export const accents = ['blue', 'red', 'green'] as const;

export type Mode = (typeof modes)[number];
export type ResolvedMode = Exclude<Mode, 'system'>;
export type Accent = (typeof accents)[number];

export const MODE_STORAGE_KEY = 'suvaro-mode';

export function parseMode(value: unknown): Mode {
  return typeof value === 'string' && (modes as readonly string[]).includes(value)
    ? (value as Mode)
    : 'system';
}

export function resolveMode(mode: Mode, prefersDark: boolean): ResolvedMode {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

export function accentFor(mode: ResolvedMode, day: Accent, night: Accent): Accent {
  return mode === 'dark' ? night : day;
}

/** The signed-in user's saved choice (profile), rendered on `<html>` as `data-pref`, `data-day`, `data-night`. */
export interface ThemePrefs {
  mode: Mode;
  day: Accent;
  night: Accent;
}

/**
 * Runs in <head> before first paint (inline, allowed by its CSP hash). Signed in, the profile's choice comes
 * from `<html data-pref data-day data-night>` (server-rendered, so it follows the user across devices);
 * signed out, the mode comes from localStorage and the accent is blue. Without JS, `prefers-color-scheme`
 * in tokens.css still picks the mode. Keep it tiny and in sync with `resolveMode`/`accentFor` (unit-tested).
 */
export const themeInitScript = `(()=>{const d=document.documentElement,s=d.dataset;let m=s.pref;if(!m)try{m=localStorage.getItem('${MODE_STORAGE_KEY}')}catch{}if(m!=='light'&&m!=='dark')m=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';s.mode=m;s.accent=(m==='dark'?s.night:s.day)||'blue'})()`;

const darkQuery = '(prefers-color-scheme: dark)';

/** The signed-in choice currently on `<html>`, or null on signed-out pages. */
export function readPrefs(root: HTMLElement = document.documentElement): ThemePrefs | null {
  const { pref, day, night } = root.dataset;
  if (!pref) return null;
  return { mode: parseMode(pref), day: parseAccent(day), night: parseAccent(night) };
}

export function parseAccent(value: unknown): Accent {
  return typeof value === 'string' && (accents as readonly string[]).includes(value)
    ? (value as Accent)
    : 'blue';
}

/** Applies a signed-in choice to the whole page at once (no reload) and repaints the browser UI color. */
export function applyPrefs(prefs: ThemePrefs, root: HTMLElement = document.documentElement): ResolvedMode {
  const resolved = resolveMode(prefs.mode, matchMedia(darkQuery).matches);
  Object.assign(root.dataset, {
    pref: prefs.mode,
    day: prefs.day,
    night: prefs.night,
    mode: resolved,
    accent: accentFor(resolved, prefs.day, prefs.night),
  });
  syncThemeColor();
  return resolved;
}

/**
 * Follows the OS when the signed-in choice is "system" (e.g. the phone switches to dark at sunset).
 * `onChange` runs after the page was repainted.
 */
export function followSystemMode(onChange?: (resolved: ResolvedMode) => void): void {
  matchMedia(darkQuery).addEventListener('change', () => {
    const prefs = readPrefs();
    if (prefs?.mode !== 'system') return;
    onChange?.(applyPrefs(prefs));
  });
}

/**
 * Paints the browser UI (theme-color: status bar, iOS Safari toolbars) with the page's real ground, so it
 * follows the chosen mode and accent instead of only the system setting.
 */
export function syncThemeColor(): void {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (!bg) return;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = bg;
  }
}
