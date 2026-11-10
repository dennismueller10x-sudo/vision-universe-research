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
  /* ---- Klartext fuer Chips und Trefferzeilen (Owner-Vorlage „NEU“, 10.11.2026):
     „Börsenwert 0,3–2 Mrd. $“, „KGV bis 15“, „mehr Kasse als Schulden“ statt Operatorzeichen. */
  var NAMES = { marketCap: 'Börsenwert', netCash: 'Kasse netto', pe: 'KGV', cash: 'Kasse', totalDebt: 'Schulden' };
  /** Kurzer deutscher Name einer Kennzahl (englische Kurzform → deutsches Label). */
  function name(id) {
    if (NAMES[id]) return NAMES[id];
    var f = Fields.field(id);
    if (!f) return id;
    return f.short && f.short !== f.en ? f.short : f.label;
  }
  function deNum(v, digits) {
    var r = Number(v.toFixed(digits === undefined ? 2 : digits));
    return r.toLocaleString('de-DE', { maximumFractionDigits: digits === undefined ? 2 : digits });
  }
  var MONEY_UNITS = [[1e12, 'Bio.'], [1e9, 'Mrd.'], [1e6, 'Mio.'], [1e3, 'Tsd.']];
  function moneyUnit(v) { var a = Math.abs(v); for (var i = 0; i < MONEY_UNITS.length; i++) if (a >= MONEY_UNITS[i][0]) return MONEY_UNITS[i]; return [1, '']; }
  /** Dollarbetrag mit drei gueltigen Stellen: 1,56 Mrd. $, 203 Mio. $. */
  function money(v, unit) {
    if (typeof v !== 'number' || !isFinite(v)) return '–';
    var u = unit || moneyUnit(v), x = v / u[0], a = Math.abs(x);
    /* geschuetzte Leerzeichen: „5,31 Mrd. $“ bricht nicht um */
    return (v < 0 ? '−' : '') + deNum(Math.abs(x), a >= 100 ? 0 : a >= 10 ? 1 : 2) + (u[1] ? '\u00a0' + u[1] : '') + '\u00a0$';
  }
  /** Wert einer Trefferzeile: Dollar mit drei Stellen, sonst wie im Screener. */
  function value(id, v) { var f = Fields.field(id); return f && f.unit === 'usd' ? money(v) : Fields.format(id, v); }
  var GROUP_ICON = { size: 'grid', valuation: 'target', balance: 'check', growth: 'line', profitability: 'line', momentum: 'line', technical: 'line', company: 'list' };
  var OP_WORD = { lt: 'unter', lte: 'bis', gt: 'über', gte: 'ab' };
  /** Chip-Text einer Regel in Worten. */
  function chipText(filter, dict) {
    var f = Fields.field(filter.field);
    if (!f || f.kind === 'enum' || f.kind === 'bool' || f.tech) return Fields.describeFilter(filter, dict);
    if (filter.field === 'netCash' && filter.value === 0 && OP_WORD[filter.op]) return /^g/.test(filter.op) ? 'mehr Kasse als Schulden' : 'mehr Schulden als Kasse';
    var nm = name(filter.field);
    var plain = function (v) { return f.unit === 'usd' ? money(v) : f.unit === 'x' ? deNum(v, 1) : Fields.format(filter.field, v); };
    if (filter.op === 'between') {
      if (f.unit === 'usd') {
        var u = moneyUnit(Math.max(Math.abs(filter.value), Math.abs(filter.value2)));
        return nm + ' ' + money(filter.value, u).replace(/[\s\u00a0]+\S*[\s\u00a0]\$$/, '').replace(/[\s\u00a0]\$$/, '') + '–' + money(filter.value2, u);
      }
      return nm + ' ' + plain(filter.value) + '–' + plain(filter.value2);
    }
    return OP_WORD[filter.op] ? nm + ' ' + OP_WORD[filter.op] + ' ' + plain(filter.value) : Fields.describeFilter(filter, dict);
  }

  /* ---- Vorlesen (Owner 10.11.2026: Stimme klang schlecht). Aus der Bildschirmzeile wird gesprochene Sprache:
     „96,7 Mrd. $“ → „96,7 Milliarden Dollar“, „+58,9 %“ → „plus 58,9 Prozent“, „3,8 → 96,7“ → „3,8 bis 96,7“,
     „GJ 2026“ → „Geschäftsjahr 2026“. Danach in kurze Sätze geteilt (iOS bricht lange Äußerungen ab). */
  var SPOKEN = [
    [/(\d)\s*Bio\.?(?=[\s ]|$)/g, '$1 Billionen'], [/(\d)\s*Mrd\.?(?=[\s ]|$)/g, '$1 Milliarden'],
    [/(\d)\s*Mio\.?(?=[\s ]|$)/g, '$1 Millionen'], [/(\d)\s*Tsd\.?(?=[\s ]|$)/g, '$1 Tausend'],
    [/\bGJ\b\.?/g, 'Geschäftsjahr'], [/\bz\.\s?B\./g, 'zum Beispiel'], [/\bca\./g, 'etwa'], [/\bbzw\./g, 'beziehungsweise'],
    [/\bUS-/g, 'U S '], [/\bKGV\b/g, 'K G V'], [/\bSEC\b/g, 'S E C'], [/\bTTM\b/g, 'letzte zwölf Monate'],
    [/\s*→\s*/g, ' bis '], [/(\d)\s*[–-]\s*(\d)/g, '$1 bis $2'], [/≤/g, ' bis '], [/≥/g, ' ab '], [/</g, ' unter '], [/>/g, ' über '],
    [/[+]\s?(\d)/g, 'plus $1'], [/[−]\s?(\d)/g, 'minus $1'], [/(\d)\s*%/g, '$1 Prozent'], [/(\d)\s*\$/g, '$1 Dollar'], [/\$/g, 'Dollar'],
    [/\s*·\s*/g, ', '], [/[„“"»«]/g, ''], [/\s*×\s*/g, ' mal ']
  ];
  /** Text zum Vorlesen: ausgeschriebene Einheiten, kurze Sätze (höchstens maxSentences). */
  function speechText(text, maxSentences) {
    var t = String(text || '').replace(/ /g, ' ');
    SPOKEN.forEach(function (r) { t = t.replace(r[0], r[1]); });
    t = t.replace(/\s+/g, ' ').trim();
    if (!t) return [];
    /* Satzende nur vor Großbuchstaben, Ziffer oder Textende - Dezimalkommas und Kürzel bleiben ganz. */
    var parts = t.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])/).map(function (x) { return x.trim(); }).filter(Boolean);
    return parts.slice(0, maxSentences || 4);
  }
  /* Rangfolge der Systemstimmen (keine Zusatzkosten): neuronale/erweiterte zuerst, alte Kompaktstimmen zuletzt. */
  var VOICE_RANK = [/premium/i, /natural|neural/i, /erweitert|enhanced|verbessert/i, /^google deutsch/i, /online/i, /google/i, /siri/i,
    /\b(anna|petra|helena|marlene|katja|conrad|amala|seraphina|florian)\b/i];
  /** Beste deutsche Stimme aus speechSynthesis.getVoices() - oder null. */
  function pickVoice(voices) {
    var de = (voices || []).filter(function (v) { return v && /^de([-_]|$)/i.test(v.lang || ''); });
    function score(v) {
      var r = VOICE_RANK.length;
      for (var i = 0; i < VOICE_RANK.length; i++) if (VOICE_RANK[i].test(v.name || '')) { r = i; break; }
      if (/compact|eloquence|espeak/i.test(v.name || '')) r += 10;
      return r - (/^de[-_]DE/i.test(v.lang) ? 0.5 : 0) - (v.localService === false ? 0.2 : 0);
    }
    return de.length ? de.slice().sort(function (a, b) { return score(a) - score(b); })[0] : null;
  }

  function rules(result, dict) {
    var out = [];
    if (result && result.query) Query.filters(result.query).forEach(function (f) {
      var fld = Fields.field(f.field);
      out.push({ kind: 'filter', id: f.id, field: f.field, text: chipText(f, dict), icon: fld && GROUP_ICON[fld.group] || 'filter', source: fld ? fld.source : null });
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

  var API = { speechText: speechText, pickVoice: pickVoice, rules: rules, chipText: chipText, name: name, money: money, value: value, allOf: allOf, secTrack: secTrack, explain: explain, failure: failure, runScreen: runScreen, runStock: runStock, runChartbild: runChartbild, chartbildSentence: chartbildSentence, strategyIndex: strategyIndex, screenerUrl: screenerUrl,
    columnsFor: columnsFor, STRATEGY_LABELS: STRATEGY_LABELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.VUAskEngine = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
