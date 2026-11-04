/* =========================================================================
   VISION UNIVERSE — mein-dashboard/today.js
   „Deine Watchlist heute“ für Mein Bereich (/willkommen/ und /mein-dashboard/,
   Mockups E02 und E08): Tagesbewegung und Mini-Chart je Aktie.

   Eine Preiswahrheit (ADR-002): Kurs und Datum kommen aus der Watchlist-Übersicht
   (core/watchlist-view.js, veröffentlichter Schluss). Die Bewegung ist die Änderung
   des letzten zum vorletzten Punkt DERSELBEN Tagesreihe (quant/data/market/discover-series,
   splitbereinigt; daraus liest published-close.js den Schluss). Sie wird nur gezeigt,
   wenn der letzte Punkt der Reihe dasselbe Datum trägt wie der veröffentlichte Schluss –
   sonst steht „–“ und nichts wird geraten. Die Datei rechnet kein Modell und bildet kein Urteil.

   UMD: Browser globalThis.VUToday, Node module.exports (Tests).
   ========================================================================= */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VUToday = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var SERIES = '/quant/data/market/discover-series/';
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /** Adresse der Tagesreihe über die eine Identitätsregel (core/identity.js, ADR-001). */
  function seriesPath(Id, ticker) {
    try { var sid = Id.securityIdForTicker(ticker); return sid ? SERIES + sid + '.json' : null; } catch (e) { return null; }
  }

  /**
   * move(series, price) -> {pct, values} | {pct: null, values}
   * price: {close, date} aus der Watchlist-Übersicht. values: Schlüsse des letzten Jahres für den Mini-Chart.
   */
  function move(series, price) {
    var pts = (series && Array.isArray(series.points) ? series.points : []).filter(function (p) { return p && isNum(p[1]) && p[1] > 0; });
    var values = pts.map(function (p) { return p[1]; });
    if (pts.length < 2 || !price || !price.date) return { pct: null, values: values };
    var last = pts[pts.length - 1], prev = pts[pts.length - 2];
    if (String(last[0]).slice(0, 10) !== String(price.date).slice(0, 10)) return { pct: null, values: values };
    return { pct: (last[1] / prev[1] - 1) * 100, values: values };
  }

  /** Zusammenfassung: wie viele im Plus, größte Bewegung (nach Betrag). rows: [{ticker, pct}] */
  function summary(rows) {
    var withMove = (rows || []).filter(function (r) { return r && isNum(r.pct); });
    var up = withMove.filter(function (r) { return r.pct > 0; }).length;
    var big = withMove.slice().sort(function (a, b) { return Math.abs(b.pct) - Math.abs(a.pct); })[0] || null;
    return { total: (rows || []).length, measured: withMove.length, up: up, biggest: big };
  }

  /** Sortierung der Aktienzeilen: own (Reihenfolge der Liste), move (Bewegung heute, größte zuerst), name. */
  function sortRows(rows, key) {
    var list = (rows || []).slice();
    if (key === 'move') return list.sort(function (a, b) { return (isNum(b.pct) ? b.pct : -Infinity) - (isNum(a.pct) ? a.pct : -Infinity); });
    if (key === 'name') return list.sort(function (a, b) { return String(a.name || a.ticker || '').localeCompare(String(b.name || b.ticker || ''), 'de'); });
    return list;
  }

  /** Lädt Reihen für bis zu `max` Aktien parallel; Fehler einer Reihe lassen nur deren Bewegung leer. */
  function load(fetchJson, Id, views, max) {
    var shown = (views || []).slice(0, max || 12);
    return Promise.all(shown.map(function (v) {
      var path = v && v.ticker && v.price && v.price.state !== 'UNAVAILABLE' ? seriesPath(Id, v.ticker) : null;
      if (!path) return Promise.resolve({ pct: null, values: [] });
      return fetchJson(path).then(function (s) { return move(s, v.price); }, function () { return { pct: null, values: [] }; });
    }));
  }

  return Object.freeze({ seriesPath: seriesPath, move: move, summary: summary, sortRows: sortRows, load: load });
});
