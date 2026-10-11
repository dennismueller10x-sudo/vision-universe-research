/* =========================================================================
   VISION UNIVERSE SCREENER — engine/adapters.js

   DATENADAPTER (austauschbar)

   Die Oberflaeche spricht ausschliesslich mit einem ScreenerAdapter:

     adapter.info()                          -> { id, mode, asOf, universe, count }
     adapter.load()                          -> Promise<void>
     adapter.screen(query, { offset, limit })-> Promise<ScreenResult>
         ScreenResult = { total, universe, funnel, perFilter,
                          rows: [{ i, symbol }], order: [i...] }
     adapter.dataset()                       -> spaltenbasiertes Dataset (lokal) oder null
     adapter.research(symbol)                -> Promise<StockResearch | null>
     adapter.series(symbol)                  -> Promise<[[date, close]] | null>

   StaticUniverseAdapter  - heute produktiv: statisches JSON-Artefakt,
                            Auswertung im Browser (5.400 Titel < 10 ms).
   RemoteScreenerAdapter  - vorbereitet: dieselbe Query als JSON an eine
                            Server-API (server-side screening, Index,
                            Pagination, Caching). Nicht aktiv, solange kein
                            Endpunkt konfiguriert ist.

   PROVIDER_FIELD_MAP dokumentiert, aus welcher Quelle ein externer
   Anbieter (FMP, Twelve Data, Massive) ein Feld liefern wuerde. Es gibt
   hier KEINE Aufrufe an diese Anbieter und keine Schluessel.
   ========================================================================= */
