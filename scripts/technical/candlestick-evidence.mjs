#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE TECHNICAL — candlestick-evidence.mjs
   HISTORISCHE EVIDENZ DER KERZENMUSTER (beschreibend, kausal, querschnittsbereinigt)

   Je Titel (technical-signals-v1, 270 Tagesbars, SPLIT_ADJUSTED) erkennt
   candlesticks.js jedes Muster an jedem Bar i (nur Bars <= i). Ein Treffer
   ist ein Ereignis am Schluss von i. Gemessen wird ab diesem Schluss:
     excessH   Rendite Schluss i -> i+H minus dem Mittel aller Titel desselben
               Datums (Querschnitt), bei baerischen Treffern mit umgekehrtem
               Vorzeichen (richtungsbereinigt). Neutrale Muster: ohne Richtung,
               berichtet wird die Ueberrendite ohne Vorzeichenwechsel.
   Horizonte H = 5, 10, 20 Handelstage. Je Muster und Richtung: n, Titel,
   mittlere und mediane Ueberrendite, 95-%-Intervall, Trefferquote mit
   Intervall, Signifikanz nach Bonferroni ueber alle gemeldeten Zeilen.
   Gemeldet wird eine Zeile erst ab MIN_N Ereignissen. Das Fenster ist ein
   Jahr (ein Marktregime); das Ergebnis beschreibt, es empfiehlt nichts.

   Schreibt nichts ausser mit --out (JSON). Aufruf:
     node scripts/technical/candlestick-evidence.mjs [--out FILE] [--limit N]
   ========================================================================= */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Cdl = require(join(root, "quant/engines/technical/candlesticks.js"));
const SHARDS = join(root, "quant/data/product/technical-signals-v1");

export const CANDLE_EVIDENCE_VERSION = "technical-candlestick-evidence-1.0.0";
export const HORIZONS = [5, 10, 20], MIN_N = 100;

function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
function arg(name, def) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; }
function erfc(x) { const t = 1 / (1 + 0.5 * Math.abs(x)), y = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? y : 2 - y; }
/* z fuer zweiseitig alpha (Bisektion ueber die Normalverteilung). */
export function zFor(alpha) { let lo = 0, hi = 10; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (0.5 * erfc(m / Math.SQRT2) > alpha / 2) lo = m; else hi = m; } return (lo + hi) / 2; }
const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : null);

/** Ereignisse eines Titels: [Muster, Richtung (+1/−1/0), Bar-Index]. Kausal: detect() bewertet Bar i nur aus Bars <= i. */
export function eventsOf(bars) {
  const res = Cdl.detect(bars).patterns, out = [];
  for (const p of Cdl.PATTERNS) {
    const a = res[p.id];
    for (let i = 0; i < a.length; i++) if (a[i] === 1 || a[i] === -1) out.push([p.id, p.direction === "neutral" ? 0 : a[i], i]);
  }
  return out;
}

/**
 * Kennzahlen einer Stichprobe [Datum, Ueberrendite]. Ereignisse desselben Datums sind nicht unabhaengig (gemeinsamer
 * Markttag) und die Renditefenster ueberlappen: Mittel und Intervall werden deshalb ueber Datums-Cluster gerechnet
 * (erst Mittel je Datum, dann Mittel, Streuung und Standardfehler ueber die Daten). Die Trefferquote zaehlt Ereignisse.
 */
export function stats(xs) {
  const n = xs.length, byDate = new Map();
  for (const [d, v] of xs) { const c = byDate.get(d) || { s: 0, n: 0 }; c.s += v; c.n++; byDate.set(d, c); }
  const dm = [...byDate.values()].map((c) => c.s / c.n), k = dm.length, mean = dm.reduce((s, v) => s + v, 0) / k;
  const sd = Math.sqrt(dm.reduce((s, v) => s + (v - mean) * (v - mean), 0) / Math.max(1, k - 1)), se = sd / Math.sqrt(k);
  const vals = xs.map((x) => x[1]).sort((a, b) => a - b), median = vals[n >> 1];
  const hit = vals.filter((v) => v > 0).length / n, hse = Math.sqrt(hit * (1 - hit) / n);
  return { n, dates: k, mean: r4(mean), median: r4(median), ci95: r4(1.96 * se), hitRate: r4(hit), hitRateCi95: [r4(hit - 1.96 * hse), r4(hit + 1.96 * hse)], t: se > 0 ? mean / se : 0 };
}

