/**
 * Captures the V4 external calibration oracles (Kenneth R. French Data Library) and verifies them against the
 * archive and member SHA-256 hashes registered in SUPERTRADER-V4-ORACLE-MANIFEST.json before any measurement.
 * A changed file (e.g. a later monthly library update) fails closed; the manifest is never edited after results.
 * The raw bytes and parsed values are written only to a private directory outside the repository.
 *
 * Usage: node capture-oracle-v4.mjs --out <private dir> --public-out <receipt.json> [--from-dir <dir with zips>]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseFrenchSections, ewMarketOracle, momentumOracle, varianceOracle } from './oracle/french-library-v4.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const demand = (ok, code) => { if (!ok) throw new Error(code); };
export const ORACLE_MANIFEST_PATH = path.join(HERE, 'SUPERTRADER-V4-ORACLE-MANIFEST.json');

/** Minimal ZIP reader (central directory; stored or deflated members). */
export function zipMember(buffer, name) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  demand(eocd >= 0, 'ZIP_EOCD_MISSING');
  const entries = buffer.readUInt16LE(eocd + 10); let p = buffer.readUInt32LE(eocd + 16);
  for (let e = 0; e < entries; e++) {
    demand(buffer.readUInt32LE(p) === 0x02014b50, 'ZIP_CENTRAL_DIRECTORY_INVALID');
    const method = buffer.readUInt16LE(p + 10), csize = buffer.readUInt32LE(p + 20), usize = buffer.readUInt32LE(p + 24);
    const nlen = buffer.readUInt16LE(p + 28), xlen = buffer.readUInt16LE(p + 30), clen = buffer.readUInt16LE(p + 32), local = buffer.readUInt32LE(p + 42);
    const entryName = buffer.subarray(p + 46, p + 46 + nlen).toString('utf8');
    if (entryName === name) {
      demand(buffer.readUInt32LE(local) === 0x04034b50, 'ZIP_LOCAL_HEADER_INVALID');
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28), data = buffer.subarray(start, start + csize);
      const out = method === 0 ? Buffer.from(data) : method === 8 ? zlib.inflateRawSync(data) : null;
      demand(out && out.length === usize, 'ZIP_MEMBER_DECODE_FAILED');
      return out;
    }
    p += 46 + nlen + xlen + clen;
  }
  throw new Error('ZIP_MEMBER_MISSING');
}

export function parseOracles(members, window) {
  return {
    EW_MARKET: ewMarketOracle(parseFrenchSections(members.FRENCH_ME.toString('latin1')), window),
    MOM_12_2_EW_DECILES: momentumOracle(parseFrenchSections(members.FRENCH_MOM10.toString('latin1')), window),
    VAR_60D_EW_QUINTILES: varianceOracle(parseFrenchSections(members.FRENCH_VAR.toString('latin1')), window),
  };
}

export async function captureOracles({ out, publicOut, fromDir = null, manifest = JSON.parse(fs.readFileSync(ORACLE_MANIFEST_PATH, 'utf8')) }) {
  const dir = path.resolve(out);
  demand(dir !== ROOT && !dir.startsWith(ROOT + path.sep), 'PRIVATE_ORACLE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const members = {}, receipts = [];
  for (const s of manifest.sources) {
    const archive = fromDir ? fs.readFileSync(path.join(fromDir, path.basename(s.url))) : Buffer.from(await (await fetch(s.url)).arrayBuffer());
    demand(sha(archive) === s.archiveSha256, 'ORACLE_ARCHIVE_HASH_MISMATCH:' + s.id);
    const member = zipMember(archive, s.memberName);
    demand(sha(member) === s.memberSha256, 'ORACLE_MEMBER_HASH_MISMATCH:' + s.id);
    members[s.id] = member;
    receipts.push({ id: s.id, url: s.url, archiveSha256: s.archiveSha256, memberName: s.memberName, memberSha256: s.memberSha256, memberBytes: member.length });
  }
  const parsed = parseOracles(members, manifest.window);
  for (const [k, rows] of Object.entries(parsed)) demand(rows.length === manifest.expectedMonths, 'ORACLE_WINDOW_ROWS_MISMATCH:' + k);
  const bytes = Buffer.from(JSON.stringify({ schema: 'supertrader-v4-oracle-parsed-private-1.0.0', window: manifest.window, parsed }));
  fs.writeFileSync(path.join(dir, 'oracle-parsed.json'), bytes, { mode: 0o600 });
  const receipt = { schema: 'supertrader-v4-oracle-capture-receipt-1.0.0', status: 'V4_ORACLE_CAPTURED_HASH_VERIFIED', manifestSha256: sha(fs.readFileSync(ORACLE_MANIFEST_PATH)), sources: receipts,
    parsedSha256: sha(bytes), months: manifest.expectedMonths, valuesPublished: false };
  if (publicOut) { fs.mkdirSync(path.dirname(path.resolve(publicOut)), { recursive: true }); fs.writeFileSync(publicOut, JSON.stringify(receipt, null, 2) + '\n'); }
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  captureOracles({ out: get('--out'), publicOut: get('--public-out'), fromDir: get('--from-dir') })
    .then((r) => process.stdout.write(JSON.stringify({ status: r.status, sources: r.sources.length, parsedSha256: r.parsedSha256 }) + '\n'))
    .catch((e) => { process.stderr.write(JSON.stringify({ phase: 'V4_ORACLE_CAPTURE', code: /^[A-Z0-9_:]+$/.test(e.message) ? e.message : 'ORACLE_CAPTURE_FAILED' }) + '\n'); process.exitCode = 1; });
}
