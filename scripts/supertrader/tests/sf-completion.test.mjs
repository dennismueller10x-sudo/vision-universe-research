// Supertrader 2.0 completion: derived gap matrix, multi-dimensional status, Turtle acceptance gate, research-signal
// contract, missing-data robustness of every screen, legacy isolation and freshness of the completion artifacts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRACTS, buildRegistry } from '../source-faithful/registry.mjs';
import { sf8RegistryViolations } from '../source-faithful/product/registry-guard.mjs';
import { loadExtract } from '../source-faithful/evidence/psr709-extract.mjs';
import { completionGaps, DIMENSIONS, GAP_CLASS, TEST_MATRIX, TEST_CATEGORIES } from '../source-faithful/completion/gaps.mjs';
import { completionStatus, acceptanceGate } from '../source-faithful/completion/status.mjs';
import { buildCompletion, testIndex, ARTIFACT_DIR } from '../source-faithful/completion/build-completion.mjs';
import { researchSignal, reviewCandidateSignal, validateSignal, SIGNAL_TYPE } from '../source-faithful/signals/research-signal.mjs';
import { TURTLE_S1, TURTLE_S2 } from '../source-faithful/contracts/turtle.mjs';
import { DARVAS } from '../source-faithful/contracts/darvas.mjs';
import { KK_EPISODIC_PIVOT } from '../source-faithful/contracts/kullamagi.mjs';
import { runTurtle, MODEL_ASSUMPTIONS } from '../source-faithful/methods/turtle.mjs';
import { SCENARIO_SET } from '../source-faithful/runner/run-research.mjs';
import * as D from '../source-faithful/methods/darvas.mjs';
import * as W from '../source-faithful/methods/weinstein.mjs';
import * as M from '../source-faithful/methods/minervini.mjs';
import * as K from '../source-faithful/methods/kullamagi.mjs';
import * as P from '../source-faithful/methods/morales-kacher.mjs';
import * as H from '../source-faithful/methods/holy-grail.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const extract = loadExtract(), registry = buildRegistry(extract), idx = testIndex();
const entryOf = (c) => registry.entries.find((e) => e.strategyId === c.strategyId);

test('SF2-GAPS-SHAPE: 13 candidates x 15 dimensions; every gap has one of the six classes', () => {
  assert.equal(DIMENSIONS.length, 15);
  assert.equal(CONTRACTS.length, 13);
  for (const c of CONTRACTS) {
    const g = completionGaps(c, entryOf(c), { testIndex: idx });
    assert.equal(g.dimensions.length, 15, c.strategyId);
    for (const d of g.dimensions) for (const x of d.gaps) assert.ok(GAP_CLASS[x.class], `${c.strategyId} ${d.id} ${x.class}`);
    assert.ok(g.dimensions.find((d) => d.id === 'D14_LIVE').gaps.some((x) => x.ruleId === 'LIVE_NOT_APPROVED'));
  }
});

test('SF2-GAPS-DERIVED: a rule status change moves the gap class; nothing is declared closed by hand', () => {
  const c = TURTLE_S2, e = entryOf(c);
  const base = completionGaps(c, e, { testIndex: idx });
  // the correlation limits keep D07 PARTIAL (data missing) although their mechanics exist (review SF2-R1-01)
  const d07 = base.dimensions.find((d) => d.id === 'D07_PORTFOLIO_RISK');
  assert.equal(d07.status, 'PARTIAL');
  assert.deepEqual(d07.gaps.map((x) => `${x.ruleId}:${x.class}`), ['TUR-SF-LIMIT-CORR:DATA_GAP']);
  assert.equal(base.dimensions.find((d) => d.id === 'D04_EXIT').status, 'COMPLETE');
  const broken = { ...c, rules: c.rules.map((r) => (r.id === 'TUR-SF-ADD' ? { ...r, status: 'NOT_IMPLEMENTED', reason: 'x', code: undefined } : r)) };
  const g = completionGaps(broken, e, { testIndex: idx });
  assert.ok(g.dimensions.find((d) => d.id === 'D07_PORTFOLIO_RISK').gaps.some((x) => x.ruleId === 'TUR-SF-ADD' && x.class === 'IMPLEMENTATION_GAP'));
  assert.ok(g.dimensions.find((d) => d.id === 'D01_SOURCE_RULE_COVERAGE').gaps.some((x) => x.class === 'IMPLEMENTATION_GAP' && x.ruleId === 'TUR-SF-ADD'));
  // a missing test is an implementation gap
  const noTests = completionGaps(c, e, { testIndex: {} });
  assert.ok(noTests.dimensions.find((d) => d.id === 'D15_TESTS').gaps.length > 0);
});

