import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as F from './helpers/weekly-portfolio-fixtures.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const M = require('../engines/backtest-metrics.cjs');
const P = require('../engines/research-portfolio.cjs');
const near = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} != ${b}`);

function handLedger() {
  return {
    initialCapital: 100,
    rows: [
      { date: '2020-01-03', value: 100, cash: 100 }, { date: '2020-01-10', value: 110, cash: 0 }, { date: '2020-01-17', value: 99, cash: 49 },
      { date: '2020-01-24', value: 121, cash: 0 }, { date: '2021-01-01', value: 133.1, cash: 0 },
    ],
    trades: [
      { date: '2020-01-03', listingId: 'A', side: 'BUY', notional: 100, fee: 0.1, slippage: 0, units: 10 },
      { date: '2020-01-17', listingId: 'A', side: 'SELL', notional: 99, fee: 0.1, slippage: 0, units: 10 },
      { date: '2020-01-17', listingId: 'B', side: 'BUY', notional: 50, fee: 0, slippage: 0.05, units: 5 },
      { date: '2020-01-24', listingId: 'B', side: 'SELL', notional: 60, fee: 0, slippage: 0.05, units: 5 },
      { date: '2020-01-24', listingId: 'C', side: 'BUY', notional: 121, fee: 0, slippage: 0, units: 1 },
    ],
  };
}

test('hand-computed path: total return, CAGR, calendar years, drawdown dates, volatility and labelled Sharpe', () => {
  const m = M.computeMetrics(handLedger());
  near(m.returns.totalReturn, 0.331);
  near(m.returns.cagr, Math.pow(1.331, 365.25 / 364) - 1);
  assert.deepEqual(m.returns.calendarYears.map(y => [y.year, y.from, y.to, y.partial]), [[2020, '2020-01-03', '2020-01-24', true], [2021, '2020-01-24', '2021-01-01', true]]);
  near(m.returns.calendarYears[0].return, 0.21); near(m.returns.calendarYears[1].return, 0.1);
  const r = [0.1, -0.1, 121 / 99 - 1, 0.1], mu = r.reduce((a, b) => a + b) / 4, sd = Math.sqrt(r.reduce((a, x) => a + (x - mu) ** 2, 0) / 3);
  near(m.risk.annualizedVolatility, sd * Math.sqrt(52)); near(m.risk.sharpe, mu / sd * Math.sqrt(52));
  assert.equal(m.assumptions.riskFree.label, 'ASSUMPTION_ZERO_DEFAULT'); assert.equal(m.risk.sharpeRiskFreeLabel, 'ASSUMPTION_ZERO_DEFAULT');
  near(m.risk.maxDrawdown, -0.1);
  assert.deepEqual([m.risk.peakDate, m.risk.troughDate, m.risk.recoveryDate, m.risk.peakToTroughPeriods, m.risk.durationPeriods, m.risk.durationDays, m.risk.recovered], ['2020-01-10', '2020-01-17', '2020-01-24', 1, 2, 14, true]);
  // explicit risk-free assumption changes only Sharpe
  const rf = M.computeMetrics(handLedger(), { riskFree: { annualRate: 0.02, label: 'ASSUMED_FLAT_2PCT' } });
  near(rf.risk.sharpe, (mu - (Math.pow(1.02, 1 / 52) - 1)) / sd * Math.sqrt(52)); near(rf.returns.totalReturn, m.returns.totalReturn);
  assert.throws(() => M.computeMetrics(handLedger(), { riskFree: { annualRate: 0.02 } }), e => e.code === 'RISK_FREE_LABEL_REQUIRED');
  assert.equal(m.certification, 'NOT_CERTIFIED'); assert.equal(m.productionApproved, false);
  assert.deepEqual(M.computeMetrics(handLedger()), m);
});

test('round trips from trade units: hit rate, holding periods, open position, costs, turnover, cash share', () => {
  const m = M.computeMetrics(handLedger());
  assert.equal(m.trades.reconstruction, 'RECONSTRUCTED_FROM_TRADE_UNITS');
  assert.deepEqual([m.trades.fills, m.trades.roundTrips, m.trades.openAtEnd, m.trades.winners], [5, 2, 1, 1]);
  near(m.trades.hitRate, 0.5); near(m.trades.averageHoldingPeriods, 1.5); near(m.trades.averageHoldingDays, 10.5);
  near(m.trades.totalRoundTripPnl, (99 - 100 - 0.2) + (60 - 50 - 0.1));
  near(m.costs.total, 0.3); near(m.costs.fees, 0.2); near(m.costs.shareOfInitialCapital, 0.003);
  near(m.turnover.oneWayTurnoverSum, 100 / (2 * 100.1) + 149 / (2 * 99.15) + 181 / (2 * 121.05));
  near(m.exposure.averageCashShare, (1 + 0 + 49 / 99 + 0 + 0) / 5);
  const ep = M.tradeEpisodes(handLedger()).list;
  assert.deepEqual(ep.map(e => [e.listingId, e.openDate, e.closeDate, e.closedBy]), [['A', '2020-01-03', '2020-01-17', 'SELL'], ['B', '2020-01-17', '2020-01-24', 'SELL'], ['C', '2020-01-24', null, 'OPEN_AT_END']]);
  const noUnits = handLedger(); delete noUnits.trades[0].units;
  assert.equal(M.computeMetrics(noUnits).trades.reconstruction, 'UNITS_OR_POSITIONS_REQUIRED');
});

test('benchmark comparison on the same dates only; identical series gives beta 1 and zero tracking error', () => {
  const l = handLedger(), same = M.computeMetrics(l, { benchmark: l.rows.map(r => ({ date: r.date, value: r.value })), benchmarkLabel: 'SELF' });
  assert.equal(same.benchmark.state, 'SAME_DATES'); near(same.benchmark.beta, 1); near(same.benchmark.trackingError, 0); near(same.benchmark.excessTotalReturn, 0);
  assert.equal(same.benchmark.informationRatio, null); near(same.benchmark.correlation, 1);
  const flat = M.computeMetrics(l, { benchmark: l.rows.map((r, i) => ({ date: r.date, value: 100 + i })) });
  near(flat.benchmark.totalReturn, 0.04); near(flat.benchmark.excessTotalReturn, 0.331 - 0.04);
  const gap = M.computeMetrics(l, { benchmark: l.rows.slice(1).map(r => ({ date: r.date, value: r.value })) });
  assert.equal(gap.benchmark.state, 'BENCHMARK_DATES_INCOMPLETE'); assert.equal(gap.benchmark.missingDates, 1);
  assert.equal(M.computeMetrics(l).benchmark.state, 'BENCHMARK_NOT_SUPPLIED');
});

test('fromPortfolio reproduces the engine metrics and reconstructs episodes from positions', () => {
  const x = F.weeklyFixture(30, 3); x.targets = x.targets.map((t, i) => ({ ...t, weights: i % 2 ? { A: 0.5, C: 0.4 } : { B: 0.45, C: 0.45 } }));
  const r = P.runPortfolio(x), m = M.computeMetrics(M.fromPortfolio(r));
  near(m.returns.totalReturn, r.metrics.cumulativeReturn); near(m.returns.cagr, r.metrics.cagr); near(m.risk.maxDrawdown, r.metrics.maxDrawdown);
  near(m.costs.fees, r.metrics.fees); near(m.costs.slippage, r.metrics.slippage); near(m.turnover.oneWayTurnoverSum, r.metrics.oneWayTurnoverSum, 1e-10);
  assert.equal(m.trades.reconstruction, 'RECONSTRUCTED_FROM_POSITIONS'); assert.ok(m.trades.roundTrips > 0); assert.equal(m.trades.fills, r.trades.length);
  assert.equal(m.benchmark.state, 'SAME_DATES');
  assert.ok(m.warnings.length === 0, m.warnings.join());
});

function pythonParity(cases) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-metrics-'));
  try {
    const files = cases.map(c => { const f = path.join(dir, c.name + '.json'); fs.writeFileSync(f, JSON.stringify({ ...c, js: M.computeMetrics(c.ledger, c.options) })); return f; });
    const out = path.join(dir, 'report.json');
    execFileSync('python3', ['-I', path.join(ROOT, 'scripts/quant/verify-backtest-metrics.py'), ...files.flatMap(f => ['--input', f]), '--out', out], { encoding: 'utf8' });
    return JSON.parse(fs.readFileSync(out, 'utf8'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('independent Python re-implementation agrees on fixtures (units and positions paths, risk-free, benchmark)', () => {
  const l = handLedger(), golden = F.goldenCases();
  const cases = [
    { name: 'hand', ledger: l, options: {} },
    { name: 'hand-rf-bench', ledger: l, options: { riskFree: { annualRate: 0.03, label: 'ASSUMED' }, benchmark: l.rows.map((r, i) => ({ date: r.date, value: 50 + 3 * i * i })) } },
    ...Object.entries(golden).map(([k, x]) => ({ name: 'portfolio-' + k, ledger: M.fromPortfolio(P.runPortfolio(x)), options: {} })),
  ];
  const stop = F.weeklyFixture(); stop.exitRules = { stop: { semantics: 'WEEKLY_CLOSE_STOP', threshold: 0.1, reference: 'AVERAGE_ENTRY_PRICE' }, reentry: 'NEXT_TARGET' };
  cases.push({ name: 'portfolio-stop', ledger: M.fromPortfolio(P.runPortfolio(stop)), options: {} });
  const rep = pythonParity(cases);
  assert.equal(rep.status, 'PASS', JSON.stringify(rep.cases.filter(c => c.status !== 'PASS')));
  assert.ok(rep.cases.every(c => c.compared >= 20));
});

test('Python parity on a real runPortfolio run from committed weekly series (with and without exit rules)', () => {
  const base = F.realWeeklyInput(require, ROOT), stop = F.realWeeklyInput(require, ROOT);
  stop.exitRules = { stop: { semantics: 'WEEKLY_CLOSE_STOP', threshold: 0.15, reference: 'TRAILING_HIGH_CLOSE' }, maxHoldingSessions: 104, reentry: 'NEXT_TARGET' };
  const rb = P.runPortfolio(base), rs = P.runPortfolio(stop);
  assert.ok(rb.equity.length > 700, 'real window has weekly sessions');
  const mb = M.computeMetrics(M.fromPortfolio(rb));
  near(mb.returns.totalReturn, rb.metrics.cumulativeReturn); near(mb.risk.maxDrawdown, rb.metrics.maxDrawdown); near(mb.turnover.oneWayTurnoverSum, rb.metrics.oneWayTurnoverSum, 1e-10);
  const ms = M.computeMetrics(M.fromPortfolio(rs));
  assert.ok(ms.trades.roundTrips > 0 && ms.trades.fillsByReason.WEEKLY_CLOSE_STOP > 0);
  const rep = pythonParity([{ name: 'real-buy-hold-rebalance', ledger: M.fromPortfolio(rb), options: {} }, { name: 'real-exit-rules', ledger: M.fromPortfolio(rs), options: {} }]);
  assert.equal(rep.status, 'PASS', JSON.stringify(rep.cases.filter(c => c.status !== 'PASS')));
});

test('input validation fails closed', () => {
  assert.throws(() => M.computeMetrics({ rows: [] }), e => e.code === 'ROWS_REQUIRED');
  assert.throws(() => M.computeMetrics({ rows: [{ date: '2020-01-10', value: 1 }, { date: '2020-01-03', value: 1 }] }), e => e.code === 'INVALID_ROW_DATE');
  assert.throws(() => M.computeMetrics({ rows: [{ date: '2020-01-10', value: 1 }], trades: [{ date: '2020-01-11', listingId: 'A', side: 'BUY', notional: 1 }] }), e => e.code === 'TRADE_DATE_NOT_A_ROW');
  assert.throws(() => M.computeMetrics(handLedger(), { foo: 1 }), e => e.code === 'INVALID_OPTIONS');
  const daily = { rows: ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-06'].map((date, i) => ({ date, value: 100 + i })) };
  assert.ok(M.computeMetrics(daily).warnings.some(w => w.startsWith('PERIODICITY_MISMATCH')));
  assert.ok(M.computeMetrics(daily).warnings.includes('INITIAL_CAPITAL_NOT_GIVEN_FIRST_ROW_USED'));
});
