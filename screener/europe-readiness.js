/* Europe consumer of the canonical Core contract. No providers or indicators. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VUScreenerEuropeReadiness = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var Engine = root.VUScreenerEngine || (typeof require === 'function' ? require('./engine/engine.js') : null);
  var Fields = root.VUScreenerFields || (typeof require === 'function' ? require('./engine/fields.js') : null);
  var Identity = root.VUCore && root.VUCore.Identity || (typeof require === 'function' ? require('../core/identity.js') : null);
  var METRICS = ['high52w', 'sma20', 'sma50', 'sma200', 'momentum', 'relativeStrength', 'volatility', 'drawdown', 'breakout'];
  var ENUM_FIELDS = ['country', 'exchange', 'currency', 'freshness', 'index', 'chartStatus'];
  var NUMBER_FIELDS = ['price', 'volume', 'historyLength'].concat(METRICS);
  var FIELD_DEFINITIONS = ENUM_FIELDS.map(function (id) { return { id: id, kind: 'enum', multi: id === 'index' }; })
    .concat(NUMBER_FIELDS.map(function (id) { return { id: id, kind: 'number' }; }));
  var FRESH = ['CURRENT', 'LAST_VALID_SESSION'];
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function number(value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
  function text(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
  function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }
  function licensed(rights, path) {
    return !!rights && rights.commercial === true && rights.display === true && text(rights.evidenceRef) &&
      Array.isArray(rights.dataPaths) && rights.dataPaths.indexOf(path) >= 0;
  }
  function benchmarkValid(value) {
    return !!value && value.region === 'EUROPE' && value.status === 'VALIDATED' &&
      text(value.securityId) && text(value.evidenceRef);
  }
  function validIndex(value) {
    if (typeof value === 'string') return text(value);
    // Core may carry dated sourced membership objects instead of strings.
    if (!value || !text(value.source) || !/^\d{4}-\d{2}-\d{2}$/.test(value.asOf || '')) return null;
    var time = Date.parse(value.asOf);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value.asOf) return null;
    return text(value.index || value.indexId);
  }
  function matches(row, filter) {
    var field = FIELD_DEFINITIONS.find(function (f) { return f.id === filter.field; });
    if (!field) throw Error('UNKNOWN_EUROPE_SCREENER_FIELD');
    var value = filter.field === 'index' ? row.indexes : row[filter.field];
    if (field.kind === 'enum') {
      if (filter.op !== 'in' || !Array.isArray(filter.value)) throw Error('INVALID_EUROPE_ENUM_FILTER');
      if (value === null || value === undefined) return false;
      return field.multi ? value.some(function (v) { return filter.value.indexOf(v) >= 0; }) : filter.value.indexOf(value) >= 0;
    }
    if (number(filter.value) === null) throw Error('INVALID_EUROPE_NUMBER_FILTER');
    if (filter.op === 'between' && number(filter.value2) === null) throw Error('INVALID_EUROPE_NUMBER_FILTER');
    if (['gt', 'gte', 'lt', 'lte', 'eq', 'between'].indexOf(filter.op) < 0) throw Error('INVALID_EUROPE_FILTER_OPERATOR');
    if (value === null || value === undefined) return false;
    switch (filter.op) {
      case 'gt': return value > filter.value;
      case 'gte': return value >= filter.value;
      case 'lt': return value < filter.value;
      case 'lte': return value <= filter.value;
      case 'eq': return value === filter.value;
      case 'between': return value >= filter.value && value <= filter.value2;
      default: throw Error('INVALID_EUROPE_FILTER_OPERATOR');
    }
  }
  /** Explicit scope filters; no scoring, indicator recomputation or estimation. */
  function filterRows(rows, filters) {
    (filters || []).forEach(function (filter) { matches({}, filter); });
    return rows.filter(function (row) { return (filters || []).every(function (filter) { return matches(row, filter); }); });
  }
  function artifactFor(rows, matrix, reason) {
    var keys = ['s', 'n', 'co', 'ex', 'ipo', 'idx', 'was', 'mcap', 'price', 'currency', 'freshness', 'chartStatus', 'volume', 'historyLength', 'securityId', 'listingId'];
    Fields.FIELDS.forEach(function (f) { if (f.col && keys.indexOf(f.col) < 0) keys.push(f.col); });
    METRICS.forEach(function (metric) { if (keys.indexOf(metric) < 0) keys.push(metric); });
    var cols = {}; keys.forEach(function (key) { cols[key] = []; });
    rows.forEach(function (row) {
      var values = { s: row.securityId, n: row.name, co: row.country, ex: row.exchange,
        ipo: null, idx: row.indexes, was: null, mcap: null, price: row.price,
        currency: row.currency, freshness: row.freshness, chartStatus: row.chartStatus, volume: row.volume, historyLength: row.historyLength,
        securityId: row.securityId, listingId: row.listingId };
      // Generic momentum/RS/volatility/drawdown have no implied US horizon or
      // percentile. Never relabel them as perf6m, rs6m, vol252 or maxDd.
      METRICS.forEach(function (metric) { values[metric] = row[metric]; });
      keys.forEach(function (key) { cols[key].push(values[key] === undefined ? null : values[key]); });
    });
    return { schema: 'vu-screener-universe-1.0.0', universeId: 'EUROPE', universeLabel: 'europäische Aktien',
      asOf: rows.reduce(function (latest, row) { return row.asOf && (!latest || row.asOf > latest) ? row.asOf : latest; }, null),
      fundamentalsAsOf: null, sources: ['VU_CANONICAL_EUROPE'], cols: cols, columns: keys,
      factorPublication: { compositeAllowed: false }, formulas: {}, nativeCurrency: true,
      rankingPopulation: 'EUROPE_SEPARATE_READINESS', rankingsPublished: false,
      fieldDefinitions: copy(FIELD_DEFINITIONS), readiness: copy(matrix), gateReason: reason || null,
      universeRule: 'Discover-eligible canonical European securities; technical fields require separately validated existing engine projections.' };
  }
  function create(options) {
    var opts = options || {}, contract = opts.contract;
    if (!contract || contract.universeId !== 'EUROPE' ||
      ['getReadiness', 'getTechnicalData', 'getPriceSeries'].some(function (method) { return typeof contract[method] !== 'function'; }) ||
      typeof contract.getBaseScreenerRow !== 'function' && typeof contract.getScreenerRow !== 'function') {
      throw Error('CANONICAL_EUROPE_CONTRACT_REQUIRED');
    }
    if (opts.audience && ['public', 'research'].indexOf(opts.audience) < 0) throw Error('INVALID_EUROPE_AUDIENCE');
    var roster = opts.securityIds || (opts.catalog && opts.catalog.securities || []).map(function (s) { return s.securityId; });
    if (!Array.isArray(roster) || roster.some(function (id) { return !Identity.isSecurityId(id); })) throw Error('CANONICAL_EUROPE_ROSTER_REQUIRED');
    var ids = Array.from(new Set(roster)), allRows = [], matrix = [], ds = null, pending = null, gateReason = null, projectionKey = null;
    var baseAdmission = typeof contract.getBaseScreenerRow === 'function';
    var research = opts.audience === 'research' && opts.privateResearch === true;
    function gate() {
      if (opts.enabled !== true) return 'EUROPE_SCOPE_DISABLED';
      if (research) return null;
      if (!licensed(opts.rights, 'IDENTITY') || !licensed(opts.rights, 'RAW_EOD') && !licensed(opts.rights, 'CANONICAL_EOD')) {
        return 'DISPLAY_RIGHTS_UNCONFIRMED';
      }
      return null;
    }
    function technicalGate() { return research || licensed(opts.rights, 'TECHNICAL'); }
    function basisGate(basis) {
      return ['RAW_UNADJUSTED', 'CANONICAL_SPLIT_ADJUSTED'].indexOf(basis) >= 0 && (research ||
        licensed(opts.rights, basis === 'RAW_UNADJUSTED' ? 'RAW_EOD' : 'CANONICAL_EOD'));
    }
    function currentProjectionKey() { return String(gate()) + '|' + String(technicalGate()) + '|' +
      String(basisGate('RAW_UNADJUSTED')) + '|' + String(basisGate('CANONICAL_SPLIT_ADJUSTED')) + '|' + JSON.stringify(opts.scopeFilters || []); }
    function refresh() { if (ds && projectionKey !== currentProjectionKey()) rebuild(); }
    function visibleRows() {
      if (gate()) return [];
      var rows = allRows.filter(function (row) { return basisGate(row.priceBasis); }).map(function (row) {
        var projected = copy(row);
        if (!technicalGate()) {
          METRICS.forEach(function (metric) { projected[metric] = null; });
          projected.TECHNICAL = 'TECHNICAL_BLOCKED'; projected.RS = 'RS_BLOCKED'; delete projected.technicalProvenance;
        }
        return projected;
      });
      return filterRows(rows, opts.scopeFilters || []);
    }
    function rebuild() {
      gateReason = gate();
      var rows = visibleRows();
      ds = Engine.createDataset(artifactFor(rows, matrix, gateReason));
      // Additional Europe metadata is available without changing the US registry.
      var original = ds.column;
      ds.column = function (id) {
        return FIELD_DEFINITIONS.some(function (field) { return field.id === id; }) && id !== 'index' ?
          ds.cols[id] || original(id) : original(id);
      };
      ds.value = function (id, i) { var column = ds.column(id); return column ? column[i] : null; };
      ds.coverage = function (id) { var column = ds.column(id); return column ? column.filter(function (value) {
        return value !== null && value !== undefined;
      }).length : 0; };
      projectionKey = currentProjectionKey();
    }
    async function collect(id) {
      var ref = { region: 'EUROPE', securityId: id }, ready = await contract.getReadiness(ref);
      var state = ready && ready.state === 'AVAILABLE' && ready.data || null;
      var record = { securityId: id, SCREENER: 'BLOCKED', BASE_SCREENER: 'BLOCKED',
        TECHNICAL: 'TECHNICAL_BLOCKED', RS: 'RS_BLOCKED', reason: null };
      matrix.push(record);
      var eligible = state && state.IDENTITY === 'VERIFIED' && (baseAdmission ?
        state.UNIVERSE_IDENTITY_READY === true && state.DISCOVER_ELIGIBLE === true && state.BASE_SCREENER === 'READY' &&
          ['CHART_READY', 'CHART_LIMITED'].indexOf(state.CHART) >= 0 &&
          state.CHART_READY === (state.CHART === 'CHART_READY') && state.CHART_LIMITED === (state.CHART === 'CHART_LIMITED') : state.SCREENER === 'READY');
      if (!eligible) { record.reason = ready && ready.reason || 'SCREENER_BLOCKED'; return; }
      var response = await (baseAdmission ? contract.getBaseScreenerRow(ref) : contract.getScreenerRow(ref)), raw = response && response.state === 'AVAILABLE' && response.data;
      var fresh = raw && (baseAdmission ? ['CURRENT_LAST_SESSION', 'DELAYED'].indexOf(raw.freshness) >= 0 &&
        Number.isInteger(raw.sessionLag) && raw.sessionLag >= 0 && raw.sessionLag <= 3 && raw.sessionLag === state.sessionLag &&
        raw.freshness === (raw.sessionLag === 0 ? 'CURRENT_LAST_SESSION' : 'DELAYED') && raw.chartStatus === state.CHART : FRESH.indexOf(raw.freshness) >= 0);
      if (!raw || raw.region !== 'EUROPE' || raw.securityId !== id || !text(raw.listingId) ||
        number(raw.price) === null || raw.price <= 0 || !fresh || !/^[A-Z]{3}$/.test(raw.currency || '') ||
        baseAdmission && (!validDate(raw.latestDate) || raw.latestDate !== String(response.asOf || '').slice(0, 10))) {
        record.SCREENER = 'BLOCKED'; record.reason = response && response.reason || 'INVALID_CANONICAL_SCREENER_ROW'; return;
      }
      if (!basisGate(raw.priceBasis)) { record.SCREENER = 'BLOCKED'; record.reason = 'PRICE_BASIS_RIGHTS_UNCONFIRMED'; return; }
      record.SCREENER = 'READY'; record.BASE_SCREENER = 'READY';
      var row = { region: 'EUROPE', securityId: id, listingId: raw.listingId, companyId: raw.companyId || null,
        ticker: text(raw.ticker), providerSymbol: text(raw.providerSymbol), name: text(raw.name),
        country: text(raw.country), exchange: text(raw.mic) || text(raw.exchange), currency: raw.currency,
        indexes: Array.from(new Set((raw.indexes || []).map(validIndex).filter(Boolean))),
        asOf: response.asOf || null, price: raw.price, priceBasis: raw.priceBasis, freshness: raw.freshness,
        chartStatus: baseAdmission ? raw.chartStatus : state.CHART || null, latestDate: raw.latestDate || null,
        sessionLag: baseAdmission ? raw.sessionLag : null, quoteUnit: raw.quoteUnit || raw.currency,
        provenance: raw.provenance ? copy(raw.provenance) : null,
        volume: raw.volumeValid === true && number(raw.volume) !== null && raw.volume >= 0 ? raw.volume : null,
        historyLength: Number.isInteger(raw.historyLength) && raw.historyLength >= 0 ? raw.historyLength : null };
      METRICS.forEach(function (metric) { row[metric] = null; });
      var technicalAvailable = baseAdmission ? state.TECHNICAL_READY === true || state.TECHNICAL_PARTIAL === true :
        ['TECHNICAL_READY', 'TECHNICAL_PARTIAL'].indexOf(state.TECHNICAL) >= 0;
      if (technicalGate() && technicalAvailable) {
        var technical = await contract.getTechnicalData(ref), data = technical && technical.state === 'AVAILABLE' && technical.data;
        if (data && data.securityId === id && data.listingId === row.listingId &&
          (baseAdmission ? data.currency === row.currency : data.currency === undefined || data.currency === row.currency) && text(data.methodology) &&
          validDate(technical.asOf) && technical.asOf === String(response.asOf || '').slice(0, 10) &&
          data.priceBasis === row.priceBasis && basisGate(data.priceBasis) &&
          ['TECHNICAL_READY', 'TECHNICAL_PARTIAL'].indexOf(data.status) >= 0 && state.TECHNICAL !== 'TECHNICAL_BLOCKED') {
          record.TECHNICAL = data.status === 'TECHNICAL_READY' && state.TECHNICAL === 'TECHNICAL_READY' ? 'TECHNICAL_READY' : 'TECHNICAL_PARTIAL';
          METRICS.forEach(function (metric) {
            row[metric] = number(data.metrics && data.metrics[metric]);
            if (data.metricReadiness && data.metricReadiness[metric] !== 'AVAILABLE') row[metric] = null;
          });
          ['high52w', 'sma20', 'sma50', 'sma200'].forEach(function (metric) { if (row[metric] !== null && row[metric] <= 0) row[metric] = null; });
          if (row.volatility !== null && row.volatility < 0) row.volatility = null;
          if (row.drawdown !== null && (row.drawdown > 0 || row.drawdown < -1)) row.drawdown = null;
          if (state.RS === 'RS_READY' && data.RS === 'RS_READY' && benchmarkValid(data.benchmark)) record.RS = 'RS_READY';
          else { row.relativeStrength = null; if (record.TECHNICAL === 'TECHNICAL_READY') record.TECHNICAL = 'TECHNICAL_PARTIAL'; }
          row.technicalProvenance = { asOf: technical.asOf || null, methodology: data.methodology, priceBasis: data.priceBasis || null };
          var present = METRICS.filter(function (metric) { return row[metric] !== null; });
          if (!present.length) record.TECHNICAL = 'TECHNICAL_BLOCKED';
          else if (present.length < METRICS.length && record.TECHNICAL === 'TECHNICAL_READY') record.TECHNICAL = 'TECHNICAL_PARTIAL';
        }
      }
      row.TECHNICAL = record.TECHNICAL; row.RS = record.RS; allRows.push(row);
    }
    async function readSeries(id, closeOnly) {
        var row = allRows.find(function (r) { return r.securityId === id; });
        if (gate() || !row || !basisGate(row.priceBasis) || baseAdmission && !closeOnly && row.TECHNICAL !== 'TECHNICAL_READY') return null;
        var response = await contract.getPriceSeries({ region: 'EUROPE', securityId: id }, { basis: row.priceBasis });
        if (gate() || !basisGate(row.priceBasis)) return null;
        // The existing Screener renderer accepts one continuous series. It
        // cannot preserve quarantine gaps; keep the base row but withhold a
        // sparkline until a renderer can consume multiple segments.
        var segments = response && response.data && response.data.segments;
        if (baseAdmission && !Array.isArray(segments) || segments !== undefined && segments !== null &&
          (!Array.isArray(segments) || segments.length !== 1 ||
            JSON.stringify(segments[0]) !== JSON.stringify(response.data.points))) return null;
        return response && response.state === 'AVAILABLE' && response.data && response.data.securityId === id &&
          response.data.listingId === row.listingId && response.data.currency === row.currency &&
          response.data.basis === row.priceBasis && basisGate(response.data.basis) &&
          Array.isArray(response.data.points) ? copy(response.data.points) : null;
    }
    var adapter = {
      id: 'canonical-europe', scope: 'EUROPE',
      load: function () {
        if (ds) return Promise.resolve();
        if (!pending) pending = (async function () {
          gateReason = gate();
          if (!gateReason) for (var i = 0; i < ids.length; i++) await collect(ids[i]);
          else matrix = ids.map(function (id) { return { securityId: id, SCREENER: 'BLOCKED', TECHNICAL: 'TECHNICAL_BLOCKED', RS: 'RS_BLOCKED', reason: gateReason }; });
          rebuild();
        })().catch(function (error) { pending = null; allRows = []; matrix = []; throw error; });
        return pending;
      },
      dataset: function () { refresh(); return ds; },
      rows: function () { return ds ? visibleRows() : []; },
      readiness: function () { return gate() ? ids.map(function (id) {
        return { securityId: id, SCREENER: 'BLOCKED', TECHNICAL: 'TECHNICAL_BLOCKED', RS: 'RS_BLOCKED', reason: gate() };
      }) : matrix.map(function (record) {
        var projected = copy(record);
        var row = allRows.find(function (r) { return r.securityId === record.securityId; });
        if (row && !basisGate(row.priceBasis)) {
          projected.SCREENER = 'BLOCKED'; projected.TECHNICAL = 'TECHNICAL_BLOCKED'; projected.RS = 'RS_BLOCKED';
          projected.reason = 'PRICE_BASIS_RIGHTS_UNCONFIRMED';
        }
        if (!technicalGate()) { projected.TECHNICAL = 'TECHNICAL_BLOCKED'; projected.RS = 'RS_BLOCKED'; }
        return projected;
      }); },
      fieldDefinitions: function () { return copy(FIELD_DEFINITIONS); },
      info: function () { refresh(); return ds ? { id: adapter.id, mode: research ? 'research' : 'canonical', scope: 'EUROPE',
        universe: 'EUROPE', universeLabel: 'europäische Aktien', count: ds.size, asOf: ds.meta.asOf,
        sources: ['VU_CANONICAL_EUROPE'], gateReason: gateReason, nativeCurrency: true, publicDeliveryAllowed: !research && !gateReason && ds.size > 0,
        factorPublication: ds.meta.factorPublication, formulas: {}, rule: ds.meta.universeRule } : null; },
      screen: function (query, page) { return adapter.load().then(function () { return adapter.screenSync(query, page); }); },
      screenSync: function (query, page) {
        if (!ds) throw Error('EUROPE_SCOPE_NOT_LOADED');
        refresh();
        var result = Engine.evaluate(ds, query), order = Engine.sortIndices(ds, query, result.indices), p = page || {};
        var offset = p.offset || 0, limit = p.limit === undefined ? order.length : p.limit;
        return { total: result.count, universe: result.universe, funnel: result.funnel, perFilter: result.perFilter,
          groups: result.groups, order: order, rows: order.slice(offset, offset + limit).map(function (i) {
            return { i: i, symbol: ds.symbol(i), securityId: ds.cols.securityId[i] };
          }) };
      },
      setScopeFilters: function (filters) { opts.scopeFilters = copy(filters || []); if (ds) rebuild(); },
      research: function (id) {
        var row = allRows.find(function (r) { return r.securityId === id; });
        return Promise.resolve(row && !gate() ? visibleRows().find(function (r) { return r.securityId === id; }) || null : null);
      },
      series: function (id) { return readSeries(id, false); }
    };
    adapter.sparkSeries = function (id) { return readSeries(id, true); };
    return adapter;
  }
  return { VERSION: 'vu-screener-europe-readiness-1.0.0', METRICS: METRICS, FIELD_DEFINITIONS: FIELD_DEFINITIONS,
    create: create, filterRows: filterRows };
});
