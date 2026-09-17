/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/diagnose-creative-provider.mjs

   DAS KONTROLLIERTE EXPERIMENT STATT DES BLINDEN RETRYS

   -------------------------------------------------------------------------
   WAS BEKANNT IST
   -------------------------------------------------------------------------

     PR 97   1 524 Bytes   kein evidence-Block   Text          erfolgreich
     PR 98   2 932 Bytes   kein evidence-Block   Text + Bild   erfolgreich
     PR 101 11 910 Bytes   23 evidence-Saetze    Text + Bild   6x STARTED, nichts

   Das ist eine Korrelation ueber drei Punkte und keine Ursache.

   -------------------------------------------------------------------------
   WAS DER STRUKTURVERGLEICH ZUSAETZLICH ERGAB
   -------------------------------------------------------------------------

   Verschachtelungstiefe identisch (3). Der laengste String in PR 101 ist
   sogar KUERZER als in PR 98 (176 gegen 205 Zeichen). Es gibt also keine
   pathologische Struktur, an der sich ein Parser verschlucken muesste.

   Aber: PR 101 traegt fuenf Nicht-ASCII-Zeichen, die in beiden
   erfolgreichen Proofs fehlen.

     Proofs    ss ae oe ue          gewoehnliche deutsche Buchstaben
     PR 101    x - -- "" ,,         Malzeichen, Halbgeviert, Geviert,
                                    typografische Anfuehrungszeichen

   Sie stammen aus den Quant-Daten: "Band ,,Konstruktiv"", "0-100",
   "0.83x zum Median". Das ist eine zweite, bisher uebersehene Variable —
   und sie kostet nichts extra, wenn man sie mitprueft.

   -------------------------------------------------------------------------
   DER AUFBAU
   -------------------------------------------------------------------------

   Zwei Anfragen, jede veraendert gegenueber der BEWIESEN FUNKTIONIERENDEN
   Fassung (PR 98) genau eine Achse:

     D1  klein  (~3 KB)  MIT evidence-Block, must_not_claim, unavailable
                         UND den typografischen Zeichen
                         -> prueft die STRUKTUR bei bewaehrter Groesse

     D2  gross  (~12 KB) OHNE evidence-Block, ohne Sonderzeichen,
                         aufgefuellt mit gewoehnlichem Brieftext
                         -> prueft die GROESSE allein

   Ablesbar:

     D1 ok, D2 nicht   -> Groesse
     D1 nicht, D2 ok   -> Struktur oder Zeichen (dann ein dritter Lauf,
                          der die beiden trennt)
     beide nicht       -> beides, oder eine Regression seit den Proofs
     beide ok          -> keine der Hypothesen reproduziert; dann spricht
                          es fuer einen transienten Anbieterfehler, und
                          der naechste Schritt ist der Originalinhalt
                          unter einem neuen Processing Key

   -------------------------------------------------------------------------
   WAS DIESE ANFRAGEN NICHT SIND
   -------------------------------------------------------------------------

   Sie sind nicht produktiv. Eigene content_ids, eigene brief_ids, eigene
   Processing Keys. Sie beruehren die Kandidatenkette nicht, sie
   veraendern PR 101 nicht, und sie loesen keinen weiteren Lauf auf
   derselben Delivery aus.

   Ausfuehren:
     node scripts/social/diagnose-creative-provider.mjs
     node scripts/social/diagnose-creative-provider.mjs --write
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));

/* Die Zeichen, die PR 101 traegt und die Proofs nicht. Als Escapes,
   damit diese Datei ASCII bleibt. */
const MAL = "×", HALB = "–", GEVIERT = "—";
const AUF = "„", ZU = "“";
const AE = "ä", OE = "ö", UE = "ü", SZ = "ß";

