#!/usr/bin/env node
/* =========================================================================
   SETUP OOS REPORT (setup-oos-report-1.0.0) - Research-Bericht FV-6 (A1-A6).

   Liest nur committete bzw. uebergebene Dateien und schreibt einen Bericht:
     - gate: was der Zertifizierungs-Builder heute rechnet (gleicher Aufruf:
       Methodik-Segmentierung, abgeschlossene M6-Ergebnisse), zum Abgleich
       mit dem Zertifizierungsartefakt.
     - je Ereignisart (A4) der Auswerter setup-oos-1.0.0 mit der
       Segmentierung, sofern Ereigniszeilen (--rows, Schema
       setup-oos-rows-1.0.0 aus build-setup-outcomes.mjs --oos-rows-out)
       vorliegen, sonst OOS_ROWS_NOT_EXPORTED bzw. OOS_NOT_MEASURABLE_YET.
     - fruehester Messzeitpunkt je Art aus den ECHTEN Ereignistagen
       (setup-outcomes-v1.json, Feld events) plus Fortschreibung.

   Segmentierung: die freigegebene aus dem Vertrag
   (kinds.SETUP_BACKTEST.oosSegmentation mit approval); fehlt sie, die
   Vorlage A1-A6 (SETUP_OOS_DECISION_A1_A6.md §5) als PROPOSAL_NOT_APPROVED,
   oder --segmentation <datei>. Der Bericht speist kein Gate
   (gateInput: false) und erscheint nicht im Produkt.

   node scripts/quant/research/setup-oos-report.mjs [--outcomes <datei>]
        [--rows <datei>] [--segmentation <datei>] [--methodology <datei>]
        [--certification <datei>] [--out <datei>]
   Ohne --out: Ausgabe auf stdout. Ziele unter quant/data werden verweigert.
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const Oos = require(join(ROOT, "quant/engines/setup-oos.cjs"));
const Seg = require(join(ROOT, "quant/engines/setup-oos-segments.js"));
export const REPORT_SCHEMA = "setup-oos-report-1.0.0";

/* Vorlage A1-A6 (SETUP_OOS_DECISION_A1_A6.md §5, Arbeitsgrundlage 31.10.2026).
   KEINE Norm: ohne approval; wird nie in den Vertrag geschrieben. */
export const PROPOSAL_A1_A6 = Object.freeze({
  id: "setup-oos-2027-05-31", method: "FIXED_CALENDAR_CUT", cutDate: "2027-05-31", embargoDays: 183, countBy: "EVENT_DAY",
  criterion: { metric: "MEDIAN_EXCESS", rule: "SIGN_REPLICATES" },
  population: { eventKinds: ["SETUP_NEW", "SETUP_CONFIRMED"], entryVariant: "NEXT_CLOSE", horizon: "m6" }
});
const PROPOSAL_SOURCE = "docs/quant/SETUP_OOS_DECISION_A1_A6.md §5";

