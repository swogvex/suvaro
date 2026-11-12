/** CSP hash of the inline service worker registration (server/build only: uses node:crypto). Used in astro.config.mjs. */
import { createHash } from 'node:crypto';
import { swRegisterScript } from './sw-register.ts';

export const swRegisterScriptHash =
  `sha256-${createHash('sha256').update(swRegisterScript).digest('base64')}` as const;
