'use strict';
// V11 WINNERS – pure, outcome-free and outcome-side building blocks (no I/O).
// Features read closes up to bar k only; forward returns read bars after k only.

const finite = v => typeof v === 'number' && Number.isFinite(v);
const HORIZONS = Object.freeze({ '1Y': 52, '3Y': 156, '5Y': 260 });
const BLOCK_QUARTERS = Object.freeze({ '1Y': 4, '3Y': 12, '5Y': 20 });
const SUBPERIODS = [['2000-01-01', '2007-12-31'], ['2008-01-01', '2012-12-31'], ['2013-01-01', '2019-12-31'], ['2020-01-01', '2025-12-31']];

/** Last calendar date of March/June/September/December for each year in [y0, y1]. */
function cohortDates(calendar, y0 = 2001, y1 = 2024) {
  const last = new Map();
  for (const d of calendar) { const y = +d.slice(0, 4), m = d.slice(5, 7); if (y >= y0 && y <= y1 && ['03', '06', '09', '12'].includes(m)) last.set(d.slice(0, 7), d); }
  return [...last.values()].sort();
}

/** Price features at bar k (closes: array, spyAt(k): SPY close on the date of bar k or null). */
function priceFeatures(closes, k, spyAt) {
  const c = j => (j >= 0 && finite(closes[j]) && closes[j] > 0 ? closes[j] : null);
  const out = {};
  const c0 = c(k);
  if (!c0) return out;
  if (c(k - 13)) out.mom3m = c0 / c(k - 13) - 1;
  if (c(k - 26)) out.mom6m = c0 / c(k - 26) - 1;
  if (c(k - 4) && c(k - 52)) {
    out.mom12_1m = c(k - 4) / c(k - 52) - 1;
    const s4 = spyAt(k - 4), s52 = spyAt(k - 52);
    if (finite(s4) && finite(s52) && s4 > 0 && s52 > 0) out.rsSpy12_1m = Math.log(c(k - 4) / c(k - 52)) - Math.log(s4 / s52);
  }
  if (k >= 51) {
    let hi = 0, ok = true; for (let j = k - 51; j <= k; j++) { if (!c(j)) { ok = false; break; } hi = Math.max(hi, closes[j]); }
    if (ok) out.near52wHigh = c0 / hi;
    // log-trend regression over 52 bars
    if (ok) {
      let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0; const n = 52;
      for (let j = 0; j < n; j++) { const y = Math.log(closes[k - 51 + j]); sx += j; sy += y; sxx += j * j; sxy += j * y; syy += y * y; }
      const vx = sxx - sx * sx / n, vy = syy - sy * sy / n, cxy = sxy - sx * sy / n;
      if (vx > 0) { out.trendSlope52w = cxy / vx * 52; out.trendR2_52w = vy > 0 ? (cxy * cxy) / (vx * vy) : 0; }
      // volatility of weekly log returns t-51..t
      const r = []; if (c(k - 52)) for (let j = k - 51; j <= k; j++) r.push(Math.log(closes[j] / closes[j - 1]));
      if (r.length === 52) { const m = r.reduce((a, b) => a + b, 0) / r.length; out.vol52w = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(52); }
    }
  }
  if (k >= 52 && c(k - 52)) { let peak = 0, dd = 0; for (let j = k - 52; j <= k; j++) { if (!c(j)) continue; peak = Math.max(peak, closes[j]); dd = Math.min(dd, closes[j] / peak - 1); } out.drawdown52w = -dd; }
  if (k >= 90) {
    let above = 0, ok = true;
    for (let j = k - 51; j <= k; j++) {
      let s = 0; for (let q = j - 39; q <= j; q++) { if (!c(q)) { ok = false; break; } s += closes[q]; }
      if (!ok) break; if (closes[j] > s / 40) above++;
    }
    if (ok) out.shareAbove40w = above / 52;
  }
  return out;
}

/**
 * Forward outcome of a member at bar k for horizon h.
 * p: {closes, cal (calendar indices), lifecycle}; calLast: last frame calendar index.
 * Returns {state, primary, minus100, terminalKind} ; state in OBSERVED | TERMINAL_CONSIDERATION | DELISTED_NO_CONSIDERATION | CENSORED | NO_ENTRY_BAR | GAP | IMMATURE
 */
