// Builds with the Node adapter (used by CI, e2e and Lighthouse). Cross-platform: no shell env syntax needed.
import { spawnSync } from 'node:child_process';

const result = spawnSync('pnpm', ['exec', 'astro', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, CI_ADAPTER: 'node' },
});
process.exit(result.status ?? 1);
