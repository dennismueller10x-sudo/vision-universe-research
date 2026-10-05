/* =========================================================================
   VISION UNIVERSE QUANT — engines/market-cap.js
   Der Boersenwert-Vertrag (market-cap-1.1.0). Boersenwert = ausstehende
   Aktien x veroeffentlichter Schlusskurs DIESER Notierung - und nur, wenn
   die Geschaeftszahlen in der Waehrung des Kurses (USD) berichtet sind. Was fehlt, wird
   zurueckgehalten - mit Grund -, nie ersetzt: lieber kein Wert als ein
   falscher, nur damit die Abdeckung steigt.
   Methodik: quant/methodology/market-cap-v1.json
   ========================================================================= */
(function (global) {
  "use strict";
  var VERSION = "market-cap-1.1.0";
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
    NO_PUBLISHED_CLOSE: "Für diese Notierung gibt es keinen veröffentlichten Schlusskurs."
  };
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
    isOutstanding: isOutstanding, reportingCurrency: reportingCurrency, sameCurrencyAsListing: sameCurrencyAsListing };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUMarketCap = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
