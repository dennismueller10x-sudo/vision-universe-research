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
  var TICKER = /^[A-Z0-9][A-Z0-9.\-\/]{0,23}$/;

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

  function isSecurityId(id) { return typeof id === "string" && /^ref_[A-Z0-9_]{1,24}$/.test(id); }
  function isInstrumentId(id) { return typeof id === "string" && /^vu_[a-f0-9]{6,}$/.test(id); }
  function isIssuerId(id) { return typeof id === "string" && /^iss_cik_\d{10}$/.test(id); }

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
    isSecurityId: isSecurityId,
    isInstrumentId: isInstrumentId,
    isIssuerId: isIssuerId,
    consistent: consistent
  };
});
