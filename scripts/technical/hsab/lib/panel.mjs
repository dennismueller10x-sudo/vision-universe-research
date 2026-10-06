/* =========================================================================
   VU HISTORICAL STRUCTURAL ACCURACY BENCHMARK (Mission VIII) — Kurspanel

   Laedt dieselben Reihen wie Stage 1 (gleiche Lader, gleiche ATR aus der
   Feature-Store-Spalte, die ctx.atr liefert) und legt sie auf eine
   gemeinsame Zeitachse (Woche: Freitag der Kalenderwoche; Tag: Datum).
   Dazu EINFACHE, VU-UNABHAENGIGE Zustaende je Bar fuer die gematchten
   Kontrollen und die einfachen Vergleichsmodelle:
     simpleTrend  +1  Schluss > SMA(slow) und SMA(slow) steigt (ueber 4 bzw. 20 Bars)
                  −1  spiegelbildlich, sonst 0     (Woche slow = 40, Tag = 200)
     atrPct       ATR / Schluss (Volatilitaet)
     stale        >= 4 (Woche) bzw. 10 (Tag) gleiche Schluesse in Folge bis t
   Alle Zustaende sind kausal (nur Bars <= t).
   ========================================================================= */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT, readJson, weeklySeriesFromPoints, dailySeriesFromPayload } from "../../lib/ti-data.mjs";
import { weekKey } from "../../../quant/lib/weekly-total-return.mjs";

const require = createRequire(import.meta.url);
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
const Features = require(join(ROOT, "quant/engines/technical/feature-store.js"));

export const PROFILE = {
  "1W": { H: 26, fwd: 13, slow: 40, slope: 4, year: 52, pull: 4, staleN: 4, minBars: 160, nearWin: 104 },
  "1D": { H: 126, fwd: 63, slow: 200, slope: 20, year: 252, pull: 10, staleN: 10, minBars: 520, nearWin: 504 }
};

function simpleStates(s, atr, P) {
  const n = s.length, c = s.close, trend = new Int8Array(n), stale = new Uint8Array(n);
  let sum = 0; const sma = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) { sum += c[i]; if (i >= P.slow) sum -= c[i - P.slow]; if (i >= P.slow - 1) sma[i] = sum / P.slow; }
  let flat = 0;
  for (let i = 0; i < n; i++) {
    flat = i > 0 && c[i] === c[i - 1] ? flat + 1 : 0; stale[i] = flat + 1 >= P.staleN ? 1 : 0;
    if (i >= P.slow - 1 + P.slope && Number.isFinite(sma[i])) {
      const up = sma[i] > sma[i - P.slope], dn = sma[i] < sma[i - P.slope];
      trend[i] = c[i] > sma[i] && up ? 1 : c[i] < sma[i] && dn ? -1 : 0;
    }
  }
  const atrPct = new Float64Array(n); for (let i = 0; i < n; i++) atrPct[i] = atr[i] > 0 ? atr[i] / c[i] : NaN;
  return { trend, stale, atrPct, sma };
}

function entryOf(series, symbol, cohort) {
  const prof = Ctx.profileOf(series);
  const f = Features.computeFeatures(series, prof.features);
  const tf = series.timeframe, P = PROFILE[tf];
  const atr = Float64Array.from(series.close.map((x, i) => { const a = f.columns.atr[i]; return Number.isFinite(a) ? a : x * 0.02; }));
  const keys = series.timestamps.map((d) => (tf === "1W" ? weekKey(d) : d));
  return { symbol, cohort, tf, dates: series.timestamps, keys, open: Float64Array.from(series.open), high: Float64Array.from(series.high), low: Float64Array.from(series.low),
           close: Float64Array.from(series.close), atr, ...simpleStates(series, atr, P), length: series.length };
}

/**
 * Panel aus denselben Quellen wie Stage 1.
 * @param {{weeklyDir?:string, delisted?:string, workDir?:string, only?:Set<string>}} src
 */
export function loadPanel(src) {
  const list = [];
  if (src.weeklyDir) for (const f of readdirSync(src.weeklyDir).filter((x) => x.startsWith("ref_") && x.endsWith(".json")).sort()) {
    const sym = f.replace(/\.json$/, ""); if (src.only && !src.only.has(sym)) continue;
    const x = readJson(join(src.weeklyDir, f)); const s = weeklySeriesFromPoints((x.points || []).filter((p) => !src.historyFrom || p[0] >= src.historyFrom), x.ticker);
    if (s.length >= 2) list.push(entryOf(s, sym, "SURV_W"));
  }
  if (src.delisted) {
    const b = JSON.parse(readFileSync(src.delisted, "utf8"));
    for (const l of b.listings || []) {
      if (!l || !l.w0 || !Array.isArray(l.c)) continue;
      const sym = "DL:" + (l.id || l.ticker); if (src.only && !src.only.has(sym)) continue;
      const t0w = Date.parse(l.w0 + "T00:00:00Z"), points = [];
      l.c.forEach((c, i) => { if (c > 0) points.push([new Date(t0w + i * 7 * 864e5).toISOString().slice(0, 10), c]); });
      const s = weeklySeriesFromPoints(points, sym); if (s.length >= 2) list.push(entryOf(s, sym, "DELISTED_W"));
    }
  }
  if (src.workDir) { const dd = join(src.workDir, "tiingo", "daily");
    for (const f of readdirSync(dd).filter((x) => x.endsWith(".json")).sort()) {
      const sym = "D:" + f.replace(/\.json$/, ""); if (src.only && !src.only.has(sym)) continue;
      try { const x = readJson(join(dd, f)); const s = dailySeriesFromPayload(x, x.ticker); if (s && s.length >= 2) { const e = entryOf(s, sym, "SURV_D"); const dv = dollarVolume(x); e.dollarVol = dv.length === e.length ? dv : null; list.push(e); } } catch { /* unlesbar */ }
    } }
  const bySym = new Map(list.map((e, k) => [e.symbol, k]));
  /* Zeitachse: Schluessel → Liste [Titelindex, lokaler Index] */
  const byKey = new Map();
  list.forEach((e, si) => e.keys.forEach((k, i) => { let a = byKey.get(k); if (!a) byKey.set(k, (a = [])); a.push(si, i); }));
  return { list, bySym, byKey };
}

/** Median-Dollarvolumen (Rohkurs × Volumen) der letzten 20 Tage je Bar — kausal, nur Tagesdaten. */
function dollarVolume(payload) {
  const bars = (payload.bars || []).filter((b) => b.close > 0);
  const out = new Float64Array(bars.length).fill(NaN), win = [];
  for (let i = 0; i < bars.length; i++) {
    win.push((bars[i].close || 0) * (bars[i].volume || 0)); if (win.length > 20) win.shift();
    if (win.length === 20) { const s = win.slice().sort((a, b) => a - b); out[i] = (s[9] + s[10]) / 2; }
  }
  return out;
}

/** Ist Bar i eines Panel-Eintrags als Kontrolle/Ereignis zulaessig (genug Historie, nicht tot, ATR > 0)? */
export function eligible(e, i, minBars) { return i >= minBars - 1 && !e.stale[i] && e.atr[i] > 0 && e.close[i] > 0; }
