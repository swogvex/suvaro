import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
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

const isMobile = (info: TestInfo) => info.project.name === 'mobile';
const periodLabel = (page: Page) => page.getByTestId('period-label');

async function newUser(page: Page, label: string) {
  await signUpWithCode(page, uniqueEmail(label));
  await skipOnboarding(page);
  await page.goto('/app/stats');
}

/** Signs in as the user seeded before the server started: six months of movements (playwright.config.ts). */
async function seededUser(page: Page, info: TestInfo) {
  const cookie = execFileSync(
    process.execPath,
    ['scripts/seed-user.mjs', `e2e-${info.project.name}`, '--cookie'],
    { encoding: 'utf8' },
  ).trim();
  const [name = '', value = ''] = cookie.split(/=(.*)/s);
  await page
    .context()
    .addCookies([
      { name, value, domain: 'localhost', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
  await page.goto('/app/stats');
}

test.describe('stats', () => {
  test('empty period, then the numbers follow a new expense', async ({ page }, info) => {
    test.slow();
    const errors = collectErrors(page);
    await newUser(page, 'stats');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Stats');
    await expect(page.getByRole('radio', { name: 'Month' })).toBeChecked();
    await expect(page.getByText('Nothing stands out yet.', { exact: false })).toBeVisible();
    await expect(page.getByText('No expenses in this period.')).toBeVisible();
    await expect(page.getByText('No expenses in the last 6 months.')).toBeVisible();
    await expect(page.getByText('Nothing noted in this period yet.')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);

    if (isMobile(info))
      await page.locator('[data-dock]').getByRole('button', { name: 'New movement' }).click();
    else await page.getByRole('button', { name: 'New', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New movement' });
    await dialog.getByLabel('Amount').fill('23.85');
    await dialog.getByRole('radio', { name: 'Food' }).check();
    const reloaded = page.waitForResponse((r) => r.url().includes('/api/stats'));
    await dialog.getByRole('button', { name: 'Save' }).click();
    expect((await reloaded).status()).toBe(200);

    const categories = page.getByTestId('stats-categories');
    await expect(categories).toContainText('You spent most on Food: €23.85.');
    await expect(page.getByTestId('stats-savings')).toContainText('you spent €23.85 more than you earned');
    await expect(
      page.getByRole('img', { name: /^By category\. Food: €23\.85, before €0\.00/ }),
    ).toBeVisible();

    // The chart has a real table with the same numbers.
    await categories.getByRole('button', { name: 'View as table' }).click();
    await expect(categories.getByRole('table')).toBeVisible();
    await expect(categories.getByRole('row', { name: /Food/ })).toContainText('€23.85');

    // The numbers come from the server too (the toast's countdown is gone after a reload).
    await page.reload();
    await expect(categories).toContainText('You spent most on Food: €23.85.');
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);
    expect(errors).toEqual([]);
  });

  test('periods: week, back and forth, today, keyboard and a custom range', async ({ page }) => {
    await newUser(page, 'stats-periods');
    const month = (await periodLabel(page).textContent())?.trim() ?? '';
    await expect(page.getByRole('button', { name: 'Next period' })).toBeDisabled();

    await page.getByRole('radio', { name: 'Week' }).check();
    await expect(page).toHaveURL(/\?period=week$/);
    const week = (await periodLabel(page).textContent())?.trim() ?? '';
    expect(week).not.toBe(month);

    await page.getByRole('button', { name: 'Previous period' }).click();
    await expect(page).toHaveURL(/\?period=week&date=\d{4}-\d{2}-\d{2}$/);
    await expect(periodLabel(page)).not.toHaveText(week);
    // A past week has a way back to today; the URL survives a reload.
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Week' })).toBeChecked();
    await page.getByRole('button', { name: 'Today' }).click();
    await expect(periodLabel(page)).toHaveText(week);

    // ← / → from the keyboard.
    await page.locator('body').press('ArrowLeft');
    await expect(periodLabel(page)).not.toHaveText(week);
    await page.locator('body').press('ArrowRight');
    await expect(periodLabel(page)).toHaveText(week);

    // Custom: a bad range is explained, a good one loads (last year's March, always in the past).
    const year = new Date().getUTCFullYear();
    await page.getByRole('radio', { name: 'Custom' }).check();
    await page.getByLabel('From', { exact: true }).fill(`${year - 1}-03-10`);
    await page.getByLabel('To', { exact: true }).fill(`${year - 1}-03-01`);
    await page.getByRole('button', { name: 'Show' }).click();
    await expect(page.getByRole('alert')).toContainText('Pick a start date');
    await page.getByLabel('To', { exact: true }).fill(`${year - 1}-03-31`);
    await page.getByRole('button', { name: 'Show' }).click();
    await expect(page).toHaveURL(`/app/stats?period=custom&from=${year - 1}-03-10&to=${year - 1}-03-31`);
    // Intl puts thin spaces around the dash.
    await expect(periodLabel(page)).toHaveText(new RegExp(`^10\\s?–\\s?31 Mar ${year - 1}$`));

    // Year keeps the moment shown: the year of that March.
    await page.getByRole('radio', { name: 'Year' }).check();
    await expect(periodLabel(page)).toHaveText(String(year - 1));
  });
});

test.describe('stats with six months', () => {
  test('every block, CSV export and the print layout', async ({ page }, info) => {
    test.slow();
    const errors = collectErrors(page);
    await seededUser(page, info);

    await expect(page.getByTestId('stats-changed').locator('li').first()).toBeVisible();
    await expect(page.getByTestId('stats-categories')).toContainText('You spent most on Housing');
    await expect(page.getByRole('img', { name: /^Spending by month\./ })).toBeVisible();
    await expect(page.getByRole('img', { name: /^Cumulative savings\./ })).toBeVisible();
    const months = page.getByTestId('stats-months');
    await months.getByRole('button', { name: 'View as table' }).click();
    await expect(months.getByRole('table').locator('tbody tr')).toHaveCount(6);
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);

    // CSV: what is shown, with a BOM and one row per movement.
    await page.getByRole('button', { name: 'Export' }).click();
    await expect(page.getByText(/^Exports .+ as you see it$/)).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV (spreadsheet)' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^suvaro-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = await readFile((await file.path()) ?? '', 'utf8');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('﻿Date,Type,Category,Amount,Note');
    expect(lines[1]).toMatch(/^\d{4}-\d{2}-01,Income,Income,1850\.00,Salary$/);
    expect(lines.some((line) => line.includes(',Expense,Housing,850.00,Rent'))).toBe(true);

    // PDF: on paper only the report shows, and it fits an A4 page (182 mm wide inside the margins).
    // The report is mounted only while printing; emulating print media does not fire `beforeprint`.
    await expect(page.locator('.print-report')).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    await page.setViewportSize({ width: 688, height: 1000 });
    await expect(page.locator('.stats')).toBeHidden();
    await expect(page.getByRole('banner')).toBeHidden();
    const report = page.locator('.print-report');
    await expect(report).toBeVisible();
    await expect(report.getByRole('heading', { name: 'Movements' })).toBeVisible();
    const overflow = await report.evaluate((element) =>
      Math.max(
        ...[element, ...element.querySelectorAll('table')].map((el) => el.scrollWidth - el.clientWidth),
      ),
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
});

test.describe('stats API', () => {
  test('needs a session and refuses bad or future periods', async ({ page }) => {
    expect((await page.request.get('/api/stats')).status()).toBe(401);

    await newUser(page, 'stats-api');
    const ok = await page.request.get('/api/stats');
    expect(ok.status()).toBe(200);
    const body = (await ok.json()) as { period: { kind: string; start: string }; movements: unknown[] };
    expect(body.period.kind).toBe('month');
    expect(body.movements).toEqual([]);

    const year = Number(body.period.start.slice(0, 4));
    expect((await page.request.get(`/api/stats?period=year&date=${year + 1}-06-01`)).status()).toBe(400);
    expect((await page.request.get('/api/stats?period=day')).status()).toBe(400);
    expect((await page.request.get('/api/stats?period=custom&from=2024-01-01&to=2026-01-01')).status()).toBe(
      400,
    );
    expect((await page.request.get('/api/stats?period=week&x=1')).status()).toBe(400);
    expect((await page.request.get(`/api/stats?period=year&date=${year - 1}-06-01`)).status()).toBe(200);
  });
});
