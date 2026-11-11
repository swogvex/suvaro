/** Request validation for Settings (server only; the pages' scripts never import Zod). */
import { z } from 'zod';
import { accents, modes } from '../theme';

/**
 * `PATCH /api/profile`: any subset of the editable profile fields, at least one. Unknown keys → 400.
 * Grows with each Settings section (Appearance first).
 */
export const profilePatchInput = z
  .strictObject({
    mode: z.enum(modes),
    themeDay: z.enum(accents),
    themeNight: z.enum(accents),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0);

export type ProfilePatch = z.infer<typeof profilePatchInput>;
