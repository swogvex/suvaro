// Lighthouse CI for the signed-in app pages, as a seeded user (scripts/seed-user.mjs) with six months of data.
// Runs after the public pages (`pnpm lhci`); reports go to their own folder so both sets are kept.
// LHCI loads its config with require(), so this file stays CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { execFileSync } = require('node:child_process');

const cookie = execFileSync(process.execPath, ['scripts/seed-user.mjs', 'lighthouse'], {
  encoding: 'utf8',
}).trim();

const strict = {
  'categories:performance': ['error', { minScore: 0.95, aggregationMethod: 'median-run' }],
  'categories:accessibility': ['error', { minScore: 1 }],
  'categories:best-practices': ['error', { minScore: 1 }],
};

module.exports = {
  ci: {
    collect: {
      // Warmed up first, so the first measured page doesn't pay the fresh process's first request.
      startServerCommand: `node scripts/serve-warm.mjs "${cookie}"`,
      startServerReadyPattern: 'Server warm',
      url: [
        'http://localhost:4321/app',
        'http://localhost:4321/app/movements',
        'http://localhost:4321/app/movements/calendar',
        'http://localhost:4321/app/stats',
      ],
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--headless=new --no-sandbox',
        extraHeaders: JSON.stringify({ Cookie: cookie }),
      },
    },
    assert: { assertions: strict },
    upload: { target: 'filesystem', outputDir: '.lighthouseci/app-reports' },
  },
};
