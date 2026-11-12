import { collectErrors, expectNoAxeViolationsInThemes } from './helpers';
import { expect, test } from '@playwright/test';

const offline = [
  { path: '/offline', lang: 'en', heading: 'You’re offline', retry: 'Try again' },
  { path: '/es/sin-conexion', lang: 'es', heading: 'Estás sin conexión', retry: 'Reintentar' },
] as const;

test.describe('offline page', () => {
  for (const { path, lang, heading } of offline) {
    test(`${path} renders in ${lang}, noindex, with no axe violations`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
      await expectNoAxeViolationsInThemes(page);
      expect(errors).toEqual([]);
    });
  }

  test('is not in the sitemap', async ({ request }) => {
    const text = await (await request.get('/sitemap.xml')).text();
    expect(text).not.toContain('offline');
    expect(text).not.toContain('sin-conexion');
  });
});

test.describe('service worker', () => {
  test.use({ serviceWorkers: 'allow' });

  test('serves the offline page in the page language when a navigation fails, then recovers', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((done) => navigator.serviceWorker.addEventListener('controllerchange', done));
      }
    });

    await context.setOffline(true);
    await page.goto('/legal/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(offline[0].heading);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.goto('/es/legal/privacidad');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(offline[1].heading);

    // The cached page keeps its styles (assets come from the worker's cache).
    const font = await page
      .getByRole('heading', { level: 1 })
      .evaluate((h) => getComputedStyle(h).fontFamily);
    expect(font).toContain('Unbounded');

    await context.setOffline(false);
    await page.getByRole('link', { name: offline[1].retry }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Política de privacidad');
    await expect(page).toHaveURL(/\/es\/legal\/privacidad$/);
  });

  test('keeps only the offline pages and their assets in the cache', async ({ page }) => {
    await page.goto('/');
    const cached = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      const urls: string[] = [];
      for (const key of await caches.keys()) {
        for (const request of await (await caches.open(key)).keys()) urls.push(new URL(request.url).pathname);
      }
      return urls;
    });
    expect(cached).toEqual(expect.arrayContaining(['/offline', '/es/sin-conexion']));
    for (const path of cached) expect(path).toMatch(/^\/(offline|es\/sin-conexion|_astro\/.+|brand\/.+)$/);
  });
});
