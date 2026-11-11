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

  var VERSION = "core-identity-1.1.0";
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


  /* ---- Listing-Intervall (ADR-001 Ergaenzung A1, PIT-F3) ------------------
     Die securityId bleibt tickerbasiert und aendert sich NICHT (alle
     Artefaktschluessel und Shards bleiben gueltig). Zusaetzlich gibt es eine
     zeitabhaengige Zuordnung "Ticker -> Emittent (CIK)" ueber Listing-
     Intervalle. Ein Listing ist (Emittent, Ticker, von, bis); Grenzen sind
     inklusive, null = offen. Damit gilt:
       - Umbenennung (FB -> META): zwei Listings, ein Emittent. Die stabile
         Entitaet ist der Emittent (issuerId), nicht die securityId.
       - Wiederverwendung (Ticker an anderen Emittenten): zwei Listings, ein
         Ticker, disjunkte Fenster. resolve() ist je Tag eindeutig.
       - Ueberlappen zwei Emittenten am selben Tag, ist das Ergebnis
         AMBIGUOUS und wird nie geraten. Unbekannt bleibt UNKNOWN.
     Das Register ist ein Uebersetzungsregister: es erzeugt keine neuen
     Artefaktschluessel, es ordnet vorhandene securityIds zu einem Zeitpunkt
     einem Emittenten zu. */
  function isoDay(d) { return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null; }
  function normCik(c) {
    var d = String(c === null || c === undefined ? "" : c).replace(/\D/g, "");
    return d && d.length <= 10 ? ("0000000000" + d).slice(-10) : null;
  }
  function issuerIdForCik(cik) { var c = normCik(cik); return c ? "iss_cik_" + c : null; }

  /** Kennung eines Listings: lst_<CIK>_<securityId ohne ref_>_<von|00000000>. */
  function listingId(cik, ticker, validFrom) {
    var c = normCik(cik);
    if (!c) throw new Error("INVALID_CIK:" + String(cik));
    var from = validFrom === null || validFrom === undefined ? null : isoDay(validFrom);
    if (validFrom !== null && validFrom !== undefined && !from) throw new Error("INVALID_DATE:" + String(validFrom));
    return "lst_" + c + "_" + securityIdForTicker(ticker).slice(4) + "_" + (from ? from.replace(/-/g, "") : "00000000");
  }

  function createListingRegister(rows) {
    var list = [];
    (rows || []).forEach(function (r) {
      var cik = normCik(r && r.cik), t = r && normalizeTicker(r.ticker);
      var from = r && r.validFrom ? isoDay(r.validFrom) : null, to = r && r.validTo ? isoDay(r.validTo) : null;
      if (!cik || !t || (r.validFrom && !from) || (r.validTo && !to) || (from && to && to < from)) return;
      list.push({ cik: cik, issuerId: "iss_cik_" + cik, ticker: t, securityId: securityIdForTicker(t), validFrom: from, validTo: to, listingId: listingId(cik, t, from) });
    });
    function covers(l, day) { return (!l.validFrom || l.validFrom <= day) && (!l.validTo || day <= l.validTo); }

    /** resolve(tickerOderSecurityId, asOf) -> { status: OK|UNKNOWN|AMBIGUOUS, issuerId, listingId, ... } */
    function resolve(key, asOf) {
      var day = isoDay(asOf);
      if (!day) return { status: "UNKNOWN", reason: "INVALID_AS_OF" };
      var sid = isSecurityId(key) ? key : (normalizeTicker(key) ? securityIdForTicker(key) : null);
      if (!sid) return { status: "UNKNOWN", reason: "INVALID_KEY" };
      var hits = list.filter(function (l) { return l.securityId === sid && covers(l, day); });
      var ciks = Array.from(new Set(hits.map(function (l) { return l.cik; })));
      if (!ciks.length) return { status: "UNKNOWN", securityId: sid, reason: list.some(function (l) { return l.securityId === sid; }) ? "OUTSIDE_LISTING_INTERVALS" : "NO_LISTING" };
      if (ciks.length > 1) return { status: "AMBIGUOUS", securityId: sid, issuerIds: ciks.map(function (c) { return "iss_cik_" + c; }) };
      return { status: "OK", securityId: sid, issuerId: hits[0].issuerId, listingId: hits[0].listingId, validFrom: hits[0].validFrom, validTo: hits[0].validTo };
    }
    /** Alle securityIds eines Emittenten (stabile Entitaet ueber Tickerwechsel), nach Beginn sortiert. */
    function listingsOf(issuerIdOrCik) {
      var c = normCik(String(issuerIdOrCik).replace(/^iss_cik_/, ""));
      return list.filter(function (l) { return l.cik === c; }).sort(function (a, b) { return String(a.validFrom || "").localeCompare(String(b.validFrom || "")) || (a.listingId < b.listingId ? -1 : 1); });
    }
    /** Ticker, die mehr als einen Emittenten tragen (Wiederverwendung), und Emittenten mit mehr als einer securityId (Umbenennung). */
    function census() {
      var bySid = {}, byCik = {};
      list.forEach(function (l) { (bySid[l.securityId] = bySid[l.securityId] || new Set()).add(l.cik); (byCik[l.cik] = byCik[l.cik] || new Set()).add(l.securityId); });
      return {
        listings: list.length,
        reusedSecurityIds: Object.keys(bySid).filter(function (k) { return bySid[k].size > 1; }).sort(),
        renamedIssuers: Object.keys(byCik).filter(function (k) { return byCik[k].size > 1; }).sort()
      };
    }
    return { resolve: resolve, listingsOf: listingsOf, census: census, size: list.length };
  }

  function isListingId(id) { return typeof id === "string" && /^lst_\d{10}_[A-Z0-9_]{1,24}_\d{8}$/.test(id); }

  return {
    VERSION: VERSION,
    normalizeTicker: normalizeTicker,
    securityIdForTicker: securityIdForTicker,
    matchKey: matchKey,
    shardKey: shardKey,
    isSecurityId: isSecurityId,
    isInstrumentId: isInstrumentId,
    isIssuerId: isIssuerId,
    isListingId: isListingId,
    issuerIdForCik: issuerIdForCik,
    listingId: listingId,
    createListingRegister: createListingRegister,
    issuerAliases: issuerAliases,
    resolveIssuerId: resolveIssuerId,
    predecessorIssuerIds: predecessorIssuerIds,
    consistent: consistent
  };
});
