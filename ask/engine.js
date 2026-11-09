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
    /* Datenstand-Richtlinie: ein zurückgehaltener Titel wird nie als aktuelle Lage beschrieben */
    if (x.withheld) return x.symbol + ': ' + (x.notice || 'Analyse zurückgehalten.');
    var usd = function (v) { return Fields.format('price', v); };
    var p = x.primaryScenario, parts = [];
    parts.push(x.symbol + ': Ausblick ' + (x.outlook && x.outlook.label || '–') + (x.structure && x.structure.label ? ', ' + x.structure.label : '') + '.');
    if (p && p.entryZone && p.invalidation !== null) {
      parts.push('Hauptszenario mit Zone ' + usd(p.entryZone[0]) + ' bis ' + usd(p.entryZone[1]) + '; es gilt, solange ' + usd(p.invalidation) +
        ' nicht per Schlusskurs ' + (p.direction === 'BEARISH' ? 'überschritten' : 'unterschritten') + ' wird.');
    }
    parts.push(x.elliott.abstained ? 'Elliott: keine belastbare Zählung.' : 'Elliott (experimentell): Strukturklarheit ' + x.elliott.applicability.label.toLowerCase() + '.');
    if (x.delayed && x.notice) parts.push(x.notice + '.');
    return parts.join(' ');
  }

  /** Link in den Screener mit genau dieser Abfrage. */
  function screenerUrl(result) {
    return '/screener/?' + Query.toParams(result.query).toString();
  }

  /**
   * Klartext fuer eine Antwort ohne Auswertung. Jede Ablehnung des Workers
   * bekommt einen Satz - nie ein stilles Haengenbleiben.
   * @param {number} status HTTP-Status (0 = keine Verbindung, -1 = Zeitueberschreitung)
   * @param {object|null} body JSON-Antwort des Workers, falls lesbar
   * @returns {{title:string, text:string, code:string}}
   */
  var FAILURES = {
    TIMEOUT: ['Keine Antwort', 'Die Fragefunktion hat nicht rechtzeitig geantwortet. Bitte gleich noch einmal versuchen.'],
    NETWORK: ['Keine Verbindung', 'Die Fragefunktion ist gerade nicht erreichbar. Bitte die Internetverbindung prüfen und erneut versuchen.'],
    ORIGIN_NOT_ALLOWED: ['Nicht freigegeben', 'Diese Seite darf die Fragefunktion nicht aufrufen. Bitte über research.visionuniverse.de fragen.'],
    CREDIT_EXHAUSTED: ['Kontingent aufgebraucht', 'Das Kontingent der Fragefunktion ist aufgebraucht. Bereits gestellte Fragen werden weiter beantwortet.'],
    DISABLED: ['Abgeschaltet', 'Die Fragefunktion ist gerade abgeschaltet.'],
    UPSTREAM: ['Keine Auswertung', 'Die Frage konnte gerade nicht ausgewertet werden. Ihr Kontingent wurde nicht belastet. Bitte gleich noch einmal versuchen.'],
    INVALID_QUESTION: ['Frage zu kurz oder zu lang', 'Bitte eine Frage mit 3 bis 400 Zeichen stellen.'],
    TOO_LARGE: ['Frage zu lang', 'Bitte eine kürzere Frage stellen.'],
    INTERNAL: ['Fehler im Dienst', 'Bei der Auswertung ist ein Fehler aufgetreten. Bitte später erneut versuchen.']
  };
  function failure(status, body) {
    var code = body && typeof body.reason === 'string' ? body.reason : status === -1 ? 'TIMEOUT' : status === 0 ? 'NETWORK' : 'HTTP_' + status;
    var known = FAILURES[code];
    var text = body && typeof body.message === 'string' && body.message ? body.message : known ? known[1]
      : 'Die Frage konnte nicht ausgewertet werden (Fehler ' + code + '). Bitte später erneut versuchen.';
    return { title: known ? known[0] : 'Keine Auswertung', text: text, code: code };
  }

  /* ------------------------------------------------------------ Darstellung (Konzept mein-bereich-2026-11, Screens a-screen/a-answer)
     Nur Aufbereitung dessen, was die Übersetzung und die Rechnung oben liefern; keine eigene Rechnung über die Daten. */

  /** Regel-Chips „So hat Atlas übersetzt“: je Filter ein Chip (Text aus der Screener-Beschreibung), dazu Methode und Aktien. */
  function rules(result, dict) {
    var out = [];
    if (result && result.query) Query.filters(result.query).forEach(function (f) {
      var fld = Fields.field(f.field);
      out.push({ kind: 'filter', id: f.id, field: f.field, text: Fields.describeFilter(f, dict), source: fld ? fld.source : null });
    });
    if (result && result.supertrader) out.push({ kind: 'strategy', text: (result.supertrader.mode === 'require' ? 'erfüllt: ' : 'Status: ') + (STRATEGY_LABELS[result.supertrader.strategy] || result.supertrader.strategy) });
    (result && result.tickers || []).forEach(function (t) { out.push({ kind: 'ticker', text: 'Aktie: ' + t }); });
    return out;
  }
  /** Zahl der Regeln in Worten für „erfüllen alle drei“. */
  function allOf(n) { return n <= 1 ? 'die Regel' : n <= 12 ? 'alle ' + ['zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'][n - 2] : 'alle ' + n; }

  /* Kennzahl der Frage → Jahresreihe der SEC-Berichte in der Aktiendatei (/discover/data/stocks/US_REAL/<T>.json,
     fundamentals.journey.tracks; dieselben Werte wie in Fundamental). */
  var SEC_TRACK = { fcfGrowth: 'free_cash_flow', freeCashFlow: 'free_cash_flow', fcfMargin: 'free_cash_flow',
    revenueGrowth: 'revenue', revenue: 'revenue', revenueCagr3y: 'revenue', netIncome: 'net_income', epsGrowth: 'eps_diluted', eps: 'eps_diluted' };
  var SEC_LABEL = { free_cash_flow: ['Free Cashflow', 'Free Cashflow = operativer Cashflow − Investitionen'], revenue: ['Umsatz', 'Umsatz laut Jahresbericht (10-K)'],
    net_income: ['Nettogewinn', 'Nettogewinn laut Jahresbericht (10-K)'], eps_diluted: ['Gewinn je Aktie', 'verwässerter Gewinn je Aktie laut 10-K'] };
  function secTrack(columns) { for (var i = 0; i < (columns || []).length; i++) if (SEC_TRACK[columns[i]]) return SEC_TRACK[columns[i]]; return null; }
  /**
   * explain(stockFile, track, years) -> {label, formula, fromFy, toFy, first, last, lastChange, bars:[[fy, wert]], asOf} | null
   * Die letzten `years` Geschäftsjahre aus der veröffentlichten Reihe; lastChange = letzter Wert zum Vorjahr (nur bei positivem Vorjahr).
   */
  function explain(stockFile, track, years) {
    var f = stockFile && stockFile.fundamentals, t = f && f.journey && f.journey.tracks && f.journey.tracks[track];
    if (!Array.isArray(t)) return null;
    var pts = t.filter(function (x) { return x && typeof x.v === 'number' && isFinite(x.v) && x.fy; }).slice(-(years || 4));
    if (pts.length < 2) return null;
    var a = pts[pts.length - 2].v, b = pts[pts.length - 1].v;
    return { track: track, label: SEC_LABEL[track] ? SEC_LABEL[track][0] : track, formula: SEC_LABEL[track] ? SEC_LABEL[track][1] : '',
      fromFy: pts[0].fy, toFy: pts[pts.length - 1].fy, first: pts[0].v, last: b, lastChange: a > 0 ? b / a - 1 : null,
      bars: pts.map(function (x) { return [String(x.fy), x.v]; }), asOf: f.asOf || null };
  }

  var API = { rules: rules, allOf: allOf, secTrack: secTrack, explain: explain, failure: failure, runScreen: runScreen, runStock: runStock, runChartbild: runChartbild, chartbildSentence: chartbildSentence, strategyIndex: strategyIndex, screenerUrl: screenerUrl,
    columnsFor: columnsFor, STRATEGY_LABELS: STRATEGY_LABELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.VUAskEngine = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
