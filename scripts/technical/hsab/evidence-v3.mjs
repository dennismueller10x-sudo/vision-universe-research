#!/usr/bin/env node
/* Mission IX — versioniertes Evidenz-Artefakt v3: Mission VIII (unveraendert uebernommen) + Mission IX Track A/B/Elliott.
     node scripts/technical/hsab/evidence-v3.mjs --out quant/data/technical-intelligence/historical-accuracy/technical-intelligence-evidence-v3.json */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../lib/ti-data.mjs";

function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }
const H = join(ROOT, "quant/data/technical-intelligence/historical-accuracy");
const load = (f) => (existsSync(join(H, f)) ? JSON.parse(readFileSync(join(H, f), "utf8")) : null);
const v2 = load("technical-intelligence-evidence-v2.json");
const p9 = JSON.parse(readFileSync(join(ROOT, "scripts/technical/hsab/protocol9.json"), "utf8"));
const aC = load("mission9/ci/a9-confirm-tracka.json"), aE = load("mission9/ci/a9-confirm-eval.json"), opened = load("mission9/ci/a9-confirm-opened.json");
const aD = load("mission9/local/tracka-w-dev.json"), aV = load("mission9/local/tracka-w-val.json");
const dec = load("mission9/local/decision-trackb-elliott.json");
const pick = (d) => d && d.decision && { HA1: d.decision.HA1, symmetricAll: d.decision.symmetricAll, selectiveTiers: d.decision.selectiveTiers, HA2: d.decision.HA2, HA3: d.decision.HA3, HA4: d.decision.HA4, HA5: d.decision.HA5, events: d.events };

const out = {
  schemaVersion: "technical-intelligence-evidence-3.0.0", generatedAt: new Date().toISOString(),
  engine: v2 && v2.engine, evidenceStatus: "BOUND_TO_ENGINE_VERSION (ti-scenario-1.2.1 / elliott-3.2.2)",
  mission8: v2 ? { schemaVersion: v2.schemaVersion, classification: v2.classification, assessment: v2.assessment } : null,
  mission9: {
    protocol: { file: "scripts/technical/hsab/protocol9.json", status: p9.status, preregistration: p9.preregistration, freezeCommit: opened ? opened.freeze : null, opening: opened },
    trackA: {
      question: "Hohe Trefferquote unter kontrollierter Geometrie und Marktbasis?",
      weeklyDev: { level: "DEVELOPMENT_CONSUMED", ...pick(aD) }, weeklyVal: { level: "VALIDATION_CONSUMED", ...pick(aV) },
      dailyConfirm: aC ? { level: "CONDITIONAL_HOLDOUT_CONFIRMATION (titel-disjunkt, Kalender bekannt)", ...pick(aC), overallLiftVsD: aE && aE.tables.primary.vsD } : { level: "PENDING" },
      classification: aC && aC.decision ? aC.decision.HA1 : "PENDING"
    },
    trackB: dec ? { level: dec.trackB.level, classification: dec.trackB.classification, perSignal: dec.trackB.perSignal, vuBullHarmsSuperwinnerSelection: dec.trackB.vuBullHarmsSuperwinnerSelection } : null,
    elliott: dec ? { displayed: "STRUCTURAL_LANGUAGE_ONLY", internalCandidates: { level: dec.elliott.level, classification: dec.elliott.classification, standalone: dec.elliott.standalone, filters: dec.elliott.filters,
      caveat: "nur Haeufigkeit extremer Aufwaertsbewegungen; kein gedeckelter Renditevorteil; Zusatzwert ueber RS26 nicht gesichert; nicht angezeigt; explorativ auf verbrauchten Daten" } } : null,
    customerClaimsReady: [],
    overallTiClass: "C_DESCRIPTIVE_DECISION_SUPPORT_VALUE"
  }
};
writeFileSync(arg("out"), JSON.stringify(out, null, 1));
console.log("[evidence-v3] Track A " + out.mission9.trackA.classification + "; Track B " + (out.mission9.trackB && out.mission9.trackB.classification));
