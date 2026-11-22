/**
 * Backtest 2.0 – Suchraum, Jahreskennzahlen, Walk-forward-Auswahl und Statistik. Forschung, nicht zertifiziert.
 * Protokoll: docs/research/backtest2/PROTOKOLL.md §2–§4.
 */
import { simulate, INITIAL } from './engine.mjs';
import { SOURCES } from './signals.mjs';

export const SEARCH_VERSION = 'backtest2-search-1.0.0';
export const FIRST_YEAR = 2008;
export const ROUNDS = Object.freeze([
  { learn: [2008, 2013], confirm: [2014, 2016] },
  { learn: [2008, 2016], confirm: [2017, 2019] },
  { learn: [2008, 2019], confirm: [2020, 2022] },
  { learn: [2008, 2022], confirm: [2023, 9999] },
]);
export const MAX_LEARN_DRAWDOWN = -0.5;

export const GRID = Object.freeze({
  source: SOURCES,
  positions: [1, 3, 5, 8, 10, 15, 20, 30],
  sizing: [{ sizing: 'EQUAL', cap: 1 }, { sizing: 'RISK', cap: 1 }, { sizing: 'RISK', cap: 0.5 }, { sizing: 'RISK', cap: 0.25 }, { sizing: 'RISK', cap: 0.15 }],
  exit: [
    { kind: 'TRAIL', pct: 0.10 }, { kind: 'TRAIL', pct: 0.15 }, { kind: 'TRAIL', pct: 0.25 }, { kind: 'TRAIL', pct: 0.35 },
    { kind: 'SMA', n: 50 }, { kind: 'SMA', n: 200 },
    { kind: 'HOLD', days: 5 }, { kind: 'HOLD', days: 21 }, { kind: 'HOLD', days: 63 }, { kind: 'HOLD', days: 126 }, { kind: 'HOLD', days: 252 }, { kind: 'HOLD', days: 504 },
    { kind: 'CHANNEL', n: 10 }, { kind: 'CHANNEL', n: 20 },
  ],
  filter: ['NONE', 'SMA200', 'SMA50'],
  universe: [{ uniTop: 500, minPrice: 5 }, { uniTop: 500, minPrice: 10 }, { uniTop: 1000, minPrice: 5 }, { uniTop: 1000, minPrice: 10 }, { uniTop: 3000, minPrice: 5 }, { uniTop: 3000, minPrice: 10 }],
});

/** Alle Kombinationen in fester Reihenfolge; die Nummer ist die Kennung. */
export function combos(grid = GRID) {
  const out = [];
  grid.source.forEach((source, a) => grid.positions.forEach((positions, b) => grid.sizing.forEach((sz, c) => grid.exit.forEach((exit, d) => grid.filter.forEach((filter, e) => grid.universe.forEach((u, f) => {
    if (positions === 1 && sz.sizing === 'RISK' && sz.cap < 1) return; // eine Position: Kappe < 100 % ist nur Cash-Quote
    out.push({ id: out.length, source, positions, sizing: sz.sizing, cap: sz.cap, exit, filter, uniTop: u.uniTop, minPrice: u.minPrice, ix: [a, b, c, d, e, f] });
  }))))));
  return out;
}

/**
 * Nachbarn einer Kombination (Protokoll Fassung 3, robuste Auswahl): eine geordnete Stellschraube eine Stufe verschoben,
 * alles andere gleich. Geordnet sind Positionen, Gewichtung, Universum und der Ausstieg innerhalb derselben Art
 * (Stopp 15 -> 25 %, Haltedauer 63 -> 126 Tage); Signalquelle und Filter sind keine Skala und bleiben fest.
 */
export function neighbors(list, grid = GRID) {
  const byKey = new Map(list.map((c) => [c.ix.join(','), c.id]));
  return list.map((c) => {
    const out = [];
    for (const d of [1, 2, 3, 5]) for (const step of [-1, 1]) {
      const ix = [...c.ix]; ix[d] += step;
      if (d === 3 && grid.exit[ix[3]]?.kind !== c.exit.kind) continue;
      const id = byKey.get(ix.join(',')); if (id !== undefined) out.push(id);
    }
    return out;
  });
}

