/**
 * Supertrader 6.0 – split-consistent EPS evidence for Minervini SEPA (MIN-SF-FUNDAMENTALS, evidence only, never a gate).
 *
 * Defect of the 4.0 evidence (research/minervini-components.mjs#fundamentalEvidence, unchanged and pinned): each quarter
 * keeps its FIRST-FILED value (sec-pit), so a year-ago EPS filed before a stock split is in pre-split units and the
 * current EPS filed after it in post-split units. Across a 2:1 split the year-over-year growth reads about -50 %; across
 * a 1:10 reverse split about +900 %. Revenue is not affected.
 *
 * Correction (point in time): the cumulative split factor between the two FILING dates is
 *   f = splitAdj(filed_prev) / splitAdj(filed_cur),   splitAdj(t) = raw close / split-adjusted close at t
 * (runner/snapshot-input.mjs). splitAdj carries every split after t to the data end; the ratio of two dates cancels all
 * splits after the later date, so f contains only splits between the two filings, both strictly before the decision.
 * The year-ago EPS is divided by f. A filing date without a bar uses the last bar at or before it; no bar before it
 * leaves the quarter uncorrected and flagged.
 */
import { fundamentalEvidence, COMPONENT_CONVENTIONS } from './minervini-components.mjs';

export const MIN_FUNDAMENTALS_SF6_VERSION = 'sf6-minervini-fundamentals-split-consistent-1.0.0';
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;

/** Filing date of the year-ago quarter that minervini-components#yoySeries pairs with quarter end q (same selection). */
function priorYearFiled(rows, quarterEnd, asOfDate) {
  const vis = (rows || []).filter((r) => r[2] && r[2] < asOfDate && fin(r[1])).sort((a, b) => a[0].localeCompare(b[0]));
  const k = vis.findIndex((r) => r[0] === quarterEnd);
  if (k < 0) return null;
  const prev = vis.slice(0, k).reverse().find((p) => { const d = days(p[0], quarterEnd); return d >= COMPONENT_CONVENTIONS.yoyMinDays && d <= COMPONENT_CONVENTIONS.yoyMaxDays; });
  return prev ? prev[2] : null;
}

/** splitAdj at the last bar on or before date (null when none). Binary search on ascending bars. */
export function splitAdjAt(bars, date) {
  let lo = 0, hi = bars.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (bars[m].date <= date) { k = m; lo = m + 1; } else hi = m - 1; }
  if (k < 0) return null;
  const s = bars[k].splitAdj;
  return fin(s) && s > 0 ? s : null; // a missing factor is undeterminable, never 'no split' (review)
}

/** Split factor between two filing dates (a <= b); 1 = no split in between; null = not determinable. */
export function splitFactorBetween(bars, a, b) {
  const sa = splitAdjAt(bars, a), sb = splitAdjAt(bars, b);
  return sa === null || sb === null ? null : sa / sb;
}

/**
 * The 4.0 evidence with split-consistent EPS growth. Returns the unchanged 4.0 result plus `epsSplitConsistent`
 * ({ quarters, latestYoy, accelerating, correctedQuarters }) and the comparison flags.
 */
export function fundamentalEvidenceSf6(fund, asOfDate, bars) {
  const v1 = fundamentalEvidence(fund, asOfDate);
  if (v1.status !== 'EVIDENCE_ONLY') return { ...v1, version: MIN_FUNDAMENTALS_SF6_VERSION, epsSplitConsistent: null };
  let corrected = 0, undeterminable = 0;
  const quarters = v1.eps.quarters.map((q) => {
    if (!fin(q.priorYearValue)) return { ...q };
    // a derived Q4 (FY - Q1..Q3) can mix pre- and post-split units inside one value: not correctable, flagged
    if (q.derivedQ4) { undeterminable++; return { ...q, splitFactor: null, splitStatus: 'UNDETERMINABLE_DERIVED_Q4' }; }
    const prevFiled = priorYearFiled(fund.eps, q.quarterEnd, asOfDate);
    const f = prevFiled ? splitFactorBetween(bars, prevFiled, q.filed) : null;
    if (f === null) { undeterminable++; return { ...q, splitFactor: null, splitStatus: 'UNDETERMINABLE' }; }
    if (Math.abs(f - 1) < 1e-9) return { ...q, splitFactor: 1, splitStatus: 'NO_SPLIT' };
    corrected++;
    const base = q.priorYearValue / f;
    return { ...q, splitFactor: f, priorYearValueSplitConsistent: base, yoy: base > 0 ? q.value / base - 1 : null, status: base > 0 ? 'OK_SPLIT_CONSISTENT' : 'NEGATIVE_OR_ZERO_BASE', splitStatus: 'CORRECTED' };
  });
  const accel = (s) => (s.length >= 2 && fin(s[0].yoy) && fin(s[1].yoy) ? s[0].yoy > s[1].yoy : null);
  const eps = { quarters, latestYoy: quarters[0]?.yoy ?? null, accelerating: accel(quarters), correctedQuarters: corrected, undeterminableQuarters: undeterminable };
  return { ...v1, version: MIN_FUNDAMENTALS_SF6_VERSION, epsSplitConsistent: eps, changedVsV1: { latestYoy: eps.latestYoy !== v1.eps.latestYoy, accelerating: eps.accelerating !== v1.eps.accelerating } };
}
