#!/usr/bin/env node
// Minervini Adaptation 1.1.0 – Fidelity Freeze (Phase 2B). Eigene Datei; der 2A-Freeze bleibt unveraendert.
//
//   node scripts/supertrader/replication/minervini-1.1/freeze.mjs --check
//   node scripts/supertrader/replication/minervini-1.1/freeze.mjs --write --commit <sha>   (nur nach Red-Team-Review)
//
// Festgehalten: Eltern-Freeze (2A, Hash der Datei), Regelbuch-Hash, Quellen-Hash (Quellenverzeichnis + Konfliktregister),
// Code-Hash (alle Dateien dieser Engine + wiederverwendete 2A-Module + Datenlayer), Datenschema-Hashes und Delta-Hash.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { SCHEMA as SEC_SCHEMA, ROW } from '../minervini/sec-facts.mjs';
import { SCHEMA as EVENTS_SCHEMA, EV } from '../../data-layer/sec/earnings-events.mjs';
import { SCHEMA as SIC_SCHEMA } from '../../data-layer/sec/industry-sic.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..');
const R = (p) => path.join(root, p);
export const FREEZE_PATH = R('scripts/supertrader/fidelity/MINERVINI-FIDELITY-FREEZE-1.1.0.json');
export const PARENT_FREEZE_REL = 'scripts/supertrader/fidelity/MINERVINI-FIDELITY-FREEZE.json';
export const RULEBOOK_REL = 'scripts/supertrader/fidelity/MINERVINI-CANONICAL-REPLICATION-1.1.0.json';
export const SOURCE_FILES = Object.freeze(['scripts/supertrader/fidelity/MINERVINI-SOURCE-CONFLICTS.json']);
export const DELTA_REL = 'scripts/supertrader/fidelity/MINERVINI-PHASE2B-FIDELITY-DELTA.json';
// Wiederverwendete, eingefrorene 2A-Module (Verhalten von 1.1 haengt davon ab) und der Datenlayer.
export const REUSED_FILES = Object.freeze([
  'scripts/supertrader/replication/minervini/params.mjs',
  'scripts/supertrader/replication/minervini/trend-template.mjs',
  'scripts/supertrader/replication/minervini/vcp.mjs',
  'scripts/supertrader/replication/minervini/sec-facts.mjs',
  'scripts/supertrader/replication/minervini/sepa.mjs',
  'scripts/supertrader/replication/minervini/signal-engine.mjs',
  'scripts/supertrader/replication/minervini/exit-policy.mjs',
  'scripts/supertrader/replication/minervini/portfolio-policy.mjs',
  'scripts/supertrader/replication/minervini/portfolio-sim.mjs',
  'scripts/supertrader/replication/minervini/metrics.mjs',
  'scripts/supertrader/replication/minervini/measure.mjs',
  'scripts/supertrader/data-layer/sec/earnings-events.mjs',
  'scripts/supertrader/data-layer/sec/industry-sic.mjs',
  // Erzeuger des protokollierten Datenlayers (Zeitraum, CIK-Quelle) und das 2A-Regelbuch: 1.1 liest daraus
  // checkRsDefinition (2A-P) und pit.quarterDays/yearDays (sec-facts bindet 2A-P beim Import; Werte in 1.1 gleich,
  // Test MR11-T-PARAMS-DELTA).
  'scripts/supertrader/data-layer/sec/build-sec-events.mjs',
  'scripts/supertrader/fidelity/MINERVINI-CANONICAL-REPLICATION.json',
]);
// Gemeinsame Bausteine anderer Produkte: nicht im Code-Hash (sonst blockiert jede fremde Aenderung die Tests), aber
// measure.mjs bricht ab, wenn sich einer seit dem Freeze geaendert hat (fail closed, Red-Team M1).
// Erzeuger des Datenlayers samt Modulen, deren Verhalten den gespeicherten Inhalt bestimmt.
export const BUILDER_FILES = Object.freeze([
  'scripts/supertrader/data-layer/sec/build-sec-events.mjs',
  'scripts/supertrader/data-layer/sec/earnings-events.mjs',
  'scripts/supertrader/data-layer/sec/industry-sic.mjs',
  'scripts/supertrader/validation/sec-pit.mjs', // Schluessel der CIK-Quellen (PIT_KEY_R12, DELIST_KEY)
]);
export const MEASUREMENT_FILES = Object.freeze([
  'scripts/supertrader/replication/minervini-1.1/measure.mjs',
  'scripts/supertrader/replication/minervini-1.1/diagnostics.mjs',
  'scripts/supertrader/replication/minervini/metrics.mjs',
]);
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
const fileHash = (p) => ({ path: p, sha256: sha(fs.readFileSync(R(p))) });

