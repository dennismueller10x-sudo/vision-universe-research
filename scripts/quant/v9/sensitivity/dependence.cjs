'use strict';
// V9 sensitivity workstream: pure dependence/stationarity/bootstrap diagnostics for a
// calendar-aggregated event-return series. Research mechanics only; no certification,
// no product data writes. Every function is deterministic and side-effect free.
//
// Series convention (matches research-validation.cjs inferTemporalBlockMean):
//   calendar dates t = 0..T-1 (zero-event dates included), S_t = sum of event values on t,
//   N_t = event count on t, theta = sum S / sum N (pooled event mean),
//   z_t = S_t - theta * N_t (linearised influence series of the ratio estimator;
//   Var(theta) ~= T * LRV(z) / (sum N)^2). Zero-event dates have z_t = 0.

const VERSION = 'v9-sensitivity-dependence-1.0.0';
const TWO32 = 4294967296;

function check(ok, message) { if (!ok) throw new Error(message); }

function xorshift(state) {
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0;
}

function aggregate(calendar, rows) {
  check(Array.isArray(calendar) && calendar.length >= 2 && Array.isArray(rows) && rows.length > 0, 'AGGREGATE_INPUT');
  const index = new Map(calendar.map((d, i) => [d, i]));
  const T = calendar.length, sums = new Array(T).fill(0), counts = new Array(T).fill(0);
  let total = 0;
  for (const r of rows) {
    const k = index.get(r.date); check(k !== undefined, 'OBSERVATION_NOT_ON_CALENDAR');
    check(Number.isFinite(r.value), 'INVALID_OBSERVATION');
    sums[k] += r.value; counts[k]++; total += r.value;
  }
  // Same summation order as the engine for the point estimate (sum of date sums).
  const estimate = sums.reduce((a, b) => a + b, 0) / rows.length;
  const z = sums.map((s, i) => s - estimate * counts[i]);
  return { T, n: rows.length, estimate, sums, counts, z, occupiedDates: counts.filter(Boolean).length };
}

function mean(x) { let s = 0; for (const v of x) s += v; return s / x.length; }

function autocovariances(x, maxLag) {
  const T = x.length, m = mean(x), e = x.map(v => v - m), out = [];
  for (let k = 0; k <= maxLag; k++) {
    let s = 0; for (let t = k; t < T; t++) s += e[t] * e[t - k];
    out.push(s / T);
  }
  return out;
}

function acf(x, maxLag) {
  const g = autocovariances(x, maxLag);
  return g.map(v => g[0] > 0 ? v / g[0] : 0);
}

// Regularised upper incomplete gamma Q(a, x) (series / Lentz continued fraction).
function lnGamma(z) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z, y = z, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015; for (const v of c) ser += v / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function gammaQ(a, x) {
  check(a > 0 && x >= 0, 'GAMMA_DOMAIN');
  if (x === 0) return 1;
  const gln = lnGamma(a);
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 10000; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
    return Math.max(0, 1 - sum * Math.exp(-x + a * Math.log(x) - gln));
  }
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.min(1, Math.exp(-x + a * Math.log(x) - gln) * h);
}
function chi2Sf(x, df) { return gammaQ(df / 2, x / 2); }

function ljungBox(rho, T, m) {
  check(Number.isInteger(m) && m >= 1 && m < rho.length && m < T, 'LJUNG_BOX_LAG');
  let q = 0; for (let k = 1; k <= m; k++) q += rho[k] * rho[k] / (T - k);
  q *= T * (T + 2);
  return { lags: m, q, pValue: chi2Sf(q, m) };
}

