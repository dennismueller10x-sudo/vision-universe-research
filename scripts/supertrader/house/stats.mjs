// VU Hausstrategie HS1: Kennzahlen, Deflated Sharpe Ratio (Bailey/Lopez de Prado 2014) und
// Probability of Backtest Overfitting per CSCV (Bailey/Borwein/Lopez de Prado/Zhu 2017). Rein.

export function normCdf(x) {
  // Abramowitz/Stegun 7.1.26 ueber erf
  const s = x < 0 ? -1 : 1, z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + s * y);
}

export function normInv(p) {
  // Acklam
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function moments(x) {
  const n = x.length, mu = x.reduce((a, b) => a + b, 0) / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const v of x) { const d = v - mu; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
  m2 /= n; m3 /= n; m4 /= n;
  const sd = Math.sqrt(m2);
  return { n, mean: mu, sd, sdSample: n > 1 ? Math.sqrt(m2 * n / (n - 1)) : NaN, skew: sd > 0 ? m3 / sd ** 3 : 0, kurt: sd > 0 ? m4 / sd ** 4 : 3 };
}

// Deflated Sharpe Ratio. sr: beobachteter Sharpe je Periode, srTrials: Sharpe je Periode aller Versuche.
export function deflatedSharpe(returns, srTrials) {
  const m = moments(returns);
  const sr = m.sdSample > 0 ? m.mean / m.sdSample : 0;
  const N = Math.max(1, srTrials.length);
  const vs = N > 1 ? moments(srTrials).sdSample ** 2 : 0;
  const g = 0.5772156649;
  const sr0 = N > 1 ? Math.sqrt(vs) * ((1 - g) * normInv(1 - 1 / N) + g * normInv(1 - 1 / (N * Math.E))) : 0;
  const den = Math.sqrt(Math.max(1e-12, 1 - m.skew * sr + ((m.kurt - 1) / 4) * sr * sr));
  return { sr, sr0, dsr: normCdf(((sr - sr0) * Math.sqrt(m.n - 1)) / den), trials: N, periods: m.n };
}

function combinations(n, k) {
  const out = [], cur = [];
  (function rec(s) { if (cur.length === k) { out.push(cur.slice()); return; } for (let i = s; i < n; i++) { cur.push(i); rec(i + 1); cur.pop(); } })(0);
  return out;
}
const sharpe = (x) => { const m = moments(x); return m.sdSample > 0 ? m.mean / m.sdSample : 0; };

// CSCV: matrix[t][j] = Rendite von Versuch j in Periode t. S gerade.
export function pboCscv(matrix, S = 8) {
  const T = matrix.length, N = matrix[0]?.length || 0;
  if (N < 2 || T < S * 2) return { pbo: null, reason: 'zu wenig Daten' };
  const size = Math.floor(T / S), blocks = Array.from({ length: S }, (_, i) => [i * size, i === S - 1 ? T : (i + 1) * size]);
  const lambdas = [];
  for (const is of combinations(S, S / 2)) {
    const isSet = new Set(is), rowsIS = [], rowsOOS = [];
    blocks.forEach(([a, b], i) => { for (let t = a; t < b; t++) (isSet.has(i) ? rowsIS : rowsOOS).push(matrix[t]); });
    const srIS = [], srOOS = [];
    for (let j = 0; j < N; j++) { srIS.push(sharpe(rowsIS.map((r) => r[j]))); srOOS.push(sharpe(rowsOOS.map((r) => r[j]))); }
    let best = 0; for (let j = 1; j < N; j++) if (srIS[j] > srIS[best]) best = j;
    const below = srOOS.filter((v) => v < srOOS[best]).length;
    const omega = (below + 1) / (N + 1);
    lambdas.push(Math.log(omega / (1 - omega)));
  }
  return { pbo: lambdas.filter((l) => l <= 0).length / lambdas.length, combinations: lambdas.length, medianLogit: lambdas.sort((a, b) => a - b)[Math.floor(lambdas.length / 2)] };
}

// Kennzahlen eines Laufs gegen SPY-Gesamtrendite. eq: [{date, equity}], bench: Map(date -> Wert).
export function metrics(eq, bench) {
  const n = eq.length, first = eq[0], last = eq[n - 1];
  const yrs = (Date.parse(last.date) - Date.parse(first.date)) / (365.25 * 864e5);
  const cagr = (last.equity / first.equity) ** (1 / yrs) - 1;
  const b0 = bench.get(first.date), b1 = bench.get(last.date);
  const spyCagr = (b1 / b0) ** (1 / yrs) - 1;
  const rs = [], act = [], br = [];
  for (let i = 1; i < n; i++) {
    const r = eq[i].equity / eq[i - 1].equity - 1, b = bench.get(eq[i].date) / bench.get(eq[i - 1].date) - 1;
    rs.push(r); br.push(b); act.push(r - b);
  }
  const m = moments(rs), a = moments(act), bm = moments(br);
  let cov = 0; for (let i = 0; i < rs.length; i++) cov += (rs[i] - m.mean) * (br[i] - bm.mean); cov /= rs.length;
  const beta = bm.sd > 0 ? cov / (bm.sd ** 2) : null;
  let peak = -Infinity, mdd = 0; for (const p of eq) { peak = Math.max(peak, p.equity); mdd = Math.min(mdd, p.equity / peak - 1); }
  let bpeak = -Infinity, bmdd = 0; for (const p of eq) { const v = bench.get(p.date); bpeak = Math.max(bpeak, v); bmdd = Math.min(bmdd, v / bpeak - 1); }
  const annual = {}, monthly = [];
  let prevY = null, prevYEq = first.equity, prevYB = b0, prevM = null, prevMEq = first.equity, prevMB = b0;
  for (let i = 0; i < n; i++) {
    const p = eq[i], y = p.date.slice(0, 4), mo = p.date.slice(0, 7), nx = eq[i + 1];
    if (!nx || nx.date.slice(0, 7) !== mo) { const bv = bench.get(p.date); monthly.push({ month: mo, r: p.equity / prevMEq - 1, b: bv / prevMB - 1 }); prevMEq = p.equity; prevMB = bv; }
    if (!nx || nx.date.slice(0, 4) !== y) { const bv = bench.get(p.date); annual[y] = { r: p.equity / prevYEq - 1, spy: bv / prevYB - 1 }; prevYEq = p.equity; prevYB = bv; }
    void prevY; void prevM;
  }
  return {
    from: first.date, to: last.date, years: yrs, cagr, spyCagr, excessCagr: cagr - spyCagr,
    vol: m.sd * Math.sqrt(252), sharpe0: m.sd > 0 ? (m.mean * 252) / (m.sd * Math.sqrt(252)) : null,
    trackingError: a.sd * Math.sqrt(252), infoRatio: a.sd > 0 ? (a.mean * 252) / (a.sd * Math.sqrt(252)) : null,
    tStatActive: a.sdSample > 0 ? a.mean / (a.sdSample / Math.sqrt(a.n)) : null,
    beta, alphaAnn: beta == null ? null : (m.mean - beta * bm.mean) * 252,
    maxDrawdown: mdd, spyMaxDrawdown: bmdd, annual, monthly,
    monthsBeatingSpy: monthly.filter((x) => x.r > x.b).length / monthly.length,
  };
}
