/* =========================================================================
   VISION UNIVERSE — ask/engine.js

   DIE AUSWERTUNG EINER UEBERSETZTEN FRAGE (rein, ohne DOM; Browser und Node)

   Das Sprachmodell hat nur uebersetzt. Gerechnet wird hier - mit
   derselben Filter-Engine wie im Screener und auf denselben Daten
   (/screener/data/universe-US_REAL.json), verknuepft mit den taeglichen
   Supertrader-Signalen (/supertrader/data/signals.json).

   Ein Titel, zu dem eine Strategie nichts meldet, ist nicht automatisch
   "erfuellt nicht": Wenn die Signaldatei nur eine Auswahl veroeffentlicht,
   heisst der Status "nicht geprueft" - und das steht dann auch da.
   ========================================================================= */
(function (global) {
  'use strict';
  var Fields = global.VUScreenerFields || (typeof require === 'function' ? require('../screener/engine/fields.js') : null);
  var Query = global.VUScreenerQuery || (typeof require === 'function' ? require('../screener/engine/query.js') : null);
  var Engine = global.VUScreenerEngine || (typeof require === 'function' ? require('../screener/engine/engine.js') : null);
  var TITools = (global.VUTechnical && global.VUTechnical.TIAITools) || (typeof require === 'function' ? require('../quant/engines/technical/ti/ai-tools.js') : null);

  var STRATEGY_LABELS = {
    MINERVINI_VCP: 'Minervini Trend Template / VCP',
    MOMENTUM_BREAKOUT: 'Momentum-Ausbruch (Kullamägi)',
    WEINSTEIN_STAGE: 'Weinstein Stage 2',
    DARVAS_BOX: 'Darvas-Box'
  };
  var STATE_LABELS = {
    DISCOVERED: 'Entdeckt', WATCH: 'Beobachten', SETUP: 'Setup', ENTRY_READY: 'Einstieg bereit',
    TRIGGERED: 'Ausgelöst', ACTIVE: 'Aktiv', WARNING: 'Warnung', EXIT: 'Ausstieg'
  };

  /**
   * Status einer Strategie je Symbol.
   * @returns {{label, complete:boolean, of:function(sym):{pass:boolean|null, label:string}}}
   */
  function strategyIndex(signals, strategyId) {
    var st = signals && signals.strategies && signals.strategies[strategyId];
    if (!st) return { label: STRATEGY_LABELS[strategyId] || strategyId, complete: false, asOf: null, of: function () { return { pass: null, label: 'keine Daten' }; } };
    var open = Object.create(null), scanned = Object.create(null);
    (st.open || []).forEach(function (s) { open[s.symbol] = s.state; });
    (st.scanner && st.scanner.top || []).forEach(function (s) { scanned[s.symbol] = s.stage; });
    var complete = !!(st.scanner && Array.isArray(st.scanner.symbols));
    if (complete) st.scanner.symbols.forEach(function (sym) { if (!scanned[sym]) scanned[sym] = 'DISCOVERED'; });
    return {
      label: STRATEGY_LABELS[strategyId] || strategyId,
      complete: complete,
      asOf: signals.asOf || null,
      of: function (sym) {
        if (open[sym]) return { pass: true, label: STATE_LABELS[open[sym]] || open[sym] };
        if (scanned[sym]) return { pass: true, label: STATE_LABELS[scanned[sym]] || scanned[sym] };
        return complete ? { pass: false, label: 'erfüllt nicht' } : { pass: null, label: 'nicht geprüft' };
      }
    };
  }

  function columnsFor(result) {
    var cols = ['marketCap'];
    if (result.query) Query.filters(result.query).forEach(function (f) { if (cols.indexOf(f.field) < 0) cols.push(f.field); });
    (result.show || []).forEach(function (id) { if (cols.indexOf(id) < 0 && Fields.field(id)) cols.push(id); });
    return cols.slice(0, 9);
  }

  /**
   * Suche ausfuehren.
   * @returns {{rows:[{symbol,name,values:{},strategy:{pass,label}|null}], columns, total, matched, universe, funnel, strategy, note}}
   */
  function runScreen(ds, result, signals) {
    var q = result.query;
    var ev = Engine.evaluate(ds, q);
    var order = Engine.sortIndices(ds, q, ev.indices);
    var st = result.supertrader ? strategyIndex(signals, result.supertrader.strategy) : null;
    var require = st && result.supertrader.mode === 'require';
    var columns = columnsFor(result);
    var rows = [], matched = 0;
    for (var k = 0; k < order.length; k++) {
      var i = order[k], sym = ds.symbol(i);
      var status = st ? st.of(sym) : null;
      if (require && status.pass !== true) continue;
      matched++;
      if (rows.length >= (q.limit || 25)) continue;
      var values = {};
      columns.forEach(function (c) { values[c] = ds.value(c, i); });
      rows.push({ symbol: sym, name: ds.name(i), values: values, strategy: status });
    }
    var note = null;
    if (st && !st.complete) note = 'Für diese Strategie liegt nur die veröffentlichte Auswahl (Top 60) vor. Titel außerhalb davon gelten als „nicht geprüft“.';
    return { rows: rows, columns: columns, total: ev.count, matched: require ? matched : ev.count, universe: ev.universe,
      funnel: ev.funnel, strategy: st ? { id: result.supertrader.strategy, label: st.label, mode: result.supertrader.mode, asOf: st.asOf } : null, note: note };
  }

  /** Frage zu bestimmten Aktien: Werte je Ticker. */
  function runStock(ds, result, signals) {
    var columns = (result.show || []).filter(function (id) { return Fields.field(id); });
    if (!columns.length) columns = ['price', 'marketCap', 'revenueGrowth', 'fcfGrowth', 'perf1y'];
    var st = result.supertrader ? strategyIndex(signals, result.supertrader.strategy) : null;
    return {
      columns: columns,
      strategy: st ? { id: result.supertrader.strategy, label: st.label } : null,
      stocks: (result.tickers || []).map(function (sym) {
        var i = ds.indexOf(sym);
        if (i < 0) return { symbol: sym, found: false };
        var values = {};
        columns.forEach(function (c) { values[c] = ds.value(c, i); });
        return { symbol: sym, name: ds.name(i), found: true, values: values, strategy: st ? st.of(sym) : null };
      })
    };
  }

  /**
   * Chartbild-Werkzeug (getChartbildLage) je Ticker - lesend, auf dem
   * veroeffentlichten Index (/quant/data/technical-intelligence/v3/).
   * Das Sprachmodell hat es nur eingeschaltet; jede Zahl stammt von hier.
   * @returns {{tool, stocks:[situation]}}
   */
  function runChartbild(index, meta, result) {
    var rows = index && Array.isArray(index.rows) ? index.rows : [];
    var by = Object.create(null);
    rows.forEach(function (r) { if (r && r.t) by[r.t] = r; });
    return {
      tool: 'getChartbildLage',
      stocks: (result.tickers || []).map(function (sym) {
        return TITools.situation(by[sym] || null, { symbol: sym, index: index, meta: meta, latestAsOf: new Date().toISOString().slice(0, 10) });   // Bezug heute: ein veralteter Index gilt nicht als frisch
      })
    };
  }

  /** Ein neutraler Satz je Titel zum Vorlesen - Lage und Bedingung, keine Empfehlung. */
  function chartbildSentence(x) {
    if (!x || !x.found) return (x && x.symbol || '') + ': Für diesen Titel liegt kein Chartbild vor.';
    var usd = function (v) { return Fields.format('price', v); };
    var p = x.primaryScenario, parts = [];
    parts.push(x.symbol + ': Ausblick ' + (x.outlook && x.outlook.label || '–') + (x.structure && x.structure.label ? ', ' + x.structure.label : '') + '.');
    if (p && p.entryZone && p.invalidation !== null) {
      parts.push('Hauptszenario mit Zone ' + usd(p.entryZone[0]) + ' bis ' + usd(p.entryZone[1]) + '; es gilt, solange ' + usd(p.invalidation) +
        ' nicht per Schlusskurs ' + (p.direction === 'BEARISH' ? 'überschritten' : 'unterschritten') + ' wird.');
    }
    parts.push(x.elliott.abstained ? 'Elliott: keine belastbare Zählung.' : 'Elliott (experimentell): Strukturklarheit ' + x.elliott.applicability.label.toLowerCase() + '.');
    return parts.join(' ');
  }

  /** Link in den Screener mit genau dieser Abfrage. */
  function screenerUrl(result) {
    return '/screener/?' + Query.toParams(result.query).toString();
  }

  var API = { runScreen: runScreen, runStock: runStock, runChartbild: runChartbild, chartbildSentence: chartbildSentence, strategyIndex: strategyIndex, screenerUrl: screenerUrl,
    columnsFor: columnsFor, STRATEGY_LABELS: STRATEGY_LABELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.VUAskEngine = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
