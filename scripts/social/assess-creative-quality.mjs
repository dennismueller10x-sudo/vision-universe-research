/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/assess-creative-quality.mjs

   Bewertet die VORHANDENEN Varianten eines Creative-Ergebnisses unter
   der Creative-Quality-Rubrik. Ruft nichts auf, erzeugt nichts, kostet
   keinen Work-Aufruf.

   Ausfuehren:
     node scripts/social/assess-creative-quality.mjs --content-id vu-xom-20260911
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { ausgabePfad } from "../quality/out-path.mjs";
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Story = require(join(ROOT, "social/engines/story-selection.js"));
const Creative = require(join(ROOT, "social/engines/creative-quality.js"));
const Zerlegung = require(join(ROOT, "social/engines/score-decomposition.js"));
const { createHash } = await import("node:crypto");

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
const CID = arg("content-id", "vu-xom-20260911");
const JSON_OUT = arg("json", null);

const dir = join(ROOT, "authoring/requests", CID);
const briefRoh = readFileSync(join(dir, "authoring-brief.json"));
const brief = JSON.parse(String(briefRoh));
const resultRoh = readFileSync(join(dir, "authoring-result.json"));
const result = JSON.parse(String(resultRoh));

/* -------------------------------------------------------------------
   GEPRUEFT WIRD DER TEXT, DER VERSCHICKT WUERDE

   Liegt eine redaktionelle Korrektur von Vision Universe daneben, ist
   SIE der oeffentliche Text - nicht mehr die Fassung des Agenten. Eine
   Rubrik, die weiter das Original bewertet, bescheinigt einem Text
   etwas, den niemand zu sehen bekommt.
   ------------------------------------------------------------------- */
const korrPfad = join(dir, "vu-editorial-correction.json");
const korrRoh = existsSync(korrPfad) ? readFileSync(korrPfad) : null;
const korrektur = korrRoh ? JSON.parse(String(korrRoh)) : null;
const CAPTION = (korrektur && korrektur.caption) || result.caption;

const story = Story.select(brief.evidence, {});

/* Die Zerlegung stammt aus dem URSPRUNGSBRIEF: nur dort stehen alle
   sechs Beitraege. Der rev3-Brief traegt die fuenf Belege der Copy -
   eine Aussage ueber "die Luecke" braucht aber das Ganze. */
const wurzelBrief = join(ROOT, "authoring/requests",
  String(brief.supersedes_content_id || CID).replace(/-rev\d+$/, ""),
  "authoring-brief.json");
const zerlegung = existsSync(wurzelBrief)
  ? Zerlegung.zerlege(JSON.parse(readFileSync(wurzelBrief, "utf8")).evidence)
  : Zerlegung.zerlege(brief.evidence);

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

const auswahl = Creative.best(varianten, { caption: CAPTION, story,
  decomposition: zerlegung.complete ? zerlegung : null,
  attributionCheck: Zerlegung.pruefeZuschreibung });

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
    /* -----------------------------------------------------------------
       PROVENANCE: WORAUF SICH DIESER BEFUND BEZIEHT

       Ein Gate, das fuer die kanonische Auswahl zaehlt, darf nicht nur
       als Sitzungsausgabe existieren - und ein gespeicherter Befund
       ohne Bezug waere kaum besser. Steht nicht dabei, WELCHER Text
       bewertet wurde, laesst sich spaeter nicht sagen, ob er noch gilt.
       ------------------------------------------------------------------- */
    provenance: {
      contentId: CID,
      briefBlobSha: createHash("sha1")
        .update("blob " + briefRoh.length + "\0").update(briefRoh).digest("hex"),
      resultSha256: createHash("sha256").update(resultRoh).digest("hex"),
      captionSource: korrektur ? "vu-editorial-correction.json" : "authoring-result.json",
      captionSha256: createHash("sha256").update(Buffer.from(CAPTION, "utf8")).digest("hex"),
      editorialCorrection: korrektur
        ? { by: korrektur.by, criterion: korrektur.criterion,
            correctedAt: korrektur.correctedAt }
        : null,
      decompositionComplete: zerlegung.complete,
      attributionChecked: auswahl.assessed.every((b) => b.assessment.attributionChecked),
      /* Ausdruecklich: diese Rubrik sagt keine Leistung voraus. Ein
         Kompositionsunterschied von einem Punkt ist eine Regel zur
         Aufloesung von Gleichstaenden, keine Prognose. n=0. */
      predictsPerformance: false,
      rubricVersion: Creative.RUBRIK_VERSION || null,
      generatedBy: "scripts/social/assess-creative-quality.mjs"
    },
    chosen: auswahl.ok ? auswahl.chosen.variant.id : null,
    closest: auswahl.closest ? auswahl.closest.variant.id : null,
    explanation: auswahl.explanation
  };
  mkdirSync(dirname(ausgabePfad(ROOT, JSON_OUT)), { recursive: true });
  writeFileSync(ausgabePfad(ROOT, JSON_OUT), JSON.stringify(daten, null, 2) + "\n");
  console.log("\nGeschrieben: " + JSON_OUT);
}
