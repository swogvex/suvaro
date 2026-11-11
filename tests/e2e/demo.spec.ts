import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  collectErrors,
  expectNoAxeViolations,
  expectNoAxeViolationsInThemes,
  expectNoHorizontalScroll,
  waitForIslands,
} from './helpers';

const isMobile = (info: TestInfo) => info.project.name === 'mobile';

/** Every request the page sends to the app's API (the demo must send none). */
function apiRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/'))
      seen.push(`${request.method()} ${request.url()}`);
  });
  return seen;
}

async function openNew(page: Page, info: TestInfo) {
  if (isMobile(info)) await page.locator('[data-dock]').getByRole('button', { name: 'New movement' }).click();
  else await page.getByRole('button', { name: 'New', exact: true }).click();
}

test.describe('demo', () => {
  test('the sample month, everywhere in the app, without one API call', async ({ page }, info) => {
    test.slow(); // five pages, axe in 6 themes on two
    const errors = collectErrors(page);
    const api = apiRequests(page);
    await page.goto('/demo');
    await waitForIslands(page);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.getByText('Demo: nothing is saved.', { exact: false })).toBeVisible();
    await expect(page.getByTestId('available')).toHaveText('€487.60');
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);

    // Add an expense: Home updates, in memory only.
    await openNew(page, info);
    const editor = page.getByRole('dialog', { name: 'New movement' });
    await editor.getByLabel('Amount').fill('7.60');
    await editor.getByRole('radio', { name: /Food/ }).check();
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('available')).toHaveText('€480.00');

    // Every section stays inside the demo.
    const nav = isMobile(info) ? page.locator('[data-dock]') : page.locator('.app-header__nav');
    for (const [name, path, heading] of [
      ['Movements', '/demo/movements', 'Movements'],
      ['Stats', '/demo/stats', 'Stats'],
      ['Plan', '/demo/plan', 'Plan'],
    ] as const) {
      await nav.getByRole('link', { name }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await waitForIslands(page);
      await expectNoHorizontalScroll(page);
    }
    await expect(page.getByText('Trip to Lisbon').first()).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto('/demo/movements/recurring');
    await expect(page.getByText('Gym').first()).toBeVisible();
    await page.goto('/demo/settings');
    await expect(page.getByRole('link', { name: 'Create account' }).first()).toHaveAttribute(
      'href',
      '/sign-in?mode=create',
    );

    // Nothing was saved: a new visit starts from the sample month again.
    await page.goto('/demo');
    await expect(page.getByTestId('available')).toHaveText('€487.60');
    expect(api).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('older months, another stats period and search work from memory', async ({ page }) => {
    const api = apiRequests(page);
    await page.goto('/demo/stats');
    await waitForIslands(page);
    await page.getByRole('radio', { name: 'Year' }).check();
    await expect(page).toHaveURL(/period=year/);
    await page.goto('/demo/movements');
    await waitForIslands(page);
    await page.keyboard.press('/');
    await page.keyboard.type('rent');
    await expect(page.getByRole('dialog').getByRole('option', { name: /Rent/ }).first()).toBeVisible();
    expect(api).toEqual([]);
  });

  test('Spanish demo and an unknown page', async ({ page, request }) => {
    const api = apiRequests(page);
    await page.goto('/es/demo');
    await waitForIslands(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByTestId('available')).toHaveText('487,60 €');
    await expect(page.getByText('Demo: no se guarda nada.', { exact: false })).toBeVisible();
    await page.getByRole('link', { name: 'Estadísticas' }).first().click();
    await expect(page).toHaveURL(/\/es\/demo\/stats$/);
    expect(api).toEqual([]);
    expect((await request.get('/demo/nope')).status()).toBe(404);
  });
});
