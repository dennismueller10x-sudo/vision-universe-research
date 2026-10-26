/* Fundamental – mehrere Kennzahlen eines Unternehmens in einem gemeinsamen Verlauf (UMD, ohne Abhaengigkeiten ausser catalog.js).
 *
 * Rechnet nichts Neues: jede Reihe kommt unveraendert aus catalog.js#seriesOf (Geschaeftsjahre, eigenstaendige Quartale,
 * gepruefte Bewertung je Jahresbericht). Diese Datei legt nur fest, welche Reihen sich zeitlich zusammenfuehren lassen und
 * wie sie skaliert werden.
 *
 * Zeitachse:
 *  - Ein Diagramm hat genau eine Zeitraum-Art: Geschaeftsjahre ODER eigenstaendige Quartale. LTM wird nicht mit Jahren oder
 *    Quartalen gemischt (LTM steht nur im Kopf der Kennzahl).
 *  - Alle Reihen gehoeren zu demselben Unternehmen, also zu denselben Geschaeftsjahren; zusammengefuehrt wird ueber den
 *    Schluessel des Zeitraums (GJ bzw. GJ × 4 + Quartal). Fehlt ein Wert, bleibt der Zeitraum leer (keine Interpolation).
 *  - Bewertung (KGV, Boersenwert …) gibt es nur je Jahresbericht: Kurs = erster Wochenschluss NACH Einreichung des 10-K,
 *    Zahlen desselben Geschaeftsjahres (catalog.js#historicalValuation). Zum Kursdatum waren damit genau die Zahlen dieses
 *    Geschaeftsjahres veroeffentlicht – die Geschaeftszahlen desselben Schluessels sind zu diesem Zeitpunkt bekannt.
 *    Liegt ein Kursdatum nicht nach der Veroeffentlichung, wird der Wert verworfen (LOOKAHEAD), statt ihn zu zeigen.
 *    In Quartalsansichten gibt es keine Bewertung.
 *  - Berichtszeitraum (Ende des Geschaeftsjahres/Quartals) und Veroeffentlichung (10-K-Einreichung, Quelle des Werts)
 *    werden getrennt gefuehrt.
 *
 * Skalierung: Kennzahlen verschiedener Einheit teilen nie eine Achse. Eine Einheit = eine Achse; zwei Einheiten = linke
 * und rechte Achse; mehr Einheiten = Index (Basis 100) oder getrennte Diagramme mit gemeinsamer Zeitachse. */
