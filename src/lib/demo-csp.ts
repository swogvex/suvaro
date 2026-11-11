/** CSP hash of the demo's inline fetch queue (server/build only: uses node:crypto). Used in astro.config.mjs. */
import { createHash } from 'node:crypto';
import { demoQueueScript } from './demo/queue.ts';

export const demoQueueScriptHash =
  `sha256-${createHash('sha256').update(demoQueueScript).digest('base64')}` as const;
