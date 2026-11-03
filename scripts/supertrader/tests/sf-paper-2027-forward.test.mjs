// SF6-PAPER-2027 1.2.0 – Forward-Datenpfad (FP-ST-02 V5; docs/SUPERTRADER_PAPER_2027_FORWARD_PATH.md).
// Forward-Fenster PAPER_2027 in validation/lib.mjs, Forward-Lader auf dem unveraenderten Research-Lader, Protokoll 1.2.0
// neben 1.1.0, Waechter. Nachweis: DEV und HOLDOUT sind auf den Fixtures bytegleich zum Code VOR 1.2.0 (gepinnte Hashes).
// Synthetisch, ohne Netz; Kindprozesse je ST_WINDOW (lib.mjs liest das Fenster einmal beim Import). Schreibt nur unter
// os.tmpdir().
//
// Kindprozess: dieselbe Datei mit PAPER_FWD_PROBE=identity|forward (siehe probe()).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildWindowSources } from './paper-forward-fixture.mjs';
import * as L from '../validation/lib.mjs';
import * as K from '../snapshot/contract.mjs';
import { loadPitData } from '../validation/analyze-methods.mjs';
import { CANONICAL_LOAD } from '../snapshot/snapshot.mjs';
import { datasetFromPit } from '../source-faithful/runner/snapshot-input.mjs';
import { attachSecPit } from '../source-faithful/research/run-sf3-research.mjs';
import { SF6_REFERENCES, REFERENCE_COSTS } from '../source-faithful/research/sf6-references.mjs';
import { datasetFingerprint, replayFingerprint } from '../snapshot/replay.mjs';
import { codeSha256 } from '../source-faithful/runner/run-research.mjs';
import { SF6_PAPER_PROTOCOL, sf6PaperProtocolSha256 } from '../source-faithful/completion/sf6-paper-protocol-2027.mjs';
import { SF6_PAPER_PROTOCOL_1_2_0, SF6_PAPER_PROTOCOL_VERSIONS, currentPaperProtocol, referenceIdentityShown, sf6PaperProtocol120Sha256, SUPERSEDED_1_1_0_SHA256 } from '../source-faithful/completion/sf6-paper-protocol-2027-v1_2_0.mjs';
import { SF6_PAPER_ACTIVATION, ACTIVATED_PROTOCOL_SHA256, FORWARD_DATA_PATHS, activationState, pinCheck } from '../source-faithful/paper/activation-2027.mjs';
import { loadForwardSource, assertForwardWindow, FORWARD_SOURCE_KIND } from '../source-faithful/paper/forward-source.mjs';
import { simulateLog } from '../source-faithful/paper/run-paper-2027.mjs';
import { integrityChecks, datasetSha256 } from '../source-faithful/paper/forward-log.mjs';
import { forwardTodo, forwardTarget } from '../validation/fetch.mjs';

const SELF = fileURLToPath(import.meta.url);
const h = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');

