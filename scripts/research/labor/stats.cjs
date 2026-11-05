'use strict';
// Strang G: Statistik (Protokoll §7, §8). Deflated Sharpe Ratio, White's Reality Check, gepaarter Block-Bootstrap.
// Kennzahlen und Holm aus scripts/research/edge/study.cjs (unverändert genutzt).
const path = require('node:path');
const E = require(path.join(__dirname, '../edge/study.cjs'));
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const EULER = 0.5772156649015329;

// Standardnormal: Verteilungsfunktion (Abramowitz/Stegun 7.1.26 über erf, Fehler < 1,5e-7) und Quantil (Acklam).
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
const Phi = x => 0.5 * (1 + erf(x / Math.SQRT2));
function PhiInv(p) {
  if (!(p > 0 && p < 1)) throw Error('PHI_INV_DOMAIN');
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = p < 0.02425 ? Math.sqrt(-2 * Math.log(p)) : p > 1 - 0.02425 ? Math.sqrt(-2 * Math.log(1 - p)) : null;
  if (q === null) { const r = p - 0.5, s = r * r; return (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1); }
  const x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  return p < 0.5 ? x : -x;
}

// Momente einer Reihe: Sharpe (nicht annualisiert), Schiefe, Wölbung (nicht Exzess).
function moments(x) {
  const n = x.length, m = mean(x), sd = Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
  if (!(sd > 0)) return { n, sr: null, skew: 0, kurt: 3 };
  const m3 = x.reduce((s, v) => s + ((v - m) / sd) ** 3, 0) / n, m4 = x.reduce((s, v) => s + ((v - m) / sd) ** 4, 0) / n;
  return { n, sr: m / sd, skew: m3, kurt: m4 };
}
// Wöchentliche Log-Überrendite gegenüber dem Vergleich.
const excess = (r, b) => r.map((x, i) => Math.log1p(x) - Math.log1p(b[i]));

// DSR (Bailey/López de Prado 2014): srs = Sharpe-Werte aller gültigen Versuche, trials = registrierte Versuchszahl.
function deflatedSharpe(x, srs, trials) {
  const { n, sr, skew, kurt } = moments(x);
  if (sr === null || srs.length < 2) return { sr, sr0: null, z: null, dsr: null };
  const ms = mean(srs), v = srs.reduce((s, y) => s + (y - ms) ** 2, 0) / (srs.length - 1);
  const sr0 = Math.sqrt(v) * ((1 - EULER) * PhiInv(1 - 1 / trials) + EULER * PhiInv(1 - 1 / (trials * Math.E)));
  const den = Math.sqrt(Math.max(1e-12, 1 - skew * sr + (kurt - 1) / 4 * sr * sr));
  // z ist die monotone Vorstufe der DSR; gerankt wird nach z, damit numerisch gesättigte DSR-Werte (0 oder 1) keine
  // Scheingleichstände erzeugen (gleiche Rangfolge wie DSR, wo diese nicht gesättigt ist).
  const z = (sr - sr0) * Math.sqrt(n - 1) / den;
  return { sr, sr0, z, dsr: Phi(z) };
}

function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
// Stationärer Bootstrap (Politis/Romano): Indizes mit geometrischen Blocklängen, Mittel `block`.
function stationaryIndices(T, block, random) {
  const out = new Array(T), p = 1 / block;
  let i = Math.floor(random() * T);
  for (let k = 0; k < T; k++) { if (k > 0) i = random() < p ? Math.floor(random() * T) : (i + 1) % T; out[k] = i; }
  return out;
}
// White's Reality Check: H0 max_k E[f_k] <= 0. F = Matrix (Varianten × Wochen) gleicher Länge.
function realityCheck(F, { count = 9999, block = 13, seed = 20261106 } = {}) {
  const K = F.length, T = F[0].length;
  if (!K || F.some(f => f.length !== T || f.some(x => !Number.isFinite(x)))) throw Error('RC_INVALID');
  const mu = F.map(mean), V = Math.sqrt(T) * Math.max(...mu), random = rng(seed);
  let hits = 0;
  for (let b = 0; b < count; b++) {
    const ix = stationaryIndices(T, block, random);
    let best = -Infinity;
    for (let k = 0; k < K; k++) { let s = 0; const f = F[k]; for (const i of ix) s += f[i]; best = Math.max(best, Math.sqrt(T) * (s / T - mu[k])); }
    if (best >= V) hits++;
  }
  return { statistic: V, bestIndex: mu.indexOf(Math.max(...mu)), p: (1 + hits) / (count + 1), variants: K, weeks: T };
}
// Gepaarter Block-Bootstrap der mittleren Log-Überrendite (einseitig), wie E3, eigener Seed.
const pairedTest = (a, b, o = {}) => E.pairedTest(a, b, { count: 9999, block: 13, seed: 20261106, ...o });

module.exports = { Phi, PhiInv, moments, excess, deflatedSharpe, realityCheck, stationaryIndices, pairedTest, metrics: E.metrics, holm: E.holm, mean };
