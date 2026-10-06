/* =========================================================================
   VISION UNIVERSE — realtime/fallback-engine.js

   BEST AVAILABLE DATA FALLBACK ENGINE

   Eine Frage, eine Antwort: welche Datenklasse wird jetzt gezeichnet?

     REALTIME_STREAM -> REALTIME_QUOTE -> INTRADAY -> EOD -> UNAVAILABLE

   Die Engine geht die Leiter von oben nach unten und nimmt die erste
   Klasse, die drei Bedingungen erfuellt: der Zugang gibt sie her
   (Verhandlung), der Abrufweg funktioniert gerade (Laufzeit), und es
   liegen Daten vor (Bestand).

   ZWEI DINGE, DIE HIER AUSDRUECKLICH NICHT PASSIEREN:

   1. Kein stiller Mock-Rueckfall. Das synthetische Modelluniversum ist
      keine Datenklasse dieser Leiter und taucht in ihr nicht auf. Ein
      Chart, der bei fehlenden Kursen erfundene zeichnet, ist schlimmer
      als ein leerer - er sieht richtig aus. Wenn nichts da ist, ist die
      Antwort UNAVAILABLE, und die steht in der Leiter, damit sie ein
      Ergebnis ist und kein Absturz.

   2. Kein stiller Abstieg. Jeder Rueckfall traegt seinen Grund. Die
      Anzeige liest ihn aus - siehe data-status.js. Der Nutzer bekommt
      nie eine schlechtere Datenklasse, ohne dass sich das Etikett
      aendert (§22).

   Die Engine ist rein. Sie ruft nichts ab, oeffnet keine Verbindung und
   haelt keinen Zustand - sie entscheidet nur. Das macht sie vollstaendig
   pruefbar: jedes Szenario der Fallback-Matrix ist ein Aufruf mit
   Eingaben und ein Vergleich der Ausgabe.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var DataClass = isNode ? require("./data-class.js") : global.VURealtime.DataClass;

  var ENGINE_VERSION = "fallback-engine-1.0.0";

  /* Warum eine Klasse ausscheidet. Die Codes sind stabil: die Anzeige und
     die Diagnose lesen sie, und ein umformulierter Freitext waere fuer
     beide eine Aenderung ohne Ankuendigung. */
  var REASONS = {
    capabilityDeclaredMissing: "Der Zugang liefert diese Datenklasse nicht.",
    capabilityUnverified: "Ungeprueft. Eine ungepruefte Faehigkeit ist keine Faehigkeit.",
    gateDisabled: "Die Datenklasse ist nicht freigeschaltet.",
    notLicensed: "Fuer diese Zielgruppe liegt keine Anzeigeerlaubnis vor.",
    internalUseForbidden: "Auch die interne Nutzung ist ausgeschlossen.",
    probeFailed: "Die Pruefung dieser Datenklasse ist gescheitert.",
    transportUnavailable: "Der Abrufweg steht nicht zur Verfuegung.",
    transportFailed: "Der Abrufweg meldet einen Fehler.",
    rateLimited: "Das Anfragekontingent ist erschoepft.",
    timeout: "Der Anbieter hat nicht rechtzeitig geantwortet.",
    noData: "Es liegen keine Daten dieser Klasse vor.",
    stale: "Der vorliegende Stand ist zu alt fuer diese Klasse.",
    suppressed: "Die Datenklasse wurde ausdruecklich ausgeschlossen."
  };

  function reasonText(code) { return REASONS[code] || code || null; }

  /**
   * Waehlt die beste tatsaechlich verfuegbare Datenklasse.
   *
   * @param {object} input
   *   negotiation  Ergebnis aus capability-negotiation.js (Pflicht)
   *   runtime      {KLASSE: {ok: bool, reason, message}} - Zustand des
   *                Abrufwegs. Fehlt ein Eintrag, gilt der Weg als
   *                verfuegbar: die Verhandlung hat bereits entschieden,
   *                dass die Klasse grundsaetzlich geht.
   *   inventory    {KLASSE: {bars: n, lastTimestamp}} - liegt ueberhaupt
   *                etwas vor? Fehlt der Eintrag, wird nicht auf Bestand
   *                geprueft (Auswahl vor dem ersten Abruf).
   *   staleness    {KLASSE: {level}} - ein STALE-Stand disqualifiziert
   *                die Klasse; MARKET_CLOSED nicht.
   *   suppress     [KLASSE] - vom Aufrufer ausgeschlossen, etwa waehrend
   *                eines laufenden Wiederaufbaus.
   *   minBars      Mindestzahl Bars, damit ein Bestand zaehlt (Standard 1)
   *
   * @returns {object} {selected, reason, ladder, downgradedFrom, version}
   */
  function select(input) {
    input = input || {};
    var negotiation = input.negotiation || { order: [], classes: {} };
    var runtime = input.runtime || {};
    var inventory = input.inventory || null;
    var staleness = input.staleness || {};
    var suppress = input.suppress || [];
    var minBars = input.minBars === undefined ? 1 : input.minBars;

    var ladder = [];
    var selected = null;
    var selectedReason = null;

    negotiation.order.forEach(function (dc) {
      var finding = negotiation.classes[dc] || DataClass.finding(dc, "UNKNOWN", "capabilityUnverified");
      var row = {
        dataClass: dc,
        state: finding.state,
        eligible: false,
        reason: null,
        message: null
      };

      if (suppress.indexOf(dc) !== -1) {
        row.reason = "suppressed";
      } else if (!finding.usable) {
        row.reason = finding.reason || "capabilityUnverified";
        row.message = finding.message || null;
      } else {
        var rt = runtime[dc];
        if (rt && rt.ok === false) {
          row.reason = rt.reason || "transportFailed";
          row.message = rt.message || null;
        } else if (inventory && inventory[dc] !== undefined) {
          var inv = inventory[dc] || {};
          var count = typeof inv.bars === "number" ? inv.bars : (inv.available ? minBars : 0);
          if (count < minBars) row.reason = "noData";
        }
        if (!row.reason) {
          var st = staleness[dc];
          if (st && st.level === "STALE") row.reason = "stale";
        }
        row.eligible = !row.reason;
      }

      if (row.reason && !row.message) row.message = reasonText(row.reason);
      ladder.push(row);

      if (row.eligible && selected === null) selected = dc;
    });

    var blocked = ladder.filter(function (r) { return r.reason; });
    if (selected === null) {
      selected = DataClass.TERMINAL_CLASS;
      /* Der bindende Grund fuer UNAVAILABLE ist der der letzten Sprosse,
         nicht der der ersten. Dass Realtime ungeprueft ist, erklaert
         keinen leeren Chart - dass auch die Tagesschlusskurse fehlen,
         erklaert ihn. Der Grund der obersten Sprosse steht daneben, denn
         er beantwortet die andere Frage: warum laeuft kein Live-Chart? */
      selectedReason = blocked.length ? blocked[blocked.length - 1].reason : "noDataAvailable";
    }

    /* Die beste Klasse, die dieser Zugang ueberhaupt hergibt.
       Nicht die oberste Sprosse: dass ein Anbieter kein WebSocket
       anbietet, ist kein Abstieg, sondern seine Bauart. Ein Abstieg ist
       nur, was zur Laufzeit verloren geht - und genau das soll die
       Anzeige benennen (§22). */
    var attainable = ladder.filter(function (r) { return r.state === "AVAILABLE"; });
    var bestPossible = attainable.length ? attainable[0].dataClass : null;
    var preferred = ladder.length ? ladder[0].dataClass : null;
    return {
      version: ENGINE_VERSION,
      selected: selected,
      reason: selectedReason,
      message: selectedReason ? reasonText(selectedReason) : null,
      ladder: ladder,
      preferred: preferred,
      bestPossible: bestPossible,
      downgraded: bestPossible !== null && selected !== bestPossible,
      downgradedFrom: bestPossible !== null && selected !== bestPossible ? bestPossible : null,
      /* Warum nicht die beste Klasse? Getrennt vom bindenden Grund oben. */
      topBlockedReason: blocked.length ? blocked[0].reason : null,
      topBlockedClass: blocked.length ? blocked[0].dataClass : null,
      /* Die naechstbessere Klasse, die nur an einem Laufzeitgrund
         scheitert - der Kandidat fuer den Wiederaufstieg (§11). */
      recoverable: ladder.filter(function (r) {
        return !r.eligible && r.state === "AVAILABLE" &&
               ["transportFailed", "transportUnavailable", "rateLimited",
                "timeout", "stale", "noData", "suppressed"].indexOf(r.reason) !== -1;
      }).map(function (r) { return r.dataClass; })
    };
  }

  /**
   * Hat sich die Auswahl gegenueber der vorherigen verschlechtert?
   * Die Anzeige braucht die Antwort, um einen Abstieg zu benennen statt
   * ihn stillschweigend zu vollziehen (§22).
   */
  function compare(previous, current) {
    var from = previous && previous.selected ? previous.selected : null;
    var to = current && current.selected ? current.selected : null;
    if (!from || !to || from === to) {
      return { changed: false, direction: "none", from: from, to: to };
    }
    var better = DataClass.isBetter(to, from);
    return {
      changed: true,
      direction: better ? "upgrade" : "downgrade",
      from: from, to: to,
      reason: (current.ladder.filter(function (r) {
        return r.dataClass === from; })[0] || {}).reason || current.reason || null
    };
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION,
    REASONS: REASONS,
    reasonText: reasonText,
    select: select,
    compare: compare
  };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.FallbackEngine = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
