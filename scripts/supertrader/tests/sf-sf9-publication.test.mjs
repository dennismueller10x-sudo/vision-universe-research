// Supertrader 9 – Veröffentlichungsvertrag des automatischen Tageslaufs (sf8-auto-publication-1.0.0).
// Jeder Vertragspunkt C1–C7 einzeln als Gegenprobe; Grundlage ist der veröffentlichte Stand auf main.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluatePublication, publicationRecord, inputsSha256, sourceFilesSha256, PUBLICATION_CONTRACT, PLAUSIBILITY, STATUS_INVARIANT } from '../source-faithful/product/publication-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SUMMARY = path.join(ROOT, 'supertrader/data/sf-candidates/summary.json');
const FP = 'a'.repeat(64);
const strategy = (i) => ({ candidateId: `C${String(i).padStart(2, '0')}`, liveReadiness: 'LIVE_NOT_APPROVED', engine: { engineVersion: `e-${i}` } });
const synthetic = () => ({
  schema: 'supertrader-sf8-candidates-1.0.0', asOf: '2026-10-28', nextSession: '2026-10-29',
  versions: { pipeline: 'p-1', detectors: 'd-1', candidateContractSha256: 'x' }, status: { ...STATUS_INVARIANT },
  counts: { candidates: 3225, byStage: { CHART_CANDIDATE: 2091, CONFIRMED_RESEARCH_SETUP: 1078, MODELED_TRADE_PLAN: 56 }, validatedTradeSignal: 0, rejectedRecords: 0 },
  dataQuality: { securities: 5099, rejectedInputs: 0 }, strategies: Array.from({ length: 13 }, (_, i) => strategy(i + 1)),
  inputs: { sourceFiles: [{ file: 'a', sha256: 'b' }], inputsSha256: 'c'.repeat(64) },
});
const base = () => (fs.existsSync(SUMMARY) ? JSON.parse(fs.readFileSync(SUMMARY, 'utf8')) : synthetic());
const dq = (over = {}) => ({ rules: Array.from({ length: 8 }, (_, i) => ({ id: `DQ-SF8-${i + 1}`, status: 'PASS', checked: 10, failed: 0, ...(over[i + 1] || {}) })) });
// der neue Stand liegt immer einen bzw. zwei Kalendertage nach dem veröffentlichten (unabhängig vom Datenstand auf main)
const plusDays = (iso, d) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 864e5).toISOString().slice(0, 10);
const nextOf = (prev, f = (x) => x) => { const n = structuredClone(prev); n.asOf = plusDays(prev.asOf, 1); n.nextSession = plusDays(prev.asOf, 2); return f(n) ?? n; };
const evalWith = (o = {}) => { const prev = o.prev === undefined ? base() : o.prev; return evaluatePublication({ next: o.next === undefined ? nextOf(prev) : o.next, prev, fingerprint: o.fp ?? FP, rebuildFingerprint: o.fp2 ?? FP, dq: o.dq ?? dq(), registryOk: o.registryOk ?? true }); };
const blockedBy = (o, re) => { const r = evalWith(o); assert.equal(r.decision, 'BLOCKED'); assert.ok(r.failures.some((x) => re.test(x)), `${re} in ${r.failures.join(' | ')}`); };

test('SF9-PUB-1 · neuere Sitzung, alles erfüllt = PUBLISH; gleiche Sitzung = SKIP_SAME_SESSION', () => {
  assert.deepEqual(evalWith(), { decision: 'PUBLISH', failures: [] });
  const prev = base();
  assert.deepEqual(evaluatePublication({ next: structuredClone(prev), prev, fingerprint: FP, rebuildFingerprint: FP, dq: dq(), registryOk: true }), { decision: 'SKIP_SAME_SESSION', failures: [] });
  assert.equal(PUBLICATION_CONTRACT, 'sf8-auto-publication-1.0.0');
});

