/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/production-readiness.js

   EIN GRUENER TEST IST KEIN BETRIEBSZUSTAND

   -------------------------------------------------------------------------
   WARUM ES DIESE DATEI GIBT
   -------------------------------------------------------------------------

   "Produktionsreif" ist bisher ein Eindruck gewesen: die Suite ist
   gruen, der Lauf sieht gut aus, also sollte es gehen. Genau so
   entsteht der Zustand, in dem etwas freigeschaltet wird, weil es
   funktioniert HAT - nicht, weil bewiesen ist, dass es funktioniert.

   Der Auftrag sagt es woertlich: nicht aufgrund eines einzelnen
   gruenen Tests setzen. Also steht hier eine Liste von Bedingungen,
   jede mit dem Beleg, den sie verlangt, und jede einzeln pruefbar.

   -------------------------------------------------------------------------
   DREI ANTWORTEN, NICHT ZWEI
   -------------------------------------------------------------------------

   Jede Bedingung ist ERFUELLT, NICHT_ERFUELLT oder UNGEPRUEFT.
   UNGEPRUEFT ist nicht "wahrscheinlich in Ordnung": es zaehlt wie
   nicht erfuellt und blockiert READY. Diese Datei RECHNET nichts
   selbst - sie bekommt Befunde gereicht und verweigert die Antwort,
   wo keiner vorliegt.

   Das ist dieselbe Regel, die visual-intelligence.js fuer die
   Bildqualitaet hat und evidence-regime.js fuer die Stichprobe: was
   nicht geprueft wurde, hat nicht bestanden.

   -------------------------------------------------------------------------
   WAS DIESE DATEI NICHT TUT
   -------------------------------------------------------------------------

   Sie schaltet nichts frei. READY = true ist eine Feststellung, kein
   Schalter: die Autopublish-Gates liegen in social/config/ und
   aendern sich nur durch einen Commit mit Autor und Begruendung.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  var ZUSTAND = {
    ERFUELLT: "ERFUELLT",
    NICHT_ERFUELLT: "NICHT_ERFUELLT",
    UNGEPRUEFT: "UNGEPRUEFT"
  };

  /* -------------------------------------------------------------------
     DIE ZEHN AUTONOMIE-INVARIANTEN (§6)

     Sie sind bewusst als VERNEINUNGEN formuliert. "Der Betrieb ist
     autonom" laesst sich behaupten; "der Owner startet nichts
     taeglich" laesst sich widerlegen - und nur Widerlegbares ist eine
     Invariante.

     `beleg` sagt, woran man sie misst. Ohne diesen Satz waere jede
     Invariante eine Absichtserklaerung.
     ------------------------------------------------------------------- */
  var AUTONOMIE = [
    { id: "NO_DAILY_OWNER_START",
      claim: "Kein taeglicher Owner-Start noetig.",
      beleg: "Der Zeitplan steht im Workflow (cron), nicht in einer " +
        "Handlung. Der Owner taucht in keinem Schritt vor dem Publishing Gate auf." },
    { id: "NO_MANUAL_TOPIC_SELECTION",
      claim: "Keine manuelle Themenauswahl.",
      beleg: "Themen entstehen aus geclusterten Signalen und dem Slate; " +
        "kein Skript liest eine vom Owner gepflegte Themenliste." },
    { id: "NO_MANUAL_SLATE",
      claim: "Kein manuell gepflegtes Slate.",
      beleg: "social/data/opportunity-slate.json wird erzeugt, nicht editiert - " +
        "es traegt generatedAt und Herkunftsangaben je Thema." },
    { id: "NO_MANUAL_RANKING",
      claim: "Kein manuell angestossenes Ranking.",
      beleg: "Das Ranking laeuft im selben Workflow-Schritt wie der Zyklus." },
    { id: "NO_MANUAL_PERFORMANCE_INGEST",
      claim: "Kein manueller Performance-Abruf.",
      beleg: "Der MESSEN-Schritt laeuft, wenn der Orchestrator ihn entscheidet, " +
        "nicht wenn jemand ihn ausloest." },
    { id: "NO_MANUAL_LEARNING",
      claim: "Kein manuell angestossenes Lernen.",
      beleg: "Lernen und Anpassen stecken im Zyklus und brauchen kein Netz " +
        "und keine Handlung." },
    { id: "NO_MANUAL_CHATGPT_WORK",
      claim: "Keine manuelle ChatGPT-Work-Invocation.",
      /* -----------------------------------------------------------------
         EIN BELEG, DER DURCH UNMOEGLICHKEIT ERFUELLT WAR

         Hier stand sinngemaess: "der Scheduler ruft den Dispatch-Pfad
         nicht auf". Das war wahr - und es belegte die falsche Sache.
         Es zeigte, dass der Scheduler NICHT KANN, nicht dass kein
         Mensch MUSS. Eine Invariante, die von der Abwesenheit einer
         Faehigkeit lebt, sagt ueber Autonomie nichts aus; sie wird in
         dem Moment falsch, in dem die Faehigkeit entsteht - und genau
         dann wird sie gebraucht.

         Der Beleg ist jetzt der umgekehrte: der Scheduler ruft den
         Pfad SELBST auf, gebunden an seine eigene Entscheidung und an
         das Budget. Niemand muss den Request-PR oeffnen.
         ----------------------------------------------------------------- */
      beleg: "Der Scheduler ruft den bestehenden Dispatch-Pfad selbst auf, " +
        "gebunden an eine eigene Entscheidung (nicht an jeden Lauf) und an " +
        "das Budget aus creative-job.js: 1 processing_key -> 1 logischer Job." },
    { id: "NO_MANUAL_IMAGE_MOVING",
      claim: "Kein manuelles Verschieben von Bildern.",
      beleg: "Der Speicherort eines Assets folgt aus seinem SHA-256, nicht aus " +
        "einer Ablage-Entscheidung." },
    { id: "DISABLED_SOURCES_DO_NOT_BLOCK",
      claim: "Abgeschaltete externe Quellen blockieren den Graphen nicht.",
      beleg: "source-registry.js meldet blocksGraph: false; null aktive Sensoren " +
        "sind ein gueltiger Betriebszustand." },
    { id: "MISSING_EXTERNAL_DOES_NOT_PENALISE",
      claim: "Fehlende externe Intelligenz verschlechtert die Bewertung nicht kuenstlich.",
      beleg: "externalInterest erscheint als NOT_ACTIVE ohne Gewicht - nicht als " +
        "0 und nicht als Abdeckungsluecke des Themas." }
  ];

  /* -------------------------------------------------------------------
     DIE HARTEN INVARIANTEN (§7)

     Der Unterschied zu den zehn oben: diese hier duerfen nicht nur
     heute stimmen, sondern auch nicht SETZBAR sein. Ein Zustand, den
     ein Lauf aendern kann, ist keine Invariante, sondern ein
     Vorsatz.
     ------------------------------------------------------------------- */
  var HARTE_INVARIANTEN = [
    { id: "GLOBAL_AUTOPUBLISH_OFF",
      gate: "GLOBAL_AUTOPUBLISH",
      claim: "GLOBAL_AUTOPUBLISH ist aus und kein Scheduler-Pfad schaltet es ein." },
    { id: "VU_SOCIAL_AUTOPUBLISH_OFF",
      gate: "VU_SOCIAL_AUTOPUBLISH",
      claim: "VU_SOCIAL_AUTOPUBLISH ist aus und kein Scheduler-Pfad schaltet es ein." },
    { id: "SCHEDULER_NEVER_PUBLISHES",
      claim: "Der Scheduler veroeffentlicht nicht, gibt nicht frei und lehnt nicht ab." }
  ];

  /* Was der Scheduler DARF. Woertlich aus §7 - und bewusst als Liste,
     damit ein spaeterer Schritt sich daran messen laesst. */
  var SCHEDULER_DARF = ["DISCOVER", "MEASURE", "LEARN", "DECIDE", "CREATE",
    "VALIDATE", "CANDIDATE"];
  var SCHEDULER_DARF_NICHT = ["PUBLISH", "APPROVE", "REJECT",
    "ACTIVATE_EXTERNAL_SOURCE", "ENABLE_AUTOPUBLISH"];

  /* -------------------------------------------------------------------
     DIE ZEHN BEDINGUNGEN FUER SOCIAL_ORCHESTRATOR_PRODUCTION_READY (§13)

     Jede verlangt einen BEFUND, keinen Eindruck. `fordert` benennt den
     Schluessel, unter dem der Befund uebergeben werden muss - fehlt
     er, ist die Bedingung UNGEPRUEFT und READY faellt.
     ------------------------------------------------------------------- */
  var BEDINGUNGEN = [
    { id: "GRAPH_COMPLETE", fordert: "graph",
      frage: "Ist jeder Knoten der Kette im realen Lauf erreichbar - keine " +
        "gebaute Stufe, die niemand aufruft?" },
    { id: "VISUAL_DIRECTION_DERIVED", fordert: "visualDirection",
      frage: "Entsteht die Bildrichtung im realen Lauf aus vorgelagerten " +
        "Zustaenden, ohne Fixtures und ohne Defaults?" },
    { id: "GATES_FAIL_CLOSED", fordert: "gates",
      frage: "Verweigern die Tore bei fehlender Angabe - und traegt jeder " +
        "Fehler seinen eigenen Namen?" },
    { id: "AUTONOMY_INVARIANTS", fordert: "autonomy",
      frage: "Sind alle zehn Autonomie-Invarianten belegt?" },
    { id: "PUBLISHING_GATE_INTACT", fordert: "publishingGate",
      frage: "Steht der Owner am Publishing Gate - und sonst nirgends?" },
    { id: "EXTERNAL_SOURCES_DORMANT", fordert: "externalSources",
      frage: "Ruhen die externen Quellen, ohne Anfragen, ohne Warnungen und " +
        "ohne den Graphen zu blockieren?" },
    { id: "OWN_PERFORMANCE_ACTIVE", fordert: "ownPerformance",
      frage: "Ist die eigene Leistung die aktive Lernquelle, mit ehrlich " +
        "ausgewiesener Stichprobe?" },
    { id: "TEST_PRODUCTION_ISOLATION", fordert: "isolation",
      frage: "Schreibt kein Testlauf in social/data, quant/data oder discover/data?" },
    { id: "CREATIVE_BUDGET_ENFORCED", fordert: "creativeBudget",
      frage: "Gilt 1 processing_key -> hoechstens 1 logischer Creative Job, " +
        "und laufen keine Diagnosejobs im Produktionspfad?" },
    { id: "SUITE_GREEN", fordert: "suites",
      frage: "Sind alle Suiten gruen? Notwendig - und ausdruecklich nicht " +
        "hinreichend, deshalb steht es an letzter Stelle und nicht allein." }
  ];

  function bewerte(befund) {
    if (befund === undefined || befund === null) return ZUSTAND.UNGEPRUEFT;
    if (typeof befund === "boolean") {
      return befund ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT;
    }
    if (typeof befund === "object") {
      if (befund.ok === true) return ZUSTAND.ERFUELLT;
      if (befund.ok === false) return ZUSTAND.NICHT_ERFUELLT;
    }
    return ZUSTAND.UNGEPRUEFT;
  }

  /**
   * Der Reifezustand.
   *
   * `befunde` ist eine Abbildung von `fordert` auf ein Ergebnis:
   * entweder ein Boolean oder ein Objekt mit `ok` und `explanation`.
   * Was fehlt, bleibt UNGEPRUEFT - und UNGEPRUEFT blockiert.
   */
  function pruefe(befunde) {
    befunde = befunde || {};
    var zeilen = BEDINGUNGEN.map(function (b) {
      var roh = befunde[b.fordert];
      var zustand = bewerte(roh);
      return {
        id: b.id,
        state: zustand,
        question: b.frage,
        explanation: (roh && typeof roh === "object" && roh.explanation)
          ? roh.explanation
          : (zustand === ZUSTAND.UNGEPRUEFT
              ? "Kein Befund unter \"" + b.fordert + "\" uebergeben. Ungeprueft " +
                "zaehlt wie nicht erfuellt."
              : null),
        findings: (roh && typeof roh === "object" && Array.isArray(roh.findings))
          ? roh.findings.slice() : []
      };
    });

    var offen = zeilen.filter(function (z) { return z.state !== ZUSTAND.ERFUELLT; });
    var blocker = zeilen.filter(function (z) {
      return z.state === ZUSTAND.NICHT_ERFUELLT; });
    var ungeprueft = zeilen.filter(function (z) {
      return z.state === ZUSTAND.UNGEPRUEFT; });

    return {
      ready: offen.length === 0,
      conditions: zeilen,
      met: zeilen.length - offen.length,
      total: zeilen.length,
      /* Ein UNGEPRUEFTer Punkt ist ein kritischer Blocker: er sagt
         nicht "in Ordnung", sondern "wir wissen es nicht". */
      criticalBlockers: blocker.length + ungeprueft.length,
      blockedBy: blocker.map(function (z) { return z.id; }),
      unverified: ungeprueft.map(function (z) { return z.id; }),
      /* Woertlich: dieser Zustand schaltet nichts frei. */
      enablesPublishing: false,
      explanation: offen.length === 0
        ? "Alle " + zeilen.length + " Bedingungen belegt. READY - und das " +
          "heisst betriebsbereit bis zum Publishing Gate, nicht " +
          "veroeffentlichungsberechtigt."
        : offen.length + " von " + zeilen.length + " offen" +
          (blocker.length ? ", nicht erfuellt: " +
            blocker.map(function (z) { return z.id; }).join(", ") : "") +
          (ungeprueft.length ? ", ungeprueft: " +
            ungeprueft.map(function (z) { return z.id; }).join(", ") : "") + "."
    };
  }

  /**
   * Die zehn Autonomie-Invarianten gegen gereichte Befunde.
   *
   * Dieselbe Regel: was nicht belegt ist, gilt nicht als belegt.
   */
  function autonomie(befunde) {
    befunde = befunde || {};
    var zeilen = AUTONOMIE.map(function (i) {
      var roh = befunde[i.id];
      return {
        id: i.id, claim: i.claim, requiredEvidence: i.beleg,
        state: bewerte(roh),
        evidence: (roh && typeof roh === "object" && roh.evidence) || null,
        explanation: (roh && typeof roh === "object" && roh.explanation) || null
      };
    });
    var offen = zeilen.filter(function (z) { return z.state !== ZUSTAND.ERFUELLT; });
    return {
      ok: offen.length === 0,
      invariants: zeilen,
      proven: zeilen.length - offen.length,
      total: zeilen.length,
      open: offen.map(function (z) { return z.id; }),
      explanation: offen.length === 0
        ? "Alle " + zeilen.length + " Autonomie-Invarianten belegt."
        : offen.length + " von " + zeilen.length + " offen: " +
          offen.map(function (z) { return z.id; }).join(", ") + "."
    };
  }

  /**
   * Die harten Invarianten aus §7.
   *
   * `gates` sind die gelesenen Schalterzustaende, `writers` die Pfade,
   * die sie ueberhaupt schreiben koennten. Ein Schalter, der aus ist,
   * aber von einem Scheduler-Pfad gesetzt werden KANN, ist keine
   * Invariante.
   */
  function hart(spec) {
    spec = spec || {};
    var gates = spec.gates || {};
    var schreiber = spec.schedulerWriters || null;

    var zeilen = HARTE_INVARIANTEN.map(function (i) {
      if (!i.gate) {
        var erlaubt = spec.schedulerActions;
        if (!Array.isArray(erlaubt)) {
          return { id: i.id, claim: i.claim, state: ZUSTAND.UNGEPRUEFT,
            explanation: "Keine Liste der Scheduler-Handlungen uebergeben." };
        }
        var verboten = erlaubt.filter(function (a) {
          return SCHEDULER_DARF_NICHT.indexOf(a) !== -1; });
        return { id: i.id, claim: i.claim,
          state: verboten.length ? ZUSTAND.NICHT_ERFUELLT : ZUSTAND.ERFUELLT,
          explanation: verboten.length
            ? "Der Scheduler fuehrt aus: " + verboten.join(", ") + "."
            : "Der Scheduler fuehrt nur aus: " + erlaubt.join(", ") + "." };
      }
      var an = gates[i.gate];
      if (an === undefined || an === null) {
        return { id: i.id, claim: i.claim, gate: i.gate,
          state: ZUSTAND.UNGEPRUEFT,
          explanation: "Der Zustand von " + i.gate + " wurde nicht gelesen. " +
            "Nicht gelesen ist nicht aus." };
      }
      if (an === true) {
        return { id: i.id, claim: i.claim, gate: i.gate,
          state: ZUSTAND.NICHT_ERFUELLT,
          explanation: i.gate + " ist EINGESCHALTET." };
      }
      if (schreiber === null) {
        return { id: i.id, claim: i.claim, gate: i.gate,
          state: ZUSTAND.UNGEPRUEFT,
          explanation: i.gate + " ist aus - aber es wurde nicht geprueft, ob " +
            "ein Scheduler-Pfad es setzen koennte. Ein Zustand, den ein Lauf " +
            "aendern kann, ist keine Invariante." };
      }
      var setzer = schreiber.filter(function (w) { return w.gate === i.gate; });
      return { id: i.id, claim: i.claim, gate: i.gate,
        state: setzer.length ? ZUSTAND.NICHT_ERFUELLT : ZUSTAND.ERFUELLT,
        writers: setzer.map(function (w) { return w.path; }),
        explanation: setzer.length
          ? i.gate + " ist aus, kann aber gesetzt werden von: " +
            setzer.map(function (w) { return w.path; }).join(", ") + "."
          : i.gate + " ist aus, und kein Scheduler-Pfad schreibt ihn." };
    });

    var offen = zeilen.filter(function (z) { return z.state !== ZUSTAND.ERFUELLT; });
    return {
      ok: offen.length === 0,
      invariants: zeilen,
      open: offen.map(function (z) { return z.id; }),
      schedulerMay: SCHEDULER_DARF.slice(),
      schedulerMayNot: SCHEDULER_DARF_NICHT.slice(),
      explanation: offen.length === 0
        ? "Beide Autopublish-Schalter sind aus und von keinem Scheduler-Pfad " +
          "setzbar; der Scheduler veroeffentlicht nicht."
        : offen.length + " harte Invariante(n) offen: " +
          offen.map(function (z) { return z.id; }).join(", ") + "."
    };
  }

  /* -------------------------------------------------------------------
     KADENZ IST NICHT FREQUENZ (§8)

     Zweimal taeglich ist der Takt, in dem GESCHAUT wird. Wie oft etwas
     entsteht, entscheidet der Orchestrator aus dem Zustand - nicht der
     Zeitplan. Eine Posting-Quote aus der Kadenz abzuleiten hiesse,
     sich eine Zahl auszudenken und sie dann zu erfuellen.
     ------------------------------------------------------------------- */
  function kadenz(spec) {
    spec = spec || {};
    return {
      schedulerRunsPerDay: spec.runsPerDay === undefined ? null : spec.runsPerDay,
      /* Ausdruecklich null und nicht eine Zahl: es gibt keine Quote. */
      publishingFrequency: null,
      publishingFrequencyNote: "Es gibt keine. Ob ein Kandidat entsteht, " +
        "entscheidet der Orchestrator aus dem Zustand; ob er erscheint, " +
        "entscheidet der Owner.",
      schedulerFrequencyEqualsPublishingFrequency: false,
      decisions: ["NO_ACTION", "MEASURE", "LEARN", "PREPARE", "CREATE_CANDIDATE"],
      explanation: "Scheduler-Frequenz ist nicht Publishing-Frequenz. Der Takt " +
        "sagt, wie oft geschaut wird - nicht, wie oft etwas entsteht."
    };
  }

  var api = {
    ZUSTAND: ZUSTAND,
    AUTONOMIE: AUTONOMIE,
    HARTE_INVARIANTEN: HARTE_INVARIANTEN,
    SCHEDULER_DARF: SCHEDULER_DARF,
    SCHEDULER_DARF_NICHT: SCHEDULER_DARF_NICHT,
    BEDINGUNGEN: BEDINGUNGEN,
    pruefe: pruefe,
    autonomie: autonomie,
    hart: hart,
    kadenz: kadenz
  };

  if (isNode) module.exports = api;
  else global.VUSocialProductionReadiness = api;
})(typeof window !== "undefined" ? window : globalThis);
