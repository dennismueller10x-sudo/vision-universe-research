import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { portfolioMetrics, signalMetrics, regimeMetrics, methodOverlap, rankEvidence } from '../research/tournament/metrics.mjs';
const protocol = JSON.parse(fs.readFileSync(new URL('../research/tournament/protocol.json', import.meta.url), 'utf8'));
// Test-only access to the existing internal summary; production exports stay unchanged.
const metricsSource = fs.readFileSync(new URL('../research/tournament/metrics.mjs', import.meta.url), 'utf8');
const { testSummary } = await import(`data:text/javascript;base64,${Buffer.from(`${metricsSource}\nexport { summary as testSummary };`).toString('base64')}`);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
function signal(id, date, value, regime = { trend: 'BULL', vol: 'LOW_VOL', era: 'EARLY' }) {
  return { id, ticker: id.toUpperCase(), date, entryDate: date, regime, forward: Object.fromEntries([21, 63, 126].map((h) => [h, { return: value + 0.02, excess: value, mfe: 0.2, mae: -0.1, censored: false }])) };
}
function adequateSignals(sign = 1) {
  return Array.from({ length: 24 }, (_, m) => Array.from({ length: 3 }, (_, i) => signal(`s${i}`, `${2020 + Math.floor(m / 12)}-${String(m % 12 + 1).padStart(2, '0')}-15`, sign * (0.01 + m / 1000), { trend: 'BULL', vol: 'LOW_VOL', era: m < 12 ? 'EARLY' : 'LATE' }))).flat();
}
const benchmark = { cagr: 0.1, sharpe: 0.7, maxDrawdown: -0.3 };
function evidenceRow() {
  const signals = adequateSignals();
  return { executable: true, fidelityCategory: 'SYSTEMATIC', portfolioMetrics: { cagr: 0.15, sharpe: 1, maxDrawdown: -0.2 }, signalMetrics: signalMetrics(signals), regimeMetrics: regimeMetrics(signals), dataQuality: { pitListings: true, canonicalPrices: true, terminalScenarioUncertainty: true, missingRequiredPitFundamentals: false }, distinctivenessProductScore: 80, sensitivities: { terminalPass: true, costPass: true }, adversarialReviewPass: true };
}

test('linear summary extrema exactly match the original spread summary, including signed zero and empty input', () => {
  const originalQuantile = (xs, q) => {
    if (!xs.length) return null;
    const sorted = xs.slice().sort((a, b) => a - b), p = q * (sorted.length - 1), lo = Math.floor(p), hi = Math.ceil(p);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
  };
  const originalSummary = xs => ({ n: xs.length, mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null,
    median: originalQuantile(xs, 0.5), hitRate: xs.length ? xs.filter(x => x > 0).length / xs.length : null,
    leftTail: originalQuantile(xs, 0.05), rightTail: originalQuantile(xs, 0.95),
    min: xs.length ? Math.min(...xs) : null, max: xs.length ? Math.max(...xs) : null });
  for (const xs of [[], [-0], [0], [-0, 0], [0, -0], [3, -4, 2, 9, -4], [1e-200, -1e200, 1e200], [NaN, 1], [Infinity, -Infinity]]) {
    assert.deepEqual(testSummary(xs), originalSummary(xs), `exact original summary for ${xs}`);
  }
  assert.ok(Object.is(testSummary([-0, 0]).min, -0));
  assert.ok(Object.is(testSummary([-0, 0]).max, 0));
  assert.ok(Object.is(testSummary([-0]).max, -0));
  assert.equal(testSummary([]).min, null);
  assert.equal(testSummary([]).max, null);
});