test('SF2-TEST-MATRIX: every required test category is covered by an existing test or declared N/A with a reason', () => {
  for (const c of CONTRACTS) {
    const tm = TEST_MATRIX[c.strategyId];
    for (const cat of TEST_CATEGORIES) {
      const v = tm[cat];
      if (typeof v === 'string') { assert.match(v, /^N\/A: /, `${c.strategyId} ${cat}`); continue; }
      assert.ok(v && v.length, `${c.strategyId} ${cat}`);
    }
    const g = completionGaps(c, entryOf(c), { testIndex: idx });
    assert.deepEqual(g.dimensions.find((d) => d.id === 'D15_TESTS').gaps, [], c.strategyId);
  }
});

test('SF2-STATUS-DIMENSIONS: engine state and flags are separate; every candidate is LIVE_NOT_APPROVED; nothing is tradable', () => {
  const golden = JSON.parse(fs.readFileSync(path.join(ARTIFACT_DIR, 'STRATEGY-GOLDEN-CASE-RESULTS.json'), 'utf8'));
  for (const c of CONTRACTS) {
    const e = entryOf(c), g = completionGaps(c, e, { testIndex: idx });
    const gate = c.outputKind === 'RESEARCH_SIGNAL' ? acceptanceGate(c, e, g, { golden, reviews: { openHighOrCritical: 0 }, referenceRuns: [] }) : null;
    const s = completionStatus(c, e, g, gate);
    assert.ok(s.flags.includes('LIVE_NOT_APPROVED'));
    assert.equal(s.liveReadiness, 'LIVE_NOT_APPROVED');
    if (c.outputKind !== 'RESEARCH_SIGNAL') assert.notEqual(s.engine, 'RESEARCH_ENGINE_COMPLETE');
    if (s.engine === 'MECHANICAL_SCREEN_COMPLETE') assert.ok(s.flags.includes('MANUAL_REVIEW_REQUIRED') || s.flags.includes('PARTIAL_DATA_BLOCKED') || s.flags.includes('PARTIAL_SOURCE_BLOCKED'), c.strategyId);
  }
});

