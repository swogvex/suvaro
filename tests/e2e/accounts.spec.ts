import { expect, test } from '@playwright/test';
import {
  addVirtualAuthenticator,
  collectErrors,
  enterCode,
  expectNoAxeViolations,
  expectNoAxeViolationsInThemes,
  expectNoHorizontalScroll,
  newContextWithIp,
  randomIp,
  signInWithCode,
  signUpWithCode,
  skipOnboarding,
  uniqueEmail,
} from './helpers';
import { codeFor, emailsTo } from './outbox';

// A new client IP per test: Better Auth rate-limits code emails per IP (3 a minute).
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() });
});

test.describe('guarded routes', () => {
  for (const path of [
    '/app',
    '/app/welcome',
    '/app/movements',
    '/app/movements/calendar',
    '/app/stats',
    '/app/plan',
    '/app/settings',
    '/app/settings/security',
    '/app/verify-email',
  ]) {
    test(`${path} is not reachable without a session`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(303);
      expect(new URL(response.headers()['location'] ?? '', 'http://x').pathname).toBe('/sign-in');
    });
  }

  test('own API answers 401 without a session and 403 from another origin', async ({ request }) => {
    const sameOrigin = await request.post('/api/sessions', {
      form: { action: 'sign-out' },
      headers: { Origin: 'http://localhost:4321' },
    });
    expect(sameOrigin.status()).toBe(401);
    // No Origin at all on a write is refused too (browsers always send it).
    expect((await request.post('/api/sessions', { form: { action: 'sign-out' } })).status()).toBe(403);
    const foreign = await request.post('/api/sessions', {
      form: { action: 'sign-out' },
      headers: { Origin: 'https://evil.example' },
    });
    expect(foreign.status()).toBe(403);
  });
});

test.describe('sign-in page', () => {
  for (const { path, lang, heading } of [
    { path: '/sign-in', lang: 'en', heading: 'Back to your numbers' },
    { path: '/es/acceso', lang: 'es', heading: 'Vuelve a tus números' },
  ]) {
    test(`${path} renders in ${lang}, noindex, accessible in every theme`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolationsInThemes(page);
      expect(errors).toEqual([]);
    });
  }

  test('create mode asks for the 18+ box before sending a code', async ({ page }) => {
    await page.goto('/sign-in?mode=create');
    await page.getByLabel('Email', { exact: true }).fill(uniqueEmail('age'));
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await expect(page.getByRole('alert')).toContainText('18 or older');
    await expect(page.getByLabel(/I’m 18 or older/)).toHaveAttribute('aria-invalid', 'true');
    await expectNoAxeViolations(page);
  });

  test('the card keeps its size across modes and errors', async ({ page }) => {
    await page.goto('/sign-in');
    const panel = page.locator('.panel');
    const height = async () => Math.round((await panel.boundingBox())?.height ?? 0);
    const first = await height();
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await height()).toBe(first);
    await page.goto('/sign-in?mode=create');
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await height()).toBe(first);
  });

  test('keyboard only: create an account with a code and finish onboarding', async ({ page }) => {
    const email = uniqueEmail('keyboard');
    await page.goto('/sign-in?mode=create');
    const emailInput = page.getByLabel('Email', { exact: true });
    await expect(page.getByRole('button', { name: 'Send me a code' })).toBeEnabled();

    await emailInput.focus();
    await page.keyboard.type(email);
    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/I’m 18 or older/)).toBeFocused();
    await page.keyboard.press('Space');
    await emailInput.focus();
    await page.keyboard.press('Enter'); // the form's submit: "Send me a code"

    // Focus moves to the first digit, so the code can be typed straight away.
    const firstDigit = page.getByRole('textbox', { name: 'Digit 1 of 6' });
    await expect(firstDigit).toBeFocused();
    await page.keyboard.type(await codeFor(email));
    await page.waitForURL('**/app/welcome');

    // Onboarding: Enter in a text field submits the step (the default button is "Next", not "Back").
    await expect(page.locator('[aria-current="step"]')).toContainText('Currency');
    await page.getByRole('button', { name: 'Next' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[aria-current="step"]')).toContainText('Income');
    await page.getByLabel('Monthly income').focus();
    await page.keyboard.type('1200');
    await page.keyboard.press('Enter');
    await expect(page.locator('[aria-current="step"]')).toContainText('Categories');
    await page.getByLabel('Food').focus();
    await page.keyboard.press('Space');
    await expect(page.getByLabel('Food')).not.toBeChecked();
    await page.getByRole('button', { name: 'Start' }).focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/app$/);
  });

  test('rejects an invalid email without calling the server', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('not-an-email');
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await expect(page.getByRole('alert')).toContainText('valid email');
  });

  test('a wrong code explains the fix and the code step is accessible', async ({ page }) => {
    const email = uniqueEmail('wrong');
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Send me a code' }).click();
    const right = await codeFor(email);
    const wrong = right === '000000' ? '111111' : '000000';
    await page.getByRole('textbox', { name: 'Digit 1 of 6' }).fill(wrong);
    await expect(page.getByRole('alert')).toContainText('That code isn’t right');
    await expect(page.getByText(/Resend in 0:\d\d/)).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('signing in with a code for a new address offers to create the account', async ({ page }) => {
    const email = uniqueEmail('new');
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await enterCode(page, email);
    await expect(page.getByRole('alert')).toContainText('no account with this email yet');
    await expect(page.getByRole('radio', { name: 'Create account' })).toBeChecked();

    await page.getByLabel(/I’m 18 or older/).check();
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await enterCode(page, email, 2);
    await page.waitForURL('**/app/welcome');
  });
});

