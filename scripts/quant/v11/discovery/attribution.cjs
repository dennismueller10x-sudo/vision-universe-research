#!/usr/bin/env node
'use strict';
// V11 DISCOVERY – return attribution (task 9) for every frozen candidate (VALIDATION) and final hypothesis (TEST),
// successful or not: market/beta, equal-weight/size effect of the universe, characteristic contributions from
// per-interval cross-sectional regressions (momentum, short-term momentum, volatility, size, quality, value,
// growth, profitability), specific selection, concentration (top-5 names), costs, cash/timing.
// Usage: node attribution.cjs  (reads the private VALIDATION/TEST paths written by validate.cjs)
const path = require('node:path');
const L = require('./lib.cjs'), R = require('./rules.cjs');

const CHARS = [['momentum12_1', r => r.r12_1], ['momentum3', r => r.r3], ['volatility', r => r.vol], ['sizeLogMcap', r => r._mcap ? Math.log(r._mcap) : null],
  ['quality', r => r._f?.q], ['value', r => r._f?.v], ['growth', r => r._f?.g], ['profitability', r => r._f?.p]];

function zscores(rows, get) {
  const v = rows.map(get), ok = v.filter(L.finite), m = L.mean(ok), s = L.sd(ok);
  return { z: v.map(x => (L.finite(x) && s > 0 ? (x - m) / s : 0)), coverage: ok.length / rows.length };
}

function attribute(ctx, id, p, stage) {
  const spec = p.spec, idx = d => ctx.calIndex.get(d);
  const decisions = p.decisions.map(idx), endExec = idx(p.endExec), eq = p.equity;
  const sIdx = new Map(eq.map((e, k) => [idx(e[0]), k]));
  const rs = eq.slice(1).map((e, k) => e[1] / eq[k][1] - 1), rm = eq.slice(1).map((e, k) => ctx.spy[idx(e[0])] / ctx.spy[idx(eq[k][0])] - 1);
  const rown = p.own.slice(1).map((v, k) => v / p.own[k] - 1), rcap = p.cap ? p.cap.slice(1).map((v, k) => v / p.cap[k] - 1) : null;
  const ann = a => L.mean(a) * 52;
  const beta = L.ols(rs, rm.map(x => [1, x]));
  // Characteristic regressions per decision interval on the rule's own eligible universe.
  const pop = R.popSpec(spec), tgt = new Map(p.targets.map(t => [t[0], t[2]]));
  let held = {}; const intervals = [], nameContrib = new Map();
  decisions.forEach((j, q) => {
    if (tgt.has(ctx.cal[j])) held = tgt.get(ctx.cal[j]);
    const end = q + 1 < decisions.length ? decisions[q + 1] + 1 : endExec;
    const fd = ctx.fund.latestAtOrBefore(j);
    const rows = R.eligibleRows(ctx, pop, j).map(r => { const l = ctx.byId.get(r.id); return { ...r, _fwd: L.closeAt(l, Math.min(end, l.last)) / L.closeAt(l, j + 1) - 1, _f: fd ? fd.rows.get(r.id) : null, _mcap: fd ? R.plausibleCap(ctx, fd, r.id, j) : null }; }).filter(r => L.finite(r._fwd));
    if (rows.length < 30) return;
    const Z = CHARS.map(([n, g]) => [n, zscores(rows, g)]).filter(([, z]) => z.coverage >= 0.3);
    const X = rows.map((_, i) => [1, ...Z.map(([, z]) => z.z[i])]), y = rows.map(r => r._fwd);
    const b = L.ols(y, X); if (!b) return;
    const pos = new Map(rows.map((r, i) => [r.id, i]));
    const ids = Object.keys(held).filter(k => pos.has(k)), w = ids.reduce((s, k) => s + held[k], 0);
    const outside = Object.keys(held).filter(k => !pos.has(k)).reduce((s, k) => s + held[k], 0);
    if (!ids.length) { intervals.push({ date: ctx.cal[j], cash: true, universe: L.mean(y) }); return; }
    const port = ids.reduce((s, k) => s + held[k] / w * y[pos.get(k)], 0);
    const expo = Z.map(([n], c) => [n, ids.reduce((s, k) => s + held[k] / w * X[pos.get(k)][c + 1], 0)]);
    const contrib = Object.fromEntries(expo.map(([n, e], c) => [n, e * b[c + 1]]));
    const charSum = Object.values(contrib).reduce((s, x) => s + x, 0);
    for (const k of ids) nameContrib.set(k, (nameContrib.get(k) || 0) + held[k] / w * (y[pos.get(k)] - L.mean(y)));
    intervals.push({ date: ctx.cal[j], weeks: end - (j + 1), universe: L.mean(y), portfolio: port, excess: port - L.mean(y), contrib, exposures: Object.fromEntries(expo), specific: port - L.mean(y) - charSum, investedOutsideUniverse: outside, n: rows.length, coverage: Object.fromEntries(Z.map(([n, z]) => [n, z.coverage])) });
  });
  const iv = intervals.filter(x => !x.cash), perYear = 52 / L.mean(iv.map(x => x.weeks));
  const names = [...new Set(iv.flatMap(x => Object.keys(x.contrib)))];
  const contribAnn = Object.fromEntries(names.map(n => [n, L.mean(iv.map(x => x.contrib[n] ?? 0)) * perYear]));
  const sorted = [...nameContrib].sort((a, b) => b[1] - a[1]), totalRel = sorted.reduce((s, x) => s + x[1], 0), pos = sorted.filter(x => x[1] > 0).reduce((s, x) => s + x[1], 0);
  // Gross (zero-cost) path for the cost drag.
  const sch = { decisions, endExec };
  const gross = L.simulate(ctx, R.makeStrategy(ctx, spec), { ...sch, costs: { feeBps: 0, slippageBps: 0 }, record: false });
  const gm = L.pathMetrics(gross.equity.map(e => e.value), gross.equity.map(e => e.date)), nm = L.pathMetrics(eq.map(e => e[1]), eq.map(e => e[0]));
  const inv = eq.map(e => e[1] > 0 ? e[2] / e[1] : 0);
  const cashWeeks = rs.map((_, k) => inv[k] < 0.5), cashSpy = rm.filter((_, k) => cashWeeks[k]);
  return { id, stage, variantId: spec.id, family: spec.family,
    observed: { strategyAnnMeanWeekly: ann(rs), spyAnnMeanWeekly: ann(rm), excessVsSpy: ann(rs) - ann(rm), strategyCagrNet: nm.cagr, strategyCagrGross: gm.cagr },
    marketBeta: { alphaAnnualised: beta[0] * 52, beta: beta[1], betaContributionAnnualised: beta[1] * ann(rm), note: 'weekly OLS r_strategy = alpha + beta r_SPY (price returns)' },
    universeVsSpy: { ownUniverseEwMinusSpy: ann(rown) - ann(rm), capWeightedMinusSpy: rcap ? ann(rcap) - ann(rm) : null, ownUniverseEwMinusCapWeighted: rcap ? ann(rown) - ann(rcap) : null, note: 'equal-weight/size effect of the rule universe (survivor frame)' },
    selectionVsOwnUniverse: { strategyMinusOwnEwWeekly: ann(rs) - ann(rown), intervalsAnalysed: iv.length, cashIntervals: intervals.length - iv.length, intervalsPerYear: perYear,
      grossExcessPerYear: L.mean(iv.map(x => x.excess)) * perYear, characteristicContributionsPerYear: contribAnn, specificSelectionPerYear: L.mean(iv.map(x => x.specific)) * perYear,
      averageExposures: Object.fromEntries(names.map(n => [n, L.mean(iv.map(x => x.exposures[n] ?? 0))])), averageCoverage: Object.fromEntries(names.map(n => [n, L.mean(iv.map(x => x.coverage[n] ?? 0))])),
      method: 'per decision interval: OLS of forward gross price returns of the eligible universe on cross-sectional z-scores (characteristics with >= 30% coverage; missing = 0); portfolio excess over the universe mean = sum(exposure x slope) + specific; annualised by intervals per year. Buy-and-hold within the interval; weights of the decision target.' },
    concentration: { distinctNames: sorted.length, top5: sorted.slice(0, 5).map(([k, v]) => ({ id: k, relativeContribution: v })), bottom5: sorted.slice(-5).map(([k, v]) => ({ id: k, relativeContribution: v })),
      top5ShareOfNetRelative: totalRel !== 0 ? sorted.slice(0, 5).reduce((s, x) => s + x[1], 0) / totalRel : null, top5ShareOfPositiveRelative: pos > 0 ? sorted.slice(0, 5).reduce((s, x) => s + x[1], 0) / pos : null, netRelativeSum: totalRel,
      note: 'relative contribution = sum over intervals of weight x (name forward return - universe mean); additive approximation' },
    costs: { cagrGross: gm.cagr, cagrNet: nm.cagr, costDragCagr: gm.cagr - nm.cagr },
    timingCash: { averageInvestedShare: L.mean(inv), weeksMostlyCash: cashWeeks.filter(Boolean).length, spyAnnMeanInCashWeeks: cashSpy.length ? ann(cashSpy) : null, note: 'cash earns 0; market filter / exits' } };
}

