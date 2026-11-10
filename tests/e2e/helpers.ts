import AxeBuilder from '@axe-core/playwright';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { codeFor } from './outbox';

export const themes = (['light', 'dark'] as const).flatMap((mode) =>
  (['blue', 'red', 'green'] as const).map((accent) => ({ mode, accent })),
);

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

export async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) }))).toEqual([]);
}

/** Runs axe in the 6 theme combinations on the page that is already open. */
export async function expectNoAxeViolationsInThemes(page: Page) {
  for (const { mode, accent } of themes) {
    await page.evaluate(([m, a]) => Object.assign(document.documentElement.dataset, { mode: m, accent: a }), [
      mode,
      accent,
    ] as const);
    await expectNoAxeViolations(page);
  }
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

let counter = 0;

/** A fresh address per test (the database is shared by every test run). */
export function uniqueEmail(label: string): string {
  counter += 1;
  return `${label}-${Date.now().toString(36)}-${process.pid}-${counter}@example.com`;
}

/**
 * Each test gets its own client IP: Better Auth rate-limits sign-in per IP, and parallel tests would
 * otherwise share one bucket.
 */
export function randomIp(): string {
  const n = () => Math.floor(Math.random() * 250) + 1;
  return `10.${n()}.${n()}.${n()}`;
}

/** Adds a virtual WebAuthn authenticator (platform, with user verification) to the page's browser. */
export async function addVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return cdp;
}

/** Types the 6-digit code from the outbox into the code inputs (auto-submits). */
export async function enterCode(page: Page, email: string, nth = 1) {
  const code = await codeFor(email, nth);
  await page.getByRole('textbox', { name: /Digit 1 of 6|Dígito 1 de 6/ }).fill(code);
}

/** Creates an account with an email code and returns on `/app/welcome`. */
export async function signUpWithCode(page: Page, email: string) {
  await page.goto('/sign-in?mode=create');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel(/I’m 18 or older/).check();
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await enterCode(page, email);
  await page.waitForURL('**/app/welcome');
}

/** Signs in with an email code (existing account) and waits for the app. */
export async function signInWithCode(page: Page, email: string, nth: number) {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await enterCode(page, email, nth);
  await page.waitForURL(/\/app(\/|$)/);
}

/** Skips onboarding with the defaults. */
export async function skipOnboarding(page: Page) {
  await page.getByRole('button', { name: 'Skip setup' }).click();
  await page.waitForURL(/\/app$/);
}

export async function newContextWithIp(context: BrowserContext) {
  const browser = context.browser();
  if (!browser) throw new Error('No browser');
  return browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': randomIp() } });
}
