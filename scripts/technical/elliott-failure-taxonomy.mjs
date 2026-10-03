#!/usr/bin/env node
/* Fehler-Taxonomie (Mission III §3, §12): Warum liegt die Hauptzaehlung grob daneben (Grad OTHER/NONE), und warum
   scheitert die Erkennung bei hohem Rauschen?
   Zwei unabhaengige Achsen je Fall:
     GEOMETRIE — wo liegt die Hauptzaehlung relativ zur bekannten Struktur (Kontext | Muster | Bestaetigung)?
     STUFE     — an welcher Stelle der Engine ging die wahre Lesart verloren (Pool, Suche, Bewertung, Rang)?
   Dazu Preis- und Zeitverhaeltnis der gezaehlten Wellen zu den wahren Wellen (Mission III §4, §6).
   Rein diagnostisch: keine Gewichte, keine Schwellen werden hier gesetzt.
   Aufruf: node scripts/technical/elliott-failure-taxonomy.mjs --split HOLDOUT2 --layout B [--engine JSON] [--tag x] */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT, weeklySeriesFromPoints } from "./lib/ti-data.mjs";
import { CLASSES, NOISES, corpusCase, seedsOf } from "../../quant/tests/elliott-corpus.mjs";
import { degreeClass, pointsOf, observableTruth, caseC } from "./elliott-corpus-eval.mjs";
import { seedsOfC } from "../../quant/tests/elliott-corpus-c.mjs";
const OBS = process.argv.includes("--observable");
const require = createRequire(import.meta.url);
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
function arg(n, d) { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; }
const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const ENGINE_TYPES = { IMPULSE: ["IMPULSE"], LEADING_DIAGONAL: ["LEADING_DIAGONAL", "ENDING_DIAGONAL"], ENDING_DIAGONAL: ["ENDING_DIAGONAL", "LEADING_DIAGONAL"], ZIGZAG: ["ZIGZAG"],
  DOUBLE_ZIGZAG: ["DOUBLE_ZIGZAG", "WXY"], TRIPLE_ZIGZAG: ["TRIPLE_ZIGZAG"], FLAT: ["FLAT"], TRIANGLE: ["TRIANGLE"], WXY: ["WXY"] };

