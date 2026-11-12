/**
 * Service worker, built once per deploy (the build stamp changes the file, so browsers install the new one).
 * Privacy first: it caches only the two offline pages and their static assets, never app pages or API data.
 * Navigations go to the network (with navigation preload); when the network fails, the offline page answers.
 */
import type { APIRoute } from 'astro';
import { offlinePaths } from '../lib/routes';

export const prerender = true;

const build = Date.now().toString(36);

/** Runs in the worker scope; kept as plain JavaScript in a template string. */
export function serviceWorkerSource(version: string, pages: Record<'en' | 'es', string>): string {
  return `// Suvaro service worker ${version}
const CACHE = 'suvaro-offline-${version}';
const PAGES = ${JSON.stringify(pages)};

async function precache() {
  const cache = await caches.open(CACHE);
  for (const url of Object.values(PAGES)) {
    const response = await fetch(url, { cache: 'reload' });
    if (!response.ok) throw new Error('offline page ' + response.status);
    const html = await response.clone().text();
    await cache.put(url, response);
    // Same-origin styles, scripts, fonts and images the page needs (hashed, so safe to keep).
    const assets = new Set();
    for (const match of html.matchAll(/(?:href|src)="(\\/(?:_astro|brand)\\/[^"]+)"/g)) assets.add(match[1]);
    await cache.addAll([...assets]);
  }
}

function offlineFor(url) {
  const path = new URL(url).pathname;
  const spanish =
    path === '/es' || path.startsWith('/es/') ||
    (!/^\\/(?:legal|sign-in|offline)(?:\\/|$)/.test(path) && path !== '/' && (self.navigator.language || '').startsWith('es'));
  return PAGES[spanish ? 'es' : 'en'];
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('suvaro-') && key !== CACHE).map((key) => caches.delete(key)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode === 'navigate' && request.method === 'GET') {
    event.respondWith(
      (async () => {
        try {
          return (await event.preloadResponse) || (await fetch(request));
        } catch {
          return (await caches.match(offlineFor(request.url), { cacheName: CACHE })) || Response.error();
        }
      })(),
    );
    return;
  }
  // Hashed assets the offline pages use: answered from the cache when present (they never change).
  const url = new URL(request.url);
  if (request.method === 'GET' && url.origin === self.location.origin && /^\\/(?:_astro|brand)\\//.test(url.pathname)) {
    event.respondWith(caches.match(request, { cacheName: CACHE }).then((hit) => hit || fetch(request)));
  }
});
`;
}

export const GET: APIRoute = () =>
  new Response(serviceWorkerSource(build, offlinePaths as Record<'en' | 'es', string>), {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
  });
