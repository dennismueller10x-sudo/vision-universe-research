/* =========================================================================
   VISION UNIVERSE — scripts/market/lib/adjustment-step-evidence.mjs

   Leser fuer quant/config/adjustment-step-evidence.json (Steuerung 22.11.2026):
   belegte Spruenge des Bereinigungsfaktors, die der Anbieter im bereinigten Kurs
   fuehrt, aber nicht als Ereignis meldet (bisher nur SPIN_OFF). Fail closed bei
   jedem Formfehler. Ergebnis: Map securityId -> [{id, kind, date, expectedStep,
   tolerance}], uebergeben an market-quality.js#assessSeries({ explainedSteps }).
   Das Gate selbst bleibt unveraendert; Kurse und splitFactors (ADR-002) ebenso.
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const FILE = "quant/config/adjustment-step-evidence.json";
export const SCHEMA = "adjustment-step-evidence-1.0.0";
export const KINDS = ["SPIN_OFF"];

export function indexAdjustmentStepEvidence(doc) {
  const by = new Map();
  if (doc === null || doc === undefined) return by;
  const bad = (i, m) => { throw new Error("ADJUSTMENT_STEP_EVIDENCE_INVALID: records[" + i + "] " + m); };
  if (!doc || doc.schemaVersion !== SCHEMA || !Array.isArray(doc.records)) throw new Error("ADJUSTMENT_STEP_EVIDENCE_INVALID: schemaVersion " + SCHEMA + " mit records[] erwartet");
  const ids = new Set();
  doc.records.forEach((r, i) => {
    if (!r || typeof r.id !== "string" || !r.id || ids.has(r.id)) bad(i, "id");
    ids.add(r.id);
    if (typeof r.securityId !== "string" || !/^ref_/.test(r.securityId)) bad(i, "securityId");
    if (!KINDS.includes(r.kind)) bad(i, "kind " + r.kind + " (zugelassen: " + KINDS.join(", ") + ")");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || "")) bad(i, "date");
    if (!(Number.isFinite(r.expectedStep) && r.expectedStep > 0)) bad(i, "expectedStep");
    if (!(Number.isFinite(r.tolerance) && r.tolerance > 0 && r.tolerance <= 0.01)) bad(i, "tolerance (0 < t <= 0,01)");
    if (!Array.isArray(r.evidence) || !r.evidence.length) bad(i, "evidence");
    for (const e of r.evidence) {
      if (!/^\d{10}-\d{2}-\d{6}$/.test(e.accession || "")) bad(i, "evidence.accession");
      if (!/^https:\/\/www\.sec\.gov\//.test(e.url || "")) bad(i, "evidence.url");
      if (!/^[0-9a-f]{64}$/.test(e.sha256 || "")) bad(i, "evidence.sha256");
      if (typeof e.quote !== "string" || e.quote.length < 40) bad(i, "evidence.quote");
    }
    if (!r.providerCheck || !r.providerCheck.result || !r.providerCheck.detail) bad(i, "providerCheck");
    const list = by.get(r.securityId) || [];
    list.push(Object.freeze({ id: r.id, kind: r.kind, date: r.date, expectedStep: r.expectedStep, tolerance: r.tolerance }));
    by.set(r.securityId, list);
  });
  return by;
}

export function loadAdjustmentStepEvidence(root = ROOT) {
  const p = join(root, FILE);
  return indexAdjustmentStepEvidence(existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
}