export function geometry(c, t, tol) {
  if (!c) return "NONE";
  const E = pointsOf(c), T = t.topIdx, pe = t.patternEnd, t0 = T[0];
  const s = E[0], e = E[E.length - 1];
  if (Math.abs(s - pe) <= tol) return "CONF_AS_STRUCTURE";                                  // Bestaetigungsbewegung als eigene Struktur
  if (s > pe + tol) return "INSIDE_CONFIRMATION";                                           // nur Unterwellen der Bestaetigung
  if (s < t0 - tol && e > pe + tol) return "SPANS_CONTEXT_TO_CONFIRMATION";
  if (s < t0 - tol) return "STARTS_IN_CONTEXT";                                            // falscher Elternbezug / Kontext eingemischt
  if (e > pe + tol) return Math.abs(s - t0) <= tol ? "PATTERN_PLUS_CONFIRMATION" : "PATTERN_TAIL_PLUS_CONFIRMATION";  // Bestaetigung zu frueh eingebaut
  return Math.abs(s - t0) <= tol ? "INSIDE_PATTERN_SAME_ORIGIN" : "INSIDE_PATTERN_LATER_ORIGIN"; // Unterwellen zu Wellen befoerdert / Muster zerlegt
}
/** Anteil der Zaehlpunkte, die keinem bekannten Pivot (Muster, Unterwellen, Kontext, Bestaetigung) entsprechen. */
function unexplained(c, t, tol) {
  if (!c) return null;
  const known = [...t.topIdx, ...t.subIdx, ...(t.contextTopIdx || []), ...(t.confIdx || [])];
  const E = pointsOf(c).filter((x, k, a) => !(k === a.length - 1 && c.waves[c.waves.length - 1].status === "DEVELOPING"));
  return E.length ? E.filter((e) => !known.some((k) => Math.abs(k - e) <= Math.max(1, Math.round(tol / 2)))).length / E.length : 0;
}
function stage(tr, tol) {
  if (!tr) return "NO_TRACE";
  if (tr.poolDist && Math.max(...tr.poolDist) > tol) return "MISSED_PIVOT";
  if (!tr.found) return "NOT_FOUND:" + String(tr.explain || "?").replace(/_w\d+$/, "").replace(/^RULES:.*/, "RULES");
  if (tr.dropped >= tr.found) return "DROPPED_IN_SCORE";
  if (tr.rank === null || tr.rank === undefined) return "NOT_SCORED(maxScored)";
  return tr.rank === 0 ? "RANK0_BUT_PERSISTENCE" : "OUTRANKED";
}
export function runCase(cs0, engine) {
  let cs = cs0;
  const s = weeklySeriesFromPoints(cs.dates.map((d, i) => [d, cs.closes[i]]), "SYN");
  const P = Ctx.prepare(s); const ot = OBS ? observableTruth(cs) : null;
  if (OBS && ot) cs = Object.assign({}, cs, { truth: Object.assign({}, cs.truth, { topIdx: ot.topIdx, patternEnd: ot.topIdx[ot.topIdx.length - 1] }) });
  const T = cs.truth.topIdx, bars = T.slice(1).map((x, k) => x - T[k]), tol = Math.max(2, Math.round(0.2 * median(bars)));
  const types = cs.truth.expect.flatMap((e) => ENGINE_TYPES[e] || [e]).filter((v, i, a) => a.indexOf(v) === i);
  const r = EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, barsPerYear: 52, engine: engine || {}, debugTruth: { pts: T, tol, types, explain: true } });
  const c = r.primary, deg = degreeClass(c, cs.truth);
  const tr = r.trace && r.trace.truth ? Object.assign({ explain: r.trace.explain }, r.trace.truth) : null;
  let compDelta = null;
  if (tr && tr.comp && r.trace.chosen) { compDelta = {}; for (const k of Object.keys(tr.comp)) compDelta[k] = +((r.trace.chosen.components[k] || 0) - (tr.comp[k] || 0)).toFixed(3); }
  /* Preis/Zeit der gezaehlten Wellen relativ zu den wahren Wellen */
  const tAmp = median(T.slice(1).map((x, k) => Math.abs(cs.closes[Math.min(x, cs.closes.length - 1)] - cs.closes[T[k]])));
  const cw = c ? c.waves.filter((w) => w.status !== "DEVELOPING") : [];
  const ratio = cw.length ? { time: +(median(cw.map((w) => w.toIndex - w.fromIndex)) / median(bars)).toFixed(2), price: +(median(cw.map((w) => Math.abs(w.toPrice - w.fromPrice))) / Math.max(1e-9, tAmp)).toFixed(2) } : null;
  return { obsValid: ot ? ot.valid : null, id: cs.id, cls: cs.truth.cls, noise: cs.id.split("|")[1], degree: deg, hit: deg === "EXACT" && cs.truth.expect.includes(c && c.pattern) && c.complete,
           label: c ? c.pattern + (c.complete ? "(C)" : "/" + c.currentWave.label) : "NONE", geometry: geometry(c, cs.truth, tol), stage: stage(tr, tol),
           unexplained: unexplained(c, cs.truth, tol), ratio, compDelta, appl: r.applicability ? r.applicability.level : null,
           cutInConf: cs.truth.cutAt !== undefined && cs.truth.confIdx ? +((cs.truth.cutAt - cs.truth.patternEnd) / Math.max(1, cs.truth.confIdx[cs.truth.confIdx.length - 1] - cs.truth.patternEnd)).toFixed(2) : null };
}
const tally = (rows, f) => { const o = {}; rows.forEach((r) => { const k = f(r); o[k] = (o[k] || 0) + 1; }); return Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1])); };

