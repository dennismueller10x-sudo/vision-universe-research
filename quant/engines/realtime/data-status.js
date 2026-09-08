/* =========================================================================
   VISION UNIVERSE — realtime/data-status.js

   Was steht ueber dem Chart?

   Diese Datei entscheidet ueber ein Wort, und das Wort ist "LIVE". Es ist
   das einzige in dieser Anwendung, das eine Zusicherung ueber die
   Gegenwart macht - alle anderen Etiketten sagen, wie alt etwas ist.
   Deshalb wird es hier nicht vergeben, sondern erarbeitet: fuenf
   Bedingungen, alle noetig, keine davon eine Vermutung.

     1. Die Verbindung ist im Zustand LIVE (Automat, nicht Flag).
     2. Die gezeichnete Datenklasse ist eine Echtzeitklasse.
     3. Diese Klasse ist AVAILABLE - belegt, nicht ungeprueft.
     4. Der Datenstand ist FRESH nach den versionierten Schwellen.
     5. Es wird nicht gerade zurueckgefallen.

   Faellt eine davon, faellt das Wort. Was dann dasteht, sagt die Wahrheit
   ueber den Stand: eine Uhrzeit, ein Datum, oder dass gerade nichts geht.

   ZWEI PROVENIENZEN

   §17 verlangt zweierlei, das sich widerspricht, wenn man es in ein Feld
   presst: intern muss nachvollziehbar sein, welcher Anbieter welche
   Datenklasse wann geliefert hat - und oeffentlich duerfen Anbieterdetails
   nicht ohne Lizenzgrundlage erscheinen.

   Deshalb gibt es zwei Objekte. Das interne traegt alles. Das oeffentliche
   traegt Datenklasse, Stand und Verzoegerungsstatus - und den Anbieter nur,
   wenn die Anzeigerichtlinie ihn freigibt. Wer das oeffentliche Objekt
   ausgibt, kann nichts falsch machen; wer das interne ausgibt, muss es
   wollen.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var DataClass = isNode ? require("./data-class.js") : global.VURealtime.DataClass;
  var MarketHours = isNode ? require("./market-hours.js") : global.VURealtime.MarketHours;

  /* Die Etiketten. Deutsch, weil die Oberflaeche deutsch ist; der Code
     bleibt englisch. `tone` steuert die Farbe, nicht den Inhalt. */
  var STATUS = {
    LIVE:          { label: "LIVE", tone: "live", detail: "time" },
    DELAYED:       { label: "VERZÖGERT", tone: "warn", detail: "asOfTime" },
    INTRADAY:      { label: "INTRADAY", tone: "neutral", detail: "asOfTime" },
    EOD:           { label: "LETZTER SCHLUSSKURS", tone: "neutral", detail: "asOfDate" },
    MARKET_CLOSED: { label: "BÖRSE GESCHLOSSEN", tone: "muted", detail: "asOfDateTime" },
    CONNECTING:    { label: "VERBINDUNG WIRD AUFGEBAUT", tone: "muted", detail: "none" },
    RECONNECTING:  { label: "VERBINDUNG WIRD WIEDERHERGESTELLT", tone: "warn", detail: "asOfTime" },
    OFFLINE:       { label: "KEINE VERBINDUNG", tone: "warn", detail: "asOfDateTime" },
    UNAVAILABLE:   { label: "MARKTDATEN DERZEIT NICHT VERFÜGBAR", tone: "muted", detail: "none" }
  };

  var MONTHS_DE = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  function fmtTime(ms, timezone, withSeconds) {
    var lp = MarketHours.localParts(ms, timezone);
    if (!lp) return null;
    return withSeconds === false
      ? lp.clock.slice(0, 5)
      : lp.clock;
  }

  function fmtDate(ms, timezone) {
    var lp = MarketHours.localParts(ms, timezone);
    if (!lp) return null;
    var p = lp.date.split("-");
    return p[2] + "." + MONTHS_DE[parseInt(p[1], 10) - 1] + "." + p[0];
  }

  /**
   * Leitet den Anzeigestatus ab.
   *
   * @param {object} input
   *   connection   Snapshot aus connection-state.js
   *   selection    Ergebnis aus fallback-engine.js
   *   negotiation  Ergebnis aus capability-negotiation.js
   *   staleness    Ergebnis aus staleness.js
   *   lastTimestamp / lastReceivedAt  juengster Datenstand (ms oder ISO)
   *   timezone     Anzeigezeitzone (Standard: Boersenzeitzone)
   *   now
   *
   * @returns {object} {code, label, detail, text, tone, isLive, dataClass, ...}
   */
  function derive(input) {
    input = input || {};
    var connection = input.connection || { state: "IDLE", allowsLiveLabel: false };
    var selection = input.selection || { selected: DataClass.TERMINAL_CLASS };
    var negotiation = input.negotiation || { classes: {} };
    var staleness = input.staleness || null;
    var session = (staleness && staleness.session) || input.session || null;
    var tz = input.timezone || (session && session.timezone) || "America/New_York";
    var ts = toMs(input.lastTimestamp);
    var dc = selection.selected;

    var code = classify({
      connection: connection, selection: selection, negotiation: negotiation,
      staleness: staleness, dataClass: dc, hasData: ts !== null
    });

    var spec = STATUS[code] || STATUS.UNAVAILABLE;
    var detail = null;
    if (spec.detail === "time" && ts !== null) detail = fmtTime(ts, tz, true);
    else if (spec.detail === "asOfTime" && ts !== null) detail = "Stand " + fmtTime(ts, tz, false);
    else if (spec.detail === "asOfDate" && ts !== null) detail = fmtDate(ts, tz);
    else if (spec.detail === "asOfDateTime" && ts !== null) {
      detail = "Stand " + fmtDate(ts, tz) + " " + fmtTime(ts, tz, false);
    }

    return {
      code: code,
      label: spec.label,
      detail: detail,
      text: detail ? spec.label + " · " + detail : spec.label,
      tone: spec.tone,
      isLive: code === "LIVE",
      dataClass: dc,
      timezone: tz,
      asOf: ts === null ? null : new Date(ts).toISOString(),
      /* Warum nicht besser? Die Anzeige braucht das fuer den Hinweistext,
         und §22 verlangt, dass ein Abstieg erklaerbar bleibt. */
      downgraded: !!selection.downgraded,
      downgradedFrom: selection.downgradedFrom || null,
      reason: selection.reason || (staleness && staleness.reason) || null,
      sessionPhase: session ? session.phase : null
    };
  }

  /* Die Entscheidungskette. Reihenfolge ist Bedeutung: erst die Faelle,
     in denen es gar keine Daten gibt, dann die Verbindungslage, dann die
     Datenklasse. Wer die Klasse zuerst fragte, bekaeme "INTRADAY" fuer
     einen Chart, der gerade nichts anzeigt. */
  function classify(ctx) {
    var state = ctx.connection.state;

    if (ctx.dataClass === DataClass.TERMINAL_CLASS || !ctx.hasData) {
      /* Ein Verbindungsaufbau ohne jeden Datenstand ist kein Ausfall,
         sondern der erste Moment. */
      if (state === "CONNECTING" || state === "IDLE") return "CONNECTING";
      return "UNAVAILABLE";
    }

    /* Ein Wiederaufbau bleibt sichtbar, solange er laeuft - auch wenn die
       alten Bars noch dastehen. Genau hier wuerde ein naives System
       weiter LIVE zeigen (§22). */
    if (state === "RECONNECTING") return "RECONNECTING";
    if (state === "OFFLINE") return "OFFLINE";

    /* Geschlossene Boerse schlaegt jede Echtzeitbehauptung. Ein
       Freitagsschluss ist am Sonntag kein Live-Kurs, egal wie gesund die
       Verbindung ist. */
    if (ctx.staleness && ctx.staleness.level === "MARKET_CLOSED") {
      return ctx.dataClass === "EOD" ? "EOD" : "MARKET_CLOSED";
    }

    if (DataClass.isRealtimeClass(ctx.dataClass)) {
      var finding = ctx.negotiation.classes ? ctx.negotiation.classes[ctx.dataClass] : null;
      var verified = !!(finding && finding.state === "AVAILABLE");
      var fresh = !!(ctx.staleness && ctx.staleness.level === "FRESH");
      /* Die fuenf Bedingungen aus dem Modulkopf, an einer Stelle. */
      if (state === "LIVE" && ctx.connection.allowsLiveLabel &&
          verified && fresh && !ctx.selection.downgraded) {
        return "LIVE";
      }
      /* Echtzeitpfad, aber nicht frisch: das ist ein verzoegerter Kurs,
         und er wird auch so genannt. */
      return "DELAYED";
    }

    if (ctx.dataClass === "INTRADAY") {
      if (ctx.staleness && ctx.staleness.level === "STALE") return "DELAYED";
      return "INTRADAY";
    }
    if (ctx.dataClass === "EOD") return "EOD";
    return "UNAVAILABLE";
  }

  /**
   * Die interne Provenienz. Vollstaendig, mit Anbieter. Gehoert in
   * Diagnose und Protokoll, nicht in die oeffentliche Seite.
   */
  function internalProvenance(input) {
    input = input || {};
    var selection = input.selection || {};
    var negotiation = input.negotiation || {};
    var connection = input.connection || {};
    var staleness = input.staleness || {};
    return {
      provider: negotiation.providerId || null,
      plan: negotiation.plan || null,
      dataClass: selection.selected || null,
      preferredDataClass: selection.preferred || null,
      capabilityState: (negotiation.classes && selection.selected &&
                        negotiation.classes[selection.selected])
        ? negotiation.classes[selection.selected].state : null,
      adjustmentStatus: input.adjustmentStatus === undefined ? null : input.adjustmentStatus,
      connectionState: connection.state || null,
      fallbackReason: connection.fallbackReason || selection.reason || null,
      stalenessLevel: staleness.level || null,
      ageMs: staleness.ageMs === undefined ? null : staleness.ageMs,
      providerLagMs: staleness.providerLagMs === undefined ? null : staleness.providerLagMs,
      lastTimestamp: input.lastTimestamp === undefined ? null : isoOrNull(input.lastTimestamp),
      lastSuccessfulUpdate: input.lastSuccessfulUpdate === undefined
        ? null : isoOrNull(input.lastSuccessfulUpdate),
      sessionPhase: staleness.session ? staleness.session.phase : null,
      retryCount: connection.retryCount === undefined ? null : connection.retryCount,
      lastError: connection.lastError || null,
      ladder: selection.ladder || null
    };
  }

  /**
   * Die oeffentliche Provenienz. Datenklasse und Stand ja, Anbieter nur
   * mit Erlaubnis.
   *
   * Die Frage, ob der Anbietername genannt werden darf, wird NICHT hier
   * beantwortet - sie steht in der Anzeigerichtlinie. Diese Funktion
   * bekommt das Ergebnis uebergeben und haelt sich daran. Waere es
   * umgekehrt, gaebe es zwei Stellen, an denen eine Lizenzfrage
   * entschieden wird.
   */
  function publicProvenance(input, permission) {
    var full = internalProvenance(input);
    var mayNameProvider = !!(permission && permission.allowed === true);
    return {
      dataClass: full.dataClass,
      status: input.status ? input.status.code : null,
      label: input.status ? input.status.text : null,
      asOf: full.lastTimestamp,
      adjustmentStatus: full.adjustmentStatus,
      delayed: full.stalenessLevel === "DEGRADED" || full.stalenessLevel === "STALE",
      marketClosed: full.stalenessLevel === "MARKET_CLOSED",
      /* Kein pauschaler Fussnotentext. Ob Daten synthetisch sind, sagt
         data-mode.js; hier steht, welche Klasse gezeichnet wird. */
      provider: mayNameProvider ? full.provider : null,
      providerDisclosure: mayNameProvider ? "allowed" : "withheld"
    };
  }

  function toMs(v) {
    if (v === undefined || v === null) return null;
    if (typeof v === "number" && isFinite(v)) return v;
    if (v instanceof Date) return v.getTime();
    var t = new Date(v).getTime();
    return isNaN(t) ? null : t;
  }
  function isoOrNull(v) {
    var ms = toMs(v);
    return ms === null ? null : new Date(ms).toISOString();
  }

  var api = {
    STATUS: STATUS,
    derive: derive,
    internalProvenance: internalProvenance,
    publicProvenance: publicProvenance,
    fmtTime: fmtTime,
    fmtDate: fmtDate
  };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.DataStatus = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
