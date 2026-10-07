#!/usr/bin/env node
/* =========================================================================
   VU MISSION IX — FALLSTUDIE (nur erklaerend, §46/§47)

   Was zeigte die EINGEFRORENE Engine an einem historischen Datum, nur mit Daten bis zu diesem Datum?
   Kein Parameter dieser Datei fliesst in ein Signal, eine Schwelle oder eine Auswertung zurueck.
   Die Fallstudie entsteht NACH der universumsweiten Studie (Track B DEV) und ist kein Beleg.

     node scripts/technical/hsab/case-study.mjs --symbol ref_PLTR --dates 2023-01-20,2023-04-03 [--quarters] --out FILE
   Ausgabe kursfrei (Abstaende in %, Vielfache), ausser den oeffentlich zitierten Quellkursen im Bericht.
   ========================================================================= */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ROOT, readJson, weeklySeriesFromPoints } from "../lib/ti-data.mjs";
import * as Core from "./lib/replay-core.mjs";
import { internalElliott } from "./replay.mjs";
import { PRODUCT_METHODOLOGY } from "../lib/ti-product.mjs";

const require = createRequire(import.meta.url);
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r3 = (v) => (isNum(v) ? Math.round(v * 1e3) / 1e3 : null);
function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }

export function caseStudy(symbol, dates, quarters) {
  const x = readJson(join(ROOT, "quant/data/market/discover-series-long", symbol + ".json"));
  const series = weeklySeriesFromPoints(x.points || [], x.ticker);
  const P = Core.prepareSeries(series), n = series.length, ts = series.timestamps, cl = series.close;
  const idx = new Set();
  for (const d of dates) { let t = -1; for (let k = 0; k < n; k++) if (ts[k] <= d) t = k; if (t >= 0) idx.add(t); }
  if (quarters) for (let t = 51; t < n - 1; t++) if (ts[t + 1].slice(0, 7) !== ts[t].slice(0, 7) && ["03", "06", "09", "12"].includes(ts[t].slice(5, 7))) idx.add(t);
  const rows = [];
  for (const t of Array.from(idx).sort((a, b) => a - b)) {
    const r = Core.recordAt(P, series, t, { symbol, cohort: "CASE" }, null);
    const Ef = EV3.analyzeElliottV3({ series, features: P.main.features, pivots: P.main.pivots, asOfIndex: t, barsPerYear: P.main.profile.barsPerYear, previous: null, methodology: PRODUCT_METHODOLOGY, forensics: true, debugAll: true });
    let mx = -Infinity; for (let j = Math.max(0, t - 51); j <= t; j++) mx = Math.max(mx, cl[j]);
    const fut = (H) => (t + H < n ? r3(cl[t + H] / cl[t]) : null);
    let maxM = 1; for (let j = t + 1; j < n; j++) maxM = Math.max(maxM, cl[j] / cl[t]);
    rows.push({ date: ts[t], barsOfHistory: t + 1, belowHsabMinimum: t + 1 < 160,
      shown: { outlook: r.o, structure: r.st, clarity: r.cl, agreement: r.ag, confluence: r.al, mixed: !!r.mx,
               primary: r.P ? { direction: r.P.dir > 0 ? "BULL" : r.P.dir < 0 ? "BEAR" : "NEUTRAL", template: r.P.tpl,
                 target1Pct: Array.isArray(r.P.t1) ? r.P.t1.map((v) => r3(v / r.px - 1)) : isNum(r.P.t1) ? r3(r.P.t1 / r.px - 1) : null,
                 invalidationPct: isNum(r.P.inv) ? r3(r.P.inv / r.px - 1) : null } : null,
               votes: r.v, volatilityRegime: r.vr, trendPhase: r.tp, stage: r.sg, patterns: r.pat, wyckoff: r.wy, volume: r.vol ? r.vol[0] : null },
      elliottDisplayed: { pattern: r.ew && r.ew.p || null, wave: r.ew && r.ew.w || null, motive: r.ew && r.ew.motive ? 1 : 0, abstains: r.ew && r.ew.ab ? 1 : 0, direction: r.ew && r.ew.d || 0 },
      elliottInternal: internalElliott(Ef, cl, t),
      simple: { ret52: t >= 52 ? r3(cl[t] / cl[t - 52] - 1) : null, ret26: t >= 26 ? r3(cl[t] / cl[t - 26] - 1) : null, dist52: r3(cl[t] / mx) },
      revealedAfterwards: { m26: fut(26), m52: fut(52), m104: fut(104), maxMultipleToEnd: r3(maxM) } });
  }
  return { schemaVersion: "hsab-case-study-1.0.0", symbol, engine: { methodology: PRODUCT_METHODOLOGY }, purpose: "EXPLANATORY_ONLY_NOT_EVIDENCE_NOT_FOR_TUNING", rows };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const res = caseStudy(arg("symbol"), (arg("dates", "") || "").split(",").filter(Boolean), process.argv.includes("--quarters"));
  writeFileSync(arg("out"), JSON.stringify(res, null, 1));
  for (const r of res.rows) console.log(r.date, r.barsOfHistory, JSON.stringify(r.shown.primary), r.shown.outlook, r.shown.clarity, "| EW", JSON.stringify(r.elliottDisplayed), "| int", JSON.stringify(r.elliottInternal.IMPULSE), "|", JSON.stringify(r.simple), "→", JSON.stringify(r.revealedAfterwards));
}
