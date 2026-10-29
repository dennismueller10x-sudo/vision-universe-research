/* =========================================================================
   VISION UNIVERSE QUANT — engines/market-cap.js
   Der Boersenwert-Vertrag (market-cap-1.2.0). Boersenwert = ausstehende
   Aktien x veroeffentlichter Schlusskurs DIESER Notierung - und nur, wenn
   die Geschaeftszahlen in der Waehrung des Kurses (USD) berichtet sind. Was fehlt, wird
   zurueckgehalten - mit Grund -, nie ersetzt: lieber kein Wert als ein
   falscher, nur damit die Abdeckung steigt.
   Methodik: quant/methodology/market-cap-v1.json
   ========================================================================= */
(function (global) {
  "use strict";
  var VERSION = "market-cap-1.2.0";
  /* Alle Kurse im Produkt sind US-Notierungen in USD. */
  var LISTING_CURRENCY = "USD";
  /* Nur diese Konzepte zaehlen AUSSTEHENDE Aktien. `CommonStockSharesIssued`
     zaehlt ausgegebene Aktien einschliesslich eigener im Bestand. */
  var OUTSTANDING_CONCEPTS = ["dei:EntityCommonStockSharesOutstanding", "us-gaap:CommonStockSharesOutstanding"];
  var REASONS = {
    SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING: "Der Emittent hat mehrere notierte Zeilen; die gemeldete Aktienzahl lässt sich keiner einzelnen zuordnen.",
    NO_PIT_SHARE_COUNT: "Für den Stichtag ist keine ausstehende Aktienzahl gemeldet.",
    SHARE_COUNT_NOT_OUTSTANDING: "Gemeldet ist nur die Zahl ausgegebener Aktien (einschließlich eigener im Bestand), nicht die der ausstehenden.",
    REPORTING_CURRENCY_NOT_LISTING_CURRENCY: "Das Unternehmen berichtet seine Geschäftszahlen nicht in US-Dollar. Kurs und Geschäftszahlen sind nicht in derselben Währung, und bei Hinterlegungsscheinen (ADR) entspricht ein gehandelter Schein nicht einer gemeldeten Aktie.",
    NO_PUBLISHED_CLOSE: "Für diese Notierung gibt es keinen veröffentlichten Schlusskurs.",
    SHARE_COUNT_SCALE_SUSPECT: "Die gemeldete Aktienzahl weicht um eine Zehnerpotenz von den vorherigen Meldungen ab oder ergäbe einen unmöglichen Börsenwert – ein Skalenfehler in der XBRL-Meldung ist wahrscheinlicher als eine echte Kapitalmaßnahme."
  };
  /* market-cap-1.2.0 (Vorschlag V12 MCAP, docs/quant-recovery/v12/mcap): Skalenwaechter. XBRL-Aktienzahlen tragen
     Skalenfehler (EEFT 10-K 2020: 5,28e16 statt 52,75 Mio; ON, ORCL, YUM, CB: x1e6). Weicht die Zahl vom Median der bis
     zu vier vorherigen Quartalszahlen um 10^k (|k| >= 3, +-25 %) ab oder ergaebe sie mehr als 8e12 USD, wird der
     Boersenwert zurueckgehalten - nie geschaetzt, nie umskaliert (die Korrektur ist Sache der SEC-Schicht). */
  var ABSOLUTE_MCAP_BOUND_USD = 8e12;
  var SCALE_GUARD_MIN_EXPONENT = 3, SCALE_GUARD_TOLERANCE = 1.25, SCALE_GUARD_HISTORY = 4;
  function previousShareCounts(doc, cutoff, end) {
    var cols = (doc && doc.columns) || ["fy", "fp", "end", "v", "filed", "accn", "derived"];
    var iEnd = cols.indexOf("end"), iV = cols.indexOf("v"), iFiled = cols.indexOf("filed");
    var rows = (doc && doc.quarterly && doc.quarterly.shares_outstanding) || [];
    return rows.filter(function (r) { return typeof r[iFiled] === "string" && r[iFiled] <= cutoff && r[iEnd] < end && typeof r[iV] === "number" && r[iV] > 0; })
      .sort(function (a, b) { return a[iEnd] < b[iEnd] ? -1 : 1; }).slice(-SCALE_GUARD_HISTORY).map(function (r) { return r[iV]; });
  }
  /* true if the share count differs from the median of the previous quarterly counts by a power of ten (|k| >= 3, +-25 %). */
  function shareScaleSuspect(shares, doc, cutoff) {
    if (!shares || !(shares.value > 0) || typeof shares.end !== "string") return false;
    var prev = previousShareCounts(doc, cutoff, shares.end).sort(function (a, b) { return a - b; });
    if (!prev.length) return false;
    var m = prev.length % 2 ? prev[(prev.length - 1) / 2] : (prev[prev.length / 2 - 1] + prev[prev.length / 2]) / 2;
    var l = Math.log10(shares.value / m), k = Math.round(l);
    return Math.abs(k) >= SCALE_GUARD_MIN_EXPONENT && Math.abs(l - k) <= Math.log10(SCALE_GUARD_TOLERANCE);
  }
  /* false -> Boersenwert zurueckhalten (SHARE_COUNT_SCALE_SUSPECT). Ohne Aktienzahl entscheidet dieser Waechter nichts
     (dafuer gibt es NO_PIT_SHARE_COUNT); ohne Kurs greift nur der Zehnerpotenz-Vergleich. */
  function scalePlausible(shares, doc, cutoff, rawMarketCap) {
    if (!shares) return true;
    if (shareScaleSuspect(shares, doc, cutoff)) return false;
    return !(typeof rawMarketCap === "number" && isFinite(rawMarketCap) && rawMarketCap > ABSOLUTE_MCAP_BOUND_USD);
  }

  /* market-cap-1.1.0: Die Berichtswaehrung steht in den Einheiten der
     SEC-Konsumschicht (`units`, z. B. "CNY", "CNY/shares"). Gezaehlt werden
     nur die Kennzahlen, die eine Bewertungskennzahl durch den Boersenwert
     teilt oder zu ihm addiert - eine einzelne Nebenkennzahl in fremder
     Waehrung (Varonis meldet einen Wert in AFN) sperrt keine Bewertung.
     Mehrere Waehrungen darunter -> "MIXED"; keine -> null. */
  var VALUATION_INPUTS = ["revenue", "net_income", "pretax_income", "operating_income", "ebitda",
    "depreciation_and_amortization", "operating_cash_flow", "capital_expenditures", "free_cash_flow",
    "stockholders_equity", "total_debt", "long_term_debt", "net_debt", "cash_and_equivalents", "dividends_paid"];
  function reportingCurrency(units) {
    if (!units || typeof units !== "object") return null;
    var seen = {};
    VALUATION_INPUTS.forEach(function (k) {
      var u = String(units[k] || "").split("/")[0].trim();
      if (!u || u === "shares" || u === "pure" || u === "percent") return;
      seen[u] = true;
    });
    var list = Object.keys(seen);
    return list.length === 0 ? null : list.length === 1 ? list[0] : "MIXED";
  }
  /* Unbekannte Waehrung (keine Geldkennzahl) sperrt nicht: ohne Geldkennzahl
     entsteht keine Bewertungskennzahl, die Waehrungen mischen koennte. */
  function sameCurrencyAsListing(units) {
    var c = reportingCurrency(units);
    return c === null || c === LISTING_CURRENCY;
  }
  function isOutstanding(concept) { return OUTSTANDING_CONCEPTS.indexOf(concept) >= 0; }
  var api = { VERSION: VERSION, LISTING_CURRENCY: LISTING_CURRENCY, VALUATION_INPUTS: VALUATION_INPUTS, OUTSTANDING_CONCEPTS: OUTSTANDING_CONCEPTS, REASONS: REASONS,
    isOutstanding: isOutstanding, reportingCurrency: reportingCurrency, sameCurrencyAsListing: sameCurrencyAsListing,
    ABSOLUTE_MCAP_BOUND_USD: ABSOLUTE_MCAP_BOUND_USD, shareScaleSuspect: shareScaleSuspect, previousShareCounts: previousShareCounts, scalePlausible: scalePlausible };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUMarketCap = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
