/* =========================================================================
   VISION UNIVERSE — core/product-composition.js

   Woraus das Produktuniversum besteht (Steuerung 22.11.2026, Beschriftung):
     commonStock.eligible  Stammaktien (EQUITY_COMMON) mit ELIGIBLE
     commonStock.review    Stammaktien in Pruefung (EQUITY_COMMON mit REVIEW, Verdacht ohne Beleg)
     adr                   ADR im Produkt
     separateClasses       getrennte Klassen (SEPARATE_CLASS: Vorzug, SPAC, Trust, REIT-Klasse ...)
     otherReview           andere Gattungen in Pruefung (Warrant/Right/Unit/Vorzug ohne Beleg)
     productScope          Produktumfang insgesamt (= Zeilen von universe-ELIGIBLE_US_EQUITY.json)
   Anzeige: "US-Stammaktien {eligible} (+{review} in Pruefung)" und
            "Produktumfang inkl. getrennter Klassen {productScope}".
   Gattung und Status aus quant/data/market/security-master/eligibility.json;
   gerankt wird dieselbe Stammaktien-Grundgesamtheit (quant/engines/ranking-population.js).

   UMD: Browser (globalThis.VUCore.ProductComposition), Node (require).
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.ProductComposition = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var VERSION = "product-composition-1.0.0";

  /** decisions: eligibility.json#decisions; universe: universe-ELIGIBLE_US_EQUITY.json#securities */
  function compose(decisions, universe) {
    var byId = {};
    (decisions || []).forEach(function (d) { byId[d.securityId] = d; });
    var out = { version: VERSION, commonStock: { eligible: 0, review: 0 }, adr: 0, separateClasses: 0, otherReview: 0, productScope: 0, unmatched: 0 };
    (universe || []).forEach(function (s) {
      out.productScope++;
      var d = byId[s.securityId];
      if (!d) { out.unmatched++; return; }
      if (d.instrument_type === "EQUITY_COMMON" && d.product_eligibility === "ELIGIBLE") out.commonStock.eligible++;
      else if (d.instrument_type === "EQUITY_COMMON" && d.product_eligibility === "REVIEW") out.commonStock.review++;
      else if (d.instrument_type === "ADR") out.adr++;
      else if (d.product_eligibility === "SEPARATE_CLASS") out.separateClasses++;
      else if (d.product_eligibility === "REVIEW") out.otherReview++;
    });
    return out;
  }
  function label(c) {
    return { commonStock: "US-Stammaktien " + c.commonStock.eligible + " (+" + c.commonStock.review + " in Prüfung)",
             productScope: "Produktumfang inkl. getrennter Klassen " + c.productScope };
  }
  return Object.freeze({ VERSION: VERSION, compose: compose, label: label });
});
