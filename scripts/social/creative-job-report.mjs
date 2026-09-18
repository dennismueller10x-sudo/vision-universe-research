/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/creative-job-report.mjs

   DAS INVOCATION-BUDGET, SICHTBAR

   Zaehlt logische Jobs gegen beobachtete Starts und sagt, wo der
   Unterschied herkommt. Ruft nichts auf und kostet keinen Work-Aufruf.

   Ausfuehren:
     node scripts/social/creative-job-report.mjs
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Job = require(join(ROOT, "social/engines/creative-job.js"));

const JOBS = "social/data/creative-jobs.json";
const pfad = join(ROOT, JOBS);
if (!existsSync(pfad)) { console.error("Kein " + JOBS); process.exit(2); }

const bestand = JSON.parse(readFileSync(pfad, "utf8"));
const jobs = bestand.jobs || [];

console.log("VISION UNIVERSE SOCIAL — Creative Jobs und Invocation-Budget");
console.log("Stand: " + bestand.generatedAt + "\n");

const kopf = "PR    Inhalt                          Anl  Deliv  Starts  Zustand";
console.log(kopf);
console.log("-".repeat(kopf.length + 12));

let deliveries = 0, starts = 0, verifiziert = 0, gescheitert = 0, diagnostisch = 0;
for (const j of jobs) {
  deliveries += j.deliveryCount || 0;
  starts += j.observedStarts || 0;
  if (j.state === "CREATIVE_JOB_VERIFIED") verifiziert++;
  if (j.state === "CREATIVE_JOB_FAILED") gescheitert++;
  if (Job.istDiagnostisch(j.contentId)) diagnostisch++;
  console.log(
    String(j.prNumber || "—").padEnd(6) +
    j.contentId.slice(0, 30).padEnd(32) +
    String(j.attempt).padEnd(5) +
    String(j.deliveryCount || 0).padEnd(7) +
    String(j.observedStarts === null ? "?" : j.observedStarts).padEnd(8) +
    j.state.replace("CREATIVE_JOB_", ""));
}

console.log("\n--- BUDGET ---");
console.log("Logische Jobs:            " + jobs.length);
console.log("GitHub Deliveries:        " + deliveries);
console.log("Beobachtete Starts:       " + starts);
console.log("Verifiziert:              " + verifiziert);
console.log("Gescheitert:              " + gescheitert);
console.log("Davon diagnostisch:       " + diagnostisch +
  " (Budget im Produktionspfad: " + Job.BUDGET.diagnosticJobsInProduction + ")");

console.log("\n--- WO DER UNTERSCHIED HERKOMMT ---");
const jeKey = {};
for (const j of jobs) jeKey[j.processingKey] = (jeKey[j.processingKey] || 0) + 1;
const doppelt = Object.entries(jeKey).filter(([, n]) => n > 1);
console.log("Processing Keys mit mehr als einem Job: " + doppelt.length +
  (doppelt.length ? " — " + doppelt.map(([k]) => k).join(", ") : ""));
console.log("Jobs mit mehr als einer Delivery:       " +
  jobs.filter((j) => (j.deliveryCount || 0) > 1).length);

const mehrfach = jobs.filter((j) => (j.observedStarts || 0) > 1);
console.log("Jobs mit mehr als einem Start:          " + mehrfach.length +
  " — PR " + mehrfach.map((j) => j.prNumber).join(", "));

const erfolg = jobs.filter((j) => j.state === "CREATIVE_JOB_VERIFIED");
const erfolgStarts = erfolg.map((j) => j.observedStarts).filter((x) => x !== null);
const fehlStarts = jobs.filter((j) => j.state === "CREATIVE_JOB_FAILED")
  .map((j) => j.observedStarts).filter((x) => x !== null);
console.log("\nStarts bei erfolgreichen Jobs: " + erfolgStarts.join(", "));
console.log("Starts bei gescheiterten Jobs: " + fehlStarts.join(", "));

/* ------------------------------------------------------------------ */
/* DER EINZIGE HEBEL, DEN VU HAT                                       */
/* ------------------------------------------------------------------ */
const offenObwohlFertig = jobs.filter((j) =>
  Job.TERMINAL.includes(j.state) && j.prState === "open");
console.log("\n--- ABGESCHLOSSEN, PR TROTZDEM OFFEN ---");
if (!offenObwohlFertig.length) {
  console.log("Keiner.");
} else {
  console.log("Ein offener Request-PR ist die Flaeche, gegen die der Anbieter");
  console.log("weiterarbeitet. Diese " + offenObwohlFertig.length + " sind erledigt und stehen offen:");
  offenObwohlFertig.forEach((j) =>
    console.log("  PR " + j.prNumber + "  " + j.contentId +
      "  (" + j.state.replace("CREATIVE_JOB_", "") + ")"));
}
