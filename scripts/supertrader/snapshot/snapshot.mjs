#!/usr/bin/env node
// Supertrader — Durable Research Snapshot: Capture, Wiederherstellung, Paritaetspruefung.
//
//   capture  EIN Job liest alle Eingaben einmal (loadPitData, aufzeichnend), prueft sie, legt sie
//            unveraenderlich ab, liest sie zur Kontrolle zurueck und schreibt den CAPTURE-Beleg.
//   restore  Ein UNABHAENGIGER Job (neuer Runner, Capture-Job beendet) oeffnet denselben Snapshot,
//            prueft jedes Byte, baut den Datensatz neu, rechnet den Kontroll-Backtest und schreibt
//            einen RESTORE-Beleg. Jede Abweichung: INPUT_INTEGRITY_FAILURE, keine Veroeffentlichung.
//   compare  Vergleicht die Ergebnisse mehrerer Restore-Jobs (parallele Konsumenten).
//
// Oeffentliche Ausgabe (--out): nur Hashes, Zaehlungen, Reason Codes. Keine Ticker, keine Kurse.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as K from './contract.mjs';
import { createSnapshotStore, packShards, unpackShards } from './store.mjs';
import { createRecordingIO, createReplayIO } from './io.mjs';
import { datasetFingerprint, replayFingerprint } from './replay.mjs';
import { loadPitData, LIVE_IO, PIT_REPO_FILES } from '../validation/analyze-methods.mjs';
import * as L from '../validation/lib.mjs';
import { SIMULATOR_VERSION } from '../engine/simulator.mjs';
import { RESEARCH_ACCOUNTING_ID, RESEARCH_ACCOUNTING_VERSION } from '../validation/accounting-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const Identity = require(path.join(root, 'core/identity.js'));
const Guard = require(path.join(root, 'quant/engines/zero-cost-guard.js'));
const Codec = require(path.join(root, 'quant/engines/bar-codec.js'));

// Zusaetzliche Quellobjekte, die andere Runden lesen (Holdout-SEC-PIT), relativ zum Serien-Praefix.
export const EXTRA_SERIES_KEYS = Object.freeze(['_validation/sec-pit-r12.json.gz']);
// Kanonische Ladeflags: Obermenge aller Runden (Nicht-Aktien werden erst beim Laden ausgeschlossen).
export const CANONICAL_LOAD = Object.freeze({ excludeNonEquity: false, secPit: true, delistPit: true, cross: false });

export function provenanceFromEnv(env = process.env) {
  return { runId: env.GITHUB_RUN_ID || 'local', runAttempt: env.GITHUB_RUN_ATTEMPT || null, workflow: env.GITHUB_WORKFLOW || null, job: env.SNAPSHOT_JOB || env.GITHUB_JOB || 'local', commit: env.GITHUB_SHA || null, ref: env.GITHUB_REF_NAME || null, runner: env.RUNNER_NAME || null, node: process.version };
}

function securityIdsHash(listings) {
  const rows = listings.map((l) => { let sid = null; try { sid = Identity.securityIdForTicker(l.ticker); } catch { sid = null; } return [l.id, sid]; }).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { scheme: 'listingId = tiingo:<EXCHANGE>:<TICKER>:<startDate>; securityId = core/identity.js securityIdForTicker', count: rows.length, withSecurityId: rows.filter((r) => r[1]).length, sha256: K.sha256(K.canonicalJson(rows)) };
}

