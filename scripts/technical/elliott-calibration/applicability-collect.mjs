/* Teil der reproduzierbaren Kalibrierung von Engine 3.1 (nur DEVELOPMENT, Korpus-Layout A und B; Remediation-Aenderung 1).
   Zwischenergebnisse in VU_CALIB_DIR (Standard: Temp-Verzeichnis). */
/* Anwendbarkeit eichen (nur DEVELOPMENT): Merkmale je Fall und ob die Hauptzaehlung stimmt. */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join as pjoin } from "node:path";
import { tmpdir } from "node:os";
const ROOT = pjoin(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const require = createRequire(import.meta.url);
const M = await import(ROOT + "/quant/tests/elliott-corpus.mjs");
const EVAL = await import(ROOT + "/scripts/technical/elliott-corpus-eval.mjs");
const { weeklySeriesFromPoints } = await import(ROOT + "/scripts/technical/lib/ti-data.mjs");
const Ctx = require(ROOT + "/quant/engines/technical/ti/context.js");
const EV3 = require(ROOT + "/quant/engines/technical/elliott/elliott-v3.js");
const split = process.argv[2] || "DEVELOPMENT";
const rows = [];
for (const cls of Object.keys(M.CLASSES)) for (const nz of M.NOISES) for (const seed of M.seedsOf(split)) for (const cut of ["end", "mid"]) for (const layout of ["A", "B"]) {
  if (cut === "mid" && M.CLASSES[cls].negativeOf) continue;
  const cs = M.corpusCase(cls, seed, nz, { cut, layout });
  const s = weeklySeriesFromPoints(cs.dates.map((d, i) => [d, cs.closes[i]]), "S"); const P = Ctx.prepare(s);
  const r = EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, barsPerYear: 52 });
  const c = r.primary;
  let hit = false;
  if (c) { if (cs.mid) hit = EVAL.judgeMid(c, cs).hit; else hit = EVAL.degreeClass(c, cs.truth) === "EXACT" && cs.truth.expect.includes(c.pattern) && c.complete; }
  if (M.CLASSES[cls].negativeOf) hit = false;
  rows.push({ cls, nz, cut, neg: !!M.CLASSES[cls].negativeOf, uns: !!M.CLASSES[cls].unsupported, hit, z: r.applicability.signalToNoise, q: c && c.countQuality ? c.countQuality.score : null,
              clarity: r.clarity, amb: r.ambiguity ? r.ambiguity.kind : null, rank: c ? c.rank : null, complete: c ? c.complete : null, level: r.applicability.level });
}
writeFileSync((process.env.VU_CALIB_DIR || tmpdir()) + "/appl-" + split + ".json", JSON.stringify(rows));
const lv = {}; rows.forEach((r) => { const k = r.level; lv[k] = lv[k] || { n: 0, hit: 0 }; lv[k].n++; if (r.hit) lv[k].hit++; });
console.log("current levels", JSON.stringify(lv));
/* Rangkorrelation einzelner Merkmale mit Treffer */
for (const f of ["z", "q", "rank", "clarity"]) {
  const a = rows.filter((r) => r[f] != null).sort((x, y) => x[f] - y[f]); const qn = 5, out = [];
  for (let k = 0; k < qn; k++) { const sl = a.slice(Math.floor(k * a.length / qn), Math.floor((k + 1) * a.length / qn)); out.push((100 * sl.filter((r) => r.hit).length / sl.length).toFixed(0) + "%@" + sl[0][f].toFixed(2)); }
  console.log(f.padEnd(8), out.join("  "));
}
