#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE TECHNICAL — formation-evidence.mjs
   HISTORISCHE EVIDENZ DER FORMATIONEN (kausal, querschnittsbereinigt)

   Je Titel (technical-signals-v1, 270 Tagesbars, SPLIT_ADJUSTED) wird die
   Formationserkennung an jedem STRIDE-ten Bar "Stand t" ausgefuehrt
   (formations.js#analyzeAt, nur Daten <= t). Jede Formation zaehlt einmal,
   am ersten Stand k, an dem sie sichtbar war (Kenntniszeitpunkt).

   Ergebnis je Erkennung, gemessen ab k (nie ab dem frueheren detectedAt):
     state20      Zustand der Formation Stand k+H (H = 20 Bars):
                  CONFIRMED / DETECTED / INVALIDATED / EXPIRED (nicht mehr gefuehrt)
     excess20     richtungsbereinigte Rendite Schluss k -> k+H minus dem
                  Durchschnitt aller Titel desselben Datums (Querschnitt)
   Je Typ: n, Bestaetigungs-/Invalidierungsquote, mittlere und mediane
   Ueberrendite, Trefferquote (Ueberrendite > 0) mit 95-%-Intervall.
   Veroeffentlicht wird ein Typ erst ab MIN_N Erkennungen; das Fenster
   (ein Jahr, ein Marktregime) steht im Ergebnis.

   Aufruf: node scripts/technical/world/formation-evidence.mjs [--out FILE] [--limit N] [--stride 1]
   ========================================================================= */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const Canonical = require(join(root, "quant/engines/technical/canonical-bars.js"));
const Ctx = require(join(root, "quant/engines/technical/ti/context.js"));
const Fm = require(join(root, "quant/engines/technical/formations.js"));

export const EVIDENCE_VERSION = "technical-formation-evidence-1.0.0";
export const HORIZON = 20, MIN_N = 100, WARMUP = 120;
/* Viele Typen werden gleichzeitig geprueft: Signifikanz nur mit Bonferroni-Korrektur (z fuer 0,05 / Anzahl Typen). */
function zFor(alpha) { let lo = 0, hi = 10; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2, p = 0.5 * erfc(m / Math.SQRT2); if (p > alpha / 2) lo = m; else hi = m; } return (lo + hi) / 2; }
function erfc(x) { const t = 1 / (1 + 0.5 * Math.abs(x)), y = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? y : 2 - y; }

function arg(name, def) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; }
function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

/**
 * Erkennungen eines Titels: erster Kenntnisstand k je Formation und ihr Zustand bis k+H. Rein kausal: an jedem Bar t
 * nur analyzeAt(prep, t). Faellt eine Formation vor k+H aus dem Erkennungsfenster (Ausbrueche nach 10 Bars), zaehlt ihr
 * zuletzt bekannter Stand mit Bestaetigungs- und Invalidierungsdatum (<= k+H).
 */
export function detectionsOf(series, stride) {
  const prep = Ctx.prepare(series), n = series.length, first = new Map(), last = new Map();
  for (let t = WARMUP; t < n; t += stride) {
    for (const f of Fm.analyzeAt(prep, t).formations) {
      if (!first.has(f.id)) first.set(f.id, { f, k: t });
      last.set(f.id + "@" + t, f);
      const e = first.get(f.id);
      if (t <= e.k + HORIZON) { e.lastSeen = f; e.lastT = t; }
    }
  }
  const out = [];
  for (const { f, k, lastSeen, lastT } of first.values()) {
    if (k + HORIZON > n - 1) continue;
    const end = series.timestamps[k + HORIZON], ls = lastSeen || f, sign = f.direction === "BEARISH" ? -1 : 1;
    const conf = !!(ls.confirmedAt && ls.confirmedAt <= end), inv = !!(ls.invalidatedAt && ls.invalidatedAt <= end);
    /* Entfallen: vor k+H nicht mehr gefuehrt, ohne dass Bestaetigung oder Invalidierung festgehalten wurde. */
    const dropped = !conf && !inv && (lastT === undefined ? k : lastT) < k + HORIZON;
    out.push({ type: f.type, family: f.family, direction: f.direction, k, date: series.timestamps[k], stateAtK: f.state,
      state20: inv ? "INVALIDATED" : conf ? "CONFIRMED" : dropped ? "DROPPED" : "DETECTED", confirmedBy20: conf, invalidatedBy20: inv, droppedBy20: dropped,
      ret20: sign * (series.close[k + HORIZON] / series.close[k] - 1), sign });
  }
  return out;
}

function stats(xs) {
  const n = xs.length, mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const s = xs.slice().sort((a, b) => a - b), med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  return { mean, sd, median: med, ci95: 1.96 * sd / Math.sqrt(n) };
}
function wilson(k, n) {
  if (!n) return [null, null];
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [c - h, c + h];
}
const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : null);