function main() {
  const ctx = L.buildContext({ withPanel: true }), out = [];
  for (const stage of ['VALIDATION', 'TEST']) {
    const paths = L.readJson(path.join(L.PRIVATE, stage.toLowerCase() + '-paths.json.gz'));
    for (const [id, p] of Object.entries(paths)) {
      const a = attribute(ctx, id, p, stage); out.push(a);
      const c = a.selectionVsOwnUniverse.characteristicContributionsPerYear, f = v => (v * 100).toFixed(1);
      console.error(stage, id, 'exSPY', f(a.observed.excessVsSpy), 'beta', a.marketBeta.beta.toFixed(2), 'univ-SPY', f(a.universeVsSpy.ownUniverseEwMinusSpy), 'sel', f(a.selectionVsOwnUniverse.grossExcessPerYear), Object.entries(c).map(([k, v]) => k.slice(0, 6) + ' ' + f(v)).join(' '), 'spec', f(a.selectionVsOwnUniverse.specificSelectionPerYear), 'top5', a.concentration.top5ShareOfNetRelative?.toFixed(2), 'cost', f(a.costs.costDragCagr));
    }
  }
  L.writeJson(path.join(L.DOCS, 'attribution-1.0.0.json'), { schemaVersion: 'v11-discovery-attribution-1.0.0', studyId: L.STUDY_ID + ':ATTRIBUTION', protocolSha256: L.protocolHash(), periods: ['VALIDATION (all 24 frozen candidates)', 'TEST (final hypotheses)'],
    returnBasis: 'PRICE_RETURN', costs: L.COSTS.base, size: 'log PIT market cap with plausibility filter 1.0.1 (2010+)', characteristics: CHARS.map(c => c[0]),
    limitations: ['Characteristic slopes are per-interval cross-sectional OLS on a survivor frame; missing characteristics set to 0 (neutral).', 'Interval returns are buy-and-hold at decision weights; small differences to the funded ledger (drift, costs) are reported via observed/costs fields.', 'Fundamental characteristics come from the V10 PIT panel (fiscal calendar from today, XBRL scale errors in market-cap-based value yields).'],
    results: out, certificationStatus: 'NOT_CERTIFIED', productionApproved: false });
}
main();
