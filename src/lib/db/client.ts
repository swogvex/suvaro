import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';

export type Database = LibSQLDatabase<typeof schema>;

export interface DbConfig {
  url: string;
  authToken?: string | undefined;
}

export const LOCAL_DATABASE_URL = 'file:local.db';

/** Creates a Drizzle database over libSQL. Local development and tests use a `file:` or `:memory:` URL. */
export function createDb({ url, authToken }: DbConfig): { db: Database; client: Client } {
  const client = createClient(authToken ? { url, authToken } : { url });
  return { db: drizzle(client, { schema }), client };
}
