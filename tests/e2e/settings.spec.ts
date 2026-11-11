import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  addVirtualAuthenticator,
  collectErrors,
  expectNoAxeViolations,
  expectNoAxeViolationsInThemes,
  expectNoHorizontalScroll,
  newContextWithIp,
  randomIp,
  signInWithCode,
  signUpWithCode,
  skipOnboarding,
  uniqueEmail,
  waitForIslands,
} from './helpers';
import { ulid } from '../../src/lib/id';

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() });
});

const isMobile = (info: TestInfo) => info.project.name === 'mobile';

async function newUser(page: Page, label: string): Promise<string> {
  const email = uniqueEmail(label);
  await signUpWithCode(page, email);
  await skipOnboarding(page);
  return email;
}

/** The page's script is a deferred module: wait for it before clicking, like islands. */
async function openAppearance(page: Page) {
  await page.goto('/app/settings/appearance');
  await waitForIslands(page);
  await page.waitForLoadState('load');
}

const html = (page: Page) => page.locator('html');
/** The status badge of the chosen card in a theme group (the others are hidden). */
const status = (group: Locator) => group.locator('[data-status]:not([hidden])');

test.describe('settings', () => {
  test('the avatar opens the list of sections; each section links back to it', async ({ page }, info) => {
    const errors = collectErrors(page);
    await newUser(page, 'settings-list');
    await page.getByRole('link', { name: 'Settings' }).first().click();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);

    await page.getByRole('link', { name: /Appearance/ }).click();
    await expect(page).toHaveURL(/\/app\/settings\/appearance$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Appearance');

    if (isMobile(info)) {
      await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeHidden();
      await page.getByRole('link', { name: 'All settings' }).click();
      await expect(page).toHaveURL(/\/app\/settings$/);
    } else {
      const nav = page.getByRole('navigation', { name: 'Settings sections' });
      await expect(nav.getByRole('link', { name: 'Appearance' })).toHaveAttribute('aria-current', 'page');
      await nav.getByRole('link', { name: 'Security' }).click();
      await expect(page).toHaveURL(/\/app\/settings\/security$/);
      await expect(nav.getByRole('link', { name: 'Security' })).toHaveAttribute('aria-current', 'page');
    }
    expect(errors).toEqual([]);
  });

  test('the theme applies at once, is saved and follows the user to another device', async ({ page }) => {
    test.slow(); // sign-up, sign-in on a second device and axe in 6 themes
    const errors = collectErrors(page);
    await page.emulateMedia({ colorScheme: 'light' });
    const email = await newUser(page, 'appearance');
    await openAppearance(page);

    // Default: system mode, blue day and night.
    await expect(page.getByRole('radio', { name: 'System' })).toBeChecked();
    await expect(
      page.getByText('Your system is in light mode now, so you see your day theme.'),
    ).toBeVisible();
    const day = page.getByRole('group', { name: 'Day theme' });
    const night = page.getByRole('group', { name: 'Night theme' });
    await expect(day.getByRole('radio', { name: /Blue/ })).toBeChecked();
    await expect(status(day)).toHaveText('Active now');
    await expect(status(night)).toHaveText('Used in dark mode');
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // Day theme red: the page turns red at once.
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/profile') && r.request().method() === 'PATCH',
    );
    await day.getByRole('radio', { name: /Red/ }).check();
    expect((await saved).status()).toBe(200);
    await expect(html(page)).toHaveAttribute('data-accent', 'red');

    // The OS turns dark: system mode follows it and shows the night theme.
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html(page)).toHaveAttribute('data-mode', 'dark');
    await expect(html(page)).toHaveAttribute('data-accent', 'blue');
    await expect(
      page.getByText('Your system is in dark mode now, so you see your night theme.'),
    ).toBeVisible();
    await expect(status(night)).toHaveText('Active now');

    // Dark mode with a green night theme.
    await page.getByRole('radio', { name: 'Dark' }).check();
    const savedNight = page.waitForResponse((r) => r.url().endsWith('/api/profile'));
    await night.getByRole('radio', { name: /Green/ }).check();
    expect((await savedNight).status()).toBe(200);
    await expect(html(page)).toHaveAttribute('data-accent', 'green');
    await expect(page.getByText('Always dark, so you always see your night theme.')).toBeVisible();

    // Reload with a light OS: the saved choice wins, painted before the page's scripts run.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload({ waitUntil: 'commit' });
    await page.waitForSelector('html[data-mode]', { state: 'attached' });
    expect(await page.evaluate(() => ({ ...document.documentElement.dataset }))).toMatchObject({
      pref: 'dark',
      mode: 'dark',
      accent: 'green',
    });

    // Another device (fresh browser, no localStorage) gets the same theme from the profile.
    const other = await newContextWithIp(page.context());
    const otherPage = await other.newPage();
    await otherPage.emulateMedia({ colorScheme: 'light' });
    await signInWithCode(otherPage, email, 2);
    await expect(otherPage).toHaveURL(/\/app$/);
    await expect(html(otherPage)).toHaveAttribute('data-mode', 'dark');
    await expect(html(otherPage)).toHaveAttribute('data-accent', 'green');
    await other.close();
    expect(errors).toEqual([]);
  });

  test('the light/dark toggle leaves system mode and is saved too', async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await newUser(page, 'toggle');
    const toggleArea = isMobile(info) ? page.locator('[data-dock]') : page.locator('.app-header');
    await waitForIslands(page);
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/profile'));
    await toggleArea.getByRole('button', { name: 'Switch to dark theme' }).click();
    expect((await saved).status()).toBe(200);
    await expect(html(page)).toHaveAttribute('data-mode', 'dark');

    await openAppearance(page);
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
    await expect(html(page)).toHaveAttribute('data-pref', 'dark');
    await expectNoAxeViolations(page);
  });

  test('the profile API refuses bad input, other origins and no session', async ({ page, request }) => {
    await newUser(page, 'profile-api');
    const patch = (data: unknown, origin = 'http://localhost:4321') =>
      page.request.fetch('/api/profile', { method: 'PATCH', data, headers: { Origin: origin } });
    expect((await patch({ mode: 'light' })).status()).toBe(200);
    expect((await patch({})).status()).toBe(400);
    expect((await patch({ mode: 'sepia' })).status()).toBe(400);
    expect((await patch({ mode: 'dark', userId: 'someone-else' })).status()).toBe(400);
    expect((await patch({ mode: 'dark' }, 'https://evil.example')).status()).toBe(403);
    const anonymous = await request.fetch('/api/profile', {
      method: 'PATCH',
      data: { mode: 'dark' },
      headers: { Origin: 'http://localhost:4321' },
    });
    expect(anonymous.status()).toBe(401);
  });

  test('profile: the avatar is saved on click and the header follows; the name is saved', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await newUser(page, 'profile');
    await page.goto('/app/settings/profile');
    await waitForIslands(page);
    await page.waitForLoadState('load');
    const header = page.locator('.app-header__avatar .avatar');
    await expect(header).toHaveAttribute('data-avatar', 'leaf');
    await expect(page.getByRole('button', { name: 'Leaf' })).toHaveAttribute('aria-pressed', 'true');

    const saved = page.waitForResponse((r) => r.url().endsWith('/api/profile'));
    await page.getByRole('button', { name: 'Moon' }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Moon' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Leaf' })).toHaveAttribute('aria-pressed', 'false');
    await expect(header).toHaveAttribute('data-avatar', 'moon');

    await page.getByLabel('Name', { exact: true }).fill('  Ada   Lovelace ');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ada Lovelace');
    await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('readonly', '');

    await page.reload();
    await expect(page.locator('.app-header__avatar .avatar')).toHaveAttribute('data-avatar', 'moon');
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ada Lovelace');
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);
    expect(errors).toEqual([]);
  });

  test('preferences: currency note, saved changes and a language switch', async ({ page }) => {
    const errors = collectErrors(page);
    await newUser(page, 'prefs');
    await page.goto('/app/settings/preferences');
    await waitForIslands(page);
    await page.waitForLoadState('load');
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);

    const note = page.getByText('This doesn’t convert your amounts', { exact: false });
    await expect(note).toBeHidden();
    await page.getByLabel('Currency').selectOption('USD');
    await expect(note).toBeVisible();
    await page.getByRole('radio', { name: 'Sunday' }).check();
    await page.getByLabel('Your month starts on day').selectOption('25');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveURL(/\/app\/settings\/preferences\?done=saved$/);
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    await expect(page.getByLabel('Currency')).toHaveValue('USD');
    await expect(page.getByRole('radio', { name: 'Sunday' })).toBeChecked();
    await expect(page.getByLabel('Your month starts on day')).toHaveValue('25');

    await waitForIslands(page);
    await page.getByRole('radio', { name: 'Español' }).check();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preferencias');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByRole('status').filter({ hasText: 'Guardado.' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the profile API checks every field', async ({ page }) => {
    await newUser(page, 'profile-fields');
    const patch = (data: unknown) =>
      page.request.fetch('/api/profile', {
        method: 'PATCH',
        data,
        headers: { Origin: 'http://localhost:4321' },
      });
    const ok = await patch({
      displayName: 'Ana',
      avatar: 'fern',
      currency: 'GBP',
      weekStart: 7,
      cycleStartDay: 28,
    });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).profile).toMatchObject({ displayName: 'Ana', avatar: 'fern', currency: 'GBP' });
    for (const bad of [
      { displayName: 'x'.repeat(41) },
      { avatar: 'cat' },
      { currency: 'ZZZ' },
      { currency: 'eur' },
      { locale: 'fr' },
      { weekStart: 3 },
      { cycleStartDay: 29 },
      { cycleStartDay: 0 },
    ]) {
      expect((await patch(bad)).status(), JSON.stringify(bad)).toBe(400);
    }
  });
});

