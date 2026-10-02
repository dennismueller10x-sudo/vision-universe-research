/* =========================================================================
   VISION UNIVERSE — survivorship-control.js   (survivorship-control-1.0.0)

   Owner-Programm 02.10.2026, §2-§9. Zwei Begriffe, zwei Zustaende:

     SURVIVORSHIP_GATE     schuetzt davor, einen unsicheren Backtest als
                           zertifiziert auszugeben. PASS heisst nur: keine
                           Auswertung ohne Kontrolle steht ueber LIMITED.
     SURVIVORSHIP_CONTROL  historische Nicht-Ueberlebende sind tatsaechlich
                           in der Studie enthalten. Nur das ist eine Kontrolle.

   Ein bestandenes Gate wird hier nie als geloeste Kontrolle ausgegeben.

   IDENTITAET: eine Kursreihe gehoert einem Listing nur, wenn ihr Zeitraum in
   das Listing-Fenster faellt (Start, Ende). Ein Kuerzel allein ist keine
   Identitaet - nach einer Neuvergabe traegt es eine andere Firma.

   Klassen je historischem (beendetem) Listing:
     A  delistet, Historie bis zum Listing-Ende verwendbar
     B  delistet, Historie vorhanden, aber Anfang oder Ende verfehlt
     C  delistet, keine Historie
     D  Kuerzel spaeter neu vergeben, alte Historie nicht abrufbar
     E  Uebernahme/Fusion belegt (nur mit Beleg - lokal gibt es keinen)
     F  Identitaet unsicher (Reihe passt nicht zum Listing)

   AUSGANG EINES DELISTINGS: lokal gibt es keine Quelle fuer Insolvenz,
   Barabfindung, Aktientausch oder Rueckzug. Jeder Ausgang ist deshalb
   UNKNOWN, und ein Fall, dessen Horizont ueber das Reihenende reicht, wird
   ZENSIERT (nicht gewertet) - keine pauschale 0 % oder -100 %.
   ========================================================================= */
