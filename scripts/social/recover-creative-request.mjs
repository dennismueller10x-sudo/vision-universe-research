/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/recover-creative-request.mjs

   DER WIEDERANLAUF ALS EIN VORGANG

   -------------------------------------------------------------------------
   WOZU
   -------------------------------------------------------------------------

   Schweigt der Anbieter, muss derselbe Inhalt erneut angefragt werden
   koennen. Alle Bausteine dafuer sind da: der Zustand STALE_NO_RESULT,
   die gemessene Frist, der Anlauf-Zaehler im Brief. Was fehlte, war der
   eine Weg, der sie zusammenfuehrt — und ihn jedes Mal von Hand zu
   gehen, hiesse ihn jedes Mal anders zu gehen.

   -------------------------------------------------------------------------
   WAS ES PRUEFT, BEVOR ES ETWAS TUT
   -------------------------------------------------------------------------

   1. Liegt ueberhaupt ein Brief vor?
   2. Ist der Vorgang wirklich STALE — nach der GEMESSENEN Frist, nicht
      nach Gefuehl?
   3. Ist der Anlauf-Vorrat nicht erschoepft?

   Jede Antwort ist ein Nein mit Grund. Ein Wiederanlauf, der laeuft,
   weil niemand nachgesehen hat, ist der blinde Retry unter anderem
   Namen.

   -------------------------------------------------------------------------
   WAS ES AUSDRUECKLICH NICHT TUT
   -------------------------------------------------------------------------

   Es oeffnet keinen Pull Request. Das ist die Handlung mit
   Aussenwirkung, sie loest einen fremden Agenten aus, und sie gehoert
   deshalb in einen Schritt, den ein Mensch oder ein Workflow
   ausdruecklich ausfuehrt — genauso wie beim ersten Anlauf.

   Es aendert keine Owner-Entscheidung. Es ruehrt den vorigen Anlauf
   nicht an: der bleibt als Provenance stehen, mitsamt seinem Schweigen.

   Ausfuehren:
     node scripts/social/recover-creative-request.mjs --content-id vu-xom-20260911
     node scripts/social/recover-creative-request.mjs --content-id vu-xom-20260911 --write
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));
const Lifecycle = require(join(ROOT, "social/engines/provider-lifecycle.js"));
const Ledger = require(join(ROOT, "social/engines/invocation-ledger.js"));

export const LEDGER_DATEI = "social/data/creative-invocations.json";

/* Wie oft darf derselbe Inhalt hoechstens angefragt werden?
   Nicht als Sicherheitsgurt gedacht, sondern als Haltegriff: wer beim
   vierten Anlauf ist, hat kein Transportproblem mehr, sondern ein
   anderes — und soll das merken, statt weiterzuzaehlen. */
export const MAX_ANLAEUFE = 3;

export function ledgerLaden() {
  const pfad = join(ROOT, LEDGER_DATEI);
  const roh = existsSync(pfad) ? JSON.parse(readFileSync(pfad, "utf8")) : { entries: [] };
  return { ledger: Ledger.createLedger(roh.entries || [], roh.latencyObservations || []),
           pfad };
}

/**
 * Der abgelegte Brief eines Anlaufs samt seiner Kennungen.
 *
 * `root` ist ueberschreibbar, weil sonst jede Pruefung am Zustand des
 * Produktionsverzeichnisses haengt - und ein Test, der den echten Brief
 * liest, faellt um, sobald der echte Brief sich aendert. Genau das ist
 * beim Wiederanlauf 2 passiert.
 */
export function briefLesen(contentId, root) {
  const pfad = join(root || ROOT, ChatGptWork.requestDir(contentId), "authoring-brief.json");
  if (!existsSync(pfad)) return null;
  const roh = readFileSync(pfad);
  const brief = JSON.parse(String(roh));
  const sha = ChatGptWork.blobSha(roh);
  return { brief, roh, sha, pfad,
    processingKey: ChatGptWork.processingKey(brief.brief_id, contentId, sha,
      brief.schema_version || "1.0") };
}

