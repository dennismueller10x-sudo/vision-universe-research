import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('../engines/research-portfolio.cjs');
const H = 'a'.repeat(64), H2 = 'b'.repeat(64), H3 = 'c'.repeat(64);
const closeAt = d => d + 'T21:00:00Z';
function fixture() {
  const dates = ['2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07', '2020-01-08', '2020-01-09'];
  return {
    sessions: dates.map(date => ({ date, closeAt: closeAt(date) })), initialCapital: 1000, currency: 'USD',
    provenance: { mode: 'SYNTHETIC_TEST', datasetHash: H }, costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 10, slippageBps: 5 },
    maxMembershipAgeDays: 45, maxFactorAgeDays: 45,
    listings: ['A', 'B'].map(listingId => ({ listingId, issuerId: 'ISSUER_' + listingId, mic: 'XNAS', instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', firstTradeDate: '2010-01-01', lastTradeDate: null,
      bars: dates.map(date => ({ date, availableAt: closeAt(date), close: listingId === 'A' ? 100 : 50 })), events: [] })),
    memberships: [{ effectiveAt: '2020-01-01T21:00:00Z', availableAt: '2020-01-01T21:00:00Z', sourceHash: H, members: ['A', 'B'] }], factorSnapshots: [],
    targets: [{ decisionDate: dates[0], executionDate: dates[1], availableAt: closeAt(dates[0]), membershipHash: H, weights: { A: 1 } }],
    benchmark: { currency: 'USD', returnBasis: 'TOTAL_RETURN', sourceHash: H, costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: dates.map(date => ({ date, level: 100 })) }
  };
}
function near(a, b, eps = 1e-9) { assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} != ${b}`); }
function throws(code, fn) { assert.throws(fn, e => e.code === code); }

test('portfolio finances exact per-side costs and includes entry loss in drawdown', () => {
  const x = fixture(), r = P.runPortfolio(x), expected = 1000 / 1.0015;
  near(r.endCapital, expected); near(r.metrics.fees, expected * 0.001); near(r.metrics.slippage, expected * 0.0005);
  near(r.equity[1].positions[0].units, expected / 100); near(r.metrics.maxDrawdown, expected / 1000 - 1);
  assert.equal(r.certification, 'NOT_CERTIFIED'); assert.equal(r.productionApproved, false);
  assert.equal(r.mode, 'SYNTHETIC_TEST'); assert.equal(r.equity[1].cash, 0);
  assert.deepEqual(P.runPortfolio(x), r);
  assert.match(r.resultHash, /^[0-9a-f]{64}$/); assert.match(r.runtime.nodeBinaryHash, /^[0-9a-f]{64}$/);
});

test('simultaneous sells and buys hit post-cost targets without ordering or hidden margin', () => {
  const x = fixture();
  x.targets.push({ decisionDate: '2020-01-03', executionDate: '2020-01-06', availableAt: closeAt('2020-01-03'), membershipHash: H, weights: { A: 0.3, B: 0.6 } });
  const r = P.runPortfolio(x), row = r.equity[2];
  near(row.positions.find(p => p.listingId === 'A').units * 100 / row.value, 0.3);
  near(row.positions.find(p => p.listingId === 'B').units * 50 / row.value, 0.6);
  near(row.cash / row.value, 0.1);
  for (let i = 1; i < r.equity.length; i++) {
    const tradeCosts = r.trades.filter(t => t.date === r.equity[i].date).reduce((s, t) => s + t.fee + t.slippage, 0);
    near(r.equity[i].value, r.equity[i - 1].value - tradeCosts);
  }
  const swap = structuredClone(x); swap.listings.reverse(); swap.targets[1].weights = { B: 0.6, A: 0.3 };
  near(P.runPortfolio(swap).endCapital, r.endCapital);
});

test('split, ex-date entitlement, delayed payment and sourced terminal cash reconcile', () => {
  const x = fixture(), a = x.listings[0];
  a.lastTradeDate = '2020-01-07';
  a.bars = a.bars.slice(0, 4).map((b, i) => ({ ...b, close: i < 2 ? 100 : i === 2 ? 50 : 49 }));
  a.events = [
    { id: 'SPLIT_A', type: 'SPLIT', effectiveDate: '2020-01-06', ratio: 2, sequence: 0, availableAt: '2020-01-01T00:00:00Z', sourceHash: H },
    { id: 'DIV_A', type: 'CASH_DIVIDEND', effectiveDate: '2020-01-07', payDate: '2020-01-09', amount: 1, currency: 'USD', sequence: 0, availableAt: '2020-01-01T00:00:00Z', sourceHash: H },
    { id: 'END_A', type: 'TERMINAL_CASH', effectiveDate: '2020-01-08', payDate: '2020-01-09', amount: 52, currency: 'USD', sequence: 0, availableAt: '2020-01-01T00:00:00Z', sourceHash: H }
  ];
  const r = P.runPortfolio(x), units = 2 * (1000 / 1.0015 / 100);
  near(r.equity[2].positions[0].units, units);
  near(r.equity[3].receivables, units); near(r.equity[3].value, 1000 / 1.0015);
  near(r.equity[4].receivables, 53 * units); assert.equal(r.equity[4].positions.length, 0); near(r.equity[4].cash, 0);
  near(r.endCapital, 53 * units); near(r.equity[5].cash, r.endCapital); assert.equal(r.openReceivables.length, 0);
});

test('dividend entitlement survives a sale, pays once and cannot fund pre-payment orders', () => {
  const x = fixture();
  x.listings[0].events = [{ id: 'DIV_A', type: 'CASH_DIVIDEND', effectiveDate: '2020-01-06', payDate: '2020-01-09', amount: 10, currency: 'USD', sequence: 0, availableAt: '2020-01-01T00:00:00Z', sourceHash: H }];
  x.targets.push({ decisionDate: '2020-01-03', executionDate: '2020-01-06', availableAt: closeAt('2020-01-03'), membershipHash: H, weights: {} });
  const r = P.runPortfolio(x), div = r.equity[1].positions[0].units * 10;
  near(r.equity[2].receivables, div); assert.equal(r.equity[2].positions.length, 0);
  near(r.endCapital, r.equity[2].cash + div); near(r.equity[5].receivables, 0);
  x.targets[1].weights = { B: 1 };
  throws('UNSETTLED_CASH_NOT_INVESTABLE', () => P.runPortfolio(x));
});

test('stock exchange transfers sourced successor units and cash without ticker stitching', () => {
  const x = fixture(); x.costs.feeBps = 0; x.costs.slippageBps = 0;
  x.listings[0].lastTradeDate = '2020-01-03'; x.listings[0].bars = x.listings[0].bars.slice(0, 2);
  x.listings[0].events = [{ id: 'MERGE_A_B', type: 'TERMINAL_EXCHANGE', successorListingId: 'B', shareRatio: 2, amount: 5, currency: 'USD', effectiveDate: '2020-01-06', payDate: '2020-01-07', sequence: 0, availableAt: '2020-01-01T00:00:00Z', sourceHash: H }];
  const r = P.runPortfolio(x);
  near(r.equity[2].positions[0].units, 20); assert.equal(r.equity[2].positions[0].listingId, 'B'); near(r.endCapital, 1050);
});

test('late correction of older effective membership never supersedes newer effective membership', () => {
  const x = fixture();
  x.memberships.push({ effectiveAt: '2019-12-01T21:00:00Z', availableAt: '2020-01-02T20:00:00Z', sourceHash: H2, members: ['B'] });
  near(P.runPortfolio(x).endCapital, 1000 / 1.0015);
});

test('profile target builder reuses existing selection, preserves PIT row vintages and fixed weights', () => {
  const x = fixture();
  x.factorSnapshots = [{ effectiveAt: '2020-01-01T21:00:00Z', availableAt: '2020-01-02T20:00:00Z', sourceHash: H2, rows: { A: { momentum: 80 }, B: { momentum: 20 } }, rowAvailableAt: { A: '2020-01-02T19:00:00Z', B: '2020-01-02T19:00:00Z' } }];
  x.targets = P.buildProfileTargets({ ...x, schedule: [{ decisionDate: '2020-01-02', executionDate: '2020-01-03' }], maxPositions: 1, profile: { conditions: [{ id: 'momentum', operator: 'gte', value: 50, weight: 1 }] } });
  assert.deepEqual(x.targets[0].weights, { A: 1 }); near(P.runPortfolio(x).endCapital, 1000 / 1.0015);
  x.factorSnapshots[0].rowAvailableAt.A = '2020-01-03T10:00:00Z';
  throws('FACTOR_ROW_NOT_AVAILABLE', () => P.runPortfolio(x));
});

test('schedule supports monthly, quarterly and declared session intervals', () => {
  const dates = ['2020-01-30', '2020-01-31', '2020-02-03', '2020-03-31', '2020-04-01'];
  const sessions = dates.map(date => ({ date, closeAt: closeAt(date) }));
  assert.deepEqual(P.buildSchedule(sessions, 'monthly').map(t => t.decisionDate), ['2020-01-31', '2020-02-03', '2020-03-31']);
  assert.deepEqual(P.buildSchedule(sessions, 'quarterly').map(t => t.decisionDate), ['2020-03-31']);
  assert.deepEqual(P.buildSchedule(sessions, 'sessions', 2).map(t => t.decisionDate), ['2020-01-30', '2020-02-03']);
});

test('drift threshold skips same-target trading and optional capacity gate blocks oversized orders', () => {
  const x = fixture(); x.driftThreshold = 0.01;
  x.targets.push({ ...x.targets[0], decisionDate: '2020-01-03', executionDate: '2020-01-06', availableAt: closeAt('2020-01-03') });
  assert.equal(P.runPortfolio(x).rebalances[1].skipped, true);
  x.liquidity = { maxParticipation: 0.01, sourceHash: H };
  throws('LIQUIDITY_DATA_UNAVAILABLE', () => P.runPortfolio(x));
  x.listings.forEach(l => l.bars.forEach(b => { b.dollarVolume = 1000; }));
  throws('LIQUIDITY_CAPACITY_EXCEEDED', () => P.runPortfolio(x));
});

test('held missing bars, unsourced terminal and current-only membership fail closed', () => {
  const x = fixture(); x.listings[0].bars.splice(2, 1);
  throws('EXACT_PRICE_UNAVAILABLE', () => P.runPortfolio(x));
  const y = fixture(); y.listings[0].lastTradeDate = '2020-01-03'; y.listings[0].bars = y.listings[0].bars.slice(0, 2);
  throws('LISTING_NOT_TRADABLE', () => P.runPortfolio(y));
  const z = fixture(); z.memberships[0].availableAt = '2026-01-01T00:00:00Z';
  throws('MEMBERSHIP_UNAVAILABLE_OR_STALE', () => P.runPortfolio(z));
});

test('same-session execution, uncovered benchmark, FX, ambiguity, leverage and source omissions reject', () => {
  const mutators = [
    ['EXECUTION_NOT_NEXT_SESSION', x => { x.targets[0].executionDate = x.targets[0].decisionDate; }],
    ['BENCHMARK_UNAVAILABLE', x => { x.benchmark.levels.pop(); }],
    ['LISTING_IDENTITY_INELIGIBLE', x => { x.listings[0].currency = 'EUR'; }],
    ['AMBIGUOUS_SNAPSHOT_VINTAGE', x => { x.memberships.push({ ...x.memberships[0], sourceHash: H2 }); }],
    ['LEVERAGE_NOT_SUPPORTED', x => { x.targets[0].weights = { A: 1, B: 0.1 }; }],
    ['SOURCE_HASH_REQUIRED', x => { x.provenance.mode = 'HISTORICAL_OBSERVED'; }],
    ['TARGET_OUTSIDE_PIT_UNIVERSE', x => { x.memberships[0].members = ['B']; }],
    ['COST_BASIS_REQUIRED', x => { x.costs.basis = 'ROUND_TRIP'; }]
  ];
  for (const [code, mutate] of mutators) { const x = fixture(); mutate(x); throws(code, () => P.runPortfolio(x)); }
});

test('prefix cash/units and costs are independent of future prices and membership revisions', () => {
  const x = fixture(), full = P.runPortfolio(x);
  x.listings.forEach(l => { l.bars.at(-1).close = 100000; });
  x.memberships.push({ effectiveAt: '2020-01-07T21:00:00Z', availableAt: '2020-01-08T21:00:00Z', sourceHash: H3, members: ['B'] });
  const changed = P.runPortfolio(x);
  assert.deepEqual(changed.equity.slice(0, -1), full.equity.slice(0, -1)); assert.deepEqual(changed.trades, full.trades);
  assert.notEqual(changed.inputHash, full.inputHash); assert.notEqual(changed.generation, full.generation);
});

test('full exit to weight 0 sells exactly the held units at any capital scale, without residual units', () => {
  // Regression: units = delta / price left scale-dependent float dust (> 1e-12) or a negative remainder (NEGATIVE_UNITS).
  const d = ['2000-01-07', '2000-01-14', '2000-01-21', '2000-01-28'], at = x => x + 'T23:59:59.999Z', h = '0'.repeat(64);
  const mk = (cap, prices, weight, exitWeights) => ({ sessions: d.map(x => ({ date: x, closeAt: at(x) })), initialCapital: cap, currency: 'USD', returnBasis: 'PRICE_RETURN',
    provenance: { mode: 'HISTORICAL_PRICE_SIMULATION', datasetHash: h, priceSeriesType: 'SPLIT_ADJUSTED', populationBasis: 'CONDITIONAL_FIXED_CURRENT_COHORT', clockBasis: 'MODELED_WEEK_END_DATE' },
    costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 10, slippageBps: 5 }, maxMembershipAgeDays: 45, maxFactorAgeDays: 45, factorSnapshots: [],
    // No bar after the exit session: any residual unit would fail the next valuation.
    listings: [{ listingId: 'X', issuerId: 'X', mic: 'XNAS', instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', firstTradeDate: d[0], lastTradeDate: null, events: [], bars: [d[1], d[2]].map((x, i) => ({ date: x, close: prices[i], availableAt: at(x) })) }],
    memberships: [{ effectiveAt: d[0] + 'T00:00:00Z', availableAt: d[0] + 'T00:00:00Z', sourceHash: h, members: ['X'] }],
    targets: [{ decisionDate: d[0], executionDate: d[1], availableAt: at(d[0]), membershipHash: h, weights: { X: weight } }, { decisionDate: d[1], executionDate: d[2], availableAt: at(d[1]), membershipHash: h, weights: exitWeights }],
    benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', sourceHash: h, costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: d.map(x => ({ date: x, level: 100 })) } });
  for (const [prices, weight] of [[[0.21, 0.33], 0.1], [[0.0137, 0.0191], 0.1], [[3.17, 2.93], 0.37], [[101.3, 97.7], 1]]) for (const exitWeights of [{}, { X: 0 }]) {
    const unit = P.runPortfolio(mk(1, prices, weight, exitWeights));
    for (const cap of [1e6, 1e9]) {
      const r = P.runPortfolio(mk(cap, prices, weight, exitWeights)), held = r.equity[1].positions[0].units, sell = r.trades.find(t => t.side === 'SELL');
      assert.equal(sell.units, held); assert.equal(sell.notional, held * sell.price);
      // Cash change of the exit equals sold units times price, less per-side costs.
      near(r.equity[2].cash - r.equity[1].cash, held * sell.price - sell.fee - sell.slippage, 1e-12);
      for (const row of r.equity.slice(2)) assert.deepEqual(row.positions, []);
      // Scale invariance: the large-numeraire run is the numeraire-1 run scaled.
      near(r.equity.at(-1).cash, unit.equity.at(-1).cash * cap, 1e-12); near(r.endCapital, unit.endCapital * cap, 1e-12);
    }
  }
});
