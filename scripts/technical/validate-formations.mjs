#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE TECHNICAL — validate-formations.mjs (L5)

   Prueft jede aktive Formation des materialisierten Universums gegen die
   Geometrie ihrer eigenen dokumentierten Regel und gegen den Lehrbuchkern
   der Formation. Kein Urteil ueber die Wirkung (das ist formation-evidence),
   sondern: Ist das, was erkannt wurde, geometrisch das, was der Name sagt?

   Pruefungen je Erkennung:
     gemeinsam  Kausal (alle Punkte, Linien, Erkennung <= Stichtag), Preise
                endlich und > 0, Zustand gueltig, Bestaetigung/Invalidierung
                nicht vor der Erkennung, Richtung passt zum Typ.
     Dreiecke   aufsteigend: Hochs gleich (≤ Toleranz), Tiefs steigen;
                absteigend: Spiegelbild; symmetrisch: Hochs fallen, Tiefs
                steigen; Rechteck: beide gleich, Breite ≥ 3 ATR.
     Keile      beide Linien in Trendrichtung, die Spanne verengt sich um
                mindestens 25 % (Linien am Anfang und Ende des Musters).
     Kanaele    beide Linien gleichgerichtet, Steigungen weichen ≤ 35 % ab.
     Wimpel     obere Linie fallend, untere steigend, Mast ≥ 5 ATR.
     Flaggen    Mast ≥ 5 ATR, Invalidierung = Mastende ∓ 50 % Mast.
     Doppel-    die beiden Extrema liegen innerhalb der Toleranz, das
     top/-boden Zwischenextrem liegt auf der anderen Seite.
     SKS        Kopf ist das Extrem, Schultern innerhalb 1,5 Toleranzen.
     Trendlinie Unterstuetzung steigt, Widerstand faellt.
     Luecken    Tagestief ueber Vortageshoch (bzw. umgekehrt) am Erkennungstag.
     Ausbruch   bestaetigte Linienformationen (Dreiecke, Rechteck, Keile, SKS, Doppeltop/-boden, Wimpel):
                Schluss jenseits der gezeichneten Ausbruchslinie zwischen letztem Punkt und confirmedAt, und kein
                frueherer deutlicher Schluss jenseits (FORMATION_VALIDATION.md §8). Linien im Bar-Raum wie Engine
                und Chart.
   Toleranz = max(0,75 ATR, 2,5 % des Kurses) wie ti/chart-patterns.js,
   mit 5 % Rundungsreserve (Linien und Punkte sind auf 4 Stellen gerundet).

   Spiegeltest (--mirror): Jede Reihe wird linear um ihre Mitte gespiegelt (p' = max + min − p, Hoch und
   Tief vertauscht; Abstaende und ATR bleiben gleich). Jede Formation muss als Gegenstueck am selben Tag
   erscheinen (Aufwaerts- ↔ Abwaertsdreieck, Keile, Kanaele, Wimpel, Flaggen, Doppeltop ↔ -boden, SKS,
   Trendlinien, Luecken). Prozentregeln (2,5 % des Kurses, 15 % Range) und Gleichstaende bei Pivots
   machen den Test nicht exakt; er misst die Symmetrie, er beweist sie nicht.

   Ausfuehren: node scripts/technical/validate-formations.mjs [--mirror] [--out bericht.json]
   Schreibt nichts ausser optional --out.
   ========================================================================= */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const F = require(join(root, "quant/engines/technical/formations.js"));