test('SF2-ACCEPTANCE-GATE: the gate needs a reconciled snapshot run of the CURRENT code fingerprint; a data-blocked limit makes the engine complete only WITH_DATA_EXCEPTION', () => {
  const golden = JSON.parse(fs.readFileSync(path.join(ARTIFACT_DIR, 'STRATEGY-GOLDEN-CASE-RESULTS.json'), 'utf8'));
  const MA = { modelAssumptions: MODEL_ASSUMPTIONS, scenarioIds: SCENARIO_SET.map((x) => x.id) };
  const run = (codeSha256, ok = true) => [{ method: 'X', runId: 'x', codeVersion: 'v', codeSha256, allScenariosReconciled: ok, endingPositionCheck: 'PASS' }];
  for (const c of [TURTLE_S1, TURTLE_S2]) {
    const e = entryOf(c), g = completionGaps(c, e, { testIndex: idx });
    const ok = acceptanceGate(c, e, g, { golden, reviews: { openHighOrCritical: 0 }, referenceRuns: run('abc'), codeSha256: 'abc', ...MA });
    assert.equal(ok.pass, true, JSON.stringify(ok.checks.filter((x) => !x.pass)));
    assert.deepEqual(ok.dataExceptions, ['TUR-SF-LIMIT-CORR']);
    const s = completionStatus(c, e, g, ok);
    assert.equal(s.engine, 'RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION');
    assert.equal(s.fullMethodMeasurable, false); // the correlation limits are never enforced without PIT groups
    assert.ok(s.flags.includes('PARTIAL_DATA_BLOCKED'));
    assert.equal(acceptanceGate(c, e, g, { golden, reviews: { openHighOrCritical: 1 }, referenceRuns: run('abc'), codeSha256: 'abc', ...MA }).pass, false);
    assert.equal(acceptanceGate(c, e, g, { golden, reviews: { openHighOrCritical: 0 }, referenceRuns: run('abc', false), codeSha256: 'abc', ...MA }).pass, false);
    // a run of other code (older engine, edited runner or accounting) is a regression reference only
    assert.equal(acceptanceGate(c, e, g, { golden, reviews: { openHighOrCritical: 0 }, referenceRuns: run('old'), codeSha256: 'abc', ...MA }).pass, false);
    assert.equal(acceptanceGate(c, e, g, { golden, reviews: { openHighOrCritical: 0 }, referenceRuns: run(null), codeSha256: null, ...MA }).pass, false);
    // a DATA_BLOCKED rule without mechanics, or an ambiguous rule with one reading, fails AG-1
    const noMech = { ...c, rules: c.rules.map((r) => (r.id === 'TUR-SF-LIMIT-CORR' ? { ...r, code: undefined, mechanics: undefined } : r)) };
    const gm = completionGaps(noMech, e, { testIndex: idx });
    assert.equal(acceptanceGate(noMech, e, gm, { golden, reviews: { openHighOrCritical: 0 }, referenceRuns: run('abc'), codeSha256: 'abc', ...MA }).checks.find((x) => x.id === 'AG-1-RULES').pass, false);
  }
  // a model assumption whose alternative scenario is not run fails AG-5
  const e1 = entryOf(TURTLE_S1), g1 = completionGaps(TURTLE_S1, e1, { testIndex: idx });
  assert.equal(acceptanceGate(TURTLE_S1, e1, g1, { golden, reviews: { openHighOrCritical: 0 }, referenceRuns: run('abc'), codeSha256: 'abc', modelAssumptions: MODEL_ASSUMPTIONS, scenarioIds: SCENARIO_SET.map((x) => x.id).filter((x) => x !== 'ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE') }).checks.find((x) => x.id === 'AG-5-NO-UNSOURCED-PRICE').pass, false);
  const oneReading = { ...TURTLE_S1, rules: TURTLE_S1.rules.map((r) => (r.id === 'TUR-SF-FAILSAFE-EXIT' ? { ...r, variants: undefined } : r)) };
  const go = completionGaps(oneReading, entryOf(TURTLE_S1), { testIndex: idx });
  assert.equal(acceptanceGate(oneReading, entryOf(TURTLE_S1), go, { golden, reviews: { openHighOrCritical: 0 }, referenceRuns: run('abc'), codeSha256: 'abc', ...MA }).checks.find((x) => x.id === 'AG-1-RULES').pass, false);
});

test('SF2-READINESS-AGREES-WITH-STATUS: the backtest readiness never claims more than the completion status (review SF2-R3-01)', () => {
  const b = JSON.parse(fs.readFileSync(path.join(ARTIFACT_DIR, 'STRATEGY-BACKTEST-READINESS.json'), 'utf8'));
  const s = JSON.parse(fs.readFileSync(path.join(ARTIFACT_DIR, 'STRATEGY-COMPLETION-STATUS.json'), 'utf8'));
  for (const m of b.methods) {
    const st = s.candidates.find((c) => c.strategyId === m.strategyId);
    assert.equal(m.fullDiagnosticMeasurement, st.fullMethodMeasurable, m.strategyId);
    if (m.allowed === 'FULL_DIAGNOSTIC_METHOD_RUN') assert.equal(st.engine, 'RESEARCH_ENGINE_COMPLETE');
    if (st.backtestReadiness === 'COMPONENT_SIGNAL_STUDY_ONLY') assert.equal(m.answers.accountingValid, false);
  }
  for (const id of ['SF_TURTLE_S1', 'SF_TURTLE_S2']) assert.equal(b.methods.find((m) => m.strategyId === id).answers.requiredDataPresent, false);
});

