import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const require = createRequire(import.meta.url);
const K = require('../../scripts/quant/v10/studies/common.cjs');
const SS = require('../../scripts/quant/v10/studies/signal-study.cjs');
const PS = require('../../scripts/quant/v10/studies/pattern-study.cjs');
const W = require('../../scripts/quant/v10/studies/engine-worker.cjs');
const { plan } = require('../../scripts/quant/v10/studies/plan.cjs');
const S = require('../engines/research-studies.cjs');
const Portfolio = require('../engines/research-portfolio.cjs');

function weeks(n, start = Date.UTC(1998, 0, 2)) { const out = []; for (let i = 0; i < n; i++) out.push(new Date(start + i * 7 * 86400000).toISOString().slice(0, 10)); return out; }
function series(seed, n, drift = 0.002) { let s = seed, p = 20; const out = []; for (let i = 0; i < n; i++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; p *= 1 + drift + (s / 4294967296 - 0.5) * 0.12; out.push(Math.round(p * 1e4) / 1e4); } return out; }
// Synthetic context: three listings on one weekly calendar (one starts later, one has a calendar gap).
function synthetic() {
  const cal = weeks(420), docs = new Map(), frame = [];
  const mk = (id, from, to, seed, skip = -1) => {
    const closes = series(seed, to - from); const points = [];
    for (let i = from; i < to; i++) if (i !== skip) points.push([cal[i], closes[i - from]]);
    docs.set(id, { points, listingId: 'tiingo:NASDAQ:' + id.slice(4) + ':1990-01-01', listingStart: cal[from], identityHash: 'a'.repeat(64), masterGeneratedAt: '2026-01-01T00:00:00Z', asOf: cal.at(-1) }); frame.push(id);
  };
  mk('ref_AAA', 0, 420, 7); mk('ref_BBB', 60, 420, 99); mk('ref_CCC', 0, 400, 1234, 250);
  const fr = { calendar: cal, frame, docs, loaderOptions: {} };
  const R = { id: 'T', version: '1', registeredAt: '2026-01-01T00:00:00Z', costs: { base: { feeBps: 10, slippageBps: 5 } }, window: { signalDates: [cal[0], cal.at(-1)] } };
  const ctx = { R, fr, panel: K.buildPanel(fr), benchmark: { byDate: new Map(cal.map((d, i) => [d, 100 + i])), ret: (a, z) => (100 + cal.indexOf(z)) / (100 + cal.indexOf(a)) - 1 } };
  ctx.studyCalendar = cal; return ctx;
}
function engineSignal(ctx, p, h) {
  return S.runSignalStudy({ ...K.engineInput(ctx, { ruleIds: ['MOMENTUM_IMPROVED', 'MOMENTUM_DETERIORATED', 'TREND_UP', 'TREND_DOWN', 'NEW_52W_HIGH'] }), horizonBars: h, expectedCalendar: ctx.fr.calendar,
    benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', bars: ctx.fr.calendar.map(d => ({ date: d, close: ctx.benchmark.byDate.get(d) })) }, listings: [K.listingOf(p)] });
}

test('registration is intact and equals the registered plan (no post-hoc change of rules)', () => {
  const reg = K.readRegistration(), r = reg.registration, p = plan();
  for (const k of Object.keys(p)) assert.deepEqual(r[k], p[k], 'plan field changed after registration: ' + k);
  assert.equal(r.studies.SIGNAL_BACKTEST.family.size, 5 * 4 * 3);
  assert.equal(r.studies.PATTERN_EVIDENCE.family.size, r.studies.PATTERN_EVIDENCE.candidates.length * 2 * 3);
  assert.equal(r.productionApproved, false);
});

test('panel outcome and eligibility rules reproduce runSignalStudy event by event', () => {
  const ctx = synthetic();
  for (const p of ctx.panel) for (const h of [4, 13, 52]) {
    const r = engineSignal(ctx, p, h); assert.ok(r.events.length > 0);
    for (const e of r.events) {
      const k = p.dates.indexOf(e.signalDate), g = K.forwardGross(p, k, h), ok = K.eligibleAt(p, k, K.SIGNAL_FEATURE_LOOKBACK) && g !== null;
      assert.equal(ok, e.state === 'OBSERVED', p.id + ' ' + e.signalDate + ' ' + e.state);
      if (ok) assert.equal(g, e.grossReturn);
    }
  }
  const ccc = ctx.panel.find(p => p.id === 'ref_CCC'); assert.equal(ccc.gap[ccc.closes.length], 1);
});

test('worker path (calendar and benchmark start at the first bar) yields identical engine events', () => {
  const ctx = synthetic(), bars = ctx.fr.calendar.map(d => ({ date: d, close: ctx.benchmark.byDate.get(d) }));
  for (const p of ctx.panel) {
    const x = K.workerListing(p), out = W.runChunk({ kind: 'signal', listings: [x], calendar: ctx.fr.calendar, benchmark: bars, base: K.engineInput(ctx), horizons: [13], extra: { ruleIds: ['TREND_UP', 'NEW_52W_HIGH'] } })[13];
    const direct = S.runSignalStudy({ ...K.engineInput(ctx, { ruleIds: ['TREND_UP', 'NEW_52W_HIGH'] }), horizonBars: 13, expectedCalendar: ctx.fr.calendar, benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', bars }, listings: [K.listingOf(p)] }).events;
    assert.deepEqual(out.map(e => [e.rule, e.signalDate, e.state, e.gross, e.bench, e.expectedExitDate]), direct.map(e => [e.ruleId, e.signalDate, e.state, e.completed ? e.grossReturn : null, e.completed ? e.benchmarkReturn : null, e.expectedExitDate]));
  }
});

test('control sums exclude every detection and count only eligible completed observations', () => {
  const ctx = synthetic(), rules = ['TREND_UP', 'NEW_52W_HIGH'].map(id => K.Signal.RULE_BY_ID[id]), flags = SS.detectionFlags(ctx.panel, rules), cs = SS.controlSums(ctx, flags, 13, ['TREND_UP', 'NEW_52W_HIGH']);
  let n = 0; ctx.panel.forEach(p => { for (let k = 53; k < p.closes.length; k++) if (K.eligibleAt(p, k, K.SIGNAL_FEATURE_LOOKBACK) && K.forwardGross(p, k, 13) !== null) n++; });
  assert.equal(cs.all.cnt.reduce((a, b) => a + b, 0), n);
  for (const p of ctx.panel) for (const k of K.Signal.detectEvents(Array.from(p.closes), rules[0])) assert.equal(flags[ctx.panel.indexOf(p)].TREND_UP[k], 1);
});

test('pattern events and controls equal runPatternStudy', () => {
  const ctx = synthetic(), pattern = { id: 'above-40w-line', version: 'pattern-research-1.1.0', terms: [{ feature: 'aboveSma40w', operator: 'eq', value: true }] };
  const hits = PS.computeHits(ctx.panel, [pattern]), mine = PS.patternEvents(ctx, hits, 0, 13, 13);
  const r = S.runPatternStudy({ ...K.engineInput(ctx), horizonBars: 13, expectedCalendar: ctx.fr.calendar, benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', bars: ctx.fr.calendar.map(d => ({ date: d, close: ctx.benchmark.byDate.get(d) })) }, listings: ctx.panel.map(K.listingOf), pattern, cooldownBars: 13 });
  assert.equal(mine.events.length, r.events.length);
  const byId = new Map(ctx.panel.map(p => [p.listingId, p.id]));
  assert.deepEqual(mine.events.map(e => [e.securityId, e.signalDate, e.state, e.gross]), r.events.map(e => [byId.get(e.listingId), e.signalDate, e.state, e.completed ? e.grossReturn : null]));
  assert.equal([...mine.controls.cnt].reduce((a, b) => a + b, 0), r.controls.filter(c => c.completed).length);
});

test('funded schedule respects slots, holding period and the outcome-free tie-break', () => {
  const ctx = synthetic(), rules = [K.Signal.RULE_BY_ID.TREND_UP], flags = SS.detectionFlags(ctx.panel, rules);
  ctx.studyCalendar = ctx.fr.calendar.slice(60, 380);
  const F = { maxPositions: 2, holdingWeeks: 13, initialCapital: 100000 };
  const sch = SS.fundedSchedule(ctx, flags, 'TREND_UP', F);
  assert.ok(sch.universe.every(p => p.gap[p.closes.length] === 0));
  assert.ok(sch.episodes.every(e => e.exitExec - e.entryExec === 13));
  for (const t of sch.targets) assert.ok(Object.keys(t.weights).length <= 2);
  const input = SS.fundedInput({ ...ctx, manifestHash: '0'.repeat(64), benchmark: { ...ctx.benchmark, provenance: { sourceBytesHash: '0'.repeat(64) } } }, sch, { feeBps: 10, slippageBps: 5 }, F);
  input.initialCapital = 1; const r = Portfolio.runPortfolio(input);
  assert.equal(r.equity.length, input.sessions.length); assert.equal(r.equity.at(-1).positions.length, 0);
});

test('full exit of a large-unit position leaves no float dust (regression, fixed by #1117; V10 ran with numeraire 1 before the fix)', () => {
  const d = weeks(4), closeAt = x => x + 'T23:59:59.999Z', h = '0'.repeat(64);
  const mk = cap => ({ sessions: d.map(x => ({ date: x, closeAt: closeAt(x) })), initialCapital: cap, currency: 'USD', returnBasis: 'PRICE_RETURN',
    provenance: { mode: 'HISTORICAL_PRICE_SIMULATION', datasetHash: h, priceSeriesType: 'SPLIT_ADJUSTED', populationBasis: 'CONDITIONAL_FIXED_CURRENT_COHORT', clockBasis: 'MODELED_WEEK_END_DATE' },
    costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 10, slippageBps: 5 }, maxMembershipAgeDays: 45, maxFactorAgeDays: 45, factorSnapshots: [],
    listings: [{ listingId: 'X', issuerId: 'X', mic: 'XNAS', instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', firstTradeDate: d[0], lastTradeDate: null, events: [], bars: [d[1], d[2]].map((x, i) => ({ date: x, close: [0.21, 0.33][i], availableAt: closeAt(x) })) }],
    memberships: [{ effectiveAt: d[0] + 'T00:00:00Z', availableAt: d[0] + 'T00:00:00Z', sourceHash: h, members: ['X'] }],
    targets: [{ decisionDate: d[0], executionDate: d[1], availableAt: closeAt(d[0]), membershipHash: h, weights: { X: 0.1 } }, { decisionDate: d[1], executionDate: d[2], availableAt: closeAt(d[1]), membershipHash: h, weights: {} }],
    benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', sourceHash: h, costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: d.map(x => ({ date: x, level: 100 })) } });
  // 1e6 capital: 476,190 units bought at 0.21, sold to weight 0 at 0.33. Before #1117 a |dust| > 1e-12 stayed held and the
  // next valuation threw EXACT_PRICE_UNAVAILABLE; now the full exit sells exactly the held units and scales like numeraire 1.
  const big = Portfolio.runPortfolio(mk(1e6)), small = Portfolio.runPortfolio(mk(1));
  assert.equal(big.equity.at(-1).positions.length, 0);
  assert.equal(small.equity.at(-1).positions.length, 0);
  assert.ok(Math.abs(big.equity.at(-1).value / 1e6 - small.equity.at(-1).value) < 1e-9);
});

test('survivorship sensitivity is NOT_EVALUABLE without lifecycle and uses terminal cash when present', () => {
  const bm = { ret: () => 0.01 };
  const none = K.survivorshipSensitivity([{ securityId: 'A', value: 0.1 }], [], new Map([['A', null]]), { feeBps: 0, slippageBps: 0 }, bm, 'RAW_NET');
  assert.equal(none.state, 'NOT_EVALUABLE_WITHOUT_LISTING_LIFECYCLE_EVIDENCE');
  const lc = new Map([['A', null], ['B', { lastTradeDate: '2010-06-04', terminal: { kind: 'CASH_MERGER', cashPerShare: 12 } }], ['C', { lastTradeDate: '2011-01-07', terminal: { kind: 'UNKNOWN', cashPerShare: null } }]]);
  const cens = [{ securityId: 'B', entryDate: '2010-03-05', entryClose: 10, expectedExitDate: '2010-07-02', lastClose: 11 }, { securityId: 'C', entryDate: '2010-12-03', entryClose: 5, expectedExitDate: '2011-03-04', lastClose: 4 }];
  const r = K.survivorshipSensitivity([{ securityId: 'A', value: 0.1 }, { securityId: 'B', value: 0.0 }], cens, lc, { feeBps: 0, slippageBps: 0 }, bm, 'RAW_NET');
  assert.equal(r.state, 'EVALUATED'); assert.equal(r.censoredBeyondSeriesEnd.terminalConsideration, 1); assert.equal(r.censoredBeyondSeriesEnd.unresolved, 1);
  assert.ok(Math.abs(r.withTerminalConsideration.mean - (0.1 + 0 + 0.2) / 3) < 1e-12);
  assert.ok(Math.abs(r.boundMinus100.mean - (0.1 + 0 + 0.2 - 1) / 4) < 1e-12);
  assert.ok(Math.abs(r.boundLastClose.mean - (0.1 + 0 + 0.2 - 0.2) / 4) < 1e-12);
  assert.equal(r.withoutEndedListings.n, 1);
  // BASE_RATE_EXCESS: terminal and bound rows are expressed net of the same-week control mean (review finding 3).
  const cb = cens.map(c => ({ ...c, controlNet: 0.05 }));
  const b = K.survivorshipSensitivity([{ securityId: 'A', value: 0.1 }, { securityId: 'B', value: 0.0 }], cb, lc, { feeBps: 0, slippageBps: 0 }, bm, 'BASE_RATE_EXCESS');
  assert.ok(Math.abs(b.withTerminalConsideration.mean - (0.1 + 0 + 0.15) / 3) < 1e-12);
  assert.ok(Math.abs(b.boundMinus100.mean - (0.1 + 0 + 0.15 - 1.05) / 4) < 1e-12);
  const nb = K.survivorshipSensitivity([{ securityId: 'A', value: 0.1 }], cens, lc, { feeBps: 0, slippageBps: 0 }, bm, 'BASE_RATE_EXCESS');
  assert.equal(nb.censoredBeyondSeriesEnd.terminalConsideration, 0); assert.equal(nb.withTerminalConsideration.n, 1); // no control -> no value
  // Unsourced frozen tail: censored at the last observed close, terminal UNKNOWN -> bounds only.
  const lu = new Map([['A', null], ['D', { lastTradeDate: null, lastObservedDate: '2012-01-06', terminal: { kind: 'UNKNOWN' } }]]);
  const u = K.survivorshipSensitivity([{ securityId: 'A', value: 0.1 }], [{ securityId: 'D', entryDate: '2011-11-04', entryClose: 10, expectedExitDate: '2012-02-03', lastClose: 8 }], lu, { feeBps: 0, slippageBps: 0 }, bm, 'RAW_NET');
  assert.equal(u.endedListings, 1); assert.equal(u.delistedListingsSourced, 0); assert.equal(u.censoredBeyondSeriesEnd.unresolved, 1);
  assert.ok(Math.abs(u.boundLastClose.mean - (0.1 - 0.2) / 2) < 1e-12);
});

test('CLI parses --loader-options and tags configurations; outputs must stay outside the repository', () => {
  const a = K.parseArgs(['run', '--out', '/x', '--loader-options', '{"identityEvidence":true,"corporateActionEvidence":true,"listingLifecycleEvidence":true}']);
  assert.equal(K.loaderTag(a.loaderOptions), 'ca-id-lifecycle'); assert.equal(K.loaderTag(K.PRIMARY_LOADER_OPTIONS), 'ca-id');
  assert.throws(() => K.privateDir(path.join(K.ROOT, 'tmp-v10-test')), /OUTSIDE_REPOSITORY/);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'v10-studies-')); assert.equal(K.privateDir(d), fs.realpathSync(d));
  assert.throws(() => K.parseArgs(['run', '--bogus']), /UNKNOWN_ARGUMENT/);
});

test('Holm family bookkeeping and the >100k inference subsample rule', () => {
  const cells = [{ pValue: 0.001 }, { pValue: 0.04 }, { pValue: null }, { pValue: 0.2 }];
  const f = K.holmFamily(cells); assert.equal(f.familySize, 4); assert.equal(f.testable, 3); assert.equal(cells[0].holmReject, true); assert.equal(cells[2].holmReject, false);
  assert.ok(Math.abs(cells[1].holmAdjustedP - 0.08) < 1e-15);
  const cal = weeks(60), rows = cal.map((d, i) => ({ id: 'x' + i, date: d, value: (i % 7) / 100 - 0.03 }));
  const r = K.blockInference(cal, rows, 13); assert.equal(r.state, 'ESTIMATED_NOT_CERTIFIED'); assert.ok(r.ci[0] <= r.estimate && r.estimate <= r.ci[1]);
});
