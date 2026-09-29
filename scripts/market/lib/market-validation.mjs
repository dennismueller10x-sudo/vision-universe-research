/* =========================================================================
   VISION UNIVERSE — scripts/market/lib/market-validation.mjs

   Historische Validierung der Markt-Einordnung (Market Pulse). Reine
   Funktionen, keine Datei- oder Netzwerkzugriffe.

   Frage: Unterscheiden sich die Folgephasen je Einordnungsstufe? Wenn
   "Defensiv" die Stufe mit Aussagekraft ist, muessen danach haeufiger
   deutliche Rueckgaenge kommen als nach "Konstruktiv".

   Regeln der Messung:
   - Point in time: jeder Tag nur aus Daten bis zu diesem Tag (Linien,
     Renditen, Hochs aus der Reihe bis zum Tag; Volatilitaetsschwellen als
     expandierende Perzentile der Verteilung bis zum Tag).
   - Ausfuehrung einen Handelstag spaeter (Einstieg am Folgetag).
   - Unabhaengige Stichprobe fuer Intervalle und Tests: nur Tage, deren
     Folgefenster sich nicht ueberschneiden.
   - Keine Parameter werden auf Rendite angepasst; die Regeln kommen
     unveraendert aus quant/config/market-pulse.json.

   Wiederverwendet (nur gelesen, nicht veraendert):
     quant/engines/multi-asset/market-pulse.js  - Einordnungsregeln
     quant/engines/pattern-research.js          - wilson, twoProportionP, benjaminiHochberg
     quant/engines/backtest.js                  - computeMetrics
   ========================================================================= */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const MP = require("../../../quant/engines/multi-asset/market-pulse.js");
export const PR = require("../../../quant/engines/pattern-research.js");
export const BT = require("../../../quant/engines/backtest.js");

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
export const round = (x, d = 2) => (isNum(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

function percentileOf(sorted, p) { return sorted[Math.floor((p / 100) * (sorted.length - 1))]; }
function insertSorted(a, v) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } a.splice(lo, 0, v); }
function median(xs) { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }

/**
 * Tageszustaende point in time.
 * @param {object} o
 *   trackers   {SYM: [[date, value]]} - die Reihen fuer TREND/MOMENTUM
 *   benchmark  SYM aus trackers - Referenz fuer RISK
 *   cfg        quant/config/market-pulse.json
 *   volFrom    ISO-Datum, ab dem die Volatilitaetsverteilung zaehlt
 *   minVolSamples  Mindestzahl Volatilitaetswerte vor dem ersten Zustand
 *   breadthAt  optional (date) => "BROAD"|"MIXED"|"NARROW"|null
 */
export function pointInTimeStates({ trackers, benchmark, cfg, volFrom, minVolSamples = 252, breadthAt = null }) {
  const syms = Object.keys(trackers);
  const idx = Object.fromEntries(syms.map((s) => [s, new Map(trackers[s].map((p, i) => [p[0], i]))]));
  const bench = trackers[benchmark];
  const vols = [];
  for (let i = 21; i < bench.length; i++) {
    const g = MP.seriesSignals(bench.slice(i - 21, i + 1));
    if (g && g.vol20 !== null && bench[i][0] >= volFrom) vols.push({ date: bench[i][0], v: g.vol20 });
  }
  const dates = bench.map((p) => p[0]).filter((d) => syms.every((s) => (idx[s].get(d) ?? -1) >= 260));
  const sorted = [];
  const trendCfg = { ...cfg.trend, minTrackers: Math.min(cfg.trend.minTrackers, syms.length), majority: Math.min(cfg.trend.majority, syms.length) };
  let vi = 0;
  const out = [];
  for (const d of dates) {
    while (vi < vols.length && vols[vi].date <= d) { insertSorted(sorted, vols[vi].v); vi++; }
    if (sorted.length < minVolSamples) continue;
    const sigs = Object.fromEntries(syms.map((s) => { const i = idx[s].get(d); return [s, MP.seriesSignals(trackers[s].slice(i - 260, i + 1))]; }));
    const t = MP.trend(sigs, {}, trendCfg), m = MP.momentum(sigs, {});
    const thr = { elevated: round(percentileOf(sorted, cfg.risk.vol20.elevatedPercentile), 1), high: round(percentileOf(sorted, cfg.risk.vol20.highPercentile), 1) };
    const r = MP.risk(sigs[benchmark], { ...cfg.risk, vol20: { ...cfg.risk.vol20, ...thr } }, "");
    const b = breadthAt ? breadthAt(d) : null;
    const st = { TREND: t.state, MOMENTUM: m.state, RISK: r.state, BREADTH: b || "UNKNOWN" };
    const env = MP.environmentLevel(st, cfg.environment);
    out.push({ date: d, env, ...st });
  }
  return out;
}

