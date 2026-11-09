#!/usr/bin/env node
/**
 * Supertrader 9 – fetches named parts of the ENCRYPTED V13 research archive (docs/quant-recovery/v13/archive/
 * manifest-*.json) from the private snapshot store for the V13 study workflow (supertrader-st9-v13-study.yml).
 * Only ciphertext is written; every part is checked against the manifest (cipherSha256, cipherBytes) before it is
 * kept, fail closed. Decryption is scripts/quant/v13/archive/restore-archive.sh (unchanged, called by the workflow).
 * Output: one JSON line of part names, sizes and statuses; never a key, endpoint, bucket or object path.
 *
 *   node scripts/supertrader/snapshot/fetch-v13-archive-parts.mjs --manifest <manifest.json> \
 *     --prefix research-snapshots/quant-v13/archive-1.2.0/ --out <dir> --parts v13-raw,v13-derived
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PREFIX_RE = /^research-snapshots\/quant-v13\/archive-\d+\.\d+\.\d+\/$/;
export class FetchError extends Error { constructor(code, detail = null) { super(detail ? `${code}:${detail}` : code); this.code = code; this.detail = detail; } }
const fail = (code, detail) => { throw new FetchError(code, detail); };

/** driver: { get(key) -> Buffer | null } (scripts/market/storage/s3-driver.mjs). Returns [{ part, bytes, status }]. */
export async function fetchParts({ driver, manifest, prefix, out, parts }) {
  if (!PREFIX_RE.test(String(prefix ?? ''))) fail('PREFIX_INVALID');
  if (!Array.isArray(parts) || !parts.length) fail('PARTS_REQUIRED');
  const byName = new Map((manifest?.parts ?? []).map((p) => [p.part, p]));
  for (const name of parts) if (!byName.has(name)) fail('PART_NOT_IN_MANIFEST', name);
  fs.mkdirSync(out, { recursive: true });
  const done = [];
  for (const name of parts) {
    const p = byName.get(name);
    if (!/^[a-z0-9-]+\.tar\.enc$/.test(String(p.object))) fail('OBJECT_NAME_INVALID', name);
    const buf = await driver.get(prefix + p.object);
    if (!buf || !buf.length) fail('PART_MISSING', name);
    if (buf.length !== p.cipherBytes) fail('CIPHER_BYTES_MISMATCH', name);
    if (crypto.createHash('sha256').update(buf).digest('hex') !== p.cipherSha256) fail('CIPHER_SHA256_MISMATCH', name);
    fs.writeFileSync(path.join(out, p.object), buf, { mode: 0o600 });
    done.push({ part: name, bytes: buf.length, status: 'OK' });
  }
  return done;
}

async function main() {
  const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  try {
    const manifest = JSON.parse(fs.readFileSync(opt('--manifest'), 'utf8'));
    const { createS3DriverFromEnv } = await import('../../market/storage/s3-driver.mjs');
    const parts = await fetchParts({ driver: createS3DriverFromEnv(process.env), manifest, prefix: opt('--prefix'), out: opt('--out'), parts: String(opt('--parts') ?? '').split(',').filter(Boolean) });
    console.log(JSON.stringify({ fetch: parts }));
  } catch (e) {
    console.log(JSON.stringify({ fetch: 'FAILED', code: e instanceof FetchError ? e.code : 'UNEXPECTED', part: e instanceof FetchError ? e.detail : null }));
    process.exit(3);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