const I = require(join(root, "quant/engines/technical/indicators.js"));
const Cn = require(join(root, "quant/engines/technical/canonical-bars.js"));
const Ctx = require(join(root, "quant/engines/technical/ti/context.js"));
const SHARDS = join(root, "quant/data/product/technical-signals-v1");
const STATES = new Set(["DETECTED", "CONFIRMED", "INVALIDATED", "FORMING", "ACTIVE", "EXPIRED"]);
const BULL = new Set(["SUPPORT_TRENDLINE", "ASCENDING_CHANNEL", "FALLING_WEDGE", "BULL_PENNANT", "RANGE_BREAKOUT", "RESISTANCE_BREAKOUT", "VOLATILITY_CONTRACTION", "GAP_UP", "DOUBLE_BOTTOM", "INVERSE_HEAD_AND_SHOULDERS", "ASCENDING_TRIANGLE", "BULL_FLAG", "CUP_WITH_HANDLE"]);
const BEAR = new Set(["RESISTANCE_TRENDLINE", "DESCENDING_CHANNEL", "RISING_WEDGE", "BEAR_PENNANT", "GAP_DOWN", "DOUBLE_TOP", "HEAD_AND_SHOULDERS", "DESCENDING_TRIANGLE", "BEAR_FLAG"]);

const day = (s) => Date.parse(String(s).slice(0, 10) + "T00:00:00Z") / 864e5;
const fin = Number.isFinite;
/* Linien sind im Bar-Raum gerade (Engine: lineThrough je Bar-Index; Chart: x = Bar-Index). Mit Tagesbars im Kontext
   wird deshalb ueber den Bar-Index interpoliert, ohne Bars ersatzweise ueber Kalendertage. */
let POS = null;
const pos = (t) => { const k = POS && POS.get(String(t).slice(0, 10)); return k === undefined || k === null ? day(t) : k; };
const slope = (l) => (l.to.price - l.from.price) / Math.max(1, pos(l.to.time) - pos(l.from.time));
const at = (l, t) => l.from.price + slope(l) * (pos(t) - pos(l.from.time));
const line = (f, role) => (f.lines || []).find((l) => l.role === role);
const posMaps = new WeakMap();
function positions(bars) {
  if (!bars || !bars.timestamps) return null;
  if (!posMaps.has(bars)) posMaps.set(bars, new Map(bars.timestamps.map((x, i) => [String(x).slice(0, 10), i])));
  return posMaps.get(bars);
}
/* Rundung der Linienpunkte und Kursniveaus auf 4 Stellen (FORMATION_VALIDATION.md §7: AIM, BPYPM, CCZ). */
const EPS = 1e-4;

/** Ausbruchslinie der Bestaetigungsregel je Typ, so wie die Regeltexte sie nennen. null = Regel ohne Linie. */
function breakoutRule(f) {
  const t = f.type, up = f.direction === "BULLISH";
  if (/TRIANGLE$/.test(t) || t === "RECTANGLE") return { line: line(f, up ? "upper" : "lower"), up };
  if (t === "RISING_WEDGE") return { line: line(f, "lower"), up: false, atrMargin: 0.1 };
  if (t === "FALLING_WEDGE") return { line: line(f, "upper"), up: true, atrMargin: 0.1 };
  if (t === "HEAD_AND_SHOULDERS" || t === "INVERSE_HEAD_AND_SHOULDERS") return { line: line(f, "neckline"), up: t === "INVERSE_HEAD_AND_SHOULDERS" };
  if (t === "DOUBLE_TOP" || t === "DOUBLE_BOTTOM") return { level: f.levels && f.levels.breakout, up: t === "DOUBLE_BOTTOM" };
  /* Wimpel: zusaetzlich jenseits des juengsten Konsolidierungsextrems, das nicht in der Ausgabe steht. Nur die Linie
     ist pruefbar, nicht der frueheste Zeitpunkt. */
  if (t === "BULL_PENNANT") return { line: line(f, "upper"), up: true, onlyExists: true };
  if (t === "BEAR_PENNANT") return { line: line(f, "lower"), up: false, onlyExists: true };
  return null;
}

