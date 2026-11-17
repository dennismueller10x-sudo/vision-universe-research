import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), A = require('../api/ema-cluster-contract.cjs'), E = require('../engines/technical/ema-cluster.js');
const V = require('../engines/research-validation.cjs'), C = require('../engines/technical/canonical-bars.js'), M = require('../engines/technical/multi-timeframe.js');
const dates = [];
for (let t = Date.UTC(2024, 0, 1); new Date(t).toISOString().slice(0, 10) <= '2026-11-16'; t += 864e5) if (![0, 6].includes(new Date(t).getUTCDay())) dates.push(new Date(t).toISOString().slice(0, 10));
const bars = dates.map((date, i) => { const close = 100 + i * .08 + 8 * Math.sin(i / 13); return { date, close, high: close * 1.01, low: close * .99 }; });
const cluster = () => E.calculate({ bars, asOf: dates.at(-1) });
function study() {
  const stat = { n: 150, mean: -.002, median: -.003, positive: 60, negative: 90, neutral: 0 };
  const c = { eventType: 'COMPRESSION', horizonTradingDays: 5, events: 155, states: { OBSERVED: 150, CENSORED: 5 },
    net: stat, excessSpy: stat, directionAdjustedExcess: stat, p: .01, holmP: .2, cohorts: [], regimes: [],
    walkForward: { state: 'EXECUTED', n: 140, mean: -.002, rows: [{ id: 'PRIVATE_SENTINEL', value: -.1 }] } };
  const r = { schemaVersion: 'ema-cluster-dev-study-1.0.0', plan: { id: 'EMA_CLUSTER_DEV_200_V1', from: '2016-01-04', to: '2026-09-30', limitations: ['EXPLORATORY'] },
    configHash: V.hash(E.configuration()), selected: 200, selection: { counts: { active: 150, delisted: 50, unknownIndustry: 20 }, selectionHash: 'selection',
      selected: [{ listingId: 'PRIVATE_SENTINEL', cik: 'PRIVATE_SENTINEL' }] }, status: 'EXPLORATORY_RESEARCH_LIMITED',
    cells: [c], receipts: [{ privateArchive: 'PRIVATE_SENTINEL' }] };
  return { ...r, resultHash: V.hash(r) };
}
const evidence = () => A.projectEvidence(study(), { availableAt: '2026-11-15T12:00:00Z' });
test('view copies existing engine states, metrics, bands and event order without recalculation or mutation', () => {
  const c = cluster(), before = JSON.stringify(c), view = A.build({ ticker: 'BRK.B', cluster: c, includeHistory: true, eventLimit: 7, rowLimit: 11 });
  assert.equal(view.securityId, 'ref_BRK_B'); assert.equal(view.state, 'AVAILABLE');
  assert.deepEqual(view.current.metrics, c.rows.at(-1).metrics); assert.equal(view.screener.trend, c.rows.at(-1).trend);
  assert.equal(view.chart.rows.length, 11); assert.equal(view.eventHistory.events.length, 7);
  assert.deepEqual(view.eventHistory.events.map(e => e.date), c.events.slice(-7).map(e => e.date));
  view.current.fast.values[0] = -1; view.chart.rows.at(-1).metrics.gap = -1; assert.equal(JSON.stringify(c), before);
  assert.equal(view.trendStrengthMeaning, 'DESCRIPTIVE_INDEX_NOT_PROBABILITY');
  assert.equal(view.metricUnits.gap, 'FRACTION_OF_CLOSE'); assert.equal(view.metricUnits.compressionBars, 'BARS');
});
test('fast and slow pullbacks expose actual touch/resumption events and do not invent active trades', () => {
  const c = cluster(), view = A.build({ ticker: 'AAPL', cluster: c });
  for (const name of ['fast', 'slow']) {
    assert.equal(view.pullbacks[name].lastTouch?.date ?? null, c.events.findLast(e => e.type === 'PULLBACK_' + name.toUpperCase())?.date ?? null);
    assert.equal(view.pullbacks[name].lastResumption?.date ?? null, c.events.findLast(e => e.type.startsWith('RESUME_') && e.cluster === name)?.date ?? null);
    assert.equal(view.pullbacks[name].active, undefined);
    if (view.pullbacks[name].resumptionForLastTouch) assert.equal(view.pullbacks[name].resumptionForLastTouch.pullbackDate, view.pullbacks[name].lastTouch.date);
  }
});
test('research projection preserves negative/positive statistics and strips private identities, paths and OOS rows', () => {
  const e = evidence(); assert.equal(e.state, 'AVAILABLE'); assert.equal(e.cells[0].excessSpy.mean, -.002);
  assert.equal(e.cells[0].states.CENSORED, 5); assert.equal(e.cells[0].holmP, .2); assert.equal(e.productionApproved, false);
  e.extraPrivateField = 'PRIVATE_SENTINEL'; e.cells[0].walkForward.rows = [{ id: 'PRIVATE_SENTINEL' }];
  const view = A.build({ ticker: 'AAPL', cluster: cluster(), evidence: e });
  assert.equal(view.evidence.state, 'AVAILABLE'); assert.ok(!JSON.stringify(view).includes('PRIVATE_SENTINEL'));
  assert.equal(view.evidence.cells, undefined, 'shared evidence is referenced once instead of duplicated per screener stock');
  const detail = A.build({ ticker: 'AAPL', cluster: cluster(), evidence: e, includeEvidence: true });
  assert.equal(detail.evidence.cells.length, 1); assert.ok(!JSON.stringify(detail).includes('PRIVATE_SENTINEL'));
  assert.notEqual(view.configHash, view.researchConfigSha256, 'existing FNV engine hash and SHA research hash have distinct scopes');
});
test('evidence must match configuration, timeframe, price/currency basis and publication availability', () => {
  const e = evidence(), custom = E.calculate({ bars, asOf: dates.at(-1), config: { fast: [2, 3], slow: [5, 8] } });
  assert.equal(A.build({ ticker: 'AAPL', cluster: custom, evidence: e }).evidence.reason, 'CONFIGURATION_MISMATCH');
  const daily = C.createSeries({ instrumentId: 'AAPL', timeframe: '1D', priceSeriesType: 'SPLIT_ADJUSTED' }, { timestamps: dates,
    close: bars.map(b => b.close), open: bars.map(b => b.close), high: bars.map(b => b.high), low: bars.map(b => b.low), volume: dates.map(() => 100) });
  const s = M.completedSeries(daily, '1W').series;
  const weekly = E.calculate({ bars: s.timestamps.map((d, i) => ({ date: d.slice(0, 10), close: s.close[i] })), asOf: dates.at(-1), timeframe: '1W' });
  assert.equal(A.build({ ticker: 'AAPL', cluster: weekly, evidence: e }).evidence.reason, 'TIMEFRAME_MISMATCH');
  assert.equal(A.build({ ticker: 'AAPL', cluster: cluster(), evidence: e, currency: 'EUR' }).evidence.reason, 'PRICE_OR_CURRENCY_BASIS_MISMATCH');
  const earlier = E.calculate({ bars, asOf: '2026-11-10' });
  assert.equal(A.build({ ticker: 'AAPL', cluster: earlier, evidence: e }).evidence.reason, 'EVIDENCE_NOT_YET_AVAILABLE');
});
test('warmup, missing evidence and malformed data remain explicit; full private reports are never passed through', () => {
  const short = E.calculate({ bars: bars.slice(0, 20), asOf: bars[19].date });
  const view = A.build({ ticker: 'AAPL', cluster: short }); assert.equal(view.state, 'WARMUP'); assert.equal(view.current.trend, null);
  assert.equal(A.build({ ticker: 'AAPL', cluster: cluster(), evidence: study() }).evidence.reason, 'PROJECTED_EVIDENCE_REQUIRED');
  assert.equal(A.build({ ticker: 'AAPL', cluster: cluster(), requestedAsOf: '2020-01-01' }).reason, 'ANALYSIS_DATE_MISMATCH');
  const r = study(); r.cells[0].excessSpy.mean = 1; assert.equal(A.projectEvidence(r, { availableAt: '2026-11-16T00:00:00Z' }).reason, 'STUDY_HASH_MISMATCH');
  assert.equal(A.projectEvidence(study()).reason, 'STUDY_AVAILABILITY_REQUIRED');
});
