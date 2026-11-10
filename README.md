# Suvaro

A calm, simple web app to track personal expenses by hand. Numbers you type — never real money, never a bank.

**Stack:** Astro 7 (SSR on Vercel) · Svelte 5 islands · native CSS · Turso + Drizzle · Better Auth (passkeys + email codes) · TypeScript strict.

## Development

Requires Node 24 and pnpm.

```sh
pnpm install
cp .env.example .env   # local dev works with TURSO_DATABASE_URL=file:local.db
pnpm db:migrate
pnpm dev
```

Sign in at `http://localhost:4321/sign-in`. Without `RESEND_API_KEY`, the 6-digit codes are printed in the
terminal running `pnpm dev`. Passkeys work on `localhost`.

| Command      | What it does                                        |
| ------------ | --------------------------------------------------- |
| `pnpm check` | Astro + TypeScript type check                       |
| `pnpm lint`  | ESLint and Prettier                                 |
| `pnpm test`  | Unit tests (Vitest)                                 |
| `pnpm e2e`   | End-to-end + accessibility tests (Playwright + axe) |
| `pnpm lhci`  | Lighthouse CI (after `pnpm build:node`)             |
