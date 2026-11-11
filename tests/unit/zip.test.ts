import { crc32, inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { zip } from '../../src/lib/zip';

/** Reads the archive back from its central directory (the way unzip tools do). */
function read(archive: Uint8Array) {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const endAt = archive.length - 22;
  expect(view.getUint32(endAt, true)).toBe(0x06054b50);
  const count = view.getUint16(endAt + 10, true);
  let at = view.getUint32(endAt + 16, true);
  const files: { name: string; text: string; crcOk: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(archive.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const dataAt = local + 30 + view.getUint16(local + 26, true);
    const raw = inflateRawSync(archive.subarray(dataAt, dataAt + size));
    files.push({ name, text: raw.toString('utf8'), crcOk: crc32(raw) >>> 0 === crc });
    at += 46 + nameLength;
  }
  return files;
}

describe('zip', () => {
  it('writes files that read back byte for byte, UTF-8 names included', () => {
    const archive = zip(
      [
        { name: 'data.json', content: '{"name":"Café ☕"}' },
        { name: 'csv/movimientos.csv', content: 'a,b\r\n1,2\r\n'.repeat(500) },
        { name: 'vacío.txt', content: '' },
      ],
      new Date('2026-11-11T21:30:00Z'),
    );
    const files = read(archive);
    expect(files.map((file) => file.name)).toEqual(['data.json', 'csv/movimientos.csv', 'vacío.txt']);
    expect(files[0]?.text).toBe('{"name":"Café ☕"}');
    expect(files[1]?.text).toBe('a,b\r\n1,2\r\n'.repeat(500));
    expect(files[2]?.text).toBe('');
    expect(files.every((file) => file.crcOk)).toBe(true);
    // DEFLATE actually compresses repetitive text.
    expect(archive.length).toBeLessThan(2_000);
  });
});