// Bartlett (Newey-West) long-run variance; weights 1 - k/(bw+1), bw = 0 -> variance.
function bartlettLrv(x, bw) {
  check(Number.isInteger(bw) && bw >= 0 && bw < x.length, 'LRV_BANDWIDTH');
  const g = autocovariances(x, bw);
  let v = g[0]; for (let k = 1; k <= bw; k++) v += 2 * (1 - k / (bw + 1)) * g[k];
  return v;
}
const bandwidthRules = {
  newey_west_1994: T => Math.floor(4 * Math.pow(T / 100, 2 / 9)),
  schwert_l4: T => Math.floor(4 * Math.pow(T / 100, 1 / 4)),
  schwert_l12: T => Math.floor(12 * Math.pow(T / 100, 1 / 4))
};
// Andrews (1991) AR(1) plug-in for the Bartlett kernel; bandwidth S = 1.1447 (alpha T)^(1/3),
// returned as integer lag floor(S) in the 1 - k/(bw+1) convention (documented approximation).
function andrewsAr1Bandwidth(x) {
  const T = x.length, m = mean(x), e = x.map(v => v - m);
  let num = 0, den = 0; for (let t = 1; t < T; t++) { num += e[t] * e[t - 1]; den += e[t - 1] * e[t - 1]; }
  const rho = den > 0 ? num / den : 0, r = Math.max(-0.97, Math.min(0.97, rho));
  const alpha = 4 * r * r / ((1 - r) ** 2 * (1 + r) ** 2);
  return { rho, bandwidth: Math.min(T - 1, Math.floor(1.1447 * Math.pow(alpha * T, 1 / 3))) };
}

// Politis & White (2004) with the Patton, Politis & White (2009) correction.
// m-hat: smallest m with |rho(m+k)| < c*sqrt(log10 T / T) for k = 1..K_T, c = 2,
// K_T = max(5, ceil(sqrt(log10 T))); M = 2*max(m-hat, 1) capped at ceil(sqrt(T)) + K_T;
// flat-top window lambda(s) = 1 (|s|<=1/2), 2(1-|s|) (1/2<|s|<=1).
// b_SB = (2 G^2 / D_SB)^(1/3) T^(1/3), D_SB = 2 g0^2; b_CB uses D_CB = (4/3) g0^2.
// Both capped at bMax = ceil(min(3 sqrt(T), T/3)).
function politisWhite(x) {
  const T = x.length; check(T >= 10, 'PW_SERIES_TOO_SHORT');
  const K = Math.max(5, Math.ceil(Math.sqrt(Math.log10(T))));
  const mMax = Math.ceil(Math.sqrt(T)) + K, threshold = 2 * Math.sqrt(Math.log10(T) / T);
  const rho = acf(x, Math.min(T - 1, mMax + K));
  let mhat = null;
  for (let m = 0; m + K < rho.length; m++) {
    let ok = true; for (let k = 1; k <= K; k++) if (!(Math.abs(rho[m + k]) < threshold)) { ok = false; break; }
    if (ok) { mhat = m; break; }
  }
  const M = Math.min(mhat === null ? mMax : 2 * Math.max(mhat, 1), mMax);
  const g = autocovariances(x, M);
  let G = 0, g0 = g[0];
  for (let k = 1; k <= M; k++) {
    const s = k / M, lam = s <= 0.5 ? 1 : 2 * (1 - s);
    G += 2 * lam * k * g[k]; g0 += 2 * lam * g[k];
  }
  const bMax = Math.ceil(Math.min(3 * Math.sqrt(T), T / 3));
  const raw = d => d > 0 ? Math.pow(2 * G * G / d, 1 / 3) * Math.pow(T, 1 / 3) : null;
  const bSB = raw(2 * g0 * g0), bCB = raw(4 / 3 * g0 * g0);
  return { T, K, threshold, mhat, mhatFound: mhat !== null, M, G, spectralZero: g0,
    bSB: bSB === null ? null : Math.min(bSB, bMax), bCB: bCB === null ? null : Math.min(bCB, bMax), bMax,
    capped: (bCB !== null && bCB > bMax) || (bSB !== null && bSB > bMax) };
}

function kpss(x, bw) {
  const T = x.length, m = mean(x); let s = 0, ss = 0;
  for (const v of x) { s += v - m; ss += s * s; }
  const lrv = bartlettLrv(x, bw), stat = lrv > 0 ? ss / (T * T * lrv) : null;
  return { bandwidth: bw, statistic: stat, critical: { p10: 0.347, p05: 0.463, p01: 0.739 }, reject05: stat !== null && stat > 0.463 };
}

// CUSUM (Ploberger-Kraemer type) for a mean shift, LRV-scaled; sup of |Brownian bridge|.
function cusum(x, bw) {
  const T = x.length, m = mean(x), lrv = bartlettLrv(x, bw); let s = 0, sup = 0, at = 0;
  for (let t = 0; t < T; t++) { s += x[t] - m; if (Math.abs(s) > sup) { sup = Math.abs(s); at = t; } }
  const stat = lrv > 0 ? sup / Math.sqrt(T * lrv) : null;
  return { bandwidth: bw, statistic: stat, argmaxIndex: at, critical: { p10: 1.224, p05: 1.358, p01: 1.628 }, reject05: stat !== null && stat > 1.358 };
}

