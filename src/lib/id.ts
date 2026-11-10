/**
 * ULID: 26 characters, Crockford base32, sortable by creation time (48-bit ms timestamp + 80 random bits).
 * Used for every row id. https://github.com/ulid/spec
 */
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(now: number = Date.now()): string {
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = alphabet[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let random = '';
  for (const byte of bytes) random += alphabet[byte % 32];
  return time + random;
}

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