export function build({ limit = 0 } = {}) {
  /* 1. Titel lesen: Schlusskurse je Datum (Querschnitt) und Ereignisse. */
  const titles = [];
  for (const file of readdirSync(SHARDS).filter((x) => /^[A-Z0-9_-]{1,3}\.json\.gz$/.test(x)).sort()) {
    const shard = JSON.parse(gunzipSync(readFileSync(join(SHARDS, file))));
    for (const [ticker, it] of Object.entries(shard.instruments || {})) {
      const b = it.bars;
      if (!b || !Array.isArray(b.close) || b.close.length < 40) continue;
      titles.push({ ticker, dates: b.timestamps.map((d) => String(d).slice(0, 10)), close: b.close, events: eventsOf(b) });
      if (limit && titles.length >= limit) break;
    }
    if (limit && titles.length >= limit) break;
  }
  /* 2. Querschnittsmittel je Datum und Horizont (alle Titel mit Schluss an Datum und an Datum+H). */
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
  /* 3. Ueberrenditen je Muster und Richtung. */
  const rows = new Map();
  for (const t of titles) {
    for (const [id, dir, i] of t.events) {
      const key = id + "|" + dir;
      const row = rows.get(key) || { id, dir, titles: new Set(), x: HORIZONS.map(() => []) };
      row.titles.add(t.ticker);
      HORIZONS.forEach((H, h) => {
        if (i + H >= t.close.length) return;
        const a = t.close[i], z = t.close[i + H], m = xsec[h].get(t.dates[i]);
        if (!(a > 0) || !(z > 0) || !m || m.n < 50) return;
        const ex = (z / a - 1) - m.s / m.n;
        row.x[h].push([t.dates[i], dir < 0 ? -ex : ex]);
      });
      rows.set(key, row);
    }
  }
  const reported = [...rows.values()].filter((r) => r.x[HORIZONS.length - 1].length >= MIN_N);
  const z = zFor(0.05 / Math.max(1, reported.length * HORIZONS.length));
  const out = reported.map((r) => {
    const p = Cdl.pattern(r.id), o = { pattern: r.id, name: p.name, direction: r.dir > 0 ? "BULLISH" : r.dir < 0 ? "BEARISH" : "NEUTRAL", titles: r.titles.size };
    HORIZONS.forEach((H, h) => { const s = stats(r.x[h]); o["h" + H] = { n: s.n, dates: s.dates, mean: s.mean, median: s.median, ci95: s.ci95, hitRate: s.hitRate, hitRateCi95: s.hitRateCi95, significant: Math.abs(s.t) > z }; });
    return o;
  }).sort((a, b) => b.h20.n - a.h20.n);
  const dates = titles.flatMap((t) => [t.dates[0], t.dates[t.dates.length - 1]]).sort();
  return {
    schemaVersion: CANDLE_EVIDENCE_VERSION, engine: Cdl.CANDLESTICKS_VERSION, titles: titles.length,
    window: { from: dates[0], to: dates[dates.length - 1] }, horizons: HORIZONS, minN: MIN_N,
    method: "Ereignis am Schluss des Musterbars; Rendite Schluss i -> i+H minus Querschnittsmittel desselben Datums (>= 50 Titel); baerisch mit umgekehrtem Vorzeichen; Mittel und Intervall ueber Datums-Cluster; Bonferroni ueber Zeilen x Horizonte.",
    bonferroniZ: r4(z), patterns: out,
    notReported: [...rows.values()].filter((r) => r.x[HORIZONS.length - 1].length < MIN_N).map((r) => ({ pattern: r.id, direction: r.dir, n20: r.x[HORIZONS.length - 1].length }))
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const started = Date.now(), res = build({ limit: Number(arg("--limit", "0")) || 0 }), out = arg("--out", null);
  if (out) writeFileSync(out, JSON.stringify(res, null, 1) + "\n");
  console.log(`${res.titles} Titel, ${res.window.from} bis ${res.window.to}, ${res.patterns.length} Zeilen gemeldet, z(Bonferroni) ${res.bonferroniZ}, ${Math.round((Date.now() - started) / 1000)} s`);
  for (const p of res.patterns) console.log(p.pattern.padEnd(22), p.direction.padEnd(8), String(p.h20.n).padStart(6), "h5", p.h5.mean, "h20", p.h20.mean, "±", p.h20.ci95, p.h20.significant ? "SIGNIFIKANT" : "");
}
