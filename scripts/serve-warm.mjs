// Starts the Node build for Lighthouse CI and warms it up before the first measurement: the very first
// request of a fresh process (module loading, the first database connection) takes ~2 s locally, and
// Lighthouse would charge it to whichever page it measures first. Prints "Server warm" when ready.
//
//   node scripts/serve-warm.mjs [cookie]   (cookie: from scripts/seed-user.mjs, to warm a signed-in page)
import { spawn } from 'node:child_process';

const cookie = process.argv[2];
const server = spawn(process.execPath, ['dist/server/entry.mjs'], {
  env: { ...process.env, HOST: process.env.HOST ?? '127.0.0.1', PORT: process.env.PORT ?? '4321' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const stop = () => server.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);
server.on('exit', (code) => process.exit(code ?? 0));

let warmed = false;
server.stdout.on('data', async (chunk) => {
  process.stdout.write(chunk);
  if (warmed || !String(chunk).includes('Server listening')) return;
  warmed = true;
  const base = `http://localhost:${process.env.PORT ?? '4321'}`;
  for (const path of ['/', cookie ? '/app' : '/sign-in']) {
    await fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} }).catch(() => undefined);
  }
  console.log('Server warm');
});
