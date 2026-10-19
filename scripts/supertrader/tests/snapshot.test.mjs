// Durable Research Snapshots: Capture, unabhaengige Wiederherstellung, Unveraenderlichkeit,
// Tickerlisten-Drift, parallele Konsumenten und jede Fail-Closed-Regel (Reason Codes).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { buildSources, zipOne, TICKERS_CSV } from './snapshot-fixture.mjs';
import { captureSnapshot, restoreSnapshot, openSnapshot, compareConsumers, publicCapture, publicRestore, verifyAgainstManifest, CANONICAL_LOAD } from '../snapshot/snapshot.mjs';
import { createSnapshotStore, packShards, unpackShards } from '../snapshot/store.mjs';
import { createReplayIO, createRecordingIO } from '../snapshot/io.mjs';
import * as K from '../snapshot/contract.mjs';
import { loadPitData } from '../validation/analyze-methods.mjs';

const prov = (runId, job) => ({ runId, job });
const code = (re) => (e) => e instanceof K.SnapshotError && re.test(e.code) && /^INPUT_INTEGRITY_FAILURE:/.test(e.message);
const filesUnder = (dir, sub) => { const out = []; const base = path.join(dir, sub); const walk = (d) => { if (!fs.existsSync(d)) return; for (const n of fs.readdirSync(d)) { const f = path.join(d, n); if (fs.statSync(f).isDirectory()) walk(f); else out.push(path.relative(dir, f) + ':' + K.sha256(fs.readFileSync(f))); } }; walk(base); return out.sort(); };

async function captured(opts = {}) {
  const src = await buildSources();
  const store = createSnapshotStore({ driver: src.driver, smoke: opts.smoke });
  const cap = await captureSnapshot({ live: src.live, store, provenance: prov('run-1', 'capture'), asOfDate: '2026-10-19' });
  return { src, store, ...cap };
}

test('Capture: eine Tickerliste, alle Quellobjekte bytegleich, ID = Inhalts-Hash, Beleg geschrieben', async () => {
  const { src, store, manifest, receipt } = await captured();
  assert.equal(src.state.zipFetches, 1, 'Tickerliste genau einmal geladen');
  assert.match(manifest.snapshotId, /^sts1-[0-9a-f]{32}$/);
  assert.equal(K.snapshotIdOf(manifest), manifest.snapshotId);
  assert.equal(manifest.complete, true);
  assert.equal(manifest.universe.tickerListSha256, K.sha256(src.state.zip));
  // Jedes aufgezeichnete Quellobjekt ist bytegleich zum Original im Eimer.
  const opened = await openSnapshot({ store, snapshotId: manifest.snapshotId });
  for (const e of manifest.objects.index.filter((x) => !x.missing)) assert.deepEqual(await (await opened.io.createDriver()).get(e.key), await src.driver.get(e.key), e.key);
  assert.ok(manifest.objects.index.some((e) => e.missing), '404 der SEC-r12-Datei wird als fehlend aufgezeichnet');
  assert.equal((await store.listReceipts(manifest.snapshotId)).filter((r) => r.role === 'CAPTURE').length, 1);
  assert.equal(receipt.replaySha256, manifest.replay.sha256);
  for (const f of ['quant/data/market/scale/universe-FULL_UNIVERSE.json', 'quant/data/market/security-master/eligibility.json', 'quant/data/market/security-master/company-names.json']) assert.ok(manifest.sideObjects.some((s) => s.path === f && s.sha256), f);
});

test('Wiederherstellung in einem unabhaengigen Job: identische Bytes, Zaehlungen, Datensatz und Kontroll-Backtest', async () => {
  const { store, manifest, receipt } = await captured();
  const a = await restoreSnapshot({ store, snapshotId: manifest.snapshotId, provenance: prov('run-2', 'restore-a') });
  const b = await restoreSnapshot({ store, snapshotId: manifest.snapshotId, provenance: prov('run-2', 'restore-b') });
  for (const r of [a, b]) {
    assert.equal(r.receipt.pass, true);
    assert.equal(r.receipt.datasetSha256, receipt.datasetSha256);
    assert.equal(r.receipt.replaySha256, receipt.replaySha256);
    assert.deepEqual(r.dataset.counts, manifest.dataset.counts);
  }
  const c = compareConsumers([publicRestore(a), publicRestore(b)]);
  assert.equal(c.identical, true);
  assert.equal(publicRestore(a).independentOfCapture, true);
  // Danach verlangt ein Konsument einen unabhaengigen Wiederherstellungsbeleg - er ist jetzt da.
  await openSnapshot({ store, snapshotId: manifest.snapshotId, requireRestoreReceipt: true });
});

