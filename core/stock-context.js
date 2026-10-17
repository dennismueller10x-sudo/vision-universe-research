/* =========================================================================
   VISION UNIVERSE CORE — stock-context.js

   EIN AKTIENKONTEXT FUER ALLE PRODUKTWELTEN (VU3, Stufe 2.1).

   Der Aktien-Navigator verbindet die Detailseiten von Discover, Quant,
   Technik, Elliott, Supertrader und (in Planung) Fundamental. Dafuer
   braucht er drei Dinge, die bisher jedes Produkt selbst wusste:

     1. Identitaet   Welches Wertpapier ist gemeint? Region + securityId
                     ist der Listing-Schluessel. SAP (US, iss_cik_0001000184)
                     und SAP.DE (EUROPE, ref_SAP_DE_XETR) sind zwei
                     Listings; MRK (Merck & Co) und MRK.DE (Merck KGaA)
                     sind zwei Unternehmen. Ein gleiches Kuerzel macht
                     nie ein gleiches Wertpapier.
     2. Adressen     Die Routen der Produkte, so wie ihre Router sie lesen
                     (discover/app.js, discover/ui/europe.js,
                     quant/app/app.js#parse, elliott/engine/home-model.js
                     #parseHash, supertrader/stock/<SYM>/).
     3. Verfuegbarkeit  Nur aus einem Nachweis (Verfuegbarkeits-Manifest
                     aus dem Release-Bau). Ohne Nachweis: "unknown",
                     neutral dargestellt, nie als vorhanden behauptet.

   US-Kontexte bilden ihre securityId ueber core/identity.js
   (securityIdForTicker, ADR-001). Europaeische securityIds
   (ref_<SYM>_<SUFFIX>_<MIC>) kommen aus dem Europa-Katalog bzw. dem
   Suchindex und werden hier nie aus dem Kuerzel gebildet.

   UMD: Browser (globalThis.VUCore.StockContext, braucht vorher
   /core/identity.js), Node (require), Worker.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var identity = typeof module === "object" && module.exports ? require("./identity.js") : root.VUCore && root.VUCore.Identity;
  var api = factory(identity);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.StockContext = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Identity) {
  "use strict";

  if (!Identity || typeof Identity.securityIdForTicker !== "function") throw new Error("VUCore.Identity fehlt (core/identity.js vor stock-context.js laden)");

  var VERSION = "core-stock-context-1.0.0";
  var REGIONS = Object.freeze(["US", "EUROPE"]);
  /* Reihenfolge der Kacheln im Navigator. */
  var PRODUCTS = Object.freeze(["discover", "quant", "technik", "elliott", "supertrader", "fundamental"]);
  var STATES = Object.freeze(["available", "unavailable", "unknown", "planned"]);

  /* US-Kuerzel so, wie Quant, Elliott, Supertrader und Discover sie fuehren (BRK-B, BF-A).
     Quant und Elliott lesen hoechstens 12 Zeichen (quant/app/app.js#parse). */
  var US_TICKER = /^[A-Z0-9][A-Z0-9-]{0,11}$/;
  /* Europa-Kuerzel aus dem Katalog: SAP.DE, MAERSK-B.CO. */
  var EU_TICKER = /^[A-Z0-9][A-Z0-9-]{0,15}\.[A-Z]{1,3}$/;
  /* ref_<SYM>_<SUFFIX>_<MIC>, MIC nach ISO 10383 (vier Zeichen). */
  var EU_SECURITY_ID = /^ref_[A-Z0-9_]+_[A-Z0-9]{4}$/;

  /* Welche Produkte eine Region adressieren koennen. Europa hat heute nur Discover
     (Quant-Universum, Technik-Index und Supertrader-Seiten fuehren keine .DE/.PA-Listings). */
  var ROUTABLE = Object.freeze({
    US: Object.freeze(["discover", "quant", "technik", "elliott", "supertrader"]),
    EUROPE: Object.freeze(["discover"])
  });

  function str(x) { return x == null ? "" : String(x).trim(); }
  function opt(x) { var s = str(x); return s ? s : null; }

  function fail(code, detail) {
    var e = new Error(code + (detail ? ": " + detail : ""));
    e.code = code;
    return e;
  }

  function freezeCtx(c) { return Object.freeze(c); }

  /** US-Listing aus dem Kuerzel. extra: {name, companyId, instrumentId}. */
  function fromUs(ticker, extra) {
    /* Genau die Schreibweise der Daten (BRK-B). Kein Punkt: SAP.DE oder VOD.L sind europaeische Listings und
       werden nie still zu einem US-Kuerzel umgedeutet; BRK.B fuehrt in Quant ins Leere (der Router sucht BRK.B). */
    var t = str(ticker).toUpperCase();
    if (!US_TICKER.test(t)) throw fail("INVALID_US_TICKER", t);
    var x = extra || {};
    /* Unternehmen nur ueber den Emittenten (iss_cik_<CIK>). Der Suchindex traegt fuer Listings ohne CIK die
       instrumentId als companyId - das belegt kein Unternehmen, also companyId null. */
    var companyId = opt(x.companyId);
    if (companyId && !Identity.isIssuerId(companyId)) companyId = null;
    var instrumentId = opt(x.instrumentId);
    if (instrumentId && !Identity.isInstrumentId(instrumentId)) throw fail("INVALID_INSTRUMENT_ID", instrumentId);
    return freezeCtx({
      version: VERSION, region: "US", ticker: t, displaySymbol: t,
      securityId: Identity.securityIdForTicker(t), companyId: companyId, instrumentId: instrumentId,
      mic: opt(x.mic), isin: opt(x.isin), name: opt(x.name)
    });
  }

  /** Europaeisches Listing aus Katalog- oder Suchdaten: {securityId, ticker, mic?, companyId?, isin?, name?}. */
  function fromEurope(rec) {
    var r = rec || {};
    var securityId = str(r.securityId);
    if (!EU_SECURITY_ID.test(securityId) || !Identity.isSecurityId(securityId)) throw fail("INVALID_EU_SECURITY_ID", securityId);
    var mic = securityId.slice(securityId.lastIndexOf("_") + 1);
    if (r.mic != null && str(r.mic) !== mic) throw fail("MIC_MISMATCH", securityId + " / " + str(r.mic));
    var ticker = opt(r.ticker || r.displaySymbol);
    if (ticker) {
      ticker = ticker.toUpperCase();
      if (!EU_TICKER.test(ticker)) throw fail("INVALID_EU_TICKER", ticker);
      /* Die securityId traegt Kuerzel und Boerse: ref_SAP_DE_XETR <-> SAP.DE an XETR. */
      if (Identity.securityIdForTicker(ticker) + "_" + mic !== securityId) throw fail("TICKER_SECURITY_MISMATCH", ticker + " / " + securityId);
    }
    var instrumentId = opt(r.instrumentId);
    if (instrumentId && !Identity.isInstrumentId(instrumentId)) throw fail("INVALID_INSTRUMENT_ID", instrumentId);
    return freezeCtx({
      version: VERSION, region: "EUROPE", ticker: ticker, displaySymbol: ticker || securityId,
      securityId: securityId, companyId: opt(r.companyId), instrumentId: instrumentId,
      mic: mic, isin: opt(r.isin), name: opt(r.name)
    });
  }

  /** Eintrag aus discover/data/search/GLOBAL.json (region, ticker, securityId, companyId, n, isin, mic, listingId). */
  function fromSearchEntry(e) {
    if (!e || typeof e !== "object") throw fail("INVALID_ENTRY");
    var base = { name: e.n || e.name, companyId: e.companyId, isin: e.isin };
    if (e.region === "EUROPE") {
      return fromEurope({ securityId: e.securityId, ticker: e.ticker || e.displaySymbol, mic: e.mic, companyId: base.companyId, isin: base.isin, name: base.name, instrumentId: e.i });
    }
    if (e.region === "US") {
      var ctx = fromUs(e.ticker || e.s, { name: base.name, companyId: base.companyId, isin: base.isin, instrumentId: e.i });
      if (e.securityId && e.securityId !== ctx.securityId) throw fail("TICKER_SECURITY_MISMATCH", ctx.ticker + " / " + e.securityId);
      return ctx;
    }
    throw fail("UNKNOWN_REGION", str(e.region));
  }

  /** Eindeutiger Listing-Schluessel. */
  function key(ctx) { return ctx.region + ":" + ctx.securityId; }
  function sameListing(a, b) { return !!a && !!b && key(a) === key(b); }
  /** Gleiches Unternehmen nur bei belegter, gleicher companyId - nie ueber das Kuerzel. */
  function sameCompany(a, b) { return !!a && !!b && !!a.companyId && a.companyId === b.companyId; }

  function enc(s) { return encodeURIComponent(s); }

  /** Adresse der Detailseite in einem Produkt, oder null, wenn das Produkt diese Region nicht adressiert
      (Fundamental: immer null, in Planung). */
  function href(ctx, product) {
    if (PRODUCTS.indexOf(product) < 0) throw fail("UNKNOWN_PRODUCT", str(product));
    /* Auch ein von Hand gebautes Objekt erzeugt keine fremde Adresse (z. B. /supertrader/stock/../). */
    var ok = ctx && (ctx.region === "US" ? US_TICKER.test(ctx.ticker || "") : ctx.region === "EUROPE" && EU_SECURITY_ID.test(ctx.securityId || ""));
    if (!ok) throw fail("INVALID_CONTEXT");
    if ((ROUTABLE[ctx.region] || []).indexOf(product) < 0) return null;
    if (ctx.region === "EUROPE") return "/discover/#/s/EUROPE/" + enc(ctx.securityId);
    var t = enc(ctx.ticker);
    switch (product) {
      case "discover": return "/discover/#/s/US_REAL/" + t;
      case "quant": return "/quant/#/aktie/" + t;
      /* Technik ist das Chartbild unter /elliott/#/<T> (quant/app/app.js#canonicalElliott),
         Elliott die Profi-Ansicht desselben Bildes. */
      case "technik": return "/elliott/#/" + t;
      case "elliott": return "/elliott/#/" + t + "?ansicht=profi";
      case "supertrader": return "/supertrader/stock/" + t + "/";
    }
    return null;
  }

  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return null; } }

  /** Adresse (Pfad + Hash, ohne Host) -> {product, ctx} oder null. Liest dieselben Formen wie die Router,
      auch die Altadressen #/aktie/<T>/technik und /quant/#/elliott/<T>. */
  function parse(url) {
    var u = str(url).replace(/^https?:\/\/[^/]+/i, "");
    var hashAt = u.indexOf("#"), path = hashAt >= 0 ? u.slice(0, hashAt) : u, hash = hashAt >= 0 ? u.slice(hashAt + 1) : "";
    path = path.replace(/\?.*$/, "").replace(/\/index\.html$/, "/");
    var q = hash.indexOf("?"), hpath = q >= 0 ? hash.slice(0, q) : hash, hquery = new URLSearchParams(q >= 0 ? hash.slice(q + 1) : "");
    var rawParts = hpath.split("/").filter(Boolean), parts = rawParts.map(dec);
    if (parts.indexOf(null) >= 0) return null;
    /* Quant leitet Altadressen mit allen Parametern weiter; elliott=1 und ansicht=profi oeffnen die Profi-Ansicht. */
    var pro = hquery.get("elliott") === "1" || hquery.get("ansicht") === "profi";
    function us(product, t) { try { return { product: product, ctx: fromUs(t) }; } catch (e) { return null; } }
    if (path === "/discover/" && parts[0] === "s" && parts[2] && parts.length === 3) {
      if (parts[1] === "US_REAL") return us("discover", parts[2]);
      if (parts[1] === "EUROPE") { try { return { product: "discover", ctx: fromEurope({ securityId: parts[2] }) }; } catch (e) { return null; } }
      return null;
    }
    if (path === "/quant/" && parts[0] === "aktie" && parts[1]) {
      /* Wie quant/app/app.js#parse: technik/chartbild sind Altadressen des Chartbilds, alles andere die Aktienseite. */
      if (parts[2] === "technik" || parts[2] === "chartbild") return us(pro ? "elliott" : "technik", parts[1]);
      return us("quant", parts[1]);
    }
    if (path === "/quant/" && parts[0] === "elliott" && parts[1] && parts.length === 2) return us(pro ? "elliott" : "technik", parts[1]);
    /* elliott/engine/home-model.js#parseHash: genau ein fuehrender Schraegstrich, keine Dekodierung. */
    if (path === "/elliott/" && /^\/?[A-Za-z0-9.-]{1,12}\/*$/.test(hpath) && rawParts.length === 1) return us(pro ? "elliott" : "technik", rawParts[0]);
    var st = /^\/supertrader\/stock\/([^/]+)\/$/.exec(path);
    if (st && !hash) { var s = dec(st[1]); return s ? us("supertrader", s) : null; }
    return null;
  }

  /* Verfuegbarkeits-Manifest (Release-Bau, Stufe 2.1 Teil 2):
       { schema: "vu-stock-availability-1", modules: { <product>: { <region>: [<Schluessel>, ...] } } }
     Schluessel: US = Kuerzel (BRK-B), EUROPE = securityId. Ein Modul oder eine Region, die im Manifest fehlt,
     ist "unknown" - nicht "unavailable". "unknown" behaelt die Adresse; der Navigator zeigt sie als unbestaetigt.
     Das Manifest gilt als unveraenderlich (die Listen werden einmal zu Sets gecacht). */
  var SCHEMA = "vu-stock-availability-1";
  var setCache = typeof WeakMap === "function" ? new WeakMap() : null;

  function listHas(list, k) {
    if (!list) return null;
    /* Map: nur ein ausdrueckliches true belegt; Set: Mitgliedschaft. */
    if (typeof list.get === "function" && typeof list.has === "function" && !(list instanceof Set)) return list.get(k) === true;
    if (typeof list.has === "function") return list.has(k);
    if (!Array.isArray(list)) return null;
    if (!setCache) return list.indexOf(k) >= 0;
    var s = setCache.get(list);
    if (!s) { s = new Set(list); setCache.set(list, s); }
    return s.has(k);
  }

  function lookupKey(ctx) { return ctx.region === "US" ? ctx.ticker : ctx.securityId; }

  /** Zustand eines Moduls fuer einen Kontext: {product, state, href, reason}. */
  function moduleState(ctx, product, manifest) {
    var h = href(ctx, product);
    if (product === "fundamental") return Object.freeze({ product: product, state: "planned", href: null, reason: "IN_PLANUNG" });
    if (!h) return Object.freeze({ product: product, state: "unavailable", href: null, reason: "REGION_NOT_COVERED" });
    var mod = manifest && manifest.schema === SCHEMA && manifest.modules ? manifest.modules[product] : null;
    var has = mod ? listHas(mod[ctx.region], lookupKey(ctx)) : null;
    if (has === true) return Object.freeze({ product: product, state: "available", href: h, reason: null });
    if (has === false) return Object.freeze({ product: product, state: "unavailable", href: null, reason: "NO_DATA" });
    return Object.freeze({ product: product, state: "unknown", href: h, reason: manifest ? "NOT_IN_MANIFEST" : "NO_MANIFEST" });
  }

  /** Alle Navigator-Kacheln in fester Reihenfolge. */
  function availability(ctx, manifest) {
    return PRODUCTS.map(function (p) { return moduleState(ctx, p, manifest); });
  }

  return Object.freeze({
    VERSION: VERSION, SCHEMA: SCHEMA, REGIONS: REGIONS, PRODUCTS: PRODUCTS, STATES: STATES, ROUTABLE: ROUTABLE,
    fromUs: fromUs, fromEurope: fromEurope, fromSearchEntry: fromSearchEntry,
    key: key, sameListing: sameListing, sameCompany: sameCompany,
    href: href, parse: parse, moduleState: moduleState, availability: availability
  });
});
