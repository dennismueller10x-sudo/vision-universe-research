/* =========================================================================
   VISION UNIVERSE — quant/engines/ranking-population.js

   Wer in Ranglisten und Perzentilen mitzaehlt (Steuerung 22.11.2026).
   Das Produktuniversum fuehrt neben Stammaktien auch getrennte Klassen
   (Vorzuege, SPACs, Trusts, REIT-Klassen) und Verdachtsfaelle ohne Beleg
   (build-us-eligibility.mjs: SEPARATE_CLASS, REVIEW). Sie bleiben im Produkt
   und behalten ihre Seite. Gerankt und in Perzentile gerechnet werden nur
   Stammaktien und ADR - sonst besetzen SPACs die Low-Volatility-Liste und
   verschieben Vorzuege die Perzentile der Stammaktien.

   Die Gattung ist instrument_type aus quant/data/market/security-master/
   eligibility.json (Eignungsschicht), nicht das Anbieterfeld.

   UMD: Browser (globalThis.VURankingPopulation), Node (require).
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VURankingPopulation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var VERSION = "ranking-population-1.0.0";
  var RANKABLE = Object.freeze(["EQUITY_COMMON", "ADR"]);
  var REASON = "NOT_IN_COMMON_STOCK_RANKING";
  var TEXT = "Nicht in der Stammaktien-Rangliste: Rang und Perzentil gelten nur unter Stammaktien und ADR. Getrennte Klassen (Vorzug, SPAC, Trust) bleiben im Produkt.";
  function isRankable(instrumentType) { return RANKABLE.indexOf(String(instrumentType || "")) >= 0; }
  return Object.freeze({ VERSION: VERSION, RANKABLE: RANKABLE, REASON: REASON, TEXT: TEXT, isRankable: isRankable });
});
