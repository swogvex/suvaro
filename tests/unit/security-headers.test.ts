import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applySecurityHeaders, securityHeaders } from '../../src/lib/security-headers';

interface VercelConfig {
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

describe('security headers', () => {
  it('vercel.json sends the same headers as the middleware on every path', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig;
    const all = config.headers.find((rule) => rule.source === '/(.*)');
    const fromVercel = Object.fromEntries((all?.headers ?? []).map(({ key, value }) => [key, value]));
    expect(fromVercel).toEqual(securityHeaders);
  });

  it('keeps the header CSP free of script and style restrictions (Astro adds hashed ones)', () => {
    const csp = securityHeaders['Content-Security-Policy'];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/default-src|script-src|style-src/);
  });

  it('does not overwrite headers already set by a route', () => {
    const headers = new Headers({ 'Referrer-Policy': 'no-referrer' });
    applySecurityHeaders(headers);
    expect(headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
