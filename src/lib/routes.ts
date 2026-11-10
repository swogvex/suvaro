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

/** App links that exist from later milestones on; kept here so pages never hard-code them. */
export const appPaths = { app: '/app', signIn: '/sign-in', demo: '/demo' } as const;