// ------------------------------------------------------------------------------------------------ child process
async function probe(kind) {
  const name = process.env.ST_WINDOW || 'DEV';
  const src = await buildWindowSources(name, { to: process.env.ST_WINDOW_TO || null });
  try {
    if (kind === 'identity') {
      // unchanged from the run that produced the pinned hashes with the code BEFORE 1.2.0 (LISTING_OPTS was undefined)
      const listings = L.buildListingTable(src.rows.slice(1).map((l) => Object.fromEntries(src.rows[0].split(',').map((k, i) => [k, l.split(',')[i]]))), new Map(['AAA', 'BBB', 'CCC', 'DDD', 'EEE'].map((t) => [t, { startDate: '2000-01-03', instrumentType: 'EQUITY_COMMON' }])), L.LISTING_OPTS);
      const pit = await loadPitData({ ...CANONICAL_LOAD, io: src.live });
      const buf = await src.driver.get(pit.mine.seriesPrefix + '_validation/sec-pit-r12.json.gz');
      const ds = datasetFromPit(pit); attachSecPit(ds, JSON.parse(zlib.gunzipSync(buf).toString('utf8')));
      const refs = {};
      for (const ref of SF6_REFERENCES) {
        const x = ref.run(ds, { from: L.WINDOW.from, to: L.WINDOW.to, costs: REFERENCE_COSTS, ...(ref.prep(ds, { from: L.WINDOW.from }) || {}) });
        refs[ref.key] = { ledgerRows: x.run.ledger.length, ledgerSha256: h(x.run.ledger), tradesSha256: h(x.trades), reconciliation: x.run.reconciliation.pass === true };
      }
      const out = {
        window: { name: L.WINDOW_NAME, ...L.WINDOW }, seriesProvider: L.SERIES_PROVIDER, windows: L.WINDOWS,
        convention: (await K.conventionFingerprint()).sha256,
        listingTable: { hash: L.tableHash(listings), rows: listings.map((l) => [l.id, l.active, l.endDate, l.source]) },
        pit: { tableHash: pit.hash, members: pit.members.length, segments: pit.segs.length, calendar: [pit.calendar.length, pit.calendar[0] ?? null, pit.calendar.at(-1) ?? null], dataFingerprint: pit.dataFingerprint.hash, endCauses: pit.segs.map((s) => [s.id, s.endCause, s.delisted]) },
        datasetSha256: K.sha256(K.canonicalJson(datasetFingerprint(pit))), replaySha256: replayFingerprint(pit).sha256,
        references: refs,
      };
      process.stdout.write(JSON.stringify(out));
      return;
    }
    // kind === 'forward': the forward source through the research loader on the fixture io
    const to = L.WINDOW.to, out = { window: { name: L.WINDOW_NAME, ...L.WINDOW }, listingOpts: L.LISTING_OPTS ?? null };
    try { assertForwardWindow('2027-01-05'); out.mismatch = null; } catch (e) { out.mismatch = e.message.split(':')[0]; }
    const src2 = await loadForwardSource(to, { io: src.live });
    out.kind = src2.kind; out.sessions = [src2.sessions.length, src2.sessions[0], src2.sessions.at(-1)];
    const zzz = (t) => src2.at(t).securities.find((s) => s.id.includes(':ZZZ:'));
    out.zzzBefore = zzz('2027-02-04')?.terminal ?? null; out.zzzAfter = zzz('2027-02-12')?.terminal ?? null;
    out.newcAtFirst = Boolean(src2.at(src2.sessions[0]).securities.find((s) => s.id.includes(':NEWC:')));
    out.fundAtFirst = src2.at(src2.sessions[0]).securities.filter((s) => s.fund).map((s) => s.id);
    out.splitBefore = src2.at('2027-01-15').securities.find((s) => s.id.includes(':AAA:')).bars.at(-1).close;
    out.splitBeforeFromFull = src2.at(to).securities.find((s) => s.id.includes(':AAA:')).bars.find((b) => b.date === '2027-01-15').close;
    out.datasetAtFirst = datasetSha256(src2.at(src2.sessions[0]));
    const sessions = src2.sessions.slice(0, 6);
    const { log } = simulateLog(src2, sessions, { from: sessions[0] });
    const r = integrityChecks(log, src2, { from: sessions[0], to: sessions.at(-1), mode: 'PIT_PER_SESSION' });
    out.checks = Object.fromEntries(Object.entries(r.checks).map(([k, v]) => [k, v.pass])); out.allPass = r.allPass;
    out.traded = Object.values(log.at(-1).references).filter((x) => x.ledgerRows > 0).length;
    out.counterfactualDefaultToday = L.buildListingTable(src.rows.slice(1).map((l) => Object.fromEntries(src.rows[0].split(',').map((k, i) => [k, l.split(',')[i]]))), new Map()).find((l) => l.ticker === 'ZZZ').active;
    process.stdout.write(JSON.stringify(out));
  } finally { fs.rmSync(src.dir, { recursive: true, force: true }); }
}
if (process.env.PAPER_FWD_PROBE) { await probe(process.env.PAPER_FWD_PROBE); process.exit(0); }

