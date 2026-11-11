/** Request validation for categories (server only; the island never imports Zod). */
import { z } from 'zod';
import { ULID_PATTERN } from '../id';
import { CATEGORY_NAME_MAX, categoryIcons } from './model';

const fields = {
  name: z
    .string()
    .max(CATEGORY_NAME_MAX * 2)
    .transform((name) => name.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1).max(CATEGORY_NAME_MAX)),
  icon: z.enum(categoryIcons),
  color: z.number().int().min(1).max(8),
};

/** New category; the client makes the ULID (one id end to end, like goals). */
export const categoryCreateInput = z.strictObject({ id: z.string().regex(ULID_PATTERN), ...fields });

/** Edit: every field is sent again. */
export const categoryUpdateInput = z.strictObject(fields);

/** Delete: where its movements and recurring templates go (required when it has any). */
export const categoryDeleteInput = z.strictObject({ moveTo: z.string().regex(ULID_PATTERN).nullable() });

export type CategoryCreateInput = z.infer<typeof categoryCreateInput>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateInput>;
