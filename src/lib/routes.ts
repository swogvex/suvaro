/**
 * Public (indexable) routes and their translations. Feeds hreflang links, the language switch and sitemap.xml.
 * URLs never end with a slash.
 */
import type { Locale } from '../i18n';

export type Alternates = Record<Locale, string>;

/** Legal pages: one key, a translated slug per language (file names in src/content/legal/{en,es}/). */
export const legalSlugs = {
  notice: { en: 'notice', es: 'aviso-legal' },
  privacy: { en: 'privacy', es: 'privacidad' },
  cookies: { en: 'cookies', es: 'cookies' },
  terms: { en: 'terms', es: 'terminos' },
  credits: { en: 'credits', es: 'creditos' },
} as const satisfies Record<string, Record<Locale, string>>;

export type LegalKey = keyof typeof legalSlugs;
export const legalKeys = Object.keys(legalSlugs) as LegalKey[];

const prefix: Record<Locale, string> = { en: '', es: '/es' };

export function homePath(locale: Locale): string {
  return locale === 'en' ? '/' : prefix[locale];
}

export function legalPath(key: LegalKey, locale: Locale): string {
  return `${prefix[locale]}/legal/${legalSlugs[key][locale]}`;
}

export function legalKeyFromSlug(slug: string, locale: Locale): LegalKey | undefined {
  return legalKeys.find((key) => legalSlugs[key][locale] === slug);
}

export const homeAlternates: Alternates = { en: homePath('en'), es: homePath('es') };

export function legalAlternates(key: LegalKey): Alternates {
  return { en: legalPath(key, 'en'), es: legalPath(key, 'es') };
}

/** Every indexable page, once, with its translations. */
export function publicPages(): Alternates[] {
  return [homeAlternates, ...legalKeys.map(legalAlternates)];
}

/** Locale of a path: `/es` and `/es/...` are Spanish, everything else English. */
export function localeFromPath(pathname: string): Locale {
  return pathname === '/es' || pathname.startsWith('/es/') ? 'es' : 'en';
}

/** Sign-in page per language (noindex; not in the sitemap). */
export const signInPaths: Alternates = { en: '/sign-in', es: '/es/acceso' };

export function signInPath(locale: Locale, mode: 'sign-in' | 'create' = 'sign-in'): string {
  return mode === 'create' ? `${signInPaths[locale]}?mode=create` : signInPaths[locale];
}

/** Offline page per language (noindex; not in the sitemap). The service worker serves it for failed navigations. */
export const offlinePaths: Alternates = { en: '/offline', es: '/es/sin-conexion' };

/** App routes have no language prefix: they use the profile language. */
export const appPaths = {
  app: '/app',
  welcome: '/app/welcome',
  movements: '/app/movements',
  calendar: '/app/movements/calendar',
  recurring: '/app/movements/recurring',
  stats: '/app/stats',
  plan: '/app/plan',
  settings: '/app/settings',
  profile: '/app/settings/profile',
  preferences: '/app/settings/preferences',
  appearance: '/app/settings/appearance',
  categories: '/app/settings/categories',
  security: '/app/settings/security',
  privacy: '/app/settings/privacy',
  verifyEmail: '/app/verify-email',
  demo: '/demo',
} as const;
