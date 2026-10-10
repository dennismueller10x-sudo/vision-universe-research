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
    globalDiscoverSearch: function () { return "/discover/data/search/GLOBAL.json"; },
    globalDiscoverHome: function () { return "/discover/data/global/home.json"; },
    instrumentShard: function (t) { return "/quant/data/universe/instruments/" + Identity.shardKey(t) + ".json"; },
    discoverIndex: function (u) { return "/discover/data/stock-index/" + u + ".json"; },
    dailySeries: function (id) { return "/quant/data/market/discover-series/" + id + ".json"; },
    weeklySeries: function (id) { return "/quant/data/market/discover-series-long/" + id + ".json"; },
    stockPage: function (u, t) { return "/discover/data/stocks/" + u + "/" + t + ".json"; },
    capabilities: function () { return "/quant/data/product/capabilities-v1.json"; },
    intradayIndex: function () { return "/quant/data/market/intraday/index.json"; },
    news: function () { return "/dashboard/data/news_feed.json"; }
  };

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

    function globalUniverse() { return typeof module === 'object' && module.exports ? require('./discover-universe.js') : root.VUCore.DiscoverUniverse; }
    async function getDiscoverSearch(query, options) {
      var o=options||{},result=await tryLoad(PATHS.globalDiscoverSearch());
      if(!result.ok)return unavailable('SOURCE_MISSING',PATHS.globalDiscoverSearch());
      return available(PATHS.globalDiscoverSearch(),null,{universeId:'GLOBAL',universeLabel:'Alle Aktien',entries:globalUniverse().search(result.data,query,o)});
    }
    async function getDiscoverHome(options) {
      var o=options||{},result=await tryLoad(PATHS.globalDiscoverHome());
      if(!result.ok)return unavailable('SOURCE_MISSING',PATHS.globalDiscoverHome());
      return available(PATHS.globalDiscoverHome(),null,{cards:result.data.cards.filter(function(d){return globalUniverse().eligible(d,o.authority,o.now);})});
    }
    async function getDiscoverUniverse(options) {
      var o=options||{},result=await tryLoad(PATHS.globalDiscoverSearch());
      if(!result.ok)return unavailable('SOURCE_MISSING',PATHS.globalDiscoverSearch());
      var entries=result.data.entries.filter(function(d){return globalUniverse().eligible(d,o.authority,o.now)&&(!o.region||o.region==='ALL'||(o.region==='DE'?d.country==='DE':d.region===o.region));});
      return available(PATHS.globalDiscoverSearch(),null,{entries:entries.slice(o.offset||0,(o.offset||0)+(o.limit||48)),total:entries.length});
    }

    return { CONTRACT_VERSION: CONTRACT_VERSION, universeId: universe, getSecurity: getSecurity, getPriceSeries: getPriceSeries,
      getDiscoverSearch: getDiscoverSearch, getDiscoverHome: getDiscoverHome, getDiscoverUniverse: getDiscoverUniverse,
      getLatestPrice: getLatestPrice, getFundamentals: getFundamentals, getCorporateActions: getCorporateActions,
      getQuantData: getQuantData, getIntraday: getIntraday, getNews: getNews, stockPage: stockPage, discoverIndex: function () { return tryLoad(PATHS.discoverIndex(universe)); } };
  }

  return { CONTRACT_VERSION: CONTRACT_VERSION, PATHS: PATHS, create: create };
});
