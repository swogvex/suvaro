/**
 * Theme model (GitHub-style): a mode (light / dark / system) plus a day accent and a night accent.
 * `<html data-mode data-accent>` drives the tokens in `src/styles/tokens.css`.
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

/**
 * Runs in <head> before first paint (inline, allowed by its CSP hash). Without JS, `prefers-color-scheme`
 * in tokens.css still picks the mode. Keep it tiny and in sync with `resolveMode` (covered by e2e tests).
 */
export const themeInitScript = `(()=>{const d=document.documentElement;let m=null;try{m=localStorage.getItem('${MODE_STORAGE_KEY}')}catch{}if(m!=='light'&&m!=='dark')m=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.dataset.mode=m;d.dataset.accent='blue'})()`;
