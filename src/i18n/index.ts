import { en, type UiKey } from './en';
import { es } from './es';
import { interpolate } from './interpolate';

export const locales = ['en', 'es'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export const dictionaries: Record<Locale, Record<UiKey, string>> = { en, es };

/** Open Graph locale tags (`og:locale`). */
export const ogLocales: Record<Locale, string> = { en: 'en_US', es: 'es_ES' };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'en' ? 'es' : 'en';
}

export { interpolate };

/** Returns the translator for a locale; unknown locales fall back to English. */
export function useTranslations(locale: string | undefined) {
  const dict = dictionaries[isLocale(locale) ? locale : defaultLocale];
  return (key: UiKey, vars?: Record<string, string | number>): string =>
    vars ? interpolate(dict[key], vars) : dict[key];
}

/** Long date in the page language: "10 November 2026" / "10 de noviembre de 2026". */
export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'es-ES', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

/** The strings an island needs (keys starting with one of `prefixes`), so islands never ship whole dictionaries. */
export function pickMessages(locale: Locale, prefixes: readonly string[]): Partial<Record<UiKey, string>> {
  const dict = dictionaries[locale];
  return Object.fromEntries(
    (Object.keys(dict) as UiKey[])
      .filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
      .map((key) => [key, dict[key]]),
  );
}

export type { UiKey };
