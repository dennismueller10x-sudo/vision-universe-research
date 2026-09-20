/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/decide-candidate.mjs

   APPROVE ODER REJECT

   Der Owner entscheidet ueber einen Beitrag, nicht ueber eine Pipeline.
   Dieses Skript haelt seine Entscheidung fest und macht aus einem
   freigegebenen Kandidaten eine sendefaehige Anfrage.

   -------------------------------------------------------------------------
   REJECT IST KEIN MISSERFOLG
   -------------------------------------------------------------------------

   Das ist die wichtigste Unterscheidung in dieser Datei.

   Ein abgelehnter Beitrag wurde nie veroeffentlicht. Er hat keine
   Reichweite, keine Interaktionsrate und keine Zielerreichung — nicht
   eine schlechte, sondern gar keine. Ihn als Leistung mit dem Wert 0 zu
   verbuchen waere die Aussage "dieses Format hat versagt", und sie waere
   frei erfunden: gemessen wurde nichts.

   Der Ablehnungsgrund ist trotzdem wertvoll, nur eben als etwas anderes:
   als Rueckmeldung ueber die AUSWAHL, nicht ueber die WIRKUNG. Er landet
   in einer eigenen Datei, wird nie in `performance` geschrieben und geht
   nie in einen Median ein.

   -------------------------------------------------------------------------
   DER ABDRUCK WIRD HIER NACHGERECHNET
   -------------------------------------------------------------------------

   Zwischen dem Erzeugen des Kandidaten und der Entscheidung liegt Zeit,
   und in dieser Zeit ist die Datei eine Datei — jemand kann sie
   bearbeiten. Freigegeben wird deshalb der nachgerechnete Abdruck und
   nicht der, der in der Datei steht.

   -------------------------------------------------------------------------
   VIER ENTSCHEIDUNGEN, NICHT ZWEI
   -------------------------------------------------------------------------

   APPROVE, REJECT — und zweimal "noch nicht", aus zwei verschiedenen
   Gruenden:

     --hold     die EVIDENZ reicht nicht.     HELD_FOR_ENRICHMENT
     --refine   die Evidenz reicht, die
                AUSWAHL daraus noch nicht.    HELD_FOR_CREATIVE_REFINEMENT

   Die beiden zu verwechseln waere keine Formsache: sie schicken
   verschiedene Stufen zurueck an die Arbeit. `--hold` sagt der
   Recherche, sie moege mehr liefern; `--refine` sagt der Redaktion,
   sie moege aus dem Vorhandenen etwas anderes machen. Wer beim
   zweiten Fall "zu wenig Belege" protokolliert, laesst die falsche
   Stufe suchen — und behauptet ausserdem etwas Unwahres ueber die
   Recherche.

   Ausfuehren:
     node scripts/social/decide-candidate.mjs --candidate cand_... --approve --by owner
     node scripts/social/decide-candidate.mjs --candidate cand_... --reject --reason "..."
     node scripts/social/decide-candidate.mjs --candidate cand_... --hold --reason "..."
     node scripts/social/decide-candidate.mjs --candidate cand_... --refine --reason "..." \
       [--assessment pfad/zur/bewertung.json]
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ausgabePfad } from "../quality/out-path.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ContentHash = require(join(ROOT, "social/engines/content-hash.js"));
const OwnerDecision = require(join(ROOT, "social/engines/owner-decision.js"));

/* -------------------------------------------------------------------
   WOHIN DIE RUECKMELDUNG GEHOERT

   Hier stand ein fester Pfad. `--dir` verschob die Kandidaten, die
   Rueckmeldung landete trotzdem immer in derselben echten Datei — und
   ein Test mit dem Kandidaten "cand_hold", Thema "Thema", Hook "Ein
   Hook." stand danach in social/data/approval-feedback.json.

   Das ist der DRITTE Fund derselben Fehlerart in diesem Abschnitt:
   erst der Kandidatenordner, dann die Quant-Universumsdateien, jetzt
   die Rueckmeldungen. Ein Skript, das seinen Eingabestand aus einem
   Parameter nimmt und seinen Ausgabestand aus einer Konstante, schreibt
   frueher oder spaeter Testdaten in den Produktionsbestand.

   Die Rueckmeldung folgt jetzt dem Kandidatenordner: sie gehoert zu
   denselben Kandidaten und hat im selben Datenstand zu liegen.
   ------------------------------------------------------------------- */
