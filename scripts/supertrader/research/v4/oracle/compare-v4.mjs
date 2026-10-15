/**
 * V4 oracle comparison: VU construction series against an external reference series.
 * Tolerances are registered here before any V4 measurement and are part of the V4 freeze; they are never
 * widened after results (V4 calibration spec, rule NO_POST_RESULT_TOLERANCE_CHANGE).
 */
export const ORACLE_TOLERANCES_V4 = Object.freeze({
  schema: 'supertrader-v4-oracle-tolerances-1.0.0',
  registeredBeforeV4Measurement: true,
  minimumValidMonthShare: 0.95,
  correlation: { market: 0.95, bucket: 0.9, spread: 0.6 },
  meanDifference: { floor: 0.0025, standardErrors: 2, note: 'floor = frozen V3 protocol monthly default; 2 SE of the monthly difference series covers sampling noise of a matched-universe approximation' },
  volatilityRelative: 0.25,
  maxDrawdownAbsolute: 0.05,
  directionFloor: 0.0025,
  holdingCount: 'INFORMATIONAL_UNIVERSE_DIFFERS',
  turnover: 'UNAVAILABLE_FROM_ORACLE_VU_INFORMATIONAL',
  exposure: 'STRUCTURAL_FULLY_INVESTED_BOTH_SIDES',
  rebalanceDates: 'MONTH_END_BOTH_SIDES_EXACT',
});

const mean = (x) => x.reduce((a, b) => a + b, 0) / x.length;
const sd = (x) => { const m = mean(x); return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1)); };
export function correlation(a, b) {
  const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
}
export function maxDrawdown(returns) { let w = 1, peak = 1, dd = 0; for (const r of returns) { w *= 1 + r; peak = Math.max(peak, w); dd = Math.min(dd, w / peak - 1); } return dd; }
export function annualized(returns) { const g = returns.reduce((w, r) => w * (1 + r), 1); return g ** (12 / returns.length) - 1; }
const direction = (x, floor) => (Math.abs(x) < floor ? 'FLAT' : x > 0 ? 'POSITIVE' : 'NEGATIVE');

/** Statistics of one aligned pair. `kind`: market | bucket | spread. */
export function compareSeries(vu, ref, { kind, tol = ORACLE_TOLERANCES_V4, windowMonths }) {
  const months = [...ref.keys()].filter((m) => Number.isFinite(ref.get(m)) && Number.isFinite(vu.get(m))).sort();
  const total = windowMonths ?? new Set([...vu.keys(), ...ref.keys()]).size;
  const coverage = total ? months.length / total : 0;
  const base = { kind, validMonths: months.length, windowMonths: total, coverage };
  if (coverage < tol.minimumValidMonthShare || months.length < 24) return { ...base, verdict: 'INSUFFICIENT_REFERENCE_DATA', checks: [] };
  const a = months.map((m) => vu.get(m)), b = months.map((m) => ref.get(m)), d = a.map((x, i) => x - b[i]);
  const stats = {
    correlation: correlation(a, b), meanVu: mean(a), meanRef: mean(b), meanDiff: mean(d), diffStdErr: sd(d) / Math.sqrt(d.length),
    annualizedVu: annualized(a), annualizedRef: annualized(b), volVu: sd(a) * Math.sqrt(12), volRef: sd(b) * Math.sqrt(12),
    maxDrawdownVu: maxDrawdown(a), maxDrawdownRef: maxDrawdown(b),
  };
  stats.directionVu = direction(stats.meanVu, tol.directionFloor); stats.directionRef = direction(stats.meanRef, tol.directionFloor);
  const meanTol = Math.max(tol.meanDifference.floor, tol.meanDifference.standardErrors * stats.diffStdErr);
  const checks = [
    { id: 'CORRELATION', hard: true, pass: stats.correlation >= tol.correlation[kind], value: stats.correlation, threshold: tol.correlation[kind] },
    { id: 'MEAN_DIFFERENCE', hard: true, pass: Math.abs(stats.meanDiff) <= meanTol, value: stats.meanDiff, threshold: meanTol },
    { id: 'VOLATILITY_RELATIVE', hard: kind !== 'spread', pass: Math.abs(stats.volVu / stats.volRef - 1) <= tol.volatilityRelative, value: stats.volVu / stats.volRef - 1, threshold: tol.volatilityRelative },
    { id: 'MAX_DRAWDOWN', hard: kind !== 'spread', pass: Math.abs(stats.maxDrawdownVu - stats.maxDrawdownRef) <= tol.maxDrawdownAbsolute, value: stats.maxDrawdownVu - stats.maxDrawdownRef, threshold: tol.maxDrawdownAbsolute },
    { id: 'DIRECTION', hard: stats.directionRef !== 'FLAT', pass: stats.directionRef === 'FLAT' || stats.directionVu === stats.directionRef, value: stats.directionVu, threshold: stats.directionRef },
  ];
  const failed = checks.filter((c) => c.hard && !c.pass).map((c) => c.id);
  return { ...base, stats, checks, failedHardChecks: failed, verdict: failed.length ? 'FAIL' : 'PASS' };
}