// ---------------------------------------------------------------------------------------------- capture
export async function captureSnapshot({ live = LIVE_IO, store, provenance, limit = 0, smoke = false, asOfDate = new Date().toISOString().slice(0, 10), log = () => {}, guardUsage = null } = {}) {
  const retention = await store.assertRetention();
  const rec = createRecordingIO(live);
  for (const f of PIT_REPO_FILES) rec.readRepoFile(f);
  const pit = await loadPitData({ LIMIT: limit, log, ...CANONICAL_LOAD, io: rec });
  const d = await rec.createDriver();
  for (const k of EXTRA_SERIES_KEYS) await d.get(pit.mine.seriesPrefix + k);
  const dataset = datasetFingerprint(pit);
  const replay = replayFingerprint(pit);
  log(`Capture gelesen: ${rec.rec.objects.size} Quellobjekte, ${dataset.counts.segments} Segmente, Kontroll-Backtest ${replay.trades} Trades`);

  const entries = [...rec.rec.objects].map(([key, bytes]) => ({ key, bytes }));
  const { shards, index } = packShards(entries);
  const side = [{ role: 'TICKER_LIST_ZIP', bytes: rec.rec.tickerZip }, ...PIT_REPO_FILES.map((p) => ({ role: 'REPO_FILE', path: p, bytes: rec.rec.repoFiles.get(p) }))];
  const totalBytes = shards.reduce((a, s) => a + s.length, 0) + side.reduce((a, s) => a + (s.bytes?.length || 0), 0);
  if (totalBytes > K.RETENTION.maxSnapshotBytes) K.fail(K.REASON.SNAPSHOT_SIZE_CAP_EXCEEDED, String(totalBytes));
  await store.assertRetention(totalBytes);
  // Nullkostenschranke VOR dem ersten Schreiben: Speicherzuwachs und Schreibvorgaenge gegen die Freigrenze.
  if (guardUsage) {
    const est = Guard.estimateOperations({ kind: 'RESEARCH_SNAPSHOT_CAPTURE', objectWrites: shards.length + side.length + 2, objectHeads: shards.length + side.length + 2, objectReads: shards.length + side.length + 2, listPages: 2, bytesDelta: totalBytes });
    const verdict = Guard.evaluate({ usage: guardUsage, estimate: est, operation: 'RESEARCH_SNAPSHOT_CAPTURE' });
    log(`Zero-Cost-Guard (Snapshot): ${verdict.verdict}`);
    if (verdict.verdict !== Guard.ALLOWED) K.fail(K.REASON.ZERO_COST_GUARD_BLOCKED, verdict.reason || '');
  }

  const shardRefs = [];
  for (const s of shards) { const r = await store.putObject(s); shardRefs.push({ sha256: r.sha256, bytes: r.bytes }); }
  const sideRefs = [];
  for (const s of side) {
    if (!s.bytes) { sideRefs.push({ role: s.role, path: s.path, missing: true }); continue; }
    const r = await store.putObject(s.bytes); sideRefs.push({ role: s.role, path: s.path, sha256: r.sha256, bytes: r.bytes });
  }
  // Kontrolle: alles zuruecklesen und gegen die Hashes pruefen, bevor das Manifest existiert.
  for (const r of [...shardRefs, ...sideRefs.filter((x) => !x.missing)]) await store.getObject(r.sha256);

  const zipRef = sideRefs.find((x) => x.role === 'TICKER_LIST_ZIP');
  const manifest = {
    contract: K.CONTRACT_VERSION, snapshotId: null, generation: retention.nextGeneration, complete: true, smoke,
    asOfDate, window: { name: L.WINDOW_NAME, ...L.WINDOW }, capture: { limit: limit || null, load: CANONICAL_LOAD, extraSeriesKeys: EXTRA_SERIES_KEYS, capturedAt: new Date().toISOString() },
    provenance, codec: Codec.availableCodec ? Codec.availableCodec() : null, convention: await K.conventionFingerprint(), code: K.codeFingerprint(),
    engines: { simulator: SIMULATOR_VERSION, accounting: `${RESEARCH_ACCOUNTING_ID}@${RESEARCH_ACCOUNTING_VERSION}`, snapshot: K.CONTRACT_VERSION },
    universe: { tickerListSource: L.LIST_URL, tickerListSha256: zipRef.sha256, tickerListBytes: zipRef.bytes, listingTableHash: pit.hash, listings: dataset.counts.listings, activeAtAsOf: dataset.counts.activeListings, inactiveAtAsOf: dataset.counts.inactiveListings, members: dataset.counts.members, listingStatusBasis: 'Tiingo supported_tickers endDate/active zum Capture-Zeitpunkt (asOfDate)' },
    identity: securityIdsHash(pit.listings),
    sideObjects: sideRefs, objects: { shards: shardRefs, index, sourceObjects: index.filter((e) => !e.missing).length, recordedMissing: index.filter((e) => e.missing).length, totalBytes },
    dataset, replay,
    privacy: { storage: 'privater R2-Eimer (VU_HISTORY_S3_*), Praefix ' + store.prefix, publicArtifacts: 'nur Hashes, Zaehlungen, Reason Codes', providerRawDataInGit: false },
  };
  manifest.snapshotId = K.snapshotIdOf(manifest);
  await store.putManifest(manifest);
  K.checkManifest(await store.getManifest(manifest.snapshotId), { snapshotId: manifest.snapshotId });
  const receipt = { role: 'CAPTURE', snapshotId: manifest.snapshotId, runId: provenance.runId, job: provenance.job, at: new Date().toISOString(), objectsVerified: shardRefs.length + sideRefs.filter((x) => !x.missing).length, bytesVerified: totalBytes, datasetSha256: K.sha256(K.canonicalJson(dataset)), replaySha256: replay.sha256 };
  await store.putReceipt(manifest.snapshotId, receipt);
  return { manifest, receipt, pit };
}

