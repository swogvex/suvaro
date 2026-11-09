import { defineConfig, devices } from '@playwright/test';

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
  // Production build with the Node adapter (same server CI and Lighthouse use).
  webServer: {
    command: 'pnpm build:node && pnpm start:node',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    env: { HOST: '127.0.0.1', PORT: String(PORT) },
  },
});
