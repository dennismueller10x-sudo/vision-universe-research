import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = join(import.meta.dirname, '..', '..');
const C = require('../engines/backtest-result-contract.cjs');
const A = require('../engines/backtest-result-adapters.cjs');
const K = require('../engines/backtest-kinds.cjs');
const Api = require('../api/backtest-research-adapter.js');
const R = require('../engines/research-studies.cjs');
const P = require('../engines/research-portfolio.cjs');
const V = require('../engines/research-validation.cjs');
const json = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const cert = json('quant/data/product/backtest-certification-v1.json');
const signal = json('quant/data/product/signal-backtest-v1.json');
const setup = json('quant/data/product/setup-backtest-v1.json');
const pattern = json('quant/data/product/pattern-research-v1/study.json');
const valid = (e, opts) => { const r = C.validate(e, opts); assert.ok(r.valid, r.errors.join(', ')); return r; };
const invalid = (e, code, opts) => { const r = C.validate(e, opts); assert.equal(r.valid, false); assert.ok(r.errors.some(x => x.includes(code)), code + ' not in ' + r.errors.join(', ')); };
const reseal = (e, change) => { const x = structuredClone(e); change(x); return C.seal(x); };

/* ------------------------------------------------- Forschungs-Fixtures */
const day = k => new Date(Date.UTC(2010, 0, 1) + k * 7 * 86400000).toISOString().slice(0, 10);
function listing(id, n = 180, phase = 0) {
  return { listingId: id, issuerId: 'issuer:' + id,
    identity: { mic: 'XNYS', instrumentClass: 'COMMON_STOCK', primary: true, validFrom: '1990-01-01', availableAt: '1990-01-01T00:00:00Z', sourceHash: 'synthetic-identity' },
    membership: [{ validFrom: '1990-01-01', availableAt: '1990-01-01T00:00:00Z', sourceHash: 'synthetic-membership' }],
    bars: Array.from({ length: n }, (_, k) => { const close = 100 + 0.1 * k + 15 * Math.sin(k / 8 + phase); return { date: day(k), close, returnLevel: close, availableAt: day(k) + 'T21:01:00Z', closeAt: day(k) + 'T21:00:00Z', sourceHash: 'synthetic-bar-' + k }; }) };
}
function options(listings = [listing('A'), listing('B', 180, 2)]) {
  return { asOf: day(179), sourceMode: 'SYNTHETIC_TEST', returnBasis: 'TOTAL_RETURN', currency: 'USD',
    registration: { id: 'fixture-rule', version: '1.0.0', frozenAt: '2009-01-01T00:00:00Z', analysisMode: 'EXPLORATORY' },
    horizonBars: 4, costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 10, slippageBps: 5 }, listings,
    benchmark: { currency: 'USD', returnBasis: 'TOTAL_RETURN', bars: listing('SPY').bars } };
}
const fixedPattern = { id: 'FIXED_ABOVE_MA', version: '1', terms: [{ feature: 'aboveSma40w', operator: 'eq', value: true }] };
function researchResults() {
  const ls = [listing('A'), listing('B'), listing('C'), listing('D')];
  return {
    SIGNAL_BACKTEST: R.runSignalStudy(options()),
    SAME_STOCK_REPLAY_RULE: R.runReplayValidation({ ...options([listing('A')]), pattern: fixedPattern, cooldownBars: 8 }),
    PATTERN_EVIDENCE: R.runPatternStudy({ ...options(), pattern: fixedPattern, cooldownBars: 4 }),
    SETUP_BACKTEST: R.runSetupStudy({ ...options([listing('A')]), horizonBars: 26, entryStates: ['CONFIRMED'], setups: [
      { listingId: 'A', date: day(60), availableAt: day(60) + 'T21:02:00Z', sourceHash: 's60', sourceMode: 'SYNTHETIC_TEST', state: 'CONFIRMED' },
      { listingId: 'A', date: day(170), availableAt: day(170) + 'T21:02:00Z', sourceHash: 's170', sourceMode: 'SYNTHETIC_TEST', state: 'CONFIRMED' }] }),
    FACTOR_RANKING_BACKTEST: R.runFactorStudy({ ...options(ls), buckets: 2, factorId: 'VALUE', factorSnapshots: [{ date: day(70), availableAt: day(70) + 'T21:01:00Z', sourceHash: 'cross-section',
      rows: ls.map((l, k) => ({ listingId: l.listingId, value: k, availableAt: day(70) + 'T20:00:00Z', sourceHash: 'factor-' + k })) }] }),
    EVENT_DRIVEN: R.runEventStudy({ ...options([listing('A')]), events: [
      { eventId: 'pre', eventType: 'SEC_FILING', listingId: 'A', occurredAt: day(60), publishedAt: day(60) + 'T12:00:00Z', availableAt: day(60) + 'T12:01:00Z', sourceHash: 'filing1' }] })
  };
}
const H = 'a'.repeat(64);
function portfolioFixture() {
  const dates = ['2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07', '2020-01-08', '2020-01-09', '2021-01-04', '2021-01-05'];
  const closeAt = d => d + 'T21:00:00Z';
  return {
    sessions: dates.map(date => ({ date, closeAt: closeAt(date) })), initialCapital: 1000, currency: 'USD',
    provenance: { mode: 'SYNTHETIC_TEST', datasetHash: H }, costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 10, slippageBps: 5 },
    maxMembershipAgeDays: 400, maxFactorAgeDays: 45,
    listings: ['A', 'B'].map(listingId => ({ listingId, issuerId: 'ISSUER_' + listingId, mic: 'XNAS', instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', firstTradeDate: '2010-01-01', lastTradeDate: null,
      bars: dates.map((date, k) => ({ date, availableAt: closeAt(date), close: listingId === 'A' ? 100 + k : 50 - k / 2 })), events: [] })),
    memberships: [{ effectiveAt: '2020-01-01T21:00:00Z', availableAt: '2020-01-01T21:00:00Z', sourceHash: H, members: ['A', 'B'] }], factorSnapshots: [],
    targets: [{ decisionDate: dates[0], executionDate: dates[1], availableAt: closeAt(dates[0]), membershipHash: H, weights: { A: 0.6, B: 0.3 } },
      { decisionDate: dates[3], executionDate: dates[4], availableAt: closeAt(dates[3]), membershipHash: H, weights: { A: 0.5 } }],
    benchmark: { currency: 'USD', returnBasis: 'TOTAL_RETURN', sourceHash: H, costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: dates.map((date, k) => ({ date, level: 100 + 2 * k })) }
  };
}
function pythonCheck(source, ledger, envelope) {
  const dir = mkdtempSync(join(tmpdir(), 'vu-result-v2-'));
  try {
    const file = join(dir, 'case.json'); writeFileSync(file, JSON.stringify({ source, ledger, envelope }));
    return JSON.parse(execFileSync('python3', ['-I', join(root, 'scripts/quant/verify-backtest-result-v2.py'), file], { encoding: 'utf8' }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const realWeekly = (() => { let cache = null; return () => {
  if (cache) return cache;
  const W = require('../engines/weekly-real-adapter.cjs'), B = require('../engines/weekly-benchmark.cjs'), { run } = require('../../scripts/quant/run-real-weekly-backtest.cjs');
  return (cache = run(W.load(root, 'ref_NVDA'), { benchmark: B.load(root) }));
}; })();

/* ------------------------------------------------- Vertrag */
test('schema document and contract engine agree on sections, enums, metric keys, kinds, methods and alpha patterns', () => {
  const doc = json('docs/quant/backtest-result-v2.schema.json');
  assert.equal(doc.schemaVersion, C.VERSION); assert.equal(C.CONTRACT_PATH, 'docs/quant/backtest-result-v2.schema.json');
  assert.deepEqual(doc.sections, C.SECTIONS); assert.deepEqual(doc.enums, C.ENUMS); assert.deepEqual(doc.metricKeys, C.METRIC_KEYS);
  assert.deepEqual(doc.kinds, [...K.KINDS]); assert.deepEqual(doc.methods, [...K.METHODS]);
  assert.deepEqual(doc.alphaClaimPatterns, C.ALPHA_CLAIM_PATTERNS.map(r => r.source));
  assert.deepEqual(Object.keys(doc.states), C.ENUMS.state);
});

test('every committed signal and setup rule adapts to a valid envelope; inputs stay unchanged', () => {
  const before = [structuredClone(signal), structuredClone(setup)];
  for (const r of signal.rules) {
    const e = A.fromSignalStudyRule(signal, r.id, { certification: cert, artifact: 'quant/data/product/signal-backtest-v1.json' });
    valid(e, { certification: cert }); valid(e);
    assert.equal(e.identity.kind, 'SIGNAL_BACKTEST'); assert.equal(e.metrics.basis, 'PER_EVENT'); assert.equal(e.metrics.totalReturn, null);
    assert.equal(e.metrics.hitRate, r.horizons.m6.positiveShare); assert.deepEqual(e.uncertainty.interval, r.horizons.m6.baseRate.ci);
    assert.equal(e.status.state, 'RESEARCH_EXECUTED'); assert.equal(e.status.certificationScope, 'RULE');
    assert.equal(e.status.certificationStatus, cert.kinds.find(k => k.id === 'SIGNAL_BACKTEST').rules.find(x => x.id === r.id).status);
    assert.equal(e.status.productionApproved, false); assert.ok(e.limitations.includes('NO_ALPHA_OR_CERTIFICATION_CLAIM'));
    assert.equal(e.methods.find(m => m.method === 'OUT_OF_SAMPLE').state, 'EXECUTED');
  }
  for (const r of setup.rules) {
    const e = A.fromSetupStudyRule(setup, r.id, { certification: cert });
    valid(e, { certification: cert });
    assert.equal(e.identity.kind, 'SETUP_BACKTEST'); assert.equal(e.period.grain, 'DAILY');
    assert.equal(e.status.certificationStatus, cert.kinds.find(k => k.id === 'SETUP_BACKTEST').status);
    assert.ok(e.limitations.includes('PRODUCT_DISPLAY_NOT_ALLOWED'));
  }
  assert.throws(() => A.fromSetupStudyRule(signal, 'TREND_UP'), /STUDY_KIND_MISMATCH/);
  assert.throws(() => A.fromSignalStudyRule(signal, 'NOPE'), /UNKNOWN_RULE/);
  assert.deepEqual([signal, setup], before);
});

test('every committed pattern finding adapts; BH correction never licenses an alpha label', () => {
  for (const f of pattern.findings) {
    const e = A.fromPatternFinding(pattern, f.patternId, { certification: cert });
    valid(e, { certification: cert });
    assert.equal(e.uncertainty.family.correction, 'BENJAMINI_HOCHBERG'); assert.equal(C.holmSupportsClaim(e.uncertainty), false);
    assert.equal(e.dataQuality.totalReturnBasis, 'SPLIT_ADJUSTED_PRICE');
  }
  const robust = A.fromPatternFinding(pattern, pattern.findings.find(f => f.verdict === 'ROBUST').patternId);
  invalid(reseal(robust, x => { x.spec.description = 'Alpha confirmed out of sample'; }), 'ALPHA_CLAIM');
});

test('certification kinds become status blocks and number-free envelopes; nothing is promoted', () => {
  for (const k of cert.kinds) {
    const s = A.statusFromCertification(cert, k.id);
    assert.equal(s.certificationStatus, k.status); assert.equal(s.productionApproved, false); assert.notEqual(s.state, 'PRODUCT_CERTIFIED');
    const e = A.fromCertificationKind(cert, k.id);
    valid(e, { certification: cert }); assert.equal(e.metrics.basis, 'NONE'); assert.equal(e.status.state, 'PREPARED_DATA_LIMITED');
  }
  assert.throws(() => A.statusFromCertification(cert, 'SIGNAL_BACKTEST', { state: 'PRODUCT_CERTIFIED' }), /NEVER_SET_PRODUCT_CERTIFIED/);
  assert.throws(() => A.statusFromCertification({ schemaVersion: 'x', kinds: [] }, 'SIGNAL_BACKTEST'), /UNKNOWN_CERTIFICATION_SCHEMA/);
});

test('every research-studies finish() kind and a run-research envelope adapt to valid envelopes', () => {
  const results = researchResults();
  for (const [kind, result] of Object.entries(results)) {
    const opts = kind === 'EVENT_DRIVEN' ? { kind: 'SIGNAL_BACKTEST' } : {};
    const e = A.fromResearchStudy(result, opts); valid(e);
    const resolved = K.resolve('researchStudyKind', kind);
    assert.equal(e.identity.kind, resolved.kind || 'SIGNAL_BACKTEST');
    if (resolved.method) assert.equal(e.methods.find(m => m.method === resolved.method).state, 'EXECUTED');
    assert.equal(e.status.state, 'PREPARED_DATA_LIMITED'); assert.equal(e.status.evidenceKind, 'SYNTHETIC_TEST');
    assert.equal(e.events.occurrences, result.coverage.expected); assert.equal(e.events.completed, result.coverage.observed);
    assert.ok(e.limitations.includes('SYNTHETIC_TEST_DATA'));
    assert.equal(pythonCheck('research', result, e).state, 'PASS');
  }
  assert.equal(A.fromResearchStudy(results.SAME_STOCK_REPLAY_RULE).identity.scope, 'SINGLE_LISTING');
  assert.throws(() => A.fromResearchStudy(results.EVENT_DRIVEN), /KIND_REQUIRED_FOR_METHOD_ENVELOPE/);
  assert.throws(() => A.fromResearchStudy(results.SIGNAL_BACKTEST, { kind: 'SETUP_BACKTEST' }), /KIND_CONTRADICTS_RESULT/);
  const wrapped = require('../../scripts/quant/run-research.cjs').execute('signal', options());
  const e = A.fromResearchStudy(wrapped, { certification: cert }); valid(e, { certification: cert });
  assert.equal(e.identity.source.engineVersion, 'quant-research-contract-1.0.0'); assert.equal(e.identity.source.resultHash, wrapped.resultHash);
  /* Historische Simulation (nicht synthetisch) mit beobachteten Ausgaengen -> A, nie C. */
  const hist = options(); hist.sourceMode = 'HISTORICAL_SIMULATION'; hist.expectedCalendar = hist.listings[0].bars.map(b => b.date);
  const h = A.fromResearchStudy(R.runSignalStudy(hist)); valid(h);
  assert.ok(h.events.completed > 0); assert.equal(h.status.state, 'RESEARCH_EXECUTED'); assert.equal(h.status.evidenceKind, 'TESTED');
  assert.equal(pythonCheck('research', R.runSignalStudy(hist), h).state, 'PASS');
});

test('research-portfolio ledger adapts with a full path; path metrics match an independent Python computation', () => {
  const x = portfolioFixture(), r = P.runPortfolio(x), before = structuredClone(r);
  const e = A.fromPortfolio(r, { certification: cert }); valid(e, { certification: cert });
  assert.equal(e.identity.kind, 'STRATEGY_BACKTEST'); assert.equal(e.metrics.basis, 'PORTFOLIO'); assert.equal(e.portfolio.dates.length, r.equity.length);
  assert.equal(e.metrics.totalReturn, r.metrics.cumulativeReturn); assert.equal(e.metrics.turnover, r.metrics.oneWayTurnoverSum);
  assert.ok(e.metrics.cashShare > 0 && e.metrics.cashShare < 1); assert.equal(e.metrics.annualReturns.length, 2);
  assert.equal(e.status.state, 'PREPARED_DATA_LIMITED'); assert.equal(e.methods.find(m => m.method === 'PORTFOLIO_REBALANCING').state, 'EXECUTED');
  assert.equal(pythonCheck('portfolio', r, e).state, 'PASS');
  valid(A.fromPortfolio(r, { kind: 'FACTOR_RANKING_BACKTEST' }));
  assert.throws(() => A.fromPortfolio(r, { kind: 'SIGNAL_BACKTEST' }), /STRATEGY_OR_FACTOR/);
  assert.deepEqual(r, before);
});

test('real weekly ledger from committed NVDA history adapts; metrics re-computed independently in Python', () => {
  const r = realWeekly(), e = A.fromRealWeeklyLedger(r, { certification: cert });
  valid(e, { certification: cert });
  assert.equal(e.identity.scope, 'SINGLE_LISTING'); assert.equal(e.identity.listingId, r.input.listingId);
  assert.equal(e.metrics.totalReturn, r.metrics.totalReturn); assert.equal(e.metrics.cagr, r.metrics.cagr); assert.equal(e.metrics.maxDrawdown, r.metrics.maxDrawdown);
  assert.equal(e.metrics.trades, r.trades.length); assert.equal(e.metrics.excess.cagr, r.benchmark.excessCagr);
  assert.equal(e.dataQuality.totalReturnBasis, 'PRICE_RETURN'); assert.ok(e.limitations.includes('SINGLE_LISTING_NOT_AGGREGATE_SIGNAL_EVIDENCE'));
  assert.equal(e.status.state, 'RESEARCH_EXECUTED'); assert.equal(e.status.evidenceKind, 'SIMULATED_LEDGER');
  assert.equal(pythonCheck('real-weekly', r, e).state, 'PASS');
  const corrupt = structuredClone(e); corrupt.metrics.volatility *= 1.01;
  assert.throws(() => pythonCheck('real-weekly', r, corrupt));
});

test('validate fails closed: approval, hashes, unknown fields, basis rules, synthetic state, methods', () => {
  const e = A.fromSignalStudyRule(signal, 'TREND_UP');
  invalid(reseal(e, x => { x.status.productionApproved = true; }), 'PRODUCTION_APPROVAL_FORBIDDEN');
  const tampered = structuredClone(e); tampered.metrics.hitRate = 0.99; invalid(tampered, 'ENVELOPE_HASH_MISMATCH');
  const spec = structuredClone(e); spec.spec.parameters.horizon = 'm12'; spec.envelopeHash = C.hash(Object.fromEntries(Object.entries(spec).filter(([k]) => k !== 'envelopeHash'))); invalid(spec, 'SPEC_HASH_MISMATCH');
  invalid(reseal(e, x => { x.extra = 1; }), 'UNKNOWN_FIELD:extra');
  invalid(reseal(e, x => { x.metrics.edge = 1; }), 'UNKNOWN_FIELD:edge');
  invalid(reseal(e, x => { x.metrics.totalReturn = 0.5; }), 'PER_EVENT_FORBIDS_totalReturn');
  invalid(reseal(e, x => { x.metrics.maxDrawdown = 0.1; }), 'MAX_DRAWDOWN_POSITIVE');
  invalid(reseal(e, x => { x.status.evidenceKind = 'SYNTHETIC_TEST'; }), 'SYNTHETIC_EVIDENCE_IS_PREPARED_ONLY');
  invalid(reseal(e, x => { x.methods.pop(); }), 'METHOD_MISSING');
  invalid(reseal(e, x => { x.limitations = []; }), 'LIMITATIONS_REQUIRED');
  invalid(reseal(e, x => { x.identity.kind = 'MARKET_PATTERN_BACKTEST'; }), 'UNKNOWN_KIND');
  invalid(reseal(e, x => { x.portfolio = { dates: [], equity: [], cashShare: [], initialCapital: 1, endCapital: 1 }; }), 'PORTFOLIO_ONLY_WITH_PORTFOLIO_BASIS');
  invalid(reseal(e, x => { x.period.to = '2030-01-01'; }), 'PERIOD_AFTER_AS_OF');
  invalid(reseal(e, x => { x.status.certificationStatus = 'CERTIFIED'; }), 'CERTIFIED_STATUS_WITHOUT_CERTIFICATION_ARTIFACT');
  const withCert = A.fromSignalStudyRule(signal, 'TREND_UP', { certification: cert });
  invalid(reseal(withCert, x => { x.status.certificationStatus = 'COLLECTING_HISTORY'; }), 'CERTIFICATION_STATUS_CONTRADICTS_ARTIFACT', { certification: cert });
});

function fakeCertified(kind, gateState = 'PASS') {
  const status = gateState === 'PASS' ? 'CERTIFIED' : 'CERTIFIED';
  return { schemaVersion: 'backtest-certification-1.0.0', kinds: [{ id: kind, label: kind, tier: 'TESTED', gates: [{ id: 'pit', label: 'pit', category: 'HARD', state: gateState, value: null, required: null, reason: gateState === 'PASS' ? null : 'PIT' }],
    trust: 'USABLE', published: true, ownerApproval: { required: false, given: false }, minimumTrust: 'USABLE', status, readiness: gateState === 'PASS' ? 'CERTIFICATION_READY' : 'CERTIFICATION_READY', reason: null, blockers: [] }] };
}

test('PRODUCT_CERTIFIED only with a certification artifact that certifies this kind and follows its gates', () => {
  const e = A.fromSignalStudyRule(signal, 'TREND_UP');
  const promoted = reseal(e, x => { x.status.state = 'PRODUCT_CERTIFIED'; x.status.certificationStatus = 'CERTIFIED'; });
  invalid(promoted, 'PRODUCT_CERTIFIED_WITHOUT_CERTIFICATION_ARTIFACT');
  invalid(promoted, 'PRODUCT_CERTIFIED_WITHOUT_CERTIFICATION_ARTIFACT', { certification: cert });
  invalid(promoted, 'PRODUCT_CERTIFIED_WITHOUT_CERTIFICATION_ARTIFACT', { certification: fakeCertified('SETUP_BACKTEST') });
  invalid(promoted, 'PRODUCT_CERTIFIED_WITHOUT_CERTIFICATION_ARTIFACT', { certification: fakeCertified('SIGNAL_BACKTEST', 'FAIL') });
  valid(promoted, { certification: fakeCertified('SIGNAL_BACKTEST') });
  invalid(reseal(promoted, x => { x.status.evidenceKind = 'SYNTHETIC_TEST'; }), 'SYNTHETIC_EVIDENCE_IS_PREPARED_ONLY', { certification: fakeCertified('SIGNAL_BACKTEST') });
  /* Kein heutiges Artefakt zertifiziert eine Art. */
  assert.equal(cert.kinds.some(k => k.status === 'CERTIFIED'), false);
});

test('alpha labels require a Holm-adjusted p below alpha; anything else is refused', () => {
  const e = A.fromSignalStudyRule(signal, 'TREND_UP');
  const claim = x => { x.spec.description = 'edge proven'; };
  invalid(reseal(e, claim), 'ALPHA_CLAIM');
  const adjusted = V.holm([0.001, 0.02, 0.04, 0.3, 0.5]);
  const holm = (p, alpha) => x => { claim(x); x.uncertainty.p = 0.001; x.uncertainty.family = { size: 5, correction: 'HOLM', adjustedP: p, alpha }; };
  valid(reseal(e, holm(adjusted[0], 0.05)));
  invalid(reseal(e, holm(adjusted[2], 0.05)), 'ALPHA_CLAIM');
  invalid(reseal(e, holm(adjusted[0], 0.2)), 'ALPHA_CLAIM');
  invalid(reseal(e, x => { claim(x); x.uncertainty.family = { size: 5, correction: 'BENJAMINI_HOCHBERG', adjustedP: 0.001, alpha: 0.05 }; }), 'ALPHA_CLAIM');
  for (const s of ['Alpha nach Kosten', 'beats the market', 'Vorteil bewiesen', 'guaranteed outperformance']) invalid(reseal(e, x => { x.limitations.push(s); }), 'ALPHA_CLAIM');
  for (const s of ['NO_ALPHA_OR_CERTIFICATION_CLAIM', 'alphabet', 'Edge case']) valid(reseal(e, x => { x.limitations.push(s); }));
});

/* ------------------------------------------------- API-Vorschlag */
test('research adapter is disabled by default, always carries status and limitations, and never shows numbers', () => {
  const e = A.fromSignalStudyRule(signal, 'TREND_UP', { certification: cert });
  const off = Api.getResearchBacktest('SIGNAL_BACKTEST', e, { certification: cert });
  assert.equal(off.state, 'DISABLED'); assert.equal(off.disabled, true); assert.equal(off.status.productionApproved, false); assert.deepEqual(off.limitations, e.limitations);
  const on = Api.getResearchBacktest('SIGNAL_BACKTEST', e, { certification: cert, enabled: true });
  assert.equal(on.state, 'AVAILABLE'); assert.equal(on.rules.length, 1);
  for (const f of Api.PAGE_BACKTEST_FIELDS.study) assert.ok(f in on, 'study.' + f);
  for (const f of Api.PAGE_BACKTEST_FIELDS.rule) assert.ok(f in on.rules[0], 'rule.' + f);
  assert.equal(on.rules[0].display.allowed, false); assert.equal(on.rules[0].trust, 'NOT_READY'); assert.ok(on.rules[0].horizons.m6);
  assert.equal(on.status.state, 'RESEARCH_EXECUTED'); assert.deepEqual(on.limitations, e.limitations);
  assert.equal(Api.getResearchBacktest('SETUP_BACKTEST', e, { enabled: true }).reason, 'KIND_MISMATCH');
  const broken = structuredClone(e); broken.metrics.hitRate = 1;
  assert.equal(Api.getResearchBacktest('SIGNAL_BACKTEST', broken, { enabled: true }).reason, 'RESULT_CONTRACT_VIOLATED');
  const promoted = reseal(e, x => { x.status.state = 'PRODUCT_CERTIFIED'; x.status.certificationStatus = 'CERTIFIED'; x.status.certificationScope = 'KIND'; x.status.certificationRuleId = null; });
  assert.equal(Api.getResearchBacktest('SIGNAL_BACKTEST', promoted, { enabled: true, certification: cert }).state, 'UNAVAILABLE');
  assert.equal(Api.getResearchBacktest('SIGNAL_BACKTEST', promoted, { enabled: true }).state, 'UNAVAILABLE');
  const ok = Api.getResearchBacktest('SIGNAL_BACKTEST', promoted, { enabled: true, certification: fakeCertified('SIGNAL_BACKTEST') });
  assert.equal(ok.state, 'AVAILABLE'); assert.equal(ok.rules[0].display.allowed, false);
  for (const env of [A.fromRealWeeklyLedger(realWeekly()), A.fromPortfolio(P.runPortfolio(portfolioFixture())), A.fromCertificationKind(cert, 'FACTOR_RANKING_BACKTEST', {})])
    assert.equal(Api.getResearchBacktest(env.identity.kind, env, { enabled: true, certification: env.status.certificationSource ? cert : null }).state, 'AVAILABLE');
});

test('the field list matches what page-backtest.js reads today (read-only)', () => {
  const page = readFileSync(join(root, 'quant/app/page-backtest.js'), 'utf8');
  const grab = re => [...new Set([...page.matchAll(re)].map(m => m[1]))].sort();
  assert.deepEqual(grab(/\b(?:r|rule)\.([a-zA-Z]+)/g), [...Api.PAGE_BACKTEST_FIELDS.rule].sort());
  assert.deepEqual(grab(/\b(?:study|signal)\.([a-zA-Z]+)/g), [...Api.PAGE_BACKTEST_FIELDS.study].sort());
});

test('nothing outside tests and docs imports the research adapter; product services import none of the new modules', () => {
  const grep = needle => { try { return execFileSync('git', ['grep', '--untracked', '-l', '-F', needle, '--', '.', ':!quant/data', ':!discover/data', ':!supertrader/data', ':!social/data'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean); } catch (e) { if (e.status === 1) return []; throw e; } };
  const outside = files => files.filter(f => !f.startsWith('quant/tests/') && !f.startsWith('docs/'));
  assert.deepEqual(outside(grep('backtest-research-adapter')), []);
  assert.deepEqual(outside(grep('VUBacktestResearchAdapter')), ['quant/api/backtest-research-adapter.js']);
  assert.deepEqual(outside(grep('backtest-result-adapters')).sort(), ['quant/engines/backtest-result-adapters.cjs', 'scripts/quant/verify-backtest-result-v2.py'].sort());
  assert.deepEqual(outside(grep('backtest-result-contract.cjs')).sort(), ['quant/api/backtest-research-adapter.js', 'quant/engines/backtest-result-adapters.cjs'].sort());
  for (const f of ['quant/api/product-services.js', 'quant/index.html', 'quant/app/page-backtest.js'])
    for (const needle of ['backtest-kinds', 'backtest-result-', 'backtest-research-adapter']) assert.equal(readFileSync(join(root, f), 'utf8').includes(needle), false, f + ' mentions ' + needle);
});