function solveLinear(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    check(Math.abs(M[p][c]) > 1e-300, 'SINGULAR_SYSTEM'); [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

// ADF with constant: dy_t = a + beta*y_{t-1} + sum_{j=1..p} g_j dy_{t-j}; t(beta).
function adf(x, p) {
  const T = x.length, dy = []; for (let t = 1; t < T; t++) dy.push(x[t] - x[t - 1]);
  const X = [], Y = [];
  for (let t = p + 1; t < T; t++) { const row = [1, x[t - 1]]; for (let j = 1; j <= p; j++) row.push(dy[t - 1 - j]); X.push(row); Y.push(dy[t - 1]); }
  const k = X[0].length, n = X.length;
  const XtX = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0)));
  const XtY = Array.from({ length: k }, (_, i) => X.reduce((s, r, q) => s + r[i] * Y[q], 0));
  const beta = solveLinear(XtX, XtY);
  let rss = 0; for (let q = 0; q < n; q++) { let f = 0; for (let i = 0; i < k; i++) f += X[q][i] * beta[i]; rss += (Y[q] - f) ** 2; }
  const sigma2 = rss / (n - k), e1 = Array.from({ length: k }, (_, i) => i === 1 ? 1 : 0), inv1 = solveLinear(XtX, e1);
  const t = beta[1] / Math.sqrt(sigma2 * inv1[1]);
  return { lags: p, observations: n, gamma: beta[1], statistic: t, critical: { p01: -3.43, p05: -2.86, p10: -2.57 }, rejectUnitRoot05: t < -2.86 };
}

function ratioFromAggregates(sums, counts, lo, hi) {
  let s = 0, n = 0; for (let t = lo; t < hi; t++) { s += sums[t]; n += counts[t]; }
  return { s, n };
}

function splitPeriods(agg, parts, bwCap) {
  const T = agg.T, out = [];
  for (let i = 0; i < parts; i++) {
    const lo = Math.floor(i * T / parts), hi = Math.floor((i + 1) * T / parts);
    const { s, n } = ratioFromAggregates(agg.sums, agg.counts, lo, hi);
    if (!n) { out.push({ lo, hi, n: 0, estimate: null, se: null }); continue; }
    const theta = s / n, z = []; for (let t = lo; t < hi; t++) z.push(agg.sums[t] - theta * agg.counts[t]);
    const bw = Math.min(bwCap, Math.floor((hi - lo) / 4)), lrv = bartlettLrv(z, bw);
    out.push({ lo, hi, n, estimate: theta, bandwidth: bw, se: lrv > 0 ? Math.sqrt((hi - lo) * lrv) / n : null });
  }
  const ok = out.filter(r => r.se > 0);
  let wald = null, pValue = null, pooled = null;
  if (ok.length === parts) {
    const w = ok.map(r => 1 / (r.se * r.se)), W = w.reduce((a, b) => a + b, 0);
    pooled = ok.reduce((a, r, i) => a + w[i] * r.estimate, 0) / W;
    wald = ok.reduce((a, r, i) => a + w[i] * (r.estimate - pooled) ** 2, 0); pValue = chi2Sf(wald, parts - 1);
  }
  return { parts: out, pooled, wald, df: parts - 1, pValue, reject05: pValue !== null && pValue <= 0.05, reject01: pValue !== null && pValue <= 0.01 };
}

function summarizeBootstrap(values, estimate, alpha) {
  const R = values.length, m = mean(values); let ss = 0; for (const v of values) ss += (v - m) ** 2;
  const sorted = [...values].sort((a, b) => a - b);
  const q = p => { const k = (R - 1) * p, i = Math.floor(k); return sorted[i] + (sorted[Math.min(i + 1, R - 1)] - sorted[i]) * (k - i); };
  const tails = values.filter(v => Math.abs(v - estimate) >= Math.abs(estimate)).length;
  return { replicates: R, se: Math.sqrt(ss / (R - 1)), ci: [2 * estimate - q(1 - alpha / 2), 2 * estimate - q(alpha / 2)], pValue: (1 + tails) / (R + 1) };
}