test('300000 setup signals exceed spread argument limits while all horizon summaries retain analytic values', () => {
  const pattern = [
    { return: -0.125, excess: -0.125, mfe: 0.25, mae: -0.5, censored: false },
    { return: 0, excess: 0.125, mfe: 0.5, mae: -0.25, censored: false },
    { return: 0.25, excess: 0.375, mfe: 0.75, mae: 0, censored: false },
  ];
  const seeds = Array.from({ length: 300000 }, (_, i) => ({ date: `2024-${String(1 + Math.floor(i / 25000)).padStart(2, '0')}-15`,
    forward: { 21: pattern[i % 3], 63: pattern[i % 3], 126: pattern[i % 3] } }));
  const output = signalMetrics(seeds);
  assert.equal(output.status, 'READY');
  assert.equal(output.totalSignals, 300000);
  for (const horizon of [21, 63, 126]) {
    const h = output.horizons[horizon];
    assert.equal(h.n, 300000); assert.equal(h.nExcess, 300000); assert.equal(h.censored, 0); assert.equal(h.missing, 0);
    assert.equal(h.clusters, 12);
    assert.equal(h.meanReturn, 1 / 24); assert.equal(h.medianReturn, 0); assert.equal(h.hitRate, 1 / 3);
    assert.equal(h.meanExcess, 0.125); assert.equal(h.medianExcess, 0.125); assert.equal(h.excessHitRate, 2 / 3);
    assert.equal(h.returns.min, -0.125); assert.equal(h.returns.max, 0.25); assert.equal(h.leftTail, -0.125); assert.equal(h.rightTail, 0.25);
    assert.equal(h.excess.min, -0.125); assert.equal(h.excess.max, 0.375); assert.equal(h.excessLeftTail, -0.125); assert.equal(h.excessRightTail, 0.375);
    assert.equal(h.meanMfe, 0.5); assert.equal(h.mfe.min, 0.25); assert.equal(h.mfe.max, 0.75);
    assert.equal(h.meanMae, -0.25); assert.equal(h.mae.min, -0.5); assert.equal(h.mae.max, 0);
  }
});

test('holding maximum uses the same bounded-argument scan above the call limit and preserves signed zero', () => {
  const curve = Array.from({ length: 300000 }, (_, i) => ({ date: new Date(Date.UTC(2000, 0, i + 1)).toISOString().slice(0, 10), equity: 100, n: i % 11 }));
  const out = portfolioMetrics(curve, { initialCapital: 100 });
  assert.equal(out.status, 'READY'); assert.equal(out.maxHoldings, 10); assert.equal(out.observations, 300000);
  assert.ok(Object.is(portfolioMetrics([{ date: '2024-01-01', equity: 100, n: -0 }], { initialCapital: 100 }).maxHoldings, -0));
  assert.ok(Object.is(portfolioMetrics([{ date: '2024-01-01', equity: 100, n: -0 }, { date: '2024-01-02', equity: 100, n: 0 }], { initialCapital: 100 }).maxHoldings, 0));
  assert.equal(portfolioMetrics([{ date: '2024-01-01', equity: 100 }], { initialCapital: 100 }).maxHoldings, null);
});

test('calendar CAGR, total return and high-water drawdown include initial capital', () => {
  const curve = [{ date: '2019-01-01', equity: 100, exposure: 0, n: 0 }, { date: '2020-01-01', equity: 80, exposure: 0.2, n: 1 }, { date: '2021-01-01', equity: 120, exposure: 0.6, n: 2 }, { date: '2023-01-01', equity: 200, exposure: 1, n: 3 }];
  const out = portfolioMetrics(curve, { initialCapital: 100, turnover: 2, trades: [] });
  assert.equal(out.totalReturn, 1);
  close(out.cagr, 2 ** 0.25 - 1);
  close(out.maxDrawdown, -0.2);
  close(out.averageExposure, 0.45);
  assert.deepEqual(out.exposureBuckets, { CASH_0: 1, LOW_0_TO_25: 1, MID_25_TO_75: 1, HIGH_75_TO_100: 1, OVER_100: 0 });
  assert.equal(out.averageHoldings, 1.5);
  assert.equal(out.maxHoldings, 3);
  close(out.turnoverAnnualized, 0.5);
});

test('canonical sample daily volatility and zero-risk-free Sharpe are independently accounted', () => {
  const curve = [{ date: '2024-01-01', equity: 100 }, { date: '2024-01-02', equity: 110 }, { date: '2024-01-03', equity: 99 }];
  const out = portfolioMetrics(curve, { initialCapital: 100 });
  close(out.annualizedVolatility, Math.sqrt(0.02) * Math.sqrt(252));
  close(out.sharpe, 0);
  assert.equal(out.returnObservations, 2);
  assert.equal(out.sharpeRiskFree, 0);
  assert.equal(out.averageExposure, null);
  assert.equal(out.turnover, null);
});

test('first-date costs affect drawdown and returns; net pnl is never charged twice', () => {
  const out = portfolioMetrics([{ date: '2024-01-02', equity: 90 }, { date: '2024-01-03', equity: 95 }], { initialCapital: 100, executionCosts: 5, trades: [{ pnl: 10, cost: 100, returnPct: 0.1, transactionCosts: 2 }, { pnl: -5, cost: 100, returnPct: -0.05, transactionCosts: 3 }] });
  close(out.totalReturn, -0.05);
  close(out.maxDrawdown, -0.1);
  assert.equal(out.executionCosts, 5);
  assert.equal(out.trades.pnl, 5);
  assert.equal(out.trades.entryCapitalBasis, 200);
  assert.equal(out.trades.winRate, 0.5);
  assert.equal(out.trades.averageWin, 10);
  assert.equal(out.trades.averageLoss, -5);
  assert.equal(out.trades.profitFactor, 2);
});

