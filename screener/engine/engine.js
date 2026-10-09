/* =========================================================================
   VISION UNIVERSE SCREENER — engine/engine.js

   DIE FILTER-ENGINE (rein, ohne DOM; Browser, Worker und Node)

   Eingabe:  ein Dataset (spaltenbasiert, aus dem Universums-Artefakt oder
             von einem Server-Adapter) und ein validiertes Screen-Modell.
   Ausgabe:  Trefferindizes, Filter-Impact (Trichter), Why-Match, Match-
             Score, Sortierung, Verteilungen.

   Fehlende Werte erfuellen KEINE Bedingung. Der Trichter weist aus, wie
   viele Titel ein Filter wegen fehlender Daten verliert - so bleibt
   sichtbar, ob ein Filter den Markt oder die Datenlage einschraenkt.
   ========================================================================= */
(function (global) {
  'use strict';
  var Fields = global.VUScreenerFields || (typeof require === 'function' ? require('./fields.js') : null);
  var Query = global.VUScreenerQuery || (typeof require === 'function' ? require('./query.js') : null);

  // ------------------------------------------------------------ Dataset
  function createDataset(artifact) {
    if (!artifact || !artifact.cols || !Array.isArray(artifact.cols.s)) throw Error('INVALID_DATASET');
    var n = artifact.cols.s.length;
    var cols = artifact.cols;
    var derived = {};
    derived.region = cols.co.map(function (c) { return c ? (Fields.REGION_OF[c] || 'OTHER') : null; });
    derived.year = cols.ipo.map(function (d) { var y = d ? Number(String(d).slice(0, 4)) : NaN; return isFinite(y) ? y : null; });
    var bySymbol = Object.create(null);
    for (var i = 0; i < n; i++) bySymbol[cols.s[i]] = i;
    var accessorCache = {};
    function column(fieldId) {
      if (accessorCache[fieldId]) return accessorCache[fieldId];
      var f = Fields.field(fieldId);
      if (!f || !f.available) return null;
      var arr = f.derive === 'region' ? derived.region : f.derive === 'year' ? derived.year : cols[f.col];
      if (!arr) return null;
      accessorCache[fieldId] = arr;
      return arr;
    }
    var ds = {
      size: n, meta: artifact, cols: cols, column: column,
      symbol: function (i) { return cols.s[i]; },
      name: function (i) { return cols.n[i]; },
      indexOf: function (sym) { var i = bySymbol[sym]; return i === undefined ? -1 : i; },
      value: function (fieldId, i) { var c = column(fieldId); return c ? c[i] : null; },
      coverage: function (fieldId) {
        var c = column(fieldId); if (!c) return 0;
        var k = 0; for (var j = 0; j < n; j++) if (c[j] !== null && c[j] !== undefined) k++; return k;
      }
    };
    ds._pct = {};
    return ds;
  }

  function isAvailable(ds, fieldId) {
    var f = Fields.field(fieldId);
    if (!f || !f.available) return false;
    var c = ds.column(fieldId);
    if (!c) return false;
    for (var i = 0; i < c.length; i++) if (c[i] !== null && c[i] !== undefined) return true;
    return false;
  }

  // ------------------------------------------------------------ Praedikate
  /** true | false | null (null = kein Wert vorhanden) */
  function compile(ds, filter) {
    var f = Fields.field(filter.field), c = ds.column(filter.field);
    if (!f || !c) return function () { return null; };
    if (f.kind === 'enum') {
      var set = Object.create(null); filter.value.forEach(function (v) { set[v] = 1; });
      if (f.multi) return function (i) { var v = c[i]; if (!v || !v.length) return false; for (var k = 0; k < v.length; k++) if (set[v[k]]) return true; return false; };
      return function (i) { var v = c[i]; return v === null || v === undefined ? null : !!set[v]; };
    }
    if (f.kind === 'bool') { var want = filter.value ? 1 : 0; return function (i) { var v = c[i]; return v === null || v === undefined ? null : (v ? 1 : 0) === want; }; }
    var a = filter.value, b = filter.value2;
    var eqTol = Math.max(Math.abs(a) * 0.005, f.unit === 'pct' ? 0.0005 : 0.005);
    var test = {
      gt: function (v) { return v > a; }, gte: function (v) { return v >= a; },
      lt: function (v) { return v < a; }, lte: function (v) { return v <= a; },
      between: function (v) { return v >= a && v <= b; }, eq: function (v) { return Math.abs(v - a) <= eqTol; }
    }[filter.op];
    return function (i) { var v = c[i]; return v === null || v === undefined ? null : test(v); };
  }

  function activeGroups(q) { return q.groups.filter(function (g) { return g.filters.length; }); }

  /**
   * Wertet einen Screen aus.
   * @returns {{indices:number[], count, universe, funnel, perFilter, groups}}
   */
  function evaluate(ds, q) {
    var n = ds.size, groups = activeGroups(q);
    var compiled = {};
    Query.filters(q).forEach(function (f) { compiled[f.id] = compile(ds, f); });
    var perFilter = {};
    Query.filters(q).forEach(function (f) {
      var p = compiled[f.id], pass = 0, missing = 0;
      for (var i = 0; i < n; i++) { var r = p(i); if (r === true) pass++; else if (r === null) missing++; }
      perFilter[f.id] = { pass: pass, missing: missing };
    });
    function groupPass(g, i) {
      if (g.op === 'OR') { for (var k = 0; k < g.filters.length; k++) if (compiled[g.filters[k].id](i) === true) return true; return false; }
      for (var j = 0; j < g.filters.length; j++) if (compiled[g.filters[j].id](i) !== true) return false;
      return true;
    }
    var funnel = [{ kind: 'start', label: 'Ausgangsuniversum', count: n, lost: 0, missing: 0 }];
    var alive = new Uint8Array(n), current = n;
    for (var i0 = 0; i0 < n; i0++) alive[i0] = 1;
    var groupStats = {};
    if (!groups.length) {
      // keine Filter: alles
    } else if (q.logic === 'AND') {
      groups.forEach(function (g, gi) {
        var steps = g.op === 'AND' ? g.filters.map(function (f) { return { filter: f, test: function (i) { return compiled[f.id](i); } }; })
          : [{ group: g, test: function (i) { return groupPass(g, i) ? true : false; } }];
        steps.forEach(function (st) {
          var lost = 0, miss = 0;
          for (var i = 0; i < n; i++) {
            if (!alive[i]) continue;
            var r = st.test(i);
            if (r !== true) { alive[i] = 0; lost++; if (r === null) miss++; }
          }
          current -= lost;
          funnel.push(st.filter
            ? { kind: 'filter', filterId: st.filter.id, groupId: g.id, label: Fields.describeFilter(st.filter), count: current, lost: lost, missing: miss }
            : { kind: 'group', groupId: g.id, label: (g.name || 'Gruppe ' + (gi + 1)) + ' (ODER)', count: current, lost: lost, missing: 0 });
        });
      });
    } else {
      var any = new Uint8Array(n);
      groups.forEach(function (g, gi) {
        var c = 0;
        for (var i = 0; i < n; i++) if (groupPass(g, i)) { any[i] = 1; c++; }
        groupStats[g.id] = c;
        funnel.push({ kind: 'group', groupId: g.id, label: (g.name || 'Gruppe ' + (gi + 1)) + ' – allein', count: c, lost: n - c, missing: 0, standalone: true });
      });
      current = 0;
      for (var j = 0; j < n; j++) { alive[j] = any[j]; if (any[j]) current++; }
      funnel.push({ kind: 'union', label: 'Mindestens eine Gruppe erfüllt (ODER)', count: current, lost: n - current, missing: 0 });
    }
    var indices = [];
    for (var k = 0; k < n; k++) if (alive[k]) indices.push(k);
    return { indices: indices, count: indices.length, universe: n, funnel: funnel, perFilter: perFilter, groups: groupStats };
  }

  /** Why Match: jede Bedingung mit gemessenem Wert. */
  function why(ds, q, i) {
    return q.groups.map(function (g, gi) {
      return {
        groupId: g.id, name: g.name || (q.groups.length > 1 ? 'Gruppe ' + (gi + 1) : ''), op: g.op,
        items: g.filters.map(function (f) {
          var def = Fields.field(f.field), raw = ds.value(f.field, i), r = compile(ds, f)(i);
          var shown;
          if (raw === null || raw === undefined) shown = 'Keine Daten';
          else if (def.kind === 'enum') shown = def.multi ? raw.map(function (v) { return Fields.enumLabel(def, v); }).join(', ') : Fields.enumLabel(def, raw);
          else shown = Fields.format(def, raw, { signed: def.unit === 'pct' });
          return { filter: f, field: def, label: Fields.describeFilter(f), value: raw, shown: shown, pass: r };
        })
      };
    }).filter(function (g) { return g.items.length; });
  }

  // ------------------------------------------------------------ Ranking
  /** Komponenten je Familie: [Feld, Richtung]. Offen gelegt in der Oberflaeche. */
  var FAMILY_COMPONENTS = {
    momentum: [['perf6m', 1], ['perf1y', 1], ['relativeStrengthPct', 1], ['distance52wHigh', 1]],
    growth: [['revenueGrowth', 1], ['revenueCagr3', 1], ['epsGrowth', 1]],
    quality: [['grossMargin', 1], ['fcfMargin', 1], ['roe', 1], ['roic', 1]],
    value: [['peFy', -1], ['ps', -1], ['evEbitda', -1], ['fcfYield', 1]]
  };
  var FAMILY_LABELS = { momentum: 'Momentum', growth: 'Wachstum', quality: 'Qualität', value: 'Bewertung' };

  /** Perzentil 0-100 je Titel im GESAMTEN Universum (stabil, unabhaengig vom Filter). */
  function percentiles(ds, fieldId, dir) {
    var key = fieldId + ':' + dir;
    if (ds._pct[key]) return ds._pct[key];
    var c = ds.column(fieldId), n = ds.size, out = new Float32Array(n).fill(NaN);
    if (!c) return (ds._pct[key] = out);
    var idx = [];
    for (var i = 0; i < n; i++) {
      var v = c[i];
      if (v === null || v === undefined) continue;
      if (dir < 0 && v <= 0) continue; // negatives KGV etc. ist keine "guenstige" Bewertung
      idx.push(i);
    }
    idx.sort(function (a, b) { return (c[a] - c[b]) * dir; });
    var m = idx.length;
    for (var r = 0; r < m; r++) out[idx[r]] = m > 1 ? (r / (m - 1)) * 100 : 50;
    return (ds._pct[key] = out);
  }
  function familyScore(ds, family, i) {
    var comps = FAMILY_COMPONENTS[family], sum = 0, k = 0;
    comps.forEach(function (c) { var p = percentiles(ds, c[0], c[1])[i]; if (!isNaN(p)) { sum += p; k++; } });
    return k ? { score: sum / k, used: k, of: comps.length } : null;
  }
  /** Match 0-100 nach Nutzergewichtung. Kein Anlageurteil. */
  function match(ds, q, i) {
    var w = q.ranking.weights, total = 0, acc = 0, parts = {};
    Query.FAMILIES.forEach(function (fam) {
      if (!(w[fam] > 0)) return;
      var s = familyScore(ds, fam, i);
      parts[fam] = s;
      if (s) { acc += s.score * w[fam]; total += w[fam]; }
    });
    var want = Query.FAMILIES.filter(function (f) { return w[f] > 0; }).length;
    var have = Object.keys(parts).filter(function (k) { return parts[k]; }).length;
    if (!total) return { score: null, parts: parts, families: have, of: want };
    return { score: acc / total, parts: parts, families: have, of: want };
  }

  // ------------------------------------------------------------ Sortierung
  function sortIndices(ds, q, indices) {
    var s = q.sort, dir = s.dir === 'asc' ? 1 : -1, arr = indices.slice();
    var key;
    if (s.field === 'match') {
      var cache = {};
      key = function (i) { if (!(i in cache)) { var m = match(ds, q, i).score; cache[i] = m; } return cache[i]; };
    } else if (s.field === 'name') {
      return arr.sort(function (a, b) { return String(ds.name(a)).localeCompare(String(ds.name(b)), 'de') * dir; });
    } else {
      var c = ds.column(s.field) || ds.column('marketCap');
      key = function (i) { return c[i]; };
    }
    return arr.sort(function (a, b) {
      var x = key(a), y = key(b), xn = x === null || x === undefined || isNaN(x), yn = y === null || y === undefined || isNaN(y);
      if (xn && yn) return 0; if (xn) return 1; if (yn) return -1;
      return (x - y) * dir || (ds.cols.mcap[b] || 0) - (ds.cols.mcap[a] || 0);
    });
  }

  // ------------------------------------------------------------ Adaptive Karten
  var FOCUS_METRICS = {
    momentum: ['perf6m', 'distance52wHigh', 'relativeVolume', 'priceVsSma200'],
    growth: ['revenueGrowth', 'epsGrowth', 'revenueCagr3', 'grossMargin'],
    value: ['pe', 'evEbitda', 'fcfYield', 'ps'],
    quality: ['roic', 'fcfMargin', 'grossMargin', 'debtToEquity'],
    base: ['marketCap', 'revenueGrowth', 'perf6m', 'pe']
  };
  var GROUP_FOCUS = { momentum: 'momentum', technical: 'momentum', growth: 'growth', valuation: 'value', quality: 'quality', balance: 'quality' };
  function focus(q) {
    var score = { momentum: 0, growth: 0, value: 0, quality: 0 };
    Query.filters(q).forEach(function (f) { var g = GROUP_FOCUS[Fields.field(f.field).group]; if (g) score[g] += 1; });
    if (q.ranking && q.ranking.enabled) Query.FAMILIES.forEach(function (k) { score[k] += (q.ranking.weights[k] || 0) / 25; });
    var best = 'base', top = 0;
    Object.keys(score).forEach(function (k) { if (score[k] > top) { top = score[k]; best = k; } });
    return best;
  }
  /** Bis zu `max` Kennzahlen fuer Karten: zuerst gefilterte Zahlen, dann der Fokus. */
  function cardMetrics(q, max) {
    max = max || 4;
    var out = [];
    function push(id) { var f = Fields.field(id); if (f && f.available && f.kind === 'number' && out.indexOf(id) < 0 && out.length < max) out.push(id); }
    if (!q.focus || q.focus === 'auto') Query.filters(q).forEach(function (f) { if (f.field !== 'ipoYear') push(f.field); });
    FOCUS_METRICS[q.focus && q.focus !== 'auto' ? q.focus : focus(q)].forEach(push);
    FOCUS_METRICS.base.forEach(push);
    return out;
  }

  // ------------------------------------------------------------ Verteilungen
  function quantile(sorted, p) { if (!sorted.length) return null; var idx = (sorted.length - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx); return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo); }
  /** Histogramm einer Kennzahl im Universum (fuer die Filter-Detailansicht). */
  function histogram(ds, fieldId, bins) {
    bins = bins || 28;
    var f = Fields.field(fieldId), c = ds.column(fieldId);
    if (!f || !c || f.kind !== 'number') return null;
    var vals = [];
    for (var i = 0; i < ds.size; i++) { var v = c[i]; if (v !== null && v !== undefined && isFinite(v)) vals.push(v); }
    if (!vals.length) return { bins: [], total: 0, missing: ds.size, lo: 0, hi: 0, log: false };
    vals.sort(function (a, b) { return a - b; });
    var log = f.scale === 'log' && quantile(vals, 0.01) > 0;
    var lo = f.domain ? f.domain[0] : quantile(vals, 0.02), hi = f.domain ? f.domain[1] : quantile(vals, 0.98);
    if (log) { lo = Math.max(quantile(vals, 0.01), 1e-9); hi = quantile(vals, 0.995); }
    if (!(hi > lo)) hi = lo + 1;
    var tf = log ? Math.log10 : function (x) { return x; };
    var a = tf(lo), b = tf(hi), w = (b - a) / bins, out = [];
    for (var k = 0; k < bins; k++) out.push({ lo: log ? Math.pow(10, a + k * w) : a + k * w, hi: log ? Math.pow(10, a + (k + 1) * w) : a + (k + 1) * w, count: 0 });
    var below = 0, above = 0;
    vals.forEach(function (v) {
      if (log && v <= 0) { below++; return; }
      var t = (tf(v) - a) / w, k = Math.floor(t);
      if (k < 0) { below++; k = 0; } else if (k >= bins) { above++; k = bins - 1; }
      out[k].count++;
    });
    return { bins: out, total: vals.length, missing: ds.size - vals.length, lo: lo, hi: hi, log: log, below: below, above: above,
      median: quantile(vals, 0.5), p10: quantile(vals, 0.1), p90: quantile(vals, 0.9) };
  }
  /** Werte eines Enum-Feldes mit Anzahl im Universum. */
  function enumOptions(ds, fieldId) {
    var f = Fields.field(fieldId), c = ds.column(fieldId);
    if (!f || !c) return [];
    var counts = Object.create(null), missing = 0;
    for (var i = 0; i < ds.size; i++) {
      var v = c[i];
      if (v === null || v === undefined) { missing++; continue; }
      (f.multi ? v : [v]).forEach(function (x) { counts[x] = (counts[x] || 0) + 1; });
    }
    var dict = ds.meta && ds.meta.dict;
    return Object.keys(counts).map(function (k) { return { value: k, label: Fields.enumLabel(f, k, dict), count: counts[k] }; })
      .sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label, 'de'); });
  }

  /** Veraenderung zwischen zwei Laeufen eines gespeicherten Screens. */
  function diff(previous, current) {
    var prev = new Set(previous || []), cur = new Set(current || []);
    var added = [], removed = [], unchanged = [];
    cur.forEach(function (s) { (prev.has(s) ? unchanged : added).push(s); });
    prev.forEach(function (s) { if (!cur.has(s)) removed.push(s); });
    return { added: added, removed: removed, unchanged: unchanged };
  }

  var API = {
    VERSION: 'vu-screener-engine-1.0.0',
    createDataset: createDataset, isAvailable: isAvailable, compile: compile, evaluate: evaluate, why: why,
    FAMILY_COMPONENTS: FAMILY_COMPONENTS, FAMILY_LABELS: FAMILY_LABELS, percentiles: percentiles, familyScore: familyScore, match: match,
    sortIndices: sortIndices, focus: focus, cardMetrics: cardMetrics, FOCUS_METRICS: FOCUS_METRICS,
    histogram: histogram, enumOptions: enumOptions, diff: diff
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.VUScreenerEngine = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
