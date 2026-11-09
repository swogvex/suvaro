import { TURSO_AUTH_TOKEN, TURSO_DATABASE_URL } from 'astro:env/server';
import { createDb, LOCAL_DATABASE_URL } from './client';

/** App-wide database (server only). Falls back to the local SQLite file in development. */
export const { db } = createDb({
  url: TURSO_DATABASE_URL ?? LOCAL_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN,
});
