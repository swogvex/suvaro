import type { APIRoute } from 'astro';
import { publicPages } from '../lib/routes';
import { buildSitemap } from '../lib/sitemap';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error('`site` must be set in astro.config.mjs to build the sitemap');
  return new Response(buildSitemap(publicPages(), site), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