// ---------------------------------------------------------------------------------------------- open
// Fail-closed: jeder Verstoss wirft SnapshotError (INPUT_INTEGRITY_FAILURE:<CODE>).
export async function openSnapshot({ store, snapshotId, expect = {}, requireRestoreReceipt = false } = {}) {
  if (!snapshotId || !String(snapshotId).startsWith(K.ID_PREFIX)) K.fail(K.REASON.SNAPSHOT_NOT_FOUND, String(snapshotId));
  const manifest = await store.getManifest(snapshotId);
  K.checkManifest(manifest, { snapshotId, convention: await K.conventionFingerprint(), window: { name: L.WINDOW_NAME, ...L.WINDOW }, ...expect });
  if (requireRestoreReceipt) {
    const receipts = await store.listReceipts(snapshotId);
    const independent = receipts.filter((r) => r.role === 'RESTORE' && r.snapshotId === snapshotId && r.pass === true && (r.runId !== manifest.provenance.runId || r.job !== manifest.provenance.job));
    if (!independent.length) K.fail(K.REASON.SNAPSHOT_NOT_RESTORABLE, 'no independent RESTORE receipt');
  }
  const shardBufs = [];
  for (const s of manifest.objects.shards) { const b = await store.getObject(s.sha256); if (b.length !== s.bytes) K.fail(K.REASON.OBJECT_HASH_MISMATCH, s.sha256); shardBufs.push(b); }
  const objects = unpackShards(shardBufs, manifest.objects.index);
  let tickerZip = null; const repoFiles = new Map();
  for (const s of manifest.sideObjects) {
    const b = s.missing ? null : await store.getObject(s.sha256);
    if (s.role === 'TICKER_LIST_ZIP') { if (!b) K.fail(K.REASON.TICKER_LIST_NOT_IN_SNAPSHOT); if (K.sha256(b) !== manifest.universe.tickerListSha256) K.fail(K.REASON.TICKER_LIST_NOT_IN_SNAPSHOT); tickerZip = b; }
    else repoFiles.set(s.path, b);
  }
  const bytes = shardBufs.reduce((a, b) => a + b.length, 0) + (tickerZip?.length || 0) + [...repoFiles.values()].reduce((a, b) => a + (b?.length || 0), 0);
  return { manifest, io: createReplayIO({ tickerZip, repoFiles, objects }), verified: { shards: shardBufs.length, sourceObjects: objects.size, sideObjects: manifest.sideObjects.length, bytes } };
}

