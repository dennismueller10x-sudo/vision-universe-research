/* =========================================================================
   VISION UNIVERSE SCREENER — checklists.js (UMD, ohne Abhaengigkeiten)

   Drei Checklisten (Konzept „Fundamental + Screener: Verstehen. Finden.“,
   Entscheidung 4, Folie FX07): Qualitaet (8 Punkte), Wachstum (6), Bewertung (5).
   Jede Checkliste ist eine Screener-Vorlage auf vorhandenen Spalten des
   Screener-Universums (screener/data/universe-US_REAL.json); die Zaehlung
   laeuft im Browser, es gibt kein neues Daten-Artefakt.

   Wortwahl (docs/legal/WORTWAHL.md): eine Checkliste beschreibt, welche
   Bedingungen erfuellt sind – „N von M Punkten erfuellt“. Keine Gesamtnote,
   kein Urteil ueber den kuenftigen Kurs, keine Namen fremder Scores.
   Die Schwellen stehen offen in der Fundamental-Methodik.

   Je Punkt: field = Screener-Kriterium (screener/engine/fields.js),
   col = Spalte im Universum (dieselbe wie field.col, Test haelt das fest),
   op/value(/value2) = Regel wie im Screener (gt, gte, lt, lte, between),
   fmt = Darstellung des Werts (pct, pp, x, usd).
   ========================================================================= */
