'use strict';
// VU-Portfolio-Standard, Risikomodell (portfolio-risk-1.0.0). Forschung, nicht zertifiziert.
//
// Reine Mathematik auf Periodenrenditen, ohne Datenzugriff:
// - Volatilität (Stichproben-SD, n-1, annualisiert mit periodsPerYear),
// - Kovarianz mit Schrumpfung nach Ledoit/Wolf (2004, "Honey, I Shrunk the Sample Covariance Matrix") auf das
//   Ziel konstanter Korrelation; Schrumpfungsintensität geschätzt, auf [0, 1] begrenzt,
// - Beta und Korrelation gegen eine Benchmark,
// - Ex-ante-Portfoliovolatilität und Risikobeiträge.
// Die Python-Gegenrechnung steht in scripts/quant/verify-portfolio-construction.py (eigener Code, gleiche Formeln).
const VERSION = 'portfolio-risk-1.0.0';

function fail(code, detail) { const e = new Error(code + (detail ? ': ' + detail : '')); e.code = code; throw e; }
const isNum = x => typeof x === 'number' && Number.isFinite(x);

function returnsFromLevels(levels) {
  if (!Array.isArray(levels) || levels.length < 2) fail('LEVELS_REQUIRED');
  const out = new Array(levels.length - 1);
  for (let i = 1; i < levels.length; i++) {
    if (!(levels[i - 1] > 0) || !(levels[i] > 0)) fail('INVALID_LEVEL', String(i));
    out[i - 1] = levels[i] / levels[i - 1] - 1;
  }
  return out;
}
function mean(x) { let s = 0; for (const v of x) s += v; return s / x.length; }
function sampleSd(x) {
  if (x.length < 2) return null;
  const m = mean(x); let s = 0; for (const v of x) s += (v - m) * (v - m);
  return Math.sqrt(s / (x.length - 1));
}
function annualVol(returns, periodsPerYear = 52) { const sd = sampleSd(returns); return sd === null ? null : sd * Math.sqrt(periodsPerYear); }

// R: Matrix T x N (Zeilen = Perioden, Spalten = Titel), vollständig (keine Lücken).
function validateMatrix(R) {
  if (!Array.isArray(R) || R.length < 3) fail('RETURNS_MATRIX_TOO_SHORT');
  const n = R[0].length;
  if (!n) fail('RETURNS_MATRIX_EMPTY');
  for (const row of R) { if (!Array.isArray(row) || row.length !== n) fail('RETURNS_MATRIX_RAGGED'); for (const v of row) if (!isNum(v)) fail('RETURNS_MATRIX_NONFINITE'); }
  return { T: R.length, N: n };
}

// Ledoit/Wolf (2004), Ziel konstante Korrelation. Momente mit Divisor T (wie im Original); die Ausgabe ist die
// geschrumpfte Kovarianz je Periode. Konvention für N = 1: keine Schrumpfung (delta = 0).
function shrunkCovariance(R) {
  const { T, N } = validateMatrix(R);
  const mu = new Array(N).fill(0);
  for (const row of R) for (let j = 0; j < N; j++) mu[j] += row[j] / T;
  const X = R.map(row => row.map((v, j) => v - mu[j]));
  const S = Array.from({ length: N }, () => new Array(N).fill(0));
  for (const x of X) for (let i = 0; i < N; i++) { const xi = x[i]; for (let j = i; j < N; j++) S[i][j] += xi * x[j] / T; }
  for (let i = 0; i < N; i++) for (let j = 0; j < i; j++) S[i][j] = S[j][i];
  const sd = S.map((r, i) => Math.sqrt(r[i]));
  if (sd.some(v => !(v > 0))) fail('ZERO_VARIANCE_ASSET');
  if (N === 1) return { cov: S, sample: S, target: S, shrinkage: 0, averageCorrelation: null, T, N };
  let rsum = 0;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) rsum += S[i][j] / (sd[i] * sd[j]);
  const rbar = 2 * rsum / (N * (N - 1));
  const F = S.map((r, i) => r.map((v, j) => i === j ? v : rbar * sd[Math.min(i, j)] * sd[Math.max(i, j)]));
  // pi_ij = (1/T) sum_t (x_ti x_tj - s_ij)^2 ; theta_ii,ij = (1/T) sum_t (x_ti^2 - s_ii)(x_ti x_tj - s_ij)
  let pi = 0, rhoOff = 0;
  const piDiag = new Array(N).fill(0);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    let p = 0, thI = 0, thJ = 0;
    for (const x of X) {
      const c = x[i] * x[j] - S[i][j];
      p += c * c;
      if (i !== j) { thI += (x[i] * x[i] - S[i][i]) * c; thJ += (x[j] * x[j] - S[j][j]) * c; }
    }
    p /= T; pi += p;
    if (i === j) piDiag[i] = p;
    else rhoOff += (rbar / 2) * (Math.sqrt(S[j][j] / S[i][i]) * thI / T + Math.sqrt(S[i][i] / S[j][j]) * thJ / T);
  }
  const rho = piDiag.reduce((a, b) => a + b, 0) + rhoOff;
  let gamma = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) gamma += (F[i][j] - S[i][j]) ** 2;
  const kappa = gamma > 0 ? (pi - rho) / gamma : 0;
  const delta = Math.max(0, Math.min(1, kappa / T));
  const cov = S.map((r, i) => r.map((v, j) => delta * F[Math.min(i, j)][Math.max(i, j)] + (1 - delta) * S[Math.min(i, j)][Math.max(i, j)]));
  return { cov, sample: S, target: F, shrinkage: delta, averageCorrelation: rbar, T, N };
}

function portfolioVariance(w, cov) {
  let v = 0;
  for (let i = 0; i < w.length; i++) for (let j = 0; j < w.length; j++) v += w[i] * cov[i][j] * w[j];
  return v;
}
function riskContributions(w, cov) {
  const v = portfolioVariance(w, cov);
  return w.map((wi, i) => { let m = 0; for (let j = 0; j < w.length; j++) m += cov[i][j] * w[j]; return v > 0 ? wi * m / v : 0; });
}
function annualPortfolioVol(w, cov, periodsPerYear = 52) { return Math.sqrt(Math.max(0, portfolioVariance(w, cov)) * periodsPerYear); }

// Beta = cov(r, b) / var(b), Stichprobenmomente (n-1); nur gemeinsame Perioden, keine Auffüllung.
function beta(r, b) {
  if (!Array.isArray(r) || !Array.isArray(b) || r.length !== b.length || r.length < 3) fail('BETA_INPUT_INVALID');
  const mr = mean(r), mb = mean(b);
  let c = 0, vb = 0, vr = 0;
  for (let i = 0; i < r.length; i++) { c += (r[i] - mr) * (b[i] - mb); vb += (b[i] - mb) ** 2; vr += (r[i] - mr) ** 2; }
  return { beta: vb > 0 ? c / vb : null, correlation: vb > 0 && vr > 0 ? c / Math.sqrt(vb * vr) : null, n: r.length };
}

module.exports = { VERSION, returnsFromLevels, sampleSd, annualVol, shrunkCovariance, portfolioVariance, riskContributions, annualPortfolioVol, beta, mean };
