/**
 * Onboarding (`/app/welcome`): three server-rendered steps, no client JS. Each step posts every earlier
 * answer back as hidden fields; nothing is saved until "Start" (or "Skip"), in one transaction.
 *
 * Step 1: currency + language · Step 2: monthly income (+ repeat monthly on day 1) + current savings
 * Step 3: categories (the 12 defaults, all on; untick to remove).
 */
import { eq } from 'drizzle-orm';
import type { Locale, UiKey } from '../i18n';
import { isLocale } from '../i18n';
import { firstOfMonth, firstOfNextMonth, isTimeZone, todayIn } from './dates';
import type { Database } from './db/client';
import { category, movement, profile, recurring } from './db/schema';
import {
  defaultCategories,
  defaultCategoryKeys,
  isDefaultCategoryKey,
  type DefaultCategoryKey,
} from './default-categories';
import { ulid } from './id';
import { parseAmount } from './money';

export const ONBOARDING_STEPS = [1, 2, 3] as const;
export type Step = (typeof ONBOARDING_STEPS)[number];

/** Raw answers as typed (amounts stay strings until the last step so the form can show them back). */
export interface OnboardingState {
  currency: string;
  locale: Locale;
  timezone: string;
  income: string;
  repeatIncome: boolean;
  savings: string;
  categories: DefaultCategoryKey[];
}

export type StepErrors = Partial<Record<'currency' | 'income' | 'savings' | 'categories', UiKey>>;

export function isCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code) && Intl.supportedValuesOf('currency').includes(code);
}

export function initialState(locale: Locale, currency: string, timezone: string): OnboardingState {
  return {
    currency,
    locale,
    timezone,
    income: '',
    repeatIncome: true,
    savings: '',
    categories: [...defaultCategoryKeys],
  };
}

/**
 * Reads the posted form. `categoriesSent` marks that step 3 was on screen: then unticked boxes mean "removed";
 * otherwise every default stays on.
 */
export function readState(form: FormData, fallback: OnboardingState): OnboardingState {
  const text = (name: string, max: number) => {
    const value = form.get(name);
    return typeof value === 'string' ? value.trim().slice(0, max) : undefined;
  };
  const locale = text('locale', 2);
  const timezone = text('timezone', 64);
  const categories = form
    .getAll('categories')
    .filter((value): value is DefaultCategoryKey => typeof value === 'string' && isDefaultCategoryKey(value));

  return {
    currency: text('currency', 3)?.toUpperCase() ?? fallback.currency,
    locale: isLocale(locale) ? locale : fallback.locale,
    timezone: timezone && isTimeZone(timezone) ? timezone : fallback.timezone,
    income: text('income', 32) ?? fallback.income,
    // The form always sends a hidden `off` first; a ticked checkbox adds `on`.
    repeatIncome: form.has('repeatIncome')
      ? form.getAll('repeatIncome').includes('on')
      : fallback.repeatIncome,
    savings: text('savings', 32) ?? fallback.savings,
    categories: form.has('categoriesSent') ? [...new Set(categories)] : fallback.categories,
  };
}

/** Validates the fields of one step. An empty amount is allowed (both amounts are optional). */
export function validateStep(step: Step, state: OnboardingState): StepErrors {
  const errors: StepErrors = {};
  if (step === 1 && !isCurrency(state.currency)) errors.currency = 'onboarding.errorCurrency';
  if (step === 2) {
    if (state.income !== '' && !parseAmount(state.income, state.locale))
      errors.income = 'onboarding.errorAmount';
    if (state.savings !== '' && parseAmount(state.savings, state.locale) === null) {
      errors.savings = 'onboarding.errorAmount';
    }
  }
  if (step === 3 && state.categories.length === 0) errors.categories = 'onboarding.errorCategories';
  return errors;
}

export function validateAll(state: OnboardingState): StepErrors {
  return Object.assign({}, ...ONBOARDING_STEPS.map((step) => validateStep(step, state)));
}

/** Step to show for a validation error, so the user lands on the field to fix. */
export function stepOfError(errors: StepErrors): Step | null {
  if (errors.currency) return 1;
  if (errors.income || errors.savings) return 2;
  if (errors.categories) return 3;
  return null;
}

/**
 * Saves the onboarding in one transaction: profile preferences, chosen categories (in the default order,
 * names in the chosen language), and — when an income was typed — this month's income movement, dated on
 * day 1, plus a monthly recurring income from next month when "repeat" is ticked.
 */
export async function completeOnboarding(
  database: Database,
  userId: string,
  state: OnboardingState,
  categoryName: (key: DefaultCategoryKey) => string,
  now: Date = new Date(),
): Promise<void> {
  const errors = validateAll(state);
  if (Object.keys(errors).length > 0)
    throw new Error(`Invalid onboarding: ${Object.keys(errors).join(', ')}`);

  const incomeCents = state.income === '' ? null : parseAmount(state.income, state.locale);
  const savingsCents = state.savings === '' ? null : parseAmount(state.savings, state.locale);
  const today = todayIn(state.timezone, now);
  const chosen = defaultCategories.filter(({ key }) => state.categories.includes(key));

  await database.transaction(async (tx) => {
    const [current] = await tx
      .select({ done: profile.onboardingDone })
      .from(profile)
      .where(eq(profile.userId, userId));
    if (!current) throw new Error('Profile not found');
    if (current.done) return; // A second submit (double click, back button) changes nothing.

    await tx
      .update(profile)
      .set({
        currency: state.currency,
        locale: state.locale,
        timezone: state.timezone,
        startingSavingsCents: savingsCents,
        onboardingDone: true,
      })
      .where(eq(profile.userId, userId));

    await tx.insert(category).values(
      chosen.map(({ key, icon, color }, index) => ({
        id: ulid(now.getTime()),
        userId,
        name: categoryName(key),
        icon,
        color,
        sort: index,
      })),
    );

    if (incomeCents) {
      let recurringId: string | null = null;
      if (state.repeatIncome) {
        recurringId = ulid(now.getTime());
        await tx.insert(recurring).values({
          id: recurringId,
          userId,
          type: 'income',
          amountCents: incomeCents,
          frequency: 'monthly',
          anchorDate: firstOfMonth(today),
          mode: 'auto',
          nextDate: firstOfNextMonth(today),
        });
      }
      await tx.insert(movement).values({
        id: ulid(now.getTime()),
        userId,
        type: 'income',
        amountCents: incomeCents,
        date: state.repeatIncome ? firstOfMonth(today) : today,
        recurringId,
      });
    }
  });
}