/* ------------------------------------------------------------------ */
/* DIE GEMEINSAME GRUNDLAGE                                            */
/*                                                                     */
/* Woertlich der Bau von PR 98, damit alles ausser der gepruefen       */
/* Achse gleich bleibt. Wer hier etwas veraendert, veraendert das      */
/* Experiment.                                                         */
/* ------------------------------------------------------------------ */
function grundbrief(contentId, briefId, topic, objective) {
  return {
    schema_version: "1.0",
    fixture_type: "provider_capability_diagnostic",
    test_fixture: true,
    brief_id: briefId,
    content_id: contentId,
    brand: "Vision Universe",
    language: "de",
    channel: "technical-proof-only",
    format: "single-square-visual",
    topic: topic,
    objective: objective,
    audience: "Interne Vision-Universe-Workflow-Pr" + UE + "fung",
    hook_strategy: {
      strategy_id: "curiosity-gap-system-proof-v2",
      hook_type: "curiosity_gap",
      instruction: "Formuliere neugierig machende Fragen zum Diagnoselauf. " +
        "Keine Marktbehauptung, keine Renditeaussage und keine alternative " +
        "Hook-Strategie."
    },
    visual_strategy: {
      strategy_id: "FUTURE_TECH",
      instruction: "Eine hochwertige, abstrakte Future-Tech-Szene visualisiert " +
        "den kontrollierten Fluss von einem strukturierten Datenmodul " +
        UE + "ber einen leuchtenden Creative-Core zu einem fertigen Bildasset.",
      creative_freedom: "Motivdetails, r" + AE + "umliche Komposition, " +
        "Lichtf" + UE + "hrung und Materialit" + AE + "t innerhalb FUTURE_TECH.",
      palette: ["deep black", "white", "chrome", "electric cyan", "subtle violet"],
      style: "premium cinematic 3D technology visualization",
      composition: "square, centered transformation flow, generous negative space",
      restrictions: ["Kein Text im Bild", "Kein Logo", "Keine Aktienkurse",
        "Keine Renditezahlen", "Keine Marktprognose", "Kein Wasserzeichen"]
    },
    asset_requirements: {
      count: 1,
      preferred_mime_type: "image/png",
      preferred_width: 1024,
      preferred_height: 1024,
      deterministic_path: ChatGptWork.requestDir(contentId) + "/assets/visual-01.png"
    },
    authoring_requirements: {
      hook_variant_count: 3,
      stable_hook_variant_ids: true,
      hook_ids_bound_to_brief_blob_sha: true,
      visual_variant_ids_bound_to_brief_blob_sha: true,
      recommended_hook_allowed: true,
      canonical_selected_hook_allowed: false,
      evidence_refs_required: true,
      actual_image_asset_required: true,
      publishing_allowed: false
    },
    constraints: [
      "Ausschlie" + SZ + "lich nicht produktive Testfixture",
      "Keine produktiven Marktbehauptungen",
      "Keine Anlageberatung",
      "Keine Publishing-Aktion",
      "Kein selected_hook",
      "Hook-Strategie ausschlie" + SZ + "lich aus diesem Brief " + UE + "bernehmen",
      "Visual Strategy ausschlie" + SZ + "lich aus diesem Brief " + UE + "bernehmen",
      "Keine Placeholder- oder programmatisch erzeugte Ersatzgrafik"
    ],
    publishing_allowed: false
  };
}

/* ------------------------------------------------------------------ */
/* D1 — DIE STRUKTUR BEI BEWAEHRTER GROESSE                            */
/* ------------------------------------------------------------------ */
export function briefD1() {
  const cid = "vu-diag-structure-20260917";
  const b = grundbrief(cid, "vu-diag-structure-brief-20260917",
    "Diagnoselauf: Evidenzstruktur bei bew" + AE + "hrter Briefgr" + OE + SZ + "e",
    "Pr" + UE + "fen, ob ein Brief in der Gr" + OE + SZ + "enordnung des " +
    "erfolgreichen Laufs den Agenten weiterhin erreicht, wenn er einen " +
    "evidence-Block und typografische Zeichen tr" + AE + "gt.");

  /* Genau die vier Schluessel, die PR 101 zusaetzlich hatte — und nur
     drei Belegsaetze, damit die Groesse klein bleibt. Die
     typografischen Zeichen sind absichtlich enthalten. */
  b.evidence = [
    { id: "diag-1", dimension: "SCORE",
      statement: "Technical Opportunity Score 76 von 100 (Band " + AUF + "Konstruktiv" + ZU + " ab 60).",
      value: 76, unit: null, entity: "DIAG", metric: "Technical Opportunity Score",
      source: "vu-technical", observedAt: "2026-09-11", state: "VERIFIED" },
    { id: "diag-2", dimension: "SCORE",
      statement: "Methodologischer Setup-Rang 0" + HALB + "100. Keine Wahrscheinlichkeit, keine Renditeerwartung.",
      value: null, unit: null, entity: "DIAG", metric: "Methodik",
      source: "vu-technical", observedAt: "2026-09-11", state: "VERIFIED" },
    { id: "diag-3", dimension: "VOLUME",
      statement: "Volumen NORMAL, relativ 0.83" + MAL + " zum Median.",
      value: 0.83, unit: null, entity: "DIAG", metric: "Relatives Volumen",
      source: "vu-technical", observedAt: "2026-09-11", state: "VERIFIED" }
  ];
  b.evidence_package = { packageId: "diagpkg_structure", asOf: "2026-09-11",
    dimensionsAvailable: ["SCORE", "VOLUME"], statements: 3 };
  b.unavailable = [{ dimension: "RELATIVE_STRENGTH", reason: "Kein Benchmark hinterlegt." }];
  b.must_not_claim = ["causality", "forecast", "recommendation", "comparison"];
  return b;
}