test('SF2-SIGNAL-CONTRACT: research signals carry the snapshot provenance; review candidates are never mechanical; live / orders are rejected', () => {
  const day = (k) => new Date(Date.UTC(2020, 0, 1) + k * 864e5).toISOString().slice(0, 10);
  const bars = [...Array.from({ length: 60 }, (_, k) => ({ date: day(k), open: 100, high: 105, low: 95, close: 100, volume: 1e6, rawClose: 100, rawVolume: 1e6, splitAdj: 1, dividend: 0 })), { date: day(60), open: 100, high: 108, low: 104, close: 107, volume: 1e6, rawClose: 107, rawVolume: 1e6, splitAdj: 1, dividend: 0 }];
  const r = runTurtle({ calendar: bars.map((b) => b.date), securities: [{ id: 'A', bars, terminal: null }] }, { system: 'S2' });
  const sig = r.signals[0], buy = r.ledger.find((x) => x.side === 'BUY');
  const s = researchSignal(TURTLE_S2, { securityId: sig.id, date: sig.date, path: sig.path, trigger: sig.trigger, fill: sig.fill, stop: sig.fill - 20, unitShares: buy.shares, n: 10 }, { provenance: { codeVersion: r.version } });
  assert.deepEqual(validateSignal(s), { ok: true, errors: [] });
  assert.equal(s.sourceContractVersion, '1.2.0'); // 1.2.0: Supertrader 3.0 research evidence on TUR-SF-LIMIT-CORR (status unchanged)
  assert.ok(s.dataCoverage.missing.includes('TUR-SF-LIMIT-CORR'));
  assert.ok(validateSignal({ ...s, liveActivation: true }).errors.includes('LIVE_ACTIVATION_FORBIDDEN'));
  assert.ok(validateSignal({ ...s, orderRouting: 'BROKER' }).errors.includes('ORDER_ROUTING_FORBIDDEN'));
  assert.ok(validateSignal({ ...s, provenance: { snapshotId: 'sts1-x' } }).errors.includes('RESEARCH_SIGNAL_WITHOUT_SNAPSHOT_PROVENANCE'));
  const rec = { securityId: 'X', asOf: '2021-01-12', machineScreenEvidence: [{ ruleId: 'DAR-SF-ENTRY', psr709: 'DAR-Q4' }], openQuestions: [{ flag: 'DAR-MR-SIZING' }], dataNotAvailableToMachine: ['industry (PIT)'] };
  const rc = reviewCandidateSignal(DARVAS, rec, { stopProposal: 10.99 });
  assert.deepEqual(validateSignal(rc), { ok: true, errors: [] });
  assert.equal(rc.signalType, SIGNAL_TYPE.REVIEW_CANDIDATE);
  assert.equal(rc.executionEligibility.status, 'REVIEW_REQUIRED');
  assert.ok(validateSignal({ ...rc, manualReviewStatus: 'NOT_REQUIRED' }).errors.includes('REVIEW_CANDIDATE_WITHOUT_REVIEW'));
  assert.ok(validateSignal({ ...rc, buyDeclarationAllowed: true }).errors.includes('BUY_DECLARATION_FORBIDDEN'));
  assert.equal(reviewCandidateSignal(KK_EPISODIC_PIVOT, rec).executionEligibility.status, 'NOT_EXECUTABLE_DATA_BLOCKED');
  // review SF2-R4-01..03: no mechanical signal from a review method, no prototype keys, no extra order fields, no bad dates
  const prov = s.provenance;
  assert.ok(validateSignal({ ...rc, executionEligibility: { status: 'RESEARCH_ONLY' }, provenance: prov }).errors.includes('MECHANICAL_SIGNAL_FROM_REVIEW_METHOD'));
  assert.ok(validateSignal({ ...rc, executionEligibility: { status: 'RESEARCH_ONLY' }, provenance: prov }).errors.includes('REVIEW_CANDIDATE_AS_MECHANICAL'));
  assert.ok(validateSignal(researchSignal(DARVAS, { securityId: 'X', date: '2021-01-12', fill: 11, stop: 10.99 })).errors.includes('MECHANICAL_SIGNAL_FROM_REVIEW_METHOD'));
  assert.ok(validateSignal({ ...rc, executionEligibility: { status: 'constructor' } }).errors.includes('ELIGIBILITY'));
  assert.ok(validateSignal({ ...s, order: { side: 'BUY' } }).errors.includes('UNKNOWN_FIELD:order'));
  assert.ok(validateSignal({ ...s, buyDeclarationAllowed: 'true' }).errors.includes('BUY_DECLARATION_FORBIDDEN'));
  assert.ok(validateSignal({ ...s, risk: null }).errors.includes('MISSING:risk'));
  assert.ok(validateSignal({ ...s, risk: { stop: null } }).errors.includes('ENTRY_WITHOUT_STOP'));
  assert.ok(validateSignal({ ...s, signalTimestamp: { date: '2020-13-45', phase: 'X' } }).errors.includes('SIGNAL_DATE'));
  assert.ok(validateSignal({ ...s, contractFingerprint: 'x' }).errors.includes('CONTRACT_FINGERPRINT'));
  assert.ok(validateSignal({ ...s, strategyId: 'SF_UNKNOWN' }).errors.includes('UNKNOWN_STRATEGY'));
  // the ORIGINAL-only short rule does not mark an equity Turtle signal as data-blocked
  assert.ok(!s.dataCoverage.missing.includes('TUR-SF-SHORT'));
});

