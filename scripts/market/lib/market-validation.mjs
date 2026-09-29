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

/**
 * Krisen-Check: das Barometer Tag fuer Tag durch einen Absturz.
 * Hoch und Tief werden in den genannten Suchfenstern aus der Reihe selbst
 * bestimmt (kein handverlesenes Datum). Gemessen wird, welche Stufe am Hoch
 * galt, wann zuerst "Vorsichtig" oder "Defensiv" kam, wie weit der Markt da
 * schon gefallen war und wie viel des Absturzes noch folgte.
 * @param states pointInTimeStates(...)
 * @param points [[date, value]] - dieselbe Reihe wie fuer die Zustaende
 * @param crises [{id, name, peakFrom, peakTo, troughTo}]
 * @param levels Stufen-Labels
 */
export function crisisReplay(states, points, crises, levels) {
  const lvl = new Map(states.map((s) => [s.date, s.env]));
  const at = (d) => { const i = points.findIndex((p) => p[0] >= d); return i < 0 ? points.length - 1 : i; };
  const pct = (a, b) => round(100 * (points[b][1] / points[a][1] - 1), 1);
  return crises.map((k) => {
    let ip = at(k.peakFrom);
    for (let i = at(k.peakFrom); i <= at(k.peakTo); i++) if (points[i][1] > points[ip][1]) ip = i;
    let it = ip;
    for (let i = ip; i <= at(k.troughTo); i++) if (points[i][1] < points[it][1]) it = i;
    const first = (pred) => { for (let i = ip; i <= it; i++) { const l = lvl.get(points[i][0]); if (l !== undefined && l !== null && pred(l)) return i; } return -1; };
    const iw = first((l) => l <= 1), id = first((l) => l === 0);
    let ir = -1, is = -1, ih = -1;
    for (let i = it; i < Math.min(points.length, it + 1000); i++) { const l = lvl.get(points[i][0]); if (l !== undefined && l !== null && l >= 3) { ir = i; break; } }
    for (let i = it; i < Math.min(points.length, it + 1000); i++) { const l = lvl.get(points[i][0]); if (l !== undefined && l !== null && l >= 2) { is = i; break; } }
    for (let i = it; i < points.length; i++) if (points[i][1] >= points[ip][1]) { ih = i; break; }
    const lab = (i) => { const l = i >= 0 ? lvl.get(points[i][0]) : undefined; return l === undefined || l === null ? null : levels[l]; };
    const weg = states.filter((s) => s.date >= points[ip][0] && s.date <= points[it][0]);
    const punkt = (i) => i < 0 ? null : { date: points[i][0], fallAt: pct(ip, i), restAfter: pct(i, it), tradingDaysAfterPeak: i - ip };
    return {
      id: k.id, name: k.name, peak: points[ip][0], trough: points[it][0], fall: pct(ip, it), tradingDays: it - ip,
      levelAtPeak: lab(ip), levelBefore20: lab(ip - 20), levelBefore60: lab(ip - 60),
      firstWarning: punkt(iw), firstDefensive: punkt(id),
      warningShare: weg.length ? round((100 * weg.filter((s) => s.env !== null && s.env <= 1).length) / weg.length, 0) : null,
      levelAtTrough: lab(it),
      backSelective: is < 0 ? null : { date: points[is][0], riseFromTrough: pct(it, is), tradingDaysAfterTrough: is - it },
      backConstructive: ir < 0 ? null : { date: points[ir][0], riseFromTrough: pct(it, ir), tradingDaysAfterTrough: ir - it },
      oldHighBack: ih < 0 ? null : { date: points[ih][0], riseFromTrough: pct(it, ih) }
    };
  });
}

/* Normalverteilung fuer zweiseitige p-Werte (Abramowitz-Stegun). */
function normP(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 2 * q;
}

/**
 * Kalender-Statistik aus einer Tagesreihe: Kalendermonate, Jahre im
 * US-Praesidentschaftszyklus (1928 = Wahljahr) und die 12 Monate nach jedem
 * Monatsende je Zyklusjahr. Monate mit t-Test und Benjamini-Hochberg.
 */
export function calendarStats(points) {
  const me = new Map();
  for (const [d, v] of points) me.set(d.slice(0, 7), v);
  const ks = [...me.keys()].sort();
  const monat = [];
  for (let i = 1; i < ks.length; i++) monat.push({ ym: ks[i], m: +ks[i].slice(5), r: me.get(ks[i]) / me.get(ks[i - 1]) - 1 });
  const zyklus = (y) => { const r = (((y - 1928) % 4) + 4) % 4; return r === 0 ? 4 : r; };
  const desc = (xs) => {
    if (!xs.length) return { n: 0 };
    const m = mean(xs), sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
    return { n: xs.length, meanReturn: round(100 * m, 2), medianReturn: round(100 * median(xs), 2), positiveShare: round((100 * xs.filter((v) => v > 0).length) / xs.length, 0),
             t: sd > 0 ? round(m / (sd / Math.sqrt(xs.length)), 2) : null };
  };
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, ...desc(monat.filter((o) => o.m === i + 1).map((o) => o.r)) }));
  months.forEach((x) => { x.p = x.t === null ? null : round(normP(x.t), 4); });
  const bh = PR.benjaminiHochberg(months.map((x) => x.p), 0.05);
  months.forEach((x, i) => { x.significant = !!bh.passing[i]; });
  const ye = new Map();
  for (const [d, v] of points) ye.set(+d.slice(0, 4), v);
  const jahre = [];
  for (const y of [...ye.keys()].sort()) if (ye.has(y - 1) && (points[points.length - 1][0].slice(0, 4) !== String(y))) jahre.push({ y, r: ye.get(y) / ye.get(y - 1) - 1 });
  const NAMEN = { 1: "Jahr nach der Wahl", 2: "Midterm-Jahr", 3: "Vorwahljahr", 4: "Wahljahr" };
  const cycle = [1, 2, 3, 4].map((c) => ({ year: c, label: NAMEN[c], ...desc(jahre.filter((o) => zyklus(o.y) === c).map((o) => o.r)) }));
  /* 12 Monate nach dem Monatsende (m, Jahr y) bis zum Monatsende (m, y+1). */
  const vor = [];
  for (const k of ks) { const y = +k.slice(0, 4), m = k.slice(5); const z = (y + 1) + "-" + m; if (me.has(z)) vor.push({ y, m: +m, r: me.get(z) / me.get(k) - 1 }); }
  const forward12 = {
    byMonth: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, ...desc(vor.filter((o) => o.m === i + 1).map((o) => o.r)) })),
    byCycleMonth: [1, 2, 3, 4].flatMap((c) => Array.from({ length: 12 }, (_, i) => ({ cycleYear: c, month: i + 1,
      ...desc(vor.filter((o) => o.m === i + 1 && zyklus(o.y) === c).map((o) => o.r)) })))
  };
  return { from: ks[0], to: ks[ks.length - 1], electionReference: "1928 = Wahljahr (US-Präsidentschaftswahl alle vier Jahre)", months, cycle, forward12 };
}

