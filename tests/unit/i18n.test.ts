import { describe, expect, it } from 'vitest';
import { dictionaries, formatDate, interpolate, locales, otherLocale, useTranslations } from '../../src/i18n';

describe('i18n dictionaries', () => {
  const englishKeys = Object.keys(dictionaries.en).sort();

  it.each(locales)('%s has exactly the English keys, all non-empty', (locale) => {
    const dict = dictionaries[locale];
    expect(Object.keys(dict).sort()).toEqual(englishKeys);
    for (const value of Object.values(dict)) expect(value.trim()).not.toBe('');
  });

  it.each(locales)('%s uses the same placeholders as English', (locale) => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of englishKeys as (keyof typeof dictionaries.en)[]) {
      expect(placeholders(dictionaries[locale][key]), key).toEqual(placeholders(dictionaries.en[key]));
    }
  });

  it('falls back to English for an unknown locale', () => {
    expect(useTranslations('fr')('nav.signIn')).toBe(dictionaries.en['nav.signIn']);
  });

  it('fills placeholders and leaves unknown ones untouched', () => {
    expect(interpolate('{spent} of {limit}', { spent: '€246.00', limit: '€300.00' })).toBe(
      '€246.00 of €300.00',
    );
    expect(interpolate('About {amount} a day', {})).toBe('About {amount} a day');
    expect(useTranslations('es')('sample.perDay', { amount: '23 €', days: 21 })).toBe(
      'Unos 23 € al día · quedan 21 días',
    );
  });

  it('formats long dates per language', () => {
    const date = new Date('2026-11-10');
    expect(formatDate(date, 'en')).toBe('10 November 2026');
    expect(formatDate(date, 'es')).toBe('10 de noviembre de 2026');
  });

  it('pairs each locale with the other one', () => {
    expect(otherLocale('en')).toBe('es');
    expect(otherLocale('es')).toBe('en');
  });
});
