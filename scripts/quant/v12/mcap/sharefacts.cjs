#!/usr/bin/env node
'use strict';
// V12 MCAP stage 2 (outcome-free): raw share facts per issuer from the SEC companyfacts bulk archive.
// For every CIK of the observation file (plus its registered predecessor CIKs, quant/config/sec-successor-issuers.json)
// all non-dimensional facts of the share concepts below are extracted with every unit, accession, form and filed date.
// Usage: node sharefacts.cjs --private <dir> [--zip <companyfacts.zip>]
// Reads <private>/observations.json.gz, writes <private>/sharefacts.json.gz.
// Minimal ZIP reader (central directory + raw inflate, no ZIP64): node has no zip module and the repo has no dependencies.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const SCRATCH = '/tmp/claude-0/-home-user-vision-universe-research/f429e7bd-1176-554d-8fa5-5081d98ef531/scratchpad';
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };

const CONCEPTS = Object.freeze({
  'dei:EntityCommonStockSharesOutstanding': 'ECSO',
  'us-gaap:CommonStockSharesOutstanding': 'CSSO',
  'us-gaap:WeightedAverageNumberOfSharesOutstandingBasic': 'WASO_B',
  'us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding': 'WASO_D',
  'us-gaap:WeightedAverageNumberOfShareOutstandingBasicAndDiluted': 'WASO_BD',
  'us-gaap:CommonStockSharesIssued': 'CSSI'
});

function openZip(file) {
  const fd = fs.openSync(file, 'r'), size = fs.fstatSync(fd).size;
  const tailLen = Math.min(size, 65557), tail = Buffer.alloc(tailLen);
  fs.readSync(fd, tail, 0, tailLen, size - tailLen);
  let e = -1; for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw Error('ZIP_EOCD_NOT_FOUND');
  const count = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
  if (count === 0xffff || cdOff === 0xffffffff) throw Error('ZIP64_NOT_SUPPORTED');
  const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, cdOff);
  const entries = new Map();
  for (let p = 0, n = 0; n < count; n++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) throw Error('ZIP_CD_CORRUPT');
    const method = cd.readUInt16LE(p + 10), csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
    const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32), off = cd.readUInt32LE(p + 42);
    entries.set(cd.toString('utf8', p + 46, p + 46 + nl), { method, csize, usize, off });
    p += 46 + nl + xl + cl;
  }
  return {
    names: entries,
    read(name) {
      const en = entries.get(name); if (!en) return null;
      const lh = Buffer.alloc(30); fs.readSync(fd, lh, 0, 30, en.off);
      if (lh.readUInt32LE(0) !== 0x04034b50) throw Error('ZIP_LOCAL_HEADER_CORRUPT');
      const start = en.off + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      const data = Buffer.alloc(en.csize); fs.readSync(fd, data, 0, en.csize, start);
      const out = en.method === 0 ? data : en.method === 8 ? zlib.inflateRawSync(data) : null;
      if (!out || out.length !== en.usize) throw Error('ZIP_ENTRY_UNREADABLE:' + name);
      return out;
    },
    close() { fs.closeSync(fd); }
  };
}

/** Share facts of one companyfacts payload: {code: [[end, start, val, accn, fy, fp, form, filed, unit, frame], ...]} */
function shareFacts(payload) {
  const out = {};
  for (const [full, code] of Object.entries(CONCEPTS)) {
    const [tax, name] = full.split(':');
    const c = payload?.facts?.[tax]?.[name]; if (!c) continue;
    const rows = [];
    for (const [unit, list] of Object.entries(c.units || {})) for (const f of list)
      rows.push([f.end || null, f.start || null, f.val, f.accn || null, f.fy ?? null, f.fp || null, f.form || null, f.filed || null, unit, f.frame || null]);
    rows.sort((a, b) => (a[7] < b[7] ? -1 : a[7] > b[7] ? 1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    out[code] = rows;
  }
  return out;
}

function main() {
  const priv = arg('--private', path.join(SCRATCH, 'v12-private/mcap'));
  const zipFile = arg('--zip', path.join(SCRATCH, 'v10-private/factor/bulk/companyfacts.zip'));
  const t0 = Date.now();
  const obs = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(priv, 'observations.json.gz'))));
  const succ = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/config/sec-successor-issuers.json'), 'utf8'));
  const preds = new Map();
  for (const [k, v] of Object.entries(succ.successors || succ)) if (Array.isArray(v?.predecessors || v)) preds.set(k, (v.predecessors || v).map(p => p.cik || p));
  const ciks = [...new Set(Object.values(obs.listings).map(l => l.cik))].sort();
  const zip = openZip(zipFile), out = {}, missing = [];
  for (const cik of ciks) {
    const own = zip.read('CIK' + cik + '.json');
    if (!own) { missing.push(cik); continue; }
    const p = JSON.parse(own);
    out[cik] = { name: p.entityName || null, facts: shareFacts(p), predecessors: {} };
    for (const pc of preds.get(cik) || []) { const b = zip.read('CIK' + pc + '.json'); if (b) out[cik].predecessors[pc] = shareFacts(JSON.parse(b)); }
  }
  zip.close();
  const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(zipFile), 'manifest.json'), 'utf8'));
  const doc = { schemaVersion: 'v12-mcap-sharefacts-1.0.0', source: { url: manifest.url, sha256: manifest.sha256, bytes: manifest.bytes }, concepts: CONCEPTS,
    columns: ['end', 'start', 'val', 'accn', 'fy', 'fp', 'form', 'filed', 'unit', 'frame'], ciks: ciks.length, missing, issuers: out, seconds: Math.round((Date.now() - t0) / 1000) };
  const text = JSON.stringify(doc);
  fs.writeFileSync(path.join(priv, 'sharefacts.json.gz'), zlib.gzipSync(text));
  console.log(JSON.stringify({ ciks: ciks.length, missing: missing.length, predecessorsMapped: preds.size, sha256: crypto.createHash('sha256').update(text).digest('hex'), seconds: doc.seconds }));
}
if (require.main === module) main();
module.exports = { openZip, shareFacts, CONCEPTS };
