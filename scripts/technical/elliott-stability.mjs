#!/usr/bin/env node
/* Stabilitaet und Mehrdeutigkeit auf echten Charts (Remediation §18–§24, Gate G10).
   Wochen-Replay (kausal, mit Persistenz wie im Produkt) ueber die letzten N Jahre je Reihe; jede Woche wird der Wechsel der
   Hauptzaehlung klassifiziert:
     SAME       gleiche Lesart (gleiches Muster, gleicher Ursprung), gleiche oder naechste Welle
     JUSTIFIED  vorige Lesart abgeschlossen oder ihre harte Grenze per Schlusskurs gebrochen, oder Kursbewegung >= 1 ATR
     DEGREE     neue Lesart enthaelt die vorige als Welle bzw. umgekehrt (gleiche Struktur, andere Ebene)
     UNSTABLE   vorige Lesart weder abgeschlossen noch gebrochen, Kursaenderung < 1 ATR — trotzdem eine materiell andere Lesart
     LOST/FOUND Wechsel zwischen „Zaehlung" und „keine Zaehlung"
   Emittenten-Splits (vorab registriert, ELLIOTT_ENGINE_QUALITY_PREREG.md §2): nur explorative Emittenten,
     fnv1a(issuerRoot + "|ew3") mod 10: DEVELOPMENT {0..3}, VALIDATION {4,5,6}, HOLDOUT {7,8,9}.
   Aufruf: node scripts/technical/elliott-stability.mjs --split DEVELOPMENT --engine v3|v2 [--series 150] [--years 8] [--workers 4] */
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ROOT, readJson, weeklySeriesFromPoints } from "./lib/ti-data.mjs";
const require = createRequire(import.meta.url);
function arg(n, d) { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; }
export function fnv1a(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
const issuerRoot = (t) => String(t).split(/[_.-]/)[0];
const confirmatory = (t) => fnv1a(issuerRoot(t)) % 10 < 3;
export function ew3Split(t) { const m = fnv1a(issuerRoot(t) + "|ew3") % 10; return m <= 3 ? "DEVELOPMENT" : m <= 6 ? "VALIDATION" : "HOLDOUT"; }
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function keyOf(c) { return c ? c.pattern + "|" + c.waves[0].fromIndex + "|" + c.direction : null; }
function spanOf(c) { return [c.waves[0].fromIndex, c.waves[c.waves.length - 1].toIndex]; }
function nested(a, b) {
  const [a0, a1] = spanOf(a), [b0, b1] = spanOf(b);
  const contains = (x, y) => x.waves.some((w) => w.fromIndex === spanOf(y)[0]);
  return (b0 <= a0 && b1 >= a1 && contains(b, a)) || (a0 <= b0 && a1 >= b1 && contains(a, b));
}
function processSeries(series, opt) {
  const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
  const EV2 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v2.js"));
  const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
  const P = Ctx.prepare(series), n = series.length;
  const from = Math.max(260, n - opt.years * 52);
  if (n - from < 52) return null;
  const counts = { SAME: 0, PROGRESS: 0, JUSTIFIED: 0, DEGREE: 0, UNSTABLE: 0, LOST: 0, FOUND: 0, NONE: 0 };
  const amb = { NONE: 0, DEGREE: 0, LABEL: 0, STRUCTURE: 0, OTHER: 0 }, appl = { HIGH: 0, MODERATE: 0, LOW: 0 }, status = {};
  const lifetimes = { HIGH: [], MODERATE: [], LOW: [], OTHER: [] };
  let prev = null, prevState = null, life = 0, lifeQ = null, ms = 0, bars = 0;
  for (let t = from - 4; t < n; t++) {
    const t0 = Date.now();
    const r = opt.engine === "v3" ? EV3.analyzeElliottV3({ series, features: P.features, pivots: P.pivots, asOfIndex: t, barsPerYear: 52, previous: prevState, engine: opt.engineOpts || {} })
                                  : EV2.analyzeElliottV2({ series, features: P.features, pivots: P.pivots, asOfIndex: t, barsPerYear: 52, previous: prevState });
    ms += Date.now() - t0;
    const c = r.primary || null;
    prevState = c ? { key: c.persistenceKey, scaleId: r.degrees.analysis, pivots: c.persistencePivots } : null;
    if (t < from) { prev = c; continue; }
    bars++;
    status[r.status] = (status[r.status] || 0) + 1;
    if (r.applicability) appl[r.applicability.level] = (appl[r.applicability.level] || 0) + 1;
    if (opt.engine === "v3") amb[(r.ambiguity && r.ambiguity.kind) || "OTHER"]++;
    let k;
    if (!prev && !c) k = "NONE";
    else if (!prev) k = "FOUND";
    else if (!c) k = "LOST";
    else if (keyOf(prev) === keyOf(c)) k = c.currentWave.label === prev.currentWave.label ? "SAME" : "PROGRESS";
    else {
      const atr = P.features.columns.atr[t], move = Math.abs(series.close[t] - series.close[t - 1]);
      const inv = prev.invalidation, broken = inv && isNum(inv.price) && (inv.direction === "below" ? series.close[t] < inv.price : series.close[t] > inv.price);
      if (nested(prev, c)) k = "DEGREE";
      else if (prev.complete || broken || (isNum(atr) && move >= atr)) k = "JUSTIFIED";
      else k = "UNSTABLE";
    }
    counts[k]++;
    if (k === "SAME" || k === "PROGRESS") life++;
    else { if (prev && life) lifetimes[lifeQ in lifetimes ? lifeQ : "OTHER"].push(life); life = 1; lifeQ = c && c.countQuality ? c.countQuality.level : null; }
    prev = c;
  }
  return { bars, counts, amb, appl, status, lifetimes, msPerBar: ms / Math.max(1, bars + 4) };
}

if (!isMainThread) {
  const { files, opt } = workerData;
  const out = [];
  for (const f of files) {
    try { const j = readJson(f.path); const s = weeklySeriesFromPoints(j.points || [], j.ticker); const r = processSeries(s, opt); if (r) out.push(Object.assign({ symbol: f.symbol }, r)); }
    catch (e) { out.push({ symbol: f.symbol, error: e.message }); }
    parentPort.postMessage({ progress: 1 });
  }
  parentPort.postMessage({ done: out });
} else if (import.meta.url === "file://" + process.argv[1]) {
  const split = arg("split", "DEVELOPMENT"), engine = arg("engine", "v3"), engineOpts = JSON.parse(arg("opts", "{}")), tag = arg("tag", ""), nSeries = +arg("series", "150"), years = +arg("years", "8"), workers = +arg("workers", "4");
  const dir = join(ROOT, "quant/data/market/discover-series-long");
  const master = readJson(join(ROOT, "quant/data/market/security-master/us-security-master.json"));
  const common = new Set(); master.rows.forEach((r) => { if (r.instrument_type === "EQUITY_COMMON") common.add(r.ticker); });
  let files = readdirSync(dir).filter((f) => f.startsWith("ref_") && f.endsWith(".json")).sort().map((f) => ({ path: join(dir, f), symbol: f.replace(/^ref_|\.json$/g, "") }))
    .filter((f) => !/_/.test(f.symbol) && common.has(f.symbol) && !confirmatory(f.symbol) && ew3Split(f.symbol) === split);
  /* deterministische Auswahl: nach Hash sortiert, die ersten N */
  files = files.sort((a, b) => fnv1a(a.symbol + "|sel") - fnv1a(b.symbol + "|sel")).slice(0, nSeries);
  const t0 = Date.now(); let done = 0;
  const chunks = Array.from({ length: Math.min(workers, files.length) }, () => []);
  files.forEach((f, i) => chunks[i % chunks.length].push(f));
  const res = (await Promise.all(chunks.map((c) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { files: c, opt: { engine, years, engineOpts } } });
    w.on("message", (m) => { if (m.progress && ++done % 25 === 0) process.stderr.write(`  ${done}/${files.length} (${Math.round((Date.now() - t0) / 1000)} s)\n`); if (m.done) resolve(m.done); });
    w.on("error", reject);
  })))).flat();
  const ok = res.filter((r) => !r.error), sum = (f) => ok.reduce((a, r) => a + f(r), 0);
  const tot = {}; ok.forEach((r) => Object.entries(r.counts).forEach(([k, v]) => { tot[k] = (tot[k] || 0) + v; }));
  const bars = sum((r) => r.bars);
  const merge = (key) => { const o = {}; ok.forEach((r) => Object.entries(r[key] || {}).forEach(([k, v]) => { o[k] = (o[k] || 0) + v; })); return o; };
  const life = {}; ok.forEach((r) => Object.entries(r.lifetimes).forEach(([k, v]) => { (life[k] = life[k] || []).push(...v); }));
  const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
  const out = { schemaVersion: "vu-elliott-stability-1.0.0", generatedAt: new Date().toISOString(), split, engine, engineOpts, series: ok.length, errors: res.filter((r) => r.error).length, years, bars,
    transitions: tot, perWeek: Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, +(v / bars).toFixed(4)])),
    unstablePerWeek: +((tot.UNSTABLE || 0) / bars).toFixed(4), relabelPerWeek: +(((tot.UNSTABLE || 0) + (tot.JUSTIFIED || 0) + (tot.DEGREE || 0)) / bars).toFixed(4),
    ambiguity: merge("amb"), applicability: merge("appl"), status: merge("status"),
    lifetimeMedianByQuality: Object.fromEntries(Object.entries(life).map(([k, v]) => [k, { n: v.length, median: med(v) }])),
    msPerBar: +(sum((r) => r.msPerBar) / Math.max(1, ok.length)).toFixed(2), runtimeSec: Math.round((Date.now() - t0) / 1000) };
  mkdirSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/stability"), { recursive: true });
  writeFileSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/stability", `stability-${split.toLowerCase()}-${engine}${tag ? "-" + tag : ""}.json`), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ split, engine, series: out.series, bars, perWeek: out.perWeek, unstable: out.unstablePerWeek, relabel: out.relabelPerWeek, ambiguity: out.ambiguity, appl: out.applicability, ms: out.msPerBar }));
}
