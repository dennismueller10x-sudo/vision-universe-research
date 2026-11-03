// SF6-PAPER-2027 – Aktivierungs-PR (FP-ST-02 / CC-8): Schalter, Aufzeichnung, Hash-Kette und die vier Integritaetspruefungen.
// Synthetisch und ohne Netz; der Schalter bleibt AUS (docs/SUPERTRADER_PAPER_2027_ACTIVATION.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SF6_PAPER_PROTOCOL, sf6PaperProtocolSha256 } from '../source-faithful/completion/sf6-paper-protocol-2027.mjs';
import { SF6_PAPER_ACTIVATION, ACTIVATED_PROTOCOL_SHA256, DECISION_OPTIONS, FORWARD_DATA_PATHS, activationState, pinCheck } from '../source-faithful/paper/activation-2027.mjs';
import { nextEntry, verifyChain, verifyAppendOnly, sealedFileName, effectiveEntries, integrityChecks, sessionRecord, datasetSource, truncatePit, truncateDataset, INTEGRITY_CHECK_IDS, GENESIS, parseJsonl, toJsonlLine } from '../source-faithful/paper/forward-log.mjs';
import { syntheticPit, dryRun, simulateLog } from '../source-faithful/paper/run-paper-2027.mjs';
import { SF6_REFERENCE_KEYS } from '../source-faithful/research/sf6-references.mjs';
import { datasetFromPit } from '../source-faithful/runner/snapshot-input.mjs';

const PINNED_PAPER_PROTOCOL = 'e623b336cd24a49e04b4588ab5b06c06d6226a323b368d4c659f2d7ce4b64f66';
const WF = new URL('../../../.github/workflows/supertrader-paper-2027.yml', import.meta.url);
const pinsOk = { pass: true, rows: [] };
const on = (over = {}) => ({ ...SF6_PAPER_ACTIVATION, activated: true, approval: { by: 'owner', on: '2026-12-15', pr: 1 }, decisions: { sampleCount: 'COUNT_ONLY', retention: 'RAISE_CAP_TO_4_FORWARD_GENERATION', dataSource: 'RESEARCH_FORWARD_WINDOW' }, ...over });

test('PAPER-2027-SWITCH: aus (dieser PR) oder nur mit vollstaendiger Owner-Freigabe an; Protokoll 1.1.0 unveraendert, Pins gleich main', async () => {
  assert.equal(sf6PaperProtocolSha256(), PINNED_PAPER_PROTOCOL, 'das Protokoll wird durch die Aktivierung nicht bearbeitet');
  assert.equal(ACTIVATED_PROTOCOL_SHA256, PINNED_PAPER_PROTOCOL);
  assert.equal(SF6_PAPER_PROTOCOL.status, 'PREPARED_NOT_ACTIVE');
  assert.equal(SF6_PAPER_ACTIVATION.recording.notBefore, SF6_PAPER_PROTOCOL.window.start);
  for (const k of ['orders', 'broker', 'productSurface']) assert.equal(SF6_PAPER_ACTIVATION[k], 'NONE', k);
  const p = await pinCheck();
  assert.equal(p.pass, true, JSON.stringify(p.rows));
  assert.equal(p.rows.find((r) => r.pin === 'turtleEngineCodeSha256').pinned.slice(0, 8), '89fbcf86');
  if (SF6_PAPER_ACTIVATION.activated !== true) {
    // Stand dieses PR: der Schalter ist eine Owner-Freigabe (eigener Commit), nichts ist entschieden, kein Protokoll
    assert.equal(SF6_PAPER_ACTIVATION.activated, false);
    assert.equal(SF6_PAPER_ACTIVATION.approval, null);
    for (const k of Object.keys(DECISION_OPTIONS)) assert.equal(SF6_PAPER_ACTIVATION.decisions[k], null, k);
    for (const today of ['2026-11-03', '2027-01-04', '2027-06-30']) assert.deepEqual((await activationState({ today })).reasons, ['NOT_ACTIVATED']);
    assert.equal(fs.existsSync(new URL('../source-faithful/paper/log/', import.meta.url)), false, 'kein Protokoll vor der Aktivierung');
  } else {
    // nach dem Owner-Commit: Freigabe vor dem Fensterbeginn, jede Entscheidung aus den erlaubten Optionen
    const a = SF6_PAPER_ACTIVATION.approval;
    assert.ok(a && a.by && Number.isInteger(a.pr) && a.on < SF6_PAPER_PROTOCOL.window.start, JSON.stringify(a));
    for (const [k, opts] of Object.entries(DECISION_OPTIONS)) assert.ok(opts.includes(SF6_PAPER_ACTIVATION.decisions[k]), k);
    assert.notEqual((await activationState({ today: '2027-01-05' })).state, 'INACTIVE');
  }
});

