import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
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
