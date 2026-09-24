/* =========================================================================
   VISION UNIVERSE — multi-asset/asset-taxonomy.js   (Multi-Asset Core §15-17, §36-37, §47-48)

   WAS EIN WERT IST, BEVOR ER EINE ZAHL IST.

   Ein Yield ist kein Price. Ein Leitzins ist keine Aktie. Ein Index ist
   kein Unternehmen. Diese Datei haelt die Unterscheidungen an EINER
   Stelle fest, damit keine Oberflaeche sie aus einem Symbol, einem
   Waehrungszeichen oder einem UI-Text erraten muss:

     assetClass      WAS fuer ein Instrument (INDEX, YIELD, ...)
     valueSemantics  WAS die Zahl bedeutet (INDEX_LEVEL, PRICE, YIELD,
                     POLICY_RATE, FX_RATE)
     unit            IN WELCHER EINHEIT (INDEX_POINTS, PRICE_PER_OUNCE,
                     PERCENT, ...)
     change          WIE eine Veraenderung gemessen wird (Prozent vom
                     Wert oder Basispunkte)
     conversion      OB eine Anzeigewaehrung ueberhaupt Sinn ergibt

   DIE WICHTIGSTE REGEL DIESER DATEI

   Umgerechnet wird nur, was Geld ist. Ein Rendite-Niveau von 4,15 % ist
   in EUR 4,15 %; ein DAX-Stand von 23.000 Punkten ist keine Geldsumme.
   Die Umrechnung selbst macht ausschliesslich der Currency Core
   (quant/engines/fx) - hier steht nur, OB sie stattfinden darf.

   Laeuft in Node und im Browser.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var VERSION = "asset-taxonomy-1.0.0";

  /* EQUITY bleibt im Company Master. Er steht hier, damit ein Consumer
     alle Klassen aus einer Liste kennt - nicht, weil dieser Katalog
     Aktien fuehrt. ETF und FUTURE sind vorbereitet, aber kein Katalog-
     eintrag nutzt sie als stillen Ersatz (§4, §11). */
  var ASSET_CLASSES = ["EQUITY", "INDEX", "COMMODITY", "PRECIOUS_METAL", "CRYPTO", "FX", "YIELD", "RATE", "ETF", "FUTURE"];

  var SUBTYPES = {
    INDEX: ["INDEX_PRICE", "INDEX_TOTAL_RETURN", "INDEX_NET_RETURN"],
    COMMODITY: ["SPOT_REFERENCE", "FRONT_MONTH_FUTURE", "CONTINUOUS_FUTURE", "REFERENCE_PRICE", "FIXING", "CFD_SYNTHETIC", "UNRESOLVED", "OTHER"],
    PRECIOUS_METAL: ["SPOT_METAL", "FIXING", "FRONT_MONTH_FUTURE", "CONTINUOUS_FUTURE", "UNRESOLVED"],
    CRYPTO: ["CRYPTO_SPOT_AGGREGATED", "CRYPTO_SPOT_VENUE"],
    FX: ["FX_SPOT", "FX_REFERENCE_FIXING"],
    YIELD: ["GOVERNMENT_BOND_YIELD_CMT", "GOVERNMENT_BOND_YIELD_TERM_STRUCTURE", "MARKET_YIELD"],
    RATE: ["POLICY_RATE_TARGET_RANGE", "POLICY_RATE_DEPOSIT_FACILITY", "OVERNIGHT_REFERENCE_RATE"],
    EQUITY: ["COMMON_STOCK", "ADR"],
    ETF: ["ETF_PROXY"],
    FUTURE: ["FRONT_MONTH_FUTURE", "CONTINUOUS_FUTURE"]
  };

  /* §46: MARKET_YIELD, REFERENCE_YIELD und POLICY_RATE getrennt. Die
     Einordnung haengt am Subtyp, nicht an der Assetklasse. */
  var YIELD_KIND = {
    GOVERNMENT_BOND_YIELD_CMT: "REFERENCE_YIELD",
    GOVERNMENT_BOND_YIELD_TERM_STRUCTURE: "REFERENCE_YIELD",
    MARKET_YIELD: "MARKET_YIELD",
    POLICY_RATE_TARGET_RANGE: "POLICY_RATE",
    POLICY_RATE_DEPOSIT_FACILITY: "POLICY_RATE",
    OVERNIGHT_REFERENCE_RATE: "REFERENCE_RATE"
  };

  var VALUE_SEMANTICS = ["PRICE", "INDEX_LEVEL", "YIELD", "POLICY_RATE", "FX_RATE"];

  /* Die Einheiten. `monetary` entscheidet ueber die Umrechenbarkeit;
     `display` ist die Einheitsangabe, die eine Oberflaeche NEBEN den Wert
     setzt (das Waehrungszeichen selbst kommt aus dem Currency Core). */
  var UNITS = {
    INDEX_POINTS:        { monetary: false, per: null,           display: "Pkt.",  decimals: 2 },
    PRICE_PER_OUNCE:     { monetary: true,  per: "TROY_OUNCE",   display: "/oz",   decimals: 2 },
    PRICE_PER_BARREL:    { monetary: true,  per: "BARREL",       display: "/bbl",  decimals: 2 },
    PRICE_PER_MMBTU:     { monetary: true,  per: "MMBTU",        display: "/MMBtu", decimals: 3 },
    PRICE_PER_POUND:     { monetary: true,  per: "POUND",        display: "/lb",   decimals: 4 },
    PRICE_PER_METRIC_TON:{ monetary: true,  per: "METRIC_TON",   display: "/t",    decimals: 0 },
    PRICE_PER_UNIT:      { monetary: true,  per: "UNIT",         display: "",      decimals: 2 },
    CRYPTO_QUOTE:        { monetary: true,  per: "COIN",         display: "",      decimals: 2 },
    CURRENCY:            { monetary: true,  per: null,           display: "",      decimals: 2 },
    FX_RATE:             { monetary: false, per: null,           display: "",      decimals: 4 },
    PERCENT:             { monetary: false, per: null,           display: "%",     decimals: 2 },
    BASIS_POINTS:        { monetary: false, per: null,           display: "bp",    decimals: 0 },
    UNRESOLVED:          { monetary: false, per: null,           display: "",      decimals: 2 }
  };

  /* Die kanonische Einheits-ID nach §16 ("USD_PER_TROY_OUNCE"). Sie ist
     aus Waehrung und Mengeneinheit zusammengesetzt, damit niemand sie
     aus einem Anzeigetext rekonstruieren muss. */
  function unitId(unit, currency, quantity) {
    var u = UNITS[unit];
    if (!u || unit === "UNRESOLVED") return "UNRESOLVED";
    if (unit === "INDEX_POINTS") return "POINTS";
    if (unit === "PERCENT") return "PERCENT";
    if (unit === "BASIS_POINTS") return "BASIS_POINTS";
    if (unit === "FX_RATE") return (quantity || "?") + "_IN_" + (currency || "?");
    if (unit === "CRYPTO_QUOTE") return (currency || "?") + "_PER_" + (quantity || "COIN");
    if (u.per) return (currency || "?") + "_PER_" + u.per;
    return currency || "UNRESOLVED";
  }

  /* §36/§37: Wie eine Veraenderung benannt wird.
       PERCENT_OF_VALUE  Aktie, Index, Rohstoff, Krypto, FX
       BASIS_POINTS      Rendite und Zins: 4,20 % -> 4,35 % = +15 bp.
     Die relative Veraenderung (+3,57 %) darf bei Renditen mitgeliefert
     werden, aber nur unter eigenem Namen und nie als Hauptgroesse. */
  var CHANGE_SEMANTICS = {
    PRICE: "PERCENT_OF_VALUE",
    INDEX_LEVEL: "PERCENT_OF_VALUE",
    FX_RATE: "PERCENT_OF_VALUE",
    YIELD: "BASIS_POINTS",
    POLICY_RATE: "BASIS_POINTS"
  };

  /* §32/§48: Umrechnung je Assetklasse, ausdruecklich.
       CONVERTIBLE     monetaerer Preis in einer Waehrung (Gold USD/oz ->
                       EUR/oz), ueber den Currency Core
       NOT_CONVERTIBLE Punkte, Prozent, Zinssaetze - der Wert ist in jeder
                       Anzeigewaehrung derselbe
       SELF            das Paar selbst (EUR/USD) wird nicht in EUR
                       umgerechnet */
  var CONVERSION = {
    EQUITY: "CONVERTIBLE",
    INDEX: "NOT_CONVERTIBLE",
    COMMODITY: "CONVERTIBLE",
    PRECIOUS_METAL: "CONVERTIBLE",
    CRYPTO: "CONVERTIBLE",
    FX: "SELF",
    YIELD: "NOT_CONVERTIBLE",
    RATE: "NOT_CONVERTIBLE",
    ETF: "CONVERTIBLE",
    FUTURE: "CONVERTIBLE"
  };

  /* Die Sitzungsprofile (§26). Welche Uhr gilt, steht in
     realtime/session-profiles.js; hier nur die Namen und was sie
     grundsaetzlich bedeuten. */
  var SESSION_PROFILES = {
    US_EQUITY:          { kind: "EXCHANGE", continuous: false, note: "NYSE/Nasdaq inkl. Vor-/Nachboerse" },
    INDEX_US:           { kind: "EXCHANGE", continuous: false, note: "Indexberechnung waehrend der regulaeren US-Sitzung" },
    INDEX_EU:           { kind: "EXCHANGE", continuous: false, note: "Heimatboerse des Index (Xetra, LSE, Euronext, SIX)" },
    INDEX_ASIA:         { kind: "EXCHANGE", continuous: false, note: "Heimatboerse des Index (Tokio, Hongkong, Shanghai)" },
    COMMODITY_FUTURES:  { kind: "WEEKLY_WINDOW", continuous: false, note: "CME Globex: So. 18:00 - Fr. 17:00 New York, taegliche Pause 17:00-18:00" },
    METALS_OTC_24_5:    { kind: "WEEKLY_WINDOW", continuous: false, note: "OTC-Spot: So. 18:00 - Fr. 17:00 New York, taegliche Pause 17:00-18:00" },
    FX_24_5:            { kind: "FX_CORE", continuous: false, note: "Devisenwoche aus dem Currency Core (fx-freshness.js#marketPhase)" },
    CRYPTO_24_7:        { kind: "CONTINUOUS", continuous: true, note: "Rund um die Uhr, auch Wochenende" },
    REFERENCE_DAILY:    { kind: "PUBLICATION", continuous: false, note: "Ein veroeffentlichter Wert je Geschaeftstag des Herausgebers" },
    REFERENCE_MONTHLY:  { kind: "PUBLICATION", continuous: false, note: "Ein veroeffentlichter Wert je Monat" },
    POLICY_EVENT:       { kind: "EVENT", continuous: false, note: "Stufenserie: gilt bis zum naechsten Beschluss" },
    UNRESOLVED:         { kind: "UNRESOLVED", continuous: false, note: "Quelle noch nicht bestimmt" }
  };

  function isKnownClass(c) { return ASSET_CLASSES.indexOf(c) !== -1; }
  function isKnownSubType(c, s) { return !!(SUBTYPES[c] && SUBTYPES[c].indexOf(s) !== -1); }
  function changeSemantics(valueSemantics) { return CHANGE_SEMANTICS[valueSemantics] || "PERCENT_OF_VALUE"; }
  function conversionFor(assetClass, unit) {
    var c = CONVERSION[assetClass] || "NOT_CONVERTIBLE";
    /* Eine monetaere Klasse mit ungeklaerter Einheit wird nicht
       umgerechnet: USD/t und USD/lb sind beide "USD", aber ein Faktor
       2.204,62 auseinander. */
    if (c === "CONVERTIBLE" && (!UNITS[unit] || !UNITS[unit].monetary)) return "NOT_CONVERTIBLE";
    return c;
  }

  /**
   * Prueft einen Katalogeintrag gegen die Taxonomie. Liefert eine Liste
   * von Befunden; leer heisst gueltig.
   */
  function validateInstrument(i) {
    var f = [];
    if (!i || typeof i !== "object") return ["noObject"];
    if (!i.symbol) f.push("symbolMissing");
    if (!isKnownClass(i.assetClass)) f.push("unknownAssetClass:" + i.assetClass);
    if (i.subType !== "UNRESOLVED" && !isKnownSubType(i.assetClass, i.subType)) f.push("unknownSubType:" + i.subType);
    if (VALUE_SEMANTICS.indexOf(i.valueSemantics) === -1) f.push("unknownValueSemantics:" + i.valueSemantics);
    if (!UNITS[i.unit]) f.push("unknownUnit:" + i.unit);
    if (!SESSION_PROFILES[i.sessionProfile]) f.push("unknownSessionProfile:" + i.sessionProfile);
    if (!i.timezone) f.push("timezoneMissing");
    /* Die harten Semantikregeln (§15, §17, §46). */
    if ((i.assetClass === "YIELD" || i.assetClass === "RATE") && i.unit !== "PERCENT") f.push("yieldOrRateMustBePercent");
    if ((i.assetClass === "YIELD" || i.assetClass === "RATE") && i.currency) f.push("yieldOrRateHasNoCurrency");
    if (i.assetClass === "INDEX" && i.unit !== "INDEX_POINTS") f.push("indexMustBePoints");
    if (i.assetClass === "INDEX" && i.valueSemantics !== "INDEX_LEVEL") f.push("indexMustBeIndexLevel");
    if (i.assetClass === "YIELD" && i.valueSemantics !== "YIELD") f.push("yieldSemanticsMismatch");
    if (i.assetClass === "RATE" && i.valueSemantics !== "POLICY_RATE") f.push("rateSemanticsMismatch");
    if ((i.assetClass === "PRECIOUS_METAL" || i.assetClass === "COMMODITY" || i.assetClass === "CRYPTO") &&
        i.valueSemantics !== "PRICE") f.push("priceSemanticsMismatch");
    if (i.assetClass === "CRYPTO" && i.sessionProfile !== "CRYPTO_24_7") f.push("cryptoMustBe24x7");
    if (i.assetClass !== "CRYPTO" && i.sessionProfile === "CRYPTO_24_7") f.push("only24x7ForCrypto");
    return f;
  }

  var api = {
    VERSION: VERSION, ASSET_CLASSES: ASSET_CLASSES, SUBTYPES: SUBTYPES, YIELD_KIND: YIELD_KIND,
    VALUE_SEMANTICS: VALUE_SEMANTICS, UNITS: UNITS, CHANGE_SEMANTICS: CHANGE_SEMANTICS,
    CONVERSION: CONVERSION, SESSION_PROFILES: SESSION_PROFILES,
    unitId: unitId, isKnownClass: isKnownClass, isKnownSubType: isKnownSubType,
    changeSemantics: changeSemantics, conversionFor: conversionFor, validateInstrument: validateInstrument
  };

  if (isNode) module.exports = api;
  else { global.VUMultiAsset = global.VUMultiAsset || {}; global.VUMultiAsset.Taxonomy = api; }
})(typeof window !== "undefined" ? window : globalThis);