const child = (kind, env) => {
  const r = spawnSync(process.execPath, [SELF], { env: { ...process.env, ST_WINDOW: '', ST_WINDOW_TO: '', ...env, PAPER_FWD_PROBE: kind, NODE_TEST_CONTEXT: '' }, encoding: 'utf8', maxBuffer: 64 << 20 });
  assert.equal(r.status, 0, r.stderr);
  return { text: r.stdout, json: JSON.parse(r.stdout) };
};
const libIn = (env) => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `const L = await import(${JSON.stringify(new URL('../validation/lib.mjs', import.meta.url).href)}); process.stdout.write(JSON.stringify({ name: L.WINDOW_NAME, window: L.WINDOW, provider: L.SERIES_PROVIDER, listingOpts: L.LISTING_OPTS ?? null, windows: L.WINDOWS }))`], { env: { ...process.env, ST_WINDOW: '', ST_WINDOW_TO: '', ...env }, encoding: 'utf8' });
  return r.status === 0 ? JSON.parse(r.stdout) : { error: (r.stderr.match(/ST_WINDOW_TO_REQUIRED/) || ['?'])[0] };
};

// Hashes of the identity probe output with the code BEFORE 1.2.0 (activation branch db3f98c5, lib.mjs 49fd4a39…)
const GOLDEN = Object.freeze({
  DEV: '7c0c27669fcb02febb043c85bab527835901bd5e3a14962bc7af94ee843c05f0',
  HOLDOUT: 'b2b2b68da9b5658af3a84692da481bf04a6ffb5c73d9a7393c4772601a581888',
});
// snapshot/contract.mjs conventionFingerprint (adjustSeries, splitSegments, buildListingTable, …): a change would make the
// frozen DEV / HOLDOUT snapshots unopenable (CORPORATE_ACTION_CONVENTION_MISMATCH). Must stay equal.
const CONVENTION_BEFORE = '94a96e3056c621b25fafba598a5343776aba4d5b5d63aa86542c18d3e11b02e6';
const WINDOWS_BEFORE = { DEV: { warmupFrom: '2015-01-01', from: '2016-01-04', to: '2026-09-30' }, HOLDOUT: { warmupFrom: '2007-01-02', from: '2008-01-02', to: '2015-12-31' } };

test('PAPER-2027-FWD-WINDOW: PAPER_2027 nur per ST_WINDOW, rollendes Ende Pflicht; DEV und HOLDOUT wie vorher', () => {
  assert.deepEqual(L.WINDOWS, WINDOWS_BEFORE, 'WINDOWS unveraendert (DEV, HOLDOUT)');
  assert.deepEqual(libIn({}), { name: 'DEV', window: WINDOWS_BEFORE.DEV, provider: 'tiingo-delisted', listingOpts: null, windows: WINDOWS_BEFORE });
  assert.deepEqual(libIn({ ST_WINDOW: 'HOLDOUT' }), { name: 'HOLDOUT', window: WINDOWS_BEFORE.HOLDOUT, provider: 'tiingo-holdout', listingOpts: null, windows: WINDOWS_BEFORE });
  assert.deepEqual(libIn({ ST_WINDOW_TO: '2027-03-01' }).name, 'DEV', 'ST_WINDOW_TO allein waehlt kein Fenster');
  assert.deepEqual(libIn({ ST_WINDOW: 'PAPER_2027', ST_WINDOW_TO: '2027-03-01' }), { name: 'PAPER_2027', window: { warmupFrom: '2026-01-02', from: '2027-01-04', to: '2027-03-01' }, provider: 'tiingo-paper-2027', listingOpts: { today: '2027-03-01' }, windows: WINDOWS_BEFORE });
  for (const to of ['', '2027-3-1', '2025-12-31']) assert.deepEqual(libIn({ ST_WINDOW: 'PAPER_2027', ST_WINDOW_TO: to }), { error: 'ST_WINDOW_TO_REQUIRED' }, `fail closed: ${to}`);
  assert.equal(L.FORWARD_WINDOW.from, SF6_PAPER_PROTOCOL_1_2_0.window.firstSession);
  assert.ok(L.FORWARD_WINDOW.from > SF6_PAPER_PROTOCOL_1_2_0.window.start, 'erste Sitzung nach dem Fensterbeginn 01.01.2027');
});

