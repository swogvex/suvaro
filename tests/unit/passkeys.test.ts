import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '../../src/lib/db/client';
import { passkey, user } from '../../src/lib/db/schema';
import { ulid } from '../../src/lib/id';
import { passkeyRenameInput, removePasskey, renamePasskey } from '../../src/lib/settings/passkeys';

const { db, client } = createDb({ url: ':memory:' });

async function seed(name: string, keys: number) {
  const id = ulid();
  await db.insert(user).values({ id, email: `${name}-${id}@example.com`, ageConfirmed: true });
  const ids = Array.from({ length: keys }, () => ulid());
  for (const key of ids) {
    await db.insert(passkey).values({
      id: key,
      userId: id,
      publicKey: 'pk',
      credentialID: `cred-${key}`,
      counter: 0,
      deviceType: 'singleDevice',
      backedUp: false,
    });
  }
  return { id, keys: ids };
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: 'drizzle' });
});
afterAll(() => client.close());

describe('passkeys', () => {
  it('renames only the user’s own passkey', async () => {
    const alice = await seed('alice', 1);
    const bob = await seed('bob', 1);
    const key = alice.keys[0] ?? '';
    expect(await renamePasskey(db, bob.id, key, 'Mine')).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await renamePasskey(db, alice.id, key, 'iPhone')).toEqual({ ok: true });
    const [row] = await db.select().from(passkey).where(eq(passkey.id, key));
    expect(row?.name).toBe('iPhone');
  });

  it('keeps the last passkey of an unconfirmed account; a confirmed one may remove it', async () => {
    const carol = await seed('carol', 2);
    const unconfirmed = { id: carol.id, emailVerified: false };
    expect(await removePasskey(db, unconfirmed, carol.keys[0] ?? '')).toEqual({ ok: true });
    expect(await removePasskey(db, unconfirmed, carol.keys[1] ?? '')).toEqual({
      ok: false,
      error: 'LAST_PASSKEY',
    });
    expect(await removePasskey(db, { id: carol.id, emailVerified: true }, carol.keys[1] ?? '')).toEqual({
      ok: true,
    });
    expect(await db.select().from(passkey).where(eq(passkey.userId, carol.id))).toEqual([]);
  });

  it('never removes another user’s passkey', async () => {
    const dan = await seed('dan', 2);
    const eve = await seed('eve', 1);
    expect(await removePasskey(db, { id: eve.id, emailVerified: true }, dan.keys[0] ?? '')).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await db.select().from(passkey).where(eq(passkey.userId, dan.id))).toHaveLength(2);
  });

  it('names are trimmed, 1–40 characters, nothing else accepted', () => {
    expect(passkeyRenameInput.parse({ name: '  Work   laptop ' }).name).toBe('Work laptop');
    expect(passkeyRenameInput.safeParse({ name: '  ' }).success).toBe(false);
    expect(passkeyRenameInput.safeParse({ name: 'x'.repeat(41) }).success).toBe(false);
    expect(passkeyRenameInput.safeParse({ name: 'ok', id: 'x' }).success).toBe(false);
  });
});