test('zero equity is terminal; invalid accounting histories and absent capital fail', () => {
  const terminal = portfolioMetrics([{ date: '2024-01-01', equity: 100 }, { date: '2024-01-02', equity: 0 }], { initialCapital: 100 });
  assert.equal(terminal.maxDrawdown, -1);
  assert.equal(terminal.totalReturn, -1);
  assert.equal(terminal.cagr, -1);
  assert.equal(portfolioMetrics([{ date: '2024-01-01', equity: 100 }]).status, 'UNAVAILABLE');
  assert.equal(portfolioMetrics([{ date: '2024-01-01', equity: 0 }, { date: '2024-01-02', equity: 10 }], { initialCapital: 100 }).status, 'UNAVAILABLE');
  assert.equal(portfolioMetrics([{ date: '2024-01-02', equity: 100 }, { date: '2024-01-01', equity: 100 }], { initialCapital: 100 }).status, 'UNAVAILABLE');
});

test('turnover uses complete stated inputs; absent observations are not imputed', () => {
  const curve = [{ date: '2024-01-01', equity: 100, dailyTurnover: 0.2 }, { date: '2024-01-02', equity: 100, dailyTurnover: 0.3 }];
  close(portfolioMetrics(curve, { initialCapital: 100 }).turnover, 0.5);
  close(portfolioMetrics(curve, { initialCapital: 100, turnover: [{ dailyTurnover: 0.1 }, { dailyTurnover: 0.4 }] }).turnover, 0.5);
  const missing = portfolioMetrics(curve, { initialCapital: 100, turnover: [0.1, null] });
  assert.equal(missing.turnover, null);
  assert.equal(missing.turnoverCoverage, 'INCOMPLETE');
});

test('signal horizons report raw/excess means, medians, hits, excursions, interpolated tails', () => {
  const out = signalMetrics([-0.1, 0, 0.1, 0.2].map((r, i) => signal(`${i}`, `2024-0${i + 1}-15`, r))).horizons[63];
  close(out.meanExcess, 0.05);
  close(out.medianExcess, 0.05);
  close(out.meanReturn, 0.07);
  assert.equal(out.excessHitRate, 0.5);
  close(out.meanMfe, 0.2);
  close(out.meanMae, -0.1);
  close(out.excessLeftTail, -0.085);
  close(out.excessRightTail, 0.185);
});

test('right-censored horizons are excluded, never zeros or shorter-horizon substitutions', () => {
  const a = signal('a', '2024-01-15', 0.1), b = signal('b', '2024-02-15', -0.5);
  b.forward[126].censored = true;
  delete a.forward[21].excess;
  const out = signalMetrics([a, b]);
  assert.equal(out.horizons[63].n, 2);
  assert.equal(out.horizons[126].n, 1);
  assert.equal(out.horizons[126].censored, 1);
  close(out.horizons[126].meanExcess, 0.1);
  assert.equal(out.horizons[21].nExcess, 1);
  close(out.horizons[21].meanExcess, -0.5);
});

test('month-cluster t equal-weights months, not replicated signals, and is descriptive', () => {
  const input = [signal('a', '2024-01-02', 0.1), signal('b', '2024-01-03', 0.1), signal('c', '2024-02-02', 0.3)];
  const out = signalMetrics(input).horizons[63];
  close(out.meanExcess, 1 / 6);
  close(out.monthCluster.excess.mean, 0.2);
  close(out.clusterT, 2);
  assert.equal(out.clusters, 2);
  assert.match(out.monthCluster.excess.interpretation, /DESCRIPTIVE_ONLY/);
  const degenerate = signalMetrics([signal('a', '2024-01-02', 0.1), signal('b', '2024-02-02', 0.1)]).horizons[63];
  assert.equal(degenerate.clusterT, null);
  assert.equal(degenerate.monthCluster.excess.zeroVariance, true);
});

test('regimes partition supplied lagged-benchmark labels and preserve early/late evidence', () => {
  const out = regimeMetrics(adequateSignals());
  assert.equal(out.segments.length, 8);
  assert.equal(out.earlyLate.EARLY.nExcess, 36);
  assert.equal(out.earlyLate.LATE.nExcess, 36);
  assert.equal(out.earlyLate.EARLY.clusters, 12);
  assert.equal(out.unknownRegimeSignals, 0);
  assert.equal(out.segments.find((s) => s.label === 'BEAR').totalSignals, 0);
});

