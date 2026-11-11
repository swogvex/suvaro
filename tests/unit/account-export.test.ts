import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectUserData, exportUserData, tableCsv } from '../../src/lib/account-export';
import { createDb } from '../../src/lib/db/client';
import { category, goal, movement, passkey, profile, session, user } from '../../src/lib/db/schema';
import { ulid } from '../../src/lib/id';

const { db, client } = createDb({ url: ':memory:' });

async function seed(name: string) {
  const id = ulid();
  await db.insert(user).values({ id, email: `${name}-${id}@example.com`, ageConfirmed: true });
  await db.insert(profile).values({ userId: id, lastActiveAt: new Date() });
  const food = ulid();
  await db
    .insert(category)
    .values({ id: food, userId: id, name: `${name} food`, icon: 'utensils', color: 'c1' });
  await db.insert(movement).values({
    id: ulid(),
    userId: id,
    type: 'expense',
    amountCents: 1_234,
    categoryId: food,
    date: '2026-11-03',
    note: '=HYPERLINK("x")',
  });
  await db
    .insert(goal)
    .values({ id: ulid(), userId: id, name: 'Trip', icon: 'plane', color: 'c5', targetCents: 50_000 });
  await db.insert(session).values({
    id: ulid(),
    userId: id,
    token: `secret-token-${name}`,
    expiresAt: new Date('2026-12-11'),
    userAgent: 'Chrome',
  });
  await db.insert(passkey).values({
    id: ulid(),
    userId: id,
    name: 'iPhone',
    publicKey: `secret-key-${name}`,
    credentialID: `cred-${name}`,
    counter: 0,
    deviceType: 'singleDevice',
    backedUp: true,
  });
  return id;
}

let alice: string;
let bob: string;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: 'drizzle' });
  alice = await seed('alice');
  bob = await seed('bob');
});
afterAll(() => client.close());

describe('download all my data', () => {
  it('has only the user’s own rows, in every table', async () => {
    const data = await collectUserData(db, alice);
    expect(data['account']).toHaveLength(1);
    expect(data['categories']?.map((row) => row['name'])).toEqual(['alice food']);
    expect(data['movements']).toHaveLength(1);
    expect(data['goals']).toHaveLength(1);
    const text = JSON.stringify(data);
    expect(text).not.toContain(bob);
    expect(text).not.toContain('bob food');
  });

  it('leaves secrets out: session tokens and passkey keys', async () => {
    const data = await collectUserData(db, alice);
    const text = JSON.stringify(data);
    expect(text).not.toContain('secret-token');
    expect(text).not.toContain('secret-key');
    expect(data['passkeys']?.[0]).toMatchObject({ name: 'iPhone', backedUp: true });
    expect(data['sessions']?.[0]).toMatchObject({ userAgent: 'Chrome' });
  });

  it('CSV cells that a spreadsheet would run are made safe', () => {
    const csv = tableCsv([
      { note: '=HYPERLINK("x")', amountCents: 1234, when: new Date('2026-11-03T00:00:00Z') },
    ]);
    expect(csv).toBe(
      '\uFEFFnote,amountCents,when\r\n"\'=HYPERLINK(""x"")",1234,2026-11-03T00:00:00.000Z\r\n',
    );
    expect(tableCsv([])).toBe('');
  });

  it('builds a ZIP', async () => {
    const archive = await exportUserData(db, alice, 'es', new Date('2026-11-11T12:00:00Z'));
    expect(new DataView(archive.buffer).getUint32(0, true)).toBe(0x04034b50);
    expect(archive.length).toBeGreaterThan(500);
  });
});