const toMap = (rows, f) => new Map(rows.map((r) => [r.month, f(r)]));

/** EW market oracle comparison. */
export function compareEwMarket(vuMonths, oracle) {
  const vu = toMap(vuMonths, (m) => m.EW_MARKET.ret), ref = toMap(oracle, (r) => r.ret);
  const result = compareSeries(vu, ref, { kind: 'market', windowMonths: oracle.length });
  const counts = vuMonths.map((m) => { const o = oracle.find((r) => r.month === m.month); return o?.firms ? m.EW_MARKET.count / o.firms : null; }).filter(Number.isFinite);
  return { oracleId: 'FRENCH_ME_EW_MARKET', ...result, informational: { holdingCountRatioMean: counts.length ? mean(counts) : null, holdingCountRatioMin: counts.length ? Math.min(...counts) : null, holdingCountRatioMax: counts.length ? Math.max(...counts) : null } };
}

/** Sorted-portfolio oracle comparison: every bucket, low/high legs and the high-minus-low spread. */
export function compareBuckets(vuMonths, oracle, key, oracleId) {
  const nb = oracle[0]?.buckets.length ?? 0;
  const ready = vuMonths.filter((m) => m[key]?.status === 'READY');
  const bucketResults = [];
  for (let k = 0; k < nb; k++) bucketResults.push(compareSeries(toMap(ready, (m) => m[key].buckets[k]), toMap(oracle, (r) => r.buckets[k]), { kind: 'bucket', windowMonths: oracle.length }));
  const spreadOf = (b) => (Number.isFinite(b[nb - 1]) && Number.isFinite(b[0]) ? b[nb - 1] - b[0] : null);
  const spread = compareSeries(toMap(ready, (m) => spreadOf(m[key].buckets)), toMap(oracle, (r) => spreadOf(r.buckets)), { kind: 'spread', windowMonths: oracle.length });
  const legs = [bucketResults[0], bucketResults[nb - 1]];
  const hardFailures = [...legs.flatMap((l, i) => (l.verdict === 'PASS' ? [] : [`${i ? 'HIGH' : 'LOW'}_LEG_${l.verdict}`])), ...(spread.verdict === 'PASS' ? [] : ['SPREAD_' + spread.verdict])];
  const median = (x) => { const s = x.filter(Number.isFinite).sort((p, q) => p - q); return s.length ? s[(s.length - 1) >> 1] : null; };
  const insufficient = [...legs, spread].some((x) => x.verdict === 'INSUFFICIENT_REFERENCE_DATA');
  const countRatios = ready.map((m) => { const o = oracle.find((r) => r.month === m.month); return o ? m[key].counts.reduce((a, b) => a + b, 0) / o.firms.reduce((a, b) => a + (b ?? 0), 0) : null; }).filter(Number.isFinite);
  return {
    oracleId, key, buckets: bucketResults, spread, medianBucketCorrelation: median(bucketResults.map((b) => b.stats?.correlation)),
    hardFailures, verdict: insufficient ? 'INSUFFICIENT_REFERENCE_DATA' : hardFailures.length ? 'FAIL' : 'PASS',
    blockedFormations: vuMonths.length - ready.length,
    informational: { holdingCountRatioMean: countRatios.length ? mean(countRatios) : null },
  };
}

/** Internal exact reconciliation: close-execution book vs arithmetic construction (two code paths). */
export const INTERNAL_RECONCILIATION_TOLERANCE_V4 = Object.freeze({ perMonthAbsolute: 5e-4, requiredMonthShare: 0.99, meanAbsolute: 1e-4,
  reason: 'book credits dividends as cash while the TR index reinvests them on the ex-date; the difference is second order (yield x intra-month return)' });
export function compareInternal(bookMonthly, arithmetic, tol = INTERNAL_RECONCILIATION_TOLERANCE_V4) {
  const months = [...arithmetic.keys()].filter((m) => Number.isFinite(arithmetic.get(m)) && Number.isFinite(bookMonthly.get(m)));
  const diffs = months.map((m) => Math.abs(bookMonthly.get(m) - arithmetic.get(m)));
  const within = diffs.filter((d) => d <= tol.perMonthAbsolute).length;
  const share = months.length ? within / months.length : 0, meanAbs = diffs.length ? mean(diffs) : Infinity;
  return { months: months.length, withinShare: share, meanAbsoluteDifference: meanAbs, maxAbsoluteDifference: diffs.length ? Math.max(...diffs) : null,
    verdict: months.length >= 24 && share >= tol.requiredMonthShare && meanAbs <= tol.meanAbsolute ? 'PASS' : 'FAIL' };
}
