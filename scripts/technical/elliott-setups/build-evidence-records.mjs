#!/usr/bin/env node
/* VU MISSION X — Evidenz-Datensaetze je Setup fuer den Produkt-Vertrag (ELLIOTT_PRODUCT_EVIDENCE_CONTRACT.md).
   Werte nur aus den Auswertungsdateien (keine Handwerte). Jeder Datensatz traegt publishable=false, bis ein Setup
   prospektiv LEVEL 3 erreicht und Legal Review vorliegt.
     node scripts/technical/elliott-setups/build-evidence-records.mjs --dir quant/data/technical-intelligence/elliott-setups [--registry-eval FILE] --out FILE */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SPEC, SPEC_SHA256 } from "./setup-library.mjs";

function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }
export const CONTRACT_VERSION = "elliott-evidence-contract-1.0.0";
const LIMITS = {
  ALL: ["Historische Evidenz liegt auf verbrauchten Wochendaten (Mission I–IX); höchstens Validierung, keine Bestätigung.",
        "Trefferquote nur zusammen mit der Kontrollquote gleicher Geometrie lesen; eine hohe Quote bei nahem Ziel ist Geometrie.",
        "Zustandslose Engine-Sicht (ohne Persistenzkette); die Produktanzeige kann davon abweichen.",
        "Historische Häufigkeit, keine Wahrscheinlichkeit."],
  S1_EARLY_WAVE3: ["Die eingefrorene Engine zeigt eine laufende Welle 2/3 praktisch nie als Hauptzählung; Evidenz nur über die nicht angezeigte Forschungskohorte."],
  S2_WAVE4_TO_5: ["Als angezeigte Zählung praktisch nie vorhanden."],
  S3_CORRECTION_COMPLETE: ["Bei Erkennung liegt der Kurs oft schon jenseits der Projektionszone; dann gilt das Setup nicht."],
  S4_TRIANGLE_THRUST: ["Angezeigte Fälle sehr selten (n < 20 je Hälfte)."]
};

export function buildRecords(dir, registryEval) {
  const val = JSON.parse(readFileSync(join(dir, "setup-eval-w-val.json"), "utf8")), dev = JSON.parse(readFileSync(join(dir, "setup-eval-w-dev.json"), "utf8"));
  const dec = JSON.parse(readFileSync(join(dir, "setup-decision.json"), "utf8"));
  if (val.specSha256 !== SPEC_SHA256 || dec.specSha256 !== SPEC_SHA256) throw new Error("Evidenz zu anderer Setup-Spec");
  const reg = registryEval && existsSync(registryEval) ? JSON.parse(readFileSync(registryEval, "utf8")) : null;
  const records = [];
  for (const f of SPEC.families) for (const vr of ["PURE", "PURE_RS", "CONFIRMED", "ENGINE_PRIMARY"]) {
    const v = val.results[f.id][vr].all, d = dev.results[f.id][vr].all, D = dec.perSetup[f.id][vr];
    const prosp = reg ? Object.fromEntries(Object.entries(reg.scenarioStatus || {}).filter(([k]) => k.endsWith("|" + f.id))) : null;
    records.push({
      contractVersion: CONTRACT_VERSION, setupName: f.name, setupId: f.id, variant: vr, setupVersion: SPEC.setupVersion, specSha256: SPEC_SHA256, evidenceVersion: "mission10-v1",
      productVisible: vr !== "ENGINE_PRIMARY", timeframe: "1W",
      historicalCases: v.n || 0, historicalCasesDevelopment: d.n || 0, coverage: v.coverageOfDetectionPoints ?? null,
      scenarioSuccess: v.n ? v.hit : null, scenarioSuccessCi: v.n ? v.hitCi : null, matchedBaseline: v.n ? v.controlD : null, matchedBaselineDefinition: "gleiches Datum, andere Titel, gleiche Ziel-/Invalidations-/Bestätigungsabstände in ATR",
      lift: v.n ? v.liftD : null, liftCi: v.n ? v.liftDCi : null, liftVsTrendRs: v.n ? v.liftTR : null, liftVsTrendRsCi: v.n ? v.liftTRCi : null,
      geometry: v.n ? v.geometry : null, medianPayoff: v.n ? v.payoff.payoffRatio : null, expectancyR: v.n ? v.expectancyR : null, expectancyRCi: v.n ? v.expectancyRCi : null,
      invalidatedFirst: v.n ? v.invalidatedFirst : null, relabelRate: v.n ? v.relabelBeforeResolution : null, confirmationBeforeExit: v.n ? v.confirmationBeforeExit : null,
      longHorizon: v.long || null,
      evidenceGrade: D.status, evidenceGradeReason: D.reason, dataStatus: "VALIDATION_ON_CONSUMED_DATA",
      prospective: prosp, limitations: [...LIMITS.ALL, ...(LIMITS[f.id] || [])],
      publishable: false, publishableReason: "Kein Setup hat prospektive Bestätigung (LEVEL 3). Anzeige historischer Zahlen erst nach Legal Review und nur mit Kontrollquote."
    });
  }
  return { schemaVersion: CONTRACT_VERSION, generatedFrom: { val: "setup-eval-w-val.json", dev: "setup-eval-w-dev.json", decision: "setup-decision.json", registry: registryEval || null }, records };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = buildRecords(arg("dir"), arg("registry-eval", null)); writeFileSync(arg("out"), JSON.stringify(r, null, 1) + "\n");
  console.log("[evidence-records] " + r.records.length + " Datensaetze, publishable=" + r.records.filter((x) => x.publishable).length);
}
