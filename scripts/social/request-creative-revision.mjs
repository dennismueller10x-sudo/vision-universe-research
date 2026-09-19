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
const Contract = require(join(ROOT, "social/engines/creative-contract.js"));
const Authoring = require(join(ROOT, "social/engines/authoring.js"));
const AssetStore = require(join(ROOT, "social/engines/asset-store.js"));

export const REGISTER = "social/data/creative-jobs.json";

/**
 * Die Anweisung fuer die Ueberarbeitung.
 *
 * Sie entsteht aus dem gemessenen Bogen und der Rubrik — nicht aus
 * einer Meinung darueber, was ein guter Hook ist. Jede Forderung ist
 * pruefbar, und dieselbe Pruefung entscheidet hinterher.
 */
/* Die Schwelle des Kompositions-Tors. GELESEN, nicht abgeschrieben:
   die Anweisung an den Agenten und die Pruefung danach muessen
   dieselbe Zahl meinen, sonst faellt der Unterschied erst auf, wenn
   ein Lauf daran scheitert - und der kostet eine Work-Ausfuehrung. */
export const MAX_UEBERSCHNEIDUNG = Authoring.MAX_UEBERSCHNEIDUNG;

/**
 * WORAN ES LAG - gemessen, nicht erinnert.
 *
 * Der erste Entwurf dieser Datei trug die Diagnose als festen Satz:
 * "die Hooks stellten eine belegte Zahl voran, ohne ihr etwas
 * entgegenzusetzen". Fuer Anlauf 1 stimmte das. Fuer den naechsten
 * nicht mehr - dort bestanden die Hooks 5 von 6, und der Befund lag
 * ganz auf der Caption. Dieselbe Anweisung noch einmal zu schicken
 * hiesse, eine Nacharbeit an etwas zu verlangen, das bereits
 * funktioniert, und die eigentliche Schwaeche zu verschweigen.
 *
 * Also wird die Diagnose aus der Rubrik gelesen, die hinterher auch
 * entscheidet. Mitgeschickt wird beides: was scheiterte UND was
 * traegt. Ohne den zweiten Teil ist die naechste Fassung eine
 * Neuschreibung, und eine Neuschreibung verliert, was schon stimmte.
 */
export function befundBlock(assessed) {
  if (!Array.isArray(assessed) || !assessed.length) return null;
  const n = assessed.length;
  const zaehlung = new Map();

  assessed.forEach((b) => {
    (b.assessment.criteria || []).forEach((k) => {
      const e = zaehlung.get(k.id) ||
        { id: k.id, surface: k.surface, gescheitert: 0, geprueft: 0, befund: null };
      /* `passed === null` heisst NICHT GEPRUEFT und zaehlt weder als
         bestanden noch als gescheitert. */
      if (k.passed === true || k.passed === false) e.geprueft += 1;
      if (k.passed === false) { e.gescheitert += 1; e.befund = e.befund || k.finding; }
      zaehlung.set(k.id, e);
    });
  });

  const alle = [...zaehlung.values()].filter((e) => e.geprueft > 0);
  const offen = alle.filter((e) => e.gescheitert > 0);
  const traegt = alle.filter((e) => e.gescheitert === 0);
  if (!offen.length) return null;

  const wieViele = (e) => e.gescheitert === n
    ? "in allen " + n + " Varianten"
    : "in " + e.gescheitert + " von " + n + " Varianten";

  return [
    "WORAN ES GEMESSEN LAG. Die folgenden Befunde stammen aus derselben " +
    "Rubrik, die die naechste Fassung wieder prueft - sie sind keine " +
    "Geschmacksfrage:",
    ...offen.map((e) => "  - " + e.id + " (" + e.surface + ", " +
      wieViele(e) + "): " + e.befund),
    "",
    "WAS TRAEGT UND NICHT ANZUFASSEN IST: " +
    (traegt.length ? traegt.map((e) => e.id).join(", ") : "nichts davon") +
    ". Eine Neuschreibung verliert, was bereits stimmte."
  ].join("\n");
}

/**
 * Das zu erbende Bild - gleich, ob die Quelle es selbst erzeugt oder
 * ihrerseits geerbt hat.
 *
 * Eine Revision einer Revision hat keine `visual_variants`: ihr
 * Ergebnis traegt `inherited_visual`. Wer nur die erste Form kennt,
 * haelt eine gueltige Kette faelschlich fuer "kein Bild vorhanden".
 *
 * Verlaengert wird dabei die KETTE, nie die Quelle: zurueckgegeben
 * wird immer der Ursprung des Assets. Zeigte rev3 auf rev2 und rev4
 * auf rev3, koennte am Ende niemand mehr das eine verifizierte Asset
 * benennen - und die Identitaet waere eine Behauptung ueber eine
 * Behauptung.
 */