/**
 * Darf und soll ein neuer Anlauf gestellt werden?
 *
 * Gibt immer einen Bericht zurueck. Ein Nein ist ein Ergebnis und kein
 * Fehler.
 */
export function pruefeWiederanlauf(contentId, options) {
  options = options || {};
  const jetzt = options.now || new Date().toISOString();

  const wurzel = options.root || ROOT;
  const abgelegt = briefLesen(contentId, wurzel);
  if (!abgelegt) {
    return { ok: false, reason: "noBrief",
      explanation: "Zu " + contentId + " liegt kein Brief. Es gibt nichts zu " +
        "wiederholen." };
  }

  const { ledger } = options.ledger ? { ledger: options.ledger } : ledgerLaden();
  const beobachtet = ledger.all().filter((e) =>
    e.processingKey === abgelegt.processingKey && e.observed === true);
  const zeiten = beobachtet.map((e) => e.at).filter(Boolean).sort();

  const ergebnisPfad = join(wurzel, ChatGptWork.requestDir(contentId),
    "authoring-result.json");

  const zustand = Lifecycle.classify({
    startedCount: beobachtet.filter((e) => e.state === "IN_FLIGHT").length,
    firstActivityAt: zeiten.length ? zeiten[0] : null,
    lastActivityAt: zeiten.length ? zeiten[zeiten.length - 1] : null,
    resultPresent: existsSync(ergebnisPfad)
  }, { now: jetzt, observations: ledger.latencies() });

  const anlauf = Number(abgelegt.brief.attempt) || 1;

  /* -------------------------------------------------------------------
     WARTEN IST KEIN GRUND FUER EINEN NEUEN ANLAUF — IM GEGENTEIL

     Steht der Vorgang auf WAITING_FOR_EXTERNAL_APPROVAL, dann liegt
     moeglicherweise eine Genehmigungsabfrage offen, die niemand
     bestaetigt hat. Ein zweiter Anlauf erzeugt dann eine ZWEITE
     wartende Anfrage — und verdoppelt das Problem, statt es zu loesen.

     Der richtige naechste Schritt ist in diesem Fall kein technischer,
     sondern ein Blick in die Work-Oberflaeche.
     ------------------------------------------------------------------- */
  if (zustand.state === "WAITING_FOR_EXTERNAL_APPROVAL") {
    return { ok: false, reason: "awaitingExternalApproval", state: zustand.state,
      attempt: anlauf, lifecycle: zustand,
      explanation: "Der Vorgang hat " + zustand.startedCount + "x begonnen, ohne " +
        "zu Ende zu kommen. Dieses Muster passt auf eine offene Genehmigung der " +
        "verbundenen GitHub-App in ChatGPT Work. Ein weiterer Anlauf wuerde eine " +
        "ZWEITE wartende Anfrage erzeugen und das Problem verdoppeln. " +
        (zustand.ownerActionHint || "") };
  }

  if (zustand.state !== "STALE_NO_RESULT") {
    return { ok: false, reason: "notStale", state: zustand.state, attempt: anlauf,
      lifecycle: zustand,
      explanation: "Der Vorgang steht auf " + zustand.state + ". Ein Wiederanlauf " +
        "kommt erst in Frage, wenn die gemessene Frist abgelaufen ist — sonst " +
        "waere er der blinde Retry unter anderem Namen. " + zustand.explanation };
  }

  if (anlauf >= MAX_ANLAEUFE) {
    return { ok: false, reason: "attemptsExhausted", state: zustand.state,
      attempt: anlauf, lifecycle: zustand,
      explanation: "Anlauf " + anlauf + " von hoechstens " + MAX_ANLAEUFE +
        ". Wer hier ist, hat kein Transportproblem mehr, sondern ein anderes. " +
        "Der naechste Schritt ist eine Entscheidung und kein weiterer Versuch." };
  }

  return { ok: true, reason: null, state: zustand.state, lifecycle: zustand,
    attempt: anlauf, nextAttempt: anlauf + 1,
    processingKey: abgelegt.processingKey,
    brief: abgelegt.brief,
    explanation: "Anlauf " + anlauf + " blieb ohne beobachtbares Ergebnis. " +
      "Anlauf " + (anlauf + 1) + " ist zulaessig." };
}