test('Tickerlisten- und Kursdrift nach dem Capture aendern den Snapshot nicht; ein neuer Capture ist eine neue Generation', async () => {
  const { src, store, manifest, receipt } = await captured();
  const before = filesUnder(src.dir, K.STORE_PREFIX);
  // Live-Stand aendert sich: neue Tickerzeile bei Tiingo, AAA bekommt eine neue Kerze.
  src.state.zip = zipOne('supported_tickers.csv', [...TICKERS_CSV, 'NEWCO,NASDAQ,Stock,USD,2014-01-02,2026-10-16'].join('\n'));
  const aaa = await src.main.getSeries('AAA');
  await src.main.putSeries({ ...aaa, bars: [...aaa.bars.slice(0, -1), { ...aaa.bars.at(-1), close: aaa.bars.at(-1).close * 1.5 }] });
  const r = await restoreSnapshot({ store, snapshotId: manifest.snapshotId, provenance: prov('run-3', 'restore') });
  assert.equal(r.receipt.datasetSha256, receipt.datasetSha256);
  assert.equal(r.manifest.universe.tickerListSha256, manifest.universe.tickerListSha256);
  // Neuer Capture: andere Tickerliste, andere ID, Generation 2; der alte Snapshot bleibt Byte fuer Byte.
  const next = await captureSnapshot({ live: src.live, store, provenance: prov('run-4', 'capture'), asOfDate: '2026-10-20' });
  assert.notEqual(next.manifest.snapshotId, manifest.snapshotId);
  assert.notEqual(next.manifest.universe.tickerListSha256, manifest.universe.tickerListSha256);
  assert.equal(next.manifest.generation, 2);
  const after = filesUnder(src.dir, K.STORE_PREFIX);
  for (const f of before) assert.ok(after.includes(f), 'bestehendes Objekt veraendert: ' + f);
  // Ein Konsument, der die alte Tickerliste erwartet, bekommt mit dem neuen Snapshot keinen stillen Wechsel.
  await assert.rejects(openSnapshot({ store, snapshotId: next.manifest.snapshotId, expect: { tickerListSha256: manifest.universe.tickerListSha256 } }), code(/^TICKER_LIST_NOT_IN_SNAPSHOT$/));
});

