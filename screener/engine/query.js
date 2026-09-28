/* =========================================================================
   VISION UNIVERSE SCREENER — engine/query.js

   DAS SCREEN-MODELL (serialisierbar, versioniert)

   {
     v: 1,
     universe: 'US_REAL',
     mode: 'simple' | 'pro',
     logic: 'AND' | 'OR',                 Verknuepfung ZWISCHEN den Gruppen
     groups: [{
       id: 'g1', name: 'Wachstum',
       op: 'AND' | 'OR',                  Verknuepfung INNERHALB der Gruppe
       filters: [{ id, field, op, value, value2, timeframe, source }]
     }],
     ranking: { enabled, weights: { momentum, growth, quality, value } },
     sort:   { field, dir: 'asc' | 'desc' },
     view:   'cards' | 'compact' | 'table',
     columns: [fieldId, ...]
   }

   Filterwerte sind Rohwerte (0.2 = 20 %, 1e9 = 1 Mrd. $). Der Modus
   'simple' hat genau eine UND-Gruppe; Gruppen und ODER sind Pro.

   URL-FORM (lesbar, teilbar, Browser-Zurueck-faehig):
     ?f=marketCap:lt:1000000000&f=sector:in:tech,health&f=g2~rsi:lt:70
     &go=g2:OR&gn=g2:Technik&logic=AND&mode=pro
     &rank=momentum:40,growth:30,quality:20,value:10&sort=mcap:desc&view=cards
   ========================================================================= */
