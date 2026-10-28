'use strict';
// V11 DISCOVERY – evaluation of one rule specification over one period: funded strategy (base + stress costs),
// SPY (PRICE_RETURN, no costs), equal-weighted own universe, equal-weighted frame population, PIT cap-weighted
// population (2010+), excess series with calendar block bootstrap, turnover, drawdown, coverage.
const L = require('./lib.cjs');
const R = require('./rules.cjs');

const benchCache = new Map();
function weeklyReturns(eq) { return eq.slice(1).map((e, k) => e.value / eq[k].value - 1); }
function spyReturns(ctx, eq) { return eq.slice(1).map((e, k) => ctx.spy[e.s] / ctx.spy[eq[k].s] - 1); }

function benchmarks(ctx, spec, from, to, sch, costs) {
  const key = JSON.stringify([sch.decisions, sch.endExec, costs]);
  if (!benchCache.has(key)) {
    const frameEw = L.simulate(ctx, R.frameEwStrategy(ctx), { ...sch, costs, record: false });
    let cap = null;
    if (ctx.fund && ctx.cal[sch.decisions[0]] >= '2010-01-29') cap = L.simulate(ctx, R.capWeightStrategy(ctx), { ...sch, costs, record: false });
    benchCache.set(key, { frameEw, cap });
  }
  return benchCache.get(key);
}

function seriesStats(ctx, eq, rets, label) {
  const m = L.pathMetrics(eq.map(e => e.value), eq.map(e => e.date));
  return { label, ...m };
}
function excessBlock(dates, a, b, blockLength) {
  const d = a.map((x, k) => x - b[k]);
  return { ...L.blockInference(dates, d, blockLength), annualisedMean: L.mean(d) * 52, nw: L.neweyWest(d, 8) };
}