// Nach loadPitData mit Snapshot-IO: Datensatz und Kontroll-Backtest muessen dem Capture entsprechen.
// Review F6: Datensatz- und Backtest-Fingerabdruck haengen vom Code ab. Bei gleichem Code muessen sie exakt
// stimmen. Bei geaendertem Code (CODE_VERSION_CHANGED) ist die Byte-Integritaet (Objekt-Hashes) der Nachweis;
// die neu gerechneten Fingerabdruecke muessen dann zwischen parallelen Konsumenten identisch sein.
export function verifyAgainstManifest(manifest, pit, { replay = true } = {}) {
  const codeVersionChanged = manifest.code.sha256 !== K.codeFingerprint().sha256;
  const dataset = datasetFingerprint(pit);
  const datasetSame = K.canonicalJson(dataset) === K.canonicalJson(manifest.dataset);
  if (!datasetSame && !codeVersionChanged) K.fail(K.REASON.DATASET_FINGERPRINT_MISMATCH, diffKeys(dataset, manifest.dataset));
  const rp = replay ? replayFingerprint(pit) : null;
  if (rp && rp.sha256 !== manifest.replay.sha256 && !codeVersionChanged) K.fail(K.REASON.REPLAY_FINGERPRINT_MISMATCH);
  return { dataset, replay: rp, codeVersionChanged, datasetVerified: datasetSame ? 'EXACT' : 'CODE_VERSION_CHANGED', replayVerified: !rp ? null : rp.sha256 === manifest.replay.sha256 ? 'EXACT' : 'CODE_VERSION_CHANGED' };
}
function diffKeys(a, b) { return Object.keys({ ...a, ...b }).filter((k) => K.canonicalJson(a[k]) !== K.canonicalJson(b[k])).join(','); }

// ---------------------------------------------------------------------------------------------- restore
export async function restoreSnapshot({ store, snapshotId, provenance, log = () => {} } = {}) {
  const t0 = Date.now();
  const opened = await openSnapshot({ store, snapshotId });
  const pit = await loadPitData({ LIMIT: opened.manifest.capture.limit || 0, log, ...CANONICAL_LOAD, io: opened.io });
  const v = verifyAgainstManifest(opened.manifest, pit);
  const receipt = { role: 'RESTORE', pass: true, snapshotId, runId: provenance.runId, job: provenance.job, runner: provenance.runner, at: new Date().toISOString(), captureRunId: opened.manifest.provenance.runId, captureJob: opened.manifest.provenance.job,
    objectsVerified: opened.verified.shards + opened.verified.sideObjects, sourceObjects: opened.verified.sourceObjects, bytesVerified: opened.verified.bytes,
    datasetSha256: K.sha256(K.canonicalJson(v.dataset)), replaySha256: v.replay.sha256, counts: v.dataset.counts, codeVersionChanged: v.codeVersionChanged, datasetVerified: v.datasetVerified, replayVerified: v.replayVerified,
    attempt: provenance.runAttempt || null, codeSha256: K.codeFingerprint().sha256, seconds: Math.round((Date.now() - t0) / 1000) };
  await store.putReceipt(snapshotId, receipt);
  return { manifest: opened.manifest, receipt, dataset: v.dataset, replay: v.replay };
}

// Parallele Konsumenten: alle muessen identische Eingaben gesehen haben.
export function compareConsumers(results) {
  const keys = ['snapshotId', 'datasetSha256', 'replaySha256', 'bytesVerified', 'sourceObjects', 'codeSha256'];
  const first = results[0];
  const divergent = results.filter((r) => keys.some((k) => r[k] !== first[k]));
  return { consumers: results.length, identical: divergent.length === 0 && results.length >= 2, compared: keys, values: Object.fromEntries(keys.map((k) => [k, [...new Set(results.map((r) => r[k]))]])), reason: divergent.length ? K.REASON.PARALLEL_INPUT_DIVERGENCE : null };
}