test('PAPER-2027-GUARD: eingeschaltet nur mit Freigabe, allen Entscheidungen, Datenpfad und gleichen Pins; sonst rot', async () => {
  const st = (a, today = '2027-01-05', pins = pinsOk) => activationState({ today, activation: a, pins });
  const missing = await st(on({ approval: null, decisions: { sampleCount: null, retention: null, dataSource: null } }));
  assert.equal(missing.state, 'BLOCKED');
  assert.deepEqual(missing.reasons, ['OWNER_APPROVAL_MISSING', 'DECISION_MISSING:sampleCount', 'DECISION_MISSING:retention', 'DECISION_MISSING:dataSource']);
  assert.ok((await st(on({ approval: { by: 'owner', on: '2027-01-02', pr: 1 } }))).reasons.includes('APPROVAL_AFTER_WINDOW_START'));
  assert.ok((await st(on({ decisions: { sampleCount: 'ANY', retention: 'RAISE_CAP_TO_4_FORWARD_GENERATION', dataSource: 'RESEARCH_FORWARD_WINDOW' } }))).reasons.includes('DECISION_INVALID:sampleCount'));
  // the forward data path does not exist yet: switched on, the guard stays red (never a silent skip)
  assert.equal(FORWARD_DATA_PATHS.RESEARCH_FORWARD_WINDOW.status, 'NOT_IMPLEMENTED');
  assert.deepEqual((await st(on())).reasons, ['FORWARD_DATA_PATH_NOT_IMPLEMENTED']);
  assert.ok((await st(on(), '2027-01-05', { pass: false, rows: [{ pin: 'turtleEngineCodeSha256', equal: false }] })).reasons.includes('PIN_MISMATCH:turtleEngineCodeSha256'));
  assert.ok((await st(on({ protocol: { ...SF6_PAPER_ACTIVATION.protocol, sha256: '0'.repeat(64) } }))).reasons.includes('PROTOCOL_FINGERPRINT_MISMATCH'));
});

test('PAPER-2027-CHAIN: nur anhaengen, keine Doppel- oder Rueckwaerts-Sitzung, Korrektur als neuer Eintrag', () => {
  const rec = { public: { X: { openPositions: 0 } }, sealed: {} };
  const mk = (log, o) => [...log, nextEntry(log, { record: rec, inputs: {}, recordedAt: `${o.session}T21:00:00Z`, ...o })];
  let log = mk([], { session: '2027-01-04' });
  assert.equal(log[0].prevHash, GENESIS); assert.equal(log[0].protocol.sha256, PINNED_PAPER_PROTOCOL);
  log = mk(log, { session: '2027-01-05' });
  assert.throws(() => mk(log, { session: '2027-01-05' }), /PAPER_SESSION_NOT_AFTER_LAST/);
  assert.throws(() => mk(log, { session: '2027-01-04' }), /PAPER_SESSION_NOT_AFTER_LAST/);
  assert.throws(() => mk(log, { type: 'CORRECTION', session: '2027-01-05', corrects: 1 }), /REASON_REQUIRED/);
  assert.throws(() => mk(log, { type: 'CORRECTION', session: '2027-01-05', corrects: 0, reason: 'x' }), /CORRECTION_TARGET/);
  log = mk(log, { type: 'CORRECTION', session: '2027-01-05', corrects: 1, reason: 'test', record: { public: { X: { openPositions: 1 } }, sealed: {} } });
  assert.equal(verifyChain(log).pass, true);
  assert.equal(effectiveEntries(log).get('2027-01-05').seq, 2, 'die Korrektur gilt, der alte Eintrag bleibt');
  assert.equal(log[1].references.X.openPositions, 0);
  // round trip through the jsonl file form, then an in-place edit is detected
  const back = parseJsonl(log.map(toJsonlLine).join(''));
  assert.equal(verifyChain(back).pass, true);
  back[1].references.X.openPositions = 7;
  assert.deepEqual(verifyChain(back).errors, ['HASH:1'], 'der gespeicherte Hash passt nicht mehr zum Inhalt');
  assert.throws(() => nextEntry(back, { session: '2027-01-06', record: rec, inputs: {}, recordedAt: 'x' }), /PAPER_CHAIN_BROKEN/);
});