function evaluateSpec(ctx, spec, from, to, { stress = true, engine = false, inference = true, delistBounds = false, firstYear = false, keepSim = false } = {}) {
  const sch = R.schedule(ctx, spec, from, to);
  const base = L.simulate(ctx, R.makeStrategy(ctx, spec), { ...sch, costs: L.COSTS.base });
  const eq = base.equity, dates = eq.slice(1).map(e => e.date), rs = weeklyReturns(eq), rspy = spyReturns(ctx, eq);
  const ownKey = JSON.stringify(['own', sch.decisions, sch.endExec, spec.family, (spec.ranks || []).map(x => x[0]).sort(), spec.filters || [], spec.minMarketCap || null, spec.v10Rule || null, spec.signalWindowWeeks || null]);
  if (!benchCache.has(ownKey)) benchCache.set(ownKey, L.simulate(ctx, R.makeStrategy(ctx, R.popSpec(spec)), { ...sch, costs: L.COSTS.base, record: false }));
  const own = benchCache.get(ownKey);
  const bm = benchmarks(ctx, spec, from, to, sch, L.COSTS.base);
  const rown = weeklyReturns(own.equity), rfew = weeklyReturns(bm.frameEw.equity), rcap = bm.cap ? weeklyReturns(bm.cap.equity) : null;
  const spyPath = eq.map(e => ({ value: ctx.spy[e.s], date: e.date }));
  const years = (Date.parse(eq.at(-1).date) - Date.parse(eq[0].date)) / (365.25 * 86400000);
  const out = {
    specId: spec.id, family: spec.family, period: { decisionsFrom: from, decisionsTo: to, firstDecision: ctx.cal[sch.decisions[0]], lastDecision: ctx.cal[sch.decisions.at(-1)], decisions: sch.decisions.length, valuationTo: ctx.cal[sch.endExec],
      note: 'Decisions inside the period; the last portfolio is held to the next scheduled rebalance after the period and liquidated there (overlap disclosed).' },
    strategy: { ...seriesStats(ctx, eq, rs), turnoverPerYear: base.metrics.turnoverSum / years, costsPaid: base.metrics.fees + base.metrics.slippage,
      avgPositions: L.mean(eq.map(e => e.n)), avgInvestedShare: L.mean(eq.map(e => e.value > 0 ? e.invested / e.value : 0)), rebalances: base.rebalances.length,
      distinctNames: new Set(base.trades.map(t => t[1])).size, forcedExits: base.exits.filter(x => x.forced).length },
    spy: L.pathMetrics(spyPath.map(x => x.value), spyPath.map(x => x.date)),
    ownUniverseEw: { ...L.pathMetrics(own.equity.map(e => e.value), own.equity.map(e => e.date)), avgNames: L.mean(own.equity.map(e => e.n)) },
    frameEw: { ...L.pathMetrics(bm.frameEw.equity.map(e => e.value), bm.frameEw.equity.map(e => e.date)), avgNames: L.mean(bm.frameEw.equity.map(e => e.n)) },
    capWeighted: bm.cap ? { ...L.pathMetrics(bm.cap.equity.map(e => e.value), bm.cap.equity.map(e => e.date)), avgNames: L.mean(bm.cap.equity.map(e => e.n)) } : { state: 'UNAVAILABLE_BEFORE_PIT_MARKET_CAP_2010' }
  };
  if (inference) {
    out.excess = {
      vsSpy: excessBlock(dates, rs, rspy, L.INFERENCE.blockLengthWeeks),
      vsSpyBlock52: (x => ({ pValue: x.pValue, ci: x.ci }))(excessBlock(dates, rs, rspy, L.INFERENCE.robustnessBlockLengthWeeks)),
      vsOwnUniverseEw: excessBlock(dates, rs, rown, L.INFERENCE.blockLengthWeeks),
      vsFrameEw: excessBlock(dates, rs, rfew, L.INFERENCE.blockLengthWeeks),
      vsCapWeighted: rcap ? excessBlock(dates, rs, rcap, L.INFERENCE.blockLengthWeeks) : null
    };
  } else {
    const d = (a, b) => L.mean(a.map((x, k) => x - b[k])) * 52;
    out.excess = { vsSpy: { annualisedMean: d(rs, rspy) }, vsOwnUniverseEw: { annualisedMean: d(rs, rown) }, vsFrameEw: { annualisedMean: d(rs, rfew) }, vsCapWeighted: rcap ? { annualisedMean: d(rs, rcap) } : null };
  }
  out.excessCagr = { vsSpy: out.strategy.cagr - out.spy.cagr, vsOwnUniverseEw: out.strategy.cagr - out.ownUniverseEw.cagr, vsFrameEw: out.strategy.cagr - out.frameEw.cagr, vsCapWeighted: bm.cap ? out.strategy.cagr - out.capWeighted.cagr : null };
  if (stress) {
    const st = L.simulate(ctx, R.makeStrategy(ctx, spec), { ...sch, costs: L.COSTS.stress, record: false });
    const m = L.pathMetrics(st.equity.map(e => e.value), st.equity.map(e => e.date)), rst = weeklyReturns(st.equity);
    out.stress = { costs: L.COSTS.stress, cagr: m.cagr, sharpe: m.sharpe, maxDrawdown: m.maxDrawdown, excessCagrVsSpy: m.cagr - out.spy.cagr, excessVsSpyAnnualised: L.mean(rst.map((x, k) => x - rspy[k])) * 52,
      excessVsSpy: inference ? excessBlock(dates, rst, rspy, L.INFERENCE.blockLengthWeeks) : null };
  }
  if (firstYear) {
    const cut = ctx.cal[sch.decisions[0]].slice(0, 4) + '-12-31';
    const k = eq.findIndex(e => e.date > cut), sub = eq.slice(0, k + 1), subSpy = sub.map(e => ctx.spy[e.s]);
    const sm = L.pathMetrics(sub.map(e => e.value), sub.map(e => e.date)), sp = L.pathMetrics(subSpy, sub.map(e => e.date));
    out.firstYear = { to: sub.at(-1).date, strategyTotalReturn: sm.totalReturn, spyTotalReturn: sp.totalReturn, ownUniverseEwTotalReturn: own.equity[k].value / own.equity[0].value - 1 };
    const rest = eq.slice(k), rm = L.pathMetrics(rest.map(e => e.value), rest.map(e => e.date)), rsp = L.pathMetrics(rest.map(e => ctx.spy[e.s]), rest.map(e => e.date));
    out.afterFirstYear = { from: rest[0].date, strategyCagr: rm.cagr, spyCagr: rsp.cagr };
  }
  if (delistBounds) {
    const b = {};
    for (const v of ['MINUS_100', 'CASH_OR_LAST']) { const x = L.simulate(ctx, R.makeStrategy(ctx, spec), { ...sch, costs: L.COSTS.base, delistValue: v, record: false }); const m = L.pathMetrics(x.equity.map(e => e.value), x.equity.map(e => e.date)); b[v] = { cagr: m.cagr, totalReturn: m.totalReturn, forcedExits: x.exits.filter(e => e.forced).length }; }
    out.delistingBounds = { primary: 'LAST_CLOSE (sale at the last observed close of the series, base costs)', forcedExits: base.exits.filter(x => x.forced).length, ...b };
  }
  if (engine) {
    const e = L.runEngine(ctx, base, L.COSTS.base, sch.decisions[0], sch.endExec);
    out.engineLedger = { engine: e.engine, inputHash: e.inputHash, resultHash: e.resultHash, generation: e.generation, cumulativeReturn: e.metrics.cumulativeReturn, cagr: e.metrics.cagr, maxDrawdown: e.metrics.maxDrawdown, oneWayTurnoverSum: e.metrics.oneWayTurnoverSum, fees: e.metrics.fees, slippage: e.metrics.slippage, limitations: e.limitations, parityWithSimulator: e.parity };
  }
  if (keepSim) out._sim = { base, own, sch, frameEw: bm.frameEw, cap: bm.cap };
  return out;
}

module.exports = { evaluateSpec, weeklyReturns, spyReturns };