test('SF9-PUB-2 · C1 reproduzierbar, C2 vollständige DQ', () => {
  blockedBy({ fp2: 'b'.repeat(64) }, /^C1 nicht reproduzierbar/);
  blockedBy({ fp: 'kein-hash', fp2: 'kein-hash' }, /^C1/);
  blockedBy({ dq: { rules: dq().rules.slice(0, 7) } }, /^C2 DQ-SF8-Regeln unvollständig \(7 von 8\)/);
  blockedBy({ dq: { rules: [...dq().rules.slice(0, 7), dq().rules[0]] } }, /^C2 DQ-SF8-Regeln unvollständig/);
  blockedBy({ dq: dq({ 8: { status: 'FAIL', failed: 3 } }) }, /^C2 DQ-SF8-8 FAIL/);
  blockedBy({ dq: dq({ 4: { checked: 0 } }) }, /^C2 DQ-SF8-4 PASS \[0\/0\]/);
  blockedBy({ dq: {} }, /^C2 DQ-SF8-Regeln unvollständig \(0 von 8\)/);
});

test('SF9-PUB-3 · C3 Forschungsstatus: keine Hochstufung, 13 Methoden, alle LIVE_NOT_APPROVED', () => {
  blockedBy({ next: nextOf(base(), (n) => { n.status.liveReadiness = 'LIVE_APPROVED'; }) }, /^C3 status\.liveReadiness/);
  blockedBy({ next: nextOf(base(), (n) => { n.status.validatedTradeSignal = 'UNLOCKED'; }) }, /^C3 status\.validatedTradeSignal/);
  blockedBy({ next: nextOf(base(), (n) => { n.status.orders = 'PAPER'; }) }, /^C3 status\.orders/);
  blockedBy({ next: nextOf(base(), (n) => { n.counts.validatedTradeSignal = 1; }) }, /^C3 validatedTradeSignal = 1/);
  blockedBy({ next: nextOf(base(), (n) => { n.counts.byStage.VALIDATED_TRADE_SIGNAL = 1; }) }, /^C3 Stufe VALIDATED/);
  blockedBy({ next: nextOf(base(), (n) => { n.strategies[2].liveReadiness = 'PAPER_APPROVED'; }) }, /^C3 C03 liveReadiness/);
  blockedBy({ next: nextOf(base(), (n) => { n.strategies.pop(); }) }, /^C3 12 Methoden statt 13/);
});

test('SF9-PUB-4 · C4 gleiche Fachmodelle: jede Versionsänderung verlangt die manuelle erste Veröffentlichung', () => {
  blockedBy({ next: nextOf(base(), (n) => { n.versions.detectors = 'sf8-detectors-9.9.9'; }) }, /^C4 versions\.detectors .*Modelländerung/);
  blockedBy({ next: nextOf(base(), (n) => { n.versions.candidateContractSha256 = '0'.repeat(64); }) }, /^C4 versions\.candidateContractSha256/);
  blockedBy({ next: nextOf(base(), (n) => { n.versions.neu = '1'; }) }, /^C4 versions\.neu/);
  blockedBy({ next: nextOf(base(), (n) => { n.strategies[0].engine.engineVersion = 'x'; }) }, /^C4 Engine-Versionen/);
  blockedBy({ next: nextOf(base(), (n) => { n.schema = 'supertrader-sf8-candidates-2.0.0'; }) }, /^C4 Schema/);
  // fehlende Engine-Version in beiden Ständen ist kein „gleich“
  const noEngine = (s) => { delete s.strategies[0].engine; };
  const pe = base(); noEngine(pe);
  const r = evaluatePublication({ next: nextOf(pe, noEngine), prev: pe, fingerprint: FP, rebuildFingerprint: FP, dq: dq(), registryOk: true });
  assert.equal(r.decision, 'BLOCKED'); assert.ok(r.failures.some((x) => /^C4 C01 ohne Engine-Version/.test(x)), r.failures.join('|'));
  blockedBy({ next: nextOf(base(), (n) => { n.inputs.inputsSha256 = 'x'; }) }, /^C1 Eingaben-Fingerabdruck/);
  blockedBy({ next: nextOf(base(), (n) => { n.inputs.sourceFiles = []; }) }, /^C1 Eingaben-Fingerabdruck/);
});

test('SF9-PUB-5 · C5 Zeitachse: nie älter, kein Stand ohne Vorgänger, nextSession nach asOf', () => {
  blockedBy({ next: nextOf(base(), (n) => { n.asOf = plusDays(base().asOf, -1); n.nextSession = base().asOf; }) }, /^C5 neuer Stand \d{4}-\d{2}-\d{2} älter/);
  blockedBy({ next: nextOf(base(), (n) => { n.nextSession = n.asOf; }) }, /^C5 nextSession/);
  blockedBy({ next: nextOf(base(), (n) => { n.asOf = '28.10.2026'; }) }, /^C5 asOf ungültig/);
  blockedBy({ prev: null, next: nextOf(base()) }, /^C5 kein veröffentlichter Stand: die erste Veröffentlichung ist manuell/);
  blockedBy({ next: null }, /^C5 neuer Stand fehlt/);
});