test('SF2-MISSING-DATA-ALL-SCREENS: missing bars never throw, never produce NaN evidence and never become a box boundary', () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const day = (k) => new Date(Date.UTC(2018, 0, 1) + k * 864e5).toISOString().slice(0, 10);
  const mk = (n, holes) => {
    let c = 50; const out = [];
    for (let k = 0; k < n; k++) { c *= 1 + (rnd() - 0.47) * 0.06; const o = c * (1 + (rnd() - 0.5) * 0.02), h = Math.max(o, c) * (1 + rnd() * 0.02), l = Math.min(o, c) * (1 - rnd() * 0.02); out.push({ date: day(k), open: o, high: h, low: l, close: c, volume: 1e6 * (0.5 + rnd()), rawClose: c, rawVolume: 1e6, splitAdj: 1, dividend: 0 }); }
    for (let j = 0; j < holes; j++) { const k = 30 + Math.floor(rnd() * (n - 31)); out[k] = { ...out[k], open: null, high: null, low: null, close: null, volume: null }; }
    return out;
  };
  for (let t = 0; t < 12; t++) {
    const bars = mk(500, 8), bench = W.benchmarkWeekly(mk(500, 0)), sec = { id: `S${t}`, bars }, out = [];
    for (let i = 0; i < bars.length; i += 3) out.push(...D.darvasScreen(sec, { asOfIndex: i }));
    out.push(...D.darvasComponentTrades(sec));
    for (const e of D.darvasEvents(bars).events) if (e.type === 'BOTTOM_CONFIRMED' || e.type === 'BREAKOUT') assert.ok(Number.isFinite(e.bottom) && Number.isFinite(e.top), JSON.stringify(e));
    for (let w = 40; w < 70; w++) out.push(...W.investorScreen(sec, { bench, week: w }), ...W.traderScreen(sec, { bench, week: w }));
    for (let i = 260; i < bars.length; i += 5) out.push(...M.sepaScreen(sec, { asOfIndex: i }));
    for (let i = 60; i < bars.length; i += 2) out.push(...M.powerPlayScreen(sec, { asOfIndex: i }), ...H.holyGrailScreen(sec, { asOfIndex: i }));
    for (let i = 30; i < bars.length; i += 3) out.push(K.breakoutEvidence(bars, i), K.epGapEvidence(bars, i), K.parabolicEvidence(bars, i));
    for (let i = 60; i < bars.length; i++) out.push(...P.pocketPivotScreen(sec, { asOfIndex: i }), ...P.buyableGapUpScreen(sec, { asOfIndex: i }));
    assert.doesNotMatch(JSON.stringify(out), /NaN|Infinity/);
  }
});

