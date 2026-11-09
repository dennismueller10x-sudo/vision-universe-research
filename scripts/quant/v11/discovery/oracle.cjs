#!/usr/bin/env node
'use strict';
// V11 DISCOVERY – ORACLE_LOOKAHEAD (R5): best possible selection with future knowledge (Top-N by realised forward
// price return over the holding window, equal weight, same costs, same rebalance interval) as an UPPER BOUND, and
// the "oracle gap" of real rules: how much of the attainable selection premium (oracle minus population) a rule
// captures, split into selection hit rate, weighting, timing/cash and costs. Never a strategy or candidate source.
// Usage: node oracle.cjs --period TRAIN|VALIDATION|TEST [--compare <json with specs>]... [--out <file>]
const fs = require('node:fs'), path = require('node:path');
const L = require('./lib.cjs'), R = require('./rules.cjs');

const GATES = { VALIDATION: 'docs/quant-recovery/v11/discovery/candidates-frozen-1.0.0.json', TEST: 'docs/quant-recovery/v11/discovery/final-hypotheses-frozen-1.0.0.json' };
function periodFor(name, universeFamily) {
  const p = L.protocol().periods[universeFamily === 'FUND' ? 'fundamentalRules' : 'priceRules'];
  return p[name];
}
function oracleSpec(base, N) {
  const s = { id: 'ORACLE', family: 'ORACLE_LOOKAHEAD', universeFamily: base.universeFamily, positions: N, holding: 'FULL', weighting: 'EW', filters: base.filters || [], minMarketCap: base.minMarketCap || null };
  if (base.cadence === 'MONTHLY') { s.cadence = 'MONTHLY'; s.rebalanceMonths = base.rebalanceMonths || 1; } else s.rebalanceWeeks = base.rebalanceWeeks;
  return s;
}
// Per decision: universe forward returns (same definition as the oracle), oracle top-N mean, population mean.
function decisionTable(ctx, oSpec, sch) {
  return sch.decisions.map(j => {
    const rows = R.eligibleRows(ctx, oSpec, j), f = rows.map(r => r.fwd).sort((a, b) => b - a);
    const N = Math.min(oSpec.positions, f.length);
    const rank = new Map(rows.slice().sort((a, b) => b.fwd - a.fwd || (a.id < b.id ? -1 : 1)).map((r, k) => [r.id, k]));
    return { j, n: rows.length, oracle: L.mean(f.slice(0, N)), pop: L.mean(f), topNCut: f[N - 1], decileCut: f[Math.max(0, Math.floor(f.length / 10) - 1)], fwd: new Map(rows.map(r => [r.id, r.fwd])), rank };
  });
}
function funded(ctx, spec, sch) {
  const sim = L.simulate(ctx, R.makeStrategy(ctx, spec), { ...sch, costs: L.COSTS.base, relativeTolerance: spec.family === 'ORACLE_LOOKAHEAD' });
  const m = L.pathMetrics(sim.equity.map(e => e.value), sim.equity.map(e => e.date));
  return { sim, cagr: m.cagr, totalReturn: m.totalReturn, maxDrawdown: m.maxDrawdown, sharpe: m.sharpe };
}
// Gap decomposition of one comparator against the oracle on identical decisions and universe.
function gap(ctx, spec, oSpec, sch, table, oFunded, pFunded) {
  const f = funded(ctx, spec, sch), byDecision = new Map(f.sim.targets.filter(t => t.exec === t.decision + 1).map(t => [t.decision, t]));
  let held = new Map(); const rows = [];
  for (const t of table) {
    const tg = byDecision.get(t.j);
    if (tg) held = new Map(Object.entries(tg.weights));
    const ids = [...held.keys()].filter(id => t.fwd.has(id)), wsum = ids.reduce((s, id) => s + held.get(id), 0);
    const ew = ids.length ? L.mean(ids.map(id => t.fwd.get(id))) : 0;
    const wt = wsum > 0 ? ids.reduce((s, id) => s + held.get(id) * t.fwd.get(id), 0) / wsum : 0;
    const invested = Math.min(1, [...held.values()].reduce((s, w) => s + w, 0));
    rows.push({ date: ctx.cal[t.j], oracle: t.oracle, pop: t.pop, picksEw: ids.length ? ew : t.pop * 0, picksWeighted: wt, invested, realised: invested * wt, nPicks: ids.length, outsideUniverse: held.size - ids.length,
      hitTopN: ids.length ? ids.filter(id => t.fwd.get(id) >= t.topNCut).length / ids.length : null, hitTopDecile: ids.length ? ids.filter(id => t.fwd.get(id) >= t.decileCut).length / ids.length : null,
      meanPercentile: ids.length ? L.mean(ids.map(id => 1 - t.rank.get(id) / t.n)) : null });
  }
  const m = k => L.mean(rows.map(r => r[k]).filter(v => v !== null));
  const O = m('oracle'), P = m('pop'), Sew = m('picksEw'), Sw = m('picksWeighted'), Sr = m('realised');
  const grossPerInterval = Sr, netCostPerInterval = f.sim.metrics.fees / f.sim.rebalances.length + f.sim.metrics.slippage / f.sim.rebalances.length;
  return { specId: spec.id, intervals: rows.length,
    funded: { strategyCagr: f.cagr, oracleCagr: oFunded.cagr, populationEwCagr: pFunded.cagr, captureOfOraclePremium: (f.cagr - pFunded.cagr) / (oFunded.cagr - pFunded.cagr), strategyMaxDrawdown: f.maxDrawdown },
    perInterval: { oracle: O, population: P, picksEqualWeight: Sew, picksActualWeight: Sw, realisedGross: Sr, attainablePremium: O - P, selection: Sew - P, weighting: Sw - Sew, timingCash: Sr - Sw, approxCostPerRebalanceInEquityUnits: netCostPerInterval,
      captureOfPremium: (Sr - P) / (O - P), hitRateTopN: m('hitTopN'), hitRateTopDecile: m('hitTopDecile'), randomHitRateTopN: L.mean(table.map(t => Math.min(oSpec.positions, t.n) / t.n)), meanForwardPercentileOfPicks: m('meanPercentile'), avgPicks: m('nPicks'), avgInvested: m('invested') },
    note: 'Per-interval values are gross buy-and-hold returns over each decision interval (identical forward-return definition as the oracle). Selection = EW picks minus EW population; weighting = actual weights minus EW picks; timing/cash = effect of holding cash (market filter, exits, unfilled slots). Funded CAGRs are net of base costs.' };
}

