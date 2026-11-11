/** Request validation for goals, contributions and budgets (server only; the islands never import Zod). */
import { z } from 'zod';
import { isIsoDate } from '../dates';
import { ULID_PATTERN } from '../id';
import { MAX_AMOUNT_CENTS } from '../money';
import { GOAL_NAME_MAX, goalIcons } from './model';

const id = z.string().regex(ULID_PATTERN);
const isoDate = z.string().refine(isIsoDate);
const cents = z.number().int().min(1).max(MAX_AMOUNT_CENTS);

const goalFields = {
  name: z
    .string()
    .max(GOAL_NAME_MAX * 2)
    .transform((name) => name.trim())
    .pipe(z.string().min(1).max(GOAL_NAME_MAX)),
  icon: z.enum(goalIcons),
  color: z.number().int().min(1).max(8),
  targetCents: cents,
  deadline: isoDate.nullable(),
  pinned: z.boolean(),
};

/** New goal; the client makes the ULID (optimistic card, one id end to end). */
export const goalCreateInput = z.strictObject({ id, ...goalFields });

/** Edit: every field is sent again (the dialog always has them all). */
export const goalUpdateInput = z.strictObject(goalFields);

export const contributionCreateInput = z.strictObject({ id, amountCents: cents, date: isoDate });
export const contributionUpdateInput = z.strictObject({ amountCents: cents, date: isoDate });

/**
 * Every limit at once ("Edit limits"): the global one (or null) and the categories that have one.
 * Categories left out lose their budget.
 */
export const budgetsInput = z.strictObject({
  globalCents: cents.nullable(),
  categories: z
    .array(z.strictObject({ categoryId: id, limitCents: cents }))
    .max(50)
    .refine((rows) => new Set(rows.map((row) => row.categoryId)).size === rows.length),
});

export type GoalCreateInput = z.infer<typeof goalCreateInput>;
export type GoalUpdateInput = z.infer<typeof goalUpdateInput>;
export type ContributionCreateInput = z.infer<typeof contributionCreateInput>;
export type ContributionUpdateInput = z.infer<typeof contributionUpdateInput>;
export type BudgetsInput = z.infer<typeof budgetsInput>;
