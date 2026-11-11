import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  collectErrors,
  expectNoAxeViolationsInThemes,
  expectNoHorizontalScroll,
  newContextWithIp,
  randomIp,
  signUpWithCode,
  skipOnboarding,
  uniqueEmail,
} from './helpers';

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() });
});

const isMobile = (info: TestInfo) => info.project.name === 'mobile';

async function newUser(page: Page, label: string) {
  await signUpWithCode(page, uniqueEmail(label));
  await skipOnboarding(page);
  await page.goto('/app/plan');
}

/** Phones show one column at a time. */
async function showColumn(page: Page, info: TestInfo, name: 'Goals' | 'Budgets') {
  if (isMobile(info)) await page.getByRole('radio', { name }).check();
}

const toast = (page: Page) => page.locator('[data-toast-text]');

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** A fresh valid ULID-shaped id (the database is shared by every run and project). */
const ulid = () =>
  `01J${Array.from({ length: 23 }, () => CROCKFORD[Math.floor(Math.random() * 32)]).join('')}`;

test.describe('plan', () => {
  test('goals: create, contribute with undo, complete and show on Home', async ({ page }, info) => {
    test.slow();
    const errors = collectErrors(page);
    await newUser(page, 'plan-goals');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan');
    await expect(page.getByText('No goals yet')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);

    await page.getByRole('button', { name: 'Create a goal' }).click();
    const dialog = page.getByRole('dialog', { name: 'New goal' });
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText('Give the goal a name.')).toBeVisible();
    await dialog.getByLabel('Name').fill('Trip');
    await dialog.getByRole('radio', { name: 'Trip' }).check();
    await dialog.getByLabel('Target').fill('500');
    await dialog.getByRole('switch', { name: 'Show on Home' }).check();
    const created = page.waitForResponse(
      (r) => r.url().endsWith('/api/goals') && r.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Save' }).click();
    expect((await created).status()).toBe(201);

    const card = page.locator('[data-goal]');
    await expect(card).toContainText('Trip');
    await expect(card).toContainText('On Home');
    await expect(card).toContainText('of €500.00 · 0 %');
    await expect(card).toContainText('Add a first contribution');

    // Contribute 200, then undo it.
    await card.getByRole('button', { name: 'Contribute' }).click();
    const contribute = page.getByRole('dialog', { name: 'Contribute to Trip' });
    await contribute.getByLabel('Amount').fill('200');
    const added = page.waitForResponse(
      (r) => r.url().includes('/contributions') && r.request().method() === 'POST',
    );
    await contribute.getByRole('button', { name: 'Contribute' }).click();
    await added;
    await expect(toast(page)).toHaveText('€200.00 set aside for Trip');
    await expect(card).toContainText('of €500.00 · 40 %');
    const removed = page.waitForResponse(
      (r) => r.url().includes('/api/contributions/') && r.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: 'Undo' }).click();
    await removed;
    await expect(card).toContainText('of €500.00 · 0 %');

    // The whole target: the goal completes and moves to "Completed".
    await card.getByRole('button', { name: 'Contribute' }).click();
    await contribute.getByLabel('Amount').fill('500');
    await contribute.getByRole('button', { name: 'Contribute' }).click();
    await expect(toast(page)).toHaveText('You reached Trip. Well done!');
    await expect(page.getByText('Completed (1)')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Completed (1)')).toBeVisible();

    // Home shows the pinned goal as reached, and the set-aside lowers what's available.
    await page.goto('/app');
    await expect(page.getByText('Goal reached')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pinned goal' })).toBeVisible();
    await page.goto('/app/plan');
    await showColumn(page, info, 'Goals');
    await page.getByText('Completed (1)').click();
    await expectNoAxeViolationsInThemes(page);
    expect(errors).toEqual([]);
  });

  test('budgets: limits, notice in the editor, one alert per cycle and the Plan dot', async ({
    page,
  }, info) => {
    test.slow();
    const errors = collectErrors(page);
    await newUser(page, 'plan-budgets');
    await showColumn(page, info, 'Budgets');
    await expect(page.getByText('No budgets yet')).toBeVisible();

    await page.getByRole('button', { name: 'Set limits' }).click();
    const limits = page.getByRole('dialog', { name: 'Monthly limits' });
    await limits.getByLabel('All expenses').fill('1000');
    await limits.getByLabel('Limit for Food').fill('100');
    await limits.getByLabel('Limit for Leisure').fill('abc');
    await limits.getByRole('button', { name: 'Save' }).click();
    await expect(limits.getByLabel('Limit for Leisure')).toBeFocused();
    await limits.getByLabel('Limit for Leisure').fill('');
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/budgets') && r.request().method() === 'PUT',
    );
    await limits.getByRole('button', { name: 'Save' }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByText('Limit for all expenses')).toBeVisible();
    await expect(page.getByText('0 % · €0.00 / €100.00')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolationsInThemes(page);

    // The editor warns before saving an expense that takes Food to 85 %.
    await page.goto('/app');
    if (isMobile(info))
      await page.locator('[data-dock]').getByRole('button', { name: 'New movement' }).click();
    else await page.getByRole('button', { name: 'New', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'New movement' });
    await editor.getByLabel('Amount').fill('85');
    await editor.getByRole('radio', { name: 'Food' }).check();
    await expect(editor.getByText('Food would reach 85 % of its budget.')).toBeVisible();
    await editor.getByRole('button', { name: 'Save' }).click();
    // The alert waits for the save toast (with Undo) to end.
    await expect(toast(page)).toContainText('Saved');
    await page.locator('[data-toast-close]').click();
    await expect(toast(page)).toHaveText('Food is at 85 % of its budget.');
    const dot = page.locator('[data-plan-dot]:visible');
    await expect(dot).toHaveCount(1);

    // A reload shows the dot but not the alert again; opening Plan reads it.
    await page.reload();
    await expect(page.locator('[data-plan-dot]:visible')).toHaveCount(1);
    await expect(page.locator('[data-toast]')).toBeHidden();
    await page.goto('/app/plan');
    await expect(page.locator('[data-plan-dot]:visible')).toHaveCount(0);
    await showColumn(page, info, 'Budgets');
    await expect(page.getByText('85 % · €85.00 / €100.00')).toBeVisible();
    await page.goto('/app');
    await expect(page.locator('[data-plan-dot]:visible')).toHaveCount(0);
    await expect(page.locator('[data-toast]')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('keyboard only: create a goal, contribute, and Esc gives focus back', async ({ page }) => {
    await newUser(page, 'plan-keyboard');
    const create = page.getByRole('button', { name: 'Create a goal' });
    await create.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'New goal' });
    await expect(dialog.getByLabel('Name')).toBeFocused();
    await page.keyboard.type('Bike');
    // Name → icon group → color group → target (each radio group is one tab stop; arrows move inside).
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('radio', { name: 'Trip' })).toBeChecked();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('Target')).toBeFocused();
    await page.keyboard.type('300');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    const card = page.locator('[data-goal]');
    await expect(card).toContainText('Bike');

    const contribute = card.getByRole('button', { name: 'Contribute' });
    await contribute.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Contribute to Bike' });
    await expect(sheet.getByLabel('Amount')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(contribute).toBeFocused();

    await page.keyboard.press('Enter');
    await page.keyboard.type('75');
    await page.keyboard.press('Enter');
    await expect(card).toContainText('of €300.00 · 25 %');
  });

  test('another user’s goals, contributions and categories behave as missing', async ({ page, context }) => {
    test.slow();
    await newUser(page, 'plan-owner');
    const goalId = await page.evaluate(async (newId) => {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newId,
          name: 'Mine',
          icon: 'target',
          color: 1,
          targetCents: 1000,
          deadline: null,
          pinned: false,
        }),
      });
      return res.ok ? newId : null;
    }, ulid());
    expect(goalId).not.toBeNull();
    // The owner's Food category (the editor's chips carry the ids).
    const foodId = await page
      .locator('input[name="editor-category"]')
      .first()
      .evaluate((input: HTMLInputElement) => input.value);

    const other = await newContextWithIp(context);
    const intruder = await other.newPage();
    await newUser(intruder, 'plan-intruder');
    const results = await intruder.evaluate(
      async ([id, category, contributionId]) => {
        const send = (method: string, path: string, body?: unknown) =>
          fetch(path, {
            method,
            headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
            ...(body !== undefined && { body: JSON.stringify(body) }),
          }).then((r) => r.status);
        const fields = {
          name: 'Taken',
          icon: 'target',
          color: 1,
          targetCents: 1,
          deadline: null,
          pinned: false,
        };
        return [
          await send('PATCH', `/api/goals/${id}`, fields),
          await send('DELETE', `/api/goals/${id}`),
          await send('POST', `/api/goals/${id}/contributions`, {
            id: contributionId,
            amountCents: 1,
            date: '2026-11-11',
          }),
          await send('PUT', '/api/budgets', {
            globalCents: null,
            categories: [{ categoryId: category, limitCents: 1 }],
          }),
        ];
      },
      [goalId, foodId, ulid()] as const,
    );
    expect(results).toEqual([404, 404, 404, 400]);
    await other.close();
  });
});