test('PAPER-2027-FWD-DEV-HOLDOUT-IDENTITY: Listentabelle, Datensatz, Kontroll-Backtest und alle 11 Referenz-Ledger bytegleich zum Code vor 1.2.0', async () => {
  assert.equal((await K.conventionFingerprint()).sha256, CONVENTION_BEFORE, 'Konvention unveraendert: DEV- und HOLDOUT-Snapshot bleiben lesbar');
  for (const w of ['DEV', 'HOLDOUT']) {
    const { text, json } = child('identity', { ST_WINDOW: w });
    assert.equal(h(text), GOLDEN[w], `${w}: Ausgabe weicht vom Stand vor 1.2.0 ab`);
    assert.equal(json.window.name, w); assert.equal(json.convention, CONVENTION_BEFORE);
    assert.equal(Object.keys(json.references).length, 11);
    for (const [k, r] of Object.entries(json.references)) assert.equal(r.reconciliation, true, `${w} ${k}`);
    assert.ok(Object.values(json.references).filter((r) => r.ledgerRows > 0).length >= 10, `${w}: Referenzen buchen`);
    assert.ok(json.pit.endCauses.some(([, c, d]) => c === 'LISTING_INACTIVE' && d), `${w}: Delisting im Fenster`);
  }
});

test('PAPER-2027-FWD-LOADER: Forward-Quelle = Research-Lader im Fenster PAPER_2027; Delisting zum Stichtag t, IPO, Split PIT, vier Pruefungen', () => {
  const { json: f } = child('forward', { ST_WINDOW: 'PAPER_2027', ST_WINDOW_TO: '2027-02-26' });
  assert.deepEqual(f.window, { name: 'PAPER_2027', warmupFrom: '2026-01-02', from: '2027-01-04', to: '2027-02-26' });
  assert.deepEqual(f.listingOpts, { today: '2027-02-26' });
  assert.equal(f.mismatch, 'FORWARD_WINDOW_TO_MISMATCH', 'ein Prozess zeichnet nur die Sitzung seines Fensterendes auf');
  assert.equal(f.kind, FORWARD_SOURCE_KIND);
  assert.deepEqual(f.sessions, [40, '2027-01-04', '2027-02-26']);
  // delisting 2027-02-05: as of t it is LISTING_INACTIVE; before its end the PIT cut has no terminal (no look-ahead)
  assert.equal(f.zzzBefore, null);
  assert.deepEqual({ ...f.zzzAfter, distress: undefined }, { date: '2027-02-05', cause: 'LISTING_INACTIVE', distress: undefined, delistClass: null });
  assert.equal(f.counterfactualDefaultToday, true, 'ohne Stichtag t galte der 2027 delistete Titel als aktiv: deshalb LISTING_OPTS');
  assert.equal(f.newcAtFirst, true, 'IPO im Vorlauf (2026-11-02) ist im Universum');
  assert.deepEqual(f.fundAtFirst, ['tiingo:NASDAQ:AAA:2000-01-03'], 'sec-pit r12 wie in den Snapshot-Laeufen');
  // 2:1 split on 2027-01-19: the record of 2027-01-15 sees the unsplit price; the full-window adjusted series halves it
  assert.ok(Math.abs(f.splitBefore / f.splitBeforeFromFull - 2) < 1e-9, `${f.splitBefore} / ${f.splitBeforeFromFull}`);
  assert.deepEqual(f.checks, { FORWARD_LOG_EQUALS_BATCH_REPLAY: true, NO_MISSING_SESSIONS: true, RESEARCH_V1_RECONCILED: true, V4D1_FORWARD_CENSUS: true });
  assert.ok(f.traded >= 3, `Referenzen mit Buchungen: ${f.traded}`);
  // the same fixture loaded twice gives the same dataset (deterministic loader)
  assert.equal(child('forward', { ST_WINDOW: 'PAPER_2027', ST_WINDOW_TO: '2027-02-26' }).json.datasetAtFirst, f.datasetAtFirst);
});

