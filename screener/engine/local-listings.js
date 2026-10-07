/* Regional consumer of the central listing contract. All filtering delegates
   to the existing Screener engine; no scores or indicators are calculated. */
(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('../../core/identity.js') : root.VUCore.Identity,
    node ? require('./fields.js') : root.VUScreenerFields,
    node ? require('./query.js') : root.VUScreenerQuery,
    node ? require('./engine.js') : root.VUScreenerEngine);
  if (node) module.exports = api;
  root.VUScreenerLocalListings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Identity, Fields, Query, Engine) {
  'use strict';
  var METRICS = ['perf1d', 'perf1w', 'perf1m', 'perf3m', 'perf6m', 'perf1y',
    'priceVsSma20', 'priceVsSma50', 'priceVsSma200', 'sma50VsSma200', 'distance52wHigh', 'distance52wLow', 'maxDrawdown', 'volatility', 'avgVolume', 'relativeVolume'];
  var FILTERS = ['country', 'region', 'exchange', 'index', 'price'].concat(METRICS);
  var STATUS = {
    freshness: { FRESH_CURRENT_SESSION: 'Bestätigte aktuelle Sitzung', FRESH_LAST_VALID_SESSION: 'Letzte bestätigte Sitzung', DELAYED_EXPECTED: 'Tageskurs ausstehend', STALE: 'Veraltet', MISSING: 'Kurs fehlt', INVALID: 'Kurs gesperrt', UNKNOWN: 'Aktualität ungeklärt' },
    chartReadiness: { CHART_READY: 'Chart freigegeben', CHART_READY_WITH_LIMITATION: 'Chart mit Einschränkung', CHART_BLOCKED: 'Chart gesperrt', NOT_TESTED: 'Chart noch nicht geprüft' },
    technicalReadiness: { TECHNICAL_READY: 'Technik freigegeben', TECHNICAL_PARTIAL: 'Technik teilweise freigegeben', TECHNICAL_BLOCKED: 'Technik gesperrt', NOT_TESTED: 'Technik noch nicht geprüft' }
  };
  function status(row, kind) {
    var readiness = row.readiness && row.readiness[kind === 'freshness' ? 'latestEod' : kind === 'chartReadiness' ? 'chart' : 'technical'], value;
    if (kind === 'freshness') { value = readiness && readiness.state || (row.price ? row.price.freshness : 'MISSING'); value = ({ CURRENT: 'FRESH_LAST_VALID_SESSION', STALE_CACHE: 'STALE' })[value] || value; }
    else {
      value = readiness && readiness.state;
      var expected = { CHART_READY: 'READY', CHART_READY_WITH_LIMITATION: 'PARTIAL', CHART_BLOCKED: 'BLOCKED', TECHNICAL_READY: 'READY', TECHNICAL_PARTIAL: 'PARTIAL', TECHNICAL_BLOCKED: 'BLOCKED' }[value];
      if (!readiness || readiness.status !== expected) value = 'NOT_TESTED';
    }
    return STATUS[kind] && STATUS[kind][value] ? value : kind === 'freshness' ? 'UNKNOWN' : 'NOT_TESTED';
  }
  function day(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || ''); }
  function quoteUnit(row) { var unit = row.price && row.price.quoteUnit || row.quoteUnit; return unit === 'MINOR' ? row.tradingCurrency === 'GBP' ? 'GBX' : row.tradingCurrency + ' Untereinheit' : unit && unit !== 'MAJOR' ? unit : row.tradingCurrency; }
  function issuerCountry(row) { return /^[A-Z]{2}$/.test(row.companyCountry || '') ? row.companyCountry : null; }
  function metric(row, id) {
    var value = row.fields && row.fields[id], field = Fields.field(id);
    if (!value || value.status !== 'READY' || !row.price || value.asOf !== row.price.date || !/^[a-f0-9]{64}$/.test(value.inputSeriesHash || '') || !Number.isFinite(value.value) || !day(value.asOf) ||
      !(typeof value.evidence === 'string' ? value.evidence.trim() : Array.isArray(value.evidence) && value.evidence.length)) return null;
    var window = value.window, from = Array.isArray(window) ? window[0] : window && window.from, to = Array.isArray(window) ? window[1] : window && window.to;
    if (!day(from) || !day(to) || from > to || to > value.asOf) return null;
    var unit = field.unit === 'pct' ? 'ratio' : field.unit;
    return value.unit === unit ? value.value : null;
  }
  function prepare(envelope) {
    if (!envelope || envelope.state !== 'AVAILABLE') throw Error(envelope && envelope.reason || 'EUROPE_SOURCE_UNAVAILABLE');
    var data = envelope.data;
    if (!data || data.privateDevelopment !== true || !Array.isArray(data.listings)) throw Error('EUROPE_CONTRACT_INVALID');
    var rows = data.listings, seen = new Set(), cols = { s: [], n: [], co: [], ex: [], idx: [], ipo: [], price: [] };
    METRICS.forEach(function (id) { cols[Fields.field(id).col] = []; });
    rows.forEach(function (row) {
      if (!row || !Identity.isListingId(row.listingId) || row.listingId !== Identity.listingIdFor(row) ||
        row.securityId !== Identity.securityIdForISIN(row.isin) || seen.has(row.listingId)) throw Error('EUROPE_IDENTITY_INVALID');
      seen.add(row.listingId);
      var p = row.price;
      if (p && (p.listingId !== row.listingId || p.securityId !== row.securityId || p.mic !== row.mic ||
        p.currency !== row.tradingCurrency || p.quoteUnit !== row.quoteUnit || !Number.isFinite(p.close) || p.close <= 0 || !day(p.date))) throw Error('EUROPE_PRICE_IDENTITY_INVALID');
      cols.s.push(row.listingId); cols.n.push(row.name || row.ticker); cols.co.push(row.listingCountry || null);
      cols.ex.push(row.mic); cols.idx.push(row.indexMemberships || []); cols.ipo.push(null); cols.price.push(p ? p.close : null);
      METRICS.forEach(function (id) { cols[Fields.field(id).col].push(metric(row, id)); });
    });
    var ds = Engine.createDataset({ cols: cols, universeId: 'EUROPE', asOf: data.dataAsOf, referenceAsOf: data.referenceAsOf });
    var column = ds.column, region = rows.map(function () { return 'EUROPE'; });
    ds.column = function (id) { return id === 'region' ? region : column(id); };
    ds.value = function (id, i) { var c = ds.column(id); return c ? c[i] : null; };
    return { rows: rows, dataset: ds, data: data };
  }
  function validate(query, options) {
    var q = Query.validate(query), opts = options || {};
    if (opts.issuerCountry && opts.issuerCountry !== 'UNKNOWN' && !/^[A-Z]{2}$/.test(opts.issuerCountry)) throw Error('EUROPE_ISSUER_COUNTRY_INVALID');
    Object.keys(STATUS).forEach(function (kind) { if (opts[kind] && !STATUS[kind][opts[kind]]) throw Error('EUROPE_STATUS_FILTER_INVALID:' + kind); });
    if (q.universe !== 'EUROPE' || q.ranking.enabled || q.logic !== 'AND' || q.groups.length !== 1 || q.groups[0].op !== 'AND') throw Error('EUROPE_UNSUPPORTED_QUERY');
    if (['name', 'price'].concat(METRICS).indexOf(q.sort.field) < 0) throw Error('EUROPE_UNSUPPORTED_SORT');
    Query.filters(q).forEach(function (filter) {
      if (!FILTERS.includes(filter.field)) throw Error('EUROPE_UNSUPPORTED_FIELD:' + filter.field);
      if (filter.field === 'price' && !opts.currency) throw Error('EUROPE_PRICE_CURRENCY_REQUIRED');
    });
    if (q.sort.field === 'price' && !opts.currency) throw Error('EUROPE_PRICE_CURRENCY_REQUIRED');
    return q;
  }
  function execute(prepared, query, options) {
    var opts = options || {}, q = validate(query, opts), ds = prepared.dataset;
    var text = String(opts.query || '').trim().toUpperCase(), scopedRows = prepared.rows.filter(function (row) {
      return Object.keys(STATUS).every(function (kind) { return !opts[kind] || status(row, kind) === opts[kind]; }) &&
        (!opts.issuerCountry || (issuerCountry(row) || 'UNKNOWN') === opts.issuerCountry) && (!opts.currency || quoteUnit(row) === opts.currency) && (!text ||
        [row.name, row.ticker, row.providerSymbol, row.isin, row.mic].concat(row.aliases || []).some(function (v) { return String(v || '').toUpperCase().includes(text); }));
    });
    var scoped = prepare({ state: 'AVAILABLE', data: Object.assign({}, prepared.data, { listings: scopedRows }) });
    var result = Engine.evaluate(scoped.dataset, q), order = Engine.sortIndices(scoped.dataset, q, result.indices)
      .map(function (i) { return ds.indexOf(scopedRows[i].listingId); });
    return { total: order.length, order: order, universe: scopedRows.length, totalUniverse: ds.size, perFilter: result.perFilter,
      rows: order.map(function (i) { return prepared.rows[i]; }), why: function (i) { return Engine.why(ds, q, i); } };
  }
  return { METRICS: METRICS, FILTERS: FILTERS, STATUS: STATUS, status: status, prepare: prepare, execute: execute, validate: validate, quoteUnit: quoteUnit, issuerCountry: issuerCountry };
});
