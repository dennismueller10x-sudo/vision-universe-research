#!/usr/bin/env node
'use strict';
// Erzeugt die eingefrorene Kopie einer Security-Master-Generation (quant/config/security-master-generations.json).
// Die Bytes kommen aus einem Git-Objekt (--commit, Standard HEAD) des committeten Produktstamms; geschrieben wird nur,
// wenn SHA-256, Groesse und Git-Blob exakt dem Registereintrag entsprechen. Eine vorhandene Kopie wird nie
// ueberschrieben: stimmt sie, endet das Skript ohne Aenderung, weicht sie ab, bricht es ab.
//   node scripts/quant/pin-security-master-generation.cjs --generation us-security-master-1.1.0 [--commit <rev>] [--check]
// --check  schreibt nichts, prueft nur die vorhandene Kopie gegen das Register (Exit 1 bei Abweichung).
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const G = require('../../quant/engines/security-master-generation.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const GENERATED = ['quant/data', 'discover/data', 'supertrader/data', 'social/data'];

function pin({ root = ROOT, generation, commit = 'HEAD', check = false, git = (args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 }) }) {
  const reg = G.registry(root), g = reg.generations[generation];
  if (!g) throw Error('MASTER_GENERATION_UNKNOWN:' + generation);
  if (GENERATED.some(d => g.file === d || g.file.startsWith(d + '/'))) throw Error('MASTER_GENERATION_TARGET_IN_GENERATED_PATH:' + g.file);
  const target = path.join(root, g.file);
  if (fs.existsSync(target)) {
    const h = G.sha256(fs.readFileSync(target, 'utf8'));
    if (h !== g.sha256) throw Error('MASTER_GENERATION_COPY_DIFFERS:' + generation);
    return { generation, state: 'ALREADY_PINNED', file: g.file, sha256: h };
  }
  if (check) throw Error('MASTER_GENERATION_FILE_MISSING:' + generation);
  const blob = String(git(['rev-parse', `${commit}:${G.LIVE_FILE}`])).trim();
  if (g.gitBlob && blob !== g.gitBlob) throw Error('MASTER_GENERATION_SOURCE_BLOB_MISMATCH:' + blob);
  const bytes = git(['cat-file', 'blob', blob]);
  if (bytes.length !== g.bytes || G.sha256(bytes.toString('utf8')) !== g.sha256) throw Error('MASTER_GENERATION_SOURCE_HASH_MISMATCH');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return { generation, state: 'PINNED', file: g.file, sha256: g.sha256, sourceBlob: blob, commit };
}

if (require.main === module) {
  const argv = process.argv.slice(2), at = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  try {
    const r = pin({ generation: at('--generation'), commit: at('--commit') || 'HEAD', check: argv.includes('--check') });
    console.log(JSON.stringify(r));
  } catch (e) { console.error(e.message); process.exit(1); }
}
module.exports = { pin };
