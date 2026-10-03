#!/usr/bin/env node
/* Gate G9 (Invarianz) und G11 (Laufzeit): Korpus none/low eines Splits — Zaehlung identisch bei Preis × 2 und Preis + 100?
   Laufzeit: Median je Analyse am letzten Bar ueber zufaellig gewaehlte echte Wochenreihen des Splits.
   Aufruf: node scripts/technical/elliott-invariance.mjs --split VALIDATION */
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT, readJson, weeklySeriesFromPoints } from "./lib/ti-data.mjs";
import { CLASSES, corpusCase, seedsOf } from "../../quant/tests/elliott-corpus.mjs";
import { ew3Split, fnv1a } from "./elliott-stability.mjs";
const require = createRequire(import.meta.url);
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
function arg(n, d) { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; }
const split = arg("split", "DEVELOPMENT"), layout = arg("layout", "A");
const sig = (r) => (r.primary ? [r.primary.pattern, r.primary.complete, r.primary.currentWave.label, r.primary.waves.map((w) => w.fromIndex + ">" + w.toIndex).join(",")].join("|") : r.reason);
const run = (closes, dates) => { const s = weeklySeriesFromPoints(dates.map((d, i) => [d, closes[i]]), "S"), P = Ctx.prepare(s); return EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, barsPerYear: 52 }); };
let n = 0, same2 = 0, same100 = 0; const diffs = [];
for (const cls of Object.keys(CLASSES)) for (const nz of ["none", "low"]) for (const seed of seedsOf(split)) {
  const cs = corpusCase(cls, seed, nz, { layout }), base = sig(run(cs.closes, cs.dates));
  n++;
  if (sig(run(cs.closes.map((c) => c * 2), cs.dates)) === base) same2++; else diffs.push(cs.id + " x2");
  if (sig(run(cs.closes.map((c) => c + 100), cs.dates)) === base) same100++; else diffs.push(cs.id + " +100");
}
const dir = join(ROOT, "quant/data/market/discover-series-long"), times = [];
const realSplit = split === "HOLDOUT2" ? "HOLDOUT" : split;
const files = readdirSync(dir).filter((f) => f.startsWith("ref_")).map((f) => f.replace(/^ref_|\.json$/g, "")).filter((t) => !/_/.test(t) && ew3Split(t) === realSplit).sort((a, b) => fnv1a(a + "|rt") - fnv1a(b + "|rt")).slice(0, 60);
for (const t of files) {
  const j = readJson(join(dir, "ref_" + t + ".json")); if ((j.points || []).length < 300) continue;
  const s = weeklySeriesFromPoints(j.points, t), P = Ctx.prepare(s);
  EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, barsPerYear: 52 });   // Aufwaermen
  const t0 = process.hrtime.bigint(); EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, barsPerYear: 52 }); times.push(Number(process.hrtime.bigint() - t0) / 1e6);
}
times.sort((a, b) => a - b);
const out = { schemaVersion: "vu-elliott-invariance-1.0.0", generatedAt: new Date().toISOString(), engine: EV3.ENGINE_VERSION, split, cases: n,
  G9_scale2: +(100 * same2 / n).toFixed(1), G9_plus100: +(100 * same100 / n).toFixed(1), differing: diffs.slice(0, 30),
  G11_medianMs: +times[Math.floor(times.length / 2)].toFixed(1), p90Ms: +times[Math.floor(times.length * 0.9)].toFixed(1), realSeries: times.length };
mkdirSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/corpus"), { recursive: true });
writeFileSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/corpus", "invariance-" + split.toLowerCase() + (layout === "B" ? "-layoutB" : "") + ".json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
