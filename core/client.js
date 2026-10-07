/* =========================================================================
   VISION UNIVERSE CORE — client.js

   DATA CONTRACTS ZWISCHEN CORE UND PRODUKTEN.

   Ein Produkt soll nicht wissen muessen, WOHER ein Kurs kommt - nur, dass
   es ihn ueber einen Vertrag bekommt:

     getSecurity(ticker)          Identitaet (securityId, instrumentId, issuerId, ...)
     getPriceSeries(ticker, opts) Tagesreihe 1J oder Wochenreihe MAX, split-bereinigt
     getLatestPrice(ticker)       letzter veroeffentlichter Schluss + Tagesaenderung
     getFundamentals(ticker)      verbraucherfertige Fundamentals der Aktienseite
     getCorporateActions(ticker)  was heute ueber Splits/Dividenden ausgeliefert ist
     getQuantData(ticker)         Faehigkeiten (Quant/Discover) des Titels
     getIntraday(ticker)          Intraday-Eintrag (Sitzung, Stand, Vollstaendigkeit)
     getNews({ ticker })          Meldungen, optional je Ticker

   Jede Antwort ist ein Umschlag:
     { state: "AVAILABLE" | "UNAVAILABLE", reason, source, asOf, data }
   Nie ein stilles null, nie ein Ersatzwert. Das ist dieselbe Sprache wie
   quant/api/product-services.js (AVAILABLE/UNAVAILABLE/SOURCE_MISSING).

   Statische Auslieferung heute: der Client liest die kanonischen Artefakte
   ueber den uebergebenen Loader. Morgen kann derselbe Vertrag gegen eine
   HTTP-API (/v1/...) laufen - Web und App sprechen dann denselben Vertrag
   (docs/architecture/ADR-003-core-product-separation.md,
   ADR-004-mobile-architecture.md).

   Dies ist der EINZIGE Ort im Core, der Speicherpfade kennt (PATHS).
   UMD: globalThis.VUCore.Client
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.Client = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var CONTRACT_VERSION = "core-contract-1.0.0";
  var Identity = (typeof module === "object" && module.exports) ? require("./identity.js") : (root.VUCore && root.VUCore.Identity);

  var PATHS = {
    instrumentShard: function (t) { return "/quant/data/universe/instruments/" + Identity.shardKey(t) + ".json"; },
    discoverIndex: function (u) { return "/discover/data/stock-index/" + u + ".json"; },
    dailySeries: function (id) { return "/quant/data/market/discover-series/" + id + ".json"; },
    weeklySeries: function (id) { return "/quant/data/market/discover-series-long/" + id + ".json"; },
    stockPage: function (u, t) { return "/discover/data/stocks/" + u + "/" + t + ".json"; },
    capabilities: function () { return "/quant/data/product/capabilities-v1.json"; },
    intradayIndex: function () { return "/quant/data/market/intraday/index.json"; },
    news: function () { return "/dashboard/data/news_feed.json"; }
  };
  PATHS.localListings = function () { return "/core/data/de-eu/listings.json"; };
  PATHS.localSeries = function (id) { return "/core/data/de-eu/series/" + id + ".json"; };
  PATHS.localScreener = function () { return "/core/data/de-eu/screener.json"; };

  // The registered producer and consumers share this one close projection.
  function listingLatestPriceData(s, ticker) {
    var p = s.points, last = p[p.length - 1], prev = p.length > 1 ? p[p.length - 2] : null;
    return { listingId: s.listingId, securityId: s.securityId, ticker: ticker, mic: s.mic,
      close: last[1], date: last[0], previousClose: prev ? prev[1] : null, previousDate: prev ? prev[0] : null,
      changePercent: prev && s.changeVerified ? Math.round((last[1] / prev[1] - 1) * 1e6) / 1e4 : null,
      basis: s.basis, currency: s.currency, quoteUnit: s.quoteUnit, kind: "EOD_CLOSE", dataKind: "EOD_CLOSE",
      freshness: s.freshness, expectedSession: s.expectedSession, retrievedAt: s.retrievedAt,
      provider: s.provider || null, apiVersion: s.apiVersion || null, quality: s.quality || null,
      readiness: s.readiness || null };
  }

  function available(source, asOf, data) { return { state: "AVAILABLE", reason: null, source: source, asOf: asOf || null, data: data }; }
  function unavailable(reason, source) { return { state: "UNAVAILABLE", reason: reason, source: source || null, asOf: null, data: null }; }

  /**
   * @param opts { load(path) -> Promise<json>, universeId = "US_REAL" }
   */
  function create(opts) {
    opts = opts || {};
    if (typeof opts.load !== "function") throw new Error("CORE_CLIENT_NEEDS_LOADER");
    var universe = opts.universeId || "US_REAL";
    var memo = {};
    /* Ein Pfad wird je Client einmal geladen; ein Fehler wird nicht
       gemerkt, damit ein spaeterer Versuch neu laden kann. */
    function load(path) {
      if (!memo[path]) memo[path] = Promise.resolve().then(function () { return opts.load(path); })
        .catch(function (e) { delete memo[path]; throw e; });
      return memo[path];
    }
    function tryLoad(path) {
      return load(path).then(function (d) { return { ok: true, data: d }; }, function (e) { return { ok: false, error: String(e && e.message || e) }; });
    }
    function ident(ticker) {
      var t = Identity.normalizeTicker(ticker);
      return t ? { ticker: t, securityId: Identity.securityIdForTicker(t) } : null;
    }

    async function getSecurity(ticker) {
      var id = ident(ticker);
      if (!id) return unavailable("INVALID_TICKER");
      var src = PATHS.instrumentShard(id.ticker);
      var shard = await tryLoad(src);
      if (!shard.ok) return unavailable("SOURCE_MISSING", src);
      var all = (shard.data.instruments || []).filter(function (i) { return i.symbol === id.ticker; });
      if (!all.length) return unavailable("NOT_IN_COMPANY_MASTER", src);
      var active = all.filter(function (i) { return i.active; });
      var i = active[0] || all[0];
      return available(src, null, {
        ticker: id.ticker, securityId: id.securityId, instrumentId: i.instrumentId, issuerId: i.issuerId || null,
        cik: i.cik || null, name: i.companyName || null, exchange: i.exchange || null, mic: i.mic || null,
        country: i.country || null, currency: i.currency || null, securityType: i.securityType || null,
        shareClass: i.shareClass || null, active: !!i.active, delistedAt: i.delistedAt || null,
        ambiguous: active.length > 1, contract: CONTRACT_VERSION
      });
    }

    /** opts.range: "1Y" (Tagesreihe, Standard) | "MAX" (Wochenreihe) */
    async function getPriceSeries(ticker, o) {
      var id = ident(ticker);
      if (!id) return unavailable("INVALID_TICKER");
      var weekly = o && (o.range === "MAX" || o.range === "5Y" || o.grain === "weekly");
      var src = weekly ? PATHS.weeklySeries(id.securityId) : PATHS.dailySeries(id.securityId);
      var s = await tryLoad(src);
      if (!s.ok) return unavailable("SOURCE_MISSING", src);
      var pts = s.data.points || [];
      if (!pts.length) return unavailable("EMPTY_SERIES", src);
      return available(src, s.data.asOf || s.data.to, {
        securityId: id.securityId, ticker: id.ticker, grain: s.data.grain || (weekly ? "weekly" : "daily"),
        basis: s.data.priceSeriesType || null, currency: s.data.currency || null, points: pts,
        from: s.data.from || pts[0][0], to: s.data.to || pts[pts.length - 1][0]
      });
    }

    /* Der letzte veroeffentlichte Schluss und die Tagesaenderung - aus der
       EINEN Tagesreihe, die auch die Aktienseite traegt (DQ-PX-5). Keine
       zweite Definition von "Vortag": die beiden letzten Punkte der Reihe.
       Liegen sie mehr als eine Sitzung auseinander, sagt der Vertrag es. */
    async function getLatestPrice(ticker) {
      var s = await getPriceSeries(ticker);
      if (s.state !== "AVAILABLE") return s;
      var p = s.data.points, last = p[p.length - 1], prev = p.length > 1 ? p[p.length - 2] : null;
      if (!(last[1] > 0)) return unavailable("INVALID_PRICE", s.source);
      return available(s.source, last[0], {
        securityId: s.data.securityId, ticker: s.data.ticker, close: last[1], date: last[0],
        previousClose: prev && prev[1] > 0 ? prev[1] : null, previousDate: prev ? prev[0] : null,
        changePercent: prev && prev[1] > 0 ? Math.round((last[1] / prev[1] - 1) * 1e6) / 1e4 : null,
        basis: s.data.basis, currency: s.data.currency, kind: "EOD_CLOSE"
      });
    }

    /* Ein Ticker wird nur dann Teil eines Dateinamens, wenn er keinen
       Pfad bilden kann (kein "/", kein ".."). Red Team 03.10.2026. */
    function pathSafe(t) { return /^[A-Z0-9][A-Z0-9.\-]{0,23}$/.test(t) && t.indexOf("..") < 0; }
    async function stockPage(ticker) {
      var id = ident(ticker);
      if (!id || !pathSafe(id.ticker)) return { ok: false, error: "INVALID_TICKER" };
      return tryLoad(PATHS.stockPage(universe, id.ticker));
    }

    async function getFundamentals(ticker) {
      var id = ident(ticker);
      if (!id || !pathSafe(id.ticker)) return unavailable("INVALID_TICKER");
      var src = PATHS.stockPage(universe, id.ticker), pg = await stockPage(id.ticker);
      if (!pg.ok) return unavailable("NO_STOCK_PAGE", src);
      var f = pg.data.fundamentals, g = pg.data.geschaeftszahlen;
      if (!f || !f.available) return unavailable(f && f.cik === null ? "NO_CIK" : "FUNDAMENTALS_MISSING", src);
      return available(src, f.asOf, { ticker: id.ticker, cik: f.cik || null, source: f.source || null, latestFiscalYear: f.latestFiscalYear || null,
        fiscalYears: f.fiscalYears || null, capabilities: f.capabilities || null, summary: g || null });
    }

    /* Heute ausgeliefert: die Reihen sind split-bereinigt (Splits reisen im
       Rohbalken, siehe canonical-total-return.js); ein eigenes
       Ereignisregister gibt es nicht. Der Vertrag sagt das, statt eine
       leere Liste als "keine Ereignisse" auszugeben. */
    async function getCorporateActions(ticker) {
      var s = await getPriceSeries(ticker);
      if (s.state !== "AVAILABLE") return s;
      return unavailable("NO_EVENT_REGISTER_PUBLISHED", s.source);
    }

    async function getQuantData(ticker) {
      var id = ident(ticker);
      if (!id) return unavailable("INVALID_TICKER");
      var src = PATHS.capabilities(), c = await tryLoad(src);
      if (!c.ok) return unavailable("SOURCE_MISSING", src);
      var row = c.data.rows && c.data.rows[id.ticker];
      if (!row) return unavailable("NOT_IN_PRODUCT_PROJECTION", src);
      var caps = {};
      (c.data.capabilities || []).forEach(function (name, i) { caps[name] = !!((row[1] >>> i) & 1); });
      return available(src, c.data.generatedAt ? String(c.data.generatedAt).slice(0, 10) : null,
        { ticker: id.ticker, securityId: row[0], identityConsistent: row[0] === id.securityId, capabilities: caps });
    }

    async function getIntraday(ticker) {
      var id = ident(ticker);
      if (!id) return unavailable("INVALID_TICKER");
      var src = PATHS.intradayIndex(), x = await tryLoad(src);
      if (!x.ok) return unavailable("SOURCE_MISSING", src);
      var e = (x.data.entries || {})[id.ticker];
      if (!e) return unavailable("NOT_IN_INTRADAY_SCOPE", src);
      return available(src, e.sessionDate, { ticker: id.ticker, securityId: e.securityId || id.securityId, sessionDate: e.sessionDate,
        asOf: e.asOf || null, lastRegularLocal: e.lastRegularLocal || null, regularComplete: !!e.regularComplete,
        path: e.path || null, storedFreshness: e.freshnessState || null });
    }

    async function getNews(o) {
      var src = PATHS.news(), n = await tryLoad(src);
      if (!n.ok) return unavailable("SOURCE_MISSING", src);
      var t = o && o.ticker ? Identity.normalizeTicker(o.ticker) : null;
      var items = (n.data.items || []).filter(function (i) { return !t || i.symbol === t; });
      return available(src, n.data.updated_at || null, { updatedAt: n.data.updated_at || null, maxAgeHours: n.data.freshness_hours || null,
        sources: Array.isArray(n.data.sources) ? n.data.sources : [], items: items });
    }

    /* Local selections never resolve through a US ticker. ISIN is the
       share class; listingId is the selected MIC's independent series. */
    function validListing(row) {
      try {
        return row && Identity.listingIdFor(row) === row.listingId &&
          Identity.securityIdForISIN(row.isin) === row.securityId &&
          Identity.normalizeTicker(row.ticker) === row.ticker &&
          /^[A-Z]{3}$/.test(row.tradingCurrency || "") && row.assetType === "EQUITY" &&
          row.mappingStatus === "VERIFIED" && (typeof row.mappingSource === "string" ? !!row.mappingSource.trim() : Array.isArray(row.mappingSource) && row.mappingSource.length > 0) &&
          ["MAJOR", "MINOR"].indexOf(row.quoteUnit) >= 0 &&
          Array.isArray(row.indexMemberships);
      } catch (_) { return false; }
    }
    async function getListings(o) {
      o = o || {}; var src = PATHS.localListings(), layer = await tryLoad(src);
      if (!layer.ok) return unavailable("LOCAL_DIRECTORY_NOT_MATERIALIZED", src);
      var d = layer.data;
      if (!d || d.schemaVersion !== "de-eu-directory-1.0.0" || !Array.isArray(d.listings) || d.privateDevelopment !== true || !validDay(d.referenceAsOf) || !validDay(d.dataAsOf || d.referenceAsOf) || (d.dataAsOf || d.referenceAsOf) < d.referenceAsOf)
        return unavailable("LOCAL_DIRECTORY_CONTRACT_INVALID", src);
      var seen = new Set();
      for (var row of d.listings) {
        if (!validListing(row) || seen.has(row.listingId)) return unavailable("LOCAL_IDENTITY_INVALID", src);
        seen.add(row.listingId);
      }
      var q = String(o.query || "").trim().toLocaleLowerCase("de");
      var rows = d.listings.filter(function (r) {
        if (o.region && r.region !== o.region) return false;
        if (o.index && r.indexMemberships.indexOf(o.index) < 0) return false;
        if (o.country && r.listingCountry !== o.country) return false;
        if (o.exchange && r.mic !== o.exchange) return false;
        if (o.currency && r.tradingCurrency !== o.currency) return false;
        return !q || [r.name, r.companyName, r.ticker, r.providerSymbol, r.isin, r.mic].concat(r.aliases || [])
          .some(function (s) { return String(s || "").toLocaleLowerCase("de").indexOf(q) >= 0; });
      });
      return available(src, d.dataAsOf || d.referenceAsOf, { listings: rows, referenceAsOf: d.referenceAsOf, dataAsOf: d.dataAsOf || d.referenceAsOf, privateDevelopment: true });
    }
    async function getListing(id) {
      if (!Identity.isListingId(id)) return unavailable("INVALID_LISTING_ID");
      var result = await getListings(); if (result.state !== "AVAILABLE") return result;
      var row = result.data.listings.find(function (r) { return r.listingId === id; });
      return row ? available(result.source, result.asOf, row) : unavailable("LISTING_NOT_IN_SELECTION", result.source);
    }
    function validDay(s) {
      return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
    }
    async function getListingPriceSeries(id, o) {
      var listing = await getListing(id); if (listing.state !== "AVAILABLE") return listing;
      var src = PATHS.localSeries(id), result = await tryLoad(src);
      if (!result.ok) return unavailable("MISSING_HISTORY", src);
      var s = result.data, row = listing.data;
      if (!s || s.schemaVersion !== "de-eu-close-series-1.0.0" || s.listingId !== id || s.securityId !== row.securityId ||
          s.mic !== row.mic || s.currency !== row.tradingCurrency || s.quoteUnit !== row.quoteUnit || s.provider !== "marketstack" ||
          s.privateDevelopment !== true || !s.sourceEvidence || !Array.isArray(s.points)) return unavailable("LOCAL_SERIES_CONTRACT_INVALID", src);
      if (o && (o.range === "MAX" || o.range === "5Y" || o.grain === "weekly")) return unavailable("REQUESTED_RANGE_NOT_MATERIALIZED", src);
      if (!s.points.length) return unavailable("MISSING_HISTORY", src);
      var previous = null;
      for (var point of s.points) {
        if (!Array.isArray(point) || !validDay(point[0]) || !Number.isFinite(point[1]) || point[1] <= 0 ||
            (previous && point[0] <= previous)) return unavailable("INVALID_HISTORY", src);
        previous = point[0];
      }
      if (!validDay(s.asOf) || s.points[s.points.length - 1][0] !== s.asOf || s.asOf > listing.asOf ||
          (s.expectedSession && (!validDay(s.expectedSession) || s.asOf > s.expectedSession))) return unavailable("INVALID_SERIES_DATE", src);
      if (s.readiness && JSON.stringify(s.readiness) !== JSON.stringify(row.readiness)) return unavailable("LOCAL_READINESS_DRIFT", src);
      if (s.chartPoints) {
        var proof = s.readiness && s.readiness.chart, w = s.chartWindow;
        if (!proof || ["READY", "PARTIAL"].indexOf(proof.status) < 0 || !w ||
            JSON.stringify(w) !== JSON.stringify(proof.window) || !validDay(w.start) || !validDay(w.end) ||
            !Array.isArray(s.chartPoints) || !s.chartPoints.length || s.chartPoints[0][0] !== w.start ||
            s.chartPoints[s.chartPoints.length - 1][0] !== w.end ||
            JSON.stringify(s.chartPoints) !== JSON.stringify(s.points.filter(function (p) { return p[0] >= w.start && p[0] <= w.end; })))
          return unavailable("LOCAL_CHART_WINDOW_INVALID", src);
      }
      return available(src, s.asOf, { listingId: id, securityId: row.securityId, ticker: row.ticker, mic: row.mic,
        currency: s.currency, quoteUnit: s.quoteUnit, basis: s.basis, grain: "daily", points: s.points,
        from: s.points[0][0], to: s.asOf, quality: s.quality || null, kind: "EOD_CLOSE", retrievedAt: s.retrievedAt || null,
        expectedSession: s.expectedSession || null, freshness: s.freshness || "UNKNOWN", changeVerified: s.changeVerified === true,
        provider: s.provider, apiVersion: s.apiVersion || null, readiness: s.readiness || null,
        chartPoints: s.chartPoints || null, chartWindow: s.chartWindow || null });
    }
    async function getListingLatestPrice(id) {
      var s = await getListingPriceSeries(id); if (s.state !== "AVAILABLE") return s;
      return available(s.source, s.asOf, listingLatestPriceData(s.data, s.data.ticker));
    }
    async function getListingScreener(o) {
      var selected = await getListings(o); if (selected.state !== "AVAILABLE") return selected;
      var src = PATHS.localScreener(), loaded = await tryLoad(src), d = loaded.data;
      if (!loaded.ok) return unavailable("LOCAL_SCREENER_NOT_MATERIALIZED", src);
      if (!d || d.schemaVersion !== "de-eu-screener-1.0.0" || d.privateDevelopment !== true || d.publicDisplay !== false ||
          d.referenceAsOf !== selected.data.referenceAsOf || d.dataAsOf !== selected.data.dataAsOf || !Array.isArray(d.listings))
        return unavailable("LOCAL_SCREENER_CONTRACT_INVALID", src);
      var all = await getListings(), byId = new Map(all.data.listings.map(function (r) { return [r.listingId, r]; })), seen = new Set();
      for (var row of d.listings) {
        var canonical = byId.get(row.listingId), price = row.price;
        if (!canonical || seen.has(row.listingId) || row.securityId !== canonical.securityId || row.isin !== canonical.isin ||
            row.mic !== canonical.mic || row.tradingCurrency !== canonical.tradingCurrency || !row.fields || typeof row.fields !== "object")
          return unavailable("LOCAL_SCREENER_IDENTITY_INVALID", src);
        seen.add(row.listingId);
        if (price && (price.listingId !== row.listingId || price.securityId !== row.securityId || price.mic !== row.mic ||
            price.currency !== row.tradingCurrency || price.quoteUnit !== canonical.quoteUnit || !validDay(price.date) ||
            price.date > d.dataAsOf || !Number.isFinite(price.close) || price.close <= 0 || price.kind !== "EOD_CLOSE"))
          return unavailable("LOCAL_SCREENER_PRICE_INVALID", src);
        for (var field of Object.values(row.fields)) if (!field || (field.status === "READY" &&
            (!price || !Number.isFinite(field.value) || !Array.isArray(field.evidence) || !field.evidence.length || !validDay(field.asOf) ||
             field.asOf > d.dataAsOf || field.asOf !== price.date || !/^[a-f0-9]{64}$/.test(field.inputSeriesHash || "") ||
             !field.window || !validDay(field.window.from) || !validDay(field.window.to) || field.window.from > field.window.to || field.window.to !== field.asOf)))
          return unavailable("LOCAL_SCREENER_FIELD_INVALID", src);
      }
      var wanted = new Set(selected.data.listings.map(function (r) { return r.listingId; }));
      if (seen.size !== byId.size) return unavailable("LOCAL_SCREENER_SELECTION_INCOMPLETE", src);
      return available(src, d.dataAsOf, { listings: d.listings.filter(function (r) { return wanted.has(r.listingId); })
        .map(function (r) { return Object.assign({}, byId.get(r.listingId), { price: r.price, fields: r.fields }); }),
        referenceAsOf: d.referenceAsOf, dataAsOf: d.dataAsOf, privateDevelopment: true });
    }

    return { CONTRACT_VERSION: CONTRACT_VERSION, universeId: universe, getSecurity: getSecurity, getPriceSeries: getPriceSeries,
      getLatestPrice: getLatestPrice, getFundamentals: getFundamentals, getCorporateActions: getCorporateActions,
      getQuantData: getQuantData, getIntraday: getIntraday, getNews: getNews, stockPage: stockPage,
      getListings: getListings, searchListings: function (q) { return getListings({ query: q }); }, getListing: getListing,
      getListingPriceSeries: getListingPriceSeries, getListingLatestPrice: getListingLatestPrice,
      getListingScreener: getListingScreener,
      discoverIndex: function () { return tryLoad(PATHS.discoverIndex(universe)); } };
  }

  return { CONTRACT_VERSION: CONTRACT_VERSION, PATHS: PATHS, create: create, listingLatestPriceData: listingLatestPriceData };
});