(function (global) {
  'use strict';
  var Fields = global.VUScreenerFields || (typeof require === 'function' ? require('./fields.js') : null);

  var VERSION = 1;
  var FAMILIES = ['momentum', 'growth', 'quality', 'value'];
  var DEFAULT_WEIGHTS = { momentum: 40, growth: 30, quality: 20, value: 10 };
  var SORTABLE = ['match', 'marketCap', 'price', 'revenueGrowth', 'epsGrowth', 'roic', 'distance52wHigh', 'perf1d', 'perf1m', 'perf6m', 'perf1y', 'pe', 'grossMargin', 'fcfYield', 'relativeStrengthPct', 'name'];
  var MAX_FILTERS = 40, MAX_GROUPS = 6;

  function empty(opts) {
    opts = opts || {};
    return {
      v: VERSION, universe: opts.universe || 'US_REAL', mode: opts.mode === 'pro' ? 'pro' : 'simple', logic: 'AND',
      groups: [{ id: 'g1', name: '', op: 'AND', filters: [] }],
      ranking: { enabled: false, weights: Object.assign({}, DEFAULT_WEIGHTS) },
      sort: { field: 'marketCap', dir: 'desc' }, view: 'cards', columns: []
    };
  }
  function clone(q) { return JSON.parse(JSON.stringify(q)); }
  var seq = 0;
  function newId(prefix) { seq = (seq + 1) % 1e6; return prefix + Date.now().toString(36).slice(-4) + seq.toString(36); }

  function filters(q) { var out = []; q.groups.forEach(function (g) { g.filters.forEach(function (f) { out.push(f); }); }); return out; }
  function count(q) { return filters(q).length; }

  /**
   * Prueft und normalisiert. Wirft Error('INVALID_QUERY:<grund>') bei allem,
   * was nicht eindeutig auswertbar ist - es wird nie still ersetzt.
   */
  function validate(input) {
    if (!input || typeof input !== 'object') throw Error('INVALID_QUERY:shape');
    var q = empty({ universe: input.universe, mode: input.mode });
    if (input.v !== undefined && input.v !== VERSION) throw Error('INVALID_QUERY:version');
    q.logic = input.logic === 'OR' ? 'OR' : 'AND';
    var groups = Array.isArray(input.groups) && input.groups.length ? input.groups : [{ id: 'g1', op: 'AND', filters: [] }];
    if (groups.length > MAX_GROUPS) throw Error('INVALID_QUERY:groups');
    var seen = {};
    q.groups = groups.map(function (g, gi) {
      var id = typeof g.id === 'string' && /^[a-z0-9]{1,12}$/i.test(g.id) ? g.id : 'g' + (gi + 1);
      if (seen[id]) throw Error('INVALID_QUERY:group-id');
      seen[id] = 1;
      return { id: id, name: typeof g.name === 'string' ? g.name.slice(0, 40) : '', op: g.op === 'OR' ? 'OR' : 'AND',
        filters: (Array.isArray(g.filters) ? g.filters : []).map(validateFilter) };
    });
    if (count(q) > MAX_FILTERS) throw Error('INVALID_QUERY:too-many-filters');
    if (q.mode === 'simple' && (q.groups.length > 1 || q.groups[0].op === 'OR' || q.logic === 'OR')) q.mode = 'pro';
    var r = input.ranking || {};
    q.ranking.enabled = !!r.enabled;
    if (r.weights) {
      FAMILIES.forEach(function (k) { var w = Number(r.weights[k]); q.ranking.weights[k] = isFinite(w) && w >= 0 && w <= 100 ? Math.round(w) : 0; });
    }
    var s = input.sort || {};
    if (s.field && SORTABLE.indexOf(s.field) < 0 && !(Fields.field(s.field) && Fields.field(s.field).available && Fields.field(s.field).kind === 'number')) throw Error('INVALID_QUERY:sort');
    q.sort = { field: s.field || (q.ranking.enabled ? 'match' : 'marketCap'), dir: s.dir === 'asc' ? 'asc' : 'desc' };
    q.view = ['cards', 'compact', 'table'].indexOf(input.view) >= 0 ? input.view : 'cards';
    q.columns = Array.isArray(input.columns) ? input.columns.filter(function (c) { return Fields.field(c); }).slice(0, 12) : [];
    return q;
  }
  function validateFilter(f) {
    if (!f || typeof f !== 'object') throw Error('INVALID_QUERY:filter');
    var def = Fields.field(f.field);
    if (!def) throw Error('INVALID_QUERY:unknown-field:' + f.field);
    if (!def.available) throw Error('INVALID_QUERY:unavailable-field:' + f.field);
    var ops = Fields.operatorsFor(def);
    if (ops.indexOf(f.op) < 0) throw Error('INVALID_QUERY:operator:' + f.field);
    var out = { id: typeof f.id === 'string' && /^[a-z0-9]{1,16}$/i.test(f.id) ? f.id : newId('f'), field: def.id, op: f.op, value: null, value2: null,
      timeframe: def.timeframe || null, source: def.source || null };
    if (def.kind === 'enum') {
      if (!Array.isArray(f.value) || !f.value.length || f.value.length > 60) throw Error('INVALID_QUERY:enum-value:' + f.field);
      out.value = f.value.map(String).filter(function (v, i, a) { return v && v.length <= 40 && a.indexOf(v) === i; });
      if (!out.value.length) throw Error('INVALID_QUERY:enum-value:' + f.field);
    } else if (def.kind === 'bool') {
      out.value = f.value === true || f.value === 'true' || f.value === 1 || f.value === '1';
    } else {
      var v = Number(f.value);
      if (f.value === null || f.value === '' || !isFinite(v)) throw Error('INVALID_QUERY:value:' + f.field);
      out.value = v;
      if (f.op === 'between') {
        var v2 = Number(f.value2);
        if (f.value2 === null || f.value2 === '' || !isFinite(v2)) throw Error('INVALID_QUERY:value2:' + f.field);
        out.value = Math.min(v, v2); out.value2 = Math.max(v, v2);
      }
    }
    return out;
  }

  // ------------------------------------------------------------ Aenderungen
  function addFilter(q, filter, groupId) {
    var next = clone(q);
    var g = next.groups.filter(function (x) { return x.id === groupId; })[0] || next.groups[next.groups.length - 1];
    var f = validateFilter(Object.assign({ id: newId('f') }, filter));
    g.filters.push(f);
    return { query: next, filter: f };
  }
  function updateFilter(q, id, patch) {
    var next = clone(q);
    next.groups.forEach(function (g) { g.filters = g.filters.map(function (f) { return f.id === id ? validateFilter(Object.assign({}, f, patch, { id: id })) : f; }); });
    return next;
  }
  function removeFilter(q, id) {
    var next = clone(q);
    next.groups.forEach(function (g) { g.filters = g.filters.filter(function (f) { return f.id !== id; }); });
    return next;
  }
  function moveFilter(q, id, groupId) {
    var next = clone(q), moved = null;
    next.groups.forEach(function (g) { g.filters = g.filters.filter(function (f) { if (f.id === id) { moved = f; return false; } return true; }); });
    var target = next.groups.filter(function (g) { return g.id === groupId; })[0];
    if (moved && target) target.filters.push(moved);
    return next;
  }
  function addGroup(q, name) {
    var next = clone(q);
    if (next.groups.length >= MAX_GROUPS) return next;
    var n = 1; while (next.groups.some(function (g) { return g.id === 'g' + n; })) n++;
    next.groups.push({ id: 'g' + n, name: name || '', op: 'AND', filters: [] });
    next.mode = 'pro';
    return next;
  }
  function removeGroup(q, id) {
    var next = clone(q);
    if (next.groups.length <= 1) return next;
    var gone = next.groups.filter(function (g) { return g.id === id; })[0];
    next.groups = next.groups.filter(function (g) { return g.id !== id; });
    if (gone) next.groups[0].filters = next.groups[0].filters.concat(gone.filters);
    return next;
  }
  /** Pro -> Einfach: Gruppen werden zu EINER UND-Liste zusammengefuehrt. */
  function toSimple(q) {
    var next = clone(q);
    next.mode = 'simple';
    next.groups = [{ id: 'g1', name: '', op: 'AND', filters: filters(q).filter(function (f) { return !Fields.field(f.field).pro; }) }];
    next.logic = 'AND';
    next.ranking.enabled = false;
    if (next.sort.field === 'match') next.sort = { field: 'marketCap', dir: 'desc' };
    return next;
  }
  function hasProOnly(q) {
    return q.groups.length > 1 || q.logic === 'OR' || q.groups.some(function (g) { return g.op === 'OR'; }) || q.ranking.enabled ||
      filters(q).some(function (f) { return Fields.field(f.field).pro; });
  }
  function weightSum(q) { return FAMILIES.reduce(function (a, k) { return a + (q.ranking.weights[k] || 0); }, 0); }

  // ------------------------------------------------------------ URL
  function encVal(v) { return String(v).replace(/[:,~|]/g, ''); }
  function toParams(q) {
    var p = new URLSearchParams();
    q.groups.forEach(function (g, gi) {
      g.filters.forEach(function (f) {
        var val = Array.isArray(f.value) ? f.value.map(encVal).join(',') : f.value === true ? '1' : f.value === false ? '0' : String(f.value);
        p.append('f', (gi ? g.id + '~' : '') + f.field + ':' + f.op + ':' + val + (f.op === 'between' ? ':' + f.value2 : ''));
      });
    });
    var go = q.groups.filter(function (g) { return g.op === 'OR'; }).map(function (g) { return g.id + ':OR'; });
    if (go.length) p.set('go', go.join(','));
    var gn = q.groups.filter(function (g) { return g.name; }).map(function (g) { return g.id + ':' + encVal(g.name); });
    if (gn.length) p.set('gn', gn.join('|'));
    var extra = q.groups.slice(1).filter(function (g) { return !g.filters.length; }).map(function (g) { return g.id; });
    if (extra.length) p.set('gx', extra.join(','));
    if (q.logic === 'OR') p.set('logic', 'OR');
    if (q.mode === 'pro') p.set('mode', 'pro');
    if (q.ranking.enabled) p.set('rank', FAMILIES.map(function (k) { return k + ':' + q.ranking.weights[k]; }).join(','));
    var defSort = q.ranking.enabled ? 'match' : 'marketCap';
    if (q.sort.field !== defSort || q.sort.dir !== 'desc') p.set('sort', q.sort.field + ':' + q.sort.dir);
    if (q.view !== 'cards') p.set('view', q.view);
    if (q.universe !== 'US_REAL') p.set('u', q.universe);
    return p;
  }
  function fromParams(params) {
    var p = params instanceof URLSearchParams ? params : new URLSearchParams(params);
    var groups = [{ id: 'g1', name: '', op: 'AND', filters: [] }];
    var byId = { g1: groups[0] };
    function group(id) { if (!byId[id]) { byId[id] = { id: id, name: '', op: 'AND', filters: [] }; groups.push(byId[id]); } return byId[id]; }
    (p.get('gx') || '').split(',').filter(Boolean).forEach(function (id) { if (/^g[0-9]{1,2}$/.test(id)) group(id); });
    p.getAll('f').forEach(function (raw) {
      var gid = 'g1', s = raw;
      var t = raw.indexOf('~');
      if (t > 0) { gid = raw.slice(0, t); s = raw.slice(t + 1); if (!/^g[0-9]{1,2}$/.test(gid)) throw Error('INVALID_QUERY:group-id'); }
      var parts = s.split(':');
      if (parts.length < 3) throw Error('INVALID_QUERY:param');
      var def = Fields.field(parts[0]);
      if (!def) throw Error('INVALID_QUERY:unknown-field:' + parts[0]);
      var value = def.kind === 'enum' ? parts[2].split(',').filter(Boolean) : def.kind === 'bool' ? parts[2] === '1' : parts[2];
      group(gid).filters.push({ field: parts[0], op: parts[1], value: value, value2: parts[3] });
    });
    (p.get('go') || '').split(',').filter(Boolean).forEach(function (x) { var a = x.split(':'); if (byId[a[0]]) byId[a[0]].op = a[1] === 'OR' ? 'OR' : 'AND'; });
    (p.get('gn') || '').split('|').filter(Boolean).forEach(function (x) { var i = x.indexOf(':'); var id = x.slice(0, i); if (byId[id]) byId[id].name = x.slice(i + 1); });
    var input = { v: VERSION, universe: p.get('u') || 'US_REAL', mode: p.get('mode') === 'pro' ? 'pro' : 'simple', logic: p.get('logic') === 'OR' ? 'OR' : 'AND', groups: groups };
    if (p.get('rank')) {
      var w = {};
      p.get('rank').split(',').forEach(function (x) { var a = x.split(':'); w[a[0]] = Number(a[1]); });
      input.ranking = { enabled: true, weights: w };
    }
    if (p.get('sort')) { var s2 = p.get('sort').split(':'); input.sort = { field: s2[0], dir: s2[1] }; }
    if (p.get('view')) input.view = p.get('view');
    return validate(input);
  }
  /** Stabiler Schluessel eines Screens (fuer Verlauf und Monitoring). */
  function key(q) {
    var c = clone(q); c.view = 'cards'; c.columns = [];
    c.groups.forEach(function (g) { g.filters.forEach(function (f) { delete f.id; }); });
    return JSON.stringify([c.universe, c.logic, c.groups.map(function (g) { return [g.op, g.filters]; }), c.ranking.enabled ? c.ranking.weights : null]);
  }

  var API = {
    VERSION: 'vu-screener-query-1.0.0', SCHEMA_VERSION: VERSION, FAMILIES: FAMILIES, DEFAULT_WEIGHTS: DEFAULT_WEIGHTS, SORTABLE: SORTABLE, MAX_FILTERS: MAX_FILTERS,
    empty: empty, clone: clone, validate: validate, validateFilter: validateFilter, filters: filters, count: count,
    addFilter: addFilter, updateFilter: updateFilter, removeFilter: removeFilter, moveFilter: moveFilter,
    addGroup: addGroup, removeGroup: removeGroup, toSimple: toSimple, hasProOnly: hasProOnly, weightSum: weightSum,
    toParams: toParams, fromParams: fromParams, key: key
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.VUScreenerQuery = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
