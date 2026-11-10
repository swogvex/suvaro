import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const pages = [
  { path: '/', lang: 'en', heading: 'Know where your money goes. Calmly.' },
  { path: '/es', lang: 'es', heading: 'Sabe a dónde va tu dinero. Con calma.' },
  { path: '/legal/privacy', lang: 'en', heading: 'Privacy policy' },
  { path: '/es/legal/privacidad', lang: 'es', heading: 'Política de privacidad' },
  { path: '/legal/credits', lang: 'en', heading: 'Credits' },
  { path: '/es/legal/aviso-legal', lang: 'es', heading: 'Aviso legal' },
] as const;

/** Links that point to app routes built in later milestones. */
const notYetBuilt = new Set(['/demo']);

const themes = (['light', 'dark'] as const).flatMap((mode) =>
  (['blue', 'red', 'green'] as const).map((accent) => ({ mode, accent })),
);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) }))).toEqual([]);
}

for (const { path, lang, heading } of pages) {
  test.describe(`public page ${path}`, () => {
    test('renders in its language, without console errors or horizontal scroll', async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });

    test('has canonical, hreflang and Open Graph tags', async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://suvaro.xyz${path}`,
      );
      for (const hreflang of ['en', 'es', 'x-default']) {
        await expect(page.locator(`link[rel="alternate"][hreflang="${hreflang}"]`)).toHaveCount(1);
      }
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        'content',
        `https://suvaro.xyz/og/og-${lang}.png`,
      );
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    });

    for (const { mode, accent } of themes) {
      test(`has no axe violations in ${mode} · ${accent}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: mode });
        await page.goto(path);
        await page.evaluate(
          ([m, a]) => Object.assign(document.documentElement.dataset, { mode: m, accent: a }),
          [mode, accent] as const,
        );
        await expectNoAxeViolations(page);
      });
    }
  });
}

test.describe('component gallery', () => {
  for (const { mode, accent } of themes) {
    test(`has no axe violations in ${mode} · ${accent}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode });
      await page.goto('/styleguide');
      await page.evaluate(
        ([m, a]) => Object.assign(document.documentElement.dataset, { mode: m, accent: a }),
        [mode, accent] as const,
      );
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
      await expectNoAxeViolations(page);
    });
  }
});

test.describe('404', () => {
  for (const { path, lang, heading } of [
    { path: '/does-not-exist', lang: 'en', heading: 'You’ve wandered off the trail' },
    { path: '/es/no-existe', lang: 'es', heading: 'Te has salido del sendero' },
  ]) {
    test(`${path} answers 404 in ${lang}, noindex`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
      for (const mode of ['light', 'dark'] as const) {
        await page.evaluate((m) => (document.documentElement.dataset['mode'] = m), mode);
        await expectNoAxeViolations(page);
      }
    });
  }
});

test.describe('security and URLs', () => {
  test('sends a hashed CSP header that forbids framing, with no unsafe-inline', async ({ request }) => {
    for (const path of ['/', '/es', '/legal/privacy', '/does-not-exist']) {
      const response = await request.get(path);
      const csp = response.headers()['content-security-policy'] ?? '';
      expect(csp, path).toContain("frame-ancestors 'none'");
      expect(csp, path).toContain("object-src 'none'");
      expect(csp, path).toMatch(/script-src 'self' 'sha256-/);
      expect(csp, path).not.toContain('unsafe-inline');
    }
  });

  test('URLs have no trailing slash: /es/ redirects permanently to /es', async ({ request }) => {
    const response = await request.get('/es/', { maxRedirects: 0 });
    expect([301, 308]).toContain(response.status());
    expect(new URL(response.headers()['location'] ?? '', 'http://localhost').pathname).toBe('/es');
  });

  test('skip link is the first focusable element and targets main', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.locator('.skip-link');
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await expect(skip).toHaveAttribute('href', '#main');
  });

  test('every internal link on public pages resolves', async ({ page, request }) => {
    const hrefs = new Set<string>();
    for (const { path } of pages) {
      await page.goto(path);
      for (const href of await page
        .locator('a[href^="/"]')
        .evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
        if (href) hrefs.add(href.split('#')[0] || '/');
      }
    }
    for (const href of hrefs) {
      if (notYetBuilt.has(href)) continue;
      const response = await request.get(href, { maxRedirects: 0 });
      expect(response.status(), href).toBe(200);
    }
  });
});

test.describe('SEO files', () => {
  test('sitemap lists the public pages only', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const xml = await response.text();
    expect(xml).toContain('<loc>https://suvaro.xyz/es/legal/terminos</loc>');
    expect(xml).not.toContain('styleguide');
  });

  test('robots.txt points to the sitemap and blocks the app', async ({ request }) => {
    const text = await (await request.get('/robots.txt')).text();
    expect(text).toContain('Disallow: /app');
    expect(text).toContain('Sitemap: https://suvaro.xyz/sitemap.xml');
  });

  test('the landing has WebApplication structured data', async ({ page }) => {
    await page.goto('/');
    const json = await page.locator('script[type="application/ld+json"]').textContent();
    expect(JSON.parse(json ?? '{}')).toMatchObject({
      '@type': 'WebApplication',
      applicationCategory: 'FinanceApplication',
    });
  });

  test('the web manifest is served', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    expect((await response.json()).name).toBe('Suvaro');
  });
});

test.describe('theme', () => {
  test('follows the system before any choice, without JS errors', async ({ page }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'blue');
    expect(errors).toEqual([]);
  });

  test('the footer switch saves the choice and applies it before paint on the next page', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const switcher = page.getByRole('group', { name: 'Theme' });
    await expect(switcher).toBeVisible();
    await switcher.getByLabel('Dark').check();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');

    // The inline head script must set the mode before any module script runs.
    await page.goto('/es', { waitUntil: 'commit' });
    await page.waitForSelector('head title', { state: 'attached' });
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    await expect(page.getByRole('group', { name: 'Tema' }).getByLabel('Oscuro')).toBeChecked();

    await page.getByRole('group', { name: 'Tema' }).getByLabel('Auto').check();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
    expect(await page.evaluate(() => localStorage.getItem('suvaro-mode'))).toBeNull();
  });
});

test.describe('language suggestion', () => {
  test.use({ locale: 'es-ES' });

  test('suggests Spanish on an English page, never redirects, and stays closed', async ({ page }) => {
    await page.goto('/');
    expect(new URL(page.url()).pathname).toBe('/');
    const notice = page.locator('[data-lang-notice]');
    await expect(notice).toBeVisible();
    await expect(notice.getByRole('link', { name: 'Ver en español' })).toHaveAttribute('href', '/es');
    await notice.getByRole('button', { name: 'Cerrar' }).click();
    await expect(notice).toBeHidden();
    await page.reload();
    await expect(notice).toBeHidden();
  });

  test('stays hidden on a page already in the browser language', async ({ page }) => {
    await page.goto('/es');
    await expect(page.locator('[data-lang-notice]')).toBeHidden();
  });
});

test('FAQ answers open with the keyboard', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('#faq details').first();
  await first.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('open', '');
  await expect(first.getByText('never connects to a bank')).toBeVisible();
});
