/* =========================================================================
   VISION UNIVERSE CORE — listing-register.js

   LISTING-INTERVALL UND STABILE ENTITAET (ADR-001 Ergaenzung A1, PIT-F3).

   Die securityId bleibt tickerbasiert und wird ausschliesslich in
   core/identity.js gebildet (securityIdForTicker). Diese Datei fuegt der
   Identitaetsregel nichts hinzu und aendert keinen Schluessel; sie steht
   bewusst daneben, weil Supertrader den Hash von core/identity.js pinnt
   (wie core/issuer-alias.js). Sie ordnet vorhandene securityIds zu einem Tag
   einem Emittenten (CIK) zu.

   UMD: Browser (globalThis.VUCore.ListingRegister), Node (require), Worker.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var Identity = typeof module === "object" && module.exports ? require("./identity.js") : root.VUCore && root.VUCore.Identity;
  var api = factory(Identity);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.ListingRegister = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Identity) {
  "use strict";

  var VERSION = "core-listing-register-1.0.0";
  var normalizeTicker = Identity.normalizeTicker, securityIdForTicker = Identity.securityIdForTicker, isSecurityId = Identity.isSecurityId;

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
    isListingId: isListingId,
    issuerIdForCik: issuerIdForCik,
    listingId: listingId,
    createListingRegister: createListingRegister
  };
});
