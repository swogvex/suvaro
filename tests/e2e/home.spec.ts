import { execFileSync } from 'node:child_process';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  collectErrors,
  expectNoAxeViolationsInThemes,
  expectNoHorizontalScroll,
  randomIp,
  signUpWithCode,
  skipOnboarding,
  uniqueEmail,
} from './helpers';

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() });
});

async function newUser(page: Page, label: string) {
  await signUpWithCode(page, uniqueEmail(label));
  await skipOnboarding(page);
}

const isMobile = (info: TestInfo) => info.project.name === 'mobile';

/** Saves the open editor and waits until the server has the movement. */
async function save(page: Page) {
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/api/movements') && r.request().method() === 'POST',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  expect((await saved).status()).toBe(201);
}

async function openNew(page: Page, info: TestInfo) {
  if (isMobile(info)) await page.locator('[data-dock]').getByRole('button', { name: 'New movement' }).click();
  else await page.getByRole('button', { name: 'New', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New movement' });
  await expect(dialog).toBeVisible();
  return dialog;
}

const hero = (page: Page) => page.locator('.hero');
const cycleLabel = (page: Page) => page.getByTestId('cycle-label');

test.describe('home', () => {
  test('empty state, then every block follows new movements at once and after reload', async ({
    page,
  }, info) => {
    const errors = collectErrors(page);
    await newUser(page, 'home');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hi');
    await expect(hero(page).getByRole('heading')).toHaveText('Note your income for this month to start');
    await expect(page.getByText('Nothing noted in this month yet.')).toBeVisible();
    await expect(page.getByText('No budgets yet.', { exact: false })).toBeVisible();
    await expect(page.getByText('Pin a savings goal', { exact: false })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);

    // The empty state's action opens the editor as an income.
    await hero(page).getByRole('button', { name: 'Note income' }).click();
    const dialog = page.getByRole('dialog', { name: 'New movement' });
    await expect(dialog.getByRole('radio', { name: 'Income' })).toBeChecked();
    await dialog.getByLabel('Amount').fill('1850');
    await dialog.getByLabel('Note (optional)').fill('Salary');
    await save(page);

    await expect(page.getByTestId('available')).toHaveText('€1,850.00');
    await expect(page.getByTestId('income')).toHaveText('€1,850.00');
    await expect(page.locator('.stat').first().locator('.badge')).toContainText('Salary');

    const expense = await openNew(page, info);
    await expense.getByLabel('Amount').fill('23.85');
    await expense.getByRole('radio', { name: 'Food' }).check();
    await save(page);

    await expect(page.getByTestId('available')).toHaveText('€1,826.15');
    await expect(page.getByTestId('expenses')).toHaveText('€23.85');
    await expect(page.getByTestId('savings')).toHaveText('€1,826.15');
    await expect(page.getByTestId('daily')).toContainText(/a day|Last day/);
    await expect(page.locator('.last__row')).toHaveCount(2);
    await expect(page.locator('.last__row').first()).toContainText('-€23.85');

    await page.reload();
    await expect(page.getByTestId('available')).toHaveText('€1,826.15');
    await expect(page.getByTestId('spending-summary')).toContainText('€23.85');

    // A row opens the editor with that movement; the chart has a table view.
    await page.locator('.last__row').filter({ hasText: 'Salary' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit movement' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'View as table' }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide table' })).toHaveAttribute('aria-expanded', 'true');

    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);
    expect(errors).toEqual([]);
  });

  test('the cycle selector shows earlier months and comes back', async ({ page }) => {
    await newUser(page, 'home-cycle');
    const current = (await cycleLabel(page).textContent())?.trim();
    const next = page.getByRole('button', { name: 'Next month' });
    await expect(next).toBeDisabled();

    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(page).toHaveURL(/\?cycle=\d{4}-\d{2}$/);
    await expect(cycleLabel(page)).not.toHaveText(current ?? '');
    // A past month has no empty-state prompt: it shows what was left over.
    await expect(hero(page).getByRole('heading')).toHaveText('Left over');
    await expect(page.getByTestId('daily')).toContainText('is over');
    await expect(next).toBeEnabled();

    // The URL survives a reload (server-rendered cycle).
    await page.reload();
    await expect(hero(page).getByRole('heading')).toHaveText('Left over');

    await page.getByRole('button', { name: 'This month' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(cycleLabel(page)).toHaveText(current ?? '');

    // ← / → do the same from the keyboard.
    await page.locator('body').press('ArrowLeft');
    await expect(page).toHaveURL(/\?cycle=/);
    await page.locator('body').press('ArrowRight');
    await expect(page).toHaveURL(/\/app$/);
  });
});

test.describe('home API', () => {
  test('needs a session and refuses bad or future cycles', async ({ page }) => {
    expect((await page.request.get('/api/home')).status()).toBe(401);

    await newUser(page, 'home-api');
    const ok = await page.request.get('/api/home');
    expect(ok.status()).toBe(200);
    const body = (await ok.json()) as { cycle: { start: string }; movements: unknown[] };
    expect(body.movements).toEqual([]);

    const year = Number(body.cycle.start.slice(0, 4));
    expect((await page.request.get(`/api/home?cycle=${year + 1}-01`)).status()).toBe(400);
    expect((await page.request.get('/api/home?cycle=2026-13')).status()).toBe(400);
    expect((await page.request.get('/api/home?cycle=2026-01&x=1')).status()).toBe(400);
    expect((await page.request.get(`/api/home?cycle=${year - 1}-06`)).status()).toBe(200);
  });
});

test.describe('home with a full month', () => {
  test('budgets at risk, pinned goal and chart are accessible in every theme', async ({ page }, info) => {
    const errors = collectErrors(page);
    // A user seeded before the server started (playwright.config.ts): a month of movements, budgets and a
    // pinned goal. Only the cookie is computed here.
    const cookie = execFileSync(
      process.execPath,
      ['scripts/seed-user.mjs', `e2e-${info.project.name}`, '--cookie'],
      {
        encoding: 'utf8',
      },
    ).trim();
    const [name = '', value = ''] = cookie.split(/=(.*)/s);
    await page
      .context()
      .addCookies([
        { name, value, domain: 'localhost', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
      ]);
    await page.goto('/app');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hi, Alex');
    await expect(page.locator('.budgets').getByText(/^\d at risk$/)).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Leisure budget' })).toBeVisible();
    await expect(page.getByRole('img', { name: /saved$/ })).toBeVisible();
    await expect(page.getByText('Trip to Lisbon')).toBeVisible();
    await expect(page.locator('.last__row')).toHaveCount(5);
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);
    expect(errors).toEqual([]);
  });
});
