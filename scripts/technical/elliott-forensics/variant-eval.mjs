#!/usr/bin/env node
/* Engine-3.3-Kandidaten (Mission VI §50–§56): Varianten von elliott-3.2.2 NUR ueber Engine-Parameter, gemessen auf
     1. synthetischem Korpus DEVELOPMENT (Wahrheit bekannt): Layout A (Ende + Mitte), Layout C1 (Stufen P60/P75/P90/C_EARLY/C_LATE)
        — Gate-Kennzahlen G1/G2/G8, laufende Muster (dev_primary), Familienverwechslung Motiv/Korrektur;
     2. geoeffneten Practitioner-Faellen DEVELOPMENT (nur Kontrolle, nie Abstimmungsziel): Impulslesart, Rang, Hauptfamilie.
   --split VALIDATION nur einmal fuer den gewaehlten Kandidaten. HOLDOUTs (synthetisch und Practitioner) werden nie gelesen.

   node scripts/technical/elliott-forensics/variant-eval.mjs [--split DEVELOPMENT] [--variants a,b] [--out FILE] [--quick] */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { CLASSES, NOISES, corpusCase, seedsOf } from "../../../quant/tests/elliott-corpus.mjs";
import { seedsOfC, STAGES } from "../../../quant/tests/elliott-corpus-c.mjs";
import { evaluateCase, caseC, gate } from "../elliott-corpus-eval.mjs";
import { openedCases } from "./lib.mjs";
import { analyzeCase } from "./impulse-forensics.mjs";

const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; };
export const VARIANTS = {
  baseline: {},
  coverage0: { weights: { coverage: 0 } },
  coverage02: { weights: { coverage: 0.2 } },
  wxyMargin01: { wxyMargin: 0.1 },
  wxyMargin02: { wxyMargin: 0.2 },
  subShrink: { subShrink: { a: 1, b: 3, rMin: 0.3 } },
  coverage0_wxy01: { weights: { coverage: 0 }, wxyMargin: 0.1 },
  coverage02_wxy01: { weights: { coverage: 0.2 }, wxyMargin: 0.1 },
  covDev3: { coverageMode: "DEV3" },
  covDev3_trend01: { coverageMode: "DEV3", weights: { trendContext: 0.1 } },
  covDev3_trend02: { coverageMode: "DEV3", weights: { trendContext: 0.2 } },
  trend02: { weights: { trendContext: 0.2 } },
  covDev3_trendDev01: { coverageMode: "DEV3", trendContextMode: "DEVELOPING_ONLY", weights: { trendContext: 0.1 } },
  covDev3_trendDev02: { coverageMode: "DEV3", trendContextMode: "DEVELOPING_ONLY", weights: { trendContext: 0.2 } },
  trendDev01: { trendContextMode: "DEVELOPING_ONLY", weights: { trendContext: 0.1 } },
  trendPen01: { trendContextMode: "COUNTER_DEVELOPING", weights: { trendContext: 0.1 } },
  trendPen02: { trendContextMode: "COUNTER_DEVELOPING", weights: { trendContext: 0.2 } },
  trendPen03: { trendContextMode: "COUNTER_DEVELOPING", weights: { trendContext: 0.3 } },
  subdiv03: { weights: { subdivision: 0.3 } },
  subdiv015: { weights: { subdivision: 0.15 } },
  noSimilarity: { noSimilarity: true },
  candidate33: { noSimilarity: true, trendContextMode: "COUNTER_DEVELOPING", weights: { trendContext: 0.2 } },
  noSimilarity_trendPen02: { noSimilarity: true, trendContextMode: "COUNTER_DEVELOPING", weights: { trendContext: 0.2 } }
};
const withV3 = (e) => Object.assign({ v3: true }, e, e.weights ? { weights: Object.assign({ guidelines: 0.06, subdivision: 0.45, separation: 0.03, anchor: 0.45, dominance: 0.45, similarity: 0, trendContext: 0, coverage: 0.45, prior: 0.15, higherDegree: 0, tail: 0.2, residual: 0, hierarchy: 0, proportion: 0 }, e.weights) } : {});
const pct = (a, b) => (b ? +(100 * a / b).toFixed(1) : null);
const motiveFam = (p) => /IMPULSE|DIAGONAL/.test(p || "");

