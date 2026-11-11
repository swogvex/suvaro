// @ts-check
import { defineConfig, envField, fontProviders } from 'astro/config';
import node from '@astrojs/node';
import svelte from '@astrojs/svelte';
import vercel from '@astrojs/vercel';
import { themeInitScriptHash } from './src/lib/theme-csp.ts';

// CI and local e2e run a plain Node server; Vercel builds use the Vercel adapter.
const adapter =
  process.env.CI_ADAPTER === 'node'
    ? node({ mode: 'standalone', staticHeaders: true })
    : vercel({ staticHeaders: true });

export default defineConfig({
  site: 'https://suvaro.xyz',
  output: 'server',
  adapter,
  integrations: [svelte()],
  trailingSlash: 'never',
  markdown: { syntaxHighlight: false },

  i18n: {
    locales: ['en', 'es'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: false },
  },

  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Unbounded',
      cssVariable: '--font-unbounded',
      weights: [600],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['Suvaro Display Fallback', 'Arial Black', 'system-ui', 'sans-serif'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Gabarito',
      cssVariable: '--font-gabarito',
      weights: ['400 900'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['Suvaro UI Fallback', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
    },
  ],

  security: {
    checkOrigin: true,
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
      ],
      // The inline theme script runs before first paint on every page; its hash is allowed globally
      // (Astro.csp.insertScriptHash does not reach the static headers of prerendered pages).
      scriptDirective: { resources: ["'self'"], hashes: [themeInitScriptHash] },
      styleDirective: { resources: ["'self'"] },
    },
  },

  env: {
    schema: {
      TURSO_DATABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      TURSO_AUTH_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      BETTER_AUTH_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      BETTER_AUTH_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Vercel Cron sends it as a Bearer token to /api/cron/daily; without it the route stays closed.
      CRON_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      EMAIL_FROM: envField.string({
        context: 'server',
        access: 'secret',
        default: 'Suvaro <no-reply@suvaro.xyz>',
      }),
      // Tests only: write emails as JSON files to this folder instead of sending them. Ignored on Vercel.
      EMAIL_OUTBOX_DIR: envField.string({ context: 'server', access: 'secret', optional: true }),
      PUBLIC_SITE_URL: envField.string({
        context: 'client',
        access: 'public',
        default: 'http://localhost:4321',
      }),
    },
  },
});
