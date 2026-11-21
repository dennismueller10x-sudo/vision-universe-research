/* =========================================================================
   VISION UNIVERSE — core/exchanges.js

   Boersenregister: die eine Quelle fuer US-Handelsplaetze (Steuerung 21.11.2026).
   Vorher stand jeder Platz in bis zu sieben Tabellen (TXSE kam am 18.11.2026
   in vier davon einzeln dazu, und die Company-Master-Tabelle fehlte - die
   Umfangsfolge brach ab). Jetzt steht ein Platz hier genau einmal, mit allen
   Merkmalen, und die Leser leiten ihre Sicht daraus ab:

     regular  regulaerer US-Platz (Primaerlisting moeglich)
              -> us-security-master.js#US_PRIMARY_EXCHANGES, data-freshness.js (US-Kalender)
     mic      Operating MIC fuer das Primaerlisting -> company-master.js#PRIMARY_EXCHANGES
     family   Boersenfamilie; ihr secLabel ist die Schreibweise der SEC-Tickerliste
              (company_tickers_exchange.json) -> expand-us-universe.mjs, build-security-master-approval-list.mjs
     otc      ausserboerslich -> instrument-classification.js#OTC_EXCHANGES
     Land     jeder Platz hier ist US -> instrument-classification.js#US_EXCHANGES

   Ein neuer Platz ist eine Zeile hier, kein Eintrag in einem Leser. Der
   Vertragstest core/tests/exchange-registry.test.mjs (EX) verbietet neue
   Boersentabellen ausserhalb dieser Datei.

   UMD: Browser (globalThis.VUCore.Exchanges), Node (require), Worker.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.Exchanges = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "core-exchanges-1.0.0";

  /* Boersenfamilie -> Schreibweise der SEC-Tickerliste. */
  var FAMILIES = Object.freeze({
    NASDAQ: Object.freeze({ secLabel: "Nasdaq" }),
    NYSE: Object.freeze({ secLabel: "NYSE" }),          // NYSE American und NYSE Arca fuehrt die SEC als "NYSE"
    CBOE: Object.freeze({ secLabel: "CBOE" }),
    IEX: Object.freeze({ secLabel: "IEX" }),
    TXSE: Object.freeze({ secLabel: "TXSE" }),
    OTC: Object.freeze({ secLabel: "OTC" })
  });

  /* Anbieter-Schreibweise des Platzes (Tiingo, Grossbuchstaben). */
  var VENUES = Object.freeze({
    "NASDAQ": v(true, "XNAS", "NASDAQ"),
    "NASDAQ GLOBAL SELECT": v(true, "XNAS", "NASDAQ"),
    "NASDAQ GLOBAL MARKET": v(true, "XNAS", "NASDAQ"),
    "NASDAQ CAPITAL MARKET": v(true, "XNAS", "NASDAQ"),
    "NYSE": v(true, "XNYS", "NYSE"),
    "NYSE ARCA": v(true, "ARCX", "NYSE"),
    "NYSE MKT": v(true, "XASE", "NYSE"),
    "NYSE AMERICAN": v(true, "XASE", "NYSE"),
    "AMEX": v(true, "XASE", "NYSE"),
    "BATS": v(true, "BATS", "CBOE"),                    // Cboe BZX; Tiingo fuehrt sie als BATS
    "CBOE": v(true, "BATS", "CBOE"),
    "IEX": v(true, "IEXG", "IEX"),
    /* Texas Stock Exchange: nationale Wertpapierboerse seit 2024 (SEC-Zulassung), Handel seit 2026, Operating MIC
       TXSE (txse.com); erster Fall TXCP (8-A12B 0001077428-26-000068). */
    "TXSE": v(true, "TXSE", "TXSE"),
    /* Ausserboerslich. Die Liste stammt aus der echten Tickerliste des Anbieters (erster Lauf ueber 108.572 Zeilen). */
    "OTC": v(false, null, "OTC"),
    "PINK": v(false, null, "OTC"),
    "OTCMKTS": v(false, null, "OTC"),
    "NMFQS": v(false, null, "OTC"),
    "OTCQB": v(false, null, "OTC"),
    "OTCQX": v(false, null, "OTC"),
    "OTCBB": v(false, null, "OTC"),
    "OTCGREY": v(false, null, "OTC"),
    "OTCCE": v(false, null, "OTC"),
    "OTCD": v(false, null, "OTC"),
    "EXPM": v(false, null, "OTC")
  });
  function v(regular, mic, family) { return Object.freeze({ regular: regular, mic: mic, family: family, otc: !regular, country: "US" }); }

  function key(code) { return code === null || code === undefined ? "" : String(code).trim().toUpperCase(); }
  function venue(code) { return Object.prototype.hasOwnProperty.call(VENUES, key(code)) ? VENUES[key(code)] : null; }
  function pick(fn) { var o = {}; Object.keys(VENUES).forEach(function (k) { var r = fn(VENUES[k], k); if (r !== undefined) o[k] = r; }); return Object.freeze(o); }

  return Object.freeze({
    VERSION: VERSION,
    VENUES: VENUES,
    FAMILIES: FAMILIES,
    venue: venue,
    isRegular: function (code) { var x = venue(code); return !!(x && x.regular); },
    isOtc: function (code) { var x = venue(code); return !!(x && x.otc); },
    family: function (code) { var x = venue(code); return x ? x.family : null; },
    /* Dieselbe Boerse unter verschiedenen Anbieter-Namen (NYSE MKT, AMEX, NYSE AMERICAN -> XASE): gleicher Operating MIC.
       Keine Boersenfamilie: NYSE und NYSE American sind verschiedene Boersen. Ohne MIC zaehlt nur derselbe Name. */
    sameVenue: function (a, b) {
      var x = venue(a), y = venue(b);
      if (x && y && x.mic && y.mic) return x.mic === y.mic;
      return key(a) === key(b);
    },
    /* Sichten fuer die Leser (Objekte wie die frueheren Tabellen) */
    regularTable: function () { return pick(function (x) { return x.regular ? true : undefined; }); },
    micTable: function () { return pick(function (x) { return x.regular && x.mic ? x.mic : undefined; }); },
    countryTable: function () { return pick(function (x) { return x.country; }); },
    otcTable: function () { return pick(function (x) { return x.otc ? true : undefined; }); },
    familyTable: function () { return pick(function (x) { return x.regular ? x.family : undefined; }); },
    secLabelTable: function () { return pick(function (x) { return FAMILIES[x.family].secLabel; }); },
    /* SEC-Schreibweise (gross) -> Familie, nur regulaere Familien */
    secFamilyTable: function () {
      var o = {};
      Object.keys(FAMILIES).forEach(function (f) { if (f !== "OTC") o[FAMILIES[f].secLabel.toUpperCase()] = f; });
      return Object.freeze(o);
    },
    listedSecLabels: function () { return Object.keys(FAMILIES).filter(function (f) { return f !== "OTC"; }).map(function (f) { return FAMILIES[f].secLabel; }); }
  });
});