test('PAPER-2027-FWD-ENV: im DEV-Prozess verweigert der Forward-Lader (fail closed), nie ein DEV-Datensatz als Forward-Aufzeichnung', async () => {
  assert.equal(L.WINDOW_NAME, 'DEV');
  assert.throws(() => assertForwardWindow('2027-01-05'), /FORWARD_WINDOW_ENV_REQUIRED/);
  await assert.rejects(loadForwardSource('2027-01-05'), /FORWARD_WINDOW_ENV_REQUIRED/);
  await assert.rejects(FORWARD_DATA_PATHS.RESEARCH_FORWARD_WINDOW.load('2027-01-05'), /FORWARD_WINDOW_ENV_REQUIRED/);
});

test('PAPER-2027-FWD-FETCH: Fortschreibung bis t nur fuer Fehlendes oder zu kurz Abgerufenes; SPY immer; STORE_ACTIVE nie', () => {
  const W = { warmupFrom: '2026-01-02', from: '2027-01-04', to: '2027-02-26' };
  const ls = [
    { id: 'a', source: 'STORE_ACTIVE', listEnd: null }, { id: 'b', source: 'FETCH', listEnd: null }, { id: 'c', source: 'FETCH', listEnd: '2027-02-05' },
    { id: 'd', source: 'FETCH', listEnd: '2027-02-05' }, { id: 'e', source: 'FETCH', listEnd: null }, { id: 'f', source: 'UNFETCHABLE_REUSED', listEnd: '2026-03-01' }, { id: 'g', source: 'FETCH', listEnd: null },
  ];
  const entries = { b: { status: 'OK', fetchedTo: '2027-02-25' }, c: { status: 'OK', fetchedTo: '2027-02-05' }, d: { status: 'ERROR' }, e: { status: 'SKIPPED_CLASS' }, f: { status: 'UNFETCHABLE_REUSED' }, g: { status: 'OK', fetchedTo: '2027-02-26' } };
  assert.deepEqual(forwardTodo(ls, entries, W).map((l) => l.id), ['b', 'd', 'BENCH:SPY']);
  assert.deepEqual(forwardTodo(ls, {}, W).map((l) => l.id), ['b', 'c', 'd', 'e', 'f', 'g', 'BENCH:SPY'], 'erster Lauf: alles ausser STORE_ACTIVE');
  assert.equal(forwardTarget({ listEnd: '2027-02-05' }, W), '2027-02-05'); assert.equal(forwardTarget({ listEnd: null }, W), '2027-02-26');
});