(function (global) {
  "use strict";
  var VERSION = "survivorship-control-1.0.0";
  var DAY = 86400000;
  var CLASSES = {
    A: "delistet, verwendbare Historie bis zum Listing-Ende",
    B: "delistet, Historie unvollständig (Anfang oder Ende verfehlt)",
    C: "delistet, keine Historie",
    D: "Kürzel später neu vergeben, alte Historie nicht abrufbar",
    E: "Übernahme oder Fusion belegt",
    F: "Identität unsicher"
  };
  var OUTCOME = { state: "UNKNOWN", treatment: "CENSORED",
    plain: "Ob ein Titel wegen Insolvenz, Übernahme oder Rückzug endete, ist lokal nicht belegt. Fälle, deren Zeitraum über das Ende der Reihe reicht, werden nicht gewertet (zensiert) - keine pauschale Annahme von 0 % oder -100 %." };

  function days(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / DAY); }

  /** Gehoert eine Reihe {from,to} zum Listing {start,end}? end=null: aktiv. */
  function ownsSeries(listing, series, tolDays) {
    var tol = tolDays === undefined ? 15 : tolDays;
    if (!listing || !series || !series.from || !series.to || !listing.start) return false;
    if (days(listing.start, series.from) < -tol) return false;            // Reihe beginnt vor dem Listing
    if (listing.end && days(listing.end, series.to) > tol) return false;  // Reihe laeuft ueber das Ende hinaus
    return true;
  }

  /** Listing-Kennung aus dem Security Master: tiingo:EXCH:TICKER:start. */
  function listingIdOf(row) { return row.canonical_id || ("tiingo:" + row.exchange + ":" + row.ticker + ":" + row.start_date); }

  /**
   * Inaktive Zeile des Security Masters klassifizieren.
   * ctx.activeTickers: Set der Kuerzel aktiver Zeilen
   * ctx.seriesOf(row): {from,to} der Reihe unter row.baseline_security_id oder null
   */
  function classifyInactiveRow(row, ctx) {
    var listing = { start: row.start_date, end: row.end_date };
    var series = ctx.seriesOf ? ctx.seriesOf(row) : null;
    var reused = ctx.activeTickers && ctx.activeTickers.has(row.ticker);
    var owned = series ? ownsSeries(listing, series) : false;
    var out = { listingId: listingIdOf(row), ticker: row.ticker, start: row.start_date, end: row.end_date,
      tickerReused: !!reused, series: series ? { from: series.from, to: series.to } : null, seriesOwner: null, cls: null, reason: null };
    if (series) out.seriesOwner = owned ? "THIS_LISTING" : (reused ? "LATER_LISTING_SAME_TICKER" : "UNKNOWN");
    if (reused && !owned) { out.cls = "D"; out.reason = "TICKER_REUSED_SERIES_BELONGS_TO_LATER_LISTING"; return out; }
    if (reused && owned) { out.cls = "F"; out.reason = "TICKER_REUSED_SHARED_ID"; return out; }
    if (!series) { out.cls = "C"; out.reason = "NO_SERIES"; return out; }
    if (!owned) { out.cls = "F"; out.reason = "SERIES_OUTSIDE_LISTING_WINDOW"; return out; }
    var endOk = !listing.end || Math.abs(days(series.to, listing.end)) <= 15;
    var startOk = days(listing.start, series.from) <= 30;
    out.cls = endOk && startOk ? "A" : "B";
    out.reason = endOk && startOk ? "HISTORY_TO_LISTING_END" : (!endOk ? "EARLY_END" : "LATE_START");
    return out;
  }

  /**
   * Eintrag des privaten Delisting-Abrufs (tiingo-delisted Manifest).
   * Liefert null fuer aktive Listings und ausgeschlossene Gattungen.
   */
  function classifyFetchedListing(entry, opts) {
    var o = opts || {};
    if (!entry || entry.status === "SKIPPED_CLASS" || entry.included === false) return null;
    if (entry.status === "UNFETCHABLE_REUSED") return { cls: "D", reason: "TICKER_REUSED_OLD_LISTING_UNFETCHABLE" };
    var ended = entry.last && o.asOf ? days(entry.last, o.asOf) > (o.activeLagDays || 20) : false;
    if (entry.status === "OK" || entry.status === "PARTIAL") {
      if (!ended) return null;                                            // aktiv, kein Delisting
      if (entry.duplicateOf) return { cls: "F", reason: "TICKER_CHANGE_DUPLICATE" };
      return entry.status === "OK" ? { cls: "A", reason: "HISTORY_TO_LISTING_END" } : { cls: "B", reason: (entry.flags || []).join("+") || "PARTIAL" };
    }
    if (entry.status === "MISMATCH") return { cls: "F", reason: "SERIES_OUTSIDE_LISTING_WINDOW" };
    return { cls: "C", reason: entry.status || "NO_SERIES" };
  }

  function emptyClasses() { return { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }; }

  /**
   * Gate und Kontrolle getrennt.
   * s.highTrustWithoutControl  bool - steht eine Regel ohne Kontrolle ueber LIMITED?
   * s.delistedInStudy          Anzahl delisteter Listings in der Sensitivitaet
   * s.coverageFrom             ab wann delistete Titel enthalten sind
   * s.studyFrom                Beginn der Hauptstudie
   * s.unfetchableShare         Anteil nicht abrufbarer Alt-Listings (D)
   */
  function status(s) {
    var gate = { state: s.highTrustWithoutControl ? "FAIL" : "PASS",
      meaning: "Schutz: keine Auswertung ohne Überlebenden-Kontrolle steht über „eingeschränkt“. Das Gate löst das Problem nicht.",
      solvesSurvivorship: false };
    var controlState = "NOT_AVAILABLE", reasons = [];
    if (s.delistedInStudy > 0) {
      controlState = "PARTIAL";
      if (s.coverageFrom && s.studyFrom && s.coverageFrom > s.studyFrom) reasons.push("DELISTED_ONLY_FROM_" + s.coverageFrom.slice(0, 4));
      if (s.unfetchableShare > 0) reasons.push("REUSED_TICKER_LISTINGS_UNFETCHABLE");
      reasons.push("DELIST_OUTCOME_UNKNOWN");
      reasons.push("MAIN_STUDY_SURVIVORS_ONLY");
    } else reasons.push("NO_DELISTED_HISTORY_IN_STUDY");
    return { version: VERSION, gate: gate,
      control: { state: controlState, reasons: reasons, inMainStudy: false,
        meaning: "Kontrolle: historische Nicht-Überlebende sind in der Studie enthalten. Nur dann ist der Überlebenden-Effekt kontrolliert." } };
  }

  var api = { VERSION: VERSION, CLASSES: CLASSES, OUTCOME: OUTCOME, ownsSeries: ownsSeries, listingIdOf: listingIdOf,
    classifyInactiveRow: classifyInactiveRow, classifyFetchedListing: classifyFetchedListing, emptyClasses: emptyClasses, status: status };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUSurvivorshipControl = api;
})(typeof window !== "undefined" ? window : globalThis);