(function (global) {
  'use strict';
  var VERSION = 'checklists-1.0.0';

  var CHECKLISTS = [
    { id: 'qualitaet', name: 'Qualität', items: [
      { label: 'Umsatz wächst 3 Jahre je ≥ 10 %', field: 'revenueCagr3', col: 'revCagr3', op: 'gte', value: 0.10, fmt: 'pct', pa: true },
      { label: 'Nettomarge ≥ 10 %', field: 'netMargin', col: 'netMargin', op: 'gte', value: 0.10, fmt: 'pct' },
      { label: 'Free-Cashflow-Marge ≥ 10 %', field: 'fcfMargin', col: 'fcfMargin', op: 'gte', value: 0.10, fmt: 'pct' },
      { label: 'Kapitalrendite (ROIC) ≥ 15 %', field: 'roic', col: 'roic', op: 'gte', value: 0.15, fmt: 'pct' },
      { label: 'Mehr Kasse als Schulden', field: 'netCash', col: 'netCash', op: 'gt', value: 0, fmt: 'usd' },
      { label: 'Gewinn zu ≥ 80 % durch Zahlungsfluss gedeckt', field: 'cashConversion', col: 'cashConversion', op: 'gte', value: 0.8, fmt: 'share' },
      { label: 'Operative Marge in 3 Jahren gestiegen', field: 'marginExpansion', col: 'marginExp3y', op: 'gte', value: 0, fmt: 'pp' },
      { label: 'Gewinn je Aktie wächst 3 Jahre je ≥ 10 %', field: 'epsCagr3', col: 'epsCagr3', op: 'gte', value: 0.10, fmt: 'pct', pa: true }] },
    { id: 'wachstum', name: 'Wachstum', items: [
      { label: 'Umsatz zuletzt ≥ +15 %', field: 'revenueGrowth', col: 'revGrowth', op: 'gte', value: 0.15, fmt: 'pct' },
      { label: 'Umsatz 3 Jahre je ≥ 15 %', field: 'revenueCagr3', col: 'revCagr3', op: 'gte', value: 0.15, fmt: 'pct', pa: true },
      { label: 'Umsatz 10 Jahre je ≥ 10 %', field: 'revenueCagr10', col: 'revCagr10', op: 'gte', value: 0.10, fmt: 'pct', pa: true },
      { label: 'Gewinn je Aktie 3 Jahre je ≥ 15 %', field: 'epsCagr3', col: 'epsCagr3', op: 'gte', value: 0.15, fmt: 'pct', pa: true },
      { label: 'Free Cashflow wächst', field: 'fcfGrowth', col: 'fcfGrowth', op: 'gt', value: 0, fmt: 'pct' },
      { label: 'Operative Marge in 3 Jahren gestiegen', field: 'marginExpansion', col: 'marginExp3y', op: 'gte', value: 0, fmt: 'pp' }] },
    { id: 'bewertung', name: 'Bewertung', items: [
      { label: 'KGV ≤ 20', field: 'pe', col: 'pe', op: 'between', value: 0, value2: 20, fmt: 'x', positive: true },
      { label: 'KUV ≤ 3', field: 'ps', col: 'ps', op: 'lte', value: 3, fmt: 'x' },
      { label: 'Börsenwert / Free Cashflow ≤ 20', field: 'pFcf', col: 'pFcf', op: 'between', value: 0, value2: 20, fmt: 'x', positive: true },
      { label: 'PEG ≤ 1,5', field: 'peg', col: 'peg', op: 'between', value: 0, value2: 1.5, fmt: 'x', positive: true },
      { label: 'EV/EBITDA ≤ 12', field: 'evEbitda', col: 'evEbitda', op: 'between', value: 0, value2: 12, fmt: 'x', positive: true }] }
  ];

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  /* Ein Punkt: true erfuellt, false nicht erfuellt, null ohne Wert (zaehlt als nicht erfuellt, wie im Screener).
     „positive“: ein Vielfaches gilt nur bei positivem Wert (bei Verlust ist ein KGV nicht sinnvoll; 0 < x ≤ Grenze). */
  function test(item, v) {
    if (!isNum(v)) return null;
    switch (item.op) {
      case 'gt': return v > item.value;
      case 'gte': return v >= item.value;
      case 'lt': return v < item.value;
      case 'lte': return v <= item.value;
      case 'between': return item.positive ? v > item.value && v <= item.value2 : v >= item.value && v <= item.value2;
      default: return null;
    }
  }
  /** Auswertung einer Checkliste; get(col) liefert den Wert der Spalte fuer eine Aktie. */
  function evaluate(list, get) {
    var rows = list.items.map(function (it) { var v = get(it.col); return { item: it, value: isNum(v) ? v : null, pass: test(it, v) }; });
    var met = rows.filter(function (r) { return r.pass === true; }).length;
    return { id: list.id, name: list.name, rows: rows, met: met, of: rows.length, all: met === rows.length };
  }
  /** Screener-Filter der Checkliste (alle Punkte, UND). Grenzen exakt wie in test(): „positive“ = 0 < x ≤ Grenze. */
  function filters(list) {
    var out = [];
    list.items.forEach(function (it) {
      if (it.op === 'between' && it.positive) { out.push({ field: it.field, op: 'gt', value: it.value }); out.push({ field: it.field, op: 'lte', value: it.value2 }); }
      else out.push(it.op === 'between' ? { field: it.field, op: 'between', value: it.value, value2: it.value2 } : { field: it.field, op: it.op, value: it.value });
    });
    return out;
  }
  /** Adresse der Checkliste im Screener (Treffer). */
  function screenerHref(list) {
    return '/screener/?' + filters(list).map(function (f) { return 'f=' + f.field + ':' + f.op + ':' + f.value + (f.op === 'between' ? ':' + f.value2 : ''); }).join('&') + '&view=results';
  }
  function byId(id) { return CHECKLISTS.filter(function (c) { return c.id === id; })[0] || null; }
  /** Wert eines Punkts als Text (de-DE). */
  function formatValue(item, v) {
    if (!isNum(v)) return 'keine Angabe';
    var de = function (x, d) { return x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }); };
    var s = v < 0 ? '−' : '';
    if (item.fmt === 'pct') { var p = Math.abs(v) * 100; return (v > 0 && (item.pa || item.field === 'revenueGrowth' || item.field === 'fcfGrowth') ? '+' : s) + de(p, p >= 100 ? 0 : 1) + ' %' + (item.pa ? ' p. a.' : ''); }
    if (item.fmt === 'share') return de(v * 100, 0) + ' %';
    if (item.fmt === 'pp') return (v > 0 ? '+' : s) + de(Math.abs(v), 1) + ' Pp.';
    if (item.fmt === 'x') return s + de(Math.abs(v), Math.abs(v) >= 100 ? 0 : 1);
    if (item.fmt === 'usd') { var a = Math.abs(v), u = a >= 1e12 ? [1e12, ' Bio. $'] : a >= 1e9 ? [1e9, ' Mrd. $'] : [1e6, ' Mio. $']; return s + de(a / u[0], a / u[0] >= 100 ? 0 : 1) + u[1] + (item.field === 'netCash' ? ' netto' : ''); }
    return de(v, 2);
  }

  var api = { VERSION: VERSION, CHECKLISTS: CHECKLISTS, test: test, evaluate: evaluate, filters: filters, screenerHref: screenerHref, byId: byId, formatValue: formatValue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.VUChecklists = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
