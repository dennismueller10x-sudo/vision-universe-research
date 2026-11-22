#!/usr/bin/env node
/* =========================================================================
   Elliott 4.0 — Vorher/Nachher (Forschung, nicht zertifiziert). Schreibt nur mit --out.

   Varianten je Titel und Stichtag (gleiche Daten, gleicher Code, nur die Eingabe unterscheidet sich):
     A  Schlusskurse (Stand 3.2.2: keine Kerzen)
     B  Wochenkerzen, Schwelle der Wendepunkte aus True-Range-ATR (Standard 4.0)
     C  Wochenkerzen, Schwelle aus der Schlusskurs-ATR (cfg.extremesAtr = false)
   Stichprobe: jede N-te Langreihe (--every, Standard 15), Stichtage alle --step Wochen (Standard 26) ab --from (2012-01-01),
   jeweils mit >= 160 Wochen Vorlauf und 26 Wochen Nachlauf.
   Ergebnis je Lesart: Richtung (abgeschlossen: Folgebewegung nextMove; laufend: Richtung der laufenden Welle), Ungueltig-Marke.
   Ausgang (kausal gemessen, nach dem Stichtag): welche Schranke trifft der Wochenschluss zuerst — +k·ATR oder −k·ATR (k = 3,
   Schlusskurs-ATR, 26 Wochen; sonst offen). Treffer = Schranke in Richtung der Lesart. Vergleich: Anteil „aufwaerts zuerst“ derselben
   Stichtage (Drift-Basis) und je Anwendbarkeit/Klarheit.
   Weitere Kennzahlen: Anwendbarkeit, Alter der Lesart (Wochen seit dem letzten bestaetigten Wellenende), Abstand der Ungueltig-Marke
   in ATR, Laufzeit.
   Aufruf: node scripts/technical/elliott-engine4/compare.mjs --out /tmp/e4 [--every 15] [--step 26] [--workers 4]
   ========================================================================= */
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { ROOT, readJson, weeklySeriesFromPoints, attachWeeklyExtremes } from "../lib/ti-data.mjs";

const require = createRequire(import.meta.url);
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
function arg(n, d) { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; }
const K = 3, H = 26;
const ALL_VARIANTS = { A: { ex: false, engine: { extremes: false } }, B: { ex: true, engine: { extremes: true } }, C: { ex: true, engine: { extremes: true, extremesAtr: false } },
  D: { ex: false, engine: { extremes: false, windowYears: 3 } }, E: { ex: false, engine: { extremes: false, windowYears: 10 } }, F: { ex: false, engine: { extremes: false, windowYears: 2 } } };
const PICK = (isMainThread ? arg("variants", "A,B,C") : (workerData && workerData.variants) || "A,B,C").split(",");
const VARIANTS = Object.fromEntries(PICK.filter((k) => ALL_VARIANTS[k]).map((k) => [k, ALL_VARIANTS[k]]));