export const FEEDBACK_DATEI = "social/data/approval-feedback.json";

/**
 * Die Rueckmeldedatei zum Datenstand, in dem die Kandidaten liegen.
 *
 * `--dir` wird an zwei Stellen verschieden gemeint: produktiv zeigt es
 * auf social/data/publish-candidates, im Test auf den Datenstand
 * selbst. Statt eine der beiden Lesarten zu erraten, wird sie am Namen
 * erkannt — und das ist keine Spitzfindigkeit: die erste Fassung hat
 * blind dirname() genommen und die Rueckmeldung eine Ebene zu hoch
 * abgelegt, wo sie niemand gesucht haette.
 */
export function feedbackDatei(kandidatenDir) {
  const d = String(kandidatenDir || "social/data/publish-candidates");
  const wurzel = basename(d) === "publish-candidates" ? dirname(d) : d;
  return join(wurzel, "approval-feedback.json");
}

/**
 * Die Rueckmeldung zu einer Ablehnung.
 *
 * Sie traegt die vollstaendige Herkunft des abgelehnten Kandidaten —
 * Signal, Gelegenheit, Archetyp, Hook, Visual, Zeitpunkt. Nur so laesst
 * sich spaeter fragen: lehnt der Owner bestimmte Archetypen ab? Bestimmte
 * Hooks? Immer dieselbe Uhrzeit?
 *
 * Das ist eine Frage ueber die AUSWAHL des Systems und hat mit der
 * Wirkung eines Beitrags nichts zu tun. Deshalb steht hier `performance`
 * nirgends, und zwar ausdruecklich nicht als null, sondern gar nicht:
 * ein Feld, das es nicht gibt, kann auch nicht versehentlich gefuellt
 * werden.
 */
export function feedbackEintrag(kandidat, entscheidung, meta) {
  return {
    candidateId: kandidat.candidateId,
    decision: entscheidung,
    reason: (meta && meta.reason) || null,
    decidedBy: (meta && meta.by) || null,
    decidedAt: (meta && meta.now) || new Date().toISOString(),
    /* Die Herkunft, damit die Ablehnung auswertbar ist. */
    topic: kandidat.presentation ? kandidat.presentation.topic : null,
    archetype: kandidat.provenance ? kandidat.provenance.archetype : null,
    hook: kandidat.provenance ? kandidat.provenance.hook : null,
    visualType: kandidat.provenance ? kandidat.provenance.visualType : null,
    mediaFormat: kandidat.provenance ? kandidat.provenance.mediaFormat : null,
    plannedHourUtc: kandidat.provenance ? kandidat.provenance.plannedHourUtc : null,
    strategyVersion: kandidat.provenance ? kandidat.provenance.strategyVersion : null,
    signalIds: (kandidat.provenance && kandidat.provenance.signalIds) || [],
    opportunityId: kandidat.provenance ? kandidat.provenance.opportunityId : null,
    /* Ausdruecklich: das hier ist KEINE Leistungsaussage. Der Satz steht
       in den Daten und nicht nur im Code, weil die Datei auch jemand
       liest, der den Code nicht liest. */
    note: "Rueckmeldung zur AUSWAHL, nicht zur WIRKUNG. Dieser Beitrag wurde nie " +
      "veroeffentlicht und hat deshalb keine Leistung — weder eine schlechte noch " +
      "eine gute. Er darf in keinen Leistungsvergleich eingehen."
  };
}