/**
 * Folgeergebnisse je Tag: Rendite und schlechtester Stand gegenueber dem
 * Einstieg (Einstieg entryLag Handelstage nach dem Signal).
 * @returns Map date -> {[h]: {ret, worst}} (Prozent)
 */
export function forwardOutcomes(points, horizons, entryLag = 1) {
  const out = new Map();
  const c = points.map((p) => p[1]);
  for (let i = 0; i < points.length; i++) {
    const e = i + entryLag;
    const row = {};
    for (const h of horizons) {
      if (e + h >= c.length) { row[h] = null; continue; }
      let worst = 0;
      for (let s = e + 1; s <= e + h; s++) worst = Math.min(worst, c[s] / c[e] - 1);
      row[h] = { ret: 100 * (c[e + h] / c[e] - 1), worst: 100 * worst };
    }
    out.set(points[i][0], row);
  }
  return out;
}

/**
 * Kennzahlen einer Gruppe von Tagen fuer einen Horizont.
 * rows: [{date, i, out}] - i ist die laufende Position im Tagesraster.
 * Unabhaengig: nur i % h === 0 (Folgefenster ueberschneiden sich nicht).
 */
function describe(rows, h, ddLimit) {
  const all = rows.filter((r) => r.out && r.out[h]);
  const ind = all.filter((r) => r.i % h === 0);
  if (!all.length) return { days: 0 };
  const rets = all.map((r) => r.out[h].ret), worsts = all.map((r) => r.out[h].worst);
  const pos = ind.filter((r) => r.out[h].ret > 0).length;
  const dd = ind.filter((r) => r.out[h].worst <= ddLimit).length;
  const ci = (k, n) => { const w = PR.wilson(k, n); return w ? [round(100 * w[0], 1), round(100 * w[1], 1)] : null; };
  return {
    days: all.length, independent: ind.length,
    meanReturn: round(mean(rets)), medianReturn: round(median(rets)),
    positiveShare: round((100 * rets.filter((x) => x > 0).length) / rets.length, 1),
    positiveShareIndependent: ind.length ? round((100 * pos) / ind.length, 1) : null, positiveCI95: ci(pos, ind.length),
    meanWorst: round(mean(worsts)),
    drawdownShare: round((100 * worsts.filter((x) => x <= ddLimit).length) / worsts.length, 1),
    drawdownShareIndependent: ind.length ? round((100 * dd) / ind.length, 1) : null, drawdownCI95: ci(dd, ind.length),
    _pos: pos, _dd: dd, _n: ind.length
  };
}
const clean = (d) => { const { _pos, _dd, _n, ...rest } = d; return rest; };

/**
 * Auswertung je Stufe, Kontraste und Unterzeitraeume.
 * @param states  pointInTimeStates(...)
 * @param outcomes forwardOutcomes(...)
 * @param o {horizons, levels (Labels), ddLimit, periods: [{id, from, to}]}
 */
