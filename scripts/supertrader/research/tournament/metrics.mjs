/** Descriptive tournament statistics. No market data loading or parameter fitting. */
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
function dateValid(d) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d; }
function sampleSd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}
function quantile(xs, q) {
  if (!xs.length) return null;
  const sorted = xs.slice().sort((a, b) => a - b), p = q * (sorted.length - 1), lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}
function summary(xs) {
  return { n: xs.length, mean: mean(xs), median: quantile(xs, 0.5), hitRate: xs.length ? xs.filter((x) => x > 0).length / xs.length : null, leftTail: quantile(xs, 0.05), rightTail: quantile(xs, 0.95), min: xs.length ? Math.min(...xs) : null, max: xs.length ? Math.max(...xs) : null };
}
function curveIssues(curve) {
  if (!Array.isArray(curve)) return ['CURVE_NOT_ARRAY'];
  const errors = [];
  if (!curve.length) errors.push('EMPTY_CURVE');
  if (curve.some((x) => !x || !dateValid(x.date) || !finite(x.equity) || x.equity < 0)) errors.push('INVALID_CURVE_OBSERVATION');
  if (curve.some((x, i) => i && x?.date <= curve[i - 1]?.date)) errors.push('CURVE_DATES_NOT_STRICTLY_INCREASING');
  return errors;
}
function dailyReturns(curve, initialCapital) {
  const returns = [];
  // First point is the initial-state/date anchor when equal to initialCapital.
  if (finite(initialCapital) && initialCapital > 0 && curve.length && curve[0].equity !== initialCapital) returns.push(curve[0].equity / initialCapital - 1);
  for (let i = 1; i < curve.length; i++) {
    if (curve[i - 1].equity > 0) returns.push(curve[i].equity / curve[i - 1].equity - 1);
    else if (curve[i].equity !== 0) return { returns: [], error: 'EQUITY_RECOVERY_FROM_ZERO' };
  }
  return { returns };
}
export function portfolioMetrics(curve, options = {}) {
  const errors = curveIssues(curve);
  if (!finite(options.initialCapital) || options.initialCapital <= 0) errors.push('INITIAL_CAPITAL_REQUIRED');
  if (errors.length) return { status: 'UNAVAILABLE', errors, totalReturn: null, cagr: null, maxDrawdown: null, annualizedVolatility: null, sharpe: null };
  const initialCapital = options.initialCapital, finalEquity = curve.at(-1).equity;
  const elapsedDays = (Date.parse(`${curve.at(-1).date}T00:00:00Z`) - Date.parse(`${curve[0].date}T00:00:00Z`)) / 86400000;
  const series = dailyReturns(curve, initialCapital);
  if (series.error) return { status: 'UNAVAILABLE', errors: [series.error], totalReturn: null, cagr: null, maxDrawdown: null, annualizedVolatility: null, sharpe: null };
  const sd = sampleSd(series.returns), avg = mean(series.returns);
  let peak = initialCapital, maxDrawdown = 0;
  for (const p of curve) { peak = Math.max(peak, p.equity); maxDrawdown = Math.min(maxDrawdown, p.equity / peak - 1); }
  const exposureValues = curve.map((p) => p.exposure).filter(finite);
  const holdingValues = curve.map((p) => p.n).filter(finite);
  const exposureBuckets = Object.fromEntries(['CASH_0', 'LOW_0_TO_25', 'MID_25_TO_75', 'HIGH_75_TO_100', 'OVER_100'].map((k) => [k, 0]));
  for (const x of exposureValues) exposureBuckets[x === 0 ? 'CASH_0' : x <= 0.25 ? 'LOW_0_TO_25' : x <= 0.75 ? 'MID_25_TO_75' : x <= 1 ? 'HIGH_75_TO_100' : 'OVER_100']++;
  const inputTrades = Array.isArray(options.trades) ? options.trades : null;
  const netTrades = inputTrades?.filter((t) => finite(t.pnl)) ?? null;
  const winners = netTrades?.filter((t) => t.pnl > 0) ?? [], losers = netTrades?.filter((t) => t.pnl < 0) ?? [];
  const tradeReturns = inputTrades?.map((t) => t.returnPct).filter(finite) ?? [];
  let turnover = null, turnoverCoverage = 'MISSING';
  if (finite(options.turnover)) { turnover = options.turnover; turnoverCoverage = 'COMPLETE_SCALAR'; }
  else if (Array.isArray(options.turnover)) {
    const values = options.turnover.map((x) => finite(x) ? x : x?.dailyTurnover).filter(finite);
    if (values.length === options.turnover.length) { turnover = sum(values); turnoverCoverage = 'COMPLETE_ARRAY'; }
    else turnoverCoverage = 'INCOMPLETE';
  } else if (curve.every((p) => finite(p.dailyTurnover))) { turnover = sum(curve.map((p) => p.dailyTurnover)); turnoverCoverage = 'COMPLETE_CURVE'; }
  const transactionCostValues = inputTrades?.map((t) => t.transactionCosts).filter(finite) ?? [];
  const executionCosts = finite(options.executionCosts) ? options.executionCosts : inputTrades && transactionCostValues.length === inputTrades.length ? sum(transactionCostValues) : null;
  return {
    status: 'READY', errors: [], observations: curve.length, returnObservations: series.returns.length, from: curve[0].date, to: curve.at(-1).date, elapsedDays, initialCapital, finalEquity,
    totalReturn: finalEquity / initialCapital - 1,
    cagr: elapsedDays > 0 ? (finalEquity / initialCapital) ** (365.25 / elapsedDays) - 1 : null,
    maxDrawdown, annualizedVolatility: sd === null ? null : sd * Math.sqrt(252),
    sharpe: sd !== null && sd > 0 && avg !== null ? avg / sd * Math.sqrt(252) : null,
    sharpeRiskFree: 0, annualization: { sessionDays: 252, calendarDaysPerYear: 365.25, standardDeviationDdof: 1 },
    averageExposure: mean(exposureValues), medianExposure: quantile(exposureValues,0.5), exposureCoverage: { valid: exposureValues.length, total: curve.length }, exposureBuckets,
    exposureBreakdown: { lt25: exposureValues.filter(x=>x<0.25).length/exposureValues.length, between25and50: exposureValues.filter(x=>x>=0.25&&x<0.5).length/exposureValues.length, between50and75: exposureValues.filter(x=>x>=0.5&&x<0.75).length/exposureValues.length, between75and100: exposureValues.filter(x=>x>=0.75&&x<=1).length/exposureValues.length, nearFull95: exposureValues.filter(x=>x>=0.95&&x<=1).length/exposureValues.length },
    averageHoldings: mean(holdingValues), medianHoldings: quantile(holdingValues,0.5), maxHoldings: holdingValues.length ? Math.max(...holdingValues) : null,
    turnover, turnoverCoverage, turnoverAnnualized: turnover !== null && elapsedDays > 0 ? turnover * 365.25 / elapsedDays : null,
    trades: inputTrades ? { n: netTrades.length, supplied: inputTrades.length, invalidPnl: inputTrades.length - netTrades.length, pnl: sum(netTrades.map((t) => t.pnl)), winRate: netTrades.length ? winners.length / netTrades.length : null, averageWin: mean(winners.map((t) => t.pnl)), averageLoss: mean(losers.map((t) => t.pnl)), averageReturnPct: mean(tradeReturns), medianReturnPct: quantile(tradeReturns, 0.5), profitFactor: losers.length ? sum(winners.map((t) => t.pnl)) / -sum(losers.map((t) => t.pnl)) : null, entryCapitalBasis: inputTrades.every((t) => finite(t.cost)) ? sum(inputTrades.map((t) => t.cost)) : null, executionCosts, accounting: 'pnl is net supplied by runner; cost is entry capital basis; transactionCosts/executionCosts are reporting only, never subtracted again' } : null,
    executionCosts,
  };
}
function calendarMonthIndex(month) { const [year, m] = month.split('-').map(Number); return year * 12 + m - 1; }
function monthlyHac(values, lags = 5) {
  if (values.length < 2) return { t: null, standardError: null, lags, kernel: 'BARTLETT', smallSampleCorrection: 'n/(n-1)', pairedCalendarLags: true };
  const avg = mean(values.map((v) => v.mean));
  const centered = values.map((v) => ({ month: calendarMonthIndex(v.month), residual: v.mean - avg }));
  let meat = sum(centered.map((v) => v.residual ** 2));
  for (let lag = 1; lag <= lags; lag++) {
    let paired = 0;
    for (let i = 0; i < centered.length; i++) for (let j = 0; j < i; j++) if (centered[i].month - centered[j].month === lag) paired += centered[i].residual * centered[j].residual;
    meat += 2 * (1 - lag / (lags + 1)) * paired;
  }
  const n = values.length;
  const standardError = Math.sqrt(Math.max(0, meat) * n / (n - 1) / (n * n));
  return { t: standardError > 0 ? avg / standardError : null, standardError, lags, kernel: 'BARTLETT', smallSampleCorrection: 'n/(n-1)', pairedCalendarLags: true, interpretation: 'Newey-West SE of equally weighted formation-month means; 5 calendar lags, descriptive robustness only, no multiplicity-adjusted proof' };
}
function monthClusters(signals, horizon, field) {
  const groups = new Map();
  for (const s of signals) {
    const forward = s.forward?.[horizon];
    if (!forward || forward.censored || !finite(forward[field]) || !dateValid(s.date)) continue;
    const month = s.date.slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(forward[field]);
  }
  const values = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, xs]) => ({ month, n: xs.length, mean: mean(xs) }));
  const means = values.map((g) => g.mean), m = mean(means), sd = sampleSd(means);
  return { clusters: values.length, mean: m, sampleStd: sd, t: sd !== null && sd > 0 ? m / (sd / Math.sqrt(means.length)) : null, zeroVariance: sd === 0, hac: monthlyHac(values, 5), values, interpretation: 'DESCRIPTIVE_ONLY: equal-weight formation-month means; overlapping forward windows are not independent' };
}
export function signalMetrics(signals = []) {
  if (!Array.isArray(signals)) return { status: 'UNAVAILABLE', totalSignals: null, horizons: {} };
  const horizons = {};
  for (const h of [21, 63, 126]) {
    const valid = signals.filter((s) => s?.forward?.[h] && !s.forward[h].censored);
    const data = Object.fromEntries(['return', 'excess', 'mfe', 'mae'].map((key) => [key, valid.map((s) => s.forward[h][key]).filter(finite)]));
    const returns = summary(data.return), excess = summary(data.excess), mfe = summary(data.mfe), mae = summary(data.mae);
    const clustered = { returns: monthClusters(signals, h, 'return'), excess: monthClusters(signals, h, 'excess') };
    horizons[h] = { n: returns.n, nExcess: excess.n, censored: signals.filter((s) => s?.forward?.[h]?.censored).length, missing: signals.length - valid.length, returns, excess, mfe, mae, monthCluster: clustered, meanReturn: returns.mean, medianReturn: returns.median, hitRate: returns.hitRate, meanExcess: excess.mean, medianExcess: excess.median, excessHitRate: excess.hitRate, meanMfe: mfe.mean, meanMae: mae.mean, leftTail: returns.leftTail, rightTail: returns.rightTail, excessLeftTail: excess.leftTail, excessRightTail: excess.rightTail, clusterT: clustered.excess.t, descriptiveT: clustered.excess.t, hacT: clustered.excess.hac.t, hacStandardError: clustered.excess.hac.standardError, clusters: clustered.excess.clusters };
  }
  return { status: 'READY', totalSignals: signals.length, horizons, signalBasis: 'SPY_MATCHED_EXCESS', tailQuantileConvention: 'LINEAR_INTERPOLATION_0.05_0.95', censoredPolicy: 'EXCLUDED_SEPARATELY_PER_HORIZON' };
}
export function regimeMetrics(signals = []) {
  if (!Array.isArray(signals)) return { status: 'UNAVAILABLE', segments: [], earlyLate: {} };
  const segments = [];
  for (const [dimension, labels] of [['trend', ['BULL', 'BEAR', 'SIDEWAYS']], ['vol', ['HIGH_VOL', 'LOW_VOL', 'MID_VOL']], ['era', ['EARLY', 'LATE']]]) {
    for (const label of labels) {
      const subset = signals.filter((s) => s.regime?.[dimension] === label);
      segments.push({ dimension, label, ...signalMetrics(subset) });
    }
  }
  return { status: 'READY', segments, earlyLate: Object.fromEntries(segments.filter((s) => s.dimension === 'era').map((s) => [s.label, s.horizons[63]])), unknownRegimeSignals: signals.filter((s) => !['BULL', 'BEAR', 'SIDEWAYS'].includes(s.regime?.trend) || !['HIGH_VOL', 'LOW_VOL', 'MID_VOL'].includes(s.regime?.vol) || !['EARLY', 'LATE'].includes(s.regime?.era)).length, regimeDerivation: 'Labels supplied by lagged-benchmark runner; no recomputation from strategy outcomes' };
}
function correlation(pairs) {
  if (pairs.length < 2) return null;
  const xm = mean(pairs.map((p) => p[0])), ym = mean(pairs.map((p) => p[1]));
  const xx = sum(pairs.map(([x]) => (x - xm) ** 2)), yy = sum(pairs.map(([, y]) => (y - ym) ** 2));
  return xx > 0 && yy > 0 ? sum(pairs.map(([x, y]) => (x - xm) * (y - ym))) / Math.sqrt(xx * yy) : null;
}
function returnsByDate(curve) {
  if (curveIssues(curve).length) return new Map();
  const out = new Map();
  for (let i = 1; i < curve.length; i++) if (curve[i - 1].equity > 0) out.set(curve[i].date, { start: curve[i - 1].date, value: curve[i].equity / curve[i - 1].equity - 1 });
  return out;
}
function signalsSet(signals, month) {
  return new Set((Array.isArray(signals) ? signals : []).filter((s) => typeof s.id === 'string' && dateValid(s.date)).map((s) => `${s.id}\u0000${month ? s.date.slice(0, 7) : s.date}`));
}
function jaccard(a, b) { const intersection = [...a].filter((x) => b.has(x)).length, union = new Set([...a, ...b]).size; return { value: union ? intersection / union : null, intersection, union }; }
export function methodOverlap(rows = []) {
  const pairs = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j], ar = returnsByDate(a.curve), br = returnsByDate(b.curve), matched = [];
    for (const [date, ret] of ar) if (br.has(date) && br.get(date).start === ret.start) matched.push([ret.value, br.get(date).value]);
    const byMonth = jaccard(signalsSet(a.signals, true), signalsSet(b.signals, true)), byDate = jaccard(signalsSet(a.signals, false), signalsSet(b.signals, false));
    pairs.push({ methodA: a.id, methodB: b.id, returnCorrelation: correlation(matched), commonReturnIntervals: matched.length, correlationConvention: 'Common dated start/end return intervals only', jaccardSameIdMonth: byMonth.value, sameIdMonth: byMonth, jaccardSameIdDate: byDate.value, sameIdDate: byDate });
  }
  return pairs;
}
const REQUIRED_WEIGHTS = ['fidelityReproducibility', 'signalEvidence', 'portfolioEvidence', 'robustness', 'riskProfile', 'dataQuality', 'distinctivenessProduct'];
function sufficient(h, protocol) { return h && h.nExcess >= protocol.signals.minSignals && h.clusters >= protocol.signals.minClusters; }
export function rankEvidence(row, benchmarkMetrics, protocol) {
  const weights = protocol?.scoreWeights;
  if (!weights || REQUIRED_WEIGHTS.some((k) => !finite(weights[k]) || weights[k] < 0) || Math.abs(sum(REQUIRED_WEIGHTS.map((k) => weights[k])) - 1) > 1e-10 || !finite(protocol?.signals?.minSignals) || !finite(protocol?.signals?.minClusters)) throw new Error('Frozen complete protocol weights and signal gates required.');
  const components = Object.fromEntries(REQUIRED_WEIGHTS.map((k) => [k, null])), reasons = [];
  const h = row.signalMetrics?.horizons?.[63], p = row.portfolioMetrics, b = benchmarkMetrics;
  const adequateSignal = sufficient(h, protocol), positiveSignal = adequateSignal && h.meanExcess > 0 && h.medianExcess > 0;
  const negativeSignal = adequateSignal && h.meanExcess < 0 && h.medianExcess < 0;
  if (row.fidelityCategory === 'SYSTEMATIC') components.fidelityReproducibility = 75;
  else if (row.fidelityCategory === 'LEGENDARY') components.fidelityReproducibility = 45;
  if (h) components.signalEvidence = !adequateSignal ? 0 : positiveSignal && finite(h.hacT) && h.hacT >= 2 ? 100 : positiveSignal ? 65 : negativeSignal ? 15 : 40;
  let portfolioClassification = 'UNAVAILABLE', riskClassification = 'UNAVAILABLE';
  const portfolioDelta = finite(p?.cagr) && finite(b?.cagr) ? p.cagr - b.cagr : null;
  if (portfolioDelta !== null) {
    if (portfolioDelta > 0.01 + 1e-12) { portfolioClassification = 'ABOVE'; if (finite(p.sharpe) && finite(b.sharpe)) components.portfolioEvidence = p.sharpe > b.sharpe ? 100 : 75; }
    else if (portfolioDelta >= -0.01 - 1e-12) { portfolioClassification = 'SIMILAR'; components.portfolioEvidence = 50; }
    else { portfolioClassification = 'BELOW'; components.portfolioEvidence = 20; }
  }
  const ddDelta = finite(p?.maxDrawdown) && finite(b?.maxDrawdown) ? p.maxDrawdown - b.maxDrawdown : null;
  if (ddDelta !== null) {
    if (ddDelta >= 0.05 - 1e-12) { riskClassification = 'SHALLOWER'; if (finite(p.sharpe) && finite(b.sharpe)) components.riskProfile = p.sharpe >= b.sharpe ? 100 : 70; }
    else if (ddDelta > -0.05 + 1e-12) { riskClassification = 'SIMILAR'; components.riskProfile = 50; }
    else { riskClassification = 'DEEPER'; components.riskProfile = 20; }
  }
  const segments = row.regimeMetrics?.segments;
  const sufficientSegments = Array.isArray(segments) ? segments.filter((s) => sufficient(s.horizons?.[63], protocol)) : null;
  if (sufficientSegments?.length) components.robustness = 100 * sufficientSegments.filter((s) => s.horizons[63].meanExcess > 0).length / sufficientSegments.length;
  const quality = row.dataQuality;
  if (quality?.missingRequiredPitFundamentals === true) components.dataQuality = 0;
  else if (quality?.missingRequiredPitFundamentals === false && quality.pitListings === true && quality.canonicalPrices === true && typeof quality.terminalScenarioUncertainty === 'boolean') components.dataQuality = 65;
  if (finite(row.distinctivenessProductScore) && row.distinctivenessProductScore >= 0 && row.distinctivenessProductScore <= 100) components.distinctivenessProduct = row.distinctivenessProductScore;
  const missing = REQUIRED_WEIGHTS.filter((k) => components[k] === null);
  const weightedComponents = Object.fromEntries(REQUIRED_WEIGHTS.map((k) => [k, components[k] === null ? null : components[k] * weights[k]]));
  const score = missing.length ? null : sum(Object.values(weightedComponents));
  const early = row.regimeMetrics?.earlyLate?.EARLY, late = row.regimeMetrics?.earlyLate?.LATE;
  const earlyLatePositive = sufficient(early, protocol) && sufficient(late, protocol) && early.meanExcess > 0 && late.meanExcess > 0;
  const confidence = row.fidelityCategory === 'LEGENDARY' || components.dataQuality === null || components.dataQuality === 0 || !adequateSignal ? 'LOW' : 'MEDIUM';
  if (row.fidelityCategory === 'LEGENDARY') reasons.push('Legendary discretionary formalizations are capped at LOW confidence and Tier C.');
  else reasons.push('Confidence capped at MEDIUM: historical PIT membership/terminal outcome uncertainty; no unseen holdout claim.');
  if (missing.length) reasons.push(`Missing rubric components: ${missing.join(', ')}; total score unavailable, weights never redistributed.`);
  const gates = { scoreA: score !== null && score >= 75, confidenceAtLeastMedium: confidence === 'MEDIUM', positiveSignal, signalHacPass: positiveSignal && finite(h.hacT) && h.hacT >= 2, portfolioAbove: portfolioClassification === 'ABOVE', earlyLatePositive: Boolean(earlyLatePositive), terminalSensitivity: row.sensitivities?.terminalPass === true, costSensitivity: row.sensitivities?.costPass === true, adversarialReview: row.adversarialReviewPass === true };
  let tier = row.executable === false ? 'D' : 'C';
  const riskSpecialist = row.riskSpecialist === true && row.comparisonsAdequate === true && riskClassification === 'SHALLOWER' && finite(components.riskProfile) && components.riskProfile >= 70 && adequateSignal;
  if (tier !== 'D' && confidence === 'MEDIUM' && score !== null) {
    if (Object.values(gates).every(Boolean)) tier = 'A';
    else if ((score >= 55 && !negativeSignal && portfolioClassification !== 'BELOW' && portfolioClassification !== 'UNAVAILABLE') || riskSpecialist) tier = 'B';
  }
  return { tier, score, components, weights: { ...weights }, weightedComponents, missingComponents: missing, confidence, confidenceReasons: reasons, signalBasis: 'SPY_MATCHED_EXCESS', signalInference: 'DESCRIPTIVE_EDGE_HYPOTHESIS_NOT_PROVEN_ALPHA', multipleComparisonUncertainty: 'Many methods, overlapping horizons and regimes; HAC is not a multiplicity correction or an unseen holdout.', signalClassification: !adequateSignal ? 'INSUFFICIENT' : positiveSignal ? 'POSITIVE' : negativeSignal ? 'NEGATIVE' : 'NEUTRAL', portfolioClassification, riskClassification, portfolioCagrDelta: portfolioDelta, drawdownDelta: ddDelta, sufficientlyPopulatedSegments: sufficientSegments?.length ?? null, earlyLatePositive: Boolean(earlyLatePositive), gates, thresholds: { portfolioSimilarCagr: 0.01, riskSimilarDrawdown: 0.05 }, noMissingDataImputation: true, historyLabel: protocol.historyLabel };
}
