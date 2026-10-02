#!/usr/bin/env node
/* Qualitaets-Kalibrierung (Addendum §10–§13): Steigt die spaetere Ergebnisquote mit Count Quality bzw. Anwendbarkeit?
   Wie oft zaehlt die Engine trotz unklarer Struktur, wie oft enthaelt sie sich? Bringt selektive Anwendung etwas?
   Count Quality (methodische Guete) und Ergebnis werden getrennt gemessen; verglichen wird jeweils mit Zufallszeitpunkten
   gleicher Geometrie (Ueberschuss) und mit Cluster-Bootstrap (Emittent und Jahr).
   Aufruf: node scripts/technical/elliott-quality-calibration.mjs --raw <raw-confirmatory-*.json.gz> */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib/ti-data.mjs";
const require = createRequire(import.meta.url);
const S = require(join(ROOT, "scripts/technical/lib/validation-stats.cjs"));
function arg(n, d) { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; }
const raw = JSON.parse(gunzipSync(readFileSync(arg("raw"))).toString());
const ev = raw.R.events.filter((e) => (e.y === 0 || e.y === 1) && e.bA && e.bA.length);
ev.forEach((e) => { e.sym = e.issuer || e.sym; });
const r4 = (v) => (typeof v === "number" ? Math.round(v * 1e4) / 1e4 : v);
function group(rows, keyFn) {
  const g = {};
  rows.forEach((r) => { const k = keyFn(r); if (k === null || k === undefined) return; (g[k] = g[k] || []).push(r); });
  const out = {};
  for (const [k, a] of Object.entries(g)) {
    if (a.length < 100) continue;
    const rate = S.bothBoot(a, (r) => [r.y, 1], (s) => s[0] / s[1], 201);
    const exc = S.bothBoot(a, (r) => [r.y - S.mean(r.bA), 1], (s) => s[0] / s[1], 202);
    out[k] = { n: a.length, hitRate: rate.est, hitCi: [rate.lo, rate.hi], randomSameGeometry: r4(S.mean(a.flatMap((r) => r.bA))), excessOverRandom: exc.est, excessCi: [exc.lo, exc.hi] };
  }
  return out;
}
const cont = ev.filter((e) => e.lab === "CONT");
const labeled = ev.filter((e) => e.lab !== "NONE");
const st = raw.R.stats, sum = (f) => st.reduce((a, s) => a + (f(s) || 0), 0);
/* Monotonie-Test: Differenz HIGH − LOW im Ueberschuss (Count Quality) */
const contrast = (rows, a, b) => S.bothBoot(rows.filter((r) => a(r) || b(r)), (r) => (a(r) ? [r.y - S.mean(r.bA), 1, 0, 0] : [0, 0, r.y - S.mean(r.bA), 1]), (s) => (s[1] && s[3] ? s[0] / s[1] - s[2] / s[3] : null), 203);
const out = {
  schemaVersion: "vu-elliott-quality-calibration-1.0.0", generatedAt: new Date().toISOString(), source: arg("raw").split("/").pop(), engine: raw.meta.engine,
  note: "Count Quality = methodische Übereinstimmung mit Elliott; Ergebnis = späteres Marktverhalten. Getrennt gemessen. Überschuss = Ergebnisquote minus Zufallszeitpunkte mit gleichen Abständen.",
  forcedVsAbstain: { barsAnalysed: sum((s) => s.bars), barsWithCount: sum((s) => s.available), barsAbstain: sum((s) => s.abstain),
    shareCount: r4(sum((s) => s.available) / sum((s) => s.bars)), shareAbstain: r4(sum((s) => s.abstain) / sum((s) => s.bars)),
    shareCountedDespiteAmbiguous: r4(sum((s) => s.statusCount.AMBIGUOUS) / sum((s) => s.bars)) },
  continuationByCountQuality: group(cont, (r) => r.cqLevel),
  continuationHighMinusLow: contrast(cont, (r) => r.cqLevel === "HIGH", (r) => r.cqLevel === "LOW"),
  labeledByApplicability: group(labeled, (r) => (r.applLevel === "LOW" ? "NO_RELIABLE_COUNT" : r.applLevel)),
  continuationByApplicability: group(cont, (r) => (r.applLevel === "LOW" ? "NO_RELIABLE_COUNT" : r.applLevel)),
  selectiveApplication: { applicableOnly: group(cont.filter((r) => r.applLevel !== "LOW"), () => "CONT, Elliott anwendbar"), all: group(cont, () => "CONT, alle") },
  byStability: group(cont, (r) => (r.stableBars === 0 ? "0" : r.stableBars < 4 ? "1-3" : r.stableBars < 13 ? "4-12" : "13+")),
  byHigherDegree: group(cont, (r) => (r.hd >= 0.8 ? "CONSISTENT" : r.hd >= 0.5 ? "NEUTRAL" : "CONFLICT")),
  byLabel: group(ev, (r) => r.lab)
};
writeFileSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/quality-calibration.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.forcedVsAbstain));
for (const k of ["continuationByCountQuality", "labeledByApplicability", "selectiveApplication", "byStability", "byHigherDegree", "byLabel"]) console.log(k, JSON.stringify(out[k]));
console.log("HIGH-LOW", JSON.stringify(out.continuationHighMinusLow));