/** @returns {string[]} verletzte Regeln (leer = gueltig) */
export function check(f, ctx) {
  const v = [], asOf = ctx.asOf, atr = (f.dataQuality && f.dataQuality.atr) || ctx.atr;
  POS = positions(ctx.bars);
  const pts = f.points || [], lines = f.lines || [];
  /* gemeinsam */
  if (!(f.detectedAt <= asOf)) v.push("ERKENNUNG_NACH_STICHTAG");
  for (const p of pts) { if (!(String(p.time).slice(0, 10) <= asOf)) v.push("PUNKT_NACH_STICHTAG"); if (!(fin(p.price) && p.price > 0)) v.push("PUNKT_PREIS"); }
  for (const l of lines) for (const e of [l.from, l.to]) if (!(fin(e.price))) v.push("LINIE_PREIS");
  if (lines.some((l) => String(l.from.time).slice(0, 10) > asOf)) v.push("LINIE_BEGINNT_NACH_STICHTAG");
  if (!STATES.has(f.state)) v.push("ZUSTAND");
  if (f.confirmedAt && f.confirmedAt < f.detectedAt) v.push("BESTAETIGT_VOR_ERKENNUNG");
  if (f.invalidatedAt && f.invalidatedAt < f.detectedAt) v.push("INVALIDIERT_VOR_ERKENNUNG");
  if (!f.directionOpen && BULL.has(f.type) && f.direction !== "BULLISH") v.push("RICHTUNG");
  if (!f.directionOpen && BEAR.has(f.type) && f.direction !== "BEARISH") v.push("RICHTUNG");
  const highs = pts.filter((p) => p.side === "HIGH").map((p) => p.price), lows = pts.filter((p) => p.side === "LOW").map((p) => p.price);
  /* Toleranz wie ti/chart-patterns.js: ATR und Kurs am Bestaetigungsbar des juengsten Pivots. Dieser Bar steht
     nicht in der Ausgabe; ersatzweise gilt der Erkennungsbar (≥ Bestaetigung) mit 15 % Reserve. */
  const di = isFinite(f.detectedIndex) ? f.detectedIndex : -1;
  const atrD = ctx.atrSeries && di >= 0 && isFinite(ctx.atrSeries[di]) ? ctx.atrSeries[di] : atr;
  const closeD = ctx.bars && di >= 0 ? ctx.bars.close[di] : ctx.close;
  const tol = Math.max(0.75 * Math.max(atr, atrD), 0.025 * closeD) * 1.15;
  /* Mast gegen die kleinere positive ATR (Stichtag oder Erkennung). ATR 0 am Stichtag (ruhender Titel) ist kein Massstab. */
  const atrMast = Math.min(...[atr, atrD].filter((x) => fin(x) && x > 0));
  const t = f.type;
  if (t === "ASCENDING_TRIANGLE" || t === "DESCENDING_TRIANGLE" || t === "SYMMETRICAL_TRIANGLE" || t === "RECTANGLE") {
    /* wie die Engine: erstes und letztes Hoch bzw. Tief im Fenster der letzten fuenf Pivots */
    const h1 = highs[0], h2 = highs[highs.length - 1], l1 = lows[0], l2 = lows[lows.length - 1];
    if (!(fin(h1) && fin(h2) && fin(l1) && fin(l2))) v.push("PUNKTE_FEHLEN");
    else {
      const flatH = Math.abs(h1 - h2) <= tol, flatL = Math.abs(l1 - l2) <= tol;
      if (t === "ASCENDING_TRIANGLE" && !(flatH && l2 > l1)) v.push("GEOMETRIE");
      if (t === "DESCENDING_TRIANGLE" && !(flatL && h2 < h1)) v.push("GEOMETRIE");
      if (t === "SYMMETRICAL_TRIANGLE" && !(h2 < h1 && l2 > l1)) v.push("GEOMETRIE");
      if (t === "RECTANGLE" && !(flatH && flatL && Math.max(h1, h2) - Math.min(l1, l2) >= 3 * Math.min(atr, atrD) * 0.95)) v.push("GEOMETRIE");
    }
    /* Die gezeichneten Kanten tragen den Typ (FORMATION_VALIDATION.md §6): symmetrisch = oben fallend und unten steigend,
       aufsteigend = oben waagrecht und unten steigend, absteigend = unten waagrecht und oben fallend. */
    if (t !== "RECTANGLE") {
      const u = line(f, "upper"), lo = line(f, "lower");
      if (!u || !lo) v.push("LINIEN_FEHLEN");
      else {
        const du = u.to.price - u.from.price, dl = lo.to.price - lo.from.price;
        const ok = t === "SYMMETRICAL_TRIANGLE" ? du < 0 && dl > 0 : t === "ASCENDING_TRIANGLE" ? du === 0 && dl > 0 : dl === 0 && du < 0;
        if (!ok) v.push("LINIEN_PASSEN_NICHT_ZUM_TYP");
      }
    }
  }
  if (t === "RISING_WEDGE" || t === "FALLING_WEDGE" || t === "ASCENDING_CHANNEL" || t === "DESCENDING_CHANNEL") {
    const u = line(f, "upper"), lo = line(f, "lower");
    if (!u || !lo) v.push("LINIEN_FEHLEN");
    else {
      const su = slope(u), sl = slope(lo), sgn = t === "RISING_WEDGE" || t === "ASCENDING_CHANNEL" ? 1 : -1;
      if (!(Math.sign(su) === sgn && Math.sign(sl) === sgn)) v.push("STEIGUNG_RICHTUNG");
      const start = Math.max(day(u.from.time), day(lo.from.time)), end = Math.min(day(u.to.time), day(lo.to.time));
      const w0 = at(u, new Date(start * 864e5).toISOString()) - at(lo, new Date(start * 864e5).toISOString());
      const w1 = at(u, new Date(end * 864e5).toISOString()) - at(lo, new Date(end * 864e5).toISOString());
      if (t.endsWith("WEDGE")) { if (!(w0 > 0 && w1 <= 0.75 * w0 * 1.02)) v.push("KEIN_VERENGEN"); }
      else if (!(Math.abs(su - sl) <= 0.35 * Math.max(Math.abs(su), Math.abs(sl)) * 1.02)) v.push("NICHT_PARALLEL");
    }
  }
  if (t === "BULL_PENNANT" || t === "BEAR_PENNANT") {
    const u = line(f, "upper"), lo = line(f, "lower");
    if (!u || !lo) v.push("LINIEN_FEHLEN");
    else if (!(slope(u) <= 0 && slope(lo) >= 0)) v.push("KEINE_KONVERGENZ");
    if (!(f.levels && f.levels.pole >= 5 * atrMast * 0.98)) v.push("MAST_ZU_KURZ");
  }
  if (t === "BULL_FLAG" || t === "BEAR_FLAG") {
    const lv = f.levels || {}, d = t === "BULL_FLAG" ? 1 : -1, [p0, p1] = pts;
    if (!(p0 && p1)) v.push("PUNKTE_FEHLEN");
    else {
      const pole = (p1.price - p0.price) * d;
      if (!(pole >= 5 * atrMast * 0.98)) v.push("MAST_ZU_KURZ");
      if (!(Math.abs(lv.invalidation - (p1.price - d * 0.5 * pole)) <= 1e-3 * p1.price)) v.push("INVALIDIERUNG");
    }
  }
  if (t === "DOUBLE_TOP" || t === "DOUBLE_BOTTOM") {
    const [a, m, b] = pts;
    if (!(a && m && b)) v.push("PUNKTE_FEHLEN");
    else {
      if (!(Math.abs(a.price - b.price) <= tol)) v.push("EXTREMA_UNGLEICH");
      if (t === "DOUBLE_TOP" ? !(m.price < Math.min(a.price, b.price)) : !(m.price > Math.max(a.price, b.price))) v.push("ZWISCHENEXTREM");
    }
  }
  if (t === "HEAD_AND_SHOULDERS" || t === "INVERSE_HEAD_AND_SHOULDERS") {
    const [s1, , hd, , s2] = pts, d = t === "HEAD_AND_SHOULDERS" ? 1 : -1;
    if (!(s1 && hd && s2)) v.push("PUNKTE_FEHLEN");
    else {
      if (!(hd.price * d > Math.max(s1.price * d, s2.price * d))) v.push("KOPF_NICHT_EXTREM");
      if (!(Math.abs(s1.price - s2.price) <= 1.5 * tol)) v.push("SCHULTERN_UNGLEICH");
    }
  }
  if (t === "SUPPORT_TRENDLINE" || t === "RESISTANCE_TRENDLINE") {
    const l = lines[0];
    if (!l) v.push("LINIE_FEHLT");
    else if (t === "SUPPORT_TRENDLINE" ? !(slope(l) > 0) : !(slope(l) < 0)) v.push("STEIGUNG_RICHTUNG");
  }
  if ((t === "GAP_UP" || t === "GAP_DOWN") && ctx.bars) {
    const b = ctx.bars, i = b.timestamps.findIndex((x) => String(x).slice(0, 10) === f.detectedAt);
    if (i < 1) v.push("LUECKE_TAG_FEHLT");
    else if (t === "GAP_UP" ? !(b.low[i] > b.high[i - 1]) : !(b.high[i] < b.low[i - 1])) v.push("KEINE_LUECKE");
  }
  /* Bestaetigung gegen die gezeichnete Ausbruchslinie: Zwischen dem letzten Formationspunkt und confirmedAt liegt ein
     Schluss jenseits der Linie (sonst BESTAETIGT_OHNE_AUSBRUCH). Und kein frueherer Schluss lag deutlich jenseits, der
     schon eine fruehere Bestaetigung ergeben haette (frueheste = max(Ausbruch, Erkennung); sonst BESTAETIGUNG_VERSPAETET). */
  const br = f.confirmedAt && ctx.bars ? breakoutRule(f) : null;
  if (br && (br.line || fin(br.level))) {
    const b = ctx.bars, ci = POS.get(f.confirmedAt), last = pts.length ? pts[pts.length - 1].time : f.detectedAt, li = POS.get(String(last).slice(0, 10));
    if (ci === undefined || li === undefined) v.push("BESTAETIGUNG_TAG_FEHLT");
    else {
      const m = br.atrMargin && ctx.atrSeries && fin(ctx.atrSeries[di]) ? br.atrMargin * ctx.atrSeries[di] : 0, d = br.up ? 1 : -1;
      const lv = (i) => (br.line ? at(br.line, b.timestamps[i]) : br.level) + d * m;
      const beyond = (i, eps) => d * (b.close[i] - lv(i)) > eps;
      let seen = false;
      for (let i = li + 1; i <= ci && !seen; i++) seen = beyond(i, -EPS);
      if (!seen) v.push("BESTAETIGT_OHNE_AUSBRUCH");
      if (!br.onlyExists) for (let i = li + 1; i < ci; i++) if (beyond(i, EPS) && Math.max(i, di) < ci) { v.push("BESTAETIGUNG_VERSPAETET"); break; }
    }
  }
  return [...new Set(v)];
}

