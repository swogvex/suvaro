/**
 * Security headers sent with every response.
 * - SSR responses get them from `src/middleware.ts`.
 * - Static (prerendered) files on Vercel get them from `vercel.json`; a unit test keeps both in sync.
 * The script/style part of the CSP is generated per page by Astro (hashes); the header below only adds
 * directives that cannot live in a <meta> tag and never restricts scripts or styles, so both policies combine.
 */
export const securityHeaders = {
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': [
    'accelerometer=()',
    'autoplay=()',
    'browsing-topics=()',
    'camera=()',
    'display-capture=()',
    'geolocation=()',
    'gyroscope=()',
    'hid=()',
    'magnetometer=()',
    'microphone=()',
    'midi=()',
    'payment=()',
    'serial=()',
    'usb=()',
    'publickey-credentials-get=(self)',
    'publickey-credentials-create=(self)',
  ].join(', '),
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const satisfies Record<string, string>;

/** Sets every security header that is not already present. */
export function applySecurityHeaders(headers: Headers): void {
  for (const [name, value] of Object.entries(securityHeaders)) {
    if (!headers.has(name)) headers.set(name, value);
  }
}