function run(ctx, period, comparators, grid) {
  const out = { cells: [], gaps: [] };
  for (const g of grid) {
    const per = periodFor(period, g.universeFamily);
    const oS = oracleSpec(g, g.N); let sch;
    try { sch = R.schedule(ctx, oS, per[0], per[1]); } catch (e) { out.cells.push({ label: 'ORACLE_LOOKAHEAD', period, cadence: 'WEEKS_' + g.rebalanceWeeks, N: g.N, universe: { family: g.universeFamily, filters: g.filters || [] }, state: 'UNAVAILABLE:' + e.message + ' (last holding window ends after the data)' }); continue; }
    const table = decisionTable(ctx, oS, sch), oF = funded(ctx, oS, sch), pF = funded(ctx, R.popSpec({ ...oS, family: g.universeFamily === 'FUND' ? 'FUND' : 'PRICE', ranks: [] }), sch);
    const spyM = L.pathMetrics(oF.sim.equity.map(e => ctx.spy[e.s]), oF.sim.equity.map(e => e.date));
    const cell = { label: 'ORACLE_LOOKAHEAD', period, decisions: [ctx.cal[sch.decisions[0]], ctx.cal[sch.decisions.at(-1)], sch.decisions.length], valuationTo: ctx.cal[sch.endExec], universe: { family: g.universeFamily, filters: g.filters || [], minMarketCap: g.minMarketCap || null }, cadence: g.cadence ? g.cadence + '_EVERY_' + (g.rebalanceMonths || 1) : 'WEEKS_' + g.rebalanceWeeks, N: g.N,
      oracleFundedCagrNet: oF.cagr, oracleTotalReturnNet: oF.totalReturn, oracleMaxDrawdown: oF.maxDrawdown, populationEwFundedCagrNet: pF.cagr, spyCagr: spyM.cagr,
      perIntervalOracleGross: L.mean(table.map(t => t.oracle)), perIntervalPopulationGross: L.mean(table.map(t => t.pop)), avgUniverse: L.mean(table.map(t => t.n)), turnoverPerYear: oF.sim.metrics.turnoverSum / ((Date.parse(ctx.cal[sch.endExec]) - Date.parse(ctx.cal[sch.decisions[0]])) / (365.25 * 864e5)) };
    out.cells.push(cell);
    console.error('oracle', period, cell.universe.family, JSON.stringify(cell.universe.filters), cell.cadence, 'N', g.N, 'CAGR', (oF.cagr * 100).toFixed(1), 'pop', (pF.cagr * 100).toFixed(1), 'spy', (spyM.cagr * 100).toFixed(1));
    for (const spec of comparators.filter(c => c._grid === g.key)) {
      const gg = gap(ctx, spec, oS, sch, table, oF, pF);
      out.gaps.push({ ...gg, oracleCell: { cadence: cell.cadence, N: g.N, universe: cell.universe } });
      console.error('  gap', spec.id, 'capture', gg.perInterval.captureOfPremium.toFixed(4), 'hitTopN', gg.perInterval.hitRateTopN?.toFixed(3), 'rand', gg.perInterval.randomHitRateTopN.toFixed(3), 'pct', gg.perInterval.meanForwardPercentileOfPicks?.toFixed(3));
    }
  }
  return out;
}