const MIRROR = { ASCENDING_TRIANGLE: "DESCENDING_TRIANGLE", DESCENDING_TRIANGLE: "ASCENDING_TRIANGLE", SYMMETRICAL_TRIANGLE: "SYMMETRICAL_TRIANGLE",
  RECTANGLE: "RECTANGLE", RISING_WEDGE: "FALLING_WEDGE", FALLING_WEDGE: "RISING_WEDGE", ASCENDING_CHANNEL: "DESCENDING_CHANNEL",
  DESCENDING_CHANNEL: "ASCENDING_CHANNEL", BULL_PENNANT: "BEAR_PENNANT", BEAR_PENNANT: "BULL_PENNANT", BULL_FLAG: "BEAR_FLAG", BEAR_FLAG: "BULL_FLAG",
  DOUBLE_TOP: "DOUBLE_BOTTOM", DOUBLE_BOTTOM: "DOUBLE_TOP", HEAD_AND_SHOULDERS: "INVERSE_HEAD_AND_SHOULDERS",
  INVERSE_HEAD_AND_SHOULDERS: "HEAD_AND_SHOULDERS", SUPPORT_TRENDLINE: "RESISTANCE_TRENDLINE", RESISTANCE_TRENDLINE: "SUPPORT_TRENDLINE",
  GAP_UP: "GAP_DOWN", GAP_DOWN: "GAP_UP" };