/** Robuste Auswahl: mind. `minPositions`; Wert = Median der Lern-Überrendite von Kombination und Nachbarn; max. Verlust wie Fassung 2. */
export function selectRoundRobust(stats, list, nbrs, nYears, round, m, spy, { minPositions = 10 } = {}) {
  const yEnd = Math.min(round.learn[1], FIRST_YEAR + nYears - 1) - FIRST_YEAR;
  const w = windowDates(m, round.learn[0], round.learn[1]);
  const spyC = cagr(valueAt(spy, w.start), valueAt(spy, w.end), w.start, w.end);
  const ex = (k) => { const e = stats[k * nYears * YEAR_FIELDS + yEnd * YEAR_FIELDS + 3]; return e > 0 ? cagr(INITIAL, e, w.start, w.end) - spyC : -Infinity; };
  let best = -1, bestScore = -Infinity, bestEx = null;
  for (const c of list) {
    if (c.positions < minPositions) continue;
    const dd = stats[c.id * nYears * YEAR_FIELDS + yEnd * YEAR_FIELDS + 4];
    if (!(dd >= MAX_LEARN_DRAWDOWN)) continue;
    const vals = [c.id, ...nbrs[c.id]].map(ex).sort((a, b) => a - b), n = vals.length;
    const score = n % 2 ? vals[n >> 1] : (vals[n / 2 - 1] + vals[n / 2]) / 2;
    if (score > bestScore) { bestScore = score; best = c.id; bestEx = ex(c.id); }
  }
  return { combo: best, learnExcess: bestEx, neighborhoodMedian: bestScore, spyLearnCagr: spyC };
}
export const label = (c) => `${c.source} · ${c.positions} Pos · ${c.sizing === 'EQUAL' ? 'gleich' : 'Risiko, Kappe ' + Math.round(c.cap * 100) + ' %'} · ${exitLabel(c.exit)} · Filter ${c.filter} · Top ${c.uniTop}, ≥ ${c.minPrice} $`;
export const exitLabel = (e) => e.kind === 'TRAIL' ? `Stopp ${Math.round(e.pct * 100)} % ab Hoch` : e.kind === 'SMA' ? `unter SMA${e.n}` : e.kind === 'HOLD' ? `halten ${e.days} Tage` : `Kanal ${e.n} Tage`;

/** Jahreskennzahlen je Kombination: je Jahr [Summe Log-Rendite, Quadratsumme, Tage, Equity Jahresende, max. Verlust kumuliert]. */
export const YEAR_FIELDS = 5;
export function yearStats(m, sig, c, t0, t1, nYears) {
  const out = new Float64Array(nYears * YEAR_FIELDS).fill(NaN);
  let prev = INITIAL, peak = INITIAL, dd = 0, y = -1, cur = null;
  const yearOf = (t) => +m.dates[t].slice(0, 4) - FIRST_YEAR;
  simulate(m, sig, c, {
    t0, t1, onDay: (t, e) => {
      const yy = yearOf(t);
      if (yy !== y) { y = yy; cur = y * YEAR_FIELDS; out[cur] = 0; out[cur + 1] = 0; out[cur + 2] = 0; }
      const lr = Math.log(e / prev); prev = e;
      out[cur] += lr; out[cur + 1] += lr * lr; out[cur + 2]++;
      peak = Math.max(peak, e); dd = Math.min(dd, e / peak - 1);
      out[cur + 3] = e; out[cur + 4] = dd;
    },
  });
  return out;
}

/** Jahresendwerte einer Benchmark aus Wochenpunkten [[datum, wert]]: Wert der letzten Woche ≤ Stichtag. */
export function valueAt(points, date) { let v = NaN; for (const [d, x] of points) { if (d <= date) v = x; else break; } return v; }

export function windowDates(m, a, b) {
  const first = m.dates.findIndex((d) => +d.slice(0, 4) >= a), lastIdx = m.dates.findLastIndex((d) => +d.slice(0, 4) <= b);
  return { t0: first, t1: lastIdx, start: first > 0 ? m.dates[first - 1] : m.dates[0], end: m.dates[lastIdx] };
}
const years = (a, b) => (Date.parse(b) - Date.parse(a)) / (365.25 * 864e5);
export const cagr = (v0, v1, a, b) => (v1 / v0) ** (1 / years(a, b)) - 1;

