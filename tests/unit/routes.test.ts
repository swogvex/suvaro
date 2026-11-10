import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { locales } from '../../src/i18n';
import {
  legalKeyFromSlug,
  legalKeys,
  legalPath,
  legalSlugs,
  localeFromPath,
  publicPages,
} from '../../src/lib/routes';
import { wrapTables } from '../../src/lib/html';
import { buildSitemap } from '../../src/lib/sitemap';

describe('public routes', () => {
  it('builds legal paths with translated slugs and no trailing slash', () => {
    expect(legalPath('privacy', 'en')).toBe('/legal/privacy');
    expect(legalPath('privacy', 'es')).toBe('/es/legal/privacidad');
    expect(legalPath('notice', 'es')).toBe('/es/legal/aviso-legal');
    for (const page of publicPages()) {
      for (const path of Object.values(page)) expect(path === '/' || !path.endsWith('/')).toBe(true);
    }
  });

  it('maps slugs back to keys per language', () => {
    expect(legalKeyFromSlug('terminos', 'es')).toBe('terms');
    expect(legalKeyFromSlug('terminos', 'en')).toBeUndefined();
  });

  it.each(locales)('has a content file for every %s legal page', (locale) => {
    for (const key of legalKeys) {
      expect(existsSync(`src/content/legal/${locale}/${legalSlugs[key][locale]}.md`), key).toBe(true);
    }
  });

  it('detects the locale from the path', () => {
    expect(localeFromPath('/es')).toBe('es');
    expect(localeFromPath('/es/nope')).toBe('es');
    expect(localeFromPath('/especial')).toBe('en');
    expect(localeFromPath('/nope')).toBe('en');
  });
});

describe('sitemap', () => {
  const xml = buildSitemap(publicPages(), new URL('https://suvaro.xyz'));

  it('lists every public page in both languages, with hreflang alternates', () => {
    const locs = [...xml.matchAll(/<loc>(.+?)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toHaveLength(publicPages().length * locales.length);
    expect(locs).toContain('https://suvaro.xyz/');
    expect(locs).toContain('https://suvaro.xyz/es');
    expect(locs).toContain('https://suvaro.xyz/es/legal/privacidad');
    expect(xml).toContain('hreflang="x-default" href="https://suvaro.xyz/legal/privacy"');
  });

  it('never lists app, demo, sign-in or internal pages', () => {
    expect(xml).not.toMatch(/\/(app|api|demo|sign-in|styleguide)\b/);
  });
});

describe('wrapTables', () => {
  it('wraps each table in a focusable scroll box', () => {
    const html = '<p>a</p><table><tr><td>1</td></tr></table><table class="x"></table>';
    expect(wrapTables(html)).toBe(
      '<p>a</p><div class="table-scroll" tabindex="0"><table><tr><td>1</td></tr></table></div>' +
        '<div class="table-scroll" tabindex="0"><table class="x"></table></div>',
    );
  });

  it('leaves other elements alone', () => {
    expect(wrapTables('<thead><tbody>')).toBe('<thead><tbody>');
  });
});