/** Die Anfrage, die nach der Freigabe hinausgeht. */
export function anfrageAusKandidat(kandidat) {
  return {
    method: "POST",
    path: "/social/meta/publish",
    body: {
      contentId: kandidat.content.contentId,
      imageUrl: kandidat.content.imageUrl,
      caption: kandidat.content.caption,
      approval: {
        candidateId: kandidat.candidateId,
        approvedBy: kandidat.approval.approvedBy,
        approvedAt: kandidat.approval.approvedAt,
        contentHash: kandidat.approval.contentHash
      }
    }
  };
}

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const flag = (n) => args.includes("--" + n);

  const ID = arg("candidate", null);
  const DIR = arg("dir", "social/data/publish-candidates");
  const NOW = arg("now", new Date().toISOString());
  const BY = arg("by", "owner");
  const REASON = arg("reason", null);
  /* Folgt dem Kandidatenordner — siehe oben. */
  const FEEDBACK_REL = feedbackDatei(DIR);
  const APPROVE = flag("approve");
  const REJECT = flag("reject");
  /* -------------------------------------------------------------------
     DIE DRITTE ENTSCHEIDUNG

     APPROVE und REJECT waren lange die einzigen. "Nicht
     veroeffentlichen, weil die Evidenz nicht reicht" ist aber weder das
     eine noch das andere: keine Freigabe, und keine Ablehnung des
     Beitrags.

     Ohne eigenen Zustand blieb diese Entscheidung nirgends stehen — und
     was nirgends steht, ueberschreibt der naechste Lauf, ohne es zu
     merken. Genau das ist mit cand_20260917_0363e680 passiert.
     ------------------------------------------------------------------- */
  const HOLD = flag("hold");

  /* -------------------------------------------------------------------
     DIE VIERTE ENTSCHEIDUNG

     Derselbe Befund ein zweites Mal: cand_20260918_ca4ea408 war
     technisch einwandfrei, evidenzgebunden, faktengeprueft — und
     redaktionell noch nicht gut genug. Weder Freigabe noch Ablehnung
     noch "zu wenig Belege": die Belege reichten, die Auswahl daraus
     nicht.
     ------------------------------------------------------------------- */
  const REFINE = flag("refine");
  /* -------------------------------------------------------------------
     DER VIERTE WEG LIEGT EINE EBENE HOEHER

     --refine sagt: schreib es besser. --audience-fit sagt: waehle etwas
     anderes aus. Die beiden zu verwechseln kostet Revisionen, die nichts
     aendern koennen, weil die Nacharbeit an der falschen Stufe ansetzt.
     ------------------------------------------------------------------- */
  const AUDIENCE = flag("audience-fit");
  const ASSESSMENT = arg("assessment", null);

  if (!ID) { console.error("Kein --candidate."); process.exit(2); }

  const gewaehlt = [APPROVE, REJECT, HOLD, REFINE, AUDIENCE].filter(Boolean).length;
  if (gewaehlt !== 1) {
    console.error("Genau eines von --approve, --reject, --hold, --refine " +
      "oder --audience-fit. " +
      "Mehreres oder nichts ist keine Entscheidung.");
    process.exit(2);
  }

  /* -------------------------------------------------------------------
     ABSOLUTE PFADE GELTEN, WIE SIE DASTEHEN

     `join(ROOT, "/tmp/probe")` ist "<ROOT>/tmp/probe". Ein Skript, das
     seinen Ordner aus einem Parameter nimmt und ihn dann unter das
     Repository schiebt, liest woanders als gesagt - und meldet, die
     Datei fehle, die es gibt.

     Das ist der zwoelfte Fund derselben Art in diesem Projekt. Zehn
     Skripte waren bereits umgestellt; dieses stand nicht auf der Liste,
     weil es nie mit einem absoluten --dir aufgerufen worden war. Ein
     Fehler, den nur ein ungewoehnlicher Aufruf zeigt, ist trotzdem da -
     und der Aufruf kam, als der Rueckweg aus dem Approval Center ihn
     brauchte.
     ------------------------------------------------------------------- */
  const pfad = join(ausgabePfad(ROOT, DIR), ID + ".json");
  if (!existsSync(pfad)) { console.error("Kandidat nicht gefunden: " + pfad); process.exit(2); }
  const kandidat = JSON.parse(readFileSync(pfad, "utf8"));

  console.log("VISION UNIVERSE SOCIAL — Entscheidung ueber " + ID);
  console.log("Zustand:   " + kandidat.state);

  /* ------------------------------------------------------- REFINE */
  if (AUDIENCE) {
    if (!REASON) {
      console.error("\n--audience-fit braucht --reason. Ein Haltegrund ohne " +
        "Begruendung ist fuer die naechste Auswahl wertlos.");
      process.exit(2);
    }
    const erlaubtA = OwnerDecision.mayTransition(kandidat.state,
      "HELD_FOR_AUDIENCE_FIT", { actor: "owner" });
    if (!erlaubtA.ok) { console.error("\n" + erlaubtA.explanation); process.exit(3); }

    kandidat.state = "HELD_FOR_AUDIENCE_FIT";
    kandidat.hold = Object.assign({ reason: REASON, decidedBy: BY, decidedAt: NOW },
      OwnerDecision.haltegrund("HELD_FOR_AUDIENCE_FIT"),
      {
        /* Woertlich, weil jede dieser Verwechslungen etwas anderes
           nacharbeiten liesse - und drei davon das Falsche. */
        performanceJudgement: false,
        topicRejected: false,
        factFailure: false,
        providerFailure: false,
        note: "Zurueckgehalten, weil das Content-Konzept Vorwissen " +
          "voraussetzt. Belege und Umsetzung tragen. Die Nacharbeit gehoert " +
          "in die Auswahl der Social Opportunity, nicht in den Text: eine " +
          "weitere Textrevision koennte den Befund gar nicht beheben. Der " +
          "Beitrag ist nie erschienen - ueber seine Wirkung ist damit nichts " +
          "bekannt und nichts zu lernen."
      });
    writeFileSync(pfad, JSON.stringify(kandidat, null, 2) + "\n");

    const fba = ausgabePfad(ROOT, FEEDBACK_REL);
    const bestandA = existsSync(fba) ? JSON.parse(readFileSync(fba, "utf8")) : { entries: [] };
    bestandA.entries = (bestandA.entries || []).concat([
      feedbackEintrag(kandidat, "AUDIENCE_FIT", { reason: REASON, by: BY, now: NOW })]);
    bestandA.generatedAt = NOW;
    mkdirSync(dirname(fba), { recursive: true });
    writeFileSync(fba, JSON.stringify(bestandA, null, 2) + "\n");

    console.log("\nZURUECKGEHALTEN WEGEN AUDIENCE FIT.");
    console.log("Belege und Umsetzung tragen. Das Content-Konzept setzt Vorwissen");
    console.log("voraus, das ein breites Publikum nicht hat.");
    console.log("\nNachzuarbeiten ist die AUSWAHL der Social Opportunity, nicht der");
    console.log("Text: eine weitere Textrevision koennte den Befund nicht beheben.");
    console.log("\nDer Beitrag ist nie erschienen. Ueber seine Wirkung ist damit");
    console.log("nichts bekannt - und nichts zu lernen.");
    process.exit(0);
  }

  if (REFINE) {
    if (!REASON) {
      console.error("\n--refine ohne --reason. Eine redaktionelle Rueckgabe ohne " +
        "Richtung ist keine Rueckmeldung, sondern nur ein Nein.");
      process.exit(2);
    }

    const erlaubtR = OwnerDecision.mayTransition(kandidat.state,
      "HELD_FOR_CREATIVE_REFINEMENT", { actor: "owner" });
    if (!erlaubtR.ok) { console.error("\n" + erlaubtR.explanation); process.exit(3); }

    /* Strukturiertes Feedback, nicht nur ein Satz. Die maschinelle
       Bewertung kommt aus creative-quality.js und ist damit
       nachvollziehbar und wiederholbar; der Owner-Satz steht
       daneben, nicht darin. */
    let bewertung = null;
    if (ASSESSMENT) {
      const ap = join(ROOT, ASSESSMENT);
      if (!existsSync(ap)) {
        console.error("\n--assessment zeigt auf nichts: " + ap);
        process.exit(2);
      }
      bewertung = JSON.parse(readFileSync(ap, "utf8"));
    }

    kandidat.state = "HELD_FOR_CREATIVE_REFINEMENT";
    kandidat.hold = {
      reason: REASON, decidedBy: BY, decidedAt: NOW,
      stage: "CREATIVE",
      /* Woertlich, weil die Verwechslung teuer waere. */
      evidenceFailure: false,
      creativeFailure: true,
      performanceJudgement: false,
      topicRejected: false,
      note: "Zurueckgehalten zur redaktionellen Ueberarbeitung. Die Evidenz " +
        "reicht und ist gebunden; die Auswahl daraus traegt noch keine " +
        "Geschichte. Dies ist KEINE Aussage ueber die zu erwartende " +
        "Leistung, kein Evidence Failure und keine Ablehnung des Themas.",
      assessment: bewertung
    };
    writeFileSync(pfad, JSON.stringify(kandidat, null, 2) + "\n");

    const fbr = ausgabePfad(ROOT, FEEDBACK_REL);
    const bestandR = existsSync(fbr) ? JSON.parse(readFileSync(fbr, "utf8")) : { entries: [] };
    bestandR.entries = (bestandR.entries || []).concat([
      feedbackEintrag(kandidat, "REFINE", { reason: REASON, by: BY, now: NOW })]);
    bestandR.generatedAt = NOW;
    mkdirSync(dirname(fbr), { recursive: true });
    writeFileSync(fbr, JSON.stringify(bestandR, null, 2) + "\n");

    console.log("\nZURUECKGEHALTEN ZUR REDAKTIONELLEN UEBERARBEITUNG.");
    console.log("Die Evidenz reicht und bleibt gebunden. Nachzuarbeiten ist die");
    console.log("Auswahl daraus - nicht die Recherche, nicht das Thema.");
    console.log("\nDies ist keine Aussage ueber die erwartete Leistung. Der Beitrag");
    console.log("geht in keinen Leistungsvergleich ein.");
    console.log("\nKein Lauf, keine Recovery und kein Test aendert diesen Zustand.");
    console.log("\nGeschrieben: " + FEEDBACK_REL);
    process.exit(0);
  }

  /* --------------------------------------------------------- HOLD */
  if (HOLD) {
    if (!REASON) {
      console.error("\n--hold ohne --reason. Ein Zurueckhalten ohne Grund ist als " +
        "Rueckmeldung wertlos — und der Grund sagt, was fehlt, damit es weitergeht.");
      process.exit(2);
    }

    /* Der Owner darf jeden Zustand setzen; das IST das Owner-Gate.
       Geprueft wird trotzdem, damit ein Tippfehler im Zielzustand
       auffaellt. */
    const erlaubt = OwnerDecision.mayTransition(kandidat.state, "HELD_FOR_ENRICHMENT",
      { actor: "owner" });
    if (!erlaubt.ok) { console.error("\n" + erlaubt.explanation); process.exit(3); }

    kandidat.state = "HELD_FOR_ENRICHMENT";
    kandidat.hold = { reason: REASON, decidedBy: BY, decidedAt: NOW,
      note: "Zurueckgehalten, nicht abgelehnt. Dies ist KEINE Aussage ueber die " +
        "zu erwartende Leistung des Beitrags." };
    writeFileSync(pfad, JSON.stringify(kandidat, null, 2) + "\n");

    const fbh = ausgabePfad(ROOT, FEEDBACK_REL);
    const bestandH = existsSync(fbh) ? JSON.parse(readFileSync(fbh, "utf8")) : { entries: [] };
    bestandH.entries = (bestandH.entries || []).concat([
      feedbackEintrag(kandidat, "HOLD", { reason: REASON, by: BY, now: NOW })]);
    bestandH.generatedAt = NOW;
    mkdirSync(dirname(fbh), { recursive: true });
    writeFileSync(fbh, JSON.stringify(bestandH, null, 2) + "\n");

    console.log("\nZURUECKGEHALTEN. Grund festgehalten.");
    console.log("Das ist keine Ablehnung des Beitrags und keine Aussage ueber seine");
    console.log("erwartete Leistung. Er geht in keinen Leistungsvergleich ein.");
    console.log("\nKein Lauf, keine Recovery und kein Test aendert diesen Zustand.");
    console.log("Nur eine neue Entscheidung tut das.");
    console.log("\nGeschrieben: " + FEEDBACK_REL);
    process.exit(0);
  }

  if (kandidat.state !== "AWAITING_APPROVAL") {
    console.error("\nDieser Kandidat wartet nicht auf eine Entscheidung (Zustand " +
      kandidat.state + "). Eine zweite Entscheidung ueber denselben Beitrag waere " +
      "entweder wirkungslos oder gefaehrlich; sie wird abgelehnt.");
    process.exit(3);
  }

  /* --------------------------------------------------------- REJECT */
  if (REJECT) {
    if (!REASON) {
      console.error("\n--reject ohne --reason. Eine Ablehnung ohne Grund ist als " +
        "Rueckmeldung wertlos — und sie ist der einzige Ertrag einer Ablehnung.");
      process.exit(2);
    }

    kandidat.state = "REJECTED";
    kandidat.rejection = { reason: REASON, decidedBy: BY, decidedAt: NOW };
    writeFileSync(pfad, JSON.stringify(kandidat, null, 2) + "\n");

    const fb = ausgabePfad(ROOT, FEEDBACK_REL);
    const bestand = existsSync(fb) ? JSON.parse(readFileSync(fb, "utf8")) : { entries: [] };
    bestand.entries = (bestand.entries || []).concat([
      feedbackEintrag(kandidat, "REJECT", { reason: REASON, by: BY, now: NOW })]);
    bestand.generatedAt = NOW;
    mkdirSync(dirname(fb), { recursive: true });
    writeFileSync(fb, JSON.stringify(bestand, null, 2) + "\n");

    console.log("\nABGELEHNT. Grund festgehalten.");
    console.log("Dieser Beitrag wurde nie veroeffentlicht und hat deshalb KEINE Leistung —");
    console.log("weder eine schlechte noch eine gute. Er geht in keinen Leistungsvergleich ein.");
    console.log("\nGeschrieben: " + FEEDBACK_REL);
    process.exit(0);
  }

  /* -------------------------------------------------------- APPROVE */
  /* Nachgerechnet, nicht uebernommen. Zwischen dem Erzeugen und der
     Entscheidung ist die Datei eine Datei — jemand kann sie bearbeiten. */
  const nachgerechnet = ContentHash.contentHash(kandidat.content);

  if (nachgerechnet !== kandidat.contentHash) {
    console.error("\nDer Kandidat hat sich seit seiner Erzeugung geaendert.");
    console.error("  eingetragen:    " + kandidat.contentHash);
    console.error("  nachgerechnet:  " + nachgerechnet);
    console.error("\nEs wird nichts freigegeben. Ein Kandidat, dessen Inhalt nach der");
    console.error("Vorlage veraendert wurde, ist ein anderer Kandidat — und ueber den hat");
    console.error("niemand entschieden.");
    process.exit(4);
  }

  kandidat.state = "APPROVED";
  kandidat.approval = { approvedBy: BY, approvedAt: NOW, contentHash: nachgerechnet };
  kandidat.provenance.approval = { approvedBy: BY, approvedAt: NOW, contentHash: nachgerechnet };
  writeFileSync(pfad, JSON.stringify(kandidat, null, 2) + "\n");

  const anfrage = anfrageAusKandidat(kandidat);
  writeFileSync(join(ausgabePfad(ROOT, DIR), ID + ".request.json"), JSON.stringify(anfrage, null, 2) + "\n");

  console.log("\nFREIGEGEBEN von " + BY + " um " + NOW);
  console.log("Abdruck:  " + nachgerechnet);
  console.log("\nDie Anfrage steht in " + DIR + "/" + ID + ".request.json.");
  console.log("Der Worker rechnet den Abdruck ein zweites Mal nach und lehnt ab, wenn");
  console.log("sich bis dahin etwas geaendert hat.");
}
