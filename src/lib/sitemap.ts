import { locales } from '../i18n';
import type { Alternates } from './routes';

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Builds sitemap.xml: one <url> per page and language, each listing every translation plus x-default (English). */
export function buildSitemap(pages: Alternates[], site: URL): string {
  const abs = (path: string) => escapeXml(new URL(path, site).href);
  const urls = pages.flatMap((alternates) => {
    const links = [
      ...locales.map(
        (lang) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${abs(alternates[lang])}"/>`,
      ),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(alternates.en)}"/>`,
    ].join('\n');
    return locales.map((lang) => `  <url>\n    <loc>${abs(alternates[lang])}</loc>\n${links}\n  </url>`);
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