export function erbeAus(ergebnis, contentId) {
  const e = ergebnis || {};
  const eigen = (e.visual_variants || [])[0];
  if (eigen && eigen.asset_path) {
    return {
      geerbt: false, originContentId: contentId, candidateId: null,
      visual_variant_id: eigen.visual_variant_id,
      asset_path: eigen.asset_path, asset_sha256: eigen.asset_sha256,
      asset_byte_size: eigen.asset_byte_size, mime_type: eigen.mime_type,
      width: eigen.width, height: eigen.height,
      visual_strategy: eigen.visual_strategy, brief_revision: eigen.brief_revision
    };
  }
  const g = e.inherited_visual;
  if (!g || !g.source_asset_path || !g.source_asset_sha256) return null;
  return {
    geerbt: true,
    originContentId: g.source_content_id || contentId,
    candidateId: g.source_candidate_id || null,
    visual_variant_id: g.source_visual_variant_id,
    asset_path: g.source_asset_path, asset_sha256: g.source_asset_sha256,
    asset_byte_size: g.source_byte_size, mime_type: g.source_mime_type,
    width: g.source_width, height: g.source_height,
    visual_strategy: g.source_visual_strategy, brief_revision: g.source_brief_revision
  };
}

export function anweisung(story, dichteGrenze, assessed) {
  const t = story.tension;
  const staerke = t.strength.value + " von " + t.strength.max;
  const bremse = t.drag.value + " von " + t.drag.max;
  const leit = story.lead.value;

  const gemessen = befundBlock(assessed);

  return [
    "UEBERARBEITUNG. Der vorherige Text war faktisch richtig, " +
    "evidenzgebunden und redaktionell zu schwach.",
    "",
    /* Leere Zeilen filtert der Abschluss unten ohnehin weg; faellt der
       Block aus, faellt er also spurlos aus. */
    gemessen || "",
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
    "Die Caption WIEDERHOLT den Hook nicht, sie FUEHRT IHN FORT. Das ist " +
    "messbar und wird gemessen: hoechstens " + Math.round(MAX_UEBERSCHNEIDUNG * 100) +
    " Prozent der Inhaltswoerter des Hooks duerfen in der Caption " +
    "wiederkehren. Zahlen und Belegwoerter zaehlen dabei NICHT mit - " +
    "dieselbe Zahl darf in beiden stehen.",
    "",
    "Praktisch heisst das: der Hook stellt die Spannung auf, die Caption " +
    "beginnt bei ihrer AUFLOESUNG. Ein erster Caption-Satz, der den Hook " +
    "mit anderen Worten nacherzaehlt, reisst diese Grenze zuverlaessig.",
    "",
    "Unveraendert: keine Prognose, keine Empfehlung, keine " +
    "Ursachenbehauptung. Der Pflichthinweis \"Keine Anlageberatung.\" " +
    "steht am Ende der Caption.",
    "",
    "AUFTRAGSART: TEXT_REVISION. Das Visual wird GEERBT - seine " +
    "vollstaendige Identitaet steht im Feld `visual` (Quelle, Variante, " +
    "Pfad, SHA-256, Format, Masse). regeneration_allowed ist false.",
    "",
    "Erzeuge KEIN Bild und liefere KEINE visual_variants. Das ist hier " +
    "kein Mangel, sondern die Erfuellung: ein neues Bild wuerde eine " +
    "begrenzte Ressource kosten UND die Wirkung des neuen Textes " +
    "unmessbar machen, weil sich zwei Dinge zugleich aenderten.",
    "",
    "Setze im Ergebnis visual_resolution = INHERITED und wiederhole " +
    "unter inherited_visual die visual_variant_id und den asset_sha256 " +
    "aus dem Auftrag - unveraendert."
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

  /* ----------------------------------------------- Der gemessene Befund

     Nicht "was wir noch verbessern koennten", sondern was DIE RUBRIK an
     der vorliegenden Fassung gefunden hat - dieselbe Rubrik, die die
     naechste Fassung wieder prueft. Liegt kein Ergebnis vor, faellt der
     Block weg; eine erfundene Diagnose waere schlimmer als keine.
     ------------------------------------------------------------------- */
  const quellErgebnisPfad = join(quelleVerzeichnis, "authoring-result.json");
  let vorbefund = null;
  if (existsSync(quellErgebnisPfad)) {
    const vorheriges = JSON.parse(readFileSync(quellErgebnisPfad, "utf8"));
    const varianten = (vorheriges.hook_variants || []).map((h) => ({
      hook: h.hook_text || h.text,
      evidenceRefs: h.evidence_refs || [],
      id: h.hook_variant_id
    }));
    if (varianten.length && vorheriges.caption) {
      vorbefund = Creative.best(varianten, { caption: vorheriges.caption, story }).assessed;
    }
  }
  const gemessen = befundBlock(vorbefund);
  console.log("\n--- WORAN ES GEMESSEN LAG ---");
  console.log(gemessen || "Kein vorheriges Ergebnis zu dieser Kennung - " +
    "die Anweisung traegt keine Diagnose.");

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

  /* -------------------------------------------------------------------
     DIE AUFTRAGSART STEHT IM BRIEF

     Sie fehlte, und deshalb wurde PR 110 nach der einzigen Art
     beurteilt, die der Empfaenger kannte: Text UND neues Bild. Der
     Request war vertragswidrig, und weil niemand das aussprechen
     konnte, sah es zwoelf Stunden lang wie ein Zustellungsfehler aus.
     ------------------------------------------------------------------- */
  neu.request_type = Contract.TEXT_REVISION;

  /* -------------------------------------------------------------------
     DIE VERERBUNG WIRD GEPRUEFT, BEVOR SIE BEHAUPTET WIRD

     "Bereits verifiziert" ist eine Aussage ueber die Vergangenheit. Ob
     das Asset HEUTE noch unversehrt im Repository liegt, ist eine
     andere Frage - und sie wird hier beantwortet, nicht beim Agenten.
     Ein Auftrag, der ein beschaedigtes Bild zu erben verspricht, waere
     der teuerste Weg, das erst am Owner-Gate zu merken.
     ------------------------------------------------------------------- */
  const altErgebnisPfad = join(quelleVerzeichnis, "authoring-result.json");
  if (!existsSync(altErgebnisPfad)) {
    console.error("Kein Quell-Ergebnis unter " + altErgebnisPfad +
      ". Ohne verifiziertes Asset gibt es nichts zu erben.");
    process.exit(3);
  }
  const altErgebnis = JSON.parse(readFileSync(altErgebnisPfad, "utf8"));
  const bild = erbeAus(altErgebnis, CID);
  if (!bild) {
    console.error("Das Quell-Ergebnis traegt kein Visual - weder eine eigene " +
      "Bildvariante noch ein geerbtes. Eine TEXT_REVISION ohne Erbe waere " +
      "ein Auftrag ohne Bild, und genau das ist nicht zulaessig.");
    process.exit(3);
  }
  if (bild.geerbt) {
    console.log("\nDas Quell-Ergebnis ist selbst eine Revision. Geerbt wird " +
      "weiterhin das Asset aus " + bild.originContentId +
      " - die Kette verlaengert sich, die Quelle nicht.");
  }

  const gelesen = (() => {
    try { return readFileSync(join(ROOT, bild.asset_path)); }
    catch { return null; }
  })();
  const erbePruefung = AssetStore.ingest(gelesen, bild, { freshReadback: true,
    contentId: CID, visualVariantId: bild.visual_variant_id });
  if (!erbePruefung.ok) {
    console.error("Das zu erbende Asset haelt der Pruefung nicht stand: " +
      erbePruefung.explanation +
      "\nKein Request. Ein Auftrag auf ein beschaedigtes Erbe waere der " +
      "teuerste Weg, das erst am Owner-Gate zu merken.");
    process.exit(3);
  }

  neu.visual = Contract.inheritanceFrom({
    /* Die Quelle ist der URSPRUNG des Bildes, nicht die Fassung, ueber
       die wir es gerade gefunden haben. Sonst zeigte rev3 auf rev2 und
       rev4 auf rev3 - eine Kette von Behauptungen, an deren Ende
       niemand mehr das eine verifizierte Asset benennen kann. */
    contentId: bild.originContentId,
    candidateId: bild.candidateId ||
      arg("source-candidate", "cand_20260918_ca4ea408"),
    visualVariantId: bild.visual_variant_id,
    assetReference: bild.asset_path,
    sha256: bild.asset_sha256,
    byteSize: bild.asset_byte_size,
    mime: bild.mime_type,
    width: bild.width, height: bild.height,
    verification: "VU_VERIFIED_COMPLETED"
  });
  /* Fuer den Autor, der die Bildstrategie wiederfinden muss. */
  neu.visual.source_visual_strategy = bild.visual_strategy || "GENERATIVE";
  neu.visual.source_brief_revision = bild.brief_revision || null;

  neu.hook_strategy.instruction = anweisung(story, Creative.DICHTE.zuDicht, vorbefund);

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

  /* Der eigene Auftrag wird gegen den eigenen Vertrag geprueft, bevor
     er die Welt erreicht. Wer das erst den Empfaenger tun laesst,
     erfaehrt vom Verstoss durch Schweigen. */
  const vertrag = Contract.validateRequest(neu);
  if (!vertrag.ok) {
    console.error("Eigener Auftrag vertragswidrig: " + vertrag.explanation);
    process.exit(5);
  }

  const inhalt = JSON.stringify(neu, null, 2) + "\n";
  const sha = ChatGptWork.blobSha(inhalt);
  const key = ChatGptWork.processingKey(neu.brief_id, REV, sha, "1.0");

  console.log("\n--- REVISION ---");
  console.log("Revision von:    " + CID);
  console.log("Neue Kennung:    " + REV);
  console.log("Anlauf:          " + anlauf + " (ersetzt " + neu.supersedes_attempt + ")");
  console.log("Auftragsart:     " + neu.request_type);
  console.log("Bild:            geerbt, " + neu.visual.source_visual_variant_id);
  console.log("                 " + neu.visual.source_asset_sha256.slice(0, 16) +
    "... geprueft, " + neu.visual.source_width + "x" + neu.visual.source_height);
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
