#!/usr/bin/env node
'use strict';
// V12 LISTREF: write the public redacted row files (1.0.3) from the private full versions (1.0.2) - correction after the
// independent V12 review (LISTREF MAJOR 6). No recomputation: the full files are the unchanged 1.0.2 build outputs.
// Usage: node redact_public.cjs --private <scratchpad>/v12-private/listref --out-dir docs/quant-recovery/v12/listref
//   reads  <private>/full/fetch-candidates-1.0.2.json, <private>/full/delisting-register-1.0.2.json.gz, <private>/work/chain-hash-key.txt
//   writes <out-dir>/fetch-candidates-1.0.3.json, <out-dir>/delisting-register-1.0.3.json.gz
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const X = require('./redact.cjs');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

function hashKey(priv) {
  const f = path.join(priv, 'work/chain-hash-key.txt');
  if (!fs.existsSync(f)) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, crypto.randomBytes(32).toString('hex') + '\n', { mode: 0o600 }); }
  return fs.readFileSync(f, 'utf8').trim();
}

function main() {
  const priv = path.resolve(arg('--private') || ''), out = path.resolve(arg('--out-dir') || '');
  if (!arg('--private') || !arg('--out-dir')) throw Error('usage: --private <dir> --out-dir <dir>');
  const key = hashKey(priv);
  const fcBuf = fs.readFileSync(path.join(priv, 'full/fetch-candidates-1.0.2.json')), rgBuf = fs.readFileSync(path.join(priv, 'full/delisting-register-1.0.2.json.gz'));
  const fc = X.redactFetchCandidates(JSON.parse(fcBuf.toString('utf8')), key);
  const rg = X.redactDelistingRegister(JSON.parse(zlib.gunzipSync(rgBuf).toString('utf8')), key);
  const fullSha = { 'fetch-candidates-1.0.2.json': sha(fcBuf), 'delisting-register-1.0.2.json.gz': sha(rgBuf) };
  fc.privateFullVersion = { file: 'v12-private/listref/full/fetch-candidates-1.0.2.json', sha256: fullSha['fetch-candidates-1.0.2.json'] };
  rg.privateFullVersion = { file: 'v12-private/listref/full/delisting-register-1.0.2.json.gz', sha256: fullSha['delisting-register-1.0.2.json.gz'] };
  X.assertRedacted(fc); X.assertRedacted(rg);
  fs.writeFileSync(path.join(out, 'fetch-candidates-1.0.3.json'), JSON.stringify(fc) + '\n');
  fs.writeFileSync(path.join(out, 'delisting-register-1.0.3.json.gz'), zlib.gzipSync(JSON.stringify(rg) + '\n', { level: 9 }));
  console.log(JSON.stringify({ fetchCandidates: fc.count, registerEvents: rg.count, linkedChains: rg.events.reduce((a, e) => a + e[rg.columns.indexOf('linkedChainCount')], 0), fullSha }));
}
if (require.main === module) main();
