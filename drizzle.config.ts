import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile();
} catch {
  // No .env file: use the local database.
}

const url = process.env['TURSO_DATABASE_URL'] || 'file:local.db';
const authToken = process.env['TURSO_AUTH_TOKEN'] || undefined;

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: authToken ? { url, authToken } : { url },
});
