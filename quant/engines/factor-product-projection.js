/* =========================================================================
   VISION UNIVERSE — factor-product-projection.js

   Die Produktansichten von Quant (Liste, Screener, 52W, Pro, Watchlist,
   Aktienseite) lesen aus factors-FULL_UNIVERSE.json je Titel genau sieben
   Kennzahlen und vier Kopffelder (product-services.js broadRow). Geladen
   wurde die ganze Datei: 19,2 MB, davon 8,3 MB fieldStatus aller 31 Felder
   (Payload-Audit 03.10.2026).

   Diese Projektion behaelt die Struktur (dieselben Schluessel, dieselben
   Werte) und laesst nur weg, was keine Produktansicht liest. Sie wird im
   Release-Build erzeugt (scripts/vu2/build-release.mjs), nicht committet.
   UMD: globalThis.VUFactorProductProjection
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUFactorProductProjection = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "factor-product-projection-1.0.0";
  /* Die Felder, die product-services.js liest (broadRow, broadQuantWorkspace). */
  var VALUE_KEYS = ["distanceToSMA200", "distanceToSMA50", "distanceTo52wHigh", "volatility252d", "maxDrawdown252d"];
  var RETURN_KEYS = ["6M", "12M"];
  var ROW_KEYS = ["ticker", "securityId", "asOf", "basis", "dataQuality"];

  function pick(o) {
    if (!o || typeof o !== "object") return o;
    var r = {};
    VALUE_KEYS.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; });
    if (o.returns && typeof o.returns === "object") {
      r.returns = {};
      RETURN_KEYS.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(o.returns, k)) r.returns[k] = o.returns[k]; });
    }
    return r;
  }

  function project(factors) {
    var out = {};
    Object.keys(factors || {}).forEach(function (k) { if (k !== "securities" && k !== "skipped") out[k] = factors[k]; });
    out.projection = { version: VERSION, of: "factors-FULL_UNIVERSE.json", valueKeys: VALUE_KEYS, returnKeys: RETURN_KEYS };
    var list = Array.isArray(factors && factors.securities) ? factors.securities : [];
    out.securities = list.map(function (s) {
      var r = {};
      ROW_KEYS.forEach(function (k) { if (s && Object.prototype.hasOwnProperty.call(s, k)) r[k] = s[k]; });
      r.values = pick(s && s.values);
      if (s && s.fieldStatus) r.fieldStatus = pick(s.fieldStatus);
      return r;
    });
    return out;
  }

  return { VERSION: VERSION, VALUE_KEYS: VALUE_KEYS, RETURN_KEYS: RETURN_KEYS, project: project };
});
