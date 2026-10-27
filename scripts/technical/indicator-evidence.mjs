#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE TECHNICAL — indicator-evidence.mjs
   HISTORISCHE EVIDENZ KLASSISCHER INDIKATOR-EREIGNISSE (beschreibend, kausal, querschnittsbereinigt)

   Gleiche Methode wie candlestick-evidence.mjs (docs/technical/CANDLESTICK_EVIDENCE.md): Ein Ereignis am Schluss
   von Bar i wird nur aus Bars <= i erkannt. Gemessen wird die Rendite Schluss i -> i+H minus dem Mittel aller Titel
   desselben Datums (>= 50 Titel), baerische Ereignisse mit umgekehrtem Vorzeichen. Mittel und Intervall ueber
   Datums-Cluster, Bonferroni ueber Zeilen x Horizonte, gemeldet ab MIN_N Ereignissen.

   Linien:
     • SMA 50/200 und RSI 14 aus bundle.chartSeries: in der Materialisierung aus der vollen Tageshistorie, je Bar
       kausal (dieselbe Quelle wie die Ereignisfelder B12 im Screener).
     • Alle uebrigen Indikatoren rechnet indicators.js auf den 270 Tagesbars. Damit Startwerte (EMA, Wilder) keine
       Rolle spielen, zaehlen deren Ereignisse erst ab Bar SETTLE.
   Ein Kreuzen an i: an i−1 nicht darueber (<=), an i darueber (>), bzw. umgekehrt.

   Schreibt nichts ausser mit --out (JSON). Aufruf:
     node scripts/technical/indicator-evidence.mjs [--out FILE] [--limit N] [--min-close P]
   --min-close P zaehlt nur Ereignisse mit Schluss >= P (Robustheit gegen Kleinwerte; der Querschnitt bleibt alle Titel).
   ========================================================================= */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stats, zFor } from "./candlestick-evidence.mjs";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const I = require(join(root, "quant/engines/technical/indicators.js"));
const SHARDS = join(root, "quant/data/product/technical-signals-v1");

export const INDICATOR_EVIDENCE_VERSION = "technical-indicator-evidence-1.0.0";
export const HORIZONS = [5, 10, 20], MIN_N = 100, SETTLE = 100;

function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
function arg(name, def) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; }
const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : null);
const up = (a, b, i) => isNum(a[i]) && isNum(b[i]) && isNum(a[i - 1]) && isNum(b[i - 1]) && a[i - 1] <= b[i - 1] && a[i] > b[i];
const down = (a, b, i) => isNum(a[i]) && isNum(b[i]) && isNum(a[i - 1]) && isNum(b[i - 1]) && a[i - 1] >= b[i - 1] && a[i] < b[i];
const level = (n, v) => new Array(n).fill(v);