export function evaluate(states, outcomes, { horizons, levels, ddLimit = -10, periods = [] }) {
  const rows = states.map((s, i) => ({ ...s, i, out: outcomes.get(s.date) }));
  const byLevel = (rs, h) => levels.map((lab, l) => ({ level: l, label: lab, ...clean(describe(rs.filter((r) => r.env === l), h, ddLimit)) }));
  const table = {};
  for (const h of horizons) table[h] = { all: clean(describe(rows, h, ddLimit)), levels: byLevel(rows, h) };

  /* Kontraste: niedrige Stufen (0-1) gegen hohe (3-4), unabhaengige Stichprobe. */
  const tests = [];
  for (const h of horizons) {
    const lo = describe(rows.filter((r) => r.env !== null && r.env <= 1), h, ddLimit);
    const hi = describe(rows.filter((r) => r.env !== null && r.env >= 3), h, ddLimit);
    tests.push({ horizon: h, metric: "deutlicher Rückgang (≤ " + ddLimit + " %)", low: lo._dd, lowN: lo._n, high: hi._dd, highN: hi._n,
                 lowShare: lo._n ? round((100 * lo._dd) / lo._n, 1) : null, highShare: hi._n ? round((100 * hi._dd) / hi._n, 1) : null,
                 p: PR.twoProportionP(lo._dd, lo._n, hi._dd, hi._n) });
    tests.push({ horizon: h, metric: "positive Rendite", low: lo._pos, lowN: lo._n, high: hi._pos, highN: hi._n,
                 lowShare: lo._n ? round((100 * lo._pos) / lo._n, 1) : null, highShare: hi._n ? round((100 * hi._pos) / hi._n, 1) : null,
                 p: PR.twoProportionP(lo._pos, lo._n, hi._pos, hi._n) });
  }
  const bh = PR.benjaminiHochberg(tests.map((t) => t.p), 0.05);
  tests.forEach((t, i) => { t.p = round(t.p, 4); t.significantAfterBH = !!bh.passing[i]; });

  /* Unterzeitraeume (Stabilitaet): mittlerer Horizont. */
  const hMid = horizons[Math.floor(horizons.length / 2)];
  const sub = periods.map((p) => {
    const rs = rows.filter((r) => r.date >= p.from && r.date <= p.to);
    return { id: p.id, from: p.from, to: p.to, horizon: hMid, all: clean(describe(rs, hMid, ddLimit)), levels: byLevel(rs, hMid) };
  });

  /* Rangfolge: steigt der mittlere Folgewert mit der Stufe? (Spearman ueber die Stufen mit Daten) */
  const order = {};
  for (const h of horizons) {
    const lv = table[h].levels.filter((x) => x.days >= 20);
    order[h] = { returnRank: spearman(lv.map((x) => x.level), lv.map((x) => x.meanReturn)),
                 drawdownRank: spearman(lv.map((x) => x.level), lv.map((x) => -x.drawdownShare)) };
  }
  return { byHorizon: table, contrasts: { family: "Stufen 0-1 gegen 3-4", alpha: 0.05, correction: "Benjamini-Hochberg", tests }, subperiods: sub, rankOrder: order };
}

function spearman(x, y) {
  const n = x.length;
  if (n < 3) return null;
  const rank = (v) => { const s = v.map((a, i) => [a, i]).sort((a, b) => a[0] - b[0]); const r = new Array(n); s.forEach((p, k) => { r[p[1]] = k + 1; }); return r; };
  const rx = rank(x), ry = rank(y);
  const d2 = rx.reduce((s, r, i) => s + (r - ry[i]) ** 2, 0);
  return round(1 - (6 * d2) / (n * (n * n - 1)), 3);
}

/**
 * Veranschaulichung, kein Produkt: investiert, solange die Stufe mindestens
 * minLevel ist, sonst Bargeld (Zins cashDaily, sonst 0). Signal am Tag t,
 * wirksam fuer die Rendite von t+1 auf t+2 (ein Tag Verzug).
 * @returns {rule, strategy: metrics, buyAndHold: metrics, invested: %}
 */
