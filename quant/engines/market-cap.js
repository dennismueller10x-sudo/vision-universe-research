/* =========================================================================
   VISION UNIVERSE QUANT — engines/market-cap.js
   Der Boersenwert-Vertrag (market-cap-1.0.0). Boersenwert = ausstehende
   Aktien x veroeffentlichter Schlusskurs DIESER Notierung. Was fehlt, wird
   zurueckgehalten - mit Grund -, nie ersetzt: lieber kein Wert als ein
   falscher, nur damit die Abdeckung steigt.
   Methodik: quant/methodology/market-cap-v1.json
   ========================================================================= */
(function (global) {
  "use strict";
  var VERSION = "market-cap-1.0.0";
  /* Nur diese Konzepte zaehlen AUSSTEHENDE Aktien. `CommonStockSharesIssued`
     zaehlt ausgegebene Aktien einschliesslich eigener im Bestand. */
  var OUTSTANDING_CONCEPTS = ["dei:EntityCommonStockSharesOutstanding", "us-gaap:CommonStockSharesOutstanding"];
  var REASONS = {
    SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING: "Der Emittent hat mehrere notierte Zeilen; die gemeldete Aktienzahl lässt sich keiner einzelnen zuordnen.",
    NO_PIT_SHARE_COUNT: "Für den Stichtag ist keine ausstehende Aktienzahl gemeldet.",
    SHARE_COUNT_NOT_OUTSTANDING: "Gemeldet ist nur die Zahl ausgegebener Aktien (einschließlich eigener im Bestand), nicht die der ausstehenden.",
    NO_PUBLISHED_CLOSE: "Für diese Notierung gibt es keinen veröffentlichten Schlusskurs."
  };
  function isOutstanding(concept) { return OUTSTANDING_CONCEPTS.indexOf(concept) >= 0; }
  var api = { VERSION: VERSION, OUTSTANDING_CONCEPTS: OUTSTANDING_CONCEPTS, REASONS: REASONS, isOutstanding: isOutstanding };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUMarketCap = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
