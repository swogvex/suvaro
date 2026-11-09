import { describe, expect, it } from 'vitest';
import { dictionaries, locales, useTranslations } from '../../src/i18n';

describe('i18n dictionaries', () => {
  const englishKeys = Object.keys(dictionaries.en).sort();

  it.each(locales)('%s has exactly the English keys, all non-empty', (locale) => {
    const dict = dictionaries[locale];
    expect(Object.keys(dict).sort()).toEqual(englishKeys);
    for (const value of Object.values(dict)) expect(value.trim()).not.toBe('');
  });

  it('falls back to English for an unknown locale', () => {
    expect(useTranslations('fr')('hello.heading')).toBe(dictionaries.en['hello.heading']);
  });
});
