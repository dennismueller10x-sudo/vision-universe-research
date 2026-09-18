/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/request-creative-revision.mjs

   EINE REDAKTIONELLE UEBERARBEITUNG, KEIN ZWEITER ANLAUF

   -------------------------------------------------------------------------
   DER UNTERSCHIED ZU request-creative.mjs
   -------------------------------------------------------------------------

   Dort entsteht eine Anfrage, weil ein Inhalt noch keinen Text hat.
   Hier hat er einen — er ist faktisch richtig, evidenzgebunden und
   redaktionell zu schwach. Der Owner hat ihn deshalb auf
   HELD_FOR_CREATIVE_REFINEMENT gesetzt.

   Drei Dinge folgen daraus:

     KEIN NEUES BILD     Das Asset aus Anlauf 3 ist mit allen neun
                         Pruefungen verifiziert. Es noch einmal
                         erzeugen zu lassen kostete eine begrenzte
                         Ressource, ergaebe ein ANDERES Bild und wuerfe
                         eine erbrachte Leistung weg.

     AUSGEWAEHLTE        Nicht alle 23 Belege, sondern die, die
     EVIDENZ             zusammen den Spannungsbogen tragen.
                         story-selection.js waehlt sie; der Rest bleibt
                         gebunden und wird vom Fact Check weiter
                         geprueft.

     EINE GEZIELTE       Der Brief sagt, WORAN es lag. Ein zweiter
     ANWEISUNG           Versuch mit derselben Anweisung waere die
                         Erwartung, dass dasselbe etwas anderes ergibt.

   Ausfuehren:
     node scripts/social/request-creative-revision.mjs --content-id vu-xom-20260911
     node scripts/social/request-creative-revision.mjs --content-id vu-xom-20260911 --write
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));
const Story = require(join(ROOT, "social/engines/story-selection.js"));
const Creative = require(join(ROOT, "social/engines/creative-quality.js"));
const Job = require(join(ROOT, "social/engines/creative-job.js"));

export const REGISTER = "social/data/creative-jobs.json";

/**
 * Die Anweisung fuer die Ueberarbeitung.
 *
 * Sie entsteht aus dem gemessenen Bogen und der Rubrik — nicht aus
 * einer Meinung darueber, was ein guter Hook ist. Jede Forderung ist
 * pruefbar, und dieselbe Pruefung entscheidet hinterher.
 */