/* ------------------------------------------------------------------ */
/* D2 — DIE GROESSE ALLEIN                                             */
/* ------------------------------------------------------------------ */
export function briefD2() {
  const cid = "vu-diag-size-20260917";
  const b = grundbrief(cid, "vu-diag-size-brief-20260917",
    "Diagnoselauf: Briefgr" + OE + SZ + "e ohne Evidenzstruktur",
    "Pr" + UE + "fen, ob allein die Gr" + OE + SZ + "e eines Briefes den " +
    "Agenten daran hindert, ein Ergebnis zu liefern.");

  /* Aufgefuellt mit gewoehnlichem Brieftext und ohne jedes Sonderzeichen:
     keine evidence-Schluessel, kein Malzeichen, kein Geviertstrich, keine
     typografischen Anfuehrungszeichen. Nur das, was die Proofs auch
     hatten.

     Die Fuellung ist inhaltlich harmlos und als Fuellung deklariert —
     ein Brief, der heimlich etwas anderes sagt, waere ein zweites
     Experiment im ersten. */
  const zeile = "Dieser Abschnitt dient ausschlie" + SZ + "lich dazu, die " +
    "Nutzlast des Briefes zu vergr" + OE + SZ + "ern. Er enth" + AE + "lt keine " +
    "zus" + AE + "tzliche Anweisung, keine Marktaussage und keine Zahl, auf die " +
    "sich der Agent beziehen soll oder darf.";
  b.payload_padding_note = "Die folgenden Eintraege sind erklaerte Fuellung " +
    "fuer den Groessentest. Sie tragen keine Anweisung.";
  b.payload_padding = [];
  /* So viele Zeilen, bis die Groesse von PR 101 erreicht ist. */
  while (JSON.stringify(b, null, 2).length < 11910) {
    b.payload_padding.push(zeile + " Abschnitt " + (b.payload_padding.length + 1) + ".");
  }
  return b;
}

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  const WRITE = process.argv.includes("--write");

  const referenz = 11910;
  console.log("VISION UNIVERSE SOCIAL — Provider-Diagnose");
  console.log("Referenz: PR 98 = 2932 Bytes (erfolgreich), PR 101 = " + referenz +
    " Bytes (kein Ergebnis)\n");

  for (const [name, brief, achse] of [
    ["D1", briefD1(), "Struktur (evidence, must_not_claim, unavailable, Sonderzeichen) bei KLEINER Groesse"],
    ["D2", briefD2(), "Groesse allein, OHNE evidence und OHNE Sonderzeichen"]
  ]) {
    const roh = JSON.stringify(brief, null, 2) + "\n";
    const sha = ChatGptWork.blobSha(roh);
    const verzeichnis = ChatGptWork.requestDir(brief.content_id);
    const sonderzeichen = Array.from(new Set(
      roh.split("").filter((c) => c.charCodeAt(0) > 127))).sort().join("");

    console.log("--- " + name + " — " + achse + " ---");
    console.log("  content_id      " + brief.content_id);
    console.log("  brief_id        " + brief.brief_id);
    console.log("  Bytes           " + roh.length);
    console.log("  evidence        " + (brief.evidence ? brief.evidence.length : "kein Block"));
    console.log("  Nicht-ASCII     " + sonderzeichen);
    console.log("  brief_blob_sha  " + sha);
    console.log("  processing_key  " +
      ChatGptWork.processingKey(brief.brief_id, brief.content_id, sha, "1.0"));
    console.log("  Pfad            " + verzeichnis + "/authoring-brief.json");

    if (WRITE) {
      const ziel = join(ROOT, verzeichnis);
      mkdirSync(ziel, { recursive: true });
      writeFileSync(join(ziel, "authoring-brief.json"), roh);
      console.log("  geschrieben.");
    }
    console.log();
  }

  if (!WRITE) console.log("(Kein --write: es wurde nichts geschrieben.)");
}
