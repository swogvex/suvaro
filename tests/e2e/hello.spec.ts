import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = [
  { path: '/', lang: 'en', heading: 'Hello from Suvaro', switchTo: '/es' },
  { path: '/es', lang: 'es', heading: 'Hola desde Suvaro', switchTo: '/' },
] as const;

for (const { path, lang, heading, switchTo } of pages) {
  test.describe(`hello page ${path}`, () => {
    test('renders in its language with a link to the other one', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expect(page.locator(`a[href="${switchTo}"]`)).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('sends a hashed CSP header that forbids framing', async ({ request }) => {
      const response = await request.get(path);
      const csp = response.headers()['content-security-policy'] ?? '';
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toMatch(/script-src 'self' 'sha256-/);
      expect(csp).not.toContain('unsafe-inline');
    });

    test('skip link is the first focusable element and targets main', async ({ page }) => {
      await page.goto(path);
      await page.keyboard.press('Tab');
      const skip = page.locator('.skip-link');
      await expect(skip).toBeFocused();
      await expect(skip).toBeInViewport();
      await expect(skip).toHaveAttribute('href', '#main');
    });

    test('has no horizontal scroll', async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    for (const colorScheme of ['light', 'dark'] as const) {
      test(`has no axe violations in ${colorScheme} mode`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(path);
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .analyze();
        expect(violations).toEqual([]);
      });
    }
  });
}

test('URLs have no trailing slash: /es/ redirects permanently to /es', async ({ request }) => {
  const response = await request.get('/es/', { maxRedirects: 0 });
  expect([301, 308]).toContain(response.status());
  expect(new URL(response.headers()['location'] ?? '', 'http://localhost').pathname).toBe('/es');
});
