/* =========================================================================
   VISION UNIVERSE — realtime/session-policy.js

   Welche Handelssitzung laeuft gerade, und duerfen wir sie bedienen?

   Zwei Fragen, die getrennt bleiben muessen:

     WELCHE SITZUNG?   Antwortet der Kalender (market-hours.js). Das ist
                       eine Tatsache ueber die Boerse und haengt an keinem
                       Anbieter.
     BEDIENEN WIR SIE? Antwortet diese Datei. Das haengt am Zugang, am
                       Tarif und daran, ob es jemand gemessen hat.

   WARUM DAS NICHT DIE DATENKLASSEN-LEITER VERDOPPELT

   Die naheliegende Loesung waere gewesen, die Leiter zu spiegeln:
   REALTIME_STREAM_EXTENDED, REALTIME_QUOTE_EXTENDED und so weiter. Das
   waere ein zweiter Stapel neben dem bestehenden, mit doppelten
   Uebergaengen und doppelten Tests - und mit der Gewissheit, dass die
   beiden Haelften irgendwann auseinanderlaufen.

   Die Sitzung ist keine Datenklasse. Sie ist eine zweite Achse:

                 PRE_MARKET   REGULAR   AFTER_HOURS   CLOSED
     REALTIME_*      ?           ✓            ?          –
     INTRADAY        ?           ✓            ?          –
     EOD             ✓           ✓            ✓          ✓

   Die Leiter bleibt, wie sie ist. Diese Datei sagt der Verhandlung nur,
   welche Sprossen in der GERADE LAUFENDEN Sitzung ueberhaupt in Frage
   kommen. Faellt eine Sprosse dadurch weg, greift derselbe Rueckfall wie
   bei einem Netzfehler - und derselbe Test deckt ihn ab.

   DIE REGEL, DIE HIER GILT

   Eine erweiterte Sitzung wird nur bedient, wenn der Zugang das
   nachweislich kann. `extendedHours` ungeprueft heisst: waehrend der
   Vor- und Nachboerse gibt es keine Live-Klasse, sondern den letzten
   bestaetigten Stand - sichtbar benannt. Es heisst NICHT, dass der Chart
   leer wird, und es heisst erst recht nicht, dass ein Kurs von gestern
   Abend als aktuell durchgeht.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var MarketHours = isNode ? require("./market-hours.js") : global.VURealtime.MarketHours;
  var DataClass = isNode ? require("./data-class.js") : global.VURealtime.DataClass;
  var Capabilities = isNode ? require("../capabilities.js") : global.VUCapabilities;

  var POLICY_VERSION = "session-policy-1.0.0";

  /* Die Sitzungen, wie das Produkt sie benennt. Der Kalender kennt
     PRE/REGULAR/AFTER/CLOSED; diese Namen sind dieselben Sachverhalte in
     der Schreibweise, die nach aussen geht. Eine Uebersetzungstabelle
     statt zweier Wahrheiten. */
  var SESSIONS = ["PRE_MARKET", "REGULAR", "AFTER_HOURS", "CLOSED"];

  var FROM_PHASE = {
    PRE: "PRE_MARKET",
    REGULAR: "REGULAR",
    AFTER: "AFTER_HOURS",
    CLOSED: "CLOSED"
  };

  var LABELS = {
    PRE_MARKET: "PRE-MARKET",
    REGULAR: "REGULAR",
    AFTER_HOURS: "AFTER-HOURS",
    CLOSED: "GESCHLOSSEN"
  };

  /* Welche Sitzungen gelten als erweitert. CLOSED ist keine erweiterte
     Sitzung - da handelt niemand, und ein Zugang, der sie "bedient",
     liefert bestenfalls den letzten Kurs von vorhin. */
  var EXTENDED = ["PRE_MARKET", "AFTER_HOURS"];

  function isExtended(session) { return EXTENDED.indexOf(session) !== -1; }
  function sessionOf(phase) { return FROM_PHASE[phase] || "CLOSED"; }
  function labelOf(session) { return LABELS[session] || String(session); }

  /**
   * Der Sitzungsbefund zu einem Zeitpunkt, in Produktschreibweise.
   * Duenne Huelle um market-hours.js - der Kalender bleibt die eine
   * Quelle fuer Zeitzone, Feiertag und verkuerzten Schluss.
   */
  function sessionAt(when, opts) {
    var s = MarketHours.sessionAt(when, opts);
    return {
      session: sessionOf(s.phase),
      label: labelOf(sessionOf(s.phase)),
      phase: s.phase,
      isExtended: isExtended(sessionOf(s.phase)),
      isOpen: s.isOpen,
      isTradingDay: s.isTradingDay,
      closedReason: s.closedReason,
      exchange: s.exchange,
      timezone: s.timezone,
      localDate: s.localDate,
      localTime: s.localTime,
      earlyClose: s.earlyClose,
      calendarCoverage: s.calendarCoverage,
      calendarId: s.calendarId
    };
  }

  /**
   * Deckt der Zugang die erweiterten Zeiten ab?
   *
   * Drei Zustaende, wie ueberall: belegt, ausgeschlossen, ungeprueft.
   * `realtime` beantwortet die zweite Frage aus capabilities.js - ob die
   * Daten waehrend der erweiterten Sitzung auch aktuell sind, und nicht
   * nur irgendwann nachgereicht werden.
   */
  function extendedSupport(capabilities) {
    var bars = capabilities
      ? (Capabilities.supports(capabilities, "market", "extendedHours") ? "AVAILABLE"
        : Capabilities.explicitlyMissing(capabilities, "market", "extendedHours") ? "UNAVAILABLE"
        : "UNKNOWN")
      : "UNKNOWN";
    var live = capabilities
      ? (Capabilities.supports(capabilities, "market", "extendedHoursRealtime") ? "AVAILABLE"
        : Capabilities.explicitlyMissing(capabilities, "market", "extendedHoursRealtime") ? "UNAVAILABLE"
        : "UNKNOWN")
      : "UNKNOWN";
    return { bars: bars, realtime: live };
  }

  /**
   * Welche Datenklassen kommen in dieser Sitzung in Frage?
   *
   * @returns {object} {session, suppress: [KLASSE], reason, support}
   *   `suppress` geht unveraendert in fallback-engine.select() - die
   *   Auswahl bleibt damit die eine Stelle, an der entschieden wird.
   */
  function restrict(session, capabilities, opts) {
    opts = opts || {};
    var support = extendedSupport(capabilities);
    var out = { session: session, suppress: [], reason: null, support: support };

    if (session === "CLOSED") {
      /* Kein Handel. Live-Klassen haben nichts zu melden - der letzte
         bestaetigte Stand bleibt sichtbar, und der kommt aus EOD oder
         aus dem, was schon in der Reihe steht. */
      out.suppress = ["REALTIME_STREAM", "REALTIME_QUOTE", "INTRADAY"];
      out.reason = "marketClosed";
      return out;
    }

    if (session === "REGULAR") return out;          // nichts einzuschraenken

    /* Erweiterte Sitzung. Ohne Beleg wird sie nicht bedient. */
    if (support.bars !== "AVAILABLE") {
      out.suppress = ["REALTIME_STREAM", "REALTIME_QUOTE", "INTRADAY"];
      out.reason = support.bars === "UNAVAILABLE"
        ? "extendedHoursUnsupported" : "extendedHoursUnverified";
      return out;
    }
    if (support.realtime !== "AVAILABLE") {
      /* Bars ja, Aktualitaet ungeprueft: die Intraday-Sprosse darf
         bleiben, die Echtzeitsprossen nicht. Genau dieser Fall traegt
         die Anzeige "INTRADAY" statt "LIVE" waehrend der Nachboerse. */
      out.suppress = ["REALTIME_STREAM", "REALTIME_QUOTE"];
      out.reason = support.realtime === "UNAVAILABLE"
        ? "extendedRealtimeUnsupported" : "extendedRealtimeUnverified";
      return out;
    }
    return out;
  }

  /**
   * Darf in dieser Sitzung ueberhaupt "LIVE" stehen?
   *
   * Getrennt von restrict(), weil es eine andere Frage ist: restrict()
   * entscheidet, was abgerufen wird, das hier entscheidet, wie es heisst.
   * Eine erweiterte Sitzung ohne belegte Echtzeit darf Daten zeigen - sie
   * darf sie nur nicht live nennen.
   */
  function allowsLiveLabel(session, capabilities) {
    if (session === "CLOSED") return false;
    if (session === "REGULAR") return true;
    return extendedSupport(capabilities).realtime === "AVAILABLE";
  }

  /**
   * Wechselt die Sitzung zwischen zwei Zeitpunkten?
   *
   * Der Feed braucht die Antwort, weil ein Sitzungswechsel eine
   * Statusaenderung ist, die aus keinem Datenpunkt folgt: um 16:00 New
   * Yorker Zeit passiert nichts, was hereinkaeme - es hoert nur etwas
   * auf. Ohne diese Pruefung stuende "LIVE · REGULAR" noch um 22:30
   * deutscher Zeit da.
   */
  function transition(vorher, nachher) {
    if (!vorher || !nachher) return null;
    if (vorher.session === nachher.session) return null;
    return {
      from: vorher.session, to: nachher.session,
      at: nachher.localTime, localDate: nachher.localDate,
      /* Der Uebergang, der den Nutzer am haeufigsten betrifft: in
         Deutschland faellt das Ende der Nachboerse auf 02:00 Ortszeit. */
      entersExtended: isExtended(nachher.session),
      leavesTrading: nachher.session === "CLOSED"
    };
  }

  /**
   * Die Sitzungszeiten eines Zugangs als Bericht - fuer Doku und
   * Entwickleransicht. Enthaelt ausdruecklich den Pruefzustand, nicht nur
   * die Zeiten: eine Tabelle mit Uhrzeiten ohne Herkunft liest sich wie
   * eine Zusage.
   */
  function describe(calendar, exchangeId, capabilities) {
    var ex = (calendar && calendar.exchanges && calendar.exchanges[exchangeId]) || null;
    var sessions = (ex && ex.sessions) || {};
    var support = extendedSupport(capabilities);
    return {
      version: POLICY_VERSION,
      exchange: exchangeId,
      timezone: ex ? ex.timezone : null,
      calendarId: calendar ? calendar.calendarId : null,
      coverage: calendar ? calendar.coverage : null,
      sessions: SESSIONS.map(function (s) {
        var key = s === "PRE_MARKET" ? "PRE" : s === "AFTER_HOURS" ? "AFTER" : s;
        var spec = sessions[key] || null;
        return {
          session: s,
          label: labelOf(s),
          extended: isExtended(s),
          startLocal: spec ? spec.start : null,
          endLocal: spec ? spec.end : null,
          /* REGULAR ist belegt, weil die gesamte bestehende Architektur
             darauf laeuft und gemessen wurde. Alles andere haengt am
             Nachweis. */
          state: s === "REGULAR" ? "AVAILABLE"
               : s === "CLOSED" ? "AVAILABLE"
               : support.bars
        };
      }),
      extendedSupport: support
    };
  }

  var api = {
    POLICY_VERSION: POLICY_VERSION,
    SESSIONS: SESSIONS,
    EXTENDED: EXTENDED,
    LABELS: LABELS,
    FROM_PHASE: FROM_PHASE,
    isExtended: isExtended,
    sessionOf: sessionOf,
    labelOf: labelOf,
    sessionAt: sessionAt,
    extendedSupport: extendedSupport,
    restrict: restrict,
    allowsLiveLabel: allowsLiveLabel,
    transition: transition,
    describe: describe
  };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.SessionPolicy = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
