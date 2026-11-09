// Weekly portfolio fixtures shared by research-portfolio-exit-rules and backtest-metrics tests (synthetic + one real committed-series run).
export const H = 'a'.repeat(64);
const closeAt = d => d + 'T21:00:00Z';
export function weeklyDates(n, start = '2020-01-03') { const out = []; let t = Date.parse(start + 'T00:00:00Z'); for (let i = 0; i < n; i++) { out.push(new Date(t).toISOString().slice(0, 10)); t += 7 * 86400000; } return out; }
// Deterministic price paths: A trends down then recovers, B rises, C oscillates.
export function pathOf(name, n) {
  const out = []; let p = name === 'A' ? 100 : name === 'B' ? 50 : 20;
  for (let i = 0; i < n; i++) {
    const r = name === 'A' ? (i < 8 ? -0.04 : 0.03) : name === 'B' ? 0.01 + 0.02 * Math.sin(i) : 0.06 * Math.sin(i / 2);
    if (i) p = Math.round(p * (1 + r) * 10000) / 10000; out.push(p);
  }
  return out;
}
export function weeklyFixture(n = 30, every = 4, names = ['A', 'B', 'C']) {
  const dates = weeklyDates(n);
  const weights = Object.fromEntries(names.map(k => [k, 0.3]));
  return {
    sessions: dates.map(date => ({ date, closeAt: closeAt(date) })), initialCapital: 10000, currency: 'USD',
    provenance: { mode: 'SYNTHETIC_TEST', datasetHash: H }, costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 10, slippageBps: 5 },
    maxMembershipAgeDays: 400, maxFactorAgeDays: 45,
    listings: names.map(listingId => { const px = pathOf(listingId, n); return { listingId, issuerId: 'I_' + listingId, mic: 'XNAS', instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', firstTradeDate: '2010-01-01', lastTradeDate: null,
      bars: dates.map((date, i) => ({ date, availableAt: closeAt(date), close: px[i] })), events: [] }; }),
    memberships: [{ effectiveAt: '2019-12-31T21:00:00Z', availableAt: '2019-12-31T21:00:00Z', sourceHash: H, members: names }], factorSnapshots: [],
    targets: dates.slice(0, -1).filter((d, i) => i % every === 0).map(d => ({ decisionDate: d, executionDate: dates[dates.indexOf(d) + 1], availableAt: closeAt(d), membershipHash: H, weights })),
    benchmark: { currency: 'USD', returnBasis: 'TOTAL_RETURN', sourceHash: H, costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: dates.map((date, i) => ({ date, level: 100 * Math.pow(1.002, i) * (1 + 0.01 * Math.sin(i)) })) }
  };
}
export function goldenCases() {
  const base = weeklyFixture();
  const drift = weeklyFixture(); drift.driftThreshold = 0.05;
  const split = weeklyFixture(); split.listings[0].bars = split.listings[0].bars.map((b, i) => i >= 10 ? { ...b, close: b.close / 2 } : b);
  split.listings[0].events = [{ id: 'SPLIT_A', type: 'SPLIT', effectiveDate: split.sessions[10].date, ratio: 2, sequence: 0, availableAt: '2019-01-01T00:00:00Z', sourceHash: H }];
  split.listings[1].events = [{ id: 'DIV_B', type: 'CASH_DIVIDEND', effectiveDate: split.sessions[12].date, payDate: split.sessions[14].date, amount: 0.5, currency: 'USD', sequence: 0, availableAt: '2019-01-01T00:00:00Z', sourceHash: H }];
  const rotate = weeklyFixture(30, 3); rotate.targets = rotate.targets.map((t, i) => ({ ...t, weights: i % 2 ? { A: 0.5, C: 0.4 } : { B: 0.45, C: 0.45 } }));
  const zero = weeklyFixture(); zero.costs = { basis: 'PER_SIDE_NOTIONAL', feeBps: 0, slippageBps: 0 };
  return { base, drift, split, rotate, zero };
}
export function stripVolatile(r) { const { sourceHashes, runtime, generation, resultHash, ...rest } = r; return rest; }

// Real weekly run from committed public series (quant/data/market/discover-series-long, default loader = product adapter)
// and the SPY price-return benchmark (weekly-benchmark.cjs). Fixed window; HISTORICAL_PRICE_SIMULATION provenance.
export function realWeeklyInput(require, root, { ids = ['ref_MSFT', 'ref_JPM', 'ref_KO', 'ref_PG', 'ref_XOM'], window = ['2010-01-01', '2024-12-31'], every = 4, weight = 0.18 } = {}) {
  const L = require(root + '/quant/engines/research-weekly-loader.cjs'), B = require(root + '/quant/engines/weekly-benchmark.cjs'), C = require(root + '/quant/engines/research-contract.cjs');
  const loader = L.createResearchLoader(root), bench = B.load(root);
  const docs = ids.map(id => loader(id));
  const sets = docs.map(d => new Set(d.points.map(p => p[0])));
  const dates = docs[0].points.map(p => p[0]).filter(x => x >= window[0] && x <= window[1] && sets.every(s => s.has(x)) && bench.byDate.has(x));
  const at = x => x + 'T23:59:59.999Z', inWin = new Set(dates), members = docs.map(d => d.listingId);
  const mh = C.hash(members);
  return {
    sessions: dates.map(date => ({ date, closeAt: at(date) })), initialCapital: 100000, currency: 'USD', returnBasis: 'PRICE_RETURN',
    provenance: { mode: 'HISTORICAL_PRICE_SIMULATION', datasetHash: C.hash(docs.map(d => [d.securityId, d.sourceBytesHash])), priceSeriesType: 'SPLIT_ADJUSTED', populationBasis: 'CONDITIONAL_FIXED_CURRENT_COHORT', clockBasis: 'MODELED_WEEK_END_DATE' },
    costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 5, slippageBps: 5 }, maxMembershipAgeDays: 20000, maxFactorAgeDays: 45,
    listings: docs.map(d => ({ listingId: d.listingId, issuerId: d.securityId, mic: d.listingId.includes(':NASDAQ:') ? 'XNAS' : 'XNYS', instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', firstTradeDate: d.listingStart, lastTradeDate: null, events: [],
      bars: d.points.filter(p => inWin.has(p[0])).map(([date, close]) => ({ date, close, availableAt: at(date) })) })),
    memberships: [{ effectiveAt: dates[0] + 'T00:00:00Z', availableAt: dates[0] + 'T00:00:00Z', sourceHash: mh, members }], factorSnapshots: [],
    targets: dates.slice(0, -1).filter((x, k) => k % every === 0).map((decisionDate, k) => ({ decisionDate, executionDate: dates[k * every + 1], availableAt: at(decisionDate), membershipHash: mh, weights: Object.fromEntries(members.map(m => [m, weight])) })),
    benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', sourceHash: bench.provenance.sourceBytesHash, costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: dates.map(date => ({ date, level: bench.byDate.get(date) })) },
  };
}
