/* Anwendbarkeit 3.2 (Mission III §19–§21): Merkmale je Fall und ob die Hauptzaehlung stimmt — Korpus DEVELOPMENT, Layouts A, B, C1, C3,
   alle Rauschstufen, abgeschlossene UND laufende Stufen. C2 (unabhaengiger Generator) bleibt fuer die Pruefung ausgespart.
   Aufruf: node scripts/technical/elliott-calibration/applicability32-collect.mjs LAYOUT [SPLIT]   → $VU_CALIB_DIR/appl32-SPLIT-LAYOUT.json */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join as pjoin } from "node:path";
import { tmpdir } from "node:os";
const ROOT = pjoin(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const require = createRequire(import.meta.url);
const M = await import(ROOT + "/quant/tests/elliott-corpus.mjs");
const MC = await import(ROOT + "/quant/tests/elliott-corpus-c.mjs");
const EVAL = await import(ROOT + "/scripts/technical/elliott-corpus-eval.mjs");
const { weeklySeriesFromPoints } = await import(ROOT + "/scripts/technical/lib/ti-data.mjs");
const Ctx = require(ROOT + "/quant/engines/technical/ti/context.js");
const EV3 = require(ROOT + "/quant/engines/technical/elliott/elliott-v3.js");
const PAT = require(ROOT + "/quant/engines/technical/elliott/patterns.js");
const layout = process.argv[2] || "A", split = process.argv[3] || "DEVELOPMENT";
export function features(r) {
  const c = r.primary; if (!c) return null;
  const comp = r.trace && r.trace.chosen ? r.trace.chosen.components : {};
  const nw = c.waves.length, tot = c.complete ? nw : (c.currentWave ? Math.max(nw, c.currentWave.wave) : nw);
  return { q: c.countQuality ? c.countQuality.score : null, clarity: r.clarity, amb: r.ambiguity ? r.ambiguity.kind : null, z: r.applicability.signalToNoise, complete: !!c.complete,
           hier: comp.hierarchy, prop: comp.proportion, sub: comp.subdivision, guide: comp.guidelines, dom: comp.dominance, anchor: comp.anchor, rank: c.rank, pattern: c.pattern,
           waveFrac: c.complete ? 1 : (c.currentWave ? c.currentWave.wave : nw) / Math.max(1, (PAT.PATTERNS[c.pattern] ? PAT.PATTERNS[c.pattern].waves : tot)), nAlt: (r.alternatives || []).length, level: r.applicability.level };
}
const cases = [];
if (/^C/.test(layout)) { for (const cls of Object.keys(M.CLASSES)) for (const nz of M.NOISES) for (const seed of MC.seedsOfC(split)) for (const st of MC.STAGES) { if (M.CLASSES[cls].negativeOf && st[0] === "P") continue; const cs = EVAL.caseC(layout, cls, seed, nz, st); if (cs) cases.push(cs); } }
else for (const cls of Object.keys(M.CLASSES)) for (const nz of M.NOISES) for (const seed of M.seedsOf(split)) for (const cut of ["end", "mid"]) { if (cut === "mid" && M.CLASSES[cls].negativeOf) continue; cases.push(M.corpusCase(cls, seed, nz, { cut, layout })); }
const rows = [];
for (const cs of cases) {
  const s = weeklySeriesFromPoints(cs.dates.map((d, i) => [d, cs.closes[i]]), "S"); const P = Ctx.prepare(s);
  const r = EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, barsPerYear: 52 });
  const c = r.primary; let hit = false;
  if (c) hit = cs.mid ? EVAL.judgeMid(c, cs).hit : EVAL.degreeClass(c, cs.truth) === "EXACT" && cs.truth.expect.includes(c.pattern) && c.complete;
  if (M.CLASSES[cs.truth.cls].negativeOf) hit = false;
  const f = features(r);
  rows.push(Object.assign({ id: cs.id, layout, appl: r.applicability.score, alts: [r.primary, ...(r.alternatives || [])].filter(Boolean).map((x) => cs.mid ? EVAL.judgeMid(x, cs).hit : EVAL.degreeClass(x, cs.truth) === "EXACT" && cs.truth.expect.includes(x.pattern) && x.complete).some(Boolean) && !M.CLASSES[cs.truth.cls].negativeOf, cls: cs.truth.cls, nz: cs.id.split("|")[1], mid: !!cs.mid, neg: !!M.CLASSES[cs.truth.cls].negativeOf, hit }, f || {}));
}
writeFileSync((process.env.VU_CALIB_DIR || tmpdir()) + "/appl32-" + split + "-" + layout + ".json", JSON.stringify(rows));
console.log(layout, split, "rows", rows.length, "hits", rows.filter((r) => r.hit).length);
