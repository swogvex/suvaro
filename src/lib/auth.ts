/**
 * Better Auth (server only): passkeys + 6-digit email codes, no passwords.
 * - Session cookie `__Host-suvaro.session`: HttpOnly, Secure, SameSite=Lax, Path=/; 30 days, renewed daily.
 * - Rate limits stored in the database (`rate_limit`), keyed by client IP (`x-forwarded-for`, set by Vercel).
 * - New accounts need the "18 or older" confirmation (`ageConfirmed`), checked when the user row is created.
 * - "Create account with passkey" registers the passkey without a session (`resolveUser`), creates the user
 *   with an unverified email after the passkey is verified, and starts a session. Unverified accounts are
 *   deleted after 72 h; signing in with an email code to an unverified account revokes its passkeys first.
 */
import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { BETTER_AUTH_SECRET } from 'astro:env/server';
import { eq } from 'drizzle-orm';
import { isLocale, type Locale } from '../i18n';
import { db } from './db';
import * as schema from './db/schema';
import { authBaseURL, deployment } from './deployment';
import { buildEmail, sendEmail } from './email';
import { recordEmail } from './email-ledger';
import { describeError, logError } from './errors';
import { ulid } from './id';
import { z } from 'zod';
import { authErrorCodes, LOCALE_HEADER } from './auth-shared';

const DAY = 60 * 60 * 24;

function authSecret(): string {
  if (BETTER_AUTH_SECRET) return BETTER_AUTH_SECRET;
  if (deployment() !== 'development') throw new Error('BETTER_AUTH_SECRET is not set');
  // Local development, CI and e2e only: a fixed value is fine because there is nothing to protect.
  return 'development-only-secret-not-used-on-vercel-000000';
}

/** Sent by the sign-in page as the passkey `context` when creating an account. */
const passkeySignUpContext = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  locale: z.enum(['en', 'es']),
  ageConfirmed: z.literal(true),
});

function parseSignUpContext(context: string | null | undefined) {
  try {
    return passkeySignUpContext.safeParse(JSON.parse(context ?? 'null'));
  } catch {
    return passkeySignUpContext.safeParse(null);
  }
}

function fail(code: keyof typeof authErrorCodes): never {
  throw new APIError('BAD_REQUEST', { code, message: authErrorCodes[code] });
}

/** Language for an email: the profile's language if the account exists, else the page the request came from. */
async function emailLocale(email: string, header: string | null | undefined): Promise<Locale> {
  const [row] = await db
    .select({ locale: schema.profile.locale, userLocale: schema.user.locale })
    .from(schema.user)
    .leftJoin(schema.profile, eq(schema.profile.userId, schema.user.id))
    .where(eq(schema.user.email, email))
    .limit(1);
  const locale = row?.locale ?? row?.userLocale ?? header;
  return isLocale(locale) ? locale : 'en';
}

function createAuth() {
  return betterAuth({
    appName: 'Suvaro',
    baseURL: authBaseURL(),
    secret: authSecret(),
    telemetry: { enabled: false },
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        passkey: schema.passkey,
        rateLimit: schema.rateLimit,
      },
    }),

    user: {
      additionalFields: {
        ageConfirmed: { type: 'boolean', required: false, defaultValue: false, input: true, returned: false },
        locale: { type: 'string', required: false, defaultValue: 'en', input: true },
      },
    },

    session: { expiresIn: 30 * DAY, updateAge: DAY },

    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
        '/sign-in/email-otp': { window: 60, max: 10 },
        '/email-otp/verify-email': { window: 60, max: 10 },
        '/passkey/generate-register-options': { window: 60, max: 10 },
        '/passkey/verify-registration': { window: 60, max: 10 },
        '/passkey/verify-authentication': { window: 60, max: 20 },
      },
    },

    advanced: {
      // The session cookie name carries `__Host-` itself; Better Auth's automatic `__Secure-` prefix is off.
      useSecureCookies: false,
      cookiePrefix: 'suvaro',
      defaultCookieAttributes: { secure: true, httpOnly: true, sameSite: 'lax', path: '/' },
      cookies: { session_token: { name: '__Host-suvaro.session' } },
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
      database: { generateId: () => ulid() },
    },

    databaseHooks: {
      user: {
        create: {
          before: async (data) => {
            if (data['ageConfirmed'] !== true) fail('AGE_CONFIRMATION_REQUIRED');
            const locale = isLocale(data['locale']) ? data['locale'] : 'en';
            return { data: { ...data, name: '', locale } };
          },
        },
      },
    },

    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        async sendVerificationOTP({ email, otp }, ctx) {
          try {
            const locale = await emailLocale(email, ctx?.request?.headers.get(LOCALE_HEADER));
            await sendEmail(email, await buildEmail('otp', locale, { code: otp }));
            // Counted toward the daily email cap; a ledger hiccup must not fail the sign-in.
            await recordEmail(db, 'otp', null).catch(() => undefined);
          } catch (error) {
            await logError('/api/auth/email-otp', 'EMAIL_SEND_FAILED', describeError(error));
            throw new APIError('INTERNAL_SERVER_ERROR', {
              code: 'EMAIL_SEND_FAILED',
              message: authErrorCodes.EMAIL_SEND_FAILED,
            });
          }
        },
      }),
      passkey({
        rpName: 'Suvaro',
        authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
        registration: {
          // Signed-in users add passkeys with their session; without one this is "Create account with passkey".
          requireSession: false,
          async resolveUser({ ctx, context }) {
            const input = parseSignUpContext(context);
            if (!input.success) {
              const ageMissing = input.error.issues.some((issue) => issue.path[0] === 'ageConfirmed');
              fail(ageMissing ? 'AGE_CONFIRMATION_REQUIRED' : 'INVALID_EMAIL');
            }
            if (await ctx.context.internalAdapter.findUserByEmail(input.data.email)) fail('ACCOUNT_EXISTS');
            // Provisional id: the user row is only created once the passkey is verified (afterVerification).
            return { id: ulid(), name: input.data.email, displayName: input.data.email };
          },
          async afterVerification({ ctx, user, context }) {
            // A signed-in user adding a passkey: nothing to create.
            if (!context || (await ctx.context.internalAdapter.findUserById(user.id))) return;
            const input = parseSignUpContext(context);
            if (!input.success) fail('INVALID_EMAIL');
            const created = await ctx.context.internalAdapter.createUser(
              {
                email: input.data.email,
                name: '',
                emailVerified: false,
                ageConfirmed: true,
                locale: input.data.locale,
              },
              ctx,
            );
            return { userId: created.id };
          },
        },
      }),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

/** Created on first use, so public pages never depend on auth configuration. */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}

export type Session = Auth['$Infer']['Session'];