/** Baut den Brief des naechsten Anlaufs. Aendert am alten nichts. */
export function baueWiederanlauf(bericht, options) {
  options = options || {};
  if (!bericht.ok) throw new Error("baueWiederanlauf: " + bericht.explanation);

  const neu = Object.assign({}, bericht.brief, {
    attempt: bericht.nextAttempt,
    supersedes_attempt: bericht.attempt,
    attempt_reason: options.reason ||
      ("Anlauf " + bericht.attempt + " blieb ohne beobachtbares Ergebnis " +
       "(" + bericht.state + ").")
  });

  const roh = JSON.stringify(neu, null, 2) + "\n";
  const sha = ChatGptWork.blobSha(roh);
  return { brief: neu, roh, sha,
    processingKey: ChatGptWork.processingKey(neu.brief_id, neu.content_id, sha,
      neu.schema_version || "1.0") };
}

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");

  const CONTENT_ID = String(arg("content-id", "")).trim();
  const NOW = arg("now", new Date().toISOString());
  if (!CONTENT_ID) { console.error("Kein --content-id."); process.exit(2); }

  console.log("VISION UNIVERSE SOCIAL — Wiederanlauf");
  console.log("Inhalt: " + CONTENT_ID);

  const bericht = pruefeWiederanlauf(CONTENT_ID, { now: NOW });
  console.log("\nZustand:  " + (bericht.state || "—"));
  if (bericht.lifecycle) {
    console.log("Frist:    " + bericht.lifecycle.lease.seconds + " s (" +
      bericht.lifecycle.lease.regime + ", n=" + bericht.lifecycle.lease.sampleSize + ")");
  }
  console.log("Anlauf:   " + (bericht.attempt || "—") + " von hoechstens " + MAX_ANLAEUFE);
  console.log("\n" + bericht.explanation);

  if (!bericht.ok) process.exit(3);

  const naechster = baueWiederanlauf(bericht, { reason: arg("reason", null) });
  console.log("\n--- ANLAUF " + naechster.brief.attempt + " ---");
  console.log("brief_blob_sha  " + naechster.sha);
  console.log("processing_key  " + naechster.processingKey);
  console.log("Grund           " + naechster.brief.attempt_reason);
  console.log("\nDer vorige Anlauf bleibt unangetastet:");
  console.log("  " + bericht.processingKey);

  if (!WRITE) {
    console.log("\n(Kein --write: es wurde nichts geschrieben.)");
    console.log("Und auch mit --write wird KEIN Pull Request geoeffnet — das ist die");
    console.log("Handlung mit Aussenwirkung und gehoert in einen eigenen Schritt.");
    process.exit(0);
  }

  const ziel = join(ROOT, ChatGptWork.requestDir(CONTENT_ID), "authoring-brief.json");
  mkdirSync(dirname(ziel), { recursive: true });
  writeFileSync(ziel, naechster.roh);
  console.log("\nGeschrieben: " + ChatGptWork.requestDir(CONTENT_ID) + "/authoring-brief.json");

  const { ledger, pfad } = ledgerLaden();
  ledger.record({
    processingKey: naechster.processingKey,
    state: "REQUESTED",
    at: NOW,
    contentId: CONTENT_ID,
    briefId: naechster.brief.brief_id,
    briefBlobSha: naechster.sha,
    observed: true,
    note: "Anlauf " + naechster.brief.attempt + ", loest Anlauf " +
      bericht.attempt + " ab. " + naechster.brief.attempt_reason +
      " Der PR wird NICHT von diesem Skript geoeffnet."
  });
  writeFileSync(pfad, JSON.stringify(ledger.snapshot({ now: NOW }), null, 2) + "\n");
  console.log("Ledger fortgeschrieben.");
}