/** Auswahl einer Runde: höchste Lern-CAGR über SPY mit max. Verlust ≥ −50 %; Gleichstand nach kleinerer Kennung. */
export function selectRound(stats, comboCount, nYears, round, m, spy) {
  const yEnd = Math.min(round.learn[1], FIRST_YEAR + nYears - 1) - FIRST_YEAR;
  const w = windowDates(m, round.learn[0], round.learn[1]);
  const spyC = cagr(valueAt(spy, w.start), valueAt(spy, w.end), w.start, w.end);
  let best = -1, bestEx = -Infinity;
  for (let k = 0; k < comboCount; k++) {
    const base = k * nYears * YEAR_FIELDS + yEnd * YEAR_FIELDS, e = stats[base + 3], dd = stats[base + 4];
    if (!(e > 0) || !(dd >= MAX_LEARN_DRAWDOWN)) continue;
    const ex = cagr(INITIAL, e, w.start, w.end) - spyC;
    if (ex > bestEx) { bestEx = ex; best = k; }
  }
  return { combo: best, learnExcess: bestEx, spyLearnCagr: spyC };
}

/** Kennzahlen einer Tagesreihe. */
export function curveMetrics(eq, dates) {
  let peak = eq[0], dd = 0, s = 0, s2 = 0;
  for (let k = 1; k < eq.length; k++) { peak = Math.max(peak, eq[k]); dd = Math.min(dd, eq[k] / peak - 1); const r = Math.log(eq[k] / eq[k - 1]); s += r; s2 += r * r; }
  const n = eq.length - 1, mu = s / n, sd = Math.sqrt(Math.max(0, s2 / n - mu * mu));
  return { cagr: cagr(eq[0], eq.at(-1), dates[0], dates.at(-1)), maxDrawdown: dd, sharpe: sd > 0 ? (mu / sd) * Math.sqrt(252) : 0, from: dates[0], to: dates.at(-1) };
}

/** Wochenrenditen einer Tagesreihe an den Wochenstichtagen der Benchmark. */
export function weeklyReturns(eq, dates, benchPoints) {
  const out = [], idx = new Map(dates.map((d, i) => [d, i]));
  let prevS = null, prevB = null;
  for (const [d, b] of benchPoints) {
    if (d < dates[0] || d > dates.at(-1)) continue;
    let i = idx.get(d); if (i === undefined) { i = dates.findLastIndex((x) => x <= d); if (i < 0) continue; }
    const s = eq[i];
    if (prevS !== null) out.push([Math.log(s / prevS), Math.log(b / prevB)]);
    prevS = s; prevB = b;
  }
  return out;
}

/** Stationärer Block-Bootstrap (mittlere Blocklänge 8 Wochen): p für „mittlere Überrendite > 0“, einseitig. */
export function bootstrapP(excess, reps = 9999, seed = 20261121) {
  const n = excess.length; if (n < 20) return null;
  let a = seed >>> 0; const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const mean = excess.reduce((x, y) => x + y, 0) / n, centered = excess.map((x) => x - mean);
  let hit = 0;
  for (let r = 0; r < reps; r++) {
    let s = 0, i = Math.floor(u() * n);
    for (let k = 0; k < n; k++) { if (u() < 1 / 8) i = Math.floor(u() * n); s += centered[i]; i = (i + 1) % n; }
    if (s / n >= mean) hit++;
  }
  return (hit + 1) / (reps + 1);
}

/** Normalverteilung: Verteilungsfunktion und Quantil (Acklam). */
export const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x) { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)); }
export function PhiInv(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = p < 0.02425 ? Math.sqrt(-2 * Math.log(p)) : p > 1 - 0.02425 ? Math.sqrt(-2 * Math.log(1 - p)) : null;
  if (q !== null) { const x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); return p < 0.5 ? x : -x; }
  const r = p - 0.5, s = r * r;
  return (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}
/** Deflated Sharpe Ratio (Bailey/López de Prado) für die beste von N Versuchen; Sharpe je Beobachtung, nicht annualisiert. */
export function deflatedSharpe(sr, trialSharpes, nObs, skew = 0, kurt = 3) {
  const N = trialSharpes.length, mu = trialSharpes.reduce((a, b) => a + b, 0) / N;
  const v = trialSharpes.reduce((a, b) => a + (b - mu) ** 2, 0) / (N - 1), g = 0.5772156649;
  const sr0 = Math.sqrt(v) * ((1 - g) * PhiInv(1 - 1 / N) + g * PhiInv(1 - 1 / (N * Math.E)));
  return { sr0, dsr: Phi(((sr - sr0) * Math.sqrt(nObs - 1)) / Math.sqrt(Math.max(1e-12, 1 - skew * sr + ((kurt - 1) / 4) * sr * sr))) };
}