function forwardOutcome(p, k, h, calLast) {
  const n = p.closes.length, e = k + 1, x = k + 1 + h;
  if (p.cal[k] + 1 + h > calLast) return { state: 'IMMATURE' };
  if (e >= n || p.cal[e] !== p.cal[k] + 1) return { state: 'NO_ENTRY_BAR' };
  const entry = p.closes[e];
  if (x < n) {
    if (p.cal[x] - p.cal[k] !== 1 + h) return { state: 'GAP' };
    const r = p.closes[x] / entry - 1; return { state: 'OBSERVED', primary: r, minus100: r };
  }
  // series ends before the scheduled exit
  const lc = p.lifecycle, t = lc && lc.terminal ? lc.terminal : null;
  if (t && t.kind === 'CASH_MERGER' && finite(t.cashPerShare) && t.cashPerShare > 0) { const r = t.cashPerShare / entry - 1; return { state: 'TERMINAL_CONSIDERATION', primary: r, minus100: r, terminalKind: t.kind }; }
  if (t && t.kind === 'DELISTED_NO_CONSIDERATION') return { state: 'DELISTED_NO_CONSIDERATION', primary: -1, minus100: -1, terminalKind: t.kind };
  const last = p.closes[n - 1] / entry - 1;
  return { state: 'CENSORED', primary: last, minus100: -1, terminalKind: t ? t.kind : 'NO_LIFECYCLE_RECORD', lifecycleStatus: lc ? lc.status : null };
}

/** Mid-rank percentiles in (0,1] of values (null kept null). direction 'lower' ranks the negated value. */
function percentiles(values, direction = 'higher') {
  const idx = []; values.forEach((v, i) => { if (finite(v)) idx.push(i); });
  const out = values.map(() => null), n = idx.length; if (!n) return out;
  const sgn = direction === 'lower' ? -1 : 1;
  idx.sort((a, b) => sgn * values[a] - sgn * values[b]);
  for (let i = 0; i < n;) {
    let j = i; while (j + 1 < n && values[idx[j + 1]] === values[idx[i]]) j++;
    const mid = (i + j) / 2 + 1; for (let q = i; q <= j; q++) out[idx[q]] = (mid - 0.5) / n;
    i = j + 1;
  }
  return out;
}

/** Classes for one (cohort, horizon) from returns (finite) and terminal flags. */
function assignClasses(rets, delistedNoConsideration = []) {
  const n = rets.length, desc = [...rets].sort((a, b) => b - a), asc = [...desc].reverse();
  const thr = q => desc[Math.max(0, Math.ceil(q * n) - 1)];
  const t1 = thr(0.01), t5 = thr(0.05), tL = asc[Math.max(0, Math.ceil(0.10 * n) - 1)];
  const pct = percentiles(rets, 'higher');
  return rets.map((r, i) => ({ top1: r >= t1, top5: r >= t5, loser: r <= tL || !!delistedNoConsideration[i], average: pct[i] > 0.2 && pct[i] <= 0.8, pct: pct[i] }));
}

/** Rank AUC (Mann-Whitney) of score for positives vs negatives; null if a side is empty. */
function rankAuc(scores, labels) {
  const idx = []; scores.forEach((s, i) => { if (finite(s)) idx.push(i); });
  const ranks = percentiles(idx.map(i => scores[i]), 'higher').map(p => p * idx.length + 0.5); // mid-ranks 1..n
  let np = 0, sum = 0; idx.forEach((i, j) => { if (labels[i]) { np++; sum += ranks[j]; } });
  const nn = idx.length - np; if (!np || !nn) return null;
  return (sum - np * (np + 1) / 2) / (np * nn);
}

/** 2x2 counts for "feature in top (or bottom) quintile" vs label. pcts: percentile per member (null = missing). */
function quintileCounts(pcts, labels, side = 'top') {
  let n = 0, pos = 0, sel = 0, selPos = 0;
  pcts.forEach((p, i) => { if (!finite(p)) return; n++; const s = side === 'top' ? p > 0.8 : p <= 0.2; if (labels[i]) pos++; if (s) { sel++; if (labels[i]) selPos++; } });
  return { n, pos, sel, selPos };
}
function liftFrom(c) {
  const base = c.n ? c.pos / c.n : null, precision = c.sel ? c.selPos / c.sel : null;
  return { n: c.n, positives: c.pos, selected: c.sel, selectedPositives: c.selPos, baseRate: base, precision,
    lift: base && precision !== null ? precision / base : null, recall: c.pos ? c.selPos / c.pos : null,
    falsePositiveShare: c.sel ? (c.sel - c.selPos) / c.sel : null, fpr: c.n - c.pos ? (c.sel - c.selPos) / (c.n - c.pos) : null };
}
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function subperiodOf(d) { const s = SUBPERIODS.find(([a, b]) => d >= a && d <= b); return s ? s[0].slice(0, 4) + '-' + s[1].slice(0, 4) : null; }
function ratePhase(change) { if (!finite(change)) return 'RATE_UNAVAILABLE'; return change >= 0.5 ? 'RISING' : change <= -0.5 ? 'FALLING' : 'FLAT'; }

module.exports = { finite, HORIZONS, BLOCK_QUARTERS, SUBPERIODS, cohortDates, priceFeatures, forwardOutcome, percentiles, assignClasses, rankAuc, quintileCounts, liftFrom, mean, median, subperiodOf, ratePhase };
