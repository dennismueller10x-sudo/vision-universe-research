/* =========================================================================
   VISION UNIVERSE CORE — identity.js

   EINE REGEL FUER DIE IDENTITAET EINES WERTPAPIERS.

   Der Plattform-Audit vom 03.10.2026 fand sieben verschiedene Arten, aus
   einem Ticker den Schluessel `ref_<...>` zu bilden. Folge: BRK-B lief im
   Abruf als `ref_BRKB`, im Wertpapierstamm als `ref_BRK_B` - und fehlte
   deshalb in Faktoren und Discover, obwohl die Kurse da waren. Produkte
   duerfen keine eigene Identitaet erfinden; sie fragen hier.

   Die Kennungen und ihre Bedeutung (siehe docs/architecture/
   ADR-001-canonical-security-id.md):

     securityId     ref_<TICKER, Nicht-Alphanumerisches -> "_">
                    Der Schluessel aller veroeffentlichten Kursartefakte
                    (discover-series, discover-series-long, golden-preview,
                    intraday). Abgeleitet aus dem Ticker - also NICHT
                    stabil ueber eine Tickeraenderung.
     instrumentId   vu_<hash>   Company Master (company-master.js):
                    Anbieter + Boerse + Symbol + Generation. Stabil ueber
                    Laeufe, neu bei Ticker- oder Boersenwechsel.
     issuerId       iss_cik_<CIK>   Emittent (Unternehmen) ueber die CIK.

   Diese Datei bildet die Regel byte-gleich zu
   company-master.js#legacySecurityId nach; core/tests/identity.test.mjs
   haelt beide gegen den gesamten Bestand gleich.

   UMD: Browser (globalThis.VUCore.Identity), Node (require), Worker.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.Identity = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "core-identity-1.0.0";
  /* Erstes Zeichen alphanumerisch (kein "..", kein "/"-Anfang), danach auch
     Trenner, die Anbieter verwenden ("BRK.B", "BRK-B", "BRK/B", "BFS_P_D",
     "BRK B"). Ein ungewoehnlicher, aber harmloser Ticker darf keinen
     Datenlauf abbrechen; er wird zur kanonischen ID normalisiert. */
  var TICKER = /^[A-Z0-9][A-Z0-9.\-\/_ ]{0,23}$/;

  /** Ticker in Grossschrift, ohne Leerraum. Keine Umdeutung von Trennern:
   *  "BRK.B" bleibt "BRK.B" - der Anbieter fuehrt "BRK-B". */
  function normalizeTicker(ticker) {
    if (ticker === null || ticker === undefined) return null;
    var t = String(ticker).trim().toUpperCase();
    return TICKER.test(t) ? t : null;
  }

  /** Die kanonische securityId. Einzige zulaessige Bildung. */
  function securityIdForTicker(ticker) {
    var t = normalizeTicker(ticker);
    if (!t) throw new Error("INVALID_TICKER:" + String(ticker));
    return "ref_" + t.replace(/[^A-Z0-9]/g, "_");
  }

  /** Vergleichsschluessel ohne Trennzeichen ("BRK.B", "BRK-B", "BRKB" ->
   *  "BRKB"). Nur zum Abgleich fremder Listen (Indexbestaende), nie als
   *  Identitaet - er ist nicht eindeutig. */
  function matchKey(ticker) {
    var t = normalizeTicker(ticker);
    return t ? t.replace(/[^A-Z0-9]/g, "") : null;
  }

  /** Scherbe des Company Master (quant/data/universe/instruments/<key>.json),
   *  byte-gleich zu company-master.js#shardKey: "NVDA" -> "NV", "F" -> "F_". */
  function shardKey(ticker) {
    var t = normalizeTicker(ticker);
    var s = t ? t.replace(/[^A-Z0-9]/g, "") : "";
    return s ? (s + "_").slice(0, 2) : "_";
  }

  function isSecurityId(id) { return typeof id === "string" && /^ref_[A-Z0-9_]{1,24}$/.test(id); }
  function isInstrumentId(id) { return typeof id === "string" && /^vu_[a-f0-9]{6,}$/.test(id); }
  function isIssuerId(id) { return typeof id === "string" && /^iss_cik_\d{10}$/.test(id); }

  /* Additive local contracts. A security is the share class (ISIN); its
     price series and watchlist selection are the ISIN at one MIC. Legacy
     ticker IDs and URLs deliberately keep their exact existing bytes. */
  function normalizeISIN(value) {
    if (typeof value !== "string") return null;
    var isin = value.trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return null;
    var digits = isin.replace(/[A-Z]/g, function (c) { return String(c.charCodeAt(0) - 55); });
    var sum = 0, twice = false;
    for (var n = digits.length - 1; n >= 0; n--) {
      var d = Number(digits[n]); if (twice) { d *= 2; if (d > 9) d -= 9; }
      sum += d; twice = !twice;
    }
    return sum % 10 === 0 ? isin : null;
  }
  function securityIdForISIN(value) {
    var isin = normalizeISIN(value); if (!isin) throw Error("INVALID_ISIN");
    return "sec_isin_" + isin;
  }
  function listingIdFor(value) {
    var isin = normalizeISIN(value && value.isin);
    var mic = typeof (value && value.mic) === "string" ? value.mic.trim().toUpperCase() : "";
    if (!isin || !/^[A-Z0-9]{4}$/.test(mic)) throw Error("INVALID_LOCAL_LISTING");
    return "lst_" + mic + "_" + isin;
  }
  function isListingId(value) {
    if (typeof value !== "string" || !/^lst_[A-Z0-9]{4}_[A-Z0-9]{12}$/.test(value)) return false;
    return !!normalizeISIN(value.slice(9));
  }
  function companyIdForLEI(value) {
    var lei = typeof value === "string" ? value.trim().toUpperCase() : "";
    if (!/^[A-Z0-9]{18}[0-9]{2}$/.test(lei)) throw Error("INVALID_LEI");
    var digits = lei.replace(/[A-Z]/g, function (c) { return String(c.charCodeAt(0) - 55); });
    var remainder = 0;
    for (var n = 0; n < digits.length; n++) remainder = (remainder * 10 + Number(digits[n])) % 97;
    if (remainder !== 1) throw Error("INVALID_LEI");
    return "iss_lei_" + lei;
  }

  /** Passt eine behauptete securityId zum Ticker? Fuer Konfigurations- und
   *  Artefaktpruefungen (data-quality.js). */
  function consistent(ticker, securityId) {
    try { return securityIdForTicker(ticker) === securityId; } catch (e) { return false; }
  }

  return {
    VERSION: VERSION,
    normalizeTicker: normalizeTicker,
    securityIdForTicker: securityIdForTicker,
    matchKey: matchKey,
    shardKey: shardKey,
    isSecurityId: isSecurityId,
    isInstrumentId: isInstrumentId,
    isIssuerId: isIssuerId,
    normalizeISIN: normalizeISIN,
    securityIdForISIN: securityIdForISIN,
    listingIdFor: listingIdFor,
    isListingId: isListingId,
    companyIdForLEI: companyIdForLEI,
    consistent: consistent
  };
});