test.describe('settings › categories', () => {
  test('create, edit, a duplicate name and delete moving the movements', async ({ page }) => {
    test.slow(); // sign-up, several saves and axe in 6 themes on the page and the dialog
    const errors = collectErrors(page);
    await newUser(page, 'categories');
    await page.goto('/app/settings/categories');
    await waitForIslands(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Categories');
    await expect(page.getByText('12 of 50. Income has no category.')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);

    // New category.
    await page.getByRole('button', { name: 'New category' }).click();
    const dialog = page.getByRole('dialog', { name: 'New category' });
    await expect(dialog.getByLabel('Name')).toBeFocused();
    await dialog.getByLabel('Name').fill('Coffee');
    await dialog.getByText('Coffee', { exact: true }).locator('..').locator('input').check();
    await dialog.getByRole('radio', { name: 'Butter' }).check();
    await expectNoAxeViolations(page);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Category added.' })).toBeVisible();
    await expect(page.getByRole('button', { name: editName('Coffee') })).toBeVisible();
    await expect(page.getByText('13 of 50. Income has no category.')).toBeVisible();

    // A name already used stays in the dialog with an error.
    await page.getByRole('button', { name: editName('Coffee') }).click();
    const edit = page.getByRole('dialog', { name: 'Edit category' });
    await edit.getByLabel('Name').fill('food');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit.getByText('You already have a category with that name.')).toBeVisible();
    await edit.getByLabel('Name').fill('Coffee & tea');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: editName('Coffee & tea') })).toBeVisible();

    // Esc closes and returns focus.
    await page.getByRole('button', { name: editName('Coffee & tea') }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: editName('Coffee & tea') })).toBeFocused();

    // An expense in Food, then delete Food moving it to Coffee & tea.
    const saved = await page.request.post('/api/movements', {
      headers: { Origin: 'http://localhost:4321' },
      data: {
        id: ulid(),
        type: 'expense',
        amountCents: 450,
        categoryId: await categoryId(page, 'Food'),
        date: new Date().toISOString().slice(0, 10),
        note: '',
      },
    });
    expect(saved.status()).toBe(201);
    await page.reload();
    await waitForIslands(page);
    await page.getByRole('button', { name: editName('Food') }).click();
    await page.getByRole('dialog', { name: 'Edit category' }).getByRole('button', { name: 'Delete' }).click();
    const remove = page.getByRole('dialog', { name: 'Delete Food?' });
    await expect(remove.getByText('1 movements use it.')).toBeVisible();
    await remove
      .getByLabel('Move its movements and recurring ones to')
      .selectOption({ label: 'Coffee & tea' });
    await expectNoAxeViolations(page);
    await remove.getByRole('button', { name: 'Delete' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Food deleted. Its movements are now in Coffee & tea.' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: editName('Food') })).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole('button', { name: editName('Coffee & tea') }).getByText('1 this month'),
    ).toBeVisible();
    // The duplicate name answers 409 on purpose; the browser logs it.
    expect(errors.filter((text) => !text.includes('409'))).toEqual([]);
  });

  test('another user’s category answers 404 and bad input 400', async ({ page }) => {
    await newUser(page, 'cat-owner');
    const id = await categoryId(page, 'Food');
    const other = await newContextWithIp(page.context());
    const otherPage = await other.newPage();
    await newUser(otherPage, 'cat-intruder');
    const h = { Origin: 'http://localhost:4321' };
    const fields = { name: 'Mine now', icon: 'dots', color: 1 };
    expect(
      (
        await otherPage.request.fetch(`/api/categories/${id}`, { method: 'PATCH', data: fields, headers: h })
      ).status(),
    ).toBe(404);
    expect(
      (
        await otherPage.request.fetch(`/api/categories/${id}`, {
          method: 'DELETE',
          data: { moveTo: null },
          headers: h,
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.post('/api/categories', {
          data: { id: ulid(), name: 'X', icon: 'rocket', color: 1 },
          headers: h,
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.fetch(`/api/categories/${id}`, { method: 'DELETE', data: {}, headers: h })
      ).status(),
    ).toBe(400);
    await other.close();
  });
});

/** A category row's accessible name: "Edit" (hidden), the name, then "n this month". */
const editName = (name: string) => new RegExp(`^Edit ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d`);

/** The id of one of the signed-in user's categories, read from the Categories page. */
async function categoryId(page: Page, name: string): Promise<string> {
  await page.goto('/app/settings/categories');
  const id = await page.getByRole('button', { name: editName(name) }).getAttribute('data-id');
  if (!id) throw new Error(`No category ${name}`);
  return id;
}

/** The passkey list island is hydrated ("Add a passkey" below it hydrates only when scrolled to). */
async function passkeyListReady(page: Page) {
  await expect(page.locator('astro-island[component-url*="PasskeyList"]:not([ssr])')).toHaveCount(1);
}

test.describe('settings › passkeys', () => {
  test('unconfirmed account: rename works, the only passkey stays', async ({ page }) => {
    const errors = collectErrors(page);
    await addVirtualAuthenticator(page);
    await page.goto('/sign-in?mode=create');
    await page.getByLabel('Email', { exact: true }).fill(uniqueEmail('pk-locked'));
    await page.getByLabel(/I’m 18 or older/).check();
    await page.getByRole('button', { name: 'Create account with passkey' }).click();
    await page.waitForURL('**/app/welcome');
    await skipOnboarding(page);

    await page.goto('/app/settings/security');
    await passkeyListReady(page);
    await expect(page.getByRole('button', { name: /^Remove/ })).toBeDisabled();
    await expect(page.getByText('Confirm your email before removing your only passkey.')).toBeVisible();

    await page.getByRole('button', { name: /^Rename/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename passkey' });
    await dialog.getByLabel('Name', { exact: true }).fill('  Work   laptop ');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Passkey renamed.' })).toBeVisible();
    await page.reload();
    await expect(page.locator('main').getByText('Work laptop', { exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);

    // The server keeps it too, and Better Auth's own update/delete endpoints are closed.
    const id = await page.evaluate(async () => {
      const response = await fetch('/api/auth/passkey/list-user-passkeys');
      return ((await response.json()) as { id: string }[])[0]?.id ?? '';
    });
    const h = { Origin: 'http://localhost:4321' };
    const del = (path: string) => page.request.fetch(path, { method: 'DELETE', headers: h });
    expect((await del(`/api/passkeys/${id}`)).status()).toBe(409);
    expect((await del('/api/passkeys/not-mine')).status()).toBe(404);
    expect(
      (await page.request.post('/api/auth/passkey/delete-passkey', { data: { id }, headers: h })).status(),
    ).toBe(404);
    expect(
      (
        await page.request.post('/api/auth/passkey/update-passkey', { data: { id, name: 'x' }, headers: h })
      ).status(),
    ).toBe(404);
    expect(errors).toEqual([]);
  });

  test('confirmed account: add a passkey, then remove it after confirming', async ({ page }) => {
    await newUser(page, 'pk-remove');
    await addVirtualAuthenticator(page);
    await page.goto('/app/settings/security');
    await waitForIslands(page);
    await page.getByRole('button', { name: 'Add a passkey' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Passkey added.' })).toBeVisible();
    await waitForIslands(page);

    await page.getByRole('button', { name: /^Remove/ }).click();
    const dialog = page.getByRole('dialog', { name: /^Remove/ });
    await expect(dialog.getByText('It’s your only passkey', { exact: false })).toBeVisible();
    await expectNoAxeViolations(page);
    await dialog.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Passkey removed.' })).toBeVisible();
    await expect(page.getByText('No passkeys yet.', { exact: false })).toBeVisible();
    await page.reload();
    await expect(page.getByText('No passkeys yet.', { exact: false })).toBeVisible();
  });
});