// ---------------------------------------------------------------------------------------------- oeffentliche Ausgaben
export function publicCapture(manifest, receipt) {
  return { schema: 'supertrader-snapshot-integrity-result-1.0.0', snapshotId: manifest.snapshotId, generation: manifest.generation, smoke: manifest.smoke, asOfDate: manifest.asOfDate, window: manifest.window, contract: manifest.contract,
    provenance: manifest.provenance, codec: manifest.codec, convention: manifest.convention, codeSha256: manifest.code.sha256, engines: manifest.engines,
    universe: { tickerListSha256: manifest.universe.tickerListSha256, tickerListBytes: manifest.universe.tickerListBytes, listingTableHash: manifest.universe.listingTableHash, listings: manifest.universe.listings, activeAtAsOf: manifest.universe.activeAtAsOf, inactiveAtAsOf: manifest.universe.inactiveAtAsOf, members: manifest.universe.members },
    identity: { count: manifest.identity.count, withSecurityId: manifest.identity.withSecurityId, sha256: manifest.identity.sha256 },
    objects: { shards: manifest.objects.shards.length, sourceObjects: manifest.objects.sourceObjects, recordedMissing: manifest.objects.recordedMissing, totalBytes: manifest.objects.totalBytes, sideObjects: manifest.sideObjects.map((s) => ({ role: s.role, path: s.path || null, sha256: s.sha256 || null, bytes: s.bytes || null, missing: !!s.missing })) },
    datasetCounts: manifest.dataset.counts, datasetSha256: receipt.datasetSha256, replay: { config: manifest.replay.config, segments: manifest.replay.segments, trades: manifest.replay.trades, reconciled: manifest.replay.reconciled, sha256: manifest.replay.sha256 },
    captureReceipt: { runId: receipt.runId, job: receipt.job, objectsVerified: receipt.objectsVerified, bytesVerified: receipt.bytesVerified }, status: 'CAPTURED_AND_VERIFIED' };
}
export function publicRestore(r) {
  return { snapshotId: r.receipt.snapshotId, pass: r.receipt.pass, runId: r.receipt.runId, job: r.receipt.job, captureRunId: r.receipt.captureRunId, captureJob: r.receipt.captureJob, independentOfCapture: r.receipt.runId !== r.receipt.captureRunId || r.receipt.job !== r.receipt.captureJob,
    objectsVerified: r.receipt.objectsVerified, sourceObjects: r.receipt.sourceObjects, bytesVerified: r.receipt.bytesVerified, datasetSha256: r.receipt.datasetSha256, replaySha256: r.receipt.replaySha256, counts: r.receipt.counts,
    datasetVerified: r.receipt.datasetVerified, replayVerified: r.receipt.replayVerified, codeVersionChanged: r.receipt.codeVersionChanged, codeSha256: r.receipt.codeSha256, seconds: r.receipt.seconds };
}

// ---------------------------------------------------------------------------------------------- CLI
async function realDriver() {
  const e = process.env;
  if (!e.VU_HISTORY_S3_ENDPOINT || !e.VU_HISTORY_S3_BUCKET || !e.VU_HISTORY_S3_ACCESS_KEY_ID || !e.VU_HISTORY_S3_SECRET_ACCESS_KEY) K.fail(K.REASON.PRIVATE_DATA_UNAVAILABLE, 'VU_HISTORY_S3_* nicht gesetzt');
  return LIVE_IO.createDriver();
}
async function usageOf(driver) {
  const Store = require(path.join(root, 'quant/engines/history-store.js'));
  const budget = Guard.createBudget({ classAOperations: 50, classBOperations: 100 });
  const a = Store.createHistoryStore({ driver, provider: L.SERIES_PROVIDER, market: 'US', budget }), b = Store.createHistoryStore({ driver, provider: 'tiingo', market: 'US', budget });
  const u = await a.readUsage(), v = await b.readUsage();
  return { usage: Guard.applyUsage(v, { classAOperations: u.classAOperations, classBOperations: u.classBOperations }), store: a };
}