(function (global) {
  'use strict';
  var Engine = global.VUScreenerEngine || (typeof require === 'function' ? require('./engine.js') : null);
  /* Eine Identitaetsregel fuer alle Produkte (core/identity.js, ADR-001). */
  var Identity = (global.VUCore && global.VUCore.Identity) || (typeof require === 'function' ? require('../../core/identity.js') : null);
  var Fields = global.VUScreenerFields || (typeof require === 'function' ? require('./fields.js') : null);

  function fetchJson(url, opts) {
    return fetch(url, Object.assign({ cache: 'default' }, opts || {})).then(function (r) {
      if (!r.ok) { var e = new Error('HTTP_' + r.status); e.status = r.status; throw e; }
      return r.json();
    });
  }

  // ---------------------------------------------------------------- Static
  function StaticUniverseAdapter(opts) {
    opts = opts || {};
    var url = opts.url || '/screener/data/universe-US_REAL.json';
    var researchBase = opts.researchBase || '/discover/data/stocks/US_REAL/';
    var ds = null, loading = null;
    var researchCache = Object.create(null), seriesCache = Object.create(null);
    var self = {
      id: 'static-json',
      load: function () {
        if (ds) return Promise.resolve();
        if (!loading) loading = (opts.fetchJson || fetchJson)(url).then(function (a) {
          if (!a || a.schema !== 'vu-screener-universe-1.0.0') throw Error('SCHEMA_MISMATCH');
          ds = Engine.createDataset(a);
          if (Fields.setDictionary) Fields.setDictionary(a.dict || null);
        }).catch(function (e) { loading = null; throw e; });
        return loading;
      },
      dataset: function () { return ds; },
      info: function () {
        if (!ds) return null;
        var m = ds.meta;
        return { id: self.id, mode: 'real', asOf: m.asOf, fundamentalsAsOf: m.fundamentalsAsOf, universe: m.universeId, universeLabel: m.universeLabel, count: ds.size, sources: m.sources, factorPublication: m.factorPublication, formulas: m.formulas, rule: m.universeRule };
      },
      /** Wertet lokal aus. Pagination ueber offset/limit wie beim Server. */
      screen: function (query, page) {
        page = page || {};
        return self.load().then(function () { return self.screenSync(query, page); });
      },
      screenSync: function (query, page) {
        page = page || {};
        var r = Engine.evaluate(ds, query);
        var order = Engine.sortIndices(ds, query, r.indices);
        var offset = page.offset || 0, limit = page.limit || order.length;
        return { total: r.count, universe: r.universe, funnel: r.funnel, perFilter: r.perFilter, groups: r.groups, order: order,
          rows: order.slice(offset, offset + limit).map(function (i) { return { i: i, symbol: ds.symbol(i) }; }) };
      },
      research: function (symbol) {
        if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) return Promise.resolve(null);
        if (!researchCache[symbol]) researchCache[symbol] = (opts.fetchJson || fetchJson)(researchBase + encodeURIComponent(symbol) + '.json').catch(function (e) { delete researchCache[symbol]; throw e; });
        return researchCache[symbol];
      },
      series: function (symbol) {
        if (seriesCache[symbol]) return seriesCache[symbol];
        seriesCache[symbol] = self.research(symbol).then(function (d) {
          var p = d && d.priceSeries && d.priceSeries.path;
          if (!p || !/^\/quant\/data\/market\/discover-series\/[A-Za-z0-9_.-]+\.json$/.test(p)) return null;
          return (opts.fetchJson || fetchJson)(p).then(function (s) { return s && Array.isArray(s.points) ? s.points : null; });
        }).catch(function () { delete seriesCache[symbol]; return null; });
        return seriesCache[symbol];
      },
      /** Leichter Kurspfad fuer Mini-Charts, ohne die 50-KB-Aktiendatei zu laden. */
      sparkSeries: function (symbol) {
        var key = 'spark:' + symbol;
        if (seriesCache[key]) return seriesCache[key];
        var id;
        try { id = Identity.securityIdForTicker(symbol); } catch (e) { return self.series(symbol); }
        seriesCache[key] = (opts.fetchJson || fetchJson)('/quant/data/market/discover-series/' + id + '.json')
          .then(function (s) { return s && Array.isArray(s.points) ? s.points : null; })
          .catch(function () { return self.series(symbol); });
        return seriesCache[key];
      }
    };
    return self;
  }

  // ---------------------------------------------------------------- Remote
  /**
   * Vorbereitet fuer server-side screening. Vertrag:
   *   POST {endpoint}/screen   body: { query, offset, limit }
   *   200 { total, universe, funnel, perFilter, rows:[{symbol, values:{fieldId:raw}}], asOf }
   * Der Server nutzt dieselbe Feld-Registry (fields.js) und dieselbe Engine
   * oder einen gleichwertigen indizierten Query-Planer.
   */
  function RemoteScreenerAdapter(opts) {
    opts = opts || {};
    var endpoint = opts.endpoint || null;
    var inflight = null;
    return {
      id: 'remote-api',
      configured: !!endpoint,
      load: function () { return endpoint ? Promise.resolve() : Promise.reject(Error('REMOTE_NOT_CONFIGURED')); },
      dataset: function () { return null; },
      info: function () { return { id: 'remote-api', mode: endpoint ? 'remote' : 'unconfigured' }; },
      screen: function (query, page) {
        if (!endpoint) return Promise.reject(Error('REMOTE_NOT_CONFIGURED'));
        if (inflight && inflight.abort) inflight.abort();
        inflight = typeof AbortController !== 'undefined' ? new AbortController() : null;
        return fetchJson(endpoint + '/screen', { method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
          body: JSON.stringify({ query: query, offset: (page || {}).offset || 0, limit: (page || {}).limit || 50 }), signal: inflight && inflight.signal });
      },
      research: function () { return Promise.resolve(null); },
      series: function () { return Promise.resolve(null); }
    };
  }

  // ---------------------------------------------------------------- Provider
  var PROVIDER_FIELD_MAP = {
    fmp: { label: 'Financial Modeling Prep', status: 'NOT_CONNECTED', fields: {
      forwardPe: 'analyst-estimates -> estimatedEpsAvg', forwardRevenueGrowth: 'analyst-estimates -> estimatedRevenueAvg',
      forwardEpsGrowth: 'analyst-estimates -> estimatedEpsAvg', priceTargetUpside: 'price-target-consensus -> targetConsensus',
      analystConsensus: 'grades-consensus -> consensus', interestCoverage: 'ratios -> interestCoverageRatio', currentRatio: 'ratios -> currentRatio' } },
    twelvedata: { label: 'Twelve Data', status: 'NOT_CONNECTED', fields: {
      atr: 'time_series/atr (high/low/close)', rsi: 'rsi', macd: 'macd', bollinger: 'bbands' } },
    massive: { label: 'Massive (vormals Polygon)', status: 'NOT_CONNECTED', fields: {
      atr: 'aggregates (OHLC) -> ATR', relativeVolume: 'aggregates -> volume' } },
    internal: { label: 'Vision Universe (intern)', status: 'ACTIVE', fields: 'alle Felder mit available:true in fields.js' }
  };

  function create(opts) {
    opts = opts || {};
    if (opts.scope === 'EUROPE') {
      var Europe = global.VUScreenerEuropeReadiness || (typeof require === 'function' ? require('../europe-readiness.js') : null);
      if (!Europe) throw Error('EUROPE_SCREENER_CONSUMER_NOT_LOADED');
      return Europe.create(opts.europe || {});
    }
    if (opts.endpoint) return RemoteScreenerAdapter(opts);
    return StaticUniverseAdapter(opts);
  }

  var API = { VERSION: 'vu-screener-adapters-1.0.0', StaticUniverseAdapter: StaticUniverseAdapter, RemoteScreenerAdapter: RemoteScreenerAdapter, PROVIDER_FIELD_MAP: PROVIDER_FIELD_MAP, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.VUScreenerAdapters = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