test('PAPER-2027-FWD-PROTOCOL: 1.2.0 neben 1.1.0 (1.1.0 bytegleich), nur der Turtle-Pin neu, Referenzgleichheit offen', async () => {
  assert.equal(sf6PaperProtocolSha256(), SUPERSEDED_1_1_0_SHA256, '1.1.0 nicht bearbeitet');
  assert.equal(SF6_PAPER_PROTOCOL.version, '1.1.0'); assert.equal(SF6_PAPER_PROTOCOL.status, 'PREPARED_NOT_ACTIVE');
  const P = SF6_PAPER_PROTOCOL_1_2_0;
  assert.equal(P.version, '1.2.0'); assert.equal(P.id, SF6_PAPER_PROTOCOL.id);
  assert.deepEqual(P.supersedes, { version: '1.1.0', fixedOn: '2026-10-25', sha256: SUPERSEDED_1_1_0_SHA256, status: 'SUPERSEDED_BY_1_2_0_NEVER_ACTIVATED', pinned: { turtleEngineCodeSha256: '89fbcf864a57041379bc62d4af64cfda7c5601aaaf1c08b38fd6b91b6472ef24' }, why: P.supersedes.why });
  // the prepared pin is the current code; every other pin is unchanged from 1.1.0
  assert.equal(P.references.pinned.turtleEngineCodeSha256, codeSha256());
  assert.equal(P.references.pinned.turtleEngineCodeSha256, '5e6683d4ebf4f6c4257b0bfbc4a3fcb6608973ddb0876a0ef077bf9d4cccecec');
  for (const k of P.references.unchangedPins) assert.equal(P.references.pinned[k], SF6_PAPER_PROTOCOL.references.pinned[k], k);
  assert.deepEqual(Object.keys(P.references.pinned).sort(), Object.keys(SF6_PAPER_PROTOCOL.references.pinned).sort());
  for (const k of ['window', 'recording', 'evaluation', 'activation']) for (const [f, v] of Object.entries(SF6_PAPER_PROTOCOL[k])) assert.deepEqual(P[k][f], v, `${k}.${f} wie 1.1.0`);
  assert.equal(P.references.scope, SF6_PAPER_PROTOCOL.references.scope);
  assert.equal((await pinCheck()).pass, true, 'Waechter vergleicht mit den 1.2.0-Pins');
  // not fixed: reference identity pending, owner runs listed, no run id invented
  assert.equal(P.status, 'DRAFT_PENDING_REFERENCE_IDENTITY'); assert.equal(P.fixedOn, null);
  assert.equal(P.references.referenceIdentity.status, 'PENDING_OWNER_RUNS');
  assert.deepEqual(P.references.referenceIdentity.requiredRuns.map((r) => r.id), ['R1_TURTLE', 'R2_MINERVINI', 'R3_SF5', 'R4_RESTORE_DEV', 'R5_RESTORE_HOLDOUT', 'R6_KK_CACHE']);
  for (const k of ['turtle', 'minervini', 'sf5', 'restoreDev', 'restoreHoldout', 'kk']) assert.equal(P.references.referenceIdentity[k], null, k);
  assert.equal(referenceIdentityShown(P), false); assert.equal(referenceIdentityShown(SF6_PAPER_PROTOCOL), true);
  assert.equal(referenceIdentityShown({ ...P, status: 'PREPARED_NOT_ACTIVE', references: { ...P.references, referenceIdentity: { ...P.references.referenceIdentity, status: 'SHOWN' } } }), true);
  assert.deepEqual(SF6_PAPER_PROTOCOL_VERSIONS.map((v) => v.version), ['1.1.0', '1.2.0']);
  assert.equal(currentPaperProtocol().version, '1.2.0');
  assert.equal(ACTIVATED_PROTOCOL_SHA256, sf6PaperProtocol120Sha256(), 'die Aktivierung nennt die aktuelle 1.2.0-Fassung');
});

