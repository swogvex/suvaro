/** Reads the emails the e2e server writes to EMAIL_OUTBOX_DIR (see src/lib/email.ts). */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const OUTBOX_DIR = resolve('.e2e-outbox');

interface OutboxEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function emailsTo(address: string): Promise<OutboxEmail[]> {
  let files: string[] = [];
  try {
    files = (await readdir(OUTBOX_DIR)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const emails = await Promise.all(
    files.map(async (name) => JSON.parse(await readFile(join(OUTBOX_DIR, name), 'utf8')) as OutboxEmail),
  );
  return emails.filter((email) => email.to === address);
}

/** Waits for the `nth` email (1-based) sent to `address` and returns its 6-digit code. */
export async function codeFor(address: string, nth = 1, timeoutMs = 10_000): Promise<string> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const emails = await emailsTo(address);
    const email = emails[nth - 1];
    const code = email?.text.match(/\b\d{6}\b/)?.[0];
    if (code) return code;
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`No email #${nth} with a code for ${address}`);
}
