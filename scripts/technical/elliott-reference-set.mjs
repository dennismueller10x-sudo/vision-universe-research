#!/usr/bin/env node
/* Referenzsammlung (Addendum §6): Lehrbuchstrukturen aus Frost & Prechter, Elliott Wave Principle (Kap. 1, Abbildungen der
   Grundmuster), synthetisch rekonstruiert — nur generische Proportionen aus den Textbeschreibungen, keine Abbildungen kopiert.
   Je Beispiel: Quelle, Struktur, erwartete Zaehlung, Engine-Zaehlung, Uebereinstimmung, Abweichung, Begruendung (automatisch aus
   dem Regel-Audit). Rauschen: keines (Lehrbuchform) und gering. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib/ti-data.mjs";
import { syntheticSeries } from "../../quant/tests/elliott-synthetic.mjs";
const require = createRequire(import.meta.url);
const E = require(join(ROOT, "quant/engines/technical/elliott/elliott-v2.js"));
const F = require(join(ROOT, "quant/engines/technical/feature-store.js"));
const Pv = require(join(ROOT, "quant/engines/technical/pivot-engine.js"));
const SRC = "Frost & Prechter, Elliott Wave Principle, Kap. 1";
export const REFERENCE = [
  { id: "R01", gen: "IMPULSE", source: SRC + " — Grundmuster (Essential Design)", structure: "5-3-5-3-5 Impuls, W2 ≈ 61,8 %, W3 ≈ 1,618 × W1, W4 ≈ 38,2 %, W5 ≈ W1", expected: "Impuls, abgeschlossen" },
  { id: "R02", gen: "IMPULSE_EXT1", source: SRC + " — Extension (in Welle 1)", structure: "Welle 1 verlängert", expected: "Impuls, abgeschlossen" },
  { id: "R03", gen: "IMPULSE_EXT3", source: SRC + " — Extension (in Welle 3)", structure: "Welle 3 ≈ 2,618 × W1", expected: "Impuls, abgeschlossen" },
  { id: "R04", gen: "IMPULSE_EXT5", source: SRC + " — Extension (in Welle 5)", structure: "Welle 5 ≈ 2 × W1", expected: "Impuls, abgeschlossen" },
  { id: "R05", gen: "IMPULSE_TRUNCATED", source: SRC + " — Truncation", structure: "Welle 5 endet unter dem Ende von Welle 3", expected: "Impuls (trunkiert), abgeschlossen" },
  { id: "R06", gen: "LEADING_DIAGONAL", source: SRC + " — Diagonal Triangles (Leading)", structure: "5-3-5-3-5 Keil, W4 überlappt W1", expected: "Leading oder Ending Diagonal, abgeschlossen" },
  { id: "R07", gen: "ENDING_DIAGONAL", source: SRC + " — Diagonal Triangles (Ending)", structure: "3-3-3-3-3 Keil, W4 überlappt W1", expected: "Ending oder Leading Diagonal, abgeschlossen" },
  { id: "R08", gen: "ZIGZAG", source: SRC + " — Zigzags", structure: "5-3-5, B ≈ 50 %, C ≈ A", expected: "Zigzag, abgeschlossen" },
  { id: "R09", gen: "DOUBLE_ZIGZAG", source: SRC + " — Double Zigzags", structure: "Zigzag – X – Zigzag, zweiter schreitet voran", expected: "Doppel-Zigzag (oder W-X-Y), abgeschlossen" },
  { id: "R10", gen: "FLAT_REGULAR", source: SRC + " — Flats (regular)", structure: "3-3-5, B ≈ 95 %, C ≈ A", expected: "Flat, abgeschlossen" },
  { id: "R11", gen: "FLAT_EXPANDED", source: SRC + " — Flats (expanded)", structure: "B ≈ 120 % von A, C ≈ 1,618 × A", expected: "Flat (expandiert), abgeschlossen" },
  { id: "R12", gen: "FLAT_RUNNING", source: SRC + " — Flats (running)", structure: "B jenseits A-Ursprung, C endet vor A-Ende", expected: "Flat (running), abgeschlossen" },
  { id: "R13", gen: "TRIANGLE", source: SRC + " — Triangles (contracting)", structure: "3-3-3-3-3, jede Welle ≈ 0,8 × Vorwelle", expected: "Dreieck (kontrahierend), abgeschlossen" },
  { id: "R14", gen: "TRIANGLE_EXPANDING", source: SRC + " — Triangles (expanding)", structure: "3-3-3-3-3, jede Welle ≈ 1,25 × Vorwelle", expected: "Dreieck (expandierend), abgeschlossen" },
  { id: "R15", gen: "DOUBLE_THREE", source: SRC + " — Combinations (Double Three)", structure: "3-3-3: Korrektur – X – Korrektur", expected: "W-X-Y, abgeschlossen" }
];
function run(ref, noise) {
  const { series: s, expect } = syntheticSeries(ref.gen, { noise });
  const f = F.computeFeatures(s), pv = Pv.runPivots(s, f);
  const r = E.analyzeElliottV2({ series: s, features: f, pivots: pv });
  const cands = [r.primary, ...(r.alternatives || [])].filter(Boolean);
  const k = cands.findIndex((c) => expect.includes(c.pattern) && c.complete);
  const p = r.primary;
  const engine = p ? p.patternName + (p.complete ? ", abgeschlossen" : ", aktuell Welle " + p.currentWave.label) : "keine Zählung";
  let reason;
  if (k === 0) reason = "Hauptzählung stimmt; Regel-Audit " + p.ruleAudit.hardRules.satisfied + "/" + p.ruleAudit.hardRules.total + " harte Regeln, Richtlinien " + p.ruleAudit.guidelines.matched + "/" + p.ruleAudit.guidelines.total;
  else if (k > 0) reason = "als Alternative " + k + " erkannt; Hauptzählung „" + engine + "“ hat höheren Rang (Richtlinien " + p.rankComponents.guidelines + " vs. " + cands[k].rankComponents.guidelines + ", höherer Grad " + p.rankComponents.higherDegree + " vs. " + cands[k].rankComponents.higherDegree + ", Skala " + r.degrees.analysis + ")";
  else reason = "nicht unter Haupt- und Alternativzählungen; Engine zählt auf " + r.degrees.analysis + " „" + engine + "“" + (r.applicability && r.applicability.abstain ? " und enthält sich (Anwendbarkeit niedrig)" : "");
  return { noise, engine, scale: r.degrees.analysis, match: k === 0 ? "JA" : k > 0 ? "ALTERNATIVE" : "NEIN", rank: k, applicability: r.applicability ? r.applicability.level : null, countQuality: p && p.countQuality ? p.countQuality.level : null, reason };
}
const rows = REFERENCE.map((ref) => Object.assign({}, ref, { results: ["none", "low"].map((nz) => run(ref, nz)) }));
const sum = (nz) => { const a = rows.map((r) => r.results.find((x) => x.noise === nz)); return { n: a.length, primary: a.filter((x) => x.match === "JA").length, alternative: a.filter((x) => x.match === "ALTERNATIVE").length, missed: a.filter((x) => x.match === "NEIN").length }; };
const out = { schemaVersion: "vu-elliott-reference-1.0.0", generatedAt: new Date().toISOString(), engine: E.ENGINE_VERSION, note: "Lehrbuchstrukturen synthetisch rekonstruiert (generische Proportionen); keine Abbildungen kopiert.", summary: { none: sum("none"), low: sum("low") }, rows };
mkdirSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation"), { recursive: true });
writeFileSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/reference-set.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.summary));
rows.forEach((r) => r.results.forEach((x) => console.log(r.id, r.gen.padEnd(18), x.noise.padEnd(4), x.match.padEnd(11), x.scale, "|", x.engine, "|", x.reason.slice(0, 140))));
