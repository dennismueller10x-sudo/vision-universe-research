#!/usr/bin/env node
'use strict';
// V12 REQUAL P5d - attribution of every before/after difference (population, selection, costs, benchmark price vs TR, total return,
// portfolio construction). Reads only the committed P5a/P5b/P5c/P6 outputs; no new outcome definition (registration 1.0.2, P5.d_attribution).
// Usage: node p5d-attribution.cjs [--out docs/quant-recovery/v12/requal/p5d-attribution-1.0.0.json]
const path = require('node:path');
const L = require('./lib.cjs');
const { readRegistration } = require('./plan.cjs');
const D = f => path.join(L.ROOT, 'docs/quant-recovery/v12/requal', f);
const pp = x => L.finite(x) ? L.r6(x * 100) : null;

function main() {
  const o = L.args(process.argv.slice(2), { out: D('p5d-attribution-1.0.0.json') });
  const reg = readRegistration();
  const a = require(D('p5a-population-1.0.0.json')), b = require(D('p5b-signals-1.0.0.json')), c = require(D('p5c-factor-1.0.0.json')), s = require(D('p6-strategies-1.0.0.json'));
  const A = sc => a.aggregates[sc].full, t = (sc, k) => A(sc).terms[k];
  const population = {
    question: 'How much of the V10/V11 "excess over SPY" is the population?',
    cagr: { ZERO: A('ZERO').cagr, LOWER: A('LOWER').cagr },
    additiveTermsAnnualizedPp: Object.fromEntries(['ZERO', 'LOWER'].map(sc => [sc, Object.fromEntries(Object.keys(a.termDefinitions).map(k => [k, t(sc, k).annualizedArithmeticPp]))])),
    bySubspanPp: Object.fromEntries(['semiannual_2009_2019', 'quarterly_2019_2026'].map(k => [k, Object.fromEntries(['ZERO', 'LOWER'].map(sc => [sc, { survivorshipInIndex: a.aggregates[sc][k].terms.survivorshipInIndex.annualizedArithmeticPp, equalWeightInIndex: a.aggregates[sc][k].terms.equalWeightInIndex.annualizedArithmeticPp, universe: a.aggregates[sc][k].terms.universe.annualizedArithmeticPp }]))])),
    text: 'Period buy-and-hold 2009-09 -> 2026-06, price return on both sides. The equal-weighted survivor frame does not beat SPY in this window; its gap to SPY splits into (i) survivor titles outside the index (+), (ii) measurement weekly series vs holdings (~0), (iii) survivorship inside the index: members with our series beat all members (+, much larger under LOWER), (iv) equal weighting inside the index (-, mega-cap dominance after 2019). The V11 population term (+0.87 to +1.10 pp per 13 W, 2000-2025) came from 2000-2012 and does not exist on the qualified population.'
  };
  const bridge = b.bridge.map(x => ({ rule: x.rule, h: x.horizonWeeks, columns: x.columns, spyExcessNetPp: x.spyExcessNet.map(pp), populationMinusSpyPp: x.populationMinusSpy.map(pp), signalMinusPopulationPp: x.signalMinusPopulation.map(pp), costPp: x.cost.map(pp),
    lowerBound: { populationAllMinusSpyPp: pp(x.lowerBoundPopulationAllMinusSpy), signalMinusPopulationAllPp: pp(x.lowerBoundSignalMinusPopulationAll) } }));
  const fac = ['S1_FRAME_BEFORE', 'S2_FRAME_AFTER', 'S3_SP_SERIES', 'S4_SP_HOLDINGS_ZERO', 'S4_SP_HOLDINGS_LOWER', 'D1_SP_SERIES_FULLFRAME_SCORES', 'D2_SP_HOLDINGS_FULLFRAME_ZERO'];
  const factor = Object.fromEntries(Object.keys(c.results.S1_FRAME_BEFORE).map(g => [g, { v10Published13W: c.v10Published[g]['13W']?.meanIC ?? null, v10Published26W: c.v10Published[g]['26W']?.meanIC ?? null,
    ...Object.fromEntries(fac.map(st => [st, c.results[st][g].full ? { meanIC: c.results[st][g].full.meanIC, icNwP: c.results[st][g].full.icNwP, q5MinusQ1Pp: pp(c.results[st][g].full.q5MinusQ1), q5MinusSpyPp: pp(c.results[st][g].full.q5MinusSpy) } : null])) }]));
  const P = s.results.registeredSpan.scenarios, Cs = s.results.commonSpan.scenarios;
  const strat = Object.fromEntries(Object.keys(P.ZERO.BASE.strategies).map(id => { const z = P.ZERO.BASE.strategies[id], zs = P.ZERO.STRESS.strategies[id], l = P.LOWER.BASE.strategies[id], cz = Cs.ZERO.BASE.strategies[id];
    return [id, { cagr: z.performance.cagr, vsSpyPp: pp(z.vsSpy.cagrDiff), vsSpyStressPp: pp(zs.vsSpy.cagrDiff), vsSpyLowerPp: pp(l.vsSpy.cagrDiff), vsSpyCommonSpanPp: pp(cz.vsSpy.cagrDiff),
      decomposition: { benchmarkEwVsSpyPp: pp(P.ZERO.BASE.strategies.S1_EW_SP500.vsSpy.cagrDiff), universeSelectableVsEwPp: pp(P.ZERO.BASE.references.EW_SELECTABLE.cagr - P.ZERO.BASE.strategies.S1_EW_SP500.performance.cagr), selectionVsSelectablePp: pp(z.vsSelectableUniverse.cagrDiff),
        costDragPp: z.costDragPerYearPp, avgEquity: z.avgEquity, spyTrMinusPricePp: pp(P.ZERO.BASE.references.SPY_TR_REFERENCE.cagr - P.ZERO.BASE.references.SPY.cagr) },
      nwP: L.r6(z.vsSpy.nw.p), bootP: L.r6(z.vsSpy.bootstrap.p) }]; }));
  const out = { studyId: 'V12-REQUAL-P5D', registrationSha256: reg.sha256, evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY', certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
    inputs: Object.fromEntries(['p5a-population-1.0.0.json', 'p5b-signals-1.0.0.json', 'p5c-factor-1.0.0.json', 'p6-strategies-1.0.0.json'].map(f => [f, L.shaFile(D(f))])),
    population,
    selection: { signalBridge: bridge, factorBridge: factor, text: 'Selection = signal minus the same-week population (P5b), rank IC/quintiles inside the scored population (P5c), strategy minus the equal-weighted selectable universe (P6). On the S&P population the factor ICs that are clearly positive on the survivor frame shrink to about zero; the change happens between S2 (frame) and S3 (S&P members), not through the market-cap correction (S1 -> S2) nor through the exits (S3 -> S4).' },
    costs: { p5bPerEventPp: b.bridge.map(x => [x.rule, x.horizonWeeks, pp(x.cost[2])]), p6CostDragPpPerYear: Object.fromEntries(Object.entries(P.ZERO.BASE.strategies).map(([k, v]) => [k, [v.costDragPerYearPp, P.ZERO.STRESS.strategies[k].costDragPerYearPp]])),
      text: 'Costs are mechanical: 10+5 bps per side per event (P5b); in P6 they scale with turnover (EW 0.2x, momentum 1.5x one-sided per year).' },
    benchmark: { spyTrMinusPriceCagrPp: pp(A('ZERO').cagr.SPY_TR - A('ZERO').cagr.SPY), spyTrVsNportNote: 'quarterly SPY TR reference vs N-PORT fund total return 2019-09+: see p5a periods counts.nportTotalReturn',
      text: 'Every comparison is price vs price. SPY total return exceeds the SPY price return by about 2 pp per year; a strategy whose members pay similar dividends would gain about as much, which is why the price-vs-TR comparison (vsSpyTrReference) is mixed basis and only shows the size of the definition term.' },
    totalReturn: { state: 'NOT_AVAILABLE_FOR_STRATEGY_SIDE', text: 'Holdings returns are price returns (Wert/Stueck); member dividends are not in the population. No total-return statement about strategies is possible; the SPY TR reference bounds the definition effect.' },
    portfolioConstruction: { weeklyRebalancingPp: t('ZERO', 'rebalancingWeekly').annualizedArithmeticPp, equalVsCapWeightInIndexPp: t('ZERO', 'equalWeightInIndex').annualizedArithmeticPp,
      text: 'The V11 equal-weighted index was rebalanced weekly; period buy-and-hold of the same frame earns about 1.4 pp per year less (rebalancing bonus in a high-dispersion universe). Equal versus cap weighting inside the index is the largest single term after 2019.' },
    strategies: strat };
  const h = L.writeJson(o.out, out);
  console.log(JSON.stringify({ out: path.relative(L.ROOT, o.out), sha256: h }));
}
if (require.main === module) main();