test('PAPER-2027-FWD-GUARD: Datenpfad implementiert; eingeschaltet bleibt der Waechter rot bis zur gezeigten Referenzgleichheit; 1.1.0 ist ersetzt', async () => {
  const pinsOk = { pass: true, rows: [] };
  const on = (over = {}) => ({ ...SF6_PAPER_ACTIVATION, activated: true, approval: { by: 'owner', on: '2026-12-15', pr: 1 }, decisions: { sampleCount: 'COUNT_ONLY', retention: 'RAISE_CAP_TO_4_FORWARD_GENERATION', dataSource: 'RESEARCH_FORWARD_WINDOW' }, ...over });
  assert.equal(FORWARD_DATA_PATHS.RESEARCH_FORWARD_WINDOW.status, 'IMPLEMENTED');
  assert.equal(SF6_PAPER_ACTIVATION.activated, false, 'Schalter bleibt aus');
  assert.deepEqual((await activationState({ today: '2027-01-05', activation: on(), pins: pinsOk })).reasons, ['REFERENCE_IDENTITY_NOT_SHOWN']);
  const old = await activationState({ today: '2027-01-05', activation: on({ protocol: { ...SF6_PAPER_ACTIVATION.protocol, version: '1.1.0', sha256: SUPERSEDED_1_1_0_SHA256 } }), pins: pinsOk });
  assert.deepEqual(old.reasons, ['PROTOCOL_SUPERSEDED:1.1.0', 'REFERENCE_IDENTITY_NOT_SHOWN']);
  assert.ok(!(await activationState({ today: '2027-01-05', activation: on(), pins: pinsOk })).reasons.includes('FORWARD_DATA_PATH_NOT_IMPLEMENTED'));
  assert.deepEqual((await activationState({ today: '2026-11-03' })).reasons, ['NOT_ACTIVATED']);
});

test('PAPER-2027-FWD-WORKFLOWS: Aufzeichnung im Forward-Fenster nach Fortschreibung; Snapshot-Modi; Codewechsel nur manuell mit Snapshot', () => {
  const wf = (f) => fs.readFileSync(new URL(`../../../.github/workflows/${f}`, import.meta.url), 'utf8');
  const paper = wf('supertrader-paper-2027.yml');
  const rec = paper.slice(paper.indexOf('  record:'));
  const i = (s) => rec.indexOf(s);
  assert.ok(i('run-paper-2027.mjs session') > 0 && i('fetch.mjs --mode forward') > i('run-paper-2027.mjs session') && i('sec-pit.mjs') > i('fetch.mjs --mode forward') && i('run-paper-2027.mjs record') > i('sec-pit.mjs'), 'Sitzung, Reihen, SEC, Aufzeichnung');
  assert.equal((rec.match(/ST_WINDOW: PAPER_2027\n\s+ST_WINDOW_TO: \$\{\{ steps\.s\.outputs\.session \}\}/g) || []).length, 3);
  assert.equal((rec.match(/if: steps\.s\.outputs\.due == 'true'/g) || []).length, 3);
  const snap = wf('supertrader-research-snapshot.yml');
  assert.match(snap, /\*"\[supertrader-snapshot:capture-paper-2027\]"\*\) m=capture-paper-2027;;/);
  assert.match(snap, /\[supertrader-snapshot-window-to:\(\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\)\\\]/);
  assert.equal((snap.match(/endsWith\(needs\.mode\.outputs\.mode, 'paper-2027'\) && 'PAPER_2027'/g) || []).length, 3, 'Capture und beide Restores im Forward-Fenster');
  const val = wf('supertrader-validation.yml');
  assert.match(val, /allow_code_version_change:\n\s+description: .*\n\s+type: boolean\n\s+default: false/);
  assert.match(val, /IN_ALLOW_CODE_CHANGE: \$\{\{ inputs\.allow_code_version_change \}\}/);
  assert.match(val, /if \[ -z "\$snap" \]; then echo "INPUT_INTEGRITY_FAILURE: ALLOW_CODE_VERSION_CHANGE_REQUIRES_SNAPSHOT"/);
  for (const m of ['paper-2027-fetch', 'paper-2027-sec', 'paper-2027-probe']) assert.match(val, new RegExp(`steps\\.mode\\.outputs\\.mode == '${m}'`));
  for (const f of ['supertrader-validation.yml', 'supertrader-research-snapshot.yml']) assert.ok(!wf(f).includes('SF6-PAPER'), f);
});