export function corpusMetrics(rows) {
  const sup = rows.filter((r) => !CLASSES[r.cls].negativeOf && !CLASSES[r.cls].unsupported);
  const withP = sup.filter((r) => r.primaryPattern);
  const mot = withP.filter((r) => CLASSES[r.cls].motive), cor = withP.filter((r) => !CLASSES[r.cls].motive);
  const fam = (a) => ({ n: a.length, readMotive: pct(a.filter((r) => motiveFam(r.primaryPattern)).length, a.length) });
  const g = gate(rows).metrics;
  const neg = rows.filter((r) => CLASSES[r.cls].negativeOf);
  return { G1: g.G1_primary, G2: g.G2_primaryOrAlt, G4: g.G4_degreeExactOrNested, G6falseAccept: g.G6_falseAccept, G8: g.G8_intraWaveViolations, devPrimary: g.dev_primary, devN: g.dev_n,
           motiveTruth: fam(mot), correctiveTruth: fam(cor),
           motiveTruthEnd: fam(mot.filter((r) => !r.mid)), motiveTruthMid: fam(mot.filter((r) => r.mid)),
           impulseClassesPrimary: pct(sup.filter((r) => /^IMPULSE/.test(r.cls) && r.rank === 0).length, sup.filter((r) => /^IMPULSE/.test(r.cls)).length),
           correctiveClassesPrimary: pct(sup.filter((r) => !CLASSES[r.cls].motive && r.rank === 0).length, sup.filter((r) => !CLASSES[r.cls].motive).length),
           abstainShare: pct(sup.filter((r) => r.abstain).length, sup.length), falseAcceptNeg: neg.filter((r) => r.falseAccept).length };
}
export function runCorpus(engine, split, { quick = false } = {}) {
  const e = withV3(engine), A = [], C1 = [];
  const seedsA = quick ? seedsOf(split).slice(0, 5) : seedsOf(split), seedsC = quick ? seedsOfC(split).slice(0, 5) : seedsOfC(split);
  for (const cls of Object.keys(CLASSES)) for (const nz of NOISES) for (const seed of seedsA) {
    A.push(evaluateCase(corpusCase(cls, seed, nz, {}), e));
    if (!CLASSES[cls].negativeOf) A.push(evaluateCase(corpusCase(cls, seed, nz, { cut: "mid" }), e));
  }
  for (const cls of Object.keys(CLASSES)) for (const nz of NOISES) for (const seed of seedsC) for (const st of STAGES) {
    if (CLASSES[cls].negativeOf && st[0] === "P") continue;
    const cs = caseC("C1", cls, seed, nz, st); if (!cs) continue;
    const r = evaluateCase(cs, e); r.stage = st; C1.push(r);
  }
  return { A: corpusMetrics(A), C1: corpusMetrics(C1) };
}
export function runPractitioner(engine, splits = ["DEVELOPMENT"]) {
  const rows = openedCases(splits).rows.map((r) => analyzeCase(r, engine));
  const ok = rows.filter((x) => x.status === "OK"), imp = ok.filter((x) => x.practitioner.impulseLike), cor = ok.filter((x) => x.practitioner.broad === "CORRECTIVE");
  const m = (x) => x.vu.family === "MOTIVE";
  return { cases: ok.length, impulseCases: imp.length, impulsePrimaryMotive: imp.filter(m).length, impulsePrimaryImpulse: imp.filter((x) => x.vu.pattern === "IMPULSE").length,
           impulseInAlternatives: imp.filter((x) => (x.vu.alternatives || []).includes("IMPULSE")).length, practitionerLikePrimaryOrAlt: imp.filter((x) => x.impulse.practitionerLikeBestPos !== null && x.impulse.practitionerLikeBestPos < 3).length,
           correctiveCases: cor.length, correctiveReadMotive: cor.filter(m).length, primaryPatterns: ok.reduce((o, x) => { o[x.vu.pattern] = (o[x.vu.pattern] || 0) + 1; return o; }, {}),
           abstain: ok.filter((x) => x.vu.abstain).length };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const split = arg("split", "DEVELOPMENT"), names = arg("variants") ? arg("variants").split(",") : Object.keys(VARIANTS), quick = process.argv.includes("--quick");
  if (split.startsWith("HOLDOUT")) throw new Error("Holdouts werden hier nie gelesen");
  const out = { schemaVersion: "vu-elliott-33-variants-1.0.0", generatedAt: new Date().toISOString(), split, quick, variants: {} };
  for (const n of names) {
    const t0 = Date.now();
    out.variants[n] = { engine: VARIANTS[n], corpus: runCorpus(VARIANTS[n], split, { quick }), practitioner: split === "DEVELOPMENT" ? runPractitioner(VARIANTS[n]) : runPractitioner(VARIANTS[n], ["VALIDATION"]), seconds: Math.round((Date.now() - t0) / 1000) };
    console.log(n, JSON.stringify(out.variants[n]));
  }
  const file = arg("out", join(dirname(new URL(import.meta.url).pathname), "../../../quant/data/technical-intelligence/elliott-forensics/variants-" + split.toLowerCase() + (quick ? "-quick" : "") + ".json"));
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
}
