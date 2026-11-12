import { expect, test, type Page } from '@playwright/test';
import {
  collectErrors,
  enterCode,
  expectNoAxeViolationsInThemes,
  expectNoHorizontalScroll,
  randomIp,
  signUpWithCode,
  skipOnboarding,
  uniqueEmail,
  waitForIslands,
} from './helpers';

/** Same value as `CRON_SECRET` in the Playwright web server (`playwright.config.ts`). */
const CRON_SECRET = 'e2e-cron-secret-not-a-real-one';

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() });
});

async function newUser(page: Page, label: string) {
  await signUpWithCode(page, uniqueEmail(label));
  await skipOnboarding(page);
  await page.goto('/app/movements/recurring');
  await waitForIslands(page);
}

const toast = (page: Page) => page.locator('[data-toast-text]');

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** A fresh valid ULID-shaped id (the database is shared by every run and project). */
const ulid = () =>
  `01J${Array.from({ length: 23 }, () => CROCKFORD[Math.floor(Math.random() * 32)]).join('')}`;

function saved(page: Page, method: string, path: RegExp) {
  return page.waitForResponse((r) => path.test(new URL(r.url()).pathname) && r.request().method() === method);
}

test.describe('recurring', () => {
  test('create, ask first, confirm, edit and delete with undo', async ({ page }) => {
    test.slow();
    const errors = collectErrors(page);
    await newUser(page, 'recurring');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Movements');
    await expect(page.getByRole('link', { name: /Recurring/ })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Nothing repeats yet')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);

    // An automatic expense starting today: created at once.
    await page.getByRole('button', { name: 'Add a recurring movement' }).click();
    const dialog = page.getByRole('dialog', { name: 'New recurring movement' });
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText('Write an amount greater than zero')).toBeVisible();
    await expect(dialog.getByText('Pick a category.')).toBeVisible();
    await dialog.getByLabel('Amount').fill('850');
    await dialog.getByLabel('Category').selectOption({ index: 1 });
    await dialog.getByLabel('Name (optional)').fill('Rent');
    let response = saved(page, 'POST', /^\/api\/recurring$/);
    await dialog.getByRole('button', { name: 'Save' }).click();
    expect((await response).status()).toBe(201);
    await expect(toast(page)).toHaveText('Saved «Rent»');
    const rent = page.getByRole('row', { name: /Rent/ });
    await expect(rent).toContainText('Monthly · day');
    await expect(rent).toContainText('Automatic');
    await expect(page.getByRole('listitem').filter({ hasText: 'Fixed expenses per month' })).toContainText(
      '850.00',
    );

    // Income that asks first: today's occurrence waits for confirmation.
    await page.getByRole('button', { name: 'New recurring' }).click();
    await dialog.getByRole('radio', { name: 'Income' }).check();
    await dialog.getByLabel('Amount').fill('1850');
    await dialog.getByLabel('Name (optional)').fill('Salary');
    await dialog.getByRole('radio', { name: 'Ask me first' }).check();
    response = saved(page, 'POST', /^\/api\/recurring$/);
    await dialog.getByRole('button', { name: 'Save' }).click();
    expect((await response).status()).toBe(201);
    await expect(page.getByRole('row', { name: /Salary/ })).toContainText('Asks first');

    await page.reload();
    await expect(page.getByRole('link', { name: /Recurring 2/ })).toBeVisible();
    await expect(page.getByText(/1 waiting for confirmation: «Salary» \+€1,850\.00 on /)).toBeVisible();
    await expectNoAxeViolationsInThemes(page);
    response = saved(page, 'POST', /^\/api\/recurring-pending\//);
    await page.getByRole('button', { name: 'Confirm' }).click();
    expect((await response).status()).toBe(201);
    await expect(page.getByRole('region', { name: 'Waiting for confirmation' })).toHaveCount(0);

    // Both are now movements, marked as recurring.
    await page.goto('/app/movements');
    for (const name of ['Rent', 'Salary']) {
      await expect(page.locator('[data-movement]').filter({ hasText: name })).toContainText('Recurring');
    }
    await page.goto('/app/movements/recurring');

    // Edit: every 10 days from now on.
    await page.getByRole('button', { name: 'Edit Rent' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit recurring movement' });
    await edit.getByLabel('Repeats').selectOption('every_n_days');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit.getByText('Use a whole number from 2 to 365.')).toBeVisible();
    await edit.getByLabel('Every how many days').fill('10');
    response = saved(page, 'PATCH', /^\/api\/recurring\//);
    await edit.getByRole('button', { name: 'Save' }).click();
    expect((await response).status()).toBe(200);
    await expect(page.getByRole('row', { name: /Rent/ })).toContainText('Every 10 days');

    // Delete with undo, then for real.
    await page.getByRole('button', { name: 'Edit Rent' }).click();
    await edit.getByRole('button', { name: 'Delete' }).click();
    await expect(toast(page)).toContainText('Deleted «Rent»');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('row', { name: /Rent/ })).toBeVisible();
    await page.getByRole('button', { name: 'Edit Rent' }).click();
    response = saved(page, 'DELETE', /^\/api\/recurring\//);
    await edit.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('row', { name: /Rent/ })).toHaveCount(0);
    expect((await response).status()).toBe(204);

    await page.reload();
    await expect(page.getByRole('link', { name: /Recurring 1/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('keyboard only: open the dialog, close with Esc, skip a pending one', async ({ page }) => {
    await newUser(page, 'recurring-keys');
    const add = page.getByRole('button', { name: 'Add a recurring movement' });
    await add.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'New recurring movement' });
    await expect(dialog.getByLabel('Amount')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(add).toBeFocused();

    await page.keyboard.press('Enter');
    await page.keyboard.type('2,99');
    // The customizable select opens its list on ArrowDown; arrows move, Enter picks (a listbox).
    const category = dialog.getByLabel('Category');
    await category.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(category).not.toHaveValue('');
    await dialog.getByRole('radio', { name: 'Ask me first' }).focus();
    await page.keyboard.press('Space');
    await dialog.getByLabel('Amount').focus();
    const created = saved(page, 'POST', /^\/api\/recurring$/);
    await page.keyboard.press('Enter');
    expect((await created).status()).toBe(201);

    await page.reload();
    await waitForIslands(page);
    const skip = page.getByRole('button', { name: 'Skip this time' });
    await skip.focus();
    const skipped = saved(page, 'DELETE', /^\/api\/recurring-pending\//);
    await page.keyboard.press('Enter');
    expect((await skipped).status()).toBe(204);
    await expect(page.getByRole('region', { name: 'Waiting for confirmation' })).toHaveCount(0);
  });

  test('another user’s template and pending ids answer 404', async ({ page, browser }) => {
    await newUser(page, 'recurring-owner');
    const id = ulid();
    const created = await page.evaluate(async (newId) => {
      const res = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newId,
          type: 'income',
          amountCents: 1000,
          categoryId: null,
          note: 'Mine',
          frequency: 'weekly',
          intervalDays: null,
          anchorDate: '2030-01-01',
          endDate: null,
          mode: 'auto',
        }),
      });
      return res.status;
    }, id);
    expect(created).toBe(201);

    const other = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': randomIp() } });
    const intruder = await other.newPage();
    await newUser(intruder, 'recurring-intruder');
    const statuses = await intruder.evaluate(async (target) => {
      const patch = await fetch(`/api/recurring/${target}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'income',
          amountCents: 1,
          categoryId: null,
          note: '',
          frequency: 'weekly',
          intervalDays: null,
          anchorDate: '2030-01-01',
          endDate: null,
          mode: 'auto',
        }),
      });
      const remove = await fetch(`/api/recurring/${target}`, { method: 'DELETE' });
      const confirm = await fetch(`/api/recurring-pending/${target}`, { method: 'POST' });
      return [patch.status, remove.status, confirm.status];
    }, id);
    expect(statuses).toEqual([404, 404, 404]);
    await other.close();
  });
});

test('in Spanish the three movement views fit without sideways scroll', async ({ page }) => {
  const email = uniqueEmail('recurring-es');
  await page.goto('/es/acceso?mode=create');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel(/Tengo 18 años/).check();
  await page.getByRole('button', { name: 'Envíame un código' }).click();
  await enterCode(page, email);
  await page.waitForURL('**/app/welcome');
  await page.getByRole('button', { name: 'Saltar configuración' }).click();
  await page.waitForURL(/\/app$/);
  for (const path of ['/app/movements', '/app/movements/calendar', '/app/movements/recurring']) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: /Recurrentes 0/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});

test.describe('daily cron', () => {
  test('refuses requests without the secret and runs with it', async ({ request }) => {
    expect((await request.get('/api/cron/daily')).status()).toBe(401);
    const wrong = await request.get('/api/cron/daily', { headers: { Authorization: 'Bearer nope' } });
    expect(wrong.status()).toBe(401);
    const ok = await request.get('/api/cron/daily', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(ok.status()).toBe(200);
    expect(Object.keys((await ok.json()) as object).sort()).toEqual([
      'capped',
      'deletedInactive',
      'deletedUnverified',
      'failedSteps',
      'occurrences',
      'warned25',
      'warned29',
    ]);
  });
});
