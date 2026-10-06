/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/verify-creative-dispatch.mjs

   GEHOERT DIESER REQUEST-PR ZU EINEM BESCHLOSSENEN JOB?

   Laeuft in der CI auf jedem Pull Request, der authoring/requests/**
   beruehrt. Er kann den Agentenstart nicht mehr verhindern — wenn er
   laeuft, ist die Delivery raus. Er beantwortet die Frage, die danach
   zaehlt: hat VU diesen Dispatch beschlossen, oder ist er passiert?

   Ausfuehren:
     node scripts/social/verify-creative-dispatch.mjs --branch authoring/request/vu-xom-20260911
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Job = require(join(ROOT, "social/engines/creative-job.js"));

export const REGISTER = "social/data/creative-jobs.json";

/** Die content_id aus dem Branchnamen. null, wenn es kein Request-Branch ist. */
export function contentIdAus(branch) {
  const t = /^authoring\/request\/(.+)$/.exec(String(branch || ""));
  if (!t) return null;
  /* Anlauf-Suffixe gehoeren zum Branch, nicht zur Kennung. */
  return t[1].replace(/-attempt\d+$/, "");
}

/**
 * Der Befund. Bewusst als Wert und nicht als Wurf, damit ihn auch
 * Tests lesen koennen.
 */
export function pruefe(branch, jobs) {
  const contentId = contentIdAus(branch);
  if (!contentId) {
    return { ok: true, reason: "notARequestBranch",
      message: "Kein Request-Branch — diese Pruefung gilt nicht." };
  }

  const registry = Job.createRegistry(jobs || []);
  const passend = registry.byContent(contentId);

  if (!passend.length) {
    return { ok: false, reason: "noJob", contentId,
      message: "Fuer " + contentId + " steht kein logischer Creative Job im " +
        "Register. Dieser Pull Request hat einen externen Agenten " +
        "ausgeloest, ohne dass VU das beschlossen haette. Erst " +
        "dispatch-creative-job.mjs, dann der Pull Request." };
  }

  /* Mehrere Jobs zu EINEM Inhalt sind zulaessig, solange es verschiedene
     Anlaeufe sind — aber nie zwei zum selben Processing Key. */
  const keys = {};
  for (const j of passend) keys[j.processingKey] = (keys[j.processingKey] || 0) + 1;
  const doppelt = Object.keys(keys).filter((k) => keys[k] > 1);
  if (doppelt.length) {
    return { ok: false, reason: "duplicateJob", contentId,
      message: "Zu " + contentId + " stehen mehrere Jobs mit demselben " +
        "Processing Key im Register: " + doppelt.join(", ") + ". Das ist " +
        "zweimal dieselbe Arbeit." };
  }

  const offen = registry.openFor(contentId);
  if (offen.length > Job.BUDGET.concurrentJobsPerContentId) {
    return { ok: false, reason: "concurrentJobs", contentId,
      message: "Zu " + contentId + " sind " + offen.length + " Jobs " +
        "gleichzeitig offen (Grenze " + Job.BUDGET.concurrentJobsPerContentId +
        "). Zwei Ergebnisse fuer dieselbe Kennung konkurrieren." };
  }

  return { ok: true, reason: null, contentId,
    message: contentId + ": " + passend.length + " Job/Jobs im Register, " +
      offen.length + " offen. Innerhalb des Budgets." };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const BRANCH = arg("branch", null);
  if (!BRANCH) { console.error("Kein --branch."); process.exit(2); }

  const pfad = join(ROOT, REGISTER);
  const roh = existsSync(pfad) ? JSON.parse(readFileSync(pfad, "utf8")) : { jobs: [] };
  const befund = pruefe(BRANCH, roh.jobs || []);

  console.log("VISION UNIVERSE SOCIAL — Creative Job Guard");
  console.log("Branch: " + BRANCH + "\n");
  console.log(befund.message);

  if (!befund.ok) {
    console.error("\nKein beschlossener Dispatch. Rot ist hier richtig: der " +
      "Agent laeuft bereits, und das soll niemand uebersehen.");
    process.exit(5);
  }
}