test('SF9-PUB-6 · C6 Plausibilität (Datenbetrieb, keine Fachregel) und C7 Registry', () => {
  const p = base().counts.candidates;
  blockedBy({ next: nextOf(base(), (n) => { n.counts.candidates = Math.floor(p * PLAUSIBILITY.minCandidateRatio) - 1; }) }, /^C6 Kandidaten/);
  blockedBy({ next: nextOf(base(), (n) => { n.counts.candidates = Math.ceil(p * PLAUSIBILITY.maxCandidateRatio) + 1; }) }, /^C6 Kandidaten/);
  assert.equal(evalWith({ next: nextOf(base(), (n) => { n.counts.candidates = Math.ceil(p * PLAUSIBILITY.minCandidateRatio); }) }).decision, 'PUBLISH');
  blockedBy({ next: nextOf(base(), (n) => { n.dataQuality.securities = Math.floor(n.dataQuality.securities * 0.8); }) }, /^C6 Titel mit Daten/);
  blockedBy({ next: nextOf(base(), (n) => { n.dataQuality.rejectedInputs = 1; }) }, /^C6 verworfene Eingaben 1/);
  blockedBy({ next: nextOf(base(), (n) => { n.counts.rejectedRecords = 2; }) }, /^C6 verworfene Datensätze 2/);
  blockedBy({ registryOk: false }, /^C7 Registry/);
  blockedBy({ registryOk: 'true' }, /^C7 Registry/);
  assert.deepEqual({ ...PLAUSIBILITY }, { minCandidateRatio: 0.5, maxCandidateRatio: 2.0, minSecuritiesRatio: 0.9 });
});

test('SF9-PUB-7 · Nachweis und CLI: Eingaben-Fingerabdruck, Exit 5 bei BLOCKED, schreibt nur --out', () => {
  const prev = base(), next = nextOf(prev);
  const rec = publicationRecord({ next, prev, fingerprint: FP, decision: 'PUBLISH', failures: [], codeCommit: 'c0ffee', run: '1' });
  assert.equal(rec.inputsSha256, next.inputs.inputsSha256, 'derselbe Wert wie in summary.json'); assert.match(rec.inputsSha256, /^[0-9a-f]{64}$/);
  assert.equal(rec.sourceFilesSha256, sourceFilesSha256(next)); assert.equal(inputsSha256({ inputs: { inputsSha256: 'kurz' } }), null);
  assert.equal(rec.asOf, plusDays(prev.asOf, 1)); assert.equal(rec.previousAsOf, prev.asOf); assert.equal(rec.contract, PUBLICATION_CONTRACT);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sf9-pub-'));
  try {
    for (const [k, v] of [['next', next], ['prev', prev]]) { fs.mkdirSync(path.join(d, k)); fs.writeFileSync(path.join(d, k, 'summary.json'), JSON.stringify(v)); }
    fs.writeFileSync(path.join(d, 'dq.json'), JSON.stringify(dq()));
    const cli = (extra) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/supertrader/source-faithful/product/publication-contract.mjs'), '--next', path.join(d, 'next'), '--prev', path.join(d, 'prev'), '--dq', path.join(d, 'dq.json'), '--out', path.join(d, 'rec.json'), ...extra], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: path.join(d, 'gho') } });
    const ok = cli(['--fingerprint', FP, '--rebuild-fingerprint', FP, '--registry-ok', 'true']);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr); assert.match(fs.readFileSync(path.join(d, 'gho'), 'utf8'), /decision=PUBLISH/);
    const bad = cli(['--fingerprint', FP, '--rebuild-fingerprint', 'b'.repeat(64), '--registry-ok', 'true']);
    assert.equal(bad.status, 5); assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'rec.json'), 'utf8')).decision, 'BLOCKED');
    const none = cli(['--fingerprint', FP, '--rebuild-fingerprint', FP]); // ohne --registry-ok: nicht freigegeben
    assert.equal(none.status, 5);
    assert.deepEqual(fs.readdirSync(d).sort(), ['dq.json', 'gho', 'next', 'prev', 'rec.json']);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
