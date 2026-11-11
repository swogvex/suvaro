/**
 * Sends transactional email from `src/content/emails/{locale}/{kind}.md`.
 * - With `RESEND_API_KEY`: Resend's HTTP API (plain fetch, no SDK).
 * - Development without a key: prints the email to the server console (sign-in codes appear there).
 * - Tests: `EMAIL_OUTBOX_DIR` writes each email as a JSON file (never on Vercel).
 */
import { getEntry } from 'astro:content';
import { EMAIL_FROM, EMAIL_OUTBOX_DIR, RESEND_API_KEY } from 'astro:env/server';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Locale } from '../i18n';
import { deployment } from './deployment';
import { renderEmail, type EmailVars, type RenderedEmail } from './email-render';

export type EmailKind = 'otp' | 'inactivity-25' | 'inactivity-29' | 'account-deleted' | 'unverified-deleted';

export async function buildEmail(kind: EmailKind, locale: Locale, vars: EmailVars): Promise<RenderedEmail> {
  const entry = await getEntry('emails', `${locale}/${kind}`);
  if (!entry?.body || !entry.rendered) throw new Error(`Email template not found: ${locale}/${kind}`);
  return renderEmail({ ...entry.data, markdown: entry.body, html: entry.rendered.html }, vars, locale);
}

export async function sendEmail(to: string, email: RenderedEmail): Promise<void> {
  const env = deployment();

  if (EMAIL_OUTBOX_DIR && env === 'development') {
    await mkdir(EMAIL_OUTBOX_DIR, { recursive: true });
    const file = join(EMAIL_OUTBOX_DIR, `${Date.now()}-${crypto.randomUUID()}.json`);
    await writeFile(file, JSON.stringify({ to, ...email }));
    return;
  }

  if (!RESEND_API_KEY) {
    if (env !== 'development') throw new Error('RESEND_API_KEY is not set');
    console.info(`\n[email] to ${to}\n[email] ${email.subject}\n${email.text}`);
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Resend answered ${response.status}`);
}
