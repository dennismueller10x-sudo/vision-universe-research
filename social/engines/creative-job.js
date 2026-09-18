/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/creative-job.js

   EIN LOGISCHER JOB PRO ANFRAGE

   -------------------------------------------------------------------------
   WARUM DAS NICHT DER INVOCATION LEDGER IST
   -------------------------------------------------------------------------

   Der Ledger schreibt auf, was wir den Anbieter TUN SEHEN. Diese Datei
   fuehrt, was VU BESCHLOSSEN hat. Das sind zwei verschiedene Dinge, und
   sie auseinanderzuhalten ist der ganze Punkt:

     Ledger        Beobachtung.  Sechs STARTED sind sechs Eintraege,
                   weil sechs Starts eine Tatsache sind.
     Creative Job  Absicht.      Sechs Starts zu EINER Anfrage sind
                   EIN Job, weil VU einmal beschlossen hat.

   Die beiden zu vermengen hiesse, entweder Tatsachen zu unterschlagen
   oder eine Anbieter-Wiederholung als eigene Entscheidung zu buchen.

   -------------------------------------------------------------------------
   DER BEFUND AUS DEN REALEN DELIVERIES
   -------------------------------------------------------------------------

   Aus den bisherigen Request-PRs, jede Zahl aus den Kommentaren der PRs
   selbst:

     PR    Deliveries  sichtbare Starts  Ergebnis
     98    1           1                 erfolgreich
     108   1           1                 erfolgreich
     106   1           1                 erfolgreich
     103   1           6                 erfolgreich (spaet)
     101   1           6                 nie
     102   1           6                 nie
     104   1           6                 nie
     105   1           5+                nie, lief 11 h weiter

   JEDER dieser PRs traegt GENAU EINE delivery_id, und alle Starts
   desselben PRs nennen dieselbe. VU hat nie eine doppelte Delivery
   erzeugt. Die Vervielfachung liegt hinter der Delivery — sie ist
   anbieterintern und tritt auf, wenn ein Lauf SCHEITERT.

   Ebenfalls belegt, und zwar als Negativbefund: der Ergebnis-Commit des
   Agenten (ein `synchronize`-Ereignis) loest KEINEN neuen Lauf aus. PRs
   103, 106 und 108 haben einen Ergebnis-Commit und trotzdem nur ihre
   eine delivery_id. Die Rekursionsangst war unbegruendet.

   -------------------------------------------------------------------------
   WAS DARAUS FOLGT
   -------------------------------------------------------------------------

   VU kann die Zahl der Anbieter-Wiederholungen nicht steuern. Steuerbar
   ist genau eines: wie viele Jobs VU ueberhaupt in die Welt setzt, und
   wie lange ein toter Job offen bleibt. Beides macht diese Datei
   verbindlich — nicht als Ratschlag, sondern fail closed.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var STATES = [
    "CREATIVE_JOB_REQUESTED",     /* Brief geschrieben, noch nichts ausgeloest */
    "CREATIVE_JOB_DISPATCHED",    /* PR geoeffnet - ab hier laeuft die externe Welt */
    "CREATIVE_JOB_IN_FLIGHT",     /* mindestens ein Start beobachtet */
    "CREATIVE_JOB_RESULT_AVAILABLE",
    "CREATIVE_JOB_VERIFIED",
    "CREATIVE_JOB_FAILED",
    "CREATIVE_JOB_STALE"
  ];

  /* Von hier geht es nicht mehr weiter.

     CREATIVE_JOB_STALE gehoert ausdruecklich NICHT dazu — dieselbe
     Begruendung wie im Ledger: "wir haben nichts gesehen" ist keine
     Aussage darueber, dass nichts mehr kommt. PR 105 hat nach elf
     Stunden noch gemeldet. */
  var TERMINAL = ["CREATIVE_JOB_VERIFIED", "CREATIVE_JOB_FAILED"];

  /* Zustaende, in denen die externe Welt den Job noch bearbeiten kann -
     und in denen ein offener Request-PR weiter Wiederholungen einsammelt. */
  var OFFEN = ["CREATIVE_JOB_DISPATCHED", "CREATIVE_JOB_IN_FLIGHT",
    "CREATIVE_JOB_RESULT_AVAILABLE", "CREATIVE_JOB_STALE"];

  var UEBERGAENGE = {
    CREATIVE_JOB_REQUESTED: ["CREATIVE_JOB_DISPATCHED", "CREATIVE_JOB_FAILED"],
    CREATIVE_JOB_DISPATCHED: ["CREATIVE_JOB_IN_FLIGHT", "CREATIVE_JOB_RESULT_AVAILABLE",
      "CREATIVE_JOB_STALE", "CREATIVE_JOB_FAILED"],
    CREATIVE_JOB_IN_FLIGHT: ["CREATIVE_JOB_RESULT_AVAILABLE", "CREATIVE_JOB_STALE",
      "CREATIVE_JOB_FAILED"],
    CREATIVE_JOB_RESULT_AVAILABLE: ["CREATIVE_JOB_VERIFIED", "CREATIVE_JOB_FAILED"],
    CREATIVE_JOB_STALE: ["CREATIVE_JOB_RESULT_AVAILABLE", "CREATIVE_JOB_IN_FLIGHT",
      "CREATIVE_JOB_FAILED"],
    CREATIVE_JOB_VERIFIED: [],
    CREATIVE_JOB_FAILED: []
  };

  /* -------------------------------------------------------------------
     DAS BUDGET

     Keine ausgedachten Zahlen. Jede Grenze steht fuer eine Aussage
     ueber den gewuenschten Betrieb, und die Aussage steht daneben.
     ------------------------------------------------------------------- */
  var BUDGET = {
    /* "1 logical content request -> max. 1 externally requested
       Creative Job". Woertlich die Owner-Vorgabe, deshalb 1. */
    dispatchesPerProcessingKey: 1,

    /* Ein Inhaltsobjekt darf nicht zwei gleichzeitige Anlaeufe haben -
       sonst konkurrieren zwei Ergebnisse um dieselbe content_id, und
       welches gewinnt, entschiede der Zufall der Ankunft. */
    concurrentJobsPerContentId: 1,

    /* -----------------------------------------------------------------
       ANLAUF IST NICHT REVISION

       Die Obergrenze der ANLAEUFE stammt aus recover-creative-request.mjs
       (MAX_ANLAEUFE = 3) und ist dort begruendet: ein Anlauf ist die
       Wiederholung von etwas, das GESCHEITERT ist, und unbegrenzt zu
       wiederholen hiesse, auf ein anderes Ergebnis derselben Sache zu
       hoffen.

       Eine REVISION ist das Gegenteil: der Lauf ist gelungen, das
       Ergebnis liegt vor, und ein Mensch hat entschieden, dass es
       redaktionell besser werden soll. Sie unter dieselbe Grenze zu
       stellen hiesse, eine Owner-Entscheidung als Fehlschlag zu zaehlen.

       Gefunden wurde das beim ersten echten Versuch: Anlauf 3 war
       erfolgreich, die Ueberarbeitung waere "Anlauf 4" gewesen, und das
       Gatter verweigerte sie mit der Begruendung, drei Versuche seien
       genug. Die Begruendung stimmte - fuer die falsche Sache.
       ----------------------------------------------------------------- */
    maxAttemptsPerContentId: 3,

    /* Revisionen sind begrenzt, aber anders begruendet: jede kostet
       einen Lauf, und eine Runde, die dieselbe Anweisung wiederholt,
       ist keine Ueberarbeitung. Drei Runden auf demselben Text sind
       das Zeichen, dass die ANWEISUNG das Problem ist und nicht der
       Text - dann gehoert es vor den Owner und nicht in eine vierte
       Runde. */
    maxRevisionsPerContentId: 3,

    /* Diagnostische Jobs haben im Produktionspfad nichts verloren. Sie
       sind der Grund, warum am 17.09. drei zusaetzliche Jobs liefen. */
    diagnosticJobsInProduction: 0
  };

  function jetzt(options) {
    return (options && options.now) || new Date().toISOString();
  }

  /** Die Kennung eines Jobs. Aus der Identitaet, nicht aus einem Zaehler. */
  function jobId(spec) {
    var teile = [spec.contentId, spec.briefBlobSha, "attempt" + (spec.attempt || 1)];
    if (spec.revision) teile.push("rev" + spec.revision);
    return "job_" + teile.join(":");
  }

  function createRegistry(jobs) {
    var bestand = Array.isArray(jobs) ? jobs.slice() : [];

    function byKey(processingKey) {
      return bestand.filter(function (j) { return j.processingKey === processingKey; });
    }

    function byContent(contentId) {
      return bestand.filter(function (j) { return j.contentId === contentId; });
    }

    function offeneFuer(contentId) {
      return byContent(contentId).filter(function (j) {
        return OFFEN.indexOf(j.state) !== -1;
      });
    }

    /**
     * Darf VU fuer diesen Schluessel einen Job ANLEGEN?
     *
     * Fail closed: im Zweifel nein, und jedes Nein nennt seinen Grund.
     * Ein "vielleicht" gibt es nicht — ein Dispatch ist eine Handlung
     * mit Aussenwirkung und kostet eine begrenzte Ressource.
     */
    function mayDispatch(spec, options) {
      options = options || {};
      spec = spec || {};

      if (!spec.processingKey) {
        return { ok: false, reason: "noProcessingKey",
          message: "Ohne Processing Key gibt es keine Identitaet, gegen die " +
            "entdoppelt werden koennte. Ein Dispatch ohne sie waere " +
            "unzaehlbar." };
      }
      if (!spec.contentId) {
        return { ok: false, reason: "noContentId",
          message: "Ohne content_id laesst sich die Gleichzeitigkeitsgrenze " +
            "nicht pruefen." };
      }

      /* Die harte Grenze: ein Job pro Processing Key. */
      var vorhanden = byKey(spec.processingKey);
      if (vorhanden.length >= BUDGET.dispatchesPerProcessingKey) {
        var j = vorhanden[vorhanden.length - 1];
        return { ok: false, reason: "alreadyDispatched", existing: j,
          message: "Fuer diesen Processing Key existiert bereits ein " +
            "logischer Job (" + j.creativeJobId + ", Zustand " + j.state +
            "). Ein zweiter Dispatch waere eine zweite Anfrage fuer " +
            "dieselbe Arbeit." };
      }

      /* Keine parallelen Anlaeufe desselben Inhaltsobjekts. */
      var offen = offeneFuer(spec.contentId);
      if (offen.length >= BUDGET.concurrentJobsPerContentId) {
        return { ok: false, reason: "concurrentJob", existing: offen[0],
          message: "Zu " + spec.contentId + " ist bereits ein Job offen (" +
            offen[0].creativeJobId + ", Zustand " + offen[0].state + "). " +
            "Zwei gleichzeitige Anlaeufe erzeugen zwei Ergebnisse fuer " +
            "dieselbe Kennung; welches gewaenne, entschiede die Ankunft." };
      }

      /* -----------------------------------------------------------------
         DIE BEIDEN GRENZEN, GETRENNT GEZAEHLT

         Gezaehlt werden nicht die Nummern, sondern die JOBS: wieviele
         gescheiterte Wiederholungen gab es, und wieviele
         Ueberarbeitungen. Die `attempt`-Nummer laeuft ueber beides
         hinweg weiter, weil sie die Identitaet des Briefs traegt - sie
         als Zaehler zu missbrauchen war der Fehler.
         ----------------------------------------------------------------- */
      var eigene = byContent(spec.contentId);
      var istRevision = !!spec.revision;

      var revisionen = eigene.filter(function (j) { return !!j.revision; }).length;
      var anlaeufe = eigene.length - revisionen;

      if (!istRevision && anlaeufe >= BUDGET.maxAttemptsPerContentId) {
        return { ok: false, reason: "attemptBudget",
          message: "Zu " + spec.contentId + " gab es bereits " + anlaeufe +
            " Anlaeufe (Grenze " + BUDGET.maxAttemptsPerContentId + "). Ein " +
            "weiterer Versuch ist eine Entscheidung und kein Automatismus." };
      }

      if (istRevision && revisionen >= BUDGET.maxRevisionsPerContentId) {
        return { ok: false, reason: "revisionBudget",
          message: "Zu " + spec.contentId + " gab es bereits " + revisionen +
            " Ueberarbeitungen (Grenze " + BUDGET.maxRevisionsPerContentId +
            "). Wenn drei Runden denselben Text nicht tragen, ist die " +
            "ANWEISUNG das Problem - und das gehoert vor den Owner." };
      }

      /* Diagnostische Jobs im Produktionspfad. */
      if (options.productionPath === true && istDiagnostisch(spec.contentId)) {
        return { ok: false, reason: "diagnosticInProduction",
          message: "Diagnostische Jobs (" + spec.contentId + ") gehoeren nicht " +
            "in den Produktionspfad. Am 17.09. liefen drei davon und " +
            "verbrauchten dieselbe begrenzte Ressource wie echte Inhalte." };
      }

      return { ok: true, reason: null };
    }

    /** Legt den Job an. Wirft, wenn er nicht angelegt werden darf. */
    function dispatch(spec, options) {
      var darf = mayDispatch(spec, options);
      if (!darf.ok) {
        var fehler = new Error("VUSocialCreativeJob: " + darf.message);
        fehler.code = darf.reason;
        fehler.existing = darf.existing || null;
        throw fehler;
      }
      var job = {
        creativeJobId: jobId(spec),
        contentId: spec.contentId,
        briefId: spec.briefId || null,
        briefBlobSha: spec.briefBlobSha || null,
        processingKey: spec.processingKey,
        attempt: Number(spec.attempt) || 1,
        revision: spec.revision || null,
        state: "CREATIVE_JOB_REQUESTED",
        createdAt: jetzt(options),
        updatedAt: jetzt(options),
        prNumber: null,
        deliveryIds: [],
        observedStarts: 0,
        history: [{ state: "CREATIVE_JOB_REQUESTED", at: jetzt(options),
          note: spec.note || null }]
      };
      bestand.push(job);
      return job;
    }

    /** Ein Zustandswechsel. Vorwaerts, oder gar nicht. */
    function transition(creativeJobId, nachher, options) {
      options = options || {};
      var job = null;
      for (var i = 0; i < bestand.length; i++) {
        if (bestand[i].creativeJobId === creativeJobId) { job = bestand[i]; break; }
      }
      if (!job) throw new Error("VUSocialCreativeJob: unbekannter Job " + creativeJobId);

      if (STATES.indexOf(nachher) === -1) {
        throw new Error("VUSocialCreativeJob: unbekannter Zustand " + nachher);
      }
      var erlaubt = UEBERGAENGE[job.state] || [];
      if (erlaubt.indexOf(nachher) === -1) {
        var f = new Error("VUSocialCreativeJob: " + job.state + " -> " + nachher +
          " ist kein zulaessiger Uebergang." +
          (TERMINAL.indexOf(job.state) !== -1
            ? " Der Job ist abgeschlossen; ein spaeterer Lauf, der ihn " +
              "aendern wollte, ist der Lauf, den es nicht geben darf."
            : ""));
        f.code = "illegalTransition";
        throw f;
      }
      job.state = nachher;
      job.updatedAt = jetzt(options);
      if (options.prNumber) job.prNumber = options.prNumber;
      if (options.deliveryId && job.deliveryIds.indexOf(options.deliveryId) === -1) {
        job.deliveryIds.push(options.deliveryId);
      }
      if (typeof options.observedStarts === "number") {
        job.observedStarts = options.observedStarts;
      }
      job.history.push({ state: nachher, at: job.updatedAt,
        note: options.note || null });
      return job;
    }

    /**
     * Welche Jobs haben einen offenen Request-PR, obwohl sie fertig sind?
     *
     * Das ist VUs einziger Hebel auf die Wiederholungen: der Anbieter
     * arbeitet gegen einen offenen PR. Ein abgeschlossener Job mit
     * offenem PR ist eine Einladung, die niemand mehr braucht.
     */
    function closable() {
      return bestand.filter(function (j) {
        return TERMINAL.indexOf(j.state) !== -1 && j.prNumber && !j.prClosedAt;
      });
    }

    function snapshot(meta) {
      return {
        generatedAt: (meta && meta.now) || new Date().toISOString(),
        budget: BUDGET,
        jobs: bestand.slice()
      };
    }

    return {
      all: function () { return bestand.slice(); },
      byKey: byKey, byContent: byContent, openFor: offeneFuer,
      mayDispatch: mayDispatch, dispatch: dispatch,
      transition: transition, closable: closable, snapshot: snapshot,
      get: function (id) {
        return bestand.filter(function (j) { return j.creativeJobId === id; })[0] || null;
      }
    };
  }

  /* Eine Kennung, die als diagnostisch erkennbar ist. Bewusst eng: was
     hier nicht passt, gilt als produktiv — im Zweifel wird die
     STRENGERE Regel angewandt. */
  function istDiagnostisch(contentId) {
    return /(^|[-_])(diag|diagnostic|proof|permcheck|test)([-_]|$)/i
      .test(String(contentId || ""));
  }

  var api = {
    STATES: STATES, TERMINAL: TERMINAL, OFFEN: OFFEN,
    UEBERGAENGE: UEBERGAENGE, BUDGET: BUDGET,
    jobId: jobId, istDiagnostisch: istDiagnostisch,
    createRegistry: createRegistry
  };

  if (isNode) module.exports = api;
  else global.VUSocialCreativeJob = api;
})(typeof window !== "undefined" ? window : globalThis);
