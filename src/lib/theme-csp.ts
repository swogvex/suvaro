/** CSP hash of the inline theme script (server/build only: uses node:crypto). Used in astro.config.mjs. */
import { createHash } from 'node:crypto';
import { themeInitScript } from './theme.ts';

export const themeInitScriptHash =
  `sha256-${createHash('sha256').update(themeInitScript).digest('base64')}` as const;
