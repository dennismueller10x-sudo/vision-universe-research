/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/assess-creative-quality.mjs

   Bewertet die VORHANDENEN Varianten eines Creative-Ergebnisses unter
   der Creative-Quality-Rubrik. Ruft nichts auf, erzeugt nichts, kostet
   keinen Work-Aufruf.

   Ausfuehren:
     node scripts/social/assess-creative-quality.mjs --content-id vu-xom-20260911
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Story = require(join(ROOT, "social/engines/story-selection.js"));
const Creative = require(join(ROOT, "social/engines/creative-quality.js"));

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
const CID = arg("content-id", "vu-xom-20260911");
const JSON_OUT = arg("json", null);

const dir = join(ROOT, "authoring/requests", CID);
const brief = JSON.parse(readFileSync(join(dir, "authoring-brief.json"), "utf8"));
const result = JSON.parse(readFileSync(join(dir, "authoring-result.json"), "utf8"));

const story = Story.select(brief.evidence, {});

console.log("VISION UNIVERSE SOCIAL — Creative Quality");
console.log("Inhalt: " + CID + "\n");

console.log("--- STORY SELECTION ---");
console.log(story.explanation);
if (story.hasTension) {
  console.log("Frage der Evidenz: " + story.tension.question);
  console.log("Ausgewaehlt: " + story.selectedIds.join(", "));
  console.log("Gebunden, nicht verwendet: " + story.unused.length + " Belege");
}
console.log("");

const varianten = (result.hook_variants || []).map((h) => ({
  hook: h.hook_text || h.text,
  evidenceRefs: h.evidence_refs || [],
  id: h.hook_variant_id
}));

const auswahl = Creative.best(varianten, { caption: result.caption, story });

console.log("--- DIE VIER VORHANDENEN VARIANTEN ---\n");
auswahl.assessed.forEach((b) => {
  const a = b.assessment;
  console.log("[" + (b.index + 1) + "] " + b.variant.hook);
  console.log("    " + (a.passed ? "BESTANDEN" : "NICHT BESTANDEN") +
    "  — Hook-Ebene " + b.hookMet + " von " + b.hookTotal +
    ", gesamt " + a.met + " von " + a.total);
  a.criteria.filter((k) => k.surface !== "caption").forEach((k) => {
    const zeichen = k.passed === true ? "  ok  " : (k.passed === null ? " n.g. " : " FAIL ");
    console.log("    " + zeichen + k.id + " [" + k.surface + "]" +
      (k.kind === "policy" ? " (Setzung)" : ""));
    if (k.passed !== true) console.log("           " + k.finding);
  });
  console.log("");
});

console.log("--- BEFUNDE DER GEMEINSAMEN CAPTION ---");
console.log("Gelten fuer alle vier gleich und gehen deshalb nicht in den");
console.log("Variantenvergleich ein — nachzuarbeiten sind sie trotzdem.\n");
auswahl.assessed[0].assessment.criteria
  .filter((k) => k.surface === "caption").forEach((k) => {
    const zeichen = k.passed === true ? "  ok  " : (k.passed === null ? " n.g. " : " FAIL ");
    console.log("    " + zeichen + k.id + (k.kind === "policy" ? " (Setzung)" : ""));
    if (k.passed !== true) console.log("           " + k.finding);
  });
console.log("");

console.log("--- AUSWAHL ---");
console.log(auswahl.explanation);
if (!auswahl.ok && auswahl.closest) {
  console.log("Am naechsten dran: Variante " + (auswahl.closest.index + 1) +
    " (" + auswahl.closest.hookMet + " von " + auswahl.closest.hookTotal +
    " auf Hook-Ebene). Das ist keine Auswahl.");
}
console.log("\nHinweis: predictsPerformance = " +
  auswahl.assessed[0].assessment.predictsPerformance +
  ". Die Rubrik sagt keine Leistung voraus; dafuer gibt es n=0.");

/* -------------------------------------------------------------------
   DIE BEWERTUNG ALS DATEN

   Damit sie an einer Owner-Entscheidung haengen kann, statt nur auf
   einem Terminal zu stehen. Strukturiertes Feedback heisst: der
   naechste Lauf kann es LESEN.
   ------------------------------------------------------------------- */
if (JSON_OUT) {
  const daten = {
    generatedAt: new Date().toISOString(),
    contentId: CID,
    /* Ausdruecklich mitgeschrieben, damit niemand die Zaehlung spaeter
       als Leistungsprognose liest. */
    predictsPerformance: false,
    note: "Rubrik, keine Messung. Sie prueft nachvollziehbare " +
      "Eigenschaften eines Textes und sagt keine Reichweite voraus; " +
      "dafuer gibt es im Bestand n=0.",
    story: {
      hasTension: story.hasTension,
      question: story.hasTension ? story.tension.question : null,
      strength: story.hasTension ? {
        component: story.tension.strength.component,
        value: story.tension.strength.value, max: story.tension.strength.max } : null,
      drag: story.hasTension ? {
        component: story.tension.drag.component,
        value: story.tension.drag.value, max: story.tension.drag.max } : null,
      support: story.hasTension && story.tension.support
        ? story.tension.support.id : null,
      selectedIds: story.selectedIds,
      unusedCount: story.unused.length,
      explanation: story.explanation
    },
    variants: auswahl.assessed.map((b) => ({
      index: b.index + 1,
      hookVariantId: b.variant.id,
      hook: b.variant.hook,
      passed: b.assessment.passed,
      hookMet: b.hookMet, hookTotal: b.hookTotal,
      met: b.assessment.met, total: b.assessment.total,
      criteria: b.assessment.criteria.map((k) => ({
        id: k.id, surface: k.surface, kind: k.kind,
        passed: k.passed, finding: k.finding }))
    })),
    chosen: auswahl.ok ? auswahl.chosen.variant.id : null,
    closest: auswahl.closest ? auswahl.closest.variant.id : null,
    explanation: auswahl.explanation
  };
  mkdirSync(dirname(join(ROOT, JSON_OUT)), { recursive: true });
  writeFileSync(join(ROOT, JSON_OUT), JSON.stringify(daten, null, 2) + "\n");
  console.log("\nGeschrieben: " + JSON_OUT);
}
