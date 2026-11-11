/**
 * A minimal ZIP writer (server only, no dependency): DEFLATE via `node:zlib`, CRC-32 via `zlib.crc32`.
 * Enough for "Download all my data": a few small UTF-8 text files, built in memory (well under 1 MB).
 * Format: PKWARE APPNOTE 6.3 — local headers, data, central directory, end record. No ZIP64.
 */
import { crc32, deflateRawSync } from 'node:zlib';

export interface ZipFile {
  /** Path inside the archive (forward slashes). */
  name: string;
  content: string | Uint8Array;
}

const UTF8_FLAG = 0x0800;
const DEFLATE = 8;
const VERSION = 20;

/** MS-DOS date and time (local fields from the UTC date: the archive shows the export moment). */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(date.getUTCFullYear(), 1980);
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

export function zip(files: readonly ZipFile[], now: Date = new Date()): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const stamp = dosDateTime(now);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const raw = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const data = deflateRawSync(raw);
    const crc = crc32(raw) >>> 0;

    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, VERSION, true);
    l.setUint16(6, UTF8_FLAG, true);
    l.setUint16(8, DEFLATE, true);
    l.setUint16(10, stamp.time, true);
    l.setUint16(12, stamp.date, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, raw.length, true);
    l.setUint16(26, name.length, true);
    l.setUint16(28, 0, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, VERSION, true);
    c.setUint16(6, VERSION, true);
    c.setUint16(8, UTF8_FLAG, true);
    c.setUint16(10, DEFLATE, true);
    c.setUint16(12, stamp.time, true);
    c.setUint16(14, stamp.date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, raw.length, true);
    c.setUint16(28, name.length, true);
    // extra, comment, disk, internal and external attributes: 0
    c.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
