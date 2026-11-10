import { defineConfig, devices } from '@playwright/test';

import { OUTBOX_DIR } from './tests/e2e/outbox';

const PORT = 4321;
const isCI = Boolean(process.env['CI']);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  // Production build with the Node adapter (same server CI and Lighthouse use), on the migrated local
  // database. Emails go to files in EMAIL_OUTBOX_DIR so tests can read sign-in codes.
  webServer: {
    // The seeded users (Home with a full month) are written before the server starts: a second writer on
    // the SQLite file during the run would make the server's own writes fail.
    command:
      'pnpm db:migrate && node scripts/seed-user.mjs e2e-mobile && node scripts/seed-user.mjs e2e-desktop && pnpm build:node && pnpm start:node',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { HOST: '127.0.0.1', PORT: String(PORT), EMAIL_OUTBOX_DIR: OUTBOX_DIR },
  },
});
