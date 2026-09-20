/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/orchestrator.js

   WAS IST JETZT DRAN — UND WAS WARTET AUF EINEN MENSCHEN

   -------------------------------------------------------------------------
   AUTONOM HEISST NICHT UNBEAUFSICHTIGT
   -------------------------------------------------------------------------

   Der Owner soll nicht mehr regelmaessig Themen auswaehlen, Signale
   sammeln, Slates erzeugen, Rankings starten, Bilder verschieben oder
   Lernlaeufe anstossen. Er soll an genau einer Stelle stehen: am
   PUBLISHING GATE.

   Damit das haelt, braucht es eine Stelle, die bei jedem Lauf sagt, was
   dran ist. Ohne sie tut ein Zeitplan entweder immer dasselbe oder
   alles - beides ist kein Betrieb.

   Diese Datei entscheidet, sie fuehrt nicht aus. Sie kennt keine
   Dateien, keine Skripte und kein Netz; sie bekommt den Zustand und
   gibt die naechste Handlung zurueck. Das macht sie pruefbar, und
   pruefbar ist die Bedingung dafuer, dass ihr jemand einen Zeitplan
   anvertraut.

   -------------------------------------------------------------------------
   DIE REIHENFOLGE IST NICHT BELIEBIG
   -------------------------------------------------------------------------

   MESSEN kommt vor VORBEREITEN. Ein Kandidat, der entsteht, bevor die
   Zahlen des letzten Beitrags da sind, lernt aus einem Stand von
   gestern - und der Fehler faellt nie auf, weil das Ergebnis trotzdem
   plausibel aussieht.

   WARTEN schlaegt VORBEREITEN. Liegt ein Kandidat beim Owner, entsteht
   kein zweiter. Zwei wartende Kandidaten sind keine Auswahl, sondern
   eine Warteschlange, die der Owner abarbeiten muss - genau das, was
   dieser Betrieb ihm abnehmen soll.

   NICHTS schlaegt ALLES. Gibt es nichts zu tun, ist IDLE die Antwort
   und kein Grund, etwas zu erzeugen.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  var STAGE = {
    /* Der Rueckweg: Zahlen holen, lernen, anpassen. */
    MEASURE: "MEASURE",
    /* Der Hinweg: Signale, Slate, Ranking, Story, Hook, Visual, Kandidat. */
    PREPARE_CANDIDATE: "PREPARE_CANDIDATE",
    /* Der Mensch ist dran. Das System tut nichts ausser messen. */
    AWAITING_OWNER_GATE: "AWAITING_OWNER_GATE",
    /* Ein Schalter steht auf Halt. */
    HALTED: "HALTED",
    /* Nichts faellig. */
    IDLE: "IDLE"
  };

  /* Handlungen, die dieser Orchestrator NIE ausloest - ganz gleich,
     welchen Zustand er sieht. Sie stehen hier und nicht in einem
     Kommentar, damit ein Test sie halten kann. */
  var NIEMALS = ["PUBLISH", "APPROVE", "REJECT", "ACTIVATE_EXTERNAL_SOURCE",
    "ENABLE_AUTOPUBLISH"];

  function zahl(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function stunden(a, b) {
    var x = Date.parse(a), y = Date.parse(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return (y - x) / 3600000;
  }

  /**
   * Was ist jetzt dran?
   *
   * @param zustand {
   *   now                 Zeitpunkt
   *   halted              Kill Switch / Autonomiestufe blockiert
   *   haltReason          warum
   *   awaitingCandidates  Kandidaten im Zustand AWAITING_APPROVAL
   *   dueMeasurements     Beitraege, deren Messfenster faellig ist
   *   lastPreparedAt      wann zuletzt ein Kandidat entstand
   *   lastMeasuredAt      wann zuletzt gemessen wurde
   * }
   */
  function naechsteHandlung(zustand, options) {
    zustand = zustand || {};
    options = options || {};
    var now = zustand.now || new Date().toISOString();

    /* -----------------------------------------------------------------
       DIE KADENZ WIRD HEREINGEREICHT, NICHT HIER GERECHNET

       Hier stand `zahl(options.minHoursBetweenCandidates, 24)`: EINE
       Zahl fuer eine Frage, die drei hat. Wie oft geprueft wird, wie
       oft ein Kandidat entsteht und wie oft veroeffentlicht wird sind
       verschiedene Groessen - und die 24 stand im Code, waehrend in
       der Konfiguration eine 20 fuer Beitraege stand. Zwei Zahlen fuer
       zwei Fragen, von denen nur eine einen Namen hatte.

       Die Entscheidung liegt jetzt in content-cadence.js. Sie kennt
       den Kalendertag, die Tagesabsicht, den Abstand, die
       Warteschlange und das Creative-Budget. Diese Engine liest ihr
       ERGEBNIS und rechnet es nicht nach: zwei Rechnungen fuer
       dieselbe Frage gehen auseinander, und die erste, die abweicht,
       gewinnt per Zufall.

       OHNE KADENZ ENTSTEHT NICHTS. Kein Rueckfall auf eine Vorgabe:
       eine Zahl, die einspringt, wenn die Engine fehlt, ist genau der
       zweite Rechenweg, den es hier nicht mehr geben soll. */
    var kadenz = options.cadence || null;

    /* Wie oft gemessen wird, wenn nichts faellig ist. Messen ist
       billig und lesend - der Abstand darf klein sein. Das ist KEINE
       Content-Frequenz und wird bewusst nicht mit ihr vermengt. */
    var messAbstand = zahl(options.minHoursBetweenMeasurements, 6);

    var warten = (zustand.awaitingCandidates || []).length;
    var faellig = (zustand.dueMeasurements || []).length;

    /* ----------------------------------------------------------------
       HALT schlaegt alles. Ein Schalter, den man uebergehen kann, ist
       keiner. */
    if (zustand.halted) {
      return {
        stage: STAGE.HALTED,
        actions: [],
        awaitingOwner: false,
        explanation: "Angehalten: " + (zustand.haltReason || "kein Grund vermerkt") +
          ". Es wird nichts vorbereitet und nichts gemessen."
      };
    }

    var handlungen = [];

    /* ----------------------------------------------------------------
       MESSEN VOR VORBEREITEN

       Ein Kandidat, der vor den Zahlen entsteht, lernt aus dem Stand
       von gestern - und das faellt nie auf, weil das Ergebnis
       plausibel aussieht. */
    var seitMessung = zustand.lastMeasuredAt
      ? stunden(zustand.lastMeasuredAt, now) : null;
    var messenFaellig = faellig > 0 ||
      seitMessung === null || seitMessung >= messAbstand;
    if (messenFaellig) {
      handlungen.push({
        stage: STAGE.MEASURE,
        reason: faellig > 0
          ? faellig + " Beitrag/Beitraege mit faelligem Messfenster."
          : seitMessung === null
            ? "Noch nie gemessen."
            : "Letzte Messung vor " + Math.round(seitMessung) + " h."
      });
    }

    /* ----------------------------------------------------------------
       WARTEN SCHLAEGT VORBEREITEN

       Zwei wartende Kandidaten sind keine Auswahl, sondern eine
       Warteschlange - genau das, was dieser Betrieb dem Owner
       abnehmen soll. */
    if (warten > 0) {
      return {
        stage: STAGE.AWAITING_OWNER_GATE,
        actions: handlungen,
        awaitingOwner: true,
        awaitingCandidateIds: (zustand.awaitingCandidates || [])
          .map(function (c) { return c.candidateId || c.id || null; }),
        explanation: warten + " Kandidat(en) warten auf die Owner-Freigabe. " +
          "Es entsteht kein weiterer." +
          (handlungen.length ? " Gemessen wird weiter - das braucht keine " +
            "Freigabe und darf nicht warten." : "")
      };
    }

    /* ---------------------------------------------------------------- */
    if (!kadenz) {
      /* Fail closed. Eine fehlende Kadenzentscheidung ist etwas anderes
         als eine verneinende, und sie darf nicht wie eine bejahende
         wirken. */
      if (handlungen.length) {
        return {
          stage: STAGE.MEASURE, actions: handlungen, awaitingOwner: false,
          cadence: null,
          explanation: "Nur messen. Es liegt keine Kadenzentscheidung vor — " +
            "ohne sie entsteht kein Kandidat."
        };
      }
      return {
        stage: STAGE.IDLE, actions: [], awaitingOwner: false, cadence: null,
        explanation: "Es liegt keine Kadenzentscheidung vor. Ohne sie entsteht " +
          "kein Kandidat — und geraten wird sie nicht."
      };
    }

    if (kadenz.darfErzeugen) {
      handlungen.push({
        stage: STAGE.PREPARE_CANDIDATE,
        reason: kadenz.erklaerung
      });
      return {
        stage: STAGE.PREPARE_CANDIDATE,
        actions: handlungen,
        awaitingOwner: false,
        cadence: kadenz,
        explanation: "Es wird ein Kandidat vorbereitet (" +
          (kadenz.lage ? kadenz.lage.ordinal : "?") + ". des Tages). Er endet am " +
          "Publishing Gate und wird nicht veroeffentlicht."
      };
    }

    if (handlungen.length) {
      return {
        stage: STAGE.MEASURE,
        actions: handlungen,
        awaitingOwner: false,
        cadence: kadenz,
        explanation: "Nur messen. " + kadenz.erklaerung
      };
    }

    /* -----------------------------------------------------------------
       KEIN KANDIDAT - UND DER GRUND STEHT DABEI

       Hier stand IDLE mit "nichts faellig". Das war als
       Betriebszustand richtig und als TAGESENTSCHEIDUNG zu wenig: es
       beantwortet "warum heute keiner" mit "eben nicht". Der Grund
       kommt aus der Kadenz und hat einen Namen. */
    return {
      stage: STAGE.IDLE,
      actions: [],
      awaitingOwner: false,
      cadence: kadenz,
      reasonCode: kadenz.grund,
      explanation: kadenz.erklaerung
    };
  }

  /**
   * Der Betriebsplan: was laeuft automatisch, was bleibt beim Owner.
   *
   * Exportiert, damit die Zusicherung pruefbar ist - und damit man sie
   * lesen kann, ohne den Workflow zu lesen.
   */

  /* -------------------------------------------------------------------
     DIE CREATIVE-JOB-ENTSCHEIDUNG (§3)

     Bis hierher war der Dispatch das letzte Owner Gate, das keines
     sein sollte: ein Mensch musste den Request-PR oeffnen. Der Owner
     stand damit an zwei Stellen statt an einer.

     Diese Funktion beantwortet die Frage, die davor liegt: BRAUCHT
     dieser Lauf ueberhaupt einen Creative Job? Sie erfindet den Bedarf
     nicht - sie liest ihn aus Zustaenden, die ohnehin dastehen.

     WARUM SIE HIER STEHT UND NICHT IN EINER NEUEN ENGINE

     Weil "was ist jetzt dran" bereits hier entschieden wird. Eine
     zweite Entscheidungsstelle waere eine zweite Wahrheit darueber,
     was der Betrieb als naechstes tut - und die erste, die von der
     anderen abweicht, gewinnt per Zufall.

     WAS SIE NICHT TUT

     Sie rechnet das Budget nicht selbst. Die Grenzen stehen in
     creative-job.js und werden dort geprueft; hier wird das ERGEBNIS
     dieser Pruefung gelesen. Zwei Rechenwege fuer dieselbe Grenze
     waeren genau der Fehler, den das Budget verhindern soll.
     ------------------------------------------------------------------- */

  /* Warum KEIN Creative Job noetig ist. Jeder Grund ist eine eigene
     Aussage - "nicht noetig" ist die Zusammenfassung, nicht der
     Befund. */
  var KEIN_JOB = {
    NO_CANDIDATE_DUE: "Es ist kein Kandidat faellig. Ein Creative Job ohne " +
      "Kandidatenbedarf verbraucht eine begrenzte Ressource fuer nichts.",
    RESULT_ALREADY_PRESENT: "Zu diesem Inhalt liegt bereits ein Ergebnis vor. " +
      "Es zu wiederholen hiesse, dieselbe Arbeit zweimal zu bestellen.",
    JOB_IN_FLIGHT: "Zu diesem Inhalt laeuft bereits ein Job. Ein neuer " +
      "Scheduler-Lauf ist kein Grund fuer eine zweite Anfrage.",
    ANOTHER_JOB_OPEN: "Irgendwo laeuft noch ein Creative Job. ChatGPT Work " +
      "ist eine begrenzte Ressource, und ihre Wiederholung bei einem " +
      "scheiternden Lauf ist von hier aus nicht beschraenkbar - also " +
      "hoechstens einer gleichzeitig.",
    EVIDENCE_INSUFFICIENT: "Die Evidenz traegt noch keine Geschichte. Ein " +
      "hoher Score allein ist keine.",
    NO_CONTENT_OBJECT: "Kein Inhaltsobjekt bestimmt - ohne content_id gibt es " +
      "nichts zu bestellen.",
    BUDGET: "Das Budget laesst diesen Dispatch nicht zu.",
    HALTED: "Angehalten. Es wird nichts bestellt."
  };

  /**
   * Braucht dieser Lauf einen Creative Job?
   *
   * `spec`:
   *   halted              der Kill Switch
   *   candidateDue        entscheidet naechsteHandlung, nicht diese Funktion
   *   contentId           das Inhaltsobjekt, um das es ginge
   *   hasAuthoringResult  liegt bereits ein Ergebnis auf der Platte?
   *   openJobs            offene Jobs zu diesem Inhalt (aus creative-job.js)
   *   evidenceSufficient  Ergebnis des bestehenden Hinlaenglichkeitstors
   *   dispatchGate        Ergebnis von registry.mayDispatch(...)
   *
   * Die Reihenfolge der Pruefungen ist nicht beliebig: sie geht vom
   * Billigsten zum Teuersten und vom Allgemeinsten zum Besonderen,
   * damit der gemeldete Grund der ERSTE zutreffende ist und nicht der
   * zufaellig zuletzt gepruefte.
   */
  function creativeJobDecision(spec) {
    spec = spec || {};

    function nein(code, detail) {
      return {
        required: false,
        decision: "NO_CREATIVE_JOB",
        code: code,
        contentId: spec.contentId || null,
        explanation: KEIN_JOB[code] + (detail ? " " + detail : "")
      };
    }

    if (spec.halted === true) return nein("HALTED");
    if (spec.candidateDue !== true) return nein("NO_CANDIDATE_DUE");
    if (!spec.contentId) return nein("NO_CONTENT_OBJECT");
    if (spec.hasAuthoringResult === true) return nein("RESULT_ALREADY_PRESENT");

    var offen = Array.isArray(spec.openJobs) ? spec.openJobs : [];
    if (offen.length > 0) {
      return nein("JOB_IN_FLIGHT", "Offen: " + offen.map(function (j) {
        return (j.creativeJobId || "?") + " (" + (j.state || "?") + ")";
      }).join(", ") + ".");
    }

    /* -----------------------------------------------------------------
       HOECHSTENS EIN OFFENER JOB — UEBERHAUPT

       Das Budget in creative-job.js begrenzt je processing_key und je
       content_id. Das ist richtig und reicht nicht.

       Gemessen (VU_CREATIVE_TRIGGER_PRODUCTION_READINESS.md, 8 Jobs,
       32 sichtbare Starts): ein SCHEITERNDER Work-Lauf wird
       anbieterintern wiederholt, ohne beobachtbare Obergrenze - PR 105
       meldete nach 11 h 13 min noch. Ein Abbruchsignal, das VU senden
       koennte, gibt es nicht.

       Solange ein Mensch den Request-PR oeffnete, war er in genau dem
       Moment anwesend, in dem dieser Zweig beginnen kann. Der Scheduler
       ist es nicht. Die einzige Grenze, die VU dann noch selbst
       garantieren kann, ist die Anzahl gleichzeitig offener Jobs - und
       die ist hier eins.

       Das geht ueber die Buchstaben des Auftrags hinaus (er nennt
       processing_key und content_id) und folgt seinem Satz: autonom
       bedeutet nicht unbegrenzt.
       ----------------------------------------------------------------- */
    var alleOffen = Array.isArray(spec.allOpenJobs) ? spec.allOpenJobs : null;
    if (alleOffen && alleOffen.length > 0) {
      return nein("ANOTHER_JOB_OPEN", "Offen: " + alleOffen.map(function (j) {
        return (j.creativeJobId || "?") + " zu " + (j.contentId || "?");
      }).join(", ") + ".");
    }

    /* Fail closed: ohne ausdrueckliche Hinlaenglichkeit wird nicht
       bestellt. Nicht geprueft ist nicht hinreichend. */
    if (spec.evidenceSufficient !== true) return nein("EVIDENCE_INSUFFICIENT");

    /* Das Budget hat das letzte Wort, und es rechnet woanders. */
    var tor = spec.dispatchGate;
    if (!tor || tor.ok !== true) {
      return nein("BUDGET", tor && tor.message
        ? "(" + (tor.reason || "?") + ") " + tor.message
        : "Kein Ergebnis des Budgettors uebergeben - ungeprueft ist nicht frei.");
    }

    return {
      required: true,
      decision: "CREATIVE_JOB_REQUIRED",
      code: null,
      contentId: spec.contentId,
      explanation: "Ein Kandidat ist faellig, zu " + spec.contentId + " liegt " +
        "kein Ergebnis und kein offener Job vor, die Evidenz traegt eine " +
        "Geschichte, und das Budget laesst den Dispatch zu."
    };
  }

  function betriebsmodell(quellenStatus) {
    var extern = quellenStatus || {};
    return {
      automatic: [
        "DISCOVER (Signale aus Quant, Discover, Magazin, Reports)",
        "SELECT (Slate und Opportunity Ranking)",
        "AUDIENCE FRAME",
        "RESEARCH / STORY / HOOK",
        "VISUAL STRATEGY und Rendering",
        "CREATE (Paket und Kandidat)",
        "VALIDATE (Qualitaets- und Faktengates)",
        "MEASURE (Insights des eigenen Kontos)",
        "LEARN (Beobachtungen je Lerndimension)",
        "ADAPT (Strategie, nur wenn die Evidenz traegt)"
      ],
      ownerOnly: [
        "PUBLISHING GATE (Freigabe oder Ablehnung eines Kandidaten)",
        "Aktivierung externer Quellen",
        "Aenderung der Autonomiestufe",
        "Strategische Owner-Gates"
      ],
      neverAutomatic: NIEMALS.slice(),
      externalSources: extern.externalIntelligence || null,
      /* Der Satz, auf den es ankommt: ohne externe Quelle laeuft das
         hier vollstaendig weiter. */
      requiresExternalSource: false,
      explanation: "Der Owner steht am Publishing Gate. Alles davor und " +
        "alles danach laeuft ohne ihn - auch ohne jede externe Quelle."
    };
  }

  var api = {
    STAGE: STAGE,
    NIEMALS: NIEMALS,
    KEIN_JOB: KEIN_JOB,
    naechsteHandlung: naechsteHandlung,
    creativeJobDecision: creativeJobDecision,
    betriebsmodell: betriebsmodell
  };

  if (isNode) module.exports = api;
  else global.VUSocialOrchestrator = api;
})(typeof window !== "undefined" ? window : globalThis);