function main() {
  const a = process.argv.slice(2), period = a[a.indexOf('--period') + 1];
  if (!['TRAIN', 'VALIDATION', 'TEST'].includes(period)) throw Error('PERIOD_REQUIRED');
  const gate = GATES[period] ? L.assertCommitted(GATES[period]) : null;
  const compareFiles = a.map((x, i) => x === '--compare' ? a[i + 1] : null).filter(Boolean);
  const outFile = a.includes('--out') ? a[a.indexOf('--out') + 1] : path.join(L.PRIVATE, 'oracle-' + period + '.json');
  const ctx = L.buildContext({ withPanel: true });
  const specs = compareFiles.flatMap(f => { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return d.specs || d.candidates?.map(c => c.spec) || d.hypotheses?.map(h => h.spec) || []; });
  // Oracle grid: comparator cadences/universes plus the standard grid (h 4/13/52, N 10/20/50).
  const grid = new Map();
  const keyOf = s => JSON.stringify([s.universeFamily, s.cadence || null, s.rebalanceMonths || null, s.rebalanceWeeks || null, s.filters || [], s.minMarketCap || null, s.N]);
  const addCell = s => { const k = keyOf(s); if (!grid.has(k)) grid.set(k, { ...s, key: k }); return k; };
  const PX = [['rawPx', 'gte', 5]];
  for (const h of [4, 13, 52]) for (const N of [10, 20, 50]) { addCell({ universeFamily: 'PRICE', rebalanceWeeks: h, filters: PX, N }); addCell({ universeFamily: 'PRICE', rebalanceWeeks: h, filters: [], N }); }
  for (const N of [10, 20, 50]) addCell({ universeFamily: 'FUND', cadence: 'MONTHLY', rebalanceMonths: 1, filters: PX, minMarketCap: 3e8, N });
  const comparators = specs.map(s => {
    const uf = s.family === 'FUND' ? 'FUND' : 'PRICE';
    const filters = s.family === 'V10RULE' ? [] : (s.filters || []);
    const k = addCell({ universeFamily: uf, cadence: s.cadence, rebalanceMonths: s.rebalanceMonths, rebalanceWeeks: s.rebalanceWeeks, filters, minMarketCap: s.family === 'FUND' ? s.minMarketCap : null, N: Math.min(s.positions, 50) });
    return { ...s, _grid: k };
  });
  const res = run(ctx, period, comparators, [...grid.values()]);
  const doc = { schemaVersion: 'v11-discovery-oracle-1.0.0', studyId: L.STUDY_ID + ':ORACLE', label: 'ORACLE_LOOKAHEAD', evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY', period, protocolSha256: L.protocolHash(), gate,
    use: 'Upper bound and attribution only (R5); never a strategy or a candidate source beyond TRAIN.', returnBasis: 'PRICE_RETURN', costs: L.COSTS.base, weighting: 'EW', investment: 'fully invested at each rebalance',
    population: 'lifecycle frame; universe per cell (quoted price >= 5 USD where stated; FUND: PIT panel rows with market cap >= 300 Mio USD)', survivorship: 'TRAIN/VALIDATION populations contain no delisting (all series end >= 2023); the oracle can only pick survivors.',
    ...res, certificationStatus: 'NOT_CERTIFIED', productionApproved: false };
  L.writeJson(outFile, doc);
}
if (require.main === module) main();
module.exports = { run, gap, decisionTable, oracleSpec };
