/* =========================================================================
   VISION UNIVERSE — chart-ranges.js   (Phase 4A, §17)

   Welcher Zeitraum wird aus welcher Quelle gezeichnet?

   Die Frage sieht nach Darstellung aus und ist in Wahrheit eine
   Datenfrage. Ein Tageschart aus Tagesschlusskursen ist ein einziger
   Punkt; ein Zehnjahreschart aus Fuenfminutenbars sind hunderttausend
   Punkte, die niemand laden will. Zwischen beiden liegt eine Grenze, und
   sie gehoert an eine Stelle, an der man sie pruefen kann - nicht verteilt
   auf Klickhandler.

   Zwei Regeln, die hier zusammenkommen:

   1. Kurze Zeitraeume brauchen Intraday. Intraday ist bei Tiingo an
      IEX-Daten geknuepft, und die stehen unter einem Feature-Gate und
      einer offenen Lizenzfrage. Ist das Gate aus, ist der Zeitraum nicht
      verfuegbar - er wird nicht heimlich aus Tagesdaten gebaut.

   2. Ein nicht verfuegbarer Zeitraum ist kein Fehler und keine leere
      Flaeche. Er sagt, woran es liegt, und nennt den naechsten, der geht.

   Was hier ausdruecklich NICHT passiert: ein stiller Rueckfall. Ein
   Tageschart, der in Wahrheit Wochendaten zeigt, ist schlimmer als ein
   fehlender - er sieht richtig aus.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* Die Zeitraeume in der Reihenfolge, in der sie in der Leiste stehen.
     `days` ist ein Kalenderfenster, kein Handelstagefenster: der Nutzer
     denkt in "letzte sechs Monate", nicht in "126 Bars". */
  var RANGES = [
    { id: "1D",  label: "1T",  days: 1,    source: "intraday" },
    { id: "5D",  label: "5T",  days: 5,    source: "intraday" },
    { id: "1M",  label: "1M",  days: 31,   source: "eod" },
    { id: "6M",  label: "6M",  days: 186,  source: "eod" },
    { id: "YTD", label: "YTD", ytd: true,  source: "eod" },
    { id: "1Y",  label: "1J",  days: 366,  source: "eod" },
    { id: "5Y",  label: "5J",  days: 1827, source: "eod" },
    { id: "MAX", label: "Max", all: true,  source: "eod" }
  ];

  var DEFAULT_RANGE = "1Y";
  var MIN_BARS = 2;

  function byId(id) {
    for (var i = 0; i < RANGES.length; i++) if (RANGES[i].id === id) return RANGES[i];
    return null;
  }

  /* Der Datumsteil eines Zeitstempels - Intraday-Bars tragen eine Uhrzeit. */
  function dayOf(bar) { return String((bar && bar.date) || bar || "").slice(0, 10); }

  function isoMinusDays(iso, days) {
    /* Auf den Datumsteil kuerzen, bevor gerechnet wird. Ein Aufrufer, der
       einen vollen Zeitstempel uebergibt, meint denselben Tag - und ohne
       diese Zeile bekaeme er stattdessen eine Ausnahme mitten im
       Rendern. */
    var d = new Date(dayOf(iso) + "T00:00:00Z");
    if (isNaN(d.getTime())) return null;
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Schneidet das Fenster beidseitig.
   *
   * Die obere Grenze ist nicht Kosmetik. Ohne sie zeigt ein Chart, dessen
   * Stichtag in der Mitte der Reihe liegt, auch die Tage danach - und aus
   * einer Darstellung "Stand 15. Januar" wird eine mit Blick in die
   * Zukunft. Im Normalfall faellt der Stichtag auf den letzten Bar und die
   * Grenze greift nicht; sie ist fuer den anderen Fall da.
   */
  function schneide(bars, vonDatum, bisDatum) {
    var out = [];
    for (var i = 0; i < bars.length; i++) {
      var tag = dayOf(bars[i]);
      if (vonDatum && tag < vonDatum) continue;
      if (bisDatum && tag > bisDatum) continue;
      out.push(bars[i]);
    }
    return out;
  }

  /**
   * Waehlt Quelle und Ausschnitt fuer einen Zeitraum.
   *
   * @param {string} rangeId
   * @param {object} data {eod: Bar[], intraday: Bar[], adjustmentStatus, intradayAdjustmentStatus}
   * @param {object} options {gates, today}
   * @param {boolean} [ohneVorschlag] intern: unterbindet die Suche nach
   *   einem Ersatzzeitraum. Ohne diesen Riegel wuerde die Suche selbst
   *   wieder suchen.
   * @returns {{ok, rangeId, source, bars, from, to, reason, message, suggestion, adjustmentStatus}}
   */
  function selectRange(rangeId, data, options, ohneVorschlag) {
    data = data || {};
    options = options || {};
    var gates = options.gates || {};
    var range = byId(rangeId) || byId(DEFAULT_RANGE);
    var eod = data.eod || [];
    var intraday = data.intraday || [];

    var quelle = range.source === "intraday" ? intraday : eod;
    var letzter = quelle.length ? dayOf(quelle[quelle.length - 1])
                : (eod.length ? dayOf(eod[eod.length - 1]) : null);
    var heute = options.today || letzter;

    function fehler(reason, message) {
      return {
        ok: false, rangeId: range.id, source: range.source, bars: [],
        from: null, to: null, reason: reason, message: message,
        suggestion: ohneVorschlag ? null : firstAvailable(data, options, range.id),
        adjustmentStatus: null
      };
    }

    if (range.source === "intraday") {
      /* Das Gate steht vor den Daten, nicht dahinter. Waere es umgekehrt,
         entschiede die Anwesenheit einer Datei ueber eine Freigabe. */
      if (gates.ENABLE_LIVE_MARKET_DATA !== true) {
        return fehler("gateDisabled",
          "Intraday-Daten sind nicht freigeschaltet (ENABLE_LIVE_MARKET_DATA). " +
          "Kurze Zeitraeume brauchen sie; aus Tagesschlusskursen laesst sich " +
          "kein Tagesverlauf bauen, und einer, der so aussieht, waere erfunden.");
      }
      if (intraday.length < MIN_BARS) {
        return fehler("noIntradayData",
          "Fuer diesen Titel liegen keine Intraday-Bars vor.");
      }
    }

    if (quelle.length < MIN_BARS) {
      return fehler("noData", "Fuer diesen Titel liegt keine Kursreihe vor.");
    }

    var bis = dayOf(heute) || null;
    var von = null;
    if (range.all) von = null;
    else if (range.ytd) von = dayOf(heute).slice(0, 4) + "-01-01";
    else {
      von = isoMinusDays(heute, range.days);
      if (von === null) {
        /* Ein unlesbarer Stichtag darf nicht dazu fuehren, dass das
           Fenster einfach entfaellt - dann zeigte "1 Monat" stillschweigend
           die ganze Historie. */
        return fehler("invalidDate",
          "Der Stichtag \"" + heute + "\" ist kein gueltiges Datum.");
      }
    }

    var bars = schneide(quelle, von, bis);
    if (bars.length < MIN_BARS) {
      return fehler("tooFewBars",
        "Im gewaehlten Zeitraum liegen nur " + bars.length + " Kurspunkte vor.");
    }

    return {
      ok: true, rangeId: range.id, source: range.source, bars: bars,
      from: dayOf(bars[0]), to: dayOf(bars[bars.length - 1]),
      reason: null, message: null, suggestion: null,
      adjustmentStatus: range.source === "intraday"
        ? (data.intradayAdjustmentStatus || null)
        : (data.adjustmentStatus || null)
    };
  }

  /** Der naechste Zeitraum, der mit den vorhandenen Daten funktioniert. */
  function firstAvailable(data, options, exceptId) {
    for (var i = 0; i < RANGES.length; i++) {
      if (RANGES[i].id === exceptId) continue;
      var res = selectRange(RANGES[i].id, data, options, true);
      if (res.ok) return RANGES[i].id;
    }
    return null;
  }

  /**
   * Der Zustand der ganzen Leiste - fuer die Darstellung.
   * Ein nicht verfuegbarer Zeitraum verschwindet nicht, er wird
   * abgeblendet und traegt seinen Grund. Ein verschwundener Knopf ist
   * eine unbeantwortete Frage.
   */
  function rangeBar(data, options) {
    return RANGES.map(function (r) {
      var res = selectRange(r.id, data, options, true);
      return { id: r.id, label: r.label, source: r.source,
               available: res.ok, reason: res.reason, message: res.message };
    });
  }

  var api = {
    RANGES: RANGES, DEFAULT_RANGE: DEFAULT_RANGE,
    selectRange: selectRange, rangeBar: rangeBar,
    firstAvailable: firstAvailable, byId: byId
  };

  if (isNode) module.exports = api;
  else global.VUChartRanges = api;
})(typeof window !== "undefined" ? window : globalThis);