export function anweisung(story, dichteGrenze) {
  const t = story.tension;
  const staerke = t.strength.value + " von " + t.strength.max;
  const bremse = t.drag.value + " von " + t.drag.max;
  const leit = story.lead.value;

  return [
    "UEBERARBEITUNG. Der vorherige Text war faktisch richtig und " +
    "redaktionell zu schwach: die Hooks stellten eine belegte Zahl voran, " +
    "ohne ihr etwas entgegenzusetzen, und die Caption uebernahm die " +
    "Struktur des Research-Reports.",
    "",
    "JEDER Hook muss ZWEI gemessene Werte GEGENEINANDER stellen: eine " +
    "Staerke und den Wert, der trotz dieser Staerke nicht hoeher " +
    "ausfaellt. Beide Zahlen stehen IM HOOK, verbunden durch ein Wort, " +
    "das einen Gegensatz stiftet (etwa: und trotzdem, dennoch, obwohl, " +
    "aber nur).",
    "",
    "Der Bogen steht in der Evidenz und ist nicht zu erfinden:",
    "  Leitwert " + leit + " von " + story.lead.statement.match(/von (\d+)/)?.[1],
    "  Staerke  " + (t.strength.component || t.strength.evidence.id) + ": " + staerke,
    "  Bremse   " + (t.drag.component || t.drag.evidence.id) + ": " + bremse,
    t.support ? "  In Lesersprache: " + t.support.statement : "",
    "",
    "Die daraus folgende Frage, belegt beantwortbar: " + t.question,
    "",
    "NICHT im oeffentlichen Text zulaessig sind unsere internen " +
    "Bezeichner. Die Sachverhalte duerfen vorkommen, die Bezeichner " +
    "nicht. Unzulaessig: " +
    Creative.INNENSPRACHE.map((m) => m.id).join(", ") + ". " +
    "\"Die Schwankungsbreite traegt nur die Haelfte bei\" sagt dasselbe " +
    "wie \"VOLATILITY 5 von 10 Punkten\" und verlangt vom Leser nicht, " +
    "unser Datenmodell zu lernen.",
    "",
    "Die Caption verwendet AUSSCHLIESSLICH die unten mitgelieferten " +
    "Belege. Hoechstens " + dichteGrenze + " Zahlen je 100 Woerter " +
    "(Datumsangaben und Skalen zaehlen nicht mit).",
    "",
    "Der erste Satz der Caption wiederholt NICHT die Zahlen des Hooks. " +
    "Zwei Flaechen, zwei Beitraege.",
    "",
    "Unveraendert: keine Prognose, keine Empfehlung, keine " +
    "Ursachenbehauptung. Der Pflichthinweis \"Keine Anlageberatung.\" " +
    "steht am Ende der Caption.",
    "",
    "KEIN NEUES BILD. Das bestehende, verifizierte Visual dieses " +
    "Content Objects wird weiterverwendet. Erzeuge kein Bild und " +
    "liefere keine visual_variants."
  ].filter((z) => z !== "").join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const CID = arg("content-id", "vu-xom-20260911");
  const WRITE = args.includes("--write");
  const NOW = arg("now", new Date().toISOString());

  /* -------------------------------------------------------------------
     DIE REVISION BEKOMMT EIN EIGENES VERZEICHNIS

     Der erste Entwurf schrieb den ueberarbeiteten Brief an dieselbe
     Stelle. Das haette den Brief von Anlauf 3 ersetzt - und mit ihm
     seinen Blob-SHA, seinen Processing Key und damit die Kennung, unter
     der der Zyklus das VERIFIZIERTE Ergebnis wiederfindet. Das Bild,
     das diese Revision ausdruecklich weiterverwenden soll, waere
     verwaist gewesen, und das XOM-Paket waere still auf den
     Vorlagen-Autor zurueckgefallen.

     Gefunden vor dem Schreiben, nicht danach. Die Revision ist ein
     eigenes Content Object mit eigener Kennung, das auf das alte
     zeigt - dieselbe Regel wie bei den Kandidaten: eine neue Fassung
     bekommt eine eigene Identitaet und ueberschreibt die alte nicht.
     ------------------------------------------------------------------- */
  const REV = arg("revision-id", CID + "-rev1");
  const quelleVerzeichnis = join(ROOT, ChatGptWork.requestDir(CID));
  const verzeichnis = join(ROOT, ChatGptWork.requestDir(REV));
  const altPfad = join(quelleVerzeichnis, "authoring-brief.json");
  const zielPfad = join(verzeichnis, "authoring-brief.json");
  if (!existsSync(altPfad)) {
    console.error("Kein bestehender Brief unter " + altPfad + ".");
    process.exit(2);
  }
  const alt = JSON.parse(readFileSync(altPfad, "utf8"));

  /* --------------------------------------------------- Story Selection */
  const story = Story.select(alt.evidence, {});
  if (!story.hasTension) {
    console.error("Kein gemessener Spannungsbogen: " + story.explanation +
      "\nEine Ueberarbeitung ohne Bogen waere dieselbe Anweisung wie vorher.");
    process.exit(3);
  }

  console.log("VISION UNIVERSE SOCIAL — Creative Revision");
  console.log("Inhalt: " + CID + "\n");
  console.log("--- STORY SELECTION ---");
  console.log(story.explanation);
  console.log("Frage: " + story.tension.question);
  console.log("Ausgewaehlt: " + story.selectedIds.join(", "));
  console.log("Gebunden, nicht in der Copy: " + story.unused.length + " Belege");

  /* ------------------------------------------------------- Der Brief */
  const anlauf = Number(alt.attempt || 1) + 1;
  const neu = JSON.parse(JSON.stringify(alt));

  neu.attempt = anlauf;
  neu.supersedes_attempt = alt.attempt || 1;
  neu.attempt_reason =
    "Redaktionelle Ueberarbeitung nach Owner-Entscheidung " +
    "HELD_FOR_CREATIVE_REFINEMENT. Die Evidenz reicht und bleibt " +
    "unveraendert; nachzuarbeiten ist die Auswahl daraus.";
  neu.revision = "text-only";
  neu.content_id = REV;
  neu.supersedes_content_id = CID;

  /* Das Bild, das weiterverwendet wird - mit seiner vollen Identitaet,
     damit die Herkunft nicht an einem Dateipfad haengt. */
  const altErgebnisPfad = join(quelleVerzeichnis, "authoring-result.json");
  if (existsSync(altErgebnisPfad)) {
    const altErgebnis = JSON.parse(readFileSync(altErgebnisPfad, "utf8"));
    const bild = (altErgebnis.visual_variants || [])[0];
    if (bild) {
      neu.reuse_visual = {
        from_content_id: CID,
        visual_variant_id: bild.visual_variant_id,
        asset_path: bild.asset_path,
        asset_sha256: bild.asset_sha256,
        asset_byte_size: bild.asset_byte_size,
        mime_type: bild.mime_type, width: bild.width, height: bild.height,
        verified: "alle neun Transportpruefungen bestanden"
      };
    }
  }

  neu.hook_strategy.instruction = anweisung(story, Creative.DICHTE.zuDicht);

  /* Die AUSGEWAEHLTEN Belege fuer die Copy — der Rest bleibt im
     Paket und wird vom Fact Check weiter geprueft. */
  neu.evidence = alt.evidence.filter((e) => story.selectedIds.includes(e.id));
  neu.evidence_for_copy_only = true;
  neu.full_evidence_retained = alt.evidence.length;

  /* Kein neues Bild. */
  neu.asset_requirements = {
    count: 0,
    reuse_existing_verified_asset: true,
    note: "Das Visual dieses Content Objects ist bereits verifiziert " +
      "(alle neun Transportpruefungen). Eine neue Erzeugung kostete eine " +
      "begrenzte Ressource, ergaebe ein anderes Bild und wuerfe eine " +
      "erbrachte Leistung weg."
  };
  neu.authoring_requirements.actual_image_asset_required = false;
  neu.visual_strategy = Object.assign({}, alt.visual_strategy, {
    instruction: "KEIN neues Bild erzeugen. Das bestehende verifizierte " +
      "Visual wird weiterverwendet." });

  const inhalt = JSON.stringify(neu, null, 2) + "\n";
  const sha = ChatGptWork.blobSha(inhalt);
  const key = ChatGptWork.processingKey(neu.brief_id, REV, sha, "1.0");

  console.log("\n--- REVISION ---");
  console.log("Revision von:    " + CID);
  console.log("Neue Kennung:    " + REV);
  console.log("Anlauf:          " + anlauf + " (ersetzt " + neu.supersedes_attempt + ")");
  console.log("Bild:            " + (neu.reuse_visual
    ? "wiederverwendet aus Anlauf 3 (" + neu.reuse_visual.asset_sha256.slice(0, 12) + "...)"
    : "KEINES GEFUNDEN"));
  console.log("Belege in Copy:  " + neu.evidence.length + " von " + alt.evidence.length);
  console.log("Bilderzeugung:   nein");
  console.log("brief_blob_sha:  " + sha);
  console.log("processing_key:  " + key);

  /* -------------------------------------------------------- Das Gatter */
  const regPfad = join(ROOT, REGISTER);
  const roh = existsSync(regPfad) ? JSON.parse(readFileSync(regPfad, "utf8")) : { jobs: [] };
  const registry = Job.createRegistry(roh.jobs || []);
  const spec = { contentId: REV, briefId: neu.brief_id, briefBlobSha: sha,
    processingKey: key, attempt: anlauf, revision: "text-only" };

  const darf = registry.mayDispatch(spec, { productionPath: true });
  console.log("\n--- GATTER ---");
  if (!darf.ok) {
    console.error("KEIN DISPATCH (" + darf.reason + "): " + darf.message);
    process.exit(4);
  }
  console.log("Frei. Kein logischer Job zu diesem Schluessel.");

  if (!WRITE) {
    console.log("\n(Kein --write: es wurde nichts geschrieben.)");
    process.exit(0);
  }

  mkdirSync(verzeichnis, { recursive: true });
  writeFileSync(zielPfad, inhalt);
  const job = registry.dispatch(spec, { now: NOW });
  writeFileSync(regPfad, JSON.stringify(
    Object.assign({}, roh, registry.snapshot({ now: NOW })), null, 2) + "\n");

  console.log("\nGeschrieben:  " + ChatGptWork.requestDir(REV) + "/authoring-brief.json");
  console.log("Anlauf 3 bleibt unberuehrt: " +
    ChatGptWork.requestDir(CID) + "/authoring-brief.json");
  console.log("Job angelegt: " + job.creativeJobId);
  console.log("\nErst JETZT duerfen Branch und Pull Request entstehen.");
}