function dirOf(c) {
  if (!c) return 0;
  if (c.complete) return c.nextMove === "UP" ? 1 : c.nextMove === "DOWN" ? -1 : 0;
  const w = c.currentWave; return w && (w.direction === "UP" ? 1 : w.direction === "DOWN" ? -1 : 0);
}
function outcome(close, atr, t) {
  const c0 = close[t], up = c0 + K * atr, dn = c0 - K * atr;
  for (let i = t + 1; i <= Math.min(close.length - 1, t + H); i++) { if (close[i] >= up) return 1; if (close[i] <= dn) return -1; }
  return 0;
}
function runTicker(f, from, step) {
  const j = readJson(join(ROOT, "quant/data/market/discover-series-long", f)), t0 = j.ticker, rows = [];
  const base = weeklySeriesFromPoints(j.points || [], t0); base.corporateActions = j.corporateActions || null;
  if (base.length < 160 + H) return rows;
  const ex = weeklySeriesFromPoints(j.points || [], t0); ex.corporateActions = base.corporateActions;
  const cov = attachWeeklyExtremes(ex, t0);
  if (!ex.extremes) return rows;
  const P = Ctx.prepare(base), atrCol = P.features.columns.atr;
  const cuts = [];
  for (let t = 160; t < base.length - H; t += step) if (base.timestamps[t] >= from) cuts.push(t);
  cuts.push(base.length - 1);   // heute (ohne Ausgang): Lesbarkeit des aktuellen Bildes
  for (const t of cuts) {
    const atr = atrCol[t]; if (!(atr > 0)) continue;
    const o = t < base.length - 1 ? outcome(base.close, atr, t) : null;
    const r = { t: t0, d: base.timestamps[t], now: t === base.length - 1, o, v: {} };
    for (const [k, V] of Object.entries(VARIANTS)) {
      const s = V.ex ? ex : base, tt = Date.now();
      let E = null; try { E = EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, asOfIndex: t, barsPerYear: 52, engine: V.engine }); } catch (e) { E = null; }
      const c = E && E.primary, w = c ? c.waves.filter((x) => x.status !== "DEVELOPING") : [];
      const lastEnd = w.length ? w[w.length - 1].toTime : null;
      const age = lastEnd ? Math.round((Date.parse(base.timestamps[t]) - Date.parse(lastEnd)) / 6048e5) : null;
      const inv = c && c.invalidation && Number.isFinite(c.invalidation.price) ? Math.abs(c.invalidation.price - base.close[t]) / atr : null;
      r.v[k] = { p: c ? c.pattern : null, done: c ? !!c.complete : null, dir: dirOf(c), app: E && E.applicability ? (E.applicability.abstain ? "LOW" : E.applicability.level) : null, cl: E ? E.clarityLevel : null, age, inv: inv === null ? null : Math.round(inv * 10) / 10, ms: Date.now() - tt };
    }
    rows.push(r);
  }
  return rows;
}
if (!isMainThread && workerData && workerData.role === "e4") {
  for (const f of workerData.files) { let rows = []; try { rows = runTicker(f, workerData.from, workerData.step); } catch (e) { rows = []; } parentPort.postMessage({ rows }); }
  parentPort.postMessage({ done: true });
}
const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : null);
const med = (a) => { const x = a.filter((v) => v !== null && Number.isFinite(v)).sort((p, q) => p - q); return x.length ? x[Math.floor(x.length / 2)] : null; };
/** Kennzahlen je Variante (rein; Test e4-summary). */
export function summarize(rows) {
  const hist = rows.filter((r) => !r.now && r.o !== null), now = rows.filter((r) => r.now), out = { cuts: hist.length, titles: new Set(rows.map((r) => r.t)).size, variants: {} };
  const upFirst = hist.filter((r) => r.o === 1).length, resolved = hist.filter((r) => r.o !== 0).length;
  out.baseUpFirst = pct(upFirst, resolved);
  for (const k of Object.keys(VARIANTS)) {
    const g = (sel) => { const xs = hist.filter((r) => r.v[k] && sel(r.v[k]) && r.v[k].dir !== 0 && r.o !== 0); const hit = xs.filter((r) => r.o === r.v[k].dir).length;
      const upShare = xs.length ? xs.filter((r) => r.v[k].dir === 1).length / xs.length : null;
      const exp = upShare === null || out.baseUpFirst === null ? null : upShare * out.baseUpFirst / 100 + (1 - upShare) * (1 - out.baseUpFirst / 100);
      return { n: xs.length, hit: pct(hit, xs.length), driftExpected: exp === null ? null : Math.round(exp * 1000) / 10, edge: exp === null || !xs.length ? null : Math.round((hit / xs.length - exp) * 1000) / 10 }; };
    const appNow = {}; now.forEach((r) => { const a = r.v[k] && r.v[k].app || "NONE"; appNow[a] = (appNow[a] || 0) + 1; });
    const appHist = {}; hist.forEach((r) => { const a = r.v[k] && r.v[k].app || "NONE"; appHist[a] = (appHist[a] || 0) + 1; });
    out.variants[k] = {
      all: g(() => true), applicable: g((v) => v.app === "HIGH" || v.app === "MODERATE"), low: g((v) => v.app === "LOW"),
      developing: g((v) => v.done === false), complete: g((v) => v.done === true),
      applicabilityNow: appNow, applicabilityHist: appHist,
      ageNowMedianWeeks: med(now.map((r) => r.v[k] && r.v[k].age)), ageHistMedianWeeks: med(hist.map((r) => r.v[k] && r.v[k].age)),
      invAtrNowMedian: med(now.map((r) => r.v[k] && r.v[k].inv)), msMedian: med(rows.map((r) => r.v[k] && r.v[k].ms)),
      patternsNow: now.reduce((m, r) => { const p = r.v[k] && r.v[k].p || "NONE"; m[p] = (m[p] || 0) + 1; return m; }, {})
    };
  }
  /* Uebereinstimmung der Varianten am selben Stichtag (gleiche Richtung) */
  const same = (a, b) => { const xs = hist.filter((r) => r.v[a] && r.v[b] && r.v[a].dir && r.v[b].dir); return pct(xs.filter((r) => r.v[a].dir === r.v[b].dir).length, xs.length); };
  const ks = Object.keys(VARIANTS); out.directionAgreement = {};
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) out.directionAgreement[ks[i] + ks[j]] = same(ks[i], ks[j]);
  return out;
}
async function main() {
  const OUT = arg("out", null); if (!OUT) { console.error("--out fehlt (schreibt nie in committete Artefakte)"); process.exit(2); }
  const every = +arg("every", "15"), step = +arg("step", "26"), from = arg("from", "2012-01-01"), nW = Math.max(1, +arg("workers", String(Math.min(4, cpus().length))));
  const files = readdirSync(join(ROOT, "quant/data/market/discover-series-long")).filter((f) => f.startsWith("ref_") && f.endsWith(".json")).sort().filter((_, i) => i % every === 3);
  const parts = Array.from({ length: nW }, () => []); files.forEach((f, i) => parts[i % nW].push(f));
  const rows = [], t0 = Date.now(); let done = 0;
  await Promise.all(parts.map((p) => new Promise((ok, bad) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { role: "e4", files: p, from, step, variants: PICK.join(",") } });
    w.on("message", (m) => { if (m.done) ok(); else { rows.push(...m.rows); if (++done % 50 === 0) process.stderr.write(done + "/" + files.length + " " + Math.round((Date.now() - t0) / 1000) + " s\n"); } });
    w.on("error", bad);
  })));
  mkdirSync(OUT, { recursive: true });
  const sum = Object.assign({ schema: "elliott-engine4-compare-1.0.0", engine: EV3.ENGINE_VERSION, params: { every, step, from, K, H }, files: files.length, runtimeSec: Math.round((Date.now() - t0) / 1000) }, summarize(rows));
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(sum, null, 1));
  writeFileSync(join(OUT, "rows.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(JSON.stringify(sum, null, 1));
}
if (isMainThread && process.argv[1] && process.argv[1].endsWith("compare.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