test.describe('accounts', () => {
  test('sign up with a passkey, onboard, sign out and sign back in with the passkey', async ({ page }) => {
    test.slow(); // full flow plus axe in 6 themes on two pages
    const errors = collectErrors(page);
    await addVirtualAuthenticator(page);
    const email = uniqueEmail('passkey');

    await page.goto('/sign-in?mode=create');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel(/I’m 18 or older/).check();
    await page.getByRole('button', { name: 'Create account with passkey' }).click();
    await page.waitForURL('**/app/welcome');

    // Onboarding: step chips, validation, back/next, then Start.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome to Suvaro');
    await expect(page.locator('[aria-current="step"]')).toContainText('Currency');
    await expectNoAxeViolationsInThemes(page);
    await page.getByLabel('Currency').selectOption('USD');
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.locator('[aria-current="step"]')).toContainText('Income');
    await page.getByLabel('Monthly income').fill('-20');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByLabel('Monthly income')).toHaveAttribute('aria-invalid', 'true');
    await expectNoAxeViolations(page);
    await page.getByLabel('Monthly income').fill('1,850.00');
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.locator('[aria-current="step"]')).toContainText('Categories');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByLabel('Monthly income')).toHaveValue('1,850.00');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Pets').uncheck();
    await expectNoAxeViolationsInThemes(page);
    await page.getByRole('button', { name: 'Start' }).click();
    await page.waitForURL(/\/app$/);

    // Home (with the income from onboarding) + the "confirm your email" banner (passkey accounts start
    // unconfirmed).
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hi');
    await expect(page.getByTestId('available')).toHaveText('$1,850.00');
    await expect(page.getByRole('link', { name: 'Confirm email' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);

    // Onboarding is done: going back to it lands on Home.
    await page.goto('/app/welcome');
    await expect(page).toHaveURL(/\/app$/);

    await page.goto('/app/settings/security');
    await expect(page.getByRole('heading', { name: 'Passkeys' })).toBeVisible();
    await expect(page.locator('main').getByText('Added')).toHaveCount(1);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL('**/sign-in');

    expect((await page.request.get('/app', { maxRedirects: 0 })).status()).toBe(303);

    // The virtual authenticator may answer the autofill (conditional UI) request on its own; either that
    // or the button signs in with the passkey.
    const signedIn = page.waitForURL(/\/app$/);
    await Promise.any([signedIn, page.getByRole('button', { name: 'Sign in with passkey' }).click()]);
    await signedIn;
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hi');
    expect(errors).toEqual([]);
  });

  test('confirm the email of a passkey account with a code', async ({ page }) => {
    await addVirtualAuthenticator(page);
    const email = uniqueEmail('verify');
    await page.goto('/sign-in?mode=create');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel(/I’m 18 or older/).check();
    await page.getByRole('button', { name: 'Create account with passkey' }).click();
    await page.waitForURL('**/app/welcome');
    await skipOnboarding(page);

    await page.getByRole('link', { name: 'Confirm email' }).click();
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await expect(page.getByText(`Code sent to ${email}`)).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByLabel('Code', { exact: true }).fill(await codeFor(email));
    await page.getByRole('button', { name: 'Confirm email' }).click();
    await page.waitForURL(/\/app\?done=email-verified$/);
    await expect(page.getByRole('status').filter({ hasText: 'Email confirmed.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Confirm email' })).toHaveCount(0);
  });

  test('a second account with the same email is refused', async ({ page }) => {
    const email = uniqueEmail('dupe');
    await signUpWithCode(page, email);
    await skipOnboarding(page);

    const other = await newContextWithIp(page.context());
    const otherPage = await other.newPage();
    await addVirtualAuthenticator(otherPage);
    await otherPage.goto('/sign-in?mode=create');
    await otherPage.getByLabel('Email', { exact: true }).fill(email);
    await otherPage.getByLabel(/I’m 18 or older/).check();
    await otherPage.getByRole('button', { name: 'Create account with passkey' }).click();
    await expect(otherPage.getByRole('alert')).toContainText('already an account');
    await other.close();
  });

  test('sign in with a code, list sessions, sign out other devices and sign out', async ({ page }) => {
    const email = uniqueEmail('sessions');
    await signUpWithCode(page, email);
    await skipOnboarding(page);

    // A second device signs in with a code.
    const other = await newContextWithIp(page.context());
    const otherPage = await other.newPage();
    await signInWithCode(otherPage, email, 2);
    await expect(otherPage).toHaveURL(/\/app$/);

    await page.goto('/app/settings/security');
    const sessions = page.locator('[data-sessions] > li');
    await expect(sessions).toHaveCount(2);
    await expect(sessions.first()).toContainText('This device');
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);

    await page.getByRole('button', { name: 'Sign out everywhere else' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Signed out everywhere else.' })).toBeVisible();
    await expect(sessions).toHaveCount(1);

    await otherPage.goto('/app');
    await expect(otherPage).toHaveURL(/\/sign-in$/);
    await other.close();

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL('**/sign-in');
    const response = await page.request.get('/app', { maxRedirects: 0 });
    expect(response.status()).toBe(303);
  });

  test('a user cannot sign out another user’s session', async ({ page }) => {
    const victimEmail = uniqueEmail('victim');
    const victim = await newContextWithIp(page.context());
    const victimPage = await victim.newPage();
    await signUpWithCode(victimPage, victimEmail);
    await skipOnboarding(victimPage);
    await victimPage.goto('/app/settings/security');

    // The victim has a second device; the test reads that session id from the victim's own page and the
    // attacker (another account) tries to sign it out.
    const attackerEmail = uniqueEmail('attacker');
    await signUpWithCode(page, attackerEmail);
    await skipOnboarding(page);
    const victimSecond = await newContextWithIp(page.context());
    const victimSecondPage = await victimSecond.newPage();
    await signInWithCode(victimSecondPage, victimEmail, 2);
    await victimPage.reload();
    const victimSessionId = await victimPage
      .locator('[data-sessions] input[name="id"]')
      .first()
      .getAttribute('value');
    expect(victimSessionId).toBeTruthy();

    const response = await page.request.post('/api/sessions', {
      form: { action: 'revoke', id: victimSessionId ?? '' },
      headers: { Origin: new URL(page.url()).origin },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(404);

    await victimSecondPage.goto('/app');
    await expect(victimSecondPage).toHaveURL(/\/app$/);
    await victim.close();
    await victimSecond.close();
  });
});

test.describe('app shell', () => {
  test('dock on phones, header tabs on desktop, theme toggle and offline banner', async ({ page }, info) => {
    const email = uniqueEmail('shell');
    await signUpWithCode(page, email);
    await skipOnboarding(page);

    const dock = page.locator('[data-dock]');
    const tabs = page.locator('.app-header__nav');
    if (info.project.name === 'mobile') {
      await expect(dock).toBeVisible();
      await expect(tabs).toBeHidden();
      await expect(dock.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
      const box = await dock.boundingBox();
      const viewport = page.viewportSize();
      expect(box && viewport && box.y + box.height).toBeLessThanOrEqual((viewport?.height ?? 0) - 12);

      await page.emulateMedia({ colorScheme: 'light' });
      await page.reload();
      await dock.getByRole('button', { name: 'Switch to dark theme' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
      await expect(dock.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();

      await dock.getByRole('link', { name: 'Stats' }).click();
      await expect(page).toHaveURL(/\/app\/stats$/);
      await expect(dock.getByRole('link', { name: 'Stats' })).toHaveAttribute('aria-current', 'page');
    } else {
      await expect(dock).toBeHidden();
      await expect(tabs.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
      await tabs.getByRole('link', { name: 'Plan' }).click();
      await expect(page).toHaveURL(/\/app\/plan$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan');
    }

    for (const path of ['/app/movements', '/app/stats', '/app/plan']) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    }

    await page.context().setOffline(true);
    await expect(page.getByText('You’re offline.')).toBeVisible();
    await page.context().setOffline(false);
    await expect(page.getByText('You’re offline.')).toBeHidden();
  });

  test('the app follows the profile language', async ({ page }) => {
    const email = uniqueEmail('es');
    await page.goto('/es/acceso?mode=create');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel(/Tengo 18 años o más/).check();
    await page.getByRole('button', { name: 'Envíame un código' }).click();
    await enterCode(page, email);
    await page.waitForURL('**/app/welcome');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Te damos la bienvenida a Suvaro');
    await page.getByRole('button', { name: 'Saltar configuración' }).click();
    await page.waitForURL(/\/app$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola');
    const [codeEmail] = await emailsTo(email);
    expect(codeEmail?.subject).toMatch(/^Tu código de Suvaro: \d{6}$/);
  });
});
