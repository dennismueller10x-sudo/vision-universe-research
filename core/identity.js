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

  /** Alias-Karte {Vorgaenger-issuerId: Nachfolger-issuerId} aus dem
   *  Successor-Register (quant/config/sec-successor-issuers.json,
   *  Holding-Umgruendungen mit neuer CIK, 8-K12B). Fail closed bei
   *  Formfehlern, Ketten und Zyklen: ein Vorgaenger darf nicht selbst
   *  Nachfolger sein, und eine CIK hat hoechstens einen Nachfolger. */
  function issuerAliases(doc) {
    var out = {};
    var successors = (doc && doc.successors) || {};
    var heads = {};
    Object.keys(successors).forEach(function (succCik) {
      var succ = "iss_cik_" + succCik;
      if (!isIssuerId(succ)) throw new Error("Successor-Register: ungueltige CIK " + succCik);
      heads[succ] = true;
      (successors[succCik].predecessors || []).forEach(function (predCik) {
        var pred = "iss_cik_" + predCik;
        if (!isIssuerId(pred) || pred === succ) throw new Error("Successor-Register: ungueltiger Vorgaenger " + predCik);
        if (out[pred] && out[pred] !== succ) throw new Error("Successor-Register: zwei Nachfolger fuer " + pred);
        out[pred] = succ;
      });
    });
    Object.keys(out).forEach(function (pred) {
      if (heads[pred]) throw new Error("Successor-Register: Kette oder Zyklus bei " + pred);
    });
    return out;
  }

  /** Die gueltige issuerId: ein Vorgaenger loest auf seine Nachfolgerin auf,
   *  jede andere ID bleibt. Die alte ID bleibt damit aufloesbar. */
  function resolveIssuerId(id, aliases) {
    return (aliases && Object.prototype.hasOwnProperty.call(aliases, id)) ? aliases[id] : id;
  }

  /** Sortierte Vorgaenger-issuerIds einer Nachfolgerin. */
  function predecessorIssuerIds(id, aliases) {
    return Object.keys(aliases || {}).filter(function (p) { return aliases[p] === id; }).sort();
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
    issuerAliases: issuerAliases,
    resolveIssuerId: resolveIssuerId,
    predecessorIssuerIds: predecessorIssuerIds,
    consistent: consistent
  };
});
