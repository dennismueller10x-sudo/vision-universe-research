#!/usr/bin/env node
/* Mehrfachaufloesung (Remediation §33–§37): dieselbe Aktie auf Wochen- und Tagesschluss (letztes Jahr, Close-only).
   Konsistenz-Kennzahlen (ohne Wahrheit):
     direction  laufende Welle gleichgerichtet (Woche vs. Tag)?
     nesting    beginnt die Tageszaehlung innerhalb der laufenden Wochenwelle (Tag = Unterwellen der Woche)?
     abstain    Enthaltungen je Aufloesung
   Emittenten-Split wie die Stabilitaetsstudie. Aufruf: node scripts/technical/elliott-multires.mjs --split DEVELOPMENT [--n 150] */
import { readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT, readJson, weeklySeriesFromPoints } from "./lib/ti-data.mjs";
import { ew3Split, fnv1a } from "./elliott-stability.mjs";
const require = createRequire(import.meta.url);
const Canonical = require(join(ROOT, "quant/engines/technical/canonical-bars.js"));
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
const PAT = require(join(ROOT, "quant/engines/technical/elliott/patterns.js"));
function arg(n, d) { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; }
const split = arg("split", "DEVELOPMENT"), N = +arg("n", "150"), OFF = +arg("offset", "0");   // HOLDOUT-3: --offset 120 = Titel, die frueher nicht ausgewertet wurden
const L = join(ROOT, "quant/data/market/discover-series-long"), D = join(ROOT, "quant/data/market/discover-series");
const tickers = readdirSync(D).filter((f) => f.startsWith("ref_")).map((f) => f.replace(/^ref_|\.json$/g, "")).filter((t) => !/_/.test(t) && fnv1a(t.split(/[_.-]/)[0]) % 10 >= 3 && ew3Split(t) === split && existsSync(join(L, "ref_" + t + ".json")))
  .sort((a, b) => fnv1a(a + "|mr") - fnv1a(b + "|mr")).slice(OFF, OFF + N);
const rows = [];
for (const t of tickers) {
  const dj = readJson(join(D, "ref_" + t + ".json")), wj = readJson(join(L, "ref_" + t + ".json"));
  if (!dj.points || dj.points.length < 200 || !wj.points || wj.points.length < 300) continue;
  const lastDay = dj.points[dj.points.length - 1][0];
  const ws = weeklySeriesFromPoints(wj.points.filter((p) => p[0] <= lastDay), t);
  const ds = Canonical.fromRows(dj.points.map(([date, c]) => ({ date, open: c, high: c, low: c, close: c, volume: null })), { instrumentId: t, exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "daily-close" });
  const Pw = Ctx.prepare(ws), Pd = Ctx.prepare(ds);
  const W = EV3.analyzeElliottV3({ series: ws, features: Pw.features, pivots: Pw.pivots, barsPerYear: 52 });
  const Dy = EV3.analyzeElliottV3({ series: ds, features: Pd.features, pivots: Pd.pivots, barsPerYear: 252 });
  if (!W.primary || !Dy.primary) { rows.push({ t, missing: true }); continue; }
  const wc = W.primary, dc = Dy.primary;
  const wCurStart = wc.complete ? wc.waves[wc.waves.length - 1].toTime : wc.waves[wc.waves.length - 1].fromTime;
  const dStart = dc.waves[0].fromTime;
  rows.push({ t, weekly: wc.pattern + (wc.complete ? "(C)" : "/" + wc.currentWave.label), daily: dc.pattern + (dc.complete ? "(C)" : "/" + dc.currentWave.label),
              direction: wc.currentWave.direction === dc.currentWave.direction, nested: dStart >= wCurStart, wAbstain: W.applicability.abstain, dAbstain: Dy.applicability.abstain,
              wAppl: W.applicability.level, dAppl: Dy.applicability.level,
              /* Mission IV §20: Hierarchie statt naiver Richtung — Felder fuer die Kompatibilitaetspruefung */
              wDir: wc.currentWave.direction, dDir: dc.currentWave.direction, dFam: PAT.PATTERNS[dc.pattern] && PAT.PATTERNS[dc.pattern].family === "MOTIVE" ? "M" : "K", dSign: dc.waves[0].toPrice >= dc.waves[0].fromPrice ? 1 : -1 });
}
const ok = rows.filter((r) => !r.missing), share = (f, a = ok) => (a.length ? +(a.filter(f).length / a.length).toFixed(3) : null);
const both = ok.filter((r) => !r.wAbstain && !r.dAbstain);
/* Kompatibilitaet (Elliott-Hierarchie): innerhalb einer Wochenwelle mit Richtung d laufen Tages-Motivmuster in Richtung d, Tages-
   Korrekturen gegen d. Zusaetzlich Zufallsbasis: Tagesergebnisse zwischen Titeln vertauscht (Permutation, 200 Wiederholungen). */
const sgn = (x) => (x === "UP" || x === 1 ? 1 : x === "DOWN" || x === -1 ? -1 : 0);
const compat = (w, d) => (d.dFam === "M" ? d.dSign === sgn(w.wDir) : d.dSign === -sgn(w.wDir));
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
function permBase(f) { if (ok.length < 3) return null; let acc = 0; for (let b = 0; b < 200; b++) { const idx = ok.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } acc += ok.filter((w, i) => f(w, ok[idx[i]])).length / ok.length; } return +(acc / 200).toFixed(3); }
const out = { schemaVersion: "vu-elliott-multires-1.0.0", generatedAt: new Date().toISOString(), engine: EV3.ENGINE_VERSION, split, series: ok.length, missing: rows.length - ok.length,
  directionAgreement: share((r) => r.direction), directionAgreementPermutationBase: permBase((w, d) => w.wDir === d.dDir),
  hierarchyCompatible: share((r) => compat(r, r)), hierarchyCompatiblePermutationBase: permBase(compat),
  nestedDailyInWeeklyCurrentWave: share((r) => r.nested),
  whenBothApplicable: { n: both.length, direction: share((r) => r.direction, both), nested: share((r) => r.nested, both) },
  abstainWeekly: share((r) => r.wAbstain), abstainDaily: share((r) => r.dAbstain), rows };
mkdirSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/multires"), { recursive: true });
writeFileSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/multires", "multires-" + split.toLowerCase() + (arg("tag", "") ? "-" + arg("tag", "") : "") + ".json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(Object.assign({}, out, { rows: undefined })));