test('SF2-LEGACY-ISOLATION: no product, page, workflow or legacy module imports the completion or signal modules; no live path exists', () => {
  const offenders = [];
  // every reference to the source-faithful tree outside it (review SF2-R4-13); allowed: its own tests and the research
  // workflow that runs the runner
  // and core/registry/domains.json only while its sole reference is the one pinned SF8 entry (V2, registry-guard.mjs)
  const allowed = (rel) => /^scripts\/supertrader\/source-faithful\//.test(rel) || /^scripts\/supertrader\/tests\/sf-[a-z0-9-]+\.test\.mjs$/.test(rel) || rel === '.github/workflows/supertrader-validation.yml'
    || (rel === 'core/registry/domains.json' && sf8RegistryViolations(fs.readFileSync(path.join(ROOT, rel), 'utf8')).length === 0);
  const scan = (dir) => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name), rel = path.relative(ROOT, p); if (f.isDirectory()) { if (!['node_modules', '.git'].includes(f.name)) scan(p); } else if (/\.(m?js|html|ya?ml|json)$/.test(f.name) && !allowed(rel) && fs.statSync(p).size < 5e6 && /source-faithful\/|research-signal\.mjs|completion\/(gaps|status|facts|build-completion)/.test(fs.readFileSync(p, 'utf8'))) offenders.push(rel); } };
  for (const d of ['supertrader', 'scripts/supertrader', '.github', 'core']) if (fs.existsSync(path.join(ROOT, d))) scan(path.join(ROOT, d));
  assert.deepEqual(offenders, []);
  for (const f of ['completion/gaps.mjs', 'completion/status.mjs', 'signals/research-signal.mjs']) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/source-faithful', f), 'utf8'), /fetch\(|writeFileSync|https?:\/\//, f);
});

test('SF2-COMPLETION-ARTIFACTS: committed completion artifacts equal a fresh build; no open implementation gap', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf2-completion-'));
  try {
    const files = buildCompletion(tmp);
    for (const f of Object.keys(files)) assert.equal(fs.readFileSync(path.join(tmp, f), 'utf8'), fs.readFileSync(path.join(ARTIFACT_DIR, f), 'utf8'), `${f} is stale: run completion/build-completion.mjs`);
    assert.deepEqual(files['STRATEGY-COMPLETION-GAPS.json'].openImplementationGaps, []);
    assert.equal(files['STRATEGY-COMPLETION-STATUS.json'].candidates.length, 13);
    assert.ok(files['STRATEGY-LIVE-READINESS.json'].methods.every((m) => m.liveReadiness === 'LIVE_NOT_APPROVED'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('SF2-COMPLETION-DOCS: generated completion matrix / data gaps / backtest readiness docs equal a fresh build', async () => {
  const { buildCompletionDocs, DOCS_DIR } = await import('../source-faithful/completion/build-completion-docs.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf2-docs-'));
  try { for (const f of Object.keys(buildCompletionDocs(tmp))) assert.equal(fs.readFileSync(path.join(tmp, f), 'utf8'), fs.readFileSync(path.join(DOCS_DIR, f), 'utf8'), `${f} is stale: run completion/build-completion-docs.mjs`); }
  finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