test('PAPER-2027-APPEND-ONLY: der committete Stand ist bytegleiches Praefix; aendern, kuerzen, einschieben und Probelauf-Eintraege werden abgewiesen', () => {
  const rec = { public: { X: { openPositions: 0 } }, sealed: {} };
  const add = (log, session, o = {}) => [...log, nextEntry(log, { session, record: rec, inputs: {}, recordedAt: `${session}T21:00:00Z`, ...o })];
  const base = add(add([], '2027-01-04'), '2027-01-05'), grown = add(base, '2027-01-06');
  const txt = (log) => log.map(toJsonlLine).join('');
  assert.deepEqual(verifyAppendOnly('', txt(base)).errors, []);
  const ok = verifyAppendOnly(txt(base), txt(grown));
  assert.equal(ok.pass, true); assert.equal(ok.appended, 1); assert.equal(ok.head, grown.at(-1).hash);
  assert.ok(verifyAppendOnly(txt(grown), txt(base)).errors.some((e) => e.startsWith('SHORTER')), 'gekuerzt');
  // rewritten history with a consistent new chain: the chain is valid, the prefix is not
  const forged = add(add([], '2027-01-04', { recordedAt: '2027-01-04T20:00:00Z' }), '2027-01-05');
  assert.equal(verifyChain(forged).pass, true);
  assert.ok(verifyAppendOnly(txt(base), txt(add(forged, '2027-01-06'))).errors.includes('CHANGED:0'));
  assert.ok(verifyAppendOnly(txt(base), txt(add(base, '2027-01-06', { dryRun: true }))).errors.includes('DRY_RUN_ENTRY:2'));
  assert.equal(sealedFileName(grown[2]), '0002-2027-01-06.sealed.json', 'ein versiegelter Teil je Eintrag, auch je Korrektur');
});

test('PAPER-2027-DRY-RUN: vier Pruefungen bestehen auf unveraendertem Protokoll, jede Manipulation wird erkannt', () => {
  assert.deepEqual([...INTEGRITY_CHECK_IDS], ['FORWARD_LOG_EQUALS_BATCH_REPLAY', 'NO_MISSING_SESSIONS', 'RESEARCH_V1_RECONCILED', 'V4D1_FORWARD_CENSUS']);
  const src = datasetSource(syntheticPit({ securities: 24 }), { kind: 'SYNTHETIC_RESEARCH_SNAPSHOT', pit: true });
  const sessions = src.sessions.filter((d) => d >= '2027-01-04').slice(0, 8);
  const { log, report } = dryRun(src, sessions);
  assert.equal(log.length, 8); assert.equal(log[0].session, '2027-01-04');
  assert.deepEqual(Object.keys(log[0].references).sort(), [...SF6_REFERENCE_KEYS].sort(), 'alle 11 Referenzen je Sitzung');
  for (const e of log) assert.equal(e.dryRun, true);
  for (const [mode, r] of Object.entries(report.clean)) assert.equal(r.allPass, true, `${mode} ${JSON.stringify(r.checks)}`);
  for (const s of report.tamper) assert.equal(s.caught, true, `${s.id} ${JSON.stringify(s.checks)}`);
  assert.equal(report.tamper.find((s) => s.id === 'T2_FORGED_RECHAINED').chainValid, true, 'die Kette allein reicht nicht; der Replay erkennt die Faelschung');
  const traded = Object.values(report.countsAtLastSession).filter((c) => c.ledgerRows > 0).length;
  assert.ok(traded >= 5, `Referenzen mit Buchungen: ${traded}`);
  // public entry: counts and hashes only (no pnl, no price, no id)
  const pub = JSON.stringify(log.map((e) => e.references));
  for (const k of ['pnl', 'price', 'returnPct', 'equity', 'tiingo:']) assert.ok(!pub.includes(k), k);
});