export function engineFiles() {
  const own = fs.readdirSync(here).filter((f) => f.endsWith('.mjs')).sort().map((f) => rel(path.join(here, f)));
  return [...own, ...REUSED_FILES];
}

export function dataSchema() {
  return {
    secFacts: { schema: SEC_SCHEMA, rowLayout: Object.keys(ROW), storeKey: '_validation/sec-pit-mrepl-1.json.gz', visibility: 'filed < Ausfuehrungstag (MR-PIT-01)' },
    earningsEvents: { schema: EVENTS_SCHEMA, rowLayout: Object.keys(EV), storeKey: 'sec-events-sic-1.json.gz', visibility: 'filingDate < Handelstag; nur Protokoll (MR-ERN-01 bleibt nicht reproduzierbar)' },
    industrySic: { schema: SIC_SCHEMA, rowLayout: ['filingDate', 'accession', 'sic'], storeKey: 'sec-events-sic-1.json.gz', visibility: 'SIC der juengsten gelesenen Einreichung mit filingDate < Handelstag; nur Protokoll (MR-SEPA-12)' },
    relativeStrength: 'cross.rs aus validation/analyze-methods.mjs#loadPitData, Definition MR-TT-08 rs.definitionId (unveraendert)',
    universe: 'loadPitData({excludeNonEquity:true, delistPit:true}) wie 2A; Messrahmen MR-UNI-01',
  };
}

export function computeHashes() {
  const files = engineFiles().map(fileHash);
  const codeHash = sha(files.map((f) => `${f.path}:${f.sha256}`).join('\n'));
  const rulebookHash = sha(fs.readFileSync(R(RULEBOOK_REL)));
  const rb = JSON.parse(fs.readFileSync(R(RULEBOOK_REL), 'utf8'));
  const sourceHash = sha(JSON.stringify(rb.sources) + '\n' + SOURCE_FILES.map((p) => sha(fs.readFileSync(R(p)))).join('\n'));
  const ds = dataSchema();
  const dataSchemaHashes = Object.fromEntries(Object.entries(ds).map(([k, v]) => [k, sha(JSON.stringify(v))]));
  const deltaHash = sha(fs.readFileSync(R(DELTA_REL)));
  const parent = fileHash(PARENT_FREEZE_REL);
  const shared = SHARED_DEPENDENCIES.map(fileHash);
  return { files, codeHash, rulebookHash, sourceHash, dataSchemaHashes, deltaHash, parent, shared };
}

