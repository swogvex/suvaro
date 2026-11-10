import { describe, expect, it } from 'vitest';
import { authErrorKey, looksLikeEmail } from '../../src/lib/auth-errors';
import { authBaseURL, deployment } from '../../src/lib/deployment';
import { renderEmail } from '../../src/lib/email-render';
import { ULID_PATTERN, ulid } from '../../src/lib/id';
import {
  ACTIVITY_THROTTLE_MS,
  isAllowedOrigin,
  onboardingRedirect,
  routeKind,
  shouldTouchActivity,
} from '../../src/lib/request-guards';
import { describeUserAgent } from '../../src/lib/user-agent';

describe('ulid', () => {
  it('encodes the time like the spec example and fills 16 random characters', () => {
    const id = ulid(1_469_918_176_385);
    expect(id.slice(0, 10)).toBe('01ARYZ6S41');
    expect(id).toMatch(ULID_PATTERN);
  });

  it('sorts by creation time', () => {
    expect(ulid(1_000) < ulid(2_000)).toBe(true);
    expect(new Set(Array.from({ length: 200 }, () => ulid(5))).size).toBe(200);
  });
});

describe('request guards', () => {
  const allowed = ['https://suvaro.xyz'];

  it('lets safe methods through and checks Origin on writes', () => {
    expect(isAllowedOrigin('GET', null, allowed)).toBe(true);
    expect(isAllowedOrigin('POST', 'https://suvaro.xyz', allowed)).toBe(true);
    expect(isAllowedOrigin('post', 'https://evil.example', allowed)).toBe(false);
    expect(isAllowedOrigin('DELETE', null, allowed)).toBe(false);
  });

  it.each([
    ['/app', 'app'],
    ['/app/settings/security', 'app'],
    ['/apple', 'public'],
    ['/api/auth/sign-in/email-otp', 'auth'],
    ['/api/cron/daily', 'cron'],
    ['/api/sessions', 'api'],
    ['/sign-in', 'sign-in'],
    ['/es/acceso', 'sign-in'],
    ['/', 'public'],
  ])('%s is %s', (path, kind) => {
    expect(routeKind(path)).toBe(kind);
  });

  it('sends new users to onboarding and finished users away from it', () => {
    expect(onboardingRedirect('/app', false)).toBe('/app/welcome');
    expect(onboardingRedirect('/app/welcome', false)).toBeNull();
    expect(onboardingRedirect('/app/welcome', true)).toBe('/app');
    expect(onboardingRedirect('/app/stats', true)).toBeNull();
  });

  it('throttles activity writes to once per 15 minutes', () => {
    const last = new Date('2026-11-10T10:00:00Z');
    expect(shouldTouchActivity(last, new Date(last.getTime() + ACTIVITY_THROTTLE_MS - 1))).toBe(false);
    expect(shouldTouchActivity(last, new Date(last.getTime() + ACTIVITY_THROTTLE_MS))).toBe(true);
  });
});

describe('deployment', () => {
  it('detects the environment from VERCEL_ENV', () => {
    expect(deployment({})).toBe('development');
    expect(deployment({ VERCEL_ENV: 'preview' })).toBe('preview');
    expect(deployment({ VERCEL_ENV: 'production' })).toBe('production');
  });

  it('picks the auth origin per environment', () => {
    expect(authBaseURL({})).toBe('http://localhost:4321');
    expect(authBaseURL({ VERCEL_ENV: 'production' })).toBe('https://suvaro.xyz');
    expect(authBaseURL({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'suvaro-git-x.vercel.app' })).toBe(
      'https://suvaro-git-x.vercel.app',
    );
    expect(authBaseURL({ VERCEL_ENV: 'production', BETTER_AUTH_URL: 'https://suvaro.xyz/' })).toBe(
      'https://suvaro.xyz',
    );
    expect(() => authBaseURL({ VERCEL_ENV: 'preview' })).toThrow();
  });
});

describe('auth error messages', () => {
  it.each([
    [{ code: 'INVALID_OTP' }, 'signIn.errorCodeWrong'],
    [{ code: 'OTP_EXPIRED' }, 'signIn.errorCodeExpired'],
    [{ code: 'TOO_MANY_ATTEMPTS' }, 'signIn.errorCodeAttempts'],
    [{ code: 'ACCOUNT_EXISTS' }, 'signIn.errorExists'],
    [{ code: 'AGE_CONFIRMATION_REQUIRED' }, 'signIn.errorAge'],
    [{ code: 'ERROR_CEREMONY_ABORTED' }, 'signIn.errorPasskeyCancelled'],
    [{ code: 'INVALID_OTP', status: 429 }, 'signIn.errorTooMany'],
    [{ code: 'SOMETHING_NEW', status: 500 }, 'signIn.errorGeneric'],
    [null, 'signIn.errorGeneric'],
  ])('%j → %s', (error, key) => {
    expect(authErrorKey(error)).toBe(key);
  });

  it('pre-checks emails loosely', () => {
    expect(looksLikeEmail('ana@example.com')).toBe(true);
    expect(looksLikeEmail('ana@example')).toBe(false);
    expect(looksLikeEmail('ana example.com')).toBe(false);
  });
});

describe('email rendering', () => {
  const source = {
    subject: 'Your code: {{code}}',
    preheader: 'Expires soon',
    markdown: 'Your code is:\n\n**{{code}}**\n\nSee [the site](https://suvaro.xyz).',
    html: '<p>Your code is:</p><p><strong>{{code}}</strong></p>',
  };

  it('fills placeholders in subject, text and HTML', () => {
    const email = renderEmail(source, { code: '123456' }, 'en');
    expect(email.subject).toBe('Your code: 123456');
    expect(email.text).toContain('123456');
    expect(email.text).not.toContain('**');
    expect(email.text).toContain('the site: https://suvaro.xyz');
    expect(email.html).toContain('<strong>123456</strong>');
    expect(email.html).toContain('lang="en"');
  });

  it('escapes values in the HTML part and refuses unknown placeholders', () => {
    expect(renderEmail(source, { code: '<b>' }, 'en').html).toContain('&lt;b&gt;');
    expect(() => renderEmail(source, {}, 'en')).toThrow(/code/);
  });
});

describe('device labels', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
      'Chrome',
      'Windows',
      false,
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
      'Safari',
      'iOS',
      true,
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0',
      'Edge',
      'Windows',
      false,
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Firefox', 'Linux', false],
  ])('%s', (ua, browser, os, mobile) => {
    expect(describeUserAgent(ua)).toEqual({ browser, os, mobile });
  });

  it('handles a missing user agent', () => {
    expect(describeUserAgent(null)).toEqual({ browser: null, os: null, mobile: false });
  });
});