/** Lineare Spiegelung um die Mitte der Reihe: Abstaende und ATR bleiben gleich, Hoch und Tief tauschen. */
export function mirrorBars(b) {
  const K = Math.max(...b.high) + Math.min(...b.low), m = (x) => K - x;
  return { timestamps: b.timestamps, open: b.open.map(m), high: b.low.map(m), low: b.high.map(m), close: b.close.map(m), volume: b.volume };
}
function seriesOf(ticker, b) {
  const rows = b.timestamps.map((x, i) => ({ timestamp: x, open: b.open[i], high: b.high[i], low: b.low[i], close: b.close[i], volume: b.volume[i] }));
  return Cn.fromRows(rows, { instrumentId: ticker, timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED" });
}

export function run(opts = {}) {
  const byType = {}, examples = {}, mirror = {};
  let titles = 0;
  for (const file of readdirSync(SHARDS).filter((x) => /^[A-Z0-9_-]{1,3}\.json\.gz$/.test(x))) {
    const shard = JSON.parse(gunzipSync(readFileSync(join(SHARDS, file))));
    for (const [ticker, it] of Object.entries(shard.instruments)) {
      const b = it.bars;
      let s;
      try { s = seriesOf(ticker, b); } catch { continue; }
      const r = F.analyze(s);
      /* Sichtbarkeit (B-F3): jede Formation muss am Erkennungstag mit dem damaligen Wissen erscheinen. */
      const prep = Ctx.prepare(s), seenAt = {};
      const visible = (f) => f.detectedIndex < 0 || (seenAt[f.detectedIndex] = seenAt[f.detectedIndex] || F.analyzeAt(prep, f.detectedIndex).formations).some((x) => x.id === f.id);
      const atrSeries = I.atr(b.high, b.low, b.close, 14);
      let mirrored = null;
      if (opts.mirror && b.low.every((x) => x > 0)) {
        try { mirrored = new Map(F.analyze(seriesOf(ticker, mirrorBars(b))).formations.map((x) => [x.type + "@" + x.detectedAt, x])); } catch { mirrored = null; }
      }
      titles++;
      for (const f of r.formations) {
        const v = check(f, { asOf: r.asOf, close: b.close[b.close.length - 1], bars: b, atrSeries });
        if (!visible(f)) v.push("NICHT_SICHTBAR_AM_ERKENNUNGSTAG");
        if (mirrored && MIRROR[f.type]) {
          const ms = (mirror[f.type] = mirror[f.type] || { n: 0, mirrored: 0, sameState: 0 }), y = mirrored.get(MIRROR[f.type] + "@" + f.detectedAt);
          ms.n++;
          if (y) { ms.mirrored++; if (y.state === f.state) ms.sameState++; }
        }
        const st = (byType[f.type] = byType[f.type] || { n: 0, ok: 0, violations: {} });
        st.n++;
        if (!v.length) st.ok++;
        for (const k of v) {
          st.violations[k] = (st.violations[k] || 0) + 1;
          const ex = (examples[f.type + ":" + k] = examples[f.type + ":" + k] || []);
          if (ex.length < 3) ex.push(ticker + " " + f.id);
        }
      }
    }
  }
  return { engine: F.ENGINE_VERSION, titles, byType, examples, mirror: opts.mirror ? mirror : null };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6) || (process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null);
  const r = run({ mirror: process.argv.includes("--mirror") });
  let n = 0, ok = 0;
  for (const [t, s] of Object.entries(r.byType).sort()) {
    n += s.n; ok += s.ok;
    console.log(t.padEnd(28), String(s.ok).padStart(6), "/", String(s.n).padEnd(6), Object.keys(s.violations).length ? JSON.stringify(s.violations) : "");
  }
  console.log("gesamt", ok, "/", n, "gueltig bei", r.titles, "Titeln,", r.engine);
  if (r.mirror) for (const [t, m] of Object.entries(r.mirror).sort()) console.log("Spiegel", t.padEnd(28), m.mirrored, "/", m.n, (100 * m.mirrored / m.n).toFixed(1) + " %", "gleicher Zustand", m.sameState);
  if (out) writeFileSync(out, JSON.stringify(r, null, 1) + "\n");
}