export function verifyFreeze(file = FREEZE_PATH) {
  if (!fs.existsSync(file)) return { ok: false, reason: 'MINERVINI-FIDELITY-FREEZE-1.1.0.json fehlt' };
  const f = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (f.status !== 'FROZEN') return { ok: false, reason: `Status ${f.status}` };
  const h = computeHashes();
  if (h.parent.sha256 !== f.parent?.freezeSha256) return { ok: false, reason: 'Eltern-Freeze (2A) veraendert' };
  if (h.rulebookHash !== f.rulebookHash) return { ok: false, reason: 'Regelbuch seit dem Freeze geaendert' };
  if (h.sourceHash !== f.sourceHash) return { ok: false, reason: 'Quellen/Konfliktregister seit dem Freeze geaendert' };
  if (h.deltaHash !== f.deltaHash) return { ok: false, reason: 'Fidelity-Delta seit dem Freeze geaendert' };
  for (const [k, v] of Object.entries(h.dataSchemaHashes)) if (f.dataSchemaHashes?.[k] !== v) return { ok: false, reason: `Datenschema ${k} geaendert` };
  if (h.codeHash !== f.codeHash) {
    const changed = h.files.filter((x) => !f.codeFiles.some((y) => y.path === x.path && y.sha256 === x.sha256)).map((x) => x.path);
    return { ok: false, reason: 'Engine-Code seit dem Freeze geaendert: ' + changed.join(', ') };
  }
  const sharedChanged = h.shared.filter((x) => !(f.sharedDependencies || []).some((y) => y.path === x.path && y.sha256 === x.sha256)).map((x) => x.path);
  return { ok: true, rulebookHash: h.rulebookHash, codeHash: h.codeHash, commit: f.commit, sharedChanged };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--check')) { const v = verifyFreeze(); console.log(JSON.stringify(v, null, 2)); process.exit(v.ok ? 0 : 1); }
  if (!argv.includes('--write')) { console.error('Aufruf: --check | --write --commit <sha>'); process.exit(2); }
  const i = argv.indexOf('--commit'); const commit = i >= 0 ? argv[i + 1] : null;
  // Datenbauten je Fenster (Commit des Workflow-Laufs, der den Datenlayer mit dem eingefrorenen Builder erzeugt hat).
  const arg = (k) => { const j = argv.indexOf(k); return j >= 0 ? argv[j + 1] : null; };
  const dataBuilds = { DEV: { commit: arg('--data-dev'), run: arg('--run-dev') }, HOLDOUT: { commit: arg('--data-holdout'), run: arg('--run-holdout') } };
  for (const [w, b] of Object.entries(dataBuilds)) if (!b.commit || !/^[0-9a-f]{40}$/.test(b.commit)) { console.error(`--data-${w.toLowerCase()} <volle sha> fehlt`); process.exit(2); }
  // Der Builder darf sich zwischen Datenbau und Freeze nicht geaendert haben.
  for (const b of Object.values(dataBuilds)) for (const f of BUILDER_FILES) {
    const then = execFileSync('git', ['show', `${b.commit}:${f}`], { cwd: root }); if (sha(then) !== sha(fs.readFileSync(R(f)))) { console.error(`${f} seit dem Datenbau ${b.commit.slice(0, 9)} geaendert`); process.exit(2); }
  }
  if (!commit || !/^[0-9a-f]{7,40}$/.test(commit)) { console.error('--commit <sha> fehlt'); process.exit(2); }
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (!head.startsWith(commit)) { console.error(`--commit ${commit} ist nicht HEAD (${head.slice(0, 12)})`); process.exit(2); }
  if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) { console.error('Arbeitsverzeichnis nicht sauber: erst committen'); process.exit(2); }
  if (fs.existsSync(FREEZE_PATH) && JSON.parse(fs.readFileSync(FREEZE_PATH, 'utf8')).status === 'FROZEN') { console.error('Freeze 1.1.0 existiert bereits und ist unveraenderlich; neue Version noetig.'); process.exit(2); }
  const h = computeHashes();
  const rb = JSON.parse(fs.readFileSync(R(RULEBOOK_REL), 'utf8'));
  const parentFreeze = JSON.parse(fs.readFileSync(R(PARENT_FREEZE_REL), 'utf8'));
  const { CLASSIFICATION, reportAreas } = await import('./engine.mjs');
  const out = {
    schema: 'vu-minervini-fidelity-freeze-1.1.0', status: 'FROZEN', frozenAt: new Date().toISOString().slice(0, 10),
    engine: { id: rb.engine.id, version: rb.engine.version, rulebookVersion: rb.rulebookVersion, methodEra: rb.methodEra.id },
    parent: { freeze: PARENT_FREEZE_REL, freezeSha256: h.parent.sha256, commit: parentFreeze.commit, rulebookHash: parentFreeze.rulebookHash, codeHash: parentFreeze.codeHash, name: parentFreeze.classification.canonicalName },
    commit, rulebook: RULEBOOK_REL, rulebookHash: h.rulebookHash, sourceHash: h.sourceHash, sourceFiles: SOURCE_FILES,
    codeHash: h.codeHash, codeFiles: h.files, sharedDependencies: h.shared,
    dataSchema: dataSchema(), dataSchemaHashes: h.dataSchemaHashes,
    delta: DELTA_REL, deltaHash: h.deltaHash,
    cleanTree: true, timestamp: new Date().toISOString(),
    builderHash: sha(BUILDER_FILES.map((f) => `${f}:${sha(fs.readFileSync(R(f)))}`).join('\n')), builderFiles: BUILDER_FILES,
    measurementHash: sha(MEASUREMENT_FILES.map((f) => `${f}:${sha(fs.readFileSync(R(f)))}`).join('\n')), measurementFiles: MEASUREMENT_FILES,
    dataBuilds,
    fidelityMatrix: JSON.parse(fs.readFileSync(R(DELTA_REL), 'utf8')).areas.map(({ area, phase2AAsFrozen, phase2ARescored, phase2B }) => ({ area, phase2AAsFrozen, phase2ARescored, phase2B })),
    classification: { productClass: CLASSIFICATION.productClass, canonicalName: CLASSIFICATION.canonicalName, displayName: CLASSIFICATION.displayName, replicationClaimAllowed: CLASSIFICATION.replicationClaimAllowed, overallFidelity: CLASSIFICATION.overall, gateAreas: CLASSIFICATION.areas, reportAreas: reportAreas(), blockingReasons: CLASSIFICATION.blockingReasons },
    backtestPolicy: 'Erst nach diesem Freeze. Nur Messung im Rahmen von 2A; das Ergebnis aendert die Engine nicht. DEV und HOLDOUT sind GESEHENE DATEN.',
  };
  fs.writeFileSync(FREEZE_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`Freeze 1.1.0 geschrieben: Regelbuch ${h.rulebookHash.slice(0, 12)}, Code ${h.codeHash.slice(0, 12)}, Commit ${commit}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