if (import.meta.url === "file://" + process.argv[1]) {
  const split = arg("split", "DEVELOPMENT"), layout = arg("layout", "A"), engine = JSON.parse(arg("engine", "{}")), tag = arg("tag", "3.1.0");
  const rows = [];
  for (const cls of Object.keys(CLASSES)) { if (CLASSES[cls].negativeOf) continue;
    if (/^C/.test(layout)) { for (const nz of (arg("noise") ? arg("noise").split(",") : NOISES)) for (const seed of seedsOfC(split)) for (const st of ["C_EARLY", "C_LATE"]) rows.push(runCase(caseC(layout, cls, seed, nz, st), engine)); }
    else for (const nz of NOISES) for (const seed of seedsOf(split)) rows.push(runCase(corpusCase(cls, seed, nz, { layout }), engine)); }
  if (OBS) { const keep = rows.filter((r) => r.obsValid); rows.length = 0; rows.push(...keep); }
  const nlm = rows.filter((r) => r.noise !== "high"), gross = nlm.filter((r) => r.degree === "OTHER" || r.degree === "NONE");
  const hi = rows.filter((r) => r.noise === "high"), hiMiss = hi.filter((r) => !r.hit);
  const unexpl = (rs) => rs.filter((r) => r.unexplained !== null && r.unexplained >= 0.34).length;
  const deltaMean = (rs) => { const o = {}; let n = 0; rs.forEach((r) => { if (!r.compDelta) return; n++; for (const [k, v] of Object.entries(r.compDelta)) o[k] = (o[k] || 0) + v; }); for (const k in o) o[k] = +(o[k] / Math.max(1, n)).toFixed(3); return { n, mean: o }; };
  const out = {
    schemaVersion: "vu-elliott-failure-taxonomy-1.0.0", generatedAt: new Date().toISOString(), engine: EV3.ENGINE_VERSION, engineOpts: engine, split, layout, tag,
    note: "Diagnose; Fehlerklassen regelbasiert aus Geometrie (Lage der Hauptzaehlung) und Stufe (wo die wahre Lesart verloren ging).",
    gross: { n: gross.length, of: nlm.length, geometry: tally(gross, (r) => r.geometry), stage: tally(gross, (r) => r.stage), byClass: tally(gross, (r) => r.cls), byNoise: tally(gross, (r) => r.noise),
             noisyPivotShare: unexpl(gross), timeRatioMedian: median(gross.filter((r) => r.ratio).map((r) => r.ratio.time)), priceRatioMedian: median(gross.filter((r) => r.ratio).map((r) => r.ratio.price)),
             cutInConfMedian: median(gross.map((r) => r.cutInConf).filter((x) => x !== null)), cutInConfAll: median(nlm.map((r) => r.cutInConf).filter((x) => x !== null)),
             outrankedBy: deltaMean(gross.filter((r) => r.stage === "OUTRANKED")), cross: tally(gross, (r) => r.geometry + " × " + r.stage) },
    high: { n: hiMiss.length, of: hi.length, geometry: tally(hiMiss, (r) => r.geometry), stage: tally(hiMiss, (r) => r.stage), degree: tally(hiMiss, (r) => r.degree), appl: tally(hiMiss, (r) => r.appl),
            noisyPivotShare: unexpl(hiMiss), timeRatioMedian: median(hiMiss.filter((r) => r.ratio).map((r) => r.ratio.time)), priceRatioMedian: median(hiMiss.filter((r) => r.ratio).map((r) => r.ratio.price)),
            outrankedBy: deltaMean(hiMiss.filter((r) => r.stage === "OUTRANKED")) },
    hitsGeometryCheck: tally(nlm.filter((r) => r.hit), (r) => r.geometry),
    rows
  };
  const dir = join(ROOT, "quant/data/technical-intelligence/elliott-validation/taxonomy");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "failure-taxonomy-" + split.toLowerCase() + (layout !== "A" ? "-layout" + layout : "") + (OBS ? "-observable" : "") + "-" + tag + ".json"), JSON.stringify(out));
  const { rows: _r, ...summary } = out;
  console.log(JSON.stringify(summary, null, 1));
}