(function (global) {
  'use strict';
  var C = typeof module !== 'undefined' && module.exports ? require('./catalog.js') : global.VUFundamental.Catalog;
  var VERSION = 'fundamental-compare-1.0.0';
  var MAX = 4; // Hauptkennzahl + drei weitere
  var MODES = ['axes', 'index', 'split'];
  var MODE_PARAM = { axes: 'achsen', index: 'index', split: 'getrennt' };
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /* Einheit einer Kennzahl: nur Kennzahlen derselben Einheit teilen eine Achse. Quoten und Wachstumsraten sind beide Prozent. */
  var UNIT_LABEL = { money: 'Betrag', perShare: 'je Aktie', shares: 'Aktien', pct: 'Prozent', multiple: 'Faktor' };
  function unitOf(def) {
    var k = def.kind === 'ratio' || def.kind === 'growth' ? 'pct' : def.kind;
    return { key: k, label: UNIT_LABEL[k] || k };
  }

  /* Warum eine Kennzahl im Vergleich fehlt (Anzeige mit Grund, nie still weggelassen). */
  var REASON = {
    NO_HISTORY: 'kein geprüfter historischer Verlauf',
    VALUATION_ANNUAL_ONLY: 'Bewertung nur nach Jahresberichten – nicht quartalsweise',
    ANNUAL_ONLY: 'nur jährlich gemeldet',
    LOADING: 'Kursreihe wird geladen …',
    TOO_FEW_VALUES: 'weniger als zwei Werte',
    INDEX_GROWTH: 'Wachstumsraten lassen sich nicht indexieren',
    INDEX_NO_BASE: 'kein positiver Wert im gemeinsamen Basisjahr',
    LOOKAHEAD: 'Kurs vor Veröffentlichung der Zahlen'
  };
  function reasonText(code) { return REASON[code] || C.reason(code); }

  /** Kann die Kennzahl in dieser Zeitraum-Art verglichen werden? {ok, reason, rows} */
  function availability(b, def, period) {
    if (!b || !def) return { ok: false, reason: 'NO_DATA', rows: [] };
    if (def.snap && !def.hist) return { ok: false, reason: 'NO_HISTORY', rows: [] };
    if (period === 'quarterly' && def.snap) return { ok: false, reason: 'VALUATION_ANNUAL_ONLY', rows: [] };
    if (period === 'quarterly' && !def.q) return { ok: false, reason: 'ANNUAL_ONLY', rows: [] };
    if (def.snap && !b.valuation) return { ok: false, reason: 'LOADING', rows: [] };
    var rows = guard(b, def, C.seriesOf(b, def, period));
    var n = rows.filter(function (r) { return isNum(r.v); }).length;
    if (n >= 2) return { ok: true, reason: null, rows: rows };
    if (def.snap) { var v = b.valuation; return { ok: false, reason: (v.reason && v.reason !== 'NO_VERIFIED_YEAR' ? v.reason : v.missing && v.missing[def.id]) || 'TOO_FEW_VALUES', rows: rows }; }
    return { ok: false, reason: n ? 'TOO_FEW_VALUES' : 'NO_DATA', rows: rows };
  }
  /* Look-ahead-Sperre fuer Bewertung: der Kurs muss NACH der Veroeffentlichung des Jahresberichts liegen. */
  function guard(b, def, rows) {
    if (!def.snap) return rows;
    return rows.map(function (r) {
      if (!isNum(r.v)) return r;
      var pub = r.pubDate || (b.published && b.published[r.key]) || null;
      if (r.priceDate && pub && r.priceDate > pub) return r;
      return Object.assign({}, r, { v: null, reason: 'LOOKAHEAD' });
    });
  }

  /** Reihen auf eine gemeinsame Zeitachse legen.
   * defs: Kennzahlen (die erste ist die Hauptkennzahl). n: letzte n Zeitraeume (0 = alle).
   * -> { period, points: [{key, label, short, end, published}], series: [{def, unit, ok, reason, rows: {key: row}}] } */
  function align(b, defs, period, n) {
    period = period === 'quarterly' ? 'quarterly' : 'annual';
    var keys = {}, series = defs.map(function (def) {
      var a = availability(b, def, period), byKey = {};
      if (a.ok) a.rows.forEach(function (r) { byKey[r.key] = r; keys[r.key] = keys[r.key] || r; });
      return { def: def, unit: unitOf(def), ok: a.ok, reason: a.reason, rows: byKey };
    });
    // Achse aus den Zeitraeumen mit mindestens einem Wert (Luecken innerhalb bleiben Luecken).
    var all = Object.keys(keys).map(Number).sort(function (x, y) { return x - y; });
    var used = all.filter(function (k) { return series.some(function (s) { return s.ok && s.rows[k] && isNum(s.rows[k].v); }); });
    if (used.length) all = all.filter(function (k) { return k >= used[0] && k <= used[used.length - 1]; });
    var lastMain = series[0] && series[0].ok ? all.filter(function (k) { return series[0].rows[k] && isNum(series[0].rows[k].v); }).pop() : undefined;
    // Zeitraum-Auswahl (3J/5J …) endet beim letzten Zeitraum der Achse.
    if (n > 0) all = all.slice(-n);
    var points = all.map(function (k) {
      var r = keys[k], end = null;
      series.forEach(function (s) { var x = s.rows[k]; if (!end && x && x.end && !s.def.snap) end = x.end; });
      return { key: k, label: r.label, short: r.short, end: end || r.end || null, published: period === 'annual' && b.published ? b.published[k] || null : null };
    });
    return { period: period, points: points, series: series, lastMain: lastMain };
  }

  /* Einheiten-Gruppen der vergleichbaren Reihen in Reihenfolge des ersten Auftretens (Hauptkennzahl zuerst = linke Achse). */
  function groups(model) {
    var out = [];
    model.series.forEach(function (s, i) {
      if (!s.ok) return;
      var g = out.filter(function (x) { return x.key === s.unit.key; })[0];
      if (!g) out.push(g = { key: s.unit.key, label: s.unit.label, members: [] });
      g.members.push(i);
    });
    return out;
  }

  /** Index (Basis 100): jede Reihe ÷ ihr Wert im gemeinsamen Basiszeitraum × 100. Basis = erster Zeitraum der Achse, in dem
   * alle indexierbaren Reihen einen positiven Wert haben. Wachstumsraten werden nicht indexiert (Veraenderung einer Veraenderung).
   * -> { base: key|null, vals: [{key: index}|null], excluded: {i: reason} } */
  function indexed(model) {
    var cand = [], excluded = {};
    model.series.forEach(function (s, i) {
      if (!s.ok) return;
      if (s.def.kind === 'growth') excluded[i] = 'INDEX_GROWTH'; else cand.push(i);
    });
    var base = null;
    for (var p = 0; p < model.points.length && base === null; p++) {
      var k = model.points[p].key;
      if (cand.length && cand.every(function (i) { var r = model.series[i].rows[k]; return r && r.v > 0; })) base = k;
    }
    var vals = model.series.map(function (s, i) {
      if (!s.ok || excluded[i] !== undefined) return null;
      if (base === null) { excluded[i] = 'INDEX_NO_BASE'; return null; }
      var b0 = s.rows[base].v, out = {};
      model.points.forEach(function (pt) { var r = s.rows[pt.key]; if (r && isNum(r.v)) out[pt.key] = r.v / b0 * 100; });
      return out;
    });
    return { base: base, vals: vals, excluded: excluded };
  }

  /** Welche Darstellungen sind fachlich zulaessig, und welche ist voreingestellt?
   * axes: hoechstens zwei Einheiten (eine Achse je Einheit). index: mindestens zwei indexierbare Reihen mit gemeinsamer Basis.
   * split: immer. Voreinstellung: axes, wenn moeglich; sonst index; sonst split. */
  function modes(model) {
    var g = groups(model), ix = indexed(model), nIdx = ix.vals.filter(Boolean).length;
    var ok = { axes: g.length >= 1 && g.length <= 2, index: nIdx >= 2, split: g.length >= 1 };
    var why = { axes: g.length > 2 ? 'Mehr als zwei Einheiten – eine gemeinsame Achse wäre irreführend.' : null, index: ok.index ? null : 'Für einen Index braucht es zwei Kennzahlen mit positivem Wert im selben Zeitraum (keine Wachstumsraten).', split: null };
    var def = ok.axes ? 'axes' : ok.index ? 'index' : 'split';
    return { ok: ok, why: why, preferred: def, groups: g, index: ix };
  }

  /** Auswahl aus der Adresse (&plus=a.b.c): gueltig, ohne Hauptkennzahl, ohne Doppelte, hoechstens MAX - 1. */
  function cleanSelection(main, ids) {
    var out = [];
    (ids || []).forEach(function (id) { if (C.BY_ID[id] && id !== main && out.indexOf(id) < 0 && out.length < MAX - 1) out.push(id); });
    return out;
  }
  function modeFromParam(v) { for (var k in MODE_PARAM) if (MODE_PARAM[k] === v) return k; return null; }

  var api = { VERSION: VERSION, MAX: MAX, MODES: MODES, MODE_PARAM: MODE_PARAM, unitOf: unitOf, availability: availability, align: align, groups: groups,
    indexed: indexed, modes: modes, cleanSelection: cleanSelection, modeFromParam: modeFromParam, reasonText: reasonText, REASON: REASON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.VUFundamental = global.VUFundamental || {};
  global.VUFundamental.Compare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
