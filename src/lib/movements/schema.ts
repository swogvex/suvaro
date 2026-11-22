/** Request validation for movements (server only; the islands never import Zod). */
import { z } from 'zod';
import { isIsoDate } from '../dates';
import { ULID_PATTERN } from '../id';
import { MAX_AMOUNT_CENTS } from '../money';
import { MAX_INTERVAL_DAYS, MIN_INTERVAL_DAYS } from '../recurring/schedule';
import { NOTE_MAX, type MovementType } from './model';

const id = z.string().regex(ULID_PATTERN);
const isoDate = z.string().refine(isIsoDate);

const fields = {
  type: z.enum(['income', 'expense']),
  amountCents: z.number().int().min(1).max(MAX_AMOUNT_CENTS),
  categoryId: id.nullable(),
  date: isoDate,
  note: z
    .string()
    .max(NOTE_MAX * 2)
    .transform((note) => note.trim())
    .pipe(z.string().max(NOTE_MAX)),
};

/** Expenses need a category; income never has one. */
function categoryMatchesType(value: { type: MovementType; categoryId: string | null }): boolean {
  return value.type === 'expense' ? value.categoryId !== null : value.categoryId === null;
}

const categoryRule = { message: 'CATEGORY_TYPE_MISMATCH', path: ['categoryId'] };

/** How a new movement repeats; only "every N days" has an interval. `true` = monthly (older clients). */
const repeat = z
  .union([
    z.boolean().transform((on) => (on ? { frequency: 'monthly' as const, intervalDays: null } : null)),
    z.discriminatedUnion('frequency', [
      z.strictObject({
        frequency: z.enum(['weekly', 'monthly', 'yearly']),
        intervalDays: z.null().default(null),
      }),
      z.strictObject({
        frequency: z.literal('every_n_days'),
        intervalDays: z.number().int().min(MIN_INTERVAL_DAYS).max(MAX_INTERVAL_DAYS),
      }),
    ]),
  ])
  .nullable()
  .default(null);

/** New movement. The client makes the ULID, so optimistic rows and undo keep one id end to end. */
export const createInput = z
  .strictObject({ id, ...fields, repeat })
  .refine(categoryMatchesType, categoryRule);

/** Edit: every field is sent again (the dialog always has them all). */
export const updateInput = z.strictObject(fields).refine(categoryMatchesType, categoryRule);

export type CreateInput = z.infer<typeof createInput>;
export type UpdateInput = z.infer<typeof updateInput>;