test('PAPER-2027-PIT: Abschnitt vor der Adjustierung; ein Split nach t aendert die Aufzeichnung von t nicht', () => {
  const pit = syntheticPit({ securities: 24 });
  const fwd = pit.calendar.filter((d) => d >= '2027-01-04');
  const at = pit.calendar.indexOf(fwd[4]);
  const split = syntheticPit({ securities: 24, splits: Array.from({ length: 23 }, (_, i) => ({ seg: i + 1, at, ratio: 4 })) });
  // before the split session the raw cut of the split snapshot equals the unsplit snapshot
  const a = datasetFromPit(truncatePit(pit, fwd[2])), b = datasetFromPit(truncatePit(split, fwd[2]));
  assert.deepEqual(b.securities.map((s) => s.bars.at(-1).close), a.securities.map((s) => s.bars.at(-1).close));
  // the adjusted cut of the full split dataset re-scales the history (not PIT): that is why PIT_PER_SESSION is authoritative
  const c = truncateDataset(datasetFromPit(split), fwd[2]);
  assert.notDeepEqual(c.securities[1].bars.at(-1).close, a.securities[1].bars.at(-1).close);
  const srcPit = datasetSource(split, { kind: 'SYNTHETIC', pit: true });
  const sessions = fwd.slice(0, 7);
  const { log } = simulateLog(srcPit, sessions, { from: sessions[0] });
  const r = integrityChecks(log, srcPit, { from: sessions[0], to: sessions.at(-1), mode: 'PIT_PER_SESSION' });
  assert.equal(r.allPass, true, JSON.stringify(r.checks));
  const rec = sessionRecord(srcPit.at(sessions[2]), sessions[2], { from: sessions[0] });
  assert.equal(rec.public.TURTLE_S1.ledgerSha256, sessionRecord(datasetSource(pit, { pit: true }).at(sessions[2]), sessions[2], { from: sessions[0] }).public.TURTLE_S1.ledgerSha256);
});

test('PAPER-2027-WORKFLOW: vorhanden, bewacht, ADR-005, nur Supertrader-Pfade', () => {
  const wf = fs.readFileSync(WF, 'utf8');
  assert.match(wf, /run-paper-2027\.mjs guard/);
  assert.match(wf, /if: needs\.guard\.outputs\.state == 'ACTIVE' && github\.ref == 'refs\/heads\/main'/);
  assert.match(wf, /^permissions:\n  contents: read$/m);
  assert.match(wf, /group: supertrader-paper-2027-\$\{\{ github\.ref_name \}\}\n  cancel-in-progress: false/);
  const checkouts = wf.match(/uses: actions\/checkout@v4\n\s+with:\n\s+ref: \$\{\{ github\.ref \}\}/g) || [];
  assert.equal(checkouts.length, (wf.match(/actions\/checkout@/g) || []).length, 'jeder Checkout mit ref: github.ref');
  assert.match(wf, /scripts\/ci\/push-with-retry\.sh "\$\{GITHUB_REF_NAME\}"/);
  assert.match(wf, /run-paper-2027\.mjs verify/, 'nur anhaengen gegen den committeten Stand vor jedem Commit');
  assert.ok(wf.indexOf('run-paper-2027.mjs verify') < wf.indexOf('git commit'), 'Pruefung vor dem Commit');
  assert.ok(!/git push/.test(wf), 'Push nur ueber push-with-retry.sh');
  for (const line of wf.split('\n').filter((l) => l.includes('${{ inputs.'))) assert.match(line, /^\s+[A-Z_]+: \$\{\{ inputs\.[a-z_]+ \}\}$/, 'Eingaben nur ueber env: ' + line);
  for (const m of wf.matchAll(/git add ([^\n]+)/g)) for (const p of m[1].trim().split(/\s+/)) assert.match(p, /^scripts\/supertrader\//, p);
});
