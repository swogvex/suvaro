/** Request validation for Settings (server only; the pages' scripts never import Zod). */
import { z } from 'zod';
import { locales } from '../../i18n';
import { avatars } from '../avatars';
import { isCurrency } from '../onboarding';
import { accents, modes } from '../theme';

export const DISPLAY_NAME_MAX = 40;

/**
 * `PATCH /api/profile`: any subset of the editable profile fields, at least one. Unknown keys → 400.
 * Profile (name, avatar), Preferences (currency, language, week start, cycle start) and Appearance.
 */
export const profilePatchInput = z
  .strictObject({
    displayName: z
      .string()
      .max(DISPLAY_NAME_MAX * 2)
      .transform((name) => name.trim().replace(/\s+/g, ' '))
      .pipe(z.string().max(DISPLAY_NAME_MAX)),
    avatar: z.enum(avatars),
    currency: z.string().refine(isCurrency),
    locale: z.enum(locales),
    weekStart: z.union([z.literal(1), z.literal(7)]),
    cycleStartDay: z.number().int().min(1).max(28),
    mode: z.enum(modes),
    themeDay: z.enum(accents),
    themeNight: z.enum(accents),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0);

export type ProfilePatch = z.infer<typeof profilePatchInput>;
