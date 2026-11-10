import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  collectErrors,
  expectNoAxeViolations,
  expectNoAxeViolationsInThemes,
  expectNoHorizontalScroll,
  newContextWithIp,
  randomIp,
  signUpWithCode,
  skipOnboarding,
  uniqueEmail,
} from './helpers';

const ORIGIN = { Origin: 'http://localhost:4321' };

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() });
});

async function newUser(page: Page, label: string) {
  await signUpWithCode(page, uniqueEmail(label));
  await skipOnboarding(page);
}

const isMobile = (info: TestInfo) => info.project.name === 'mobile';

/** Opens the new-movement dialog the way each layout offers it: dock "+" on phones, "New" on desktop. */
async function openNew(page: Page, info: TestInfo) {
  if (isMobile(info)) await page.locator('[data-dock]').getByRole('button', { name: 'New movement' }).click();
  else await page.getByRole('button', { name: 'New', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New movement' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Notes an expense through the dialog and waits until the server has it. */
async function addExpense(page: Page, info: TestInfo, amount: string, category: string, note = '') {
  const dialog = await openNew(page, info);
  await dialog.getByLabel('Amount').fill(amount);
  await dialog.getByRole('radio', { name: category }).check();
  if (note) await dialog.getByLabel('Note (optional)').fill(note);
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/api/movements') && r.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Save' }).click();
  expect((await saved).status()).toBe(201);
}

const list = (page: Page) => page.locator('.days');
/** The row button of a movement (not its Edit/Delete icon buttons). */
const row = (page: Page, name: RegExp) => page.locator('.row__main').filter({ hasText: name });
const toast = (page: Page) => page.locator('[data-toast]');

/** Desktop shows Delete when the pointer is over the row; phones reveal it by swiping (scrolled into view). */
async function deleteRow(page: Page, name: string) {
  await row(page, new RegExp(name)).hover();
  await list(page)
    .getByRole('button', { name: `Delete ${name}` })
    .click();
}

test.describe('movements', () => {
  test('create, edit and delete with undo, optimistic and persisted', async ({ page }, info) => {
    const errors = collectErrors(page);
    await newUser(page, 'crud');
    await page.goto('/app/movements');
    await expect(page.getByRole('heading', { name: /Nothing noted in/ })).toBeVisible();
    await expectNoAxeViolations(page);

    // Create: the row shows at once and the toast offers Undo with a countdown.
    await addExpense(page, info, '23.85', 'Food', 'Market');
    await expect(row(page, /Market.*Food.*23\.85/)).toBeVisible();
    await expect(toast(page)).toContainText('Saved: -€23.85 in Food');
    await expect(toast(page).getByRole('button', { name: 'Undo' })).toContainText(/Undo · [1-5] s/);
    await expect(list(page).getByRole('heading', { name: /^Today · / })).toBeVisible();

    // Undo removes it again (on the server too).
    await toast(page).getByRole('button', { name: 'Undo' }).click();
    await expect(list(page)).toBeHidden();
    await expect
      .poll(async () => (await (await page.request.get('/api/movements')).json()).summary.count)
      .toBe(0);

    // Income has no category and shows with a plus sign.
    const dialog = await openNew(page, info);
    await dialog.getByRole('radio', { name: 'Income' }).check();
    await expect(dialog.getByRole('group', { name: 'Category' })).toHaveCount(0);
    await dialog.getByLabel('Amount').fill('1850');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(row(page, /Income.*\+€1,850\.00/)).toBeVisible();

    await addExpense(page, info, '3.80', 'Food', 'Coffee');
    await page.reload();
    await expect(row(page, /Coffee/)).toBeVisible();
    await expect(list(page).getByText('+€1,846.20', { exact: true })).toBeVisible(); // day total

    // Edit: amount and note.
    await row(page, /Coffee/).click();
    const edit = page.getByRole('dialog', { name: 'Edit movement' });
    await expect(edit.getByLabel('Amount')).toHaveValue('3.80');
    await edit.getByLabel('Amount').fill('4.10');
    await edit.getByLabel('Note (optional)').fill('Flat white');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(toast(page)).toContainText('Changes saved');
    await expect(row(page, /Flat white.*4\.10/)).toBeVisible();

    // Delete waits 5 s for Undo before reaching the server.
    await deleteRow(page, 'Flat white');
    await expect(row(page, /Flat white/)).toHaveCount(0);
    await expect(toast(page)).toContainText('Deleted «Flat white» (-€4.10)');
    await toast(page).getByRole('button', { name: 'Undo' }).click();
    await expect(row(page, /Flat white/)).toBeVisible();

    await deleteRow(page, 'Flat white');
    const deleted = page.waitForResponse((r) => r.request().method() === 'DELETE', { timeout: 8_000 });
    expect((await deleted).status()).toBe(204);
    await page.reload();
    await expect(row(page, /Flat white/)).toHaveCount(0);
    await expect(row(page, /Income/)).toBeVisible();

    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);
    expect(errors).toEqual([]);
  });

  test('a failed save rolls back and says so', async ({ page }, info) => {
    await newUser(page, 'rollback');
    await page.goto('/app/movements');
    await page.route('**/api/movements', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"SERVER_ERROR"}' })
        : route.continue(),
    );
    const dialog = await openNew(page, info);
    await dialog.getByLabel('Amount').fill('12');
    await dialog.getByRole('radio', { name: 'Leisure' }).check();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(toast(page)).toContainText('We couldn’t save it, so the change was undone.');
    await expect(page.getByRole('heading', { name: /Nothing noted in/ })).toBeVisible();

    // A failed delete puts the movement back.
    await page.unroute('**/api/movements');
    await addExpense(page, info, '7', 'Leisure', 'Cinema');
    await page.route('**/api/movements/*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"SERVER_ERROR"}' }),
    );
    await deleteRow(page, 'Cinema');
    await expect(row(page, /Cinema/)).toHaveCount(0);
    await toast(page).getByRole('button', { name: 'Close' }).click();
    await expect(row(page, /Cinema/)).toBeVisible();
    await expect(toast(page)).toContainText('We couldn’t save it');
  });

  test('the editor checks the amount and the category', async ({ page }, info) => {
    await newUser(page, 'validate');
    await page.goto('/app/movements');
    const dialog = await openNew(page, info);
    await dialog.getByLabel('Amount').fill('abc');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText('Type an amount greater than 0, like 12.50.')).toBeVisible();
    await expect(dialog.getByText('Choose a category.')).toBeVisible();
    await expect(dialog.getByLabel('Amount')).toBeFocused();
    await expect(dialog.getByLabel('Amount')).toHaveAttribute('aria-invalid', 'true');
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('filters live in the URL and survive reload', async ({ page }, info) => {
    await newUser(page, 'filters');
    await page.goto('/app/movements');
    await addExpense(page, info, '10', 'Food', 'Bread');
    await addExpense(page, info, '40', 'Leisure', 'Concert');

    await page.getByRole('button', { name: 'Filters' }).click();
    await page.getByRole('checkbox', { name: 'Leisure' }).check();
    await expect(page).toHaveURL(/[?&]cat=[0-9A-Z]{26}/);
    await expect(row(page, /Bread/)).toHaveCount(0);
    await expect(page.getByText('1 movement · -€40.00')).toBeVisible();

    await page.getByLabel('Minimum').fill('50');
    await page.getByLabel('Minimum').press('Enter');
    await expect(page).toHaveURL(/min=50\.00/);
    await expect(page.getByText('No movements match these filters.')).toBeVisible();

    await page.reload();
    await expect(page.getByText('No movements match these filters.')).toBeVisible();
    await page.getByRole('button', { name: 'Remove filter: From €50.00' }).click();
    await expect(row(page, /Concert/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', /cat=/);

    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(page).toHaveURL(/\/app\/movements$/);
    await expect(row(page, /Bread/)).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('calendar shows day totals and the selected day', async ({ page }, info) => {
    await newUser(page, 'calendar');
    await page.goto('/app/movements');
    await addExpense(page, info, '160', 'Food', 'Big shop');
    await page.getByRole('link', { name: 'Calendar' }).click();
    await expect(page).toHaveURL(/\/app\/movements\/calendar/);

    const today = page.locator('.day[aria-current="date"]');
    await expect(today).toHaveAttribute('aria-pressed', 'true');
    await expect(today).toHaveAccessibleName(
      /November|December|January|February|March|April|May|June|July|August|September|October/,
    );
    await expect(today).toContainText('-€160.00');
    await expect(today).toHaveAttribute('data-level', 'high');
    await expect(row(page, /Big shop/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Note on this day' })).toBeVisible();

    const title = page.getByRole('heading', { level: 2 }).first();
    const month = await title.textContent();
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(title).not.toHaveText(month ?? '');
    await expect(page).toHaveURL(/month=\d{4}-\d{2}/);
    await expect(page.getByRole('button', { name: 'This month' })).toBeVisible();
    if (!isMobile(info)) {
      // ← goes back (outside the grid and outside fields).
      await page.locator('h1').click();
      await page.keyboard.press('ArrowLeft');
      await expect(title).toHaveText(month ?? '');
    }

    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);
  });

  test('keyboard: N, search with Ctrl K and the shortcuts list', async ({ page }, info) => {
    test.skip(isMobile(info), 'Keyboard shortcuts are for desktop');
    await newUser(page, 'keys');
    await page.goto('/app/movements');
    await addExpense(page, info, '5.50', 'Transport', 'Bus pass');

    await page.keyboard.press('n');
    const dialog = page.getByRole('dialog', { name: 'New movement' });
    await expect(dialog.getByLabel('Amount')).toBeFocused();
    await page.keyboard.type('2');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.keyboard.press('Control+k');
    const search = page.getByRole('dialog', { name: 'Search' });
    await expect(search.getByRole('combobox')).toBeFocused();
    await page.keyboard.type('bus');
    const option = search.getByRole('option', { name: /Bus pass/ });
    await expect(option).toHaveAttribute('aria-selected', 'true');
    await expect(search.locator('mark')).toHaveText('Bus');
    await expect(search.getByRole('group', { name: 'Movements · 1' })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Edit movement' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.keyboard.press('/');
    await page.keyboard.type('secur');
    await expect(search.getByRole('group', { name: 'Movements · 0' })).toBeAttached();
    await expect(search.getByRole('option', { name: /Security/ })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/app\/settings\/security$/);

    await page.keyboard.press('Shift+?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('the editor opens from every app page', async ({ page }, info) => {
    await newUser(page, 'everywhere');
    await page.goto('/app/stats');
    await addExpense(page, info, '9.99', 'Subscriptions', 'Music');
    await page.goto('/app/movements');
    await expect(row(page, /Music/)).toBeVisible();
  });
});

test.describe('app shell polish', () => {
  test('desktop header toggles light/dark and the browser color follows', async ({ page }, info) => {
    test.skip(isMobile(info), 'On phones the toggle is in the dock');
    await page.emulateMedia({ colorScheme: 'light' });
    await newUser(page, 'theme');
    const header = page.locator('.app-header');
    await header.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', /^#12141c$/i);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    await header.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', /^#f6f3ee$/i);
  });

  test('the header always shows the wordmark, which leads Home', async ({ page }, info) => {
    await newUser(page, 'brand');
    for (const path of [
      '/app/movements',
      '/app/movements/calendar',
      '/app/stats',
      '/app/plan',
      '/app/settings/security',
    ]) {
      await page.goto(path);
      const header = page.locator('.app-header');
      await expect(header.getByRole('link', { name: 'Suvaro, home' })).toBeVisible();
      if (isMobile(info)) {
        // Phones: the page name is said once, by the h1 (desktop tabs legitimately repeat it).
        const h1 = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
        await expect(header.getByText(h1, { exact: true })).toBeHidden();
      }
    }
    await page.locator('.app-header').getByRole('link', { name: 'Suvaro, home' }).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test('hovering a row hides its amount under the actions', async ({ page }, info) => {
    test.skip(isMobile(info), 'Phones swipe instead of hover');
    await newUser(page, 'hover');
    await page.goto('/app/movements');
    await addExpense(page, info, '1234.56', 'Food', 'Big amount');
    await row(page, /Big amount/).hover();
    await expect(page.locator('.row__amount').first()).toBeHidden();
    await page.mouse.move(0, 0);
    await expect(page.locator('.row__amount').first()).toBeVisible();
    // The end of the list is centered in the column.
    const end = await page.getByText('That’s everything.').boundingBox();
    const column = await page.locator('.days').boundingBox();
    expect(
      Math.abs((end?.x ?? 0) + (end?.width ?? 0) / 2 - ((column?.x ?? 0) + (column?.width ?? 0) / 2)),
    ).toBeLessThan(4);
  });
});

test.describe('movements API', () => {
  test('needs a session and refuses bad input', async ({ page, request }) => {
    expect((await request.get('/api/movements')).status()).toBe(401);
    expect((await request.get('/api/search?q=x')).status()).toBe(401);

    await newUser(page, 'api');
    const api = page.request;
    expect((await api.get('/api/movements?evil=1')).status()).toBe(400);
    expect((await api.get('/api/movements?month=2026-13')).status()).toBe(400);
    expect((await api.get('/api/movements?type=both')).status()).toBe(400);
    expect((await api.get('/api/search')).status()).toBe(400);

    const post = (data: unknown) => api.post('/api/movements', { data, headers: ORIGIN });
    const valid = {
      id: '01JC0000000000000000000000',
      type: 'income',
      amountCents: 100,
      categoryId: null,
      date: '2026-11-10',
      note: '',
    };
    expect((await post({ ...valid, amountCents: 0 })).status()).toBe(400);
    expect((await post({ ...valid, amountCents: 1.5 })).status()).toBe(400);
    expect((await post({ ...valid, userId: 'someone-else' })).status()).toBe(400);
    expect((await post({ ...valid, type: 'expense' })).status()).toBe(400);
    expect(
      (await post({ ...valid, type: 'expense', categoryId: '01JC0000000000000000000001' })).status(),
    ).toBe(400);
    expect((await api.post('/api/movements', { form: { id: valid.id }, headers: ORIGIN })).status()).toBe(
      415,
    );
    expect((await api.post('/api/movements', { data: valid })).status()).toBe(403); // no Origin
  });

  test('a user cannot read, edit or delete another user’s movements', async ({ page }, info) => {
    await newUser(page, 'owner');
    await page.goto('/app/movements');
    await addExpense(page, info, '42', 'Health', 'Private note');
    const mine = await (await page.request.get('/api/movements')).json();
    const [movement] = mine.items as { id: string; categoryId: string }[];
    if (!movement) throw new Error('No movement');

    const other = await newContextWithIp(page.context());
    const intruder = await other.newPage();
    await newUser(intruder, 'intruder');
    const api = intruder.request;
    const theirs = await (await api.get('/api/movements')).json();
    expect(theirs.items).toEqual([]);
    expect((await (await api.get(`/api/movements?cat=${movement.categoryId}`)).json()).items).toEqual([]);
    expect((await (await api.get('/api/search?q=Private')).json()).movements).toEqual([]);

    const body = {
      type: 'expense',
      amountCents: 1,
      categoryId: movement.categoryId,
      date: '2026-11-10',
      note: 'x',
    };
    expect((await api.patch(`/api/movements/${movement.id}`, { data: body, headers: ORIGIN })).status()).toBe(
      404,
    );
    expect((await api.delete(`/api/movements/${movement.id}`, { headers: ORIGIN })).status()).toBe(404);
    // Neither their id nor their category can be reused.
    expect(
      (await api.post('/api/movements', { data: { id: movement.id, ...body }, headers: ORIGIN })).status(),
    ).toBe(409);
    expect(
      (
        await api.post('/api/movements', {
          data: { id: '01JC0000000000000000000009', ...body },
          headers: ORIGIN,
        })
      ).status(),
    ).toBe(400);
    await other.close();

    // The owner's movement is untouched.
    const after = await (await page.request.get('/api/movements')).json();
    expect(after.items).toEqual([
      expect.objectContaining({ id: movement.id, amountCents: 4200, note: 'Private note' }),
    ]);
  });
});