export function build({ limit = 0, stride = 1, signalsDir = join(root, "quant/data/product/technical-signals-v1") } = {}) {
  const shards = readdirSync(signalsDir).filter((f) => /^[A-Z0-9_]{2}\.json\.gz$/.test(f)).sort();
  const all = [], fwd = new Map(); let titles = 0, from = null;
  outer: for (const sh of shards) {
    const doc = JSON.parse(gunzipSync(readFileSync(join(signalsDir, sh))).toString("utf8"));
    for (const ticker of Object.keys(doc.instruments || {}).sort()) {
      const b = doc.instruments[ticker].bars;
      if (!b || !b.close || b.close.length < WARMUP + HORIZON + 10) continue;
      const series = Canonical.fromRows(b.timestamps.map((d, i) => ({ date: d, open: b.open[i], high: b.high[i], low: b.low[i], close: b.close[i], volume: b.volume[i] })),
        { instrumentId: ticker, exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "tiingo", sourceRevision: "technical-signals-v1" });
      /* Querschnitt: 20-Tage-Rendite je Datum ueber alle Titel (Basis fuer die Ueberrendite). */
      for (let k = WARMUP; k + HORIZON < series.length; k += stride) {
        const r = series.close[k + HORIZON] / series.close[k] - 1;
        if (!isNum(r) || Math.abs(r) > 3) continue;
        const e = fwd.get(series.timestamps[k]) || [0, 0]; e[0] += r; e[1]++; fwd.set(series.timestamps[k], e);
      }
      try {
        for (const d of detectionsOf(series, stride)) { d.ticker = ticker; all.push(d); }
      } catch (e) { /* Titel ohne auswertbare Pivots */ }
      titles++;
      if (limit && titles >= limit) break outer;
    }
  }
  const byType = {}; let usedFrom = null, usedTo = null;
  for (const d of all) {
    const base = fwd.get(d.date); if (!base || base[1] < 50 || !isNum(d.ret20) || Math.abs(d.ret20) > 3) continue;
    d.excess20 = d.ret20 - d.sign * base[0] / base[1];
    if (!usedFrom || d.date < usedFrom) usedFrom = d.date; if (!usedTo || d.date > usedTo) usedTo = d.date;
    (byType[d.type] = byType[d.type] || []).push(d);
  }
  const typeIds = Object.keys(byType).sort(), zB = zFor(0.05 / Math.max(1, typeIds.length));
  const types = typeIds.map((type) => {
    const ds = byType[type], n = ds.length, ex = stats(ds.map((d) => d.excess20)), hits = ds.filter((d) => d.excess20 > 0).length;
    const count = (s) => ds.filter((d) => d.state20 === s).length, atK = (s) => ds.filter((d) => d.stateAtK === s).length;
    return { type, family: ds[0].family, direction: ds[0].direction, n, titles: new Set(ds.map((d) => d.ticker)).size, published: n >= MIN_N,
      confirmedAtDetection: r4(atK("CONFIRMED") / n),
      confirmedBy20: r4(ds.filter((d) => d.confirmedBy20).length / n), invalidatedBy20: r4(ds.filter((d) => d.invalidatedBy20).length / n), droppedBy20: r4(count("DROPPED") / n), openAt20: r4(count("DETECTED") / n),
      excess20Mean: r4(ex.mean), excess20Median: r4(ex.median), excess20Ci95: r4(ex.ci95),
      /* belastbar nur, wenn das Bonferroni-Intervall die 0 nicht enthaelt */
      significant: n >= MIN_N && Math.abs(ex.mean) > zB * ex.sd / Math.sqrt(n),
      hitRate: r4(hits / n), hitRateCi95: wilson(hits, n).map(r4) };
  });
  return { schemaVersion: "vu-technical-formation-evidence-1.0.0", version: EVIDENCE_VERSION, engine: Fm.ENGINE_VERSION,
    window: { from: usedFrom, to: usedTo, bars: "270 Tagesbars je Titel (technical-signals-v1)", regime: "rund ein Marktjahr; kein voller Zyklus" },
    method: { horizonBars: HORIZON, stride, minN: MIN_N, knowledgeTime: "erster Stand k, an dem die Formation sichtbar war (analyzeAt, nur Daten <= k)",
      outcome: "Zustand Stand k+20 und richtungsbereinigte Rendite Schluss k -> k+20 minus Querschnittsmittel desselben Datums (nur Daten mit mindestens 50 Titeln)",
      states: "bestaetigt / invalidiert bis k+20 laut Formation; entfallen = vorher nicht mehr gefuehrt, ohne festgehaltene Bestaetigung oder Invalidierung",
      significance: "Bonferroni ueber alle Typen, alpha 5 %",
      costs: "keine (beschreibende Statistik, keine Handelssimulation)" },
    titles, detections: all.length, types };
}

export function buildAndWrite(out, options) {
  const t0 = Date.now(), res = build(options || {});
  res.runtimeSec = Math.round((Date.now() - t0) / 1000);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(res) + "\n");
  return res;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t0 = Date.now(), res = build({ limit: Number(arg("--limit", "0")) || 0, stride: Number(arg("--stride", "1")) || 1 });
  res.runtimeSec = Math.round((Date.now() - t0) / 1000);
  const out = arg("--out", null);
  if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(res, null, 1) + "\n"); }
  console.log(JSON.stringify({ titles: res.titles, detections: res.detections, runtimeSec: res.runtimeSec, window: res.window }));
  for (const t of res.types) console.log(t.type.padEnd(28), String(t.n).padStart(6), "beiErk", t.confirmedAtDetection, "conf", t.confirmedBy20, "inv", t.invalidatedBy20, "entf", t.droppedBy20, "ex", t.excess20Mean, "±", t.excess20Ci95, "hit", t.hitRate, t.published ? "" : "(n<" + MIN_N + ")");
}
