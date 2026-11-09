#!/usr/bin/env node
'use strict';
// V11 DECOMPOSITION - assembles the compact evidence files (decomposition-results, benchmark-reference-check,
// power-analysis, cause-matrix) from the private run outputs. No new outcome computation except closed-form
// break-even costs, power arithmetic and the SPY total-return ESTIMATE from the sourced distributions.
// Usage: node assemble.cjs --run <private run dir> --out <docs dir>
const fs = require('node:fs'), path = require('node:path');
const K = require('../../v10/studies/common.cjs');
const { readRegistration } = require('./register.cjs');

function args(argv) { const o = {}; for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, '')] = argv[i + 1]; if (!o.run || !o.out) throw Error('USAGE: --run <dir> --out <dir>'); return o; }
const rd = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const r6 = x => (x === null || x === undefined || !Number.isFinite(x)) ? x ?? null : Math.round(x * 1e6) / 1e6;
const pct = x => x === null || x === undefined ? null : Math.round(x * 1e4) / 1e2; // percentage points, 2 decimals
// inverse standard normal (Acklam)
function qnorm(p) {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425; let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) return -qnorm(1 - p);
  q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
const Z80 = qnorm(0.8);
const breakEven = (g, S) => { const q = (1 + S) / (1 + g); return (1 - q) / (1 + q); };

