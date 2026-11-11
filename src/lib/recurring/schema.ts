/** Request validation for recurring templates (server only; the islands never import Zod). */
import { z } from 'zod';
import { isIsoDate } from '../dates';
import { ULID_PATTERN } from '../id';
import { MAX_AMOUNT_CENTS } from '../money';
import { NOTE_MAX } from '../movements/model';
import { MAX_INTERVAL_DAYS, MIN_INTERVAL_DAYS } from './schedule';

const id = z.string().regex(ULID_PATTERN);
const isoDate = z.string().refine(isIsoDate);

const fields = {
  type: z.enum(['income', 'expense']),
  amountCents: z.number().int().min(1).max(MAX_AMOUNT_CENTS),
  categoryId: id.nullable(),
  note: z
    .string()
    .max(NOTE_MAX * 2)
    .transform((note) => note.trim())
    .pipe(z.string().max(NOTE_MAX)),
  frequency: z.enum(['weekly', 'monthly', 'yearly', 'every_n_days']),
  intervalDays: z.number().int().min(MIN_INTERVAL_DAYS).max(MAX_INTERVAL_DAYS).nullable(),
  anchorDate: isoDate,
  endDate: isoDate.nullable(),
  mode: z.enum(['auto', 'confirm']),
};

type Fields = z.infer<z.ZodObject<typeof fields>>;

/** Expenses need a category, income never has one; only "every N days" has an interval; end ≥ start. */
function consistent(value: Fields, ctx: z.RefinementCtx): void {
  if (value.type === 'expense' ? value.categoryId === null : value.categoryId !== null) {
    ctx.addIssue({ code: 'custom', message: 'CATEGORY_TYPE_MISMATCH', path: ['categoryId'] });
  }
  if ((value.frequency === 'every_n_days') !== (value.intervalDays !== null)) {
    ctx.addIssue({ code: 'custom', message: 'INTERVAL_MISMATCH', path: ['intervalDays'] });
  }
  if (value.endDate !== null && value.endDate < value.anchorDate) {
    ctx.addIssue({ code: 'custom', message: 'END_BEFORE_START', path: ['endDate'] });
  }
}

/** New template. The client makes the ULID (optimistic rows keep one id end to end). */
export const recurringCreateInput = z.strictObject({ id, ...fields }).superRefine(consistent);

/** Edit: every field is sent again. Changes apply from the next date on; past movements stay. */
export const recurringUpdateInput = z.strictObject(fields).superRefine(consistent);

export type RecurringCreateInput = z.infer<typeof recurringCreateInput>;
export type RecurringUpdateInput = z.infer<typeof recurringUpdateInput>;