export function buildReport({ outcomes, methodology, rowsDoc = null, segmentationOverride = null, certification = null }) {
  const req = methodology.kinds.SETUP_BACKTEST.requirements;
  const min = req.oosMinPerSegment;
  const approved = Oos.segmentationFromMethodology(methodology);
  const st = outcomes.study;
  const completedByKind = Object.fromEntries(Seg.EVENT_KINDS.map((k) => [k, st[k] ? st[k].variants.NEXT_CLOSE.m6.status.COMPLETED : 0]));
  const completedM6 = Math.max(...Object.values(completedByKind));
  /* Spiegel des heutigen Builder-Aufrufs (scripts/quant/build-backtest-certification.mjs). */
  const gate = Oos.evaluateSetupOos({ rows: null, completedCount: completedM6, minPerSegment: min, segmentation: approved });
  const certGate = certification ? ((certification.kinds || []).find((k) => k.id === "SETUP_BACKTEST") || { gates: [] }).gates.find((g) => g.id === "oos") || null : null;

  let segmentation, segmentationStatus, segmentationSource;
  if (segmentationOverride) { segmentation = segmentationOverride; segmentationStatus = segmentationOverride.approval ? "GIVEN_WITH_APPROVAL_FIELD" : "GIVEN_NOT_APPROVED"; segmentationSource = "--segmentation"; }
  else if (approved) { segmentation = approved; segmentationStatus = "APPROVED"; segmentationSource = "quant/methodology/backtest-certification-v1.json kinds.SETUP_BACKTEST.oosSegmentation"; }
  else { segmentation = PROPOSAL_A1_A6; segmentationStatus = "PROPOSAL_NOT_APPROVED"; segmentationSource = PROPOSAL_SOURCE; }

  const evaluation = Seg.evaluateByEventKind({ segmentation, rowsDoc, completedByKind, minPerSegment: min });
  const kinds = Seg.validPopulation(segmentation.population) ? segmentation.population.eventKinds : [];
  const readiness = Object.fromEntries(kinds.map((k) => [k, Seg.projectReadiness({
    eventDates: outcomes.events.filter((e) => e[1] === k).map((e) => e[2]), asOf: outcomes.asOf, segmentation, minPerSegment: min })]));
  const ends = Object.values(readiness).map((r) => r.earliestMeasurable);
  const earliest = ends.length && ends.every(Boolean) ? ends.sort().pop() : null;
  const firstEvent = outcomes.events.map((e) => e[2]).sort()[0] || null;

  return {
    schemaVersion: REPORT_SCHEMA, engine: Seg.VERSION, evaluator: Oos.VERSION, asOf: outcomes.asOf,
    gateInput: false, productionApproved: false,
    note: "Research-Bericht FV-6. Aendert kein Gate, keine Schwelle und keinen Zertifizierungsstatus. Ein PASS hiesse nur „Richtung repliziert“ (OOS_DIRECTIONAL_REPLICATION), keinen wirtschaftlichen Vorteil.",
    sources: { outcomes: { schemaVersion: outcomes.schemaVersion, asOf: outcomes.asOf, returnType: outcomes.returnType, history: outcomes.history, transitions: outcomes.transitions },
      rows: rowsDoc ? { schemaVersion: rowsDoc.schemaVersion, asOf: rowsDoc.asOf, returnType: rowsDoc.returnType } : null,
      methodology: methodology.methodologyVersion, oosMinPerSegment: min },
    gate: { builderCall: "evaluateSetupOos({ rows: null, completedCount: completedM6, minPerSegment, segmentation: segmentationFromMethodology(M) })",
      status: gate.status, reasonCode: gate.reasonCode, value: Oos.gateValue(gate), completedM6,
      certificationArtifact: certGate ? { state: certGate.state, reason: certGate.reason, value: certGate.value, matches: certGate.reason === gate.reasonCode && certGate.state === (gate.status === "PASS" ? "PASS" : "FAIL") } : null },
    decisions: {
      A1: { topic: "Segmentierung", implemented: "setup-oos.cjs (FIXED_CALENDAR_CUT, CHRONOLOGICAL_MEDIAN_EVENT_DATE)", value: { method: segmentation.method, cutDate: segmentation.cutDate ?? null } },
      A2: { topic: "Embargo", implemented: "setup-oos.cjs (embargoDays)", value: segmentation.embargoDays },
      A3: { topic: "Erfolgskriterium", implemented: "setup-oos.cjs (criterion)", value: segmentation.criterion },
      A4: { topic: "Grundgesamtheit je Ereignisart", implemented: "setup-oos-segments.js (evaluateByEventKind)", value: segmentation.population ?? null },
      A5: { topic: "Mindestgroesse roh/effektiv", implemented: "setup-oos.cjs (countBy)", value: segmentation.countBy ?? "ROWS" },
      A6: { topic: "Export der Ereigniszeilen", implemented: "build-setup-outcomes.mjs --oos-rows-out", value: rowsDoc ? "uebergeben" : "nicht uebergeben" }
    },
    segmentation: { status: segmentationStatus, source: segmentationSource, definition: segmentation },
    evaluation,
    readiness,
    earliestMeasurable: earliest,
    firstCompletedM6Estimate: firstEvent ? new Date(Date.parse(firstEvent) + 183 * 86400000).toISOString().slice(0, 10) : null,
    state: evaluation.status === "PASS" ? "MEASURED_PASS" : earliest && earliest <= outcomes.asOf ? "MEASURABLE" : "INSUFFICIENT_HISTORY"
  };
}

function main(argv = process.argv.slice(2)) {
  const o = {};
  const keys = ["--outcomes", "--rows", "--segmentation", "--methodology", "--certification", "--out"];
  for (let i = 0; i < argv.length; i++) {
    if (keys.includes(argv[i]) && argv[i + 1] && !argv[i + 1].startsWith("--") && o[argv[i].slice(2)] === undefined) o[argv[i].slice(2)] = argv[++i];
    else throw Error("INVALID_ARGUMENTS:" + argv[i]);
  }
  if (o.out && (resolve(o.out) + sep).startsWith(join(ROOT, "quant", "data") + sep)) throw Error("REPORT_OUT_INSIDE_QUANT_DATA");
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));
  const certPath = o.certification || join(ROOT, "quant/data/product/backtest-certification-v1.json");
  const report = buildReport({
    outcomes: read(o.outcomes || join(ROOT, "quant/data/product/setup-outcomes-v1.json")),
    methodology: read(o.methodology || join(ROOT, "quant/methodology/backtest-certification-v1.json")),
    rowsDoc: o.rows ? read(o.rows) : null,
    segmentationOverride: o.segmentation ? read(o.segmentation) : null,
    certification: existsSync(certPath) ? read(certPath) : null
  });
  const text = JSON.stringify(report, null, 1) + "\n";
  if (o.out) writeFileSync(o.out, text); else process.stdout.write(text);
  if (o.out) console.log("setup-oos", report.state, "gate", report.gate.reasonCode, "earliestMeasurable", report.earliestMeasurable,
    Object.entries(report.evaluation.byKind || {}).map(([k, r]) => k + "=" + (r.reasonCode || r.status)).join(" "));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