/** Ereignis-Definitionen: id, Name, Richtung, Linienquelle, Erkennung an Bar i (nur Bars <= i). */
export const EVENTS = [
  { id: "goldenCross", name: "Golden Cross (SMA 50 über SMA 200)", dir: 1, src: "chart", at: (L, i) => up(L.sma50, L.sma200, i) },
  { id: "deathCross", name: "Death Cross (SMA 50 unter SMA 200)", dir: -1, src: "chart", at: (L, i) => down(L.sma50, L.sma200, i) },
  { id: "crossAboveSma200", name: "Schluss kreuzt SMA 200 aufwärts", dir: 1, src: "chart", at: (L, i) => up(L.close, L.sma200, i) },
  { id: "crossBelowSma200", name: "Schluss kreuzt SMA 200 abwärts", dir: -1, src: "chart", at: (L, i) => down(L.close, L.sma200, i) },
  { id: "rsiExitOversold", name: "RSI 14 von unten über 30", dir: 1, src: "chart", at: (L, i) => up(L.rsi14, L.l30, i) },
  { id: "rsiExitOverbought", name: "RSI 14 von oben unter 70", dir: -1, src: "chart", at: (L, i) => down(L.rsi14, L.l70, i) },
  { id: "macdCrossUp", name: "MACD kreuzt Signallinie aufwärts (12/26/9)", dir: 1, src: "bars", at: (L, i) => up(L.macd, L.macdSignal, i) },
  { id: "macdCrossDown", name: "MACD kreuzt Signallinie abwärts (12/26/9)", dir: -1, src: "bars", at: (L, i) => down(L.macd, L.macdSignal, i) },
  { id: "supertrendUp", name: "Supertrend dreht aufwärts (10, 3)", dir: 1, src: "bars", at: (L, i) => L.st[i - 1] === -1 && L.st[i] === 1 },
  { id: "supertrendDown", name: "Supertrend dreht abwärts (10, 3)", dir: -1, src: "bars", at: (L, i) => L.st[i - 1] === 1 && L.st[i] === -1 },
  { id: "psarUp", name: "Parabolic SAR dreht aufwärts", dir: 1, src: "bars", at: (L, i) => L.psar[i - 1] === -1 && L.psar[i] === 1 },
  { id: "psarDown", name: "Parabolic SAR dreht abwärts", dir: -1, src: "bars", at: (L, i) => L.psar[i - 1] === 1 && L.psar[i] === -1 },
  { id: "donchianBreakUp", name: "Schluss über dem 20-Tage-Hoch der Vortage", dir: 1, src: "bars", at: (L, i) => isNum(L.dcU[i - 1]) && L.close[i] > L.dcU[i - 1] && !(L.close[i - 1] > L.dcU[i - 2]) },
  { id: "donchianBreakDown", name: "Schluss unter dem 20-Tage-Tief der Vortage", dir: -1, src: "bars", at: (L, i) => isNum(L.dcL[i - 1]) && L.close[i] < L.dcL[i - 1] && !(L.close[i - 1] < L.dcL[i - 2]) },
  { id: "bollingerBelowLower", name: "Schluss kreuzt unteres Bollinger-Band abwärts (20, 2)", dir: 1, src: "bars", at: (L, i) => down(L.close, L.bbL, i) },
  { id: "bollingerAboveUpper", name: "Schluss kreuzt oberes Bollinger-Band aufwärts (20, 2)", dir: -1, src: "bars", at: (L, i) => up(L.close, L.bbU, i) },
  { id: "stochCrossUpOversold", name: "Stochastik %K kreuzt %D aufwärts unter 20", dir: 1, src: "bars", at: (L, i) => up(L.k, L.d, i) && L.k[i - 1] < 20 },
  { id: "stochCrossDownOverbought", name: "Stochastik %K kreuzt %D abwärts über 80", dir: -1, src: "bars", at: (L, i) => down(L.k, L.d, i) && L.k[i - 1] > 80 }
];

/** Linien eines Titels: chartSeries (Vollhistorie) und auf den 270 Bars gerechnete Indikatoren. */
export function linesOf(bars, chartSeries) {
  const n = bars.close.length, cs = chartSeries || {};
  const col = (a) => (Array.isArray(a) && a.length === n ? a.map((v) => (isNum(v) ? v : NaN)) : level(n, NaN));
  const s = { open: bars.open, high: bars.high, low: bars.low, close: bars.close, volume: bars.volume, timestamps: bars.timestamps };
  const m = I.compute(s, "macd").values, st = I.compute(s, "supertrend").values, ps = I.compute(s, "psar").values;
  const dc = I.compute(s, "donchian").values, bb = I.compute(s, "bollinger").values, so = I.compute(s, "stochastic").values;
  return {
    n, close: bars.close.map((v) => (isNum(v) ? v : NaN)),
    sma50: col(cs.sma50), sma200: col(cs.sma200), rsi14: col(cs.rsi14), l30: level(n, 30), l70: level(n, 70),
    macd: m.macd, macdSignal: m.signal, st: st.direction, psar: ps.direction, dcU: dc.upper, dcL: dc.lower,
    bbU: bb.upper, bbL: bb.lower, k: so.k, d: so.d
  };
}

/** Ereignisse eines Titels: [id, Richtung, Bar-Index]. Linien aus den Bars erst ab SETTLE (Startwerte abgeklungen). */
export function eventsOf(bars, chartSeries) {
  const L = linesOf(bars, chartSeries), out = [];
  for (const e of EVENTS) {
    const from = e.src === "bars" ? Math.max(2, SETTLE) : 2;
    for (let i = from; i < L.n; i++) if (e.at(L, i)) out.push([e.id, e.dir, i]);
  }
  return out;
}