// Bootstrap of the pooled ratio with whole calendar dates moving together.
// kind CBB: circular blocks, start = floor(u*T) (identical RNG use to the engine).
// kind MBB: non-circular moving blocks, start = floor(u*(T-b+1)).
// kind SB : stationary bootstrap (Politis-Romano 1994), circular; after each date a new
//           start is drawn iff the next xorshift state < floor(2^32/b) (p ~= 1/b); exact integers.
function blockBootstrap(kind, sums, counts, b, replicates, seed) {
  const T = sums.length; check(['CBB', 'MBB', 'SB'].includes(kind), 'BOOTSTRAP_KIND');
  check(Number.isInteger(b) && b >= 1 && b <= T, 'BLOCK_LENGTH'); check(Number.isInteger(seed) && seed >= 1 && seed < TWO32, 'SEED');
  let state = seed >>> 0; const out = [];
  if (kind === 'SB') {
    const thr = Math.floor(TWO32 / b);
    for (let r = 0; r < replicates; r++) {
      let s = 0, n = 0; state = xorshift(state); let idx = Math.floor(state / TWO32 * T);
      for (let used = 0; used < T; used++) {
        if (used) { state = xorshift(state); if (state < thr) { state = xorshift(state); idx = Math.floor(state / TWO32 * T); } else idx = idx + 1 === T ? 0 : idx + 1; }
        s += sums[idx]; n += counts[idx];
      }
      check(n > 0, 'EMPTY_BOOTSTRAP_SAMPLE'); out.push(s / n);
    }
    return out;
  }
  const ps = [0], pc = [0];
  for (let k = 0; k < 2 * T; k++) { ps.push(ps[k] + sums[k % T]); pc.push(pc[k] + counts[k % T]); }
  const span = kind === 'CBB' ? T : T - b + 1;
  for (let r = 0; r < replicates; r++) {
    let s = 0, n = 0;
    for (let used = 0; used < T; used += b) {
      state = xorshift(state);
      const start = Math.floor(state / TWO32 * span), length = Math.min(b, T - used);
      s += ps[start + length] - ps[start]; n += pc[start + length] - pc[start];
    }
    check(n > 0, 'EMPTY_BOOTSTRAP_SAMPLE'); out.push(s / n);
  }
  return out;
}

// Theoretical overlap: two h-week forward outcomes whose signal dates differ by k share
// max(0, h-k) weekly returns -> MA(h-1) dependence of z under iid weekly returns.
function overlapSummary(rho, h, T) {
  const band = 1.96 / Math.sqrt(T), within = [], beyond = [];
  for (let k = 1; k < rho.length; k++) (k < h ? within : beyond).push({ k, r: rho[k] });
  const maxAbs = a => a.length ? a.reduce((m, x) => Math.abs(x.r) > Math.abs(m.r) ? x : m) : null;
  let qBeyond = 0; const lagsBeyond = beyond.slice(0, 26);
  for (const x of lagsBeyond) qBeyond += x.r * x.r / (T - x.k); qBeyond *= T * (T + 2);
  return { horizonBars: h, theoreticalOverlapLags: Math.max(0, h - 1), theoreticalAcfIidWeekly: Array.from({ length: Math.max(0, h - 1) }, (_, i) => (h - (i + 1)) / h),
    band95: band, maxAbsWithinOverlap: maxAbs(within), maxAbsBeyondOverlap: maxAbs(beyond),
    shareBeyondOutsideBand: beyond.length ? beyond.filter(x => Math.abs(x.r) > band).length / beyond.length : null,
    ljungBoxBeyondOverlap: lagsBeyond.length ? { firstLag: lagsBeyond[0].k, lags: lagsBeyond.length, q: qBeyond, pValueDescriptive: chi2Sf(qBeyond, lagsBeyond.length) } : null };
}

function sampleVariance(values) { const m = mean(values); let s = 0; for (const v of values) s += (v - m) ** 2; return s / (values.length - 1); }

module.exports = { VERSION, xorshift, aggregate, mean, autocovariances, acf, lnGamma, gammaQ, chi2Sf, ljungBox, bartlettLrv, bandwidthRules,
  andrewsAr1Bandwidth, politisWhite, kpss, cusum, adf, solveLinear, splitPeriods, summarizeBootstrap, blockBootstrap, overlapSummary, sampleVariance };