function header(reg, R, kind, extra = {}) {
  return { studyId: 'V11-DECOMPOSITION', part: kind, registrationHash: reg.registrationHash, protocol: { file: R.protocol.file, sha256: R.protocol.sha256 }, period: 'FULL_DESCRIPTIVE',
    firewall: 'R4: FULL_DESCRIPTIVE output of the DECOMPOSITION strand - must not be read by the DISCOVERY strand.',
    population: { frame: 4329, loaderOptions: R.population.loaderOptions, sourceManifestHash: '2c27039fd782cccced62ac28cebfb808eea07670ba2c79e58e373824bcc0b679', survivorshipGap: R.population.survivorship },
    returnBasis: { strategyOrEvents: 'PRICE_RETURN (split-adjusted weekly closes, no dividends)', spy: 'PRICE_RETURN (SPY split-adjusted close, same dates, no dividends)', population: 'PRICE_RETURN equal-weighted, same dates', totalReturn: 'only as labelled ESTIMATE in benchmark-reference-check.json' },
    costs: { events: R.costs.base, stress: R.costs.stress, benchmarks: 'none (SPY passive, population benchmark gross)' },
    weighting: 'events: equal per event; funded: see A3', investmentAssumption: 'events: fully invested per event; funded strategy: slots of 1/N, unfilled slots in cash at 0 %; SPY: fully invested buy-and-hold',
    observedVsSecured: 'every cell reports the observed estimate and, separately, whether it is statistically secured (block bootstrap, Holm within the stated family)',
    evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY (decomposition, FULL_DESCRIPTIVE)', certificationStatus: 'NOT_CERTIFIED', productionApproved: false, ...extra };
}

function main() {
  const a = args(process.argv.slice(2)), reg = readRegistration(), R = reg.registration;
  const ev = rd(path.join(a.run, 'events-result.json'));
  const portFiles = fs.readdirSync(a.run).filter(f => /^portfolio-.*\.json$/.test(f));
  const port = portFiles.flatMap(f => rd(path.join(a.run, f)).results);
  const py = rd(path.join(a.run, 'python-reference.json'));
  const spyd = rd(path.join(a.run, 'spy-distributions.json'));
  const divs = rd(path.join(a.run, 'signal-dividends.json'));
  const popIdx = fs.existsSync(path.join(a.run, 'population-index.json')) ? rd(path.join(a.run, 'population-index.json')) : null;
  const v10 = rd(path.join(K.ROOT, 'docs/quant-recovery/v10/studies/ca-id-lifecycle/signal-backtest-evidence.json'));
  const v10f = rd(path.join(K.ROOT, 'docs/quant-recovery/v10/studies/ca-id-lifecycle/funded-strategy-evidence.json'));
  fs.mkdirSync(a.out, { recursive: true });
  const rules = R.rules;

  // ---------- SPY dividend yield by calendar date (fiscal year Oct-Sep) ----------
  const fy = spyd.fiscalYears, fyKeys = Object.keys(fy).sort();
  const yieldAt = d => { const y = Number(d.slice(0, 4)) + (d.slice(5, 7) >= '10' ? 1 : 0), k = y + '-09-30'; const r = fy[k] || fy[fyKeys.at(-1)]; return { y: r.distributionYieldOnBeginNav, estimatedFromLaterYear: !fy[k] }; };
  const meanSpyYield = (from, to) => { const ys = []; for (let t = Date.parse(from); t <= Date.parse(to); t += 7 * 86400000) ys.push(yieldAt(new Date(t).toISOString().slice(0, 10)).y); return K.mean(ys); };

  // ---------- A1 ----------
  const capOf = k => ev.A1.capWeighted[k];
  const A1 = ev.A1.cells.map(c => {
    const t = c.terms, gross = t.populationMinusSpy + t.signalMinusPopulation, cw = capOf(c.rule + ':' + c.horizonWeeks);
    const sec = x => ({ observed: r6(x.estimate), ci: x.ci?.map(r6) ?? null, pValue: x.pValue, holmAdjustedP: r6(x.holmAdjustedP), secured: !!x.holmReject, securedDirection: x.holmReject ? (x.estimate > 0 ? 'POSITIVE' : 'NEGATIVE') : 'NOT_SECURED' });
    return { rule: c.rule, horizonWeeks: c.horizonWeeks, n: c.n, eventStates: c.states,
      terms: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, r6(v)])), identityResidual: c.identityResidual,
      shares: { populationShareOfGrossExcessVsSpy: gross !== 0 ? r6(t.populationMinusSpy / gross) : null, note: 'gross excess vs SPY = (P-S) + (g-P); net SPY excess = gross - cost' },
      inference: { spyExcessNet: sec(c.inference.spyExcessNet), populationMinusSpy: sec(c.inference.populationMinusSpy), signalMinusPopulation: sec(c.inference.signalMinusPopulation) },
      v10Reconciliation: Object.fromEntries(Object.entries(c.v10Reconciliation).map(([k, v]) => [k, typeof v === 'number' ? r6(v) : v])),
      capWeighted2010: cw && cw.n ? { n: cw.n, populationMinusSpy: r6(cw.populationMinusSpy), coverage: r6(cw.coverage), equalWeightSize: r6(cw.equalWeightSize), capWeightedMinusSpy: r6(cw.capWeightedMinusSpy), residual: r6(cw.residual), signalMinusCapWeighted: r6(cw.signalMinusCapWeighted),
        calendarWeekMeans: Object.fromEntries(Object.entries(cw.calendarWeekMeans).map(([k, v]) => [k, r6(v)])), unscreenedDeviationCheck: cw.unscreenedDeviationCheck ? Object.fromEntries(Object.entries(cw.unscreenedDeviationCheck).map(([k, v]) => [k, r6(v)])) : null } : null,
      censoringTerm: c.censoringTerm ? Object.fromEntries(Object.entries(c.censoringTerm).map(([k, v]) => [k, typeof v === 'number' ? r6(v) : v])) : null };
  });
  const capCoverage = ev.A1.capWeighted['NEW_52W_HIGH:13']?.coverageByYear ?? null;

  // ---------- A4 event break-even ----------
  const A4events = ev.A1.cells.map(c => {
    const g = c.terms.spy + c.terms.populationMinusSpy + c.terms.signalMinusPopulation, S = c.terms.spy, s = breakEven(g, S);
    return { rule: c.rule, horizonWeeks: c.horizonWeeks, meanGross: r6(g), meanSpy: r6(S), breakEvenPerSideBps: Math.round(s * 1e5) / 10,
      spyExcessAtCostGrid: R.analyses.A4_COSTS.costGridPerSideBps.map(([f, sl]) => ({ feeBps: f, slippageBps: sl, spyExcessNet: r6(K.netOf(g, f, sl) - S) })),
      note: 'mean net is exact for the mean of netOf because netOf is affine in g; versus the population the cost enters both sides (V10 base-rate) and cancels to first order' };
  });

  // ---------- A3 / A4 funded ----------
  const groups = Object.keys(R.analyses.A3_PORTFOLIO.randomPaths);
  const q = (arr, p) => { const s = [...arr].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
  const A3 = {}, parityAll = [];
  for (const rule of R.analyses.A3_PORTFOLIO.rules) {
    A3[rule] = {};
    for (const g of groups) {
      const hash = port.find(r => r.rule === rule && r.group === g && r.tie === 'HASH_V10');
      const rnd = port.filter(r => r.rule === rule && r.group === g && r.tie !== 'HASH_V10');
      port.filter(r => r.rule === rule && (r.group === g || r.group === g + '_PARITY') && r.replicaParity).forEach(r => parityAll.push(r.replicaParity));
      const ex = rnd.map(r => r.excessCagr), cg = rnd.map(r => r.cagr);
      A3[rule][g] = { ledger: [...new Set([hash, ...rnd].map(r => r.ledger))],
        hashPath: { cagr: r6(hash.cagr), spyCagr: r6(hash.spyCagr), excessCagr: r6(hash.excessCagr), maxDrawdown: r6(hash.maxDrawdown), sharpe: r6(hash.sharpe), spySharpe: r6(hash.spySharpe), averageInvestedShare: r6(hash.averageInvestedShare),
          oneWayTurnoverPerYear: r6(hash.oneWayTurnoverPerYear), costDragPerYear: r6(hash.costDragPerYear), episodes: hash.episodes, signals: hash.signals, skippedShare: r6(hash.skippedShare),
          weeklyDifference: hash.weeklyDifference ? { estimate: r6(hash.weeklyDifference.estimate), ci: hash.weeklyDifference.ci.map(r6), pValue: hash.weeklyDifference.pValue, sdWeekly: r6(hash.weeklyDifference.sdWeekly) } : null,
          sessionsIdenticalToSpy: hash.sessionsIdenticalToSpy ?? null, from: hash.from, to: hash.to, sessions: hash.sessions, resultHash: hash.resultHash },
        randomTieBreaks: rnd.length ? { paths: rnd.length, cagr: { mean: r6(K.mean(cg)), p5: r6(q(cg, 0.05)), p25: r6(q(cg, 0.25)), median: r6(q(cg, 0.5)), p75: r6(q(cg, 0.75)), p95: r6(q(cg, 0.95)) },
          excessCagr: { mean: r6(K.mean(ex)), p5: r6(q(ex, 0.05)), median: r6(q(ex, 0.5)), p95: r6(q(ex, 0.95)), min: r6(Math.min(...ex)), max: r6(Math.max(...ex)) }, shareExcessPositive: r6(ex.filter(x => x > 0).length / ex.length),
          hashPathPercentile: r6(ex.filter(x => x < hash.excessCagr).length / ex.length), averageInvestedShareMean: r6(K.mean(rnd.map(r => r.averageInvestedShare))), turnoverMean: r6(K.mean(rnd.map(r => r.oneWayTurnoverPerYear))) } : null };
    }
    // Holm over 3 rules per variant (hash paths)
  }
  const holmVariants = {};
  for (const g of groups) { const cells = R.analyses.A3_PORTFOLIO.rules.map(rule => ({ rule, pValue: A3[rule][g].hashPath.weeklyDifference?.pValue })); K.holmFamily(cells); holmVariants[g] = cells.map(c => ({ rule: c.rule, pValue: c.pValue, holmAdjustedP: r6(c.holmAdjustedP), secured: c.holmReject })); }
  const costGrid = {};
  for (const rule of R.analyses.A3_PORTFOLIO.rules) {
    const rows = port.filter(r => r.rule === rule && r.group === 'COST_GRID').map(r => ({ perSideBps: r.costs.feeBps + r.costs.slippageBps, feeBps: r.costs.feeBps, slippageBps: r.costs.slippageBps, cagr: r6(r.cagr), excessCagr: r6(r.excessCagr), weeklyDiffP: r.weeklyDifference?.pValue ?? null })).sort((x, y) => x.perSideBps - y.perSideBps);
    let be = null, beP = null;
    for (let i = 1; i < rows.length; i++) {
      const [x, y] = [rows[i - 1], rows[i]];
      if (be === null && x.excessCagr > 0 && y.excessCagr <= 0) be = x.perSideBps + (y.perSideBps - x.perSideBps) * x.excessCagr / (x.excessCagr - y.excessCagr);
      if (beP === null && x.weeklyDiffP <= 0.05 && y.weeklyDiffP > 0.05) beP = x.perSideBps + (y.perSideBps - x.perSideBps) * (0.05 - x.weeklyDiffP) / (y.weeklyDiffP - x.weeklyDiffP);
    }
    costGrid[rule] = { rows, breakEvenPerSideBpsExcessCagrZero: be === null ? (rows.at(-1).excessCagr > 0 ? '> ' + rows.at(-1).perSideBps : '< ' + rows[0].perSideBps) : Math.round(be * 10) / 10, perSideBpsWherePUnadjustedExceeds005: beP === null ? (rows[0].weeklyDiffP > 0.05 ? 'p > 0.05 already at 0 bps' : 'p <= 0.05 at all grid points') : Math.round(beP * 10) / 10 };
  }
  const v10Check = R.analyses.A3_PORTFOLIO.rules.map(rule => { const v = v10f.performance.find(o => o.rule === rule).variants.base; const h = A3[rule].EQUAL_N10.hashPath; return { rule, v10Cagr: v.metrics.cagr, v11HashCagr: h.cagr, resultHashEqual: v.resultHash === h.resultHash }; });

  // ---------- A7 ----------
  const A7 = { timeTables: Object.fromEntries(Object.entries(ev.A1.timeTables).map(([k, v]) => [k, JSON.parse(JSON.stringify(v, (kk, vv) => typeof vv === 'number' ? r6(vv) : vv))])), populationChange: ev.A7.populationChange };

  const deviations = [ev.marketCapPanel?.deviation ?? null,
    'DEVIATION_2: research-portfolio refuses inputs with listings x sessions > 2,000,000 (PORTFOLIO_OPERATION_BUDGET; N = 20 and 50 paths). Those paths use replicaLedger (same arithmetic); parity with the engine on all engine-feasible parity paths is reported (A3.replicaParity). The engine is unchanged.',
    'NOTE: random tie-break paths at N=5/20/50 and the VOL_INVERSE/FULLY_INVESTED variants are attribution diagnostics, not candidates (no selection, R4).'].filter(Boolean);
  const results = { ...header(reg, R, 'decomposition-results'), deviations,
    A1_decomposition: { definition: R.analyses.A1_DECOMPOSITION.identity, multipleTesting: ev.A1.multipleTesting, cells: A1, capWeightedCoverageByYear: capCoverage, marketCapPanel: ev.marketCapPanel },
    A2_entryExit: { entryDelay: ev.A2.entryDelay.map(c => ({ ...c, spyExcessNet: { ...c.spyExcessNet, estimate: r6(c.spyExcessNet.estimate) }, populationExcessGross: { ...c.populationExcessGross, estimate: r6(c.populationExcessGross.estimate) } })), entryMultipleTesting: ev.A2.entryMultipleTesting,
      fixedHorizons: ev.A2.fixedHorizons, exitVariants: ev.A2.exitVariants, exitMultipleTesting: ev.A2.exitMultipleTesting, ewIndexNote: ev.A2.ewIndexNote, eventTimeCurve: ev.A2.eventTimeCurve },
    A3_portfolio: { v10Reproduction: v10Check,
      fundedAttribution: popIdx ? { supplementary: popIdx.supplementary, from: popIdx.from, to: popIdx.to, spyPriceCagr: r6(popIdx.spyPriceCagr), ewFrameIndexCagr: r6(popIdx.ewFrameIndex.cagr), ewFundedUniverseIndexCagr: r6(popIdx.ewFundedUniverseIndex.cagr), definition: popIdx.definition,
        byRule: R.analyses.A3_PORTFOLIO.rules.map(rule => { const h = A3[rule].EQUAL_N10.hashPath, rt = A3[rule].EQUAL_N10.randomTieBreaks; return { rule, strategyCagrHash: h.cagr, excessVsSpy: h.excessCagr, populationPartEwIndexMinusSpy: r6(popIdx.ewFrameIndex.cagr - popIdx.spyPriceCagr), strategyMinusEwIndexHash: r6(h.cagr - popIdx.ewFrameIndex.cagr), strategyMinusEwIndexRandomMedian: r6(rt.cagr.median - popIdx.ewFrameIndex.cagr), costDragPerYear: h.costDragPerYear }; }) } : null, variants: A3, holmPerVariant: holmVariants, replicaParity: { paths: parityAll.length, maxCagrAbsDiff: Math.max(...parityAll.map(p => p.cagrAbsDiff)), maxEquityRelDiff: Math.max(...parityAll.map(p => p.maxEquityRelDiff)) } },
    A4_costs: { events: A4events, funded: costGrid },
    A7_regimeTime: A7, sourceRun: { eventsCode: ev.code, gitHeadAtRun: ev.gitHead, eventsSeconds: ev.seconds } };
  fs.writeFileSync(path.join(a.out, 'decomposition-results.json'), JSON.stringify(results, null, 0) + '\n');

  // ---------- A5 benchmark reference ----------
  const fundedTR = R.analyses.A3_PORTFOLIO.rules.map(rule => {
    const h = A3[rule].EQUAL_N10.hashPath, years = (Date.parse(h.to) - Date.parse(h.from)) / (365.25 * 86400000), y = meanSpyYield(h.from, h.to);
    const spyTR = (1 + h.spyCagr) * (1 + y) - 1;
    return { rule, from: h.from, to: h.to, years: r6(years), strategyCagrPriceReturn: h.cagr, spyCagrPriceReturn: h.spyCagr, spyMeanDistributionYield: r6(y), spyCagrTotalReturnEstimate: r6(spyTR), excessCagrPriceVsPrice: h.excessCagr, excessCagrPriceVsSpyTotalEstimate: r6(h.cagr - spyTR),
      signalTitleYield2010: divs.rules[rule]?.meanYield ?? null, excessCagrBothTotalEstimate: r6(h.excessCagr + (divs.rules[rule].meanYield - y)), note: 'ESTIMATE: SPY TR CAGR ~ (1+PR CAGR)(1+mean distribution yield of the covered fiscal years)-1; the strategy itself is price return (its own dividends of ~1.3-1.5 % p.a. 2010+ are missing on the strategy side as well).' };
  });
  const eventDiv = rules.map(rule => { const d = divs.rules[rule]; const ySpy = meanSpyYield('2010-01-01', '2025-12-31');
    return { rule, signalTitleYield2010: r6(d.meanYield), populationYieldSameDates: r6(d.populationMeanSameRankDates), spyDistributionYield2010to2025: r6(ySpy), eventsWithYield: d.withYield, eventsUnknownYield: d.unknown,
      totalReturnCorrectionOfSpyExcessPerYearPp: pct(d.meanYield - ySpy), totalReturnCorrectionOfPopulationExcessPerYearPp: pct(d.meanYield - d.populationMeanSameRankDates),
      per13WeeksPp: pct((d.meanYield - ySpy) * 13 / 52), per52WeeksPp: pct(d.meanYield - ySpy) }; });
  const bench = { ...header(reg, R, 'benchmark-reference-check', { evidenceKind: 'TECHNICAL_PARITY (Python) + SOURCE_EVIDENCE (SPY N-30D) + RECONSTRUCTION (dividend order of magnitude)' }),
    definitionsCompared: py.definitions,
    pythonReference: { script: 'scripts/quant/v11/decomposition/verify_decomposition.py', inputChecks: py.inputChecks, parity: py.parity, funded: py.funded, A1: py.A1.map(x => ({ rule: x.rule, horizonWeeks: x.horizonWeeks, n: x.python.n, nEqual: x.nEqual, maxAbsDiff: x.maxAbsDiff })), entryDelay: py.entryDelay.map(x => ({ rule: x.rule, delayWeeks: x.delayWeeks, n: x.n, nEqual: x.nEqual, maxAbsDiff: x.maxAbsDiff })), seconds: py.seconds,
      limitation: 'Loader qualification and series bounds are taken from the committed V10 manifest (inputs); same author, independent code path; a second language is not a holdout.' },
    sameDatesCheck: { events: 'SPY return computed between the identical entry and exit close dates of each event in JS and Python (A1 terms agree to the stated tolerance)', funded: { sessionsIdenticalToSpy: R.analyses.A3_PORTFOLIO.rules.map(r => ({ rule: r, identical: A3[r].EQUAL_N10.hashPath.sessionsIdenticalToSpy })), investedShare: R.analyses.A3_PORTFOLIO.rules.map(r => ({ rule: r, strategyMeanInvested: A3[r].EQUAL_N10.hashPath.averageInvestedShare, spyInvested: 1 })) },
      returnDefinition: 'both PRICE_RETURN, both split-adjusted by the provider (Tiingo); no total return on either side', costs: 'strategy 10+5 bps per side; SPY none (passive buy-and-hold, an investor would also pay ~0.09 % p.a. expense ratio which is already inside the SPY price)', investment: 'strategy holds slots of 1/N, cash at 0 % for empty slots (see averageInvestedShare); SPY fully invested' },
    spyDividends: { source: { issuer: spyd.issuer, cik: spyd.cik, form: spyd.form, documents: spyd.documents.map(d => ({ accession: d.accession, url: d.url, sha256: d.sha256, periodOfReport: d.periodOfReport, state: d.state, quote: d.quote })), navChainConsistent: spyd.navChainConsistent, secRequests: 2 + 6 },
      fiscalYears: Object.fromEntries(fyKeys.map(k => [k, { navBegin: fy[k].navBegin, distributionsPerUnit: fy[k].distributionsPerUnit, navEnd: fy[k].navEnd, distributionYield: r6(fy[k].distributionYieldOnBeginNav), priceReturnNav: r6(fy[k].priceReturnNav), totalReturnNavApprox: r6(fy[k].totalReturnNavApprox), reportedNavTotalReturnPct: fy[k].reportedNavTotalReturnPct, source: fy[k].source }])),
      summaryFY2000toFY2025: spyd.summary, fundedComparison: fundedTR },
    signalTitleDividends: { script: 'scripts/quant/v11/decomposition/dividends_signal.py', definition: divs.definition, populationMeanYield2010: divs.population.meanYield, byRule: eventDiv,
      reading: 'Price-return comparisons omit ~1.9 % p.a. SPY distributions but only ~1.3-1.5 % p.a. dividends of the signal titles: the PRICE vs PRICE comparison FLATTERS the strategies vs SPY by about 0.4-0.6 Pp p.a. (2010+, order of magnitude; 2000-2009 not measured).' } };
  fs.writeFileSync(path.join(a.out, 'benchmark-reference-check.json'), JSON.stringify(bench, null, 1) + '\n');

  // ---------- A6 power ----------
  const zWorst = qnorm(1 - 0.05 / 60 / 2), zBest = qnorm(1 - 0.05 / 2);
  const powerCell = (rule, h, endpoint, est, ci, sdv, n, secured, holmP) => {
    if (!ci) return { rule, horizonWeeks: h, endpoint, observed: r6(est), state: 'NO_INTERVAL' };
    const se = (ci[1] - ci[0]) / (2 * 1.959964), mdeW = (zWorst + Z80) * se, mdeB = (zBest + Z80) * se;
    return { rule, horizonWeeks: h, endpoint, n, observed: r6(est), observedAnnualisedSimple: r6(est * 52 / h), se: r6(se), nEffective: sdv ? Math.round(sdv * sdv / (se * se)) : null, nEffectiveShare: sdv ? r6(sdv * sdv / (se * se) / n) : null,
      mde80Holm60WorstCase: r6(mdeW), mde80Holm60BestCase: r6(mdeB), mde80Holm60WorstCaseAnnualised: r6(mdeW * 52 / h), mde80BestCaseAnnualised: r6(mdeB * 52 / h), observedAboveMdeWorst: Math.abs(est) >= mdeW,
      secured: !!secured, holmAdjustedP: r6(holmP), verdict: secured ? 'SECURED' : Math.abs(est) >= mdeB ? 'OBSERVED_LARGE_BUT_NOT_SECURED' : 'OBSERVED_NOT_SECURED_BELOW_MDE' };
  };
  const powerV10 = v10.cells.map(c => powerCell(c.rule, c.horizonWeeks, c.endpoint, c.estimate, c.ci, c.endpoint === 'SPY_EXCESS' ? ev.A1.cells.find(x => x.rule === c.rule && x.horizonWeeks === c.horizonWeeks).sampleSd.spyExcessNet : null, c.n, c.holmReject, c.holmAdjustedP));
  const powerFunded = R.analyses.A3_PORTFOLIO.rules.flatMap(rule => groups.map(g => { const h = A3[rule][g].hashPath; if (!h.weeklyDifference) return null; const se = (h.weeklyDifference.ci[1] - h.weeklyDifference.ci[0]) / (2 * 1.959964), zw = qnorm(1 - 0.05 / 3 / 2);
    return { rule, variant: g, observedWeeklyDiff: h.weeklyDifference.estimate, observedAnnualised: r6(h.weeklyDifference.estimate * 52), se: r6(se), nEffectiveWeeks: Math.round((h.weeklyDifference.sdWeekly / se) ** 2), mde80Holm3WorstCaseAnnualised: r6((zw + Z80) * se * 52), mde80UnadjustedAnnualised: r6((zBest + Z80) * se * 52), secured: holmVariants[g].find(x => x.rule === rule).secured, holmAdjustedP: holmVariants[g].find(x => x.rule === rule).holmAdjustedP }; }).filter(Boolean));
  const power = { ...header(reg, R, 'power-analysis'), method: R.analyses.A6_POWER.definition, z: { worstHolm60: zWorst, best: zBest, power80: Z80 },
    signalFamilyV10: powerV10, funded: powerFunded,
    summary: rules.map(rule => ({ rule, spyExcess: [4, 13, 26, 52].map(h => { const c = powerV10.find(x => x.rule === rule && x.horizonWeeks === h && x.endpoint === 'SPY_EXCESS'); return { h, observed: c.observed, mdeWorst: c.mde80Holm60WorstCase, mdeAnnualisedWorst: c.mde80Holm60WorstCaseAnnualised, nEffectiveShare: c.nEffectiveShare, verdict: c.verdict }; }) })) };
  fs.writeFileSync(path.join(a.out, 'power-analysis.json'), JSON.stringify(power, null, 1) + '\n');

  // ---------- A8 cause matrix ----------
  const cm = [];
  for (const rule of rules) for (const h of [13, 52]) {
    const c = ev.A1.cells.find(x => x.rule === rule && x.horizonWeeks === h), t = c.terms, cw = capOf(rule + ':' + h);
    const d0 = ev.A2.entryDelay.find(x => x.rule === rule && x.delayWeeks === 0), d1 = ev.A2.entryDelay.find(x => x.rule === rule && x.delayWeeks === 1);
    const curve = ev.A2.eventTimeCurve[rule], react = curve.find(x => x.offsetWeeks === 0), pre4 = curve.find(x => x.offsetWeeks === -4);
    const exits = ev.A2.exitVariants.filter(x => x.rule === rule && !x.variant.startsWith('FIXED')), fix = ev.A2.fixedHorizons.find(x => x.rule === rule && x.horizonWeeks === h);
    const div = eventDiv.find(x => x.rule === rule), dividendPp = div.totalReturnCorrectionOfSpyExcessPerYearPp * h / 52 / 100;
    const pw = powerV10.find(x => x.rule === rule && x.horizonWeeks === h && x.endpoint === 'SPY_EXCESS');
    const additive = { benchmarkPopulation: t.populationMinusSpy, selection: t.signalMinusPopulation, costs: -t.cost, dividendsEstimate: dividendPp };
    const absSum = Object.values(additive).reduce((s, v) => s + Math.abs(v), 0);
    const row = { rule, horizonWeeks: h, observedSpyExcessNetPriceReturn: r6(t.spyExcessNet), securedSpyExcess: pw.secured, spyExcessHolmP: pw.holmAdjustedP,
      causes: {
        selection: { pp: pct(t.signalMinusPopulation), share: r6(Math.abs(t.signalMinusPopulation) / absSum), secured: !!c.inference.signalMinusPopulation.holmReject, holmP: r6(c.inference.signalMinusPopulation.holmAdjustedP), meaning: 'signal minus equal-weighted population of the same week (Auswahlqualitaet)' },
        benchmark: { pp: pct(t.populationMinusSpy), share: r6(Math.abs(t.populationMinusSpy) / absSum), secured: !!c.inference.populationMinusSpy.holmReject, holmP: r6(c.inference.populationMinusSpy.holmAdjustedP),
          split2010: cw && cw.n ? { equalWeightSizePp: pct(cw.equalWeightSize), capWeightedMinusSpyPp: pct(cw.capWeightedMinusSpy), coveragePp: pct(cw.coverage), populationMinusSpy2010Pp: pct(cw.populationMinusSpy) } : null, meaning: 'equal-weighted survivor population minus SPY (Gleichgewichtung, Groesse, Zusammensetzung/Survivor)' },
        costs: { pp: pct(-t.cost), share: r6(t.cost / absSum), breakEvenPerSideBps: A4events.find(x => x.rule === rule && x.horizonWeeks === h).breakEvenPerSideBps },
        dividends: { pp: pct(dividendPp), share: r6(Math.abs(dividendPp) / absSum), state: 'ESTIMATE 2010+ (signal titles vs SPY distributions), sign = correction of the SPY excess if both sides were total return' },
        entry: { delay1MinusDelay0Pp: pct(d1.spyExcessNet.estimate - d0.spyExcessNet.estimate), reactionWeekMinusSpyPp: pct(react.minusSpy.estimate), reactionWeekMinusPopulationPp: pct(react.minusPopulation.estimate), runUpBeforeSignal4wMinusSpyPp: pct(pre4.minusSpy.estimate), additive: false },
        exitHolding: { fixedHorizonPerWeekAnnualisedSpyExcessPp: pct(fix.perWeekAnnualised.spyExcessNet), variants: exits.map(x => ({ variant: x.variant, meanHoldingWeeks: Math.round(x.meanHoldingWeeks * 10) / 10, spyExcessNetPp: pct(x.spyExcessNet.estimate), perWeekAnnualisedSpyPp: pct(x.perWeekAnnualised.spyExcessNet), populationExcessPerWeekAnnualisedPp: pct(x.perWeekAnnualised.populationExcessGross), secured: !!x.spyExcessNet.holmReject })), additive: false },
        weighting: R.analyses.A3_PORTFOLIO.rules.includes(rule) && h === 13 ? Object.fromEntries(groups.map(g => [g, { hashExcessCagrPp: pct(A3[rule][g].hashPath.excessCagr), randomExcessCagrP5P95Pp: A3[rule][g].randomTieBreaks ? [pct(A3[rule][g].randomTieBreaks.excessCagr.p5), pct(A3[rule][g].randomTieBreaks.excessCagr.p95)] : null, shareRandomPathsPositive: A3[rule][g].randomTieBreaks?.shareExcessPositive ?? null, investedShare: A3[rule][g].hashPath.averageInvestedShare }])) : 'not a funded rule/horizon',
        dataCoverage: { censoredOrImmature: c.states.censoredOrImmature, minus100BoundShiftPp: c.censoringTerm ? pct(c.censoringTerm.minus100Shift) : null, survivorCoverage: '10-K filer coverage 2000 14 %, 2010 22 %, 2020 48 %: not quantifiable as Pp; acts through the population term' },
        uncertainty: { observedPp: pct(pw.observed), mde80Holm60WorstPp: pct(pw.mde80Holm60WorstCase), mde80AnnualisedWorstPp: pct(pw.mde80Holm60WorstCaseAnnualised), nEffectiveShare: pw.nEffectiveShare, verdict: pw.verdict }
      }, additiveCheck: { sumPp: pct(t.populationMinusSpy + t.signalMinusPopulation - t.cost), observedPp: pct(t.spyExcessNet) } };
    row.explanation = explain(row, rule, h);
    cm.push(row);
  }
  const pyCross = { pythonA1MaxAbsDiff: py.parity.maxAbsDiffEventTerms, pass: py.parity.pass };
  fs.writeFileSync(path.join(a.out, 'cause-matrix.json'), JSON.stringify({ ...header(reg, R, 'cause-matrix'), shareDefinition: 'share = |contribution| / sum of |additive contributions| (benchmark, selection, costs, dividend estimate); entry, exit/holding, weighting, data coverage and uncertainty are non-additive diagnostics in Pp', pythonCrossCheck: pyCross, rows: cm }, null, 1) + '\n');
  console.log(JSON.stringify({ written: ['decomposition-results.json', 'benchmark-reference-check.json', 'power-analysis.json', 'cause-matrix.json'], py: pyCross }));
}
function explain(r, rule, h) {
  const c = r.causes, s = [];
  s.push(`${rule} ${h} W: beobachteter SPY-Ueberschuss (Kursrendite, netto) ${r.observedSpyExcessNetPriceReturn === null ? '-' : (r.observedSpyExcessNetPriceReturn * 100).toFixed(2)} Pp, ${r.securedSpyExcess ? 'abgesichert' : 'nicht abgesichert'} (Holm-p ${r.spyExcessHolmP}).`);
  s.push(`Davon Benchmark/Population (gleichgewichtete Survivor-Population minus SPY) ${c.benchmark.pp} Pp, Auswahl (Signal minus Population) ${c.selection.pp} Pp, Kosten ${c.costs.pp} Pp.`);
  if (c.benchmark.split2010) s.push(`Ab 2010: Gleichgewichtungs-/Groesseneffekt ${c.benchmark.split2010.equalWeightSizePp} Pp, kapitalgewichtete Frame-Population minus SPY ${c.benchmark.split2010.capWeightedMinusSpyPp} Pp, Abdeckung ${c.benchmark.split2010.coveragePp} Pp.`);
  s.push(`Dividendenkorrektur (Schaetzung 2010+) ${c.dividends.pp} Pp; Reaktionswoche vor dem Einstieg vs. SPY ${c.entry.reactionWeekMinusSpyPp} Pp; Mindesteffekt fuer 80 % Power (Holm 60, ungünstigster Schritt) ${c.uncertainty.mde80Holm60WorstPp} Pp.`);
  return s.join(' ');
}
if (require.main === module) main();
module.exports = { qnorm, breakEven };
