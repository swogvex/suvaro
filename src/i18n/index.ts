import { en, type UiKey } from './en';
import { es } from './es';

export const locales = ['en', 'es'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export const dictionaries: Record<Locale, Record<UiKey, string>> = { en, es };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/** Returns the translator for a locale; unknown locales fall back to English. */
export function useTranslations(locale: string | undefined) {
  const dict = dictionaries[isLocale(locale) ? locale : defaultLocale];
  return (key: UiKey): string => dict[key];
}

export type { UiKey };
