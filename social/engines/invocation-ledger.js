/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/invocation-ledger.js

   WAS SCHON EINMAL ANGESTOSSEN WURDE

   -------------------------------------------------------------------------
   DER BEWEISSTATUS, DEN DER OWNER GENANNT HAT
   -------------------------------------------------------------------------

   Im realen Proof wurde KEIN rekursiver Result-Commit beobachtet. Der
   Trigger ist eng (`pull_request/opened`), `enable_commit_updates` ist
   aus, und ein Ledger existiert.

   Aber die verfuegbare Schnittstelle liefert KEINE vollstaendige
   Run-Historie. Damit gilt:

     LOOP_PROTECTION_OPERATIONALLY_SUPPORTED

   und ausdruecklich NICHT:

     FORMALLY_EXHAUSTIVE_RUN_COUNT_PROVEN

   Der Unterschied ist keine Formalie. "Wir haben keine Rekursion
   gesehen" und "es kann keine geben" sind zwei verschiedene Aussagen,
   und nur die zweite erlaubt es, Schutzschichten wegzulassen.

   Solange die erste gilt, bleiben ALLE Schichten:

     enger PR-Trigger          das Ereignis selbst
     Branch-/Pfad-/Statusgates wo darf ein Ergebnis ueberhaupt liegen
     enable_commit_updates=false   der Agent reagiert nicht auf sich selbst
     Processing Key            ein Lauf je Brief-Revision
     immutable completed       ein fertiges Ergebnis wird nie ueberschrieben
     dieses Ledger             was schon angestossen wurde
     idempotente Verarbeitung  zweimal lesen aendert nichts

   Eine einzelne Schicht wegzulassen, weil die anderen schon greifen,
   ist genau die Rechnung, die bei einem unbewiesenen Loop nicht aufgeht.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* -------------------------------------------------------------------
     DAS VOKABULAR KOMMT AUS EINER QUELLE

     Hier standen fuenf Zustaende als eigene Liste. Als PR 101 sechsmal
     STARTED meldete und nie lieferte, fehlte darin genau einer:
     "nichts Beobachtbares im Fenster". Eine zweite Liste an anderer
     Stelle haette dasselbe Loch an einer anderen Stelle gehabt.

     provider-lifecycle.js fuehrt die Zustaende, dieser Ledger schreibt
     sie auf. COMPLETED und REJECTED bleiben als Altbestand gueltig —
     sie stehen in bereits geschriebenen Daten, und Daten umzudeuten ist
     keine Migration, sondern Geschichtsfaelschung.
     ------------------------------------------------------------------- */
  var Lifecycle = isNode ? require("./provider-lifecycle.js")
    : global.VUSocialProviderLifecycle;

  var ALTBESTAND = ["COMPLETED", "REJECTED"];
  var STATES = Lifecycle.STATES.concat(ALTBESTAND);

  /* Ein fertiges Ergebnis ist fertig. Von hier aus geht es nirgends
     mehr hin — ein spaeterer Lauf, der es aendern wollte, ist der Lauf,
     den es nicht geben darf.

     STALE_NO_RESULT gehoert ausdruecklich NICHT dazu. Es sagt, dass wir
     nichts gesehen haben, nicht dass nichts kommt. Taucht spaeter doch
     ein Ergebnis auf, darf es verarbeitet werden. */
  var TERMINAL = Lifecycle.TERMINAL.concat(ALTBESTAND);

  function createLedger(entries, latencies) {
    var eintraege = Array.isArray(entries) ? entries.slice() : [];
    var laufzeiten = Array.isArray(latencies) ? latencies.slice() : [];

    function byKey(processingKey) {
      for (var i = eintraege.length - 1; i >= 0; i -= 1) {
        if (eintraege[i].processingKey === processingKey) return eintraege[i];
      }
      return null;
    }

    /**
     * Darf dieser Lauf angestossen werden?
     *
     * Die Antwort ist oefter nein, als man denkt — und jedes Nein hat
     * einen anderen Grund, der auch benannt wird. "Schon gelaufen" und
     * "laeuft gerade" verlangen verschiedene Reaktionen.
     */
    function mayInvoke(processingKey, options) {
      options = options || {};
      var vorhanden = byKey(processingKey);
      if (!vorhanden) return { ok: true, reason: null, existing: null };

      if (vorhanden.state === "COMPLETED") {
        return { ok: false, reason: "completed", existing: vorhanden,
          message: "Fuer diesen Schluessel liegt bereits ein fertiges Ergebnis vor. " +
            "Es wird wiederverwendet und nicht neu erzeugt." };
      }
      if (vorhanden.state === "REJECTED") {
        return { ok: false, reason: "rejected", existing: vorhanden,
          message: "Dieser Lauf wurde bereits zurueckgewiesen. Eine Wiederholung " +
            "braucht eine neue Brief-Revision — sonst entstuenden dieselben " +
            "Kennungen fuer anderen Text." };
      }
      if (vorhanden.state === "RECOVERY_REQUIRED") {
        return { ok: false, reason: "recovery", existing: vorhanden,
          message: "Dieser Lauf steht in RECOVERY_REQUIRED. Ein stiller zweiter " +
            "Versuch wuerde die Herkunft verwischen; die Wiederherstellung ist " +
            "eine Entscheidung." };
      }

      /* IN_FLIGHT oder REQUESTED. */
      var alter = options.now && vorhanden.at
        ? (Date.parse(options.now) - Date.parse(vorhanden.at)) / 3600000 : null;
      var frist = typeof options.staleAfterHours === "number" ? options.staleAfterHours : 6;

      if (alter !== null && alter > frist) {
        return { ok: false, reason: "staleInFlight", existing: vorhanden,
          message: "Ein Lauf zu diesem Schluessel steht seit " +
            Math.round(alter) + " Stunden offen. Das ist laenger als erwartet; " +
            "ob der Agent noch arbeitet, weiss niemand ohne nachzusehen. " +
            "Es wird NICHT erneut angestossen." };
      }
      return { ok: false, reason: "inFlight", existing: vorhanden,
        message: "Ein Lauf zu diesem Schluessel laeuft bereits." };
    }

    function record(entry) {
      if (!entry || !entry.processingKey) {
        throw new Error("VUSocialInvocationLedger: Eintrag ohne processingKey");
      }
      if (STATES.indexOf(entry.state) === -1) {
        throw new Error("VUSocialInvocationLedger: unbekannter Zustand " + entry.state);
      }

      var vorhanden = byKey(entry.processingKey);
      if (vorhanden && TERMINAL.indexOf(vorhanden.state) !== -1) {
        /* Ein fertiges Ergebnis wird nicht ueberschrieben. Der Versuch
           wird festgehalten — ein Ledger, das Versuche verschweigt,
           beantwortet die Frage nicht mehr, wie oft etwas lief. */
        eintraege.push({
          processingKey: entry.processingKey,
          state: vorhanden.state,
          at: entry.at || null,
          note: "Zweiter Eintrag zu einem abgeschlossenen Schluessel abgewiesen " +
            "(Versuch: " + entry.state + ").",
          rejectedWrite: true
        });
        return { written: false, reason: "terminal", existing: vorhanden };
      }

      eintraege.push({
        processingKey: entry.processingKey,
        state: entry.state,
        at: entry.at || null,
        contentId: entry.contentId || null,
        briefId: entry.briefId || null,
        briefBlobSha: entry.briefBlobSha || null,
        pullRequest: entry.pullRequest === undefined ? null : entry.pullRequest,
        deliveryId: entry.deliveryId || null,
        /* -------------------------------------------------------------
           BEOBACHTET ODER NOTIERT

           Dieses Feld fehlte in der Aufzaehlung, und die Aufzaehlung
           laesst weg, was sie nicht kennt. Ergebnis: sechs frisch
           eingelesene Agent-Meldungen landeten im Ledger und zaehlten
           anschliessend als null, weil ihr `observed` unterwegs
           verlorenging.

           Es ist dieselbe Fehlerart, die hier schon mehrfach zugeschlagen
           hat — eine Weissliste, die stillschweigend Felder verschluckt.
           ------------------------------------------------------------- */
        observed: entry.observed === true,
        timestampProvenance: entry.timestampProvenance ||
          (entry.observed === true ? "observed" : "hand-entered-approximate"),
        note: entry.note || null
      });
      return { written: true, reason: null, existing: vorhanden };
    }

    /* -------------------------------------------------------------------
       DIE GEMESSENEN LAUFZEITEN

       Die Frist fuer STALE_NO_RESULT stammt aus einer einzigen Messung
       (PR 98: 345 s). Das Regime kannte BOOTSTRAP, GROWING und MATURE —
       aber es gab keinen Weg, jemals aus BOOTSTRAP herauszukommen, weil
       niemand neue Messungen aufschrieb.

       Eine Skala mit drei Stufen, von denen zwei unerreichbar sind, ist
       keine Skala. Es ist dieselbe tote Dimension wie seinerzeit das
       fest verdrahtete `timingKnowledge: null`.

       Gemessen wird von der LETZTEN beobachteten Aktivitaet bis zum
       Ergebnis. Bei mehreren Anlaeufen laesst sich nicht sagen, welcher
       geliefert hat — und fuer eine Frist ist ohnehin die Frage
       massgeblich, wie lange nach einem Lebenszeichen noch ein Ergebnis
       kommen darf.
       ------------------------------------------------------------------- */
    function recordLatency(spec) {
      if (!spec || !spec.processingKey) {
        throw new Error("VUSocialInvocationLedger: Laufzeit ohne processingKey");
      }
      var sekunden = Number(spec.seconds);
      if (!isFinite(sekunden) || sekunden <= 0) {
        return { written: false, reason: "implausible" };
      }
      /* Dieselbe Messung nicht zweimal. */
      for (var i = 0; i < laufzeiten.length; i += 1) {
        if (laufzeiten[i].processingKey === spec.processingKey) {
          return { written: false, reason: "alreadyMeasured", existing: laufzeiten[i] };
        }
      }
      laufzeiten.push({
        processingKey: spec.processingKey,
        contentId: spec.contentId || null,
        seconds: Math.round(sekunden),
        startedAt: spec.startedAt || null,
        resultAt: spec.resultAt || null,
        source: spec.source || "ingest",
        note: "Von der letzten beobachteten Aktivitaet bis zum bestaetigten Ergebnis."
      });
      return { written: true, reason: null };
    }

    return {
      mayInvoke: mayInvoke,
      record: record,
      recordLatency: recordLatency,
      /** Die gemessenen Dauern in Sekunden, fuer die Fristberechnung. */
      latencies: function () {
        return laufzeiten.map(function (x) { return x.seconds; });
      },
      latencyRecords: function () { return laufzeiten.slice(); },
      get: byKey,
      all: function () { return eintraege.slice(); },
      /** Wie oft wurde zu diesem Schluessel ueberhaupt geschrieben? */
      countFor: function (key) {
        return eintraege.filter(function (e) { return e.processingKey === key; }).length;
      },
      snapshot: function (meta) {
        return {
          generatedAt: (meta && meta.now) || null,
          /* Der Beweisstatus reist mit den Daten. Wer sie spaeter liest,
             soll nicht annehmen muessen, was sie wert sind. */
          loopProtection: "LOOP_PROTECTION_OPERATIONALLY_SUPPORTED",
          loopProtectionNote:
            "Kein rekursiver Result-Commit beobachtet. Die verfuegbare " +
            "Schnittstelle liefert keine vollstaendige Run-Historie; " +
            "FORMALLY_EXHAUSTIVE_RUN_COUNT_PROVEN ist damit NICHT erreicht. " +
            "Alle Schutzschichten bleiben aktiv.",
          entries: eintraege.slice(),
          /* Die Messungen reisen mit: ohne sie faellt die Frist bei
             jedem Neustart auf die eine Referenzmessung zurueck. */
          latencyObservations: laufzeiten.slice()
        };
      }
    };
  }

  var api = { STATES: STATES, TERMINAL: TERMINAL, createLedger: createLedger };

  if (isNode) module.exports = api;
  else global.VUSocialInvocationLedger = api;
})(typeof window !== "undefined" ? window : globalThis);
