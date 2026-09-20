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

    /* Mindestabstand zwischen zwei Kandidaten. Eine Owner-Groesse:
       wie oft ein Kanal senden soll, entscheidet keine Maschine. */
    var minAbstand = zahl(options.minHoursBetweenCandidates, 24);
    /* Wie oft gemessen wird, wenn nichts faellig ist. Messen ist
       billig und lesend - der Abstand darf klein sein. */
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
    var seitKandidat = zustand.lastPreparedAt
      ? stunden(zustand.lastPreparedAt, now) : null;
    var kandidatFaellig = seitKandidat === null || seitKandidat >= minAbstand;

    if (kandidatFaellig) {
      handlungen.push({
        stage: STAGE.PREPARE_CANDIDATE,
        reason: seitKandidat === null
          ? "Noch kein Kandidat entstanden."
          : "Letzter Kandidat vor " + Math.round(seitKandidat) + " h " +
            "(Mindestabstand " + minAbstand + " h)."
      });
      return {
        stage: STAGE.PREPARE_CANDIDATE,
        actions: handlungen,
        awaitingOwner: false,
        explanation: "Es wird ein Kandidat vorbereitet. Er endet am " +
          "Publishing Gate und wird nicht veroeffentlicht."
      };
    }

    if (handlungen.length) {
      return {
        stage: STAGE.MEASURE,
        actions: handlungen,
        awaitingOwner: false,
        explanation: "Nur messen. Der Mindestabstand bis zum naechsten " +
          "Kandidaten ist noch nicht erreicht (" +
          Math.round(minAbstand - (seitKandidat || 0)) + " h)."
      };
    }

    return {
      stage: STAGE.IDLE,
      actions: [],
      awaitingOwner: false,
      explanation: "Nichts faellig. Das ist eine Antwort und kein Grund, " +
        "etwas zu erzeugen."
    };
  }

  /**
   * Der Betriebsplan: was laeuft automatisch, was bleibt beim Owner.
   *
   * Exportiert, damit die Zusicherung pruefbar ist - und damit man sie
   * lesen kann, ohne den Workflow zu lesen.
   */
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
    naechsteHandlung: naechsteHandlung,
    betriebsmodell: betriebsmodell
  };

  if (isNode) module.exports = api;
  else global.VUSocialOrchestrator = api;
})(typeof window !== "undefined" ? window : globalThis);