test('overlap deduplicates identity+date/month and correlates only identical dated intervals', () => {
  const ca = [{ date: '2024-01-01', equity: 100 }, { date: '2024-01-02', equity: 110 }, { date: '2024-01-03', equity: 99 }];
  const cb = [{ date: '2024-01-01', equity: 200 }, { date: '2024-01-02', equity: 220 }, { date: '2024-01-03', equity: 198 }];
  const out = methodOverlap([{ id: 'A', curve: ca, signals: [signal('x', '2024-01-02', 0.1), signal('x', '2024-01-02', 0.1), signal('y', '2024-02-02', 0.1)] }, { id: 'B', curve: cb, signals: [signal('x', '2024-01-03', 0.1), signal('y', '2024-02-02', 0.1)] }])[0];
  close(out.returnCorrelation, 1);
  assert.equal(out.commonReturnIntervals, 2);
  assert.equal(out.jaccardSameIdMonth, 1);
  close(out.jaccardSameIdDate, 1 / 3);
  const different = methodOverlap([{ id: 'A', curve: ca, signals: [] }, { id: 'B', curve: [cb[0], cb[2]], signals: [] }])[0];
  assert.equal(different.commonReturnIntervals, 0);
  assert.equal(different.returnCorrelation, null);
  assert.equal(different.jaccardSameIdDate, null);
});

test('all frozen rubric weights contribute; complete positive evidence qualifies A at MEDIUM max', () => {
  const out = rankEvidence(evidenceRow(), benchmark, protocol);
  const expected = 75 * 0.15 + 100 * 0.2 + 100 * 0.2 + 100 * 0.15 + 100 * 0.1 + 65 * 0.1 + 80 * 0.1;
  close(out.score, expected);
  assert.equal(out.tier, 'A');
  assert.equal(out.confidence, 'MEDIUM');
  assert.equal(out.signalBasis, 'SPY_MATCHED_EXCESS');
  assert.ok(Object.values(out.gates).every(Boolean));
  assert.equal(Object.keys(out.weightedComponents).length, 7);
});

test('missing rubric component makes total unavailable; no missing-data weight redistribution', () => {
  const row = evidenceRow();
  delete row.distinctivenessProductScore;
  const out = rankEvidence(row, benchmark, protocol);
  assert.equal(out.score, null);
  assert.equal(out.weightedComponents.distinctivenessProduct, null);
  assert.deepEqual(out.missingComponents, ['distinctivenessProduct']);
  assert.equal(out.tier, 'C');
  assert.equal(out.weights.signalEvidence, 0.2);
  const absent = rankEvidence(evidenceRow(), {}, protocol);
  assert.equal(absent.score, null);
  assert.ok(absent.missingComponents.includes('portfolioEvidence'));
});

test('legendary formalization cannot become Tier A or B from attractive simulated outcomes', () => {
  const row = evidenceRow();
  row.fidelityCategory = 'LEGENDARY';
  const out = rankEvidence(row, benchmark, protocol);
  assert.equal(out.components.fidelityReproducibility, 45);
  assert.equal(out.confidence, 'LOW');
  assert.equal(out.tier, 'C');
});

test('Tier A requires independent review, sensitivities and early/late sufficiency', () => {
  for (const field of ['adversarialReviewPass', 'terminalPass', 'costPass']) {
    const row = evidenceRow();
    if (field === 'adversarialReviewPass') row[field] = false; else row.sensitivities[field] = false;
    assert.equal(rankEvidence(row, benchmark, protocol).tier, 'B');
  }
  const row = evidenceRow();
  row.regimeMetrics.earlyLate.LATE = { ...row.regimeMetrics.earlyLate.LATE, meanExcess: -0.1 };
  assert.equal(rankEvidence(row, benchmark, protocol).tier, 'B');
});

test('negative evidence, data blockade and mechanically unadmitted methods never receive A/B', () => {
  const row = evidenceRow(), negative = adequateSignals(-1);
  row.signalMetrics = signalMetrics(negative); row.regimeMetrics = regimeMetrics(negative);
  row.portfolioMetrics = { cagr: 0.01, sharpe: 0.1, maxDrawdown: -0.5 };
  const out = rankEvidence(row, benchmark, protocol);
  assert.equal(out.components.signalEvidence, 15);
  assert.equal(out.components.portfolioEvidence, 20);
  assert.equal(out.components.riskProfile, 20);
  assert.equal(out.components.robustness, 0);
  assert.equal(out.tier, 'C');
  const missing = evidenceRow(); missing.dataQuality.missingRequiredPitFundamentals = true;
  assert.equal(rankEvidence(missing, benchmark, protocol).confidence, 'LOW');
  missing.executable = false;
  assert.equal(rankEvidence(missing, benchmark, protocol).tier, 'D');
});