export function exposureIllustration(states, points, { minLevel, cashDaily = null }) {
  const pIdx = new Map(points.map((p, i) => [p[0], i]));
  const lvl = new Map(states.map((s) => [s.date, s.env]));
  const first = states[0] && pIdx.get(states[0].date);
  if (first === undefined) return null;
  const dates = [], eq = [], bh = [];
  let e = 1, b = 1, inv = 0, n = 0;
  let w = 0;
  for (let i = first + 1; i < points.length; i++) {
    const r = points[i][1] / points[i - 1][1] - 1;
    const cash = cashDaily ? (cashDaily.get(points[i][0]) || 0) : 0;
    e *= 1 + (w ? r : cash);
    b *= 1 + r;
    dates.push(points[i][0]); eq.push(e); bh.push(b);
    inv += w; n++;
    const l = lvl.get(points[i - 1][0]);
    if (l !== undefined && l !== null) w = l >= minLevel ? 1 : 0;
  }
  const m = BT.computeMetrics(eq, dates, bh, 0);
  const pick = (x) => ({ cagr: x.cagr, volatility: x.volatility, maxDrawdown: x.maxDrawdown, sharpe: x.sharpe, years: x.years });
  return {
    rule: "Investiert bei Stufe ≥ " + minLevel + ", sonst " + (cashDaily ? "Geldmarkt" : "Bargeld ohne Zins") + "; Signal am Schlusskurs, wirksam ab dem übernächsten Schlusskurs; ohne Kosten und Steuern.",
    strategy: pick(m),
    buyAndHold: m.benchmark ? { cagr: m.benchmark.cagr, maxDrawdown: m.benchmark.maxDrawdown } : null,
    investedShare: round((100 * inv) / n, 1),
    from: dates[0], to: dates[dates.length - 1]
  };
}

/** Haeufigkeit der Stufen und Zustaende. */
export function frequencies(states, levels) {
  const n = states.length;
  const f = (k) => { const o = {}; for (const s of states) o[s[k]] = (o[s[k]] || 0) + 1; return Object.fromEntries(Object.entries(o).map(([a, v]) => [a, round((100 * v) / n, 1)])); };
  const env = {};
  for (const s of states) { const lab = s.env === null ? "keine" : levels[s.env]; env[lab] = (env[lab] || 0) + 1; }
  return { days: n, environment: Object.fromEntries(Object.entries(env).map(([a, v]) => [a, round((100 * v) / n, 1)])), trend: f("TREND"), momentum: f("MOMENTUM"), risk: f("RISK"), breadth: f("BREADTH") };
}

/**
 * Lange Horizonte (1 Jahr, 5 Jahre) je Stufe: Median, Mittel, Anteil im Plus,
 * schlechtes (10. Perzentil) und gutes (90. Perzentil) Ergebnis. Ueber alle
 * Tage (ueberlappende Fenster) - "independent" nennt, wie viele sich nicht
 * ueberschneiden, damit niemand die Genauigkeit ueberschaetzt.
 * @param states pointInTimeStates(...)
 * @param outcomes forwardOutcomes(points, [h], entryLag)
 * @param h Horizont in Handelstagen
 * @param levels Stufen-Labels
 */
export function horizonStats(states, outcomes, h, levels) {
  const rows = states.map((s, i) => ({ env: s.env, i, o: outcomes.get(s.date) && outcomes.get(s.date)[h] })).filter((r) => r.o);
  const q = (xs, p) => xs[Math.min(xs.length - 1, Math.max(0, Math.floor(p * (xs.length - 1))))];
  const desc = (rs) => {
    if (!rs.length) return { days: 0 };
    const x = rs.map((r) => r.o.ret).sort((a, b) => a - b);
    return { days: x.length, independent: rs.filter((r) => r.i % h === 0).length,
      meanReturn: round(mean(x), 1), medianReturn: round(q(x, 0.5), 1), positiveShare: round((100 * x.filter((v) => v > 0).length) / x.length, 0),
      bad10: round(q(x, 0.1), 1), good90: round(q(x, 0.9), 1) };
  };
  return { days: h, all: desc(rows), levels: levels.map((label, l) => ({ level: l, label, ...desc(rows.filter((r) => r.env === l)) })).filter((x) => x.days > 0) };
}
