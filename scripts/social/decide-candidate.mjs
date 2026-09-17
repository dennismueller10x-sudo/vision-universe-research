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

   Ausfuehren:
     node scripts/social/decide-candidate.mjs --candidate cand_... --approve --by owner
     node scripts/social/decide-candidate.mjs --candidate cand_... --reject --reason "..."
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ContentHash = require(join(ROOT, "social/engines/content-hash.js"));
const OwnerDecision = require(join(ROOT, "social/engines/owner-decision.js"));

export const FEEDBACK_DATEI = "social/data/approval-feedback.json";

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

  if (!ID) { console.error("Kein --candidate."); process.exit(2); }

  const gewaehlt = [APPROVE, REJECT, HOLD].filter(Boolean).length;
  if (gewaehlt !== 1) {
    console.error("Genau eines von --approve, --reject oder --hold. Mehreres oder " +
      "nichts ist keine Entscheidung.");
    process.exit(2);
  }

  const pfad = join(ROOT, DIR, ID + ".json");
  if (!existsSync(pfad)) { console.error("Kandidat nicht gefunden: " + pfad); process.exit(2); }
  const kandidat = JSON.parse(readFileSync(pfad, "utf8"));

  console.log("VISION UNIVERSE SOCIAL — Entscheidung ueber " + ID);
  console.log("Zustand:   " + kandidat.state);

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

    const fbh = join(ROOT, FEEDBACK_DATEI);
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
    console.log("\nGeschrieben: " + FEEDBACK_DATEI);
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

    const fb = join(ROOT, FEEDBACK_DATEI);
    const bestand = existsSync(fb) ? JSON.parse(readFileSync(fb, "utf8")) : { entries: [] };
    bestand.entries = (bestand.entries || []).concat([
      feedbackEintrag(kandidat, "REJECT", { reason: REASON, by: BY, now: NOW })]);
    bestand.generatedAt = NOW;
    mkdirSync(dirname(fb), { recursive: true });
    writeFileSync(fb, JSON.stringify(bestand, null, 2) + "\n");

    console.log("\nABGELEHNT. Grund festgehalten.");
    console.log("Dieser Beitrag wurde nie veroeffentlicht und hat deshalb KEINE Leistung —");
    console.log("weder eine schlechte noch eine gute. Er geht in keinen Leistungsvergleich ein.");
    console.log("\nGeschrieben: " + FEEDBACK_DATEI);
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
  writeFileSync(join(ROOT, DIR, ID + ".request.json"), JSON.stringify(anfrage, null, 2) + "\n");

  console.log("\nFREIGEGEBEN von " + BY + " um " + NOW);
  console.log("Abdruck:  " + nachgerechnet);
  console.log("\nDie Anfrage steht in " + DIR + "/" + ID + ".request.json.");
  console.log("Der Worker rechnet den Abdruck ein zweites Mal nach und lehnt ab, wenn");
  console.log("sich bis dahin etwas geaendert hat.");
}