export function build({ limit = 0, minClose = 0 } = {}) {
  const titles = [];
  for (const file of readdirSync(SHARDS).filter((x) => /^[A-Z0-9_-]{1,3}\.json\.gz$/.test(x)).sort()) {
    const shard = JSON.parse(gunzipSync(readFileSync(join(SHARDS, file))));
    for (const [ticker, it] of Object.entries(shard.instruments || {})) {
      const b = it.bars;
      if (!b || !Array.isArray(b.close) || b.close.length < 40) continue;
      titles.push({ ticker, dates: b.timestamps.map((d) => String(d).slice(0, 10)), close: b.close, events: eventsOf(b, it.bundle && it.bundle.chartSeries) });
      if (limit && titles.length >= limit) break;
    }
    if (limit && titles.length >= limit) break;
  }
  const xsec = HORIZONS.map(() => new Map());
  for (const t of titles) {
    HORIZONS.forEach((H, h) => {
      for (let i = 0; i + H < t.close.length; i++) {
        const a = t.close[i], z = t.close[i + H];
        if (!(a > 0) || !(z > 0)) continue;
        const m = xsec[h].get(t.dates[i]) || { s: 0, n: 0 };
        m.s += z / a - 1; m.n++; xsec[h].set(t.dates[i], m);
      }
    });
  }
  const rows = new Map();
  for (const t of titles) {
    for (const [id, dir, i] of t.events) {
      if (minClose && !(t.close[i] >= minClose)) continue;
      const row = rows.get(id) || { id, dir, titles: new Set(), x: HORIZONS.map(() => []) };
      row.titles.add(t.ticker);
      HORIZONS.forEach((H, h) => {
        if (i + H >= t.close.length) return;
        const a = t.close[i], z = t.close[i + H], m = xsec[h].get(t.dates[i]);
        if (!(a > 0) || !(z > 0) || !m || m.n < 50) return;
        const ex = (z / a - 1) - m.s / m.n;
        row.x[h].push([t.dates[i], dir < 0 ? -ex : ex]);
      });
      rows.set(id, row);
    }
  }
  const reported = [...rows.values()].filter((r) => r.x[HORIZONS.length - 1].length >= MIN_N);
  const z = zFor(0.05 / Math.max(1, reported.length * HORIZONS.length));
  const out = reported.map((r) => {
    const e = EVENTS.find((x) => x.id === r.id), o = { event: r.id, name: e.name, direction: r.dir > 0 ? "BULLISH" : "BEARISH", lines: e.src === "chart" ? "VOLLHISTORIE" : "270_BARS_AB_" + SETTLE, titles: r.titles.size };
    HORIZONS.forEach((H, h) => { const s = stats(r.x[h]); o["h" + H] = { n: s.n, dates: s.dates, mean: s.mean, median: s.median, ci95: s.ci95, hitRate: s.hitRate, hitRateCi95: s.hitRateCi95, significant: Math.abs(s.t) > z }; });
    return o;
  }).sort((a, b) => b.h20.n - a.h20.n);
  const dates = titles.flatMap((t) => [t.dates[0], t.dates[t.dates.length - 1]]).sort();
  return {
    schemaVersion: INDICATOR_EVIDENCE_VERSION, engine: I.INDICATORS_VERSION || null, titles: titles.length,
    window: { from: dates[0], to: dates[dates.length - 1] }, horizons: HORIZONS, minN: MIN_N, settle: SETTLE, minClose: minClose || null,
    method: "Ereignis am Schluss von Bar i (nur Bars <= i); Rendite Schluss i -> i+H minus Querschnittsmittel desselben Datums (>= 50 Titel); baerisch mit umgekehrtem Vorzeichen; Mittel und Intervall ueber Datums-Cluster; Bonferroni ueber Zeilen x Horizonte. SMA 50/200 und RSI aus der Vollhistorie (chartSeries), uebrige Linien aus den 270 Bars ab Bar " + SETTLE + ".",
    bonferroniZ: r4(z), events: out,
    notReported: [...rows.values()].filter((r) => r.x[HORIZONS.length - 1].length < MIN_N).map((r) => ({ event: r.id, n20: r.x[HORIZONS.length - 1].length }))
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const started = Date.now(), res = build({ limit: Number(arg("--limit", "0")) || 0, minClose: Number(arg("--min-close", "0")) || 0 }), out = arg("--out", null);
  if (out) writeFileSync(out, JSON.stringify(res, null, 1) + "\n");
  console.log(`${res.titles} Titel, ${res.window.from} bis ${res.window.to}, ${res.events.length} Zeilen gemeldet, z(Bonferroni) ${res.bonferroniZ}, ${Math.round((Date.now() - started) / 1000)} s`);
  for (const p of res.events) console.log(p.event.padEnd(26), p.direction.padEnd(8), String(p.h20.n).padStart(6), String(p.h20.dates).padStart(4), "h5", p.h5.mean, "h10", p.h10.mean, "h20", p.h20.mean, "±", p.h20.ci95, "Treffer", p.h20.hitRate, p.h20.significant ? "SIGNIFIKANT" : "");
  for (const p of res.notReported) console.log("nicht gemeldet:", p.event, p.n20);
}
