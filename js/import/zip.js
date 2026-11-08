// Minimal ZIP reader (no dependencies): central directory, stored (0) + deflate (8) entries, UTF-8 names.
// Reads only the needed byte ranges via Blob.slice, inflates with DecompressionStream('deflate-raw').
// No ZIP64, no encryption, no multi-disk. See docs/SPEC.md §13.4.

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

/** @typedef {{name: string, dir: boolean, method: number, size: number, compressedSize: number, crc32: number, offset: number, blob: Blob}} ZipEntry */

const toBlob = (src) => (src instanceof Blob ? src : new Blob([src]));
const bytes = async (blob, from, to) => new Uint8Array(await blob.slice(from, to).arrayBuffer());

/** True when the first bytes are a local file header ("PK\x03\x04"). */
export async function isZip(src) {
  const b = await bytes(toBlob(src), 0, 4);
  return b.length === 4 && new DataView(b.buffer).getUint32(0, true) === SIG_LOC;
}

/**
 * List all entries of a ZIP file.
 * @param {Blob|ArrayBuffer|Uint8Array} src
 * @returns {Promise<ZipEntry[]>}
 * @throws Error (German) for non-ZIP or unsupported (ZIP64) files
 */
export async function listEntries(src) {
  const blob = toBlob(src);
  const size = blob.size;
  const tailLen = Math.min(size, 22 + 0xffff);
  const tail = await bytes(blob, size - tailLen, size);
  const tv = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  if (eocd < 0) throw new Error('Keine gültige ZIP-Datei.');
  const count = tv.getUint16(eocd + 10, true);
  const cdSize = tv.getUint32(eocd + 12, true);
  const cdOffset = tv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new Error('ZIP64-Archive werden nicht unterstützt.');
  const cd = await bytes(blob, cdOffset, cdOffset + cdSize);
  const v = new DataView(cd.buffer);
  const utf8 = new TextDecoder('utf-8');
  const out = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.length; i++) {
    if (v.getUint32(p, true) !== SIG_CEN) throw new Error('ZIP-Verzeichnis ist beschädigt.');
    const method = v.getUint16(p + 10, true);
    const crc32 = v.getUint32(p + 16, true);
    const compressedSize = v.getUint32(p + 20, true);
    const usize = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    const name = utf8.decode(cd.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, dir: name.endsWith('/'), method, size: usize, compressedSize, crc32, offset, blob });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/**
 * Raw (decompressed) bytes of an entry.
 * @param {ZipEntry} entry
 * @returns {Promise<Uint8Array>}
 */
export async function readBytes(entry) {
  const head = await bytes(entry.blob, entry.offset, entry.offset + 30);
  const hv = new DataView(head.buffer);
  if (head.length < 30 || hv.getUint32(0, true) !== SIG_LOC) throw new Error(`ZIP-Eintrag ${entry.name} ist beschädigt.`);
  const start = entry.offset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
  const data = entry.blob.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return new Uint8Array(await data.arrayBuffer());
  if (entry.method !== 8) throw new Error(`Komprimierung ${entry.method} wird nicht unterstützt (${entry.name}).`);
  const stream = data.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Text content (UTF-8, BOM removed) of an entry.
 * @param {ZipEntry} entry
 * @returns {Promise<string>}
 */
export async function readText(entry) {
  return new TextDecoder('utf-8').decode(await readBytes(entry)).replace(/^﻿/, '');
}