test('risk specialist exception requires actual shallow risk evidence and adequate comparisons', () => {
  const row = evidenceRow(); row.portfolioMetrics.cagr = 0.01; row.riskSpecialist = true; row.comparisonsAdequate = true;
  assert.equal(rankEvidence(row, benchmark, protocol).tier, 'B');
  row.comparisonsAdequate = false;
  assert.equal(rankEvidence(row, benchmark, protocol).tier, 'C');
});

test('portfolio/risk fixed similarities and missing protocol weights are explicit', () => {
  const row = evidenceRow(); row.portfolioMetrics = { cagr: 0.105, sharpe: 0.7, maxDrawdown: -0.28 };
  const out = rankEvidence(row, benchmark, protocol);
  assert.equal(out.components.portfolioEvidence, 50);
  assert.equal(out.components.riskProfile, 50);
  assert.equal(out.thresholds.riskSimilarDrawdown, 0.05);
  const broken = structuredClone(protocol); delete broken.scoreWeights.riskProfile;
  assert.throws(() => rankEvidence(row, benchmark, broken), /Frozen complete protocol/);
});

test('canonical Bartlett HAC uses five monthly lags and documented finite-sample correction', () => {
  const input = Array.from({ length: 6 }, (_, i) => signal(`${i}`, `2024-0${i + 1}-15`, (i + 1) / 100));
  const h = signalMetrics(input).horizons[63];
  // Independently tabulated residual products at lags0..5 for centered .01..06.
  const lagZero = 0.00175;
  const covariances = [0.000875, 0.0001, -0.000475, -0.00075, -0.000625];
  const meat = lagZero + 2 * covariances.reduce((a, c, i) => a + (1 - (i + 1) / 6) * c, 0);
  const expectedSE = Math.sqrt(meat * (6 / 5) / 36);
  close(h.hacStandardError, expectedSE);
  close(h.hacT, 0.035 / expectedSE);
  assert.equal(h.monthCluster.excess.hac.lags, 5);
  assert.equal(h.monthCluster.excess.hac.kernel, 'BARTLETT');
  assert.ok(h.hacStandardError > h.monthCluster.excess.sampleStd / Math.sqrt(6));
});

test('HAC calendar gaps do not fabricate missing monthly means or pretend adjacent observations', () => {
  const h = signalMetrics([signal('a', '2024-01-15', 0.1), signal('b', '2024-07-15', 0.3)]).horizons[63];
  assert.equal(h.clusters, 2);
  close(h.hacT, h.descriptiveT);
  assert.deepEqual(h.monthCluster.excess.values.map((v) => v.month), ['2024-01', '2024-07']);
});

test('descriptive t alone cannot pass strengthened HAC signal gate or assert proven alpha', () => {
  const row = evidenceRow();
  row.signalMetrics.horizons[63].hacT = 1.5;
  row.signalMetrics.horizons[63].descriptiveT = 10;
  row.signalMetrics.horizons[63].clusterT = 10;
  const out = rankEvidence(row, benchmark, protocol);
  assert.equal(out.components.signalEvidence, 65);
  assert.equal(out.gates.signalHacPass, false);
  assert.equal(out.tier, 'B');
  assert.equal(out.signalInference, 'DESCRIPTIVE_EDGE_HYPOTHESIS_NOT_PROVEN_ALPHA');
  assert.match(out.multipleComparisonUncertainty, /not a multiplicity correction/);
});

test('fixed one/five percentage-point boundaries survive floating-point representation', () => {
  const row = evidenceRow(); row.portfolioMetrics = { cagr: 0.16, sharpe: 1, maxDrawdown: -0.3 };
  const boundary = { cagr: 0.15, sharpe: 0.7, maxDrawdown: -0.35 };
  const out = rankEvidence(row, boundary, protocol);
  assert.equal(out.portfolioClassification, 'SIMILAR');
  assert.equal(out.riskClassification, 'SHALLOWER');
  const deeper = evidenceRow(); deeper.portfolioMetrics.maxDrawdown = -0.35;
  assert.equal(rankEvidence(deeper, benchmark, protocol).riskClassification, 'DEEPER');
});
