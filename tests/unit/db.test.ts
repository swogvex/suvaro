import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '../../src/lib/db/client';
import { errorLog } from '../../src/lib/db/schema';

describe('database migrations', () => {
  const { db, client } = createDb({ url: ':memory:' });
  afterAll(() => client.close());

  it('apply cleanly to an empty database and the schema is usable', async () => {
    await migrate(db, { migrationsFolder: 'drizzle' });
    await db.insert(errorLog).values({ at: 0, route: '/', code: 'TEST', message: 'ok' });
    const rows = await db.select().from(errorLog);
    expect(rows).toEqual([{ id: 1, at: 0, route: '/', code: 'TEST', message: 'ok' }]);
  });
});