test('Produktionspfade bleiben unberuehrt; Nutzungszaehler werden nicht aufgezeichnet', async () => {
  const src = await buildSources();
  const prodBefore = filesUnder(src.dir, 'v1');
  const store = createSnapshotStore({ driver: src.driver });
  const { manifest } = await captureSnapshot({ live: src.live, store, provenance: prov('r', 'capture'), asOfDate: '2026-10-19' });
  assert.deepEqual(filesUnder(src.dir, 'v1'), prodBefore);
  assert.ok(manifest.objects.index.every((e) => !/\/_usage\//.test(e.key)));
  assert.ok(K.STORE_PREFIX.startsWith('research-snapshots/') && !K.STORE_PREFIX.startsWith('v1/'));
});

test('Fail closed: fehlendes Quellobjekt, veraenderte Bytes, manipuliertes Manifest, unvollstaendiger Snapshot', async () => {
  const { src, store, manifest } = await captured();
  const shard = manifest.objects.shards[0].sha256;
  const file = path.join(src.dir, store.objectKey(shard));
  const orig = fs.readFileSync(file);
  // veraenderte Bytes
  const bad = Buffer.from(orig); bad[bad.length - 1] ^= 0xff; fs.writeFileSync(file, bad);
  await assert.rejects(openSnapshot({ store, snapshotId: manifest.snapshotId }), code(/^OBJECT_HASH_MISMATCH$/));
  // fehlendes Objekt
  fs.rmSync(file);
  await assert.rejects(openSnapshot({ store, snapshotId: manifest.snapshotId }), code(/^SOURCE_OBJECT_MISSING$/));
  fs.writeFileSync(file, orig);
  // manipuliertes Manifest (Inhalt geaendert, ID nicht)
  const mfile = path.join(src.dir, store.manifestKey(manifest.snapshotId));
  const m = JSON.parse(zlib.gunzipSync(fs.readFileSync(mfile)).toString());
  fs.writeFileSync(mfile, zlib.gzipSync(JSON.stringify({ ...m, asOfDate: '2026-12-31' })));
  await assert.rejects(openSnapshot({ store, snapshotId: manifest.snapshotId }), code(/^MANIFEST_ID_MISMATCH$/));
  // unvollstaendig (konsistent neu gehasht, complete=false)
  const inc = { ...m, complete: false }; inc.snapshotId = K.snapshotIdOf(inc);
  fs.mkdirSync(path.dirname(path.join(src.dir, store.manifestKey(inc.snapshotId))), { recursive: true });
  fs.writeFileSync(path.join(src.dir, store.manifestKey(inc.snapshotId)), zlib.gzipSync(K.canonicalJson(inc)));
  await assert.rejects(openSnapshot({ store, snapshotId: inc.snapshotId }), code(/^SNAPSHOT_INCOMPLETE$/));
  await assert.rejects(openSnapshot({ store, snapshotId: 'sts1-00000000000000000000000000000000' }), code(/^SNAPSHOT_NOT_FOUND$/));
});

test('Fail closed: Stichtag, Fenster, Corporate-Action-Konvention, Contract-Version, Tickerliste, fehlender Wiederherstellungsbeleg', async () => {
  const { store, manifest } = await captured();
  const id = manifest.snapshotId;
  await assert.rejects(openSnapshot({ store, snapshotId: id, expect: { asOfDate: '2026-10-18' } }), code(/^AS_OF_DATE_MISMATCH$/));
  await assert.rejects(openSnapshot({ store, snapshotId: id, expect: { window: { name: 'HOLDOUT' } } }), code(/^WINDOW_MISMATCH$/));
  await assert.rejects(openSnapshot({ store, snapshotId: id, expect: { convention: { sha256: 'x' } } }), code(/^CORPORATE_ACTION_CONVENTION_MISMATCH$/));
  await assert.rejects(openSnapshot({ store, snapshotId: id, expect: { tickerListSha256: 'y' } }), code(/^TICKER_LIST_NOT_IN_SNAPSHOT$/));
  await assert.rejects(openSnapshot({ store, snapshotId: id, requireRestoreReceipt: true }), code(/^SNAPSHOT_NOT_RESTORABLE$/));
  assert.throws(() => K.checkManifest({ ...manifest, contract: 'other' }), code(/^CONTRACT_VERSION_MISMATCH$/));
  assert.throws(() => K.checkManifest(null), code(/^SNAPSHOT_NOT_FOUND$/));
  assert.throws(() => createSnapshotStore({}), code(/^PRIVATE_DATA_UNAVAILABLE$/));
});

test('Fail closed: Datensatz- und Backtest-Fingerabdruck; Konsument ohne Quellobjekt; Snapshot ist schreibgeschuetzt', async () => {
  const { store, manifest } = await captured();
  const opened = await openSnapshot({ store, snapshotId: manifest.snapshotId });
  const pit = await loadPitData({ ...CANONICAL_LOAD, io: opened.io });
  assert.throws(() => verifyAgainstManifest({ ...manifest, dataset: { ...manifest.dataset, segmentsSha256: 'x' } }, pit), code(/^DATASET_FINGERPRINT_MISMATCH$/));
  assert.throws(() => verifyAgainstManifest({ ...manifest, replay: { ...manifest.replay, sha256: 'x' } }, pit), code(/^REPLAY_FINGERPRINT_MISMATCH$/));
  const io = createReplayIO({ tickerZip: Buffer.from('z'), repoFiles: new Map(), objects: new Map() });
  const d = await io.createDriver();
  await assert.rejects(d.get('v1/tiingo/daily/US/AAA.json.zst'), code(/^SOURCE_OBJECT_MISSING$/));
  await assert.rejects(d.put('k', Buffer.from('x')), code(/^SNAPSHOT_READ_ONLY$/));
  assert.equal(await d.get('v1/_usage/tiingo-US-MONTH.json'), null);
  assert.throws(() => io.readRepoFile('quant/data/x.json'), code(/^SOURCE_OBJECT_MISSING$/));
  await assert.rejects(createReplayIO({ tickerZip: null, repoFiles: new Map(), objects: new Map() }).fetchTickerZip(), code(/^TICKER_LIST_NOT_IN_SNAPSHOT$/));
  // Mit anderen Ladeflags (anderes Universum) fehlen Objekte nie still: hier sind alle vorhanden (Obermenge).
  await loadPitData({ excludeNonEquity: true, secPit: true, delistPit: true, cross: false, io: opened.io });
});

test('Unveraenderlichkeit: ein bestehender Inhaltsschluessel wird nie ueberschrieben; Konflikt scheitert geschlossen', async () => {
  const { src, store, manifest } = await captured();
  const shard = manifest.objects.shards[0].sha256;
  const r = await store.putObject(await store.getObject(shard));
  assert.equal(r.written, false);
  fs.writeFileSync(path.join(src.dir, store.objectKey(K.sha256(Buffer.from('abc')))), Buffer.from('xyz'));
  await assert.rejects(store.putObject(Buffer.from('abc')), code(/^SNAPSHOT_OBJECT_CONFLICT$/));
});

test('Kostenschranke: Generationen- und Groessengrenze vor dem ersten Schreiben', async () => {
  const src = await buildSources();
  const store = createSnapshotStore({ driver: src.driver, smoke: true });
  for (let i = 0; i < K.RETENTION.maxSmokeGenerations; i++) await captureSnapshot({ live: src.live, store, provenance: prov('g' + i, 'capture'), asOfDate: '2026-10-19', smoke: true });
  await assert.rejects(captureSnapshot({ live: src.live, store, provenance: prov('gx', 'capture'), asOfDate: '2026-10-19', smoke: true }), code(/^SNAPSHOT_RETENTION_CAP_REACHED$/));
  const full = createSnapshotStore({ driver: src.driver });
  const guardBlocked = { month: '2026-10', classAOperations: 2e6, classBOperations: 0, storageBytes: 0 };
  await assert.rejects(captureSnapshot({ live: src.live, store: full, provenance: prov('gz', 'capture'), asOfDate: '2026-10-19', guardUsage: guardBlocked }), code(/^ZERO_COST_GUARD_BLOCKED$/));
  assert.equal((await full.listManifests()).length, 0, 'blockierter Capture schreibt kein Manifest');
});

test('Parallele Konsumenten: Abweichung ist PARALLEL_INPUT_DIVERGENCE', () => {
  const a = { snapshotId: 's', datasetSha256: 'd', replaySha256: 'r', bytesVerified: 1, sourceObjects: 2 };
  assert.equal(compareConsumers([a, { ...a }]).identical, true);
  const c = compareConsumers([a, { ...a, datasetSha256: 'e' }]);
  assert.equal(c.identical, false);
  assert.equal(c.reason, 'PARALLEL_INPUT_DIVERGENCE');
  assert.equal(compareConsumers([a]).identical, false, 'ein einzelner Konsument ist kein Paritaetsnachweis');
});

test('Shards: deterministisch, Index pro Objekt, Manipulation erkannt', () => {
  const entries = [{ key: 'b', bytes: Buffer.from('bbb') }, { key: 'a', bytes: Buffer.from('aa') }, { key: 'c', bytes: null }];
  const p1 = packShards(entries, 4), p2 = packShards([...entries].reverse(), 4);
  assert.deepEqual(p1.index, p2.index);
  assert.deepEqual(p1.shards.map(K.sha256), p2.shards.map(K.sha256));
  const m = unpackShards(p1.shards, p1.index);
  assert.equal(m.get('a').toString(), 'aa'); assert.equal(m.get('c'), null);
  const bad = p1.shards.map((s) => Buffer.from(s)); bad[0][0] ^= 1;
  assert.throws(() => unpackShards(bad, p1.index), code(/^OBJECT_HASH_MISMATCH$/));
});

test('Oeffentliche Ausgaben enthalten keine Ticker und keine Kurse (Providerdaten bleiben im privaten Eimer)', async () => {
  const { store, manifest, receipt } = await captured();
  const r = await restoreSnapshot({ store, snapshotId: manifest.snapshotId, provenance: prov('run-9', 'restore') });
  const text = JSON.stringify(publicCapture(manifest, receipt)) + JSON.stringify(publicRestore(r));
  for (const t of ['AAA', 'BBB', 'CCC', 'ZZZ', 'Zeta']) assert.ok(!text.includes(t), t);
  assert.ok(!/"(close|open|high|low|adjClose|dividend)":/.test(text), "keine Kursfelder");
  assert.equal(manifest.privacy.providerRawDataInGit, false);
});

test('Aufzeichnung: Schreibversuch im Capture scheitert, Tickerliste wird nicht doppelt geladen', async () => {
  const src = await buildSources();
  const rec = createRecordingIO(src.live);
  await rec.fetchTickerZip(); await rec.fetchTickerZip();
  assert.equal(src.state.zipFetches, 1);
  await assert.rejects((await rec.createDriver()).put('x', Buffer.from('y')), code(/^SNAPSHOT_READ_ONLY$/));
  assert.ok(K.describeContract().reasonCodes.includes('INPUT_INTEGRITY_FAILURE'));
});
