#!/usr/bin/env node
// Minervini Canonical Replication – Fidelity Freeze.
//
//   node scripts/supertrader/replication/minervini/freeze.mjs --check
//   node scripts/supertrader/replication/minervini/freeze.mjs --write --commit <sha>   (nur nach bestandenem Red-Team-Review)
//
// Der Freeze haelt Regelbuch-Hash, Code-Hash (alle Dateien der Engine), Datenschema und Engine-Version fest.
// measure.mjs laeuft nur gegen einen gueltigen Freeze. Jede spaetere Aenderung an Regelbuch oder Engine-Code
// laesst verifyFreeze() und den Test MR-T-FREEZE scheitern: eine neue Version braucht einen neuen Freeze.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA as SEC_SCHEMA, ROW } from './sec-facts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..');
export const FREEZE_PATH = path.join(root, 'scripts/supertrader/fidelity/MINERVINI-FIDELITY-FREEZE.json');
export const RULEBOOK_REL = 'scripts/supertrader/fidelity/MINERVINI-CANONICAL-REPLICATION.json';
// Gemeinsam genutzte Bausteine: nur protokolliert (ihre Aenderung soll andere Produkte nicht blockieren);
// ihr Verhalten sichern die Regeltests in tests/minervini-replication.test.mjs.
export const SHARED_DEPENDENCIES = Object.freeze([
  'scripts/supertrader/engine/indicators.mjs',
  'quant/engines/return-series.js',
  'scripts/supertrader/fidelity/taxonomy.mjs',
  'scripts/supertrader/fidelity/product-classes.mjs',
  'scripts/supertrader/validation/lib.mjs',
  'scripts/supertrader/validation/analyze-methods.mjs',
]);

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (p) => path.relative(root, p).split(path.sep).join('/');

export function engineFiles() {
  return fs.readdirSync(here).filter((f) => f.endsWith('.mjs')).sort().map((f) => rel(path.join(here, f)));
}

export function computeHashes() {
  const files = engineFiles().map((p) => ({ path: p, sha256: sha(fs.readFileSync(path.join(root, p))) }));
  const codeHash = sha(files.map((f) => `${f.path}:${f.sha256}`).join('\n'));
  const rulebookHash = sha(fs.readFileSync(path.join(root, RULEBOOK_REL)));
  const shared = SHARED_DEPENDENCIES.map((p) => ({ path: p, sha256: sha(fs.readFileSync(path.join(root, p))) }));
  return { files, codeHash, rulebookHash, shared };
}

export function verifyFreeze(file = FREEZE_PATH) {
  if (!fs.existsSync(file)) return { ok: false, reason: 'MINERVINI-FIDELITY-FREEZE.json fehlt' };
  const f = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (f.status !== 'FROZEN') return { ok: false, reason: `Status ${f.status}` };
  const h = computeHashes();
  if (h.rulebookHash !== f.rulebookHash) return { ok: false, reason: 'Regelbuch seit dem Freeze geaendert' };
  if (h.codeHash !== f.codeHash) {
    const changed = h.files.filter((x) => !f.codeFiles.some((y) => y.path === x.path && y.sha256 === x.sha256)).map((x) => x.path);
    return { ok: false, reason: 'Engine-Code seit dem Freeze geaendert: ' + changed.join(', ') };
  }
  const sharedChanged = h.shared.filter((x) => !(f.sharedDependencies || []).some((y) => y.path === x.path && y.sha256 === x.sha256)).map((x) => x.path);
  return { ok: true, rulebookHash: h.rulebookHash, codeHash: h.codeHash, commit: f.commit, sharedChanged };
}

export function dataSchema() {
  return {
    secFacts: { schema: SEC_SCHEMA, rowLayout: Object.keys(ROW), storeKey: '_validation/sec-pit-mrepl-1.json.gz (privater Eimer, je Fenster eigener Namensraum)', visibility: 'filed < Ausfuehrungstag (MR-PIT-01)' },
    prices: 'Tiingo-Rohkerzen, split-bereinigt ueber validation/lib.mjs#adjustSeries (Messung wie R14); Split-Verhaeltnisse fuer EPS aus quant/engines/return-series.js#splitFactors',
    relativeStrength: 'cross.rs aus validation/analyze-methods.mjs#loadPitData (point-in-time Querschnitt), Definition MR-TT-08 rs.definitionId',
    universe: 'loadPitData({excludeNonEquity:true, delistPit:true}) wie R14; Messrahmen MR-UNI-01',
  };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--check')) { const v = verifyFreeze(); console.log(JSON.stringify(v, null, 2)); process.exit(v.ok ? 0 : 1); }
  if (!argv.includes('--write')) { console.error('Aufruf: --check | --write --commit <sha>'); process.exit(2); }
  const i = argv.indexOf('--commit'); const commit = i >= 0 ? argv[i + 1] : null;
  if (!commit || !/^[0-9a-f]{7,40}$/.test(commit)) { console.error('--commit <sha> fehlt'); process.exit(2); }
  const prev = fs.existsSync(FREEZE_PATH) ? JSON.parse(fs.readFileSync(FREEZE_PATH, 'utf8')) : {};
  const h = computeHashes();
  const rb = JSON.parse(fs.readFileSync(path.join(root, RULEBOOK_REL), 'utf8'));
  const out = {
    ...prev,
    schema: 'vu-minervini-fidelity-freeze-1.0.0', status: 'FROZEN', frozenAt: new Date().toISOString().slice(0, 10),
    engine: { id: rb.engine.id, version: rb.engine.version, rulebookVersion: rb.rulebookVersion },
    commit, rulebook: RULEBOOK_REL, rulebookHash: h.rulebookHash, codeHash: h.codeHash, codeFiles: h.files, sharedDependencies: h.shared,
    dataSchema: dataSchema(),
  };
  fs.writeFileSync(FREEZE_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`Freeze geschrieben: Regelbuch ${h.rulebookHash.slice(0, 12)}, Code ${h.codeHash.slice(0, 12)}, Commit ${commit}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