async function main() {
  const [cmd, ...argv] = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const out = arg('--out'); const smoke = argv.includes('--smoke');
  if (!out) { console.error('--out <dir> erforderlich'); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });
  const log = (m) => console.log(`[snapshot ${cmd}] ${m}`);
  const write = (name, obj) => fs.writeFileSync(path.join(out, name), JSON.stringify(obj, null, 1) + '\n');
  const ghOut = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
  const provenance = provenanceFromEnv();
  try {
    const needsStore = cmd === 'capture' || cmd === 'restore';
    const driver = needsStore ? await realDriver() : null;
    const meter = { classA: 0, classB: 0 };
    const store = needsStore ? createSnapshotStore({ driver, smoke, meter }) : null;
    if (cmd === 'capture') {
      const { usage, store: usageStore } = await usageOf(driver);
      const { manifest, receipt } = await captureSnapshot({ store, provenance, smoke, limit: Number(arg('--limit', '0')), log, guardUsage: usage });
      await usageStore.writeUsage(Guard.applyUsage(await usageStore.readUsage(), { classAOperations: meter.classA + 1, classBOperations: meter.classB + manifest.objects.sourceObjects, bytesUploaded: manifest.objects.totalBytes, run: { at: new Date().toISOString(), kind: 'RESEARCH_SNAPSHOT_CAPTURE', classA: meter.classA } }));
      write('capture.json', publicCapture(manifest, receipt));
      ghOut('snapshot_id', manifest.snapshotId);
      log(`Snapshot ${manifest.snapshotId} gespeichert und geprueft (${manifest.objects.sourceObjects} Quellobjekte, ${manifest.objects.totalBytes} Byte)`);
    } else if (cmd === 'restore') {
      const id = arg('--id');
      const r = await restoreSnapshot({ store, snapshotId: id, provenance, log });
      const pub = publicRestore(r);
      write(`restore-${provenance.job}.json`, pub);
      ghOut('result', JSON.stringify(pub));
      log(`Snapshot ${id} unabhaengig wiederhergestellt: ${pub.objectsVerified} Objekte, ${pub.bytesVerified} Byte, Datensatz ${pub.datasetSha256.slice(0, 12)}, Kontroll-Backtest ${pub.replaySha256.slice(0, 12)}`);
    } else if (cmd === 'compare') {
      const files = argv.filter((a) => a.endsWith('.json') && fs.existsSync(a));
      const c = compareConsumers(files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))));
      write('parallel-consistency.json', c);
      if (!c.identical) K.fail(c.reason || K.REASON.PARALLEL_INPUT_DIVERGENCE);
      log(`${c.consumers} Konsumenten mit identischen Eingaben`);
    } else { console.error('Befehl: capture | restore | compare'); process.exit(2); }
  } catch (e) {
    const code = e instanceof K.SnapshotError ? e.code : 'UNEXPECTED_ERROR';
    // Objektschluessel enthalten Ticker: oeffentlich nur als Hash.
    const raw = e instanceof K.SnapshotError ? String(e.detail) : String(e?.message || e);
    const detail = raw.replace(/[\w.@-]+\/[\w./@#-]+/g, (k) => 'key#' + K.sha256(k).slice(0, 12)).slice(0, 200);
    write(`failure-${cmd}-${provenance.job}.json`, { status: K.REASON.INPUT_INTEGRITY_FAILURE, reason: code, detail, publish: false });
    console.error(`${K.REASON.INPUT_INTEGRITY_FAILURE}: ${code}`);
    process.exit(3);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
void zlib;
