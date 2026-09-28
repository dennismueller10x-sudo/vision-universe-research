/* =========================================================================
   VISION UNIVERSE SCREENER — ui/charts.js

   Kleine, abhaengigkeitsfreie SVG-Charts: Sparkline, Jahresbalken,
   Verteilung (Histogramm), Kurs mit gleitenden Durchschnitten und das
   Schema fuer technische Filter. Keine Berechnung von Kennzahlen hier -
   nur Zeichnen (SMA fuer die Kurslinie ausgenommen, sie ist Darstellung).
   ========================================================================= */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function svg(w, h, cls, label) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    s.setAttribute('preserveAspectRatio', 'none');
    if (cls) s.setAttribute('class', cls);
    if (label) { s.setAttribute('role', 'img'); s.setAttribute('aria-label', label); } else s.setAttribute('aria-hidden', 'true');
    return s;
  }
  function node(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function path(values, w, h, pad, lo, hi) {
    var n = values.length, d = '';
    for (var i = 0; i < n; i++) {
      var v = values[i];
      if (v === null || v === undefined) continue;
      var x = pad + (i / Math.max(1, n - 1)) * (w - pad * 2);
      var y = pad + (1 - (v - lo) / (hi - lo || 1)) * (h - pad * 2);
      d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return d;
  }
  function sma(values, n) {
    var out = new Array(values.length).fill(null), s = 0;
    for (var i = 0; i < values.length; i++) { s += values[i]; if (i >= n) s -= values[i - n]; if (i >= n - 1) out[i] = s / n; }
    return out;
  }

  /** Sparkline mit weicher Flaeche. Farbe nach Richtung des Zeitraums. */
  function sparkline(points, opts) {
    opts = opts || {};
    var w = 132, h = 44, s = svg(w, h, 'sc-spark', opts.label);
    if (!points || points.length < 2) return s;
    var v = points.map(function (p) { return p[1]; });
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    var up = v[v.length - 1] >= v[0], col = up ? 'var(--sc-up)' : 'var(--sc-down)';
    var id = 'g' + Math.random().toString(36).slice(2, 8);
    var defs = node('defs', {}, s), g = node('linearGradient', { id: id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    node('stop', { offset: '0', 'stop-color': up ? '#12864a' : '#cc3b30', 'stop-opacity': '.16' }, g);
    node('stop', { offset: '1', 'stop-color': up ? '#12864a' : '#cc3b30', 'stop-opacity': '0' }, g);
    var d = path(v, w, h, 2, lo, hi);
    node('path', { d: d + 'L' + (w - 2) + ' ' + h + 'L2 ' + h + 'Z', fill: 'url(#' + id + ')' }, s);
    node('path', { d: d, class: 'l', stroke: col, 'vector-effect': 'non-scaling-stroke' }, s);
    return s;
  }

  /** Jahresbalken fuer Quick Research (Umsatz, FCF, EPS, Marge). */
  function bars(series, opts) {
    opts = opts || {};
    var w = 150, h = 56, s = svg(w, h, 'sc-bars', opts.label);
    if (!series || !series.length) return s;
    var vals = series.map(function (p) { return p.v; });
    var hi = Math.max(0, Math.max.apply(null, vals)), lo = Math.min(0, Math.min.apply(null, vals)), span = hi - lo || 1;
    var n = series.length, bw = Math.min(22, (w - 8) / n - 6), gap = (w - n * bw) / (n + 1);
    var zero = 4 + (hi / span) * (h - 18);
    series.forEach(function (p, i) {
      var x = gap + i * (bw + gap), y = 4 + ((hi - Math.max(p.v, 0)) / span) * (h - 18);
      var bh = Math.max(1.5, Math.abs(p.v) / span * (h - 18));
      node('rect', { x: x.toFixed(1), y: (p.v >= 0 ? y : zero).toFixed(1), width: bw.toFixed(1), height: bh.toFixed(1), rx: 3, class: p.v < 0 ? 'is-neg' : '', opacity: i === n - 1 ? 1 : 0.55 }, s);
      var t = node('text', { x: (x + bw / 2).toFixed(1), y: h - 2, 'text-anchor': 'middle' }, s);
      t.textContent = String(p.fy).slice(-2) === String(p.fy) ? p.fy : "'" + String(p.fy).slice(-2);
    });
    s.removeAttribute('preserveAspectRatio');
    return s;
  }

  /**
   * Histogramm der Universumsverteilung. inRange(bin) markiert die Balken,
   * die das Kriterium erfuellen; markers sind Schwellen-Linien.
   */
  function histogram(h, opts) {
    opts = opts || {};
    var W = 340, H = 120, s = svg(W, H, 'sc-hist', opts.label);
    s.removeAttribute('preserveAspectRatio');
    if (!h || !h.bins.length) return s;
    var max = Math.max.apply(null, h.bins.map(function (b) { return b.count; })) || 1;
    var n = h.bins.length, bw = (W - 8) / n;
    var X = function (v) {
      var a = h.log ? Math.log10(h.lo) : h.lo, b = h.log ? Math.log10(h.hi) : h.hi, t = h.log ? Math.log10(Math.max(v, 1e-12)) : v;
      return 4 + Math.max(0, Math.min(1, (t - a) / (b - a))) * (W - 8);
    };
    h.bins.forEach(function (b, i) {
      var bh = Math.max(b.count ? 2 : 0, (b.count / max) * (H - 26));
      node('rect', { x: (4 + i * bw + 0.8).toFixed(1), y: (H - 18 - bh).toFixed(1), width: Math.max(1, bw - 1.6).toFixed(1), height: bh.toFixed(1), rx: 2, class: 'b' + (opts.inRange && opts.inRange(b) ? ' is-in' : '') }, s);
    });
    (opts.markers || []).forEach(function (m) { if (m !== null && isFinite(m)) node('line', { x1: X(m), x2: X(m), y1: 4, y2: H - 18, class: 't' }, s); });
    if (opts.fmt) {
      var l = node('text', { x: 4, y: H - 4 }, s); l.textContent = (h.below ? '≤ ' : '') + opts.fmt(h.lo);
      var r = node('text', { x: W - 4, y: H - 4, 'text-anchor': 'end' }, s); r.textContent = (h.above ? '≥ ' : '') + opts.fmt(h.hi);
      if (h.median !== null && h.median > h.lo && h.median < h.hi) { var m = node('text', { x: X(h.median), y: H - 4, 'text-anchor': 'middle' }, s); m.textContent = 'Median ' + opts.fmt(h.median); }
    }
    return s;
  }

  /** Kurs mit SMA50/SMA200 (aus derselben Tagesreihe gerechnet). */
  function priceChart(points, opts) {
    opts = opts || {};
    var W = 340, H = 170, s = svg(W, H, 'sc-pricechart', opts.label);
    if (!points || points.length < 20) return s;
    var closes = points.map(function (p) { return p[1]; });
    var s50 = sma(closes, 50), s200 = sma(closes, 200);
    var all = closes.concat(s50.filter(Boolean), s200.filter(Boolean));
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    for (var k = 1; k < 4; k++) node('line', { x1: 0, x2: W, y1: (H / 4) * k, y2: (H / 4) * k, stroke: 'var(--sc-line)', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, s);
    if (opts.showSma !== false) {
      node('path', { d: path(s200, W, H, 6, lo, hi), fill: 'none', stroke: 'var(--sc-warn)', 'stroke-width': 1.6, 'stroke-dasharray': '5 3', 'vector-effect': 'non-scaling-stroke' }, s);
      node('path', { d: path(s50, W, H, 6, lo, hi), fill: 'none', stroke: 'var(--sc-accent)', 'stroke-width': 1.4, 'vector-effect': 'non-scaling-stroke' }, s);
    }
    node('path', { d: path(closes, W, H, 6, lo, hi), fill: 'none', stroke: 'var(--sc-text)', 'stroke-width': 1.8, 'vector-effect': 'non-scaling-stroke' }, s);
    return { svg: s, last: closes[closes.length - 1], sma50: s50[s50.length - 1], sma200: s200[s200.length - 1] };
  }

  /** Schema fuer technische Filter (ohne echte Kurse, ausdruecklich beschriftet). */
  function techSchema(kind, above) {
    var W = 340, H = 110, s = svg(W, H, '', 'Schema: ' + (above ? 'Kurs über dem Durchschnitt' : 'Kurs unter dem Durchschnitt'));
    var base = [], line = [];
    for (var i = 0; i <= 60; i++) {
      var t = i / 60;
      base.push(55 - t * 18 + Math.sin(t * 3) * 3);
      var wave = Math.sin(t * 11) * 6 + Math.sin(t * 23) * 3;
      line.push(base[i] + (above ? -8 - t * 16 : 8 + t * 16) * (t > 0.4 ? 1 : t / 0.4 * 0.3) + wave);
    }
    var lo = 10, hi = 100;
    var inv = function (arr) { return arr.map(function (v) { return 110 - v; }); };
    node('path', { d: path(inv(base), W, H, 6, lo, hi), fill: 'none', stroke: 'var(--sc-warn)', 'stroke-width': 2, 'stroke-dasharray': '6 4' }, s);
    node('path', { d: path(inv(line), W, H, 6, lo, hi), fill: 'none', stroke: 'var(--sc-text)', 'stroke-width': 2 }, s);
    return s;
  }

  global.VUScreenerCharts = { sparkline: sparkline, bars: bars, histogram: histogram, priceChart: priceChart, techSchema: techSchema, sma: sma };
})(typeof window !== 'undefined' ? window : globalThis);