/**
 * Fruehe Erholungszeichen: Breitenschub nach einem Absturz. Eigenes Zeichen,
 * KEIN Teil des Barometers. Feste Schwellen, vorab gesetzt und nicht
 * optimiert: im Baerenmarkt (>= 20 % unter dem bisherigen Hoch) springt der
 * Anteil ueber der 50-Tage-Linie binnen `window` Handelstagen von hoechstens
 * `from` auf mindestens `to` Prozent.
 * Gemessen je Baerenmarkt: das ERSTE Signal (so, wie man es erlebt haette)
 * und wie weit es danach noch fiel; das erste TRAGENDE Signal und wie weit
 * es ueber dem Tief lag.
 * @param points [[date, value]] Marktreihe
 * @param breadth [{date, above50Pct}]
 */
export const RECOVERY_RULE = { bear: 20, from: 20, to: 65, window: 20, cooldown: 20, falseDrop: 10 };
export function recoverySignal(points, breadth, rule = RECOVERY_RULE) {
  const br = new Map(breadth.map((b) => [b.date, b.above50Pct]));
  const d = points.map((p) => p[0]), c = points.map((p) => p[1]), n = c.length;
  const thrust = (i) => {
    const t = br.get(d[i]);
    if (!isNum(t) || t < rule.to || i < rule.window) return false;
    let mn = Infinity;
    for (let k = i - rule.window; k < i; k++) { const x = br.get(d[k]); if (isNum(x)) mn = Math.min(mn, x); }
    return mn <= rule.from;
  };
  const baeren = [];
  let peak = 0, b = null;
  for (let i = 0; i < n; i++) {
    if (c[i] > c[peak]) { if (b) { b.end = i; baeren.push(b); b = null; } peak = i; }
    if (!b && c[i] <= (1 - rule.bear / 100) * c[peak]) b = { peak, start: i, trough: i };
    if (b && c[i] < c[b.trough]) b.trough = i;
  }
  if (b) { b.end = n - 1; b.open = true; baeren.push(b); }
  const pct = (a, z) => round(100 * (c[z] / c[a] - 1), 1);
  const minAb = (s, e) => { let m = Infinity; for (let k = s; k <= e; k++) m = Math.min(m, c[k]); return m; };
  const liste = baeren.map((B) => {
    const sigs = [];
    let letzt = -1e9;
    for (let i = B.start; i <= B.end; i++) if (thrust(i)) { if (i - letzt > rule.cooldown) sigs.push(i); letzt = i; }
    const falsch = (s) => minAb(s, B.end) <= (1 - rule.falseDrop / 100) * c[s];
    const erst = sigs[0], tragend = sigs.find((s) => !falsch(s));
    return {
      peak: d[B.peak], trough: d[B.trough], fall: pct(B.peak, B.trough), open: !!B.open, signals: sigs.length, falseSignals: sigs.filter(falsch).length,
      first: erst === undefined ? null : { date: d[erst], furtherDrop: round(100 * (minAb(erst, B.end) / c[erst] - 1), 1), false: falsch(erst),
        forward12: erst + 252 < n ? pct(erst, erst + 252) : null },
      firstLasting: tragend === undefined ? null : { date: d[tragend], riseFromTrough: pct(B.trough, tragend), tradingDaysFromTrough: tragend - B.trough }
    };
  });
  const med = (xs) => (xs.length ? round(median(xs), 1) : null);
  const mit = liste.filter((x) => x.first);
  return {
    rule, bears: liste.length, withSignal: mit.length, firstFalse: mit.filter((x) => x.first.false).length,
    firstFurtherDropMedian: med(mit.map((x) => x.first.furtherDrop)), worstFirst: mit.length ? Math.min.apply(null, mit.map((x) => x.first.furtherDrop)) : null,
    lastingRiseMedian: med(liste.filter((x) => x.firstLasting).map((x) => x.firstLasting.riseFromTrough)),
    forward12Median: med(mit.filter((x) => isNum(x.first.forward12)).map((x) => x.first.forward12)),
    allSignals: liste.reduce((a, x) => a + x.signals, 0), allFalse: liste.reduce((a, x) => a + x.falseSignals, 0),
    bearMarkets: liste
  };
}
