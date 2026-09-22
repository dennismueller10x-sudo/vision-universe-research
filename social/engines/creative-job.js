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
    "CREATIVE_JOB_STALE",
    /* -----------------------------------------------------------------
       UEBERHOLT IST NICHT GESCHEITERT

       Ein Job, den eine spaetere Revision ersetzt hat, ist fertig -
       aber er hat nicht geliefert, und FAILED waere eine Aussage ueber
       den Agenten, die niemand belegen kann. Ohne eigenen Zustand
       bliebe nur die Wahl zwischen einer Luege und einem Zombie.
       ----------------------------------------------------------------- */
    "CREATIVE_JOB_SUPERSEDED"
  ];

  /* Von hier geht es nicht mehr weiter.

     CREATIVE_JOB_STALE gehoert ausdruecklich NICHT dazu — dieselbe
     Begruendung wie im Ledger: "wir haben nichts gesehen" ist keine
     Aussage darueber, dass nichts mehr kommt. PR 105 hat nach elf
     Stunden noch gemeldet. */
  var TERMINAL = ["CREATIVE_JOB_VERIFIED", "CREATIVE_JOB_FAILED",
    "CREATIVE_JOB_SUPERSEDED"];

  /* Zustaende, in denen die externe Welt den Job noch bearbeiten kann -
     und in denen ein offener Request-PR weiter Wiederholungen einsammelt. */
  /* -------------------------------------------------------------------
     OFFEN HEISST: NICHT FERTIG

     CREATIVE_JOB_REQUESTED fehlte hier. Ein Job in diesem Zustand hat
     einen geschriebenen Brief und einen Registereintrag - aber noch
     keinen Pull Request. Er zaehlte damit weder als offen noch als
     abgeschlossen, und die Gleichzeitigkeitsgrenze sah ihn nicht.

     Solange ein Mensch den PR von Hand oeffnete, fiel das nicht auf:
     zwischen Registereintrag und PR lagen Sekunden, und es sah jemand
     zu. Sobald der Scheduler das tut, ist genau dieser Zwischenraum
     der Ort, an dem ein Lauf abbrechen kann - und der naechste Lauf
     faende einen Job, der nichts blockiert.

     Der Schluessel-Vergleich haette das nur gefangen, wenn der zweite
     Brief BYTEGLEICH waere. Bei neuem Datenstand ist er das nicht.
     ------------------------------------------------------------------- */
  var OFFEN = ["CREATIVE_JOB_REQUESTED", "CREATIVE_JOB_DISPATCHED",
    "CREATIVE_JOB_IN_FLIGHT", "CREATIVE_JOB_RESULT_AVAILABLE",
    "CREATIVE_JOB_STALE"];

  var UEBERGAENGE = {
    CREATIVE_JOB_REQUESTED: ["CREATIVE_JOB_DISPATCHED", "CREATIVE_JOB_FAILED",
      "CREATIVE_JOB_SUPERSEDED"],
    CREATIVE_JOB_DISPATCHED: ["CREATIVE_JOB_IN_FLIGHT", "CREATIVE_JOB_RESULT_AVAILABLE",
      "CREATIVE_JOB_STALE", "CREATIVE_JOB_FAILED", "CREATIVE_JOB_SUPERSEDED"],
    CREATIVE_JOB_IN_FLIGHT: ["CREATIVE_JOB_RESULT_AVAILABLE", "CREATIVE_JOB_STALE",
      "CREATIVE_JOB_FAILED", "CREATIVE_JOB_SUPERSEDED"],
    CREATIVE_JOB_RESULT_AVAILABLE: ["CREATIVE_JOB_VERIFIED", "CREATIVE_JOB_FAILED",
      "CREATIVE_JOB_SUPERSEDED"],
    CREATIVE_JOB_STALE: ["CREATIVE_JOB_RESULT_AVAILABLE", "CREATIVE_JOB_IN_FLIGHT",
      "CREATIVE_JOB_FAILED", "CREATIVE_JOB_SUPERSEDED"],
    CREATIVE_JOB_VERIFIED: [],
    CREATIVE_JOB_FAILED: [],
    CREATIVE_JOB_SUPERSEDED: []
  };

  /* =====================================================================
     DIE EVIDENZ, DIE EINEN OFFENEN JOB SCHLIESSEN DARF

     ---------------------------------------------------------------------
     WARUM DIESE LISTE CODE IST UND KEIN KOMMENTAR
     ---------------------------------------------------------------------

     Ein Job blieb 51 Stunden auf IN_FLIGHT, obwohl sein Ergebnis seit
     zehn Minuten nach dem Start im Repository lag und das Ledger ihn
     COMPLETED nannte. Der Abschluss wurde an einer Stelle notiert und
     an einer anderen gezaehlt; zwischen beiden gab es keinen Rueckweg.

     Beim Reparieren ist die naechstliegende Versuchung, das Alter zum
     Beweis zu machen: 51 Stunden, also tot. Das ist kein Beweis,
     sondern Ungeduld. PR 105 hat nach elf Stunden noch geliefert.

     Deshalb steht hier eine geschlossene Liste. Was nicht darin steht,
     schliesst keinen Job - und zwar nicht, weil ein Kommentar es
     verbietet, sondern weil `reconcile` es zurueckweist.
     ===================================================================== */
  var EVIDENZ = {
    /* Ein geprueftes Ergebnis mit identischem Schluessel. Die staerkste
       Evidenz, die es gibt: der Job HAT geliefert. */
    RESULT_VERIFIED: "CREATIVE_JOB_VERIFIED",
    /* Das Ledger nennt denselben Schluessel abgeschlossen. Dieselbe
       Tatsache, an der anderen Stelle notiert. */
    LEDGER_COMPLETED: "CREATIVE_JOB_VERIFIED",
    /* Das Ledger hat das Ergebnis abgelehnt. Eine Aussage ueber das
       Ergebnis, und deshalb hier zulaessig. */
    LEDGER_REJECTED: "CREATIVE_JOB_FAILED",
    /* Ein kanonischer Nachfolger nennt diesen Job ausdruecklich als
       Vorgaenger und ist selbst abgeschlossen. Der Job ist damit
       fertig, ohne geliefert zu haben - und ohne gescheitert zu sein. */
    SUPERSEDED_BY_VERIFIED_SUCCESSOR: "CREATIVE_JOB_SUPERSEDED",
    /* -----------------------------------------------------------------
       DER ANLAUF, DER DAS HAUS NIE VERLASSEN HAT

       Am 21.09. wurde ein Job registriert, und sein Request-PR entstand
       nicht: das Repository erlaubte Actions damals nicht, Pull Requests
       zu oeffnen. Der Job stand danach siebzehn Stunden auf
       CREATIVE_JOB_REQUESTED - nach OFFEN zu Recht, denn "Brief
       geschrieben, noch nichts ausgeloest" ist nicht fertig.

       Nur kam nichts nach. Ein Creative Job entsteht, wenn ein Kandidat
       faellig ist; ein Kandidat wird faellig, wenn kein Job offen ist.
       Der Zwischenraum, vor dem der Kommentar bei OFFEN warnt, wurde
       zum Dauerzustand - und weil MAX_OPEN_CREATIVE_JOBS = 1 eine harte
       Invariante ist, stand danach der ganze Betrieb.

       ALTER schliesst ihn auch hier nicht. Was ihn schliesst, ist eine
       Tatsache ueber die AUSSENWELT: es gibt keinen Pull Request zu
       diesem Job. Der PR ist der einzige Weg, auf dem die externe Welt
       von ihm erfaehrt - CREATIVE_JOB_DISPATCHED sagt es woertlich:
       "PR geoeffnet - ab hier laeuft die externe Welt". Ohne ihn hat
       niemand etwas bekommen, niemand etwas begonnen, und es gibt
       nichts, das zurueckkommen koennte.

       Diese Tatsache wird hier NICHT ermittelt: diese Datei urteilt und
       misst nicht. Der Aufrufer reicht sie herein, und fehlt sie, wird
       nicht geschlossen. Eine fehlende Messung ist keine Messung, die
       "nein" sagt.
       ----------------------------------------------------------------- */
    DISPATCH_NIE_ERFOLGT: "CREATIVE_JOB_FAILED"
  };

  /* Was ausdruecklich NICHT genuegt. Steht als Liste da, damit ein
     Aufrufer die Zurueckweisung benannt bekommt statt eines stummen
     "unbekannt". */
  var KEINE_EVIDENZ = ["ALTER", "KEIN_WORK_CHAT", "KEINE_NEUEN_KOMMENTARE",
    "PR_GESCHLOSSEN", "OWNER_VERMUTUNG"];

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
    /* -----------------------------------------------------------------
       DIE GRENZEN, DIE SCHON OHNE PROCESSING KEY GELTEN

       Der Processing Key entsteht erst aus dem fertigen Brief - er
       traegt dessen Blob-SHA. Wer VOR dem Schreiben des Briefs wissen
       will, ob ein Dispatch ueberhaupt in Frage kaeme, kann ihn also
       noch nicht haben.

       Diese Grenzen brauchen ihn nicht: sie haengen am Inhaltsobjekt.
       Sie stehen hier als eigene Funktion, damit der Orchestrator sie
       fragen kann, OHNE dass irgendwo eine zweite Fassung derselben
       Regeln entsteht - mayDispatch ruft genau diese Funktion auf.

       Ausdruecklich: das ist die VORPRUEFUNG. Das letzte Wort hat
       mayDispatch mit dem Schluessel, und zwar unveraendert. Eine
       bestandene Vorpruefung ist keine Erlaubnis.
       ----------------------------------------------------------------- */
    function mayDispatchContent(spec, options) {
      options = options || {};
      spec = spec || {};

      if (!spec.contentId) {
        return { ok: false, reason: "noContentId",
          message: "Ohne content_id laesst sich die Gleichzeitigkeitsgrenze " +
            "nicht pruefen." };
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

    /**
     * Das Tor vor dem Dispatch. Unveraendert in seiner Wirkung: erst
     * der Schluessel, dann alles, was am Inhaltsobjekt haengt.
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

      /* Und alles, was ohne den Schluessel schon gilt. Eine Fassung,
         nicht zwei. */
      return mayDispatchContent(spec, options);
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
      if (options.failureType !== undefined) job.failureType = options.failureType;
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
    /* -----------------------------------------------------------------
       RECONCILE: DEN REGISTERZUSTAND AN DIE EVIDENZ HOLEN

       Nicht ueberschreiben — GEHEN. Der Job laeuft ueber dieselben
       Uebergaenge, die er im Betrieb genommen haette, und jeder
       Schritt schreibt seine History. Ein Sprung von IN_FLIGHT direkt
       auf VERIFIED waere schneller und wuerde verschweigen, dass ein
       Ergebnis vorlag.

       IDEMPOTENT: ist der Job schon terminal, passiert nichts und die
       History bleibt, wie sie ist. Ein zweiter Lauf darf keinen
       zweiten Eintrag erzeugen — sonst waechst die Provenance mit der
       Zahl der Reparaturlaeufe statt mit den Ereignissen.
       ----------------------------------------------------------------- */
    function reconcile(creativeJobId, evidenzArt, options) {
      options = options || {};
      var job = null;
      for (var i = 0; i < bestand.length; i++) {
        if (bestand[i].creativeJobId === creativeJobId) { job = bestand[i]; break; }
      }
      if (!job) {
        return { ok: false, geaendert: false, reason: "unknownJob",
          message: "Unbekannter Job: " + creativeJobId };
      }

      /* Die geschlossene Liste. Alles andere wird benannt abgewiesen. */
      var ziel = EVIDENZ[evidenzArt];
      if (!ziel) {
        return { ok: false, geaendert: false, reason: "inadmissibleEvidence",
          job: job,
          message: KEINE_EVIDENZ.indexOf(evidenzArt) !== -1
            ? evidenzArt + " allein schliesst keinen Job. Es sagt etwas " +
              "darueber, was NICHT beobachtet wurde, und nichts darueber, " +
              "was geschehen ist."
            : "Unbekannte Evidenzart: " + String(evidenzArt) };
      }

      /* DISPATCH_NIE_ERFOLGT traegt Bedingungen, die die uebrigen
         Evidenzarten nicht haben: sie sprechen ueber ein ERGEBNIS, sie
         spricht ueber eine Auslieferung, die nie stattfand. */
      if (evidenzArt === "DISPATCH_NIE_ERFOLGT") {
        var einwand = nieErfolgtEinwand(job, options);
        if (einwand) {
          return { ok: false, geaendert: false, reason: "inadmissibleEvidence",
            job: job, message: einwand };
        }
      }

      if (TERMINAL.indexOf(job.state) !== -1) {
        return { ok: true, geaendert: false,
          reason: job.state === ziel ? "bereitsReconciled" : "bereitsTerminal",
          job: job, from: job.state, to: job.state,
          message: "Der Job ist bereits abgeschlossen (" + job.state + ")." };
      }

      /* Der Weg dorthin, Schritt fuer Schritt ueber erlaubte
         Uebergaenge. Gibt es keinen, wird NICHT gesprungen. */
      var weg = pfadZu(job.state, ziel);
      if (!weg) {
        return { ok: false, geaendert: false, reason: "noLegalPath", job: job,
          message: "Von " + job.state + " fuehrt kein zulaessiger Weg nach " +
            ziel + "." };
      }

      var ausgang = job.state;
      var schritte = [];
      for (var k = 0; k < weg.length; k++) {
        var schrittOptionen = {
          now: options.now,
          note: (options.note ? options.note + " — " : "") +
            "reconciled aus " + evidenzArt +
            (weg.length > 1 ? " (Schritt " + (k + 1) + " von " + weg.length + ")" : "")
        };
        /* DISPATCH_NIE_ERFOLGT schliesst einen Job, der nie gestartet
           ist — beobachtbar an observedStarts: 0. Ohne failureType
           saehe dieser Abschluss aus wie ein Job, der lief und
           scheiterte, und CJ11s reale Invariante (gelaufene
           Fehlschlaege haben >=5 Starts) würde ihn faelschlich
           dorthin zaehlen. CONTRACT_MISMATCH ist derselbe Fall aus
           einem anderen Weg: ein Job, der terminal endet, ohne je
           beobachtbar gelaufen zu sein. */
        if (evidenzArt === "DISPATCH_NIE_ERFOLGT" && weg[k] === ziel) {
          schrittOptionen.failureType = "NEVER_DISPATCHED";
        }
        transition(job.creativeJobId, weg[k], schrittOptionen);
        schritte.push(weg[k]);
      }

      return { ok: true, geaendert: true, reason: "reconciled", job: job,
        from: ausgang,
        to: ziel, steps: schritte, evidence: evidenzArt,
        message: "Ueber " + schritte.join(" -> ") + " aus " + evidenzArt + "." };
    }

    /**
     * Was einem "nie ausgeliefert" widerspricht - und was fehlt.
     *
     * Gibt den Einwand als Satz zurueck oder null, wenn keiner bleibt.
     * Jede einzelne dieser Bedingungen ist ein Beleg dafuer, dass die
     * externe Welt den Job DOCH gesehen haben koennte; eine davon
     * genuegt, um nicht zu schliessen.
     */
    function nieErfolgtEinwand(job, options) {
      if (job.state !== "CREATIVE_JOB_REQUESTED") {
        return "DISPATCH_NIE_ERFOLGT gilt nur fuer CREATIVE_JOB_REQUESTED; " +
          "dieser Job steht auf " + job.state + ". Ab CREATIVE_JOB_DISPATCHED " +
          "hat die externe Welt ihn gesehen, und was sie gesehen hat, " +
          "kann nicht ungesehen gemacht werden.";
      }
      if (options.keinPullRequest !== true) {
        return "Zu DISPATCH_NIE_ERFOLGT fehlt die Messung `keinPullRequest`. " +
          "Ob ein Pull Request existiert, entscheidet diese Datei nicht - " +
          "und unbekannt ist kein Nein.";
      }
      if (job.prNumber !== null && job.prNumber !== undefined) {
        return "Das Register nennt Pull Request #" + job.prNumber +
          ". Dann ist der Job ausgeliefert worden, gleich was eine " +
          "Messung von aussen sagt.";
      }
      if (Array.isArray(job.deliveryIds) && job.deliveryIds.length) {
        return "Der Job hat " + job.deliveryIds.length + " Delivery-ID(s). " +
          "Etwas ist angekommen.";
      }
      if (Number(job.observedStarts) > 0) {
        return "Es wurden " + job.observedStarts + " Start(s) beobachtet. " +
          "Jemand hat begonnen.";
      }
      return null;
    }

    /* Breitensuche ueber UEBERGAENGE. Sie ist hier richtig und nicht
       zu viel: die Maschine hat acht Zustaende, und eine von Hand
       gepflegte Wegtabelle waere die naechste Stelle, die beim
       naechsten Zustand vergessen wird. */
    function pfadZu(von, nach) {
      if (von === nach) return [];
      var schlange = [[von, []]];
      var gesehen = {};
      gesehen[von] = true;
      while (schlange.length) {
        var kopf = schlange.shift();
        var nachbarn = UEBERGAENGE[kopf[0]] || [];
        for (var i = 0; i < nachbarn.length; i++) {
          var n = nachbarn[i];
          if (gesehen[n]) continue;
          var weg = kopf[1].concat([n]);
          if (n === nach) return weg;
          gesehen[n] = true;
          schlange.push([n, weg]);
        }
      }
      return null;
    }

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
      reconcile: reconcile,
      pfadZu: pfadZu,
      all: function () { return bestand.slice(); },
      byKey: byKey, byContent: byContent, openFor: offeneFuer,
      mayDispatch: mayDispatch,
      mayDispatchContent: mayDispatchContent, dispatch: dispatch,
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
    EVIDENZ: EVIDENZ, KEINE_EVIDENZ: KEINE_EVIDENZ,
    UEBERGAENGE: UEBERGAENGE, BUDGET: BUDGET,
    jobId: jobId, istDiagnostisch: istDiagnostisch,
    createRegistry: createRegistry
  };

  if (isNode) module.exports = api;
  else global.VUSocialCreativeJob = api;
})(typeof window !== "undefined" ? window : globalThis);
