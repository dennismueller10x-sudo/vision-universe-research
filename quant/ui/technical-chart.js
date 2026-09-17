/* =========================================================================
   VISION UNIVERSE QUANT — ui/technical-chart.js

   Technical-Intelligence-Chart. Erweitert das gemeinsame Chart-Modul
   (QuantCharts) um einen Kerzen-/Linien-Chart mit Volumen und einer
   Annotations-Schicht. Der Renderer INTERPRETIERT ausschliesslich
   ChartAnnotation-Objekte (engines/technical/annotations.js) — er
   berechnet nichts, er kennt weder Pivots noch Wellen.

   Visuelle Zustaende (§37): Historie durchgezogen, Developing eigener
   Stil, Projektion gestrichelt/transparent, Now-Divider trennt beides.
   Alles rechts des Dividers ist Zukunft und sieht nie wie Historie aus.

   Handgeschriebenes, tokenkonformes SVG wie der Rest der Quant-UI; keine
   externe Chart-Library (siehe charts.js, Architekturentscheidung).
   ========================================================================= */
(function (global) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var QC = global.QuantCharts;

  function svgEl(tag, attrs, children) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined) return;
      if (k === "text") node.textContent = attrs[k]; else node.setAttribute(k, String(attrs[k]));
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }
  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  var RANGES = { "1D": 2, "5D": 6, "1M": 22, "3M": 64, "6M": 128, "YTD": null, "1Y": 253, "5Y": 1262, "MAX": Infinity };

  /** Sichtbare Bar-Indizes fuer eine Range. */
  function visibleRange(bars, range) {
    var n = bars.timestamps.length;
    if (range === "YTD") {
      var year = bars.timestamps[n - 1].slice(0, 4);
      var start = 0; for (var i = n - 1; i >= 0; i--) { if (bars.timestamps[i].slice(0, 4) !== year) { start = i + 1; break; } }
      return [start, n - 1];
    }
    var count = RANGES[range] || RANGES["5Y"];
    return [Math.max(0, n - count), n - 1];
  }

  /** Zeit → Bar-Position (Bruchteile erlaubt), Zukunft ueber Kalender-Fortschreibung. */
  function timeScaleFactory(bars, from, to, futureBars) {
    var stamps = bars.timestamps;
    var index = Object.create(null);
    stamps.forEach(function (t, i) { index[t] = i; });
    var last = stamps[stamps.length - 1];
    function weekdaysAfter(iso) {
      var d = new Date(last + "T00:00:00Z"), target = new Date(iso + "T00:00:00Z"), n = 0;
      while (d < target) { d = new Date(d.getTime() + 86400000); var wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) n++; }
      return n;
    }
    return function (iso) {
      if (!iso) return null;
      var key = iso.slice(0, 10);
      if (index[key] !== undefined) return index[key];
      if (key > last) return stamps.length - 1 + Math.min(futureBars, weekdaysAfter(key));
      /* Vor dem Fenster oder Luecke: naechster bekannter Tag. */
      var lo = 0, hi = stamps.length - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (stamps[mid] < key) lo = mid + 1; else hi = mid; }
      return lo;
    };
  }

  /**
   * Zeichnet den Technical Chart.
   * @param {object} opts {
   *   bars {timestamps,open,high,low,close,volume}, range "5Y", mode "candles"|"line",
   *   annotations [ChartAnnotation], series {sma50:[…]} (index-aligned zu bars),
   *   height, futureBars, showVolume, precision (Nachkommastellen), currency
   * }
   */
  function technicalChart(opts) {
    var bars = opts.bars, range = opts.range || "5Y", mode = opts.mode || (RANGES[range] > 300 ? "line" : "candles");
    var w = Number.isFinite(opts.width) && opts.width >= 300 ? opts.width : 1000, h = opts.height || 460, volH = opts.showVolume === false ? 0 : 60;
    var PAD = { top: 16, right: 64, bottom: 24 + volH, left: 12 };
    var vis = visibleRange(bars, range);
    var futureBars = opts.futureBars === undefined ? Math.max(8, Math.round((vis[1] - vis[0]) * 0.18)) : opts.futureBars;
    var n = bars.timestamps.length;
    var i0 = vis[0], i1 = vis[1];
    var svg = svgEl("svg", { class: "q-chart q-tchart", viewBox: "0 0 " + w + " " + h, preserveAspectRatio: "none", role: "img", "aria-label": opts.title || "Technical Chart", style: "height:" + h + "px" });
    if (opts.description) svg.appendChild(svgEl("desc", { text: opts.description }));
    if (i1 <= i0) return svg;

    /* Preisbereich: sichtbare Bars + Annotationen im Fenster. */
    var lo = Infinity, hi = -Infinity;
    for (var i = i0; i <= i1; i++) { if (bars.low[i] < lo) lo = bars.low[i]; if (bars.high[i] > hi) hi = bars.high[i]; }
    (opts.annotations || []).forEach(function (a) {
      if (a.type === "SERIES" || a.type === "NOW_DIVIDER" || a.type === "STATE_LABEL") return;
      [a.startPrice, a.endPrice].forEach(function (p) { if (isNum(p)) { if (p < lo) lo = p; if (p > hi) hi = p; } });
    });
    /* Ausreisser-Annotationen (weit entfernte Zonen) begrenzen die Skala nicht unbegrenzt. */
    var barLo = Infinity, barHi = -Infinity;
    for (var q = i0; q <= i1; q++) { if (bars.low[q] < barLo) barLo = bars.low[q]; if (bars.high[q] > barHi) barHi = bars.high[q]; }
    var span = barHi - barLo;
    lo = Math.max(lo, barLo - span * 0.6); hi = Math.min(hi, barHi + span * 0.6);
    var pad = (hi - lo) * 0.04; lo -= pad; hi += pad;

    var xs = function (pos) { return PAD.left + ((pos - i0) / (i1 - i0 + futureBars)) * (w - PAD.left - PAD.right); };
    var ys = function (p) { return PAD.top + (1 - (p - lo) / (hi - lo)) * (h - PAD.top - PAD.bottom); };
    var timeScale = timeScaleFactory(bars, i0, i1, futureBars);
    var prec = isNum(opts.precision) ? opts.precision : (hi > 500 ? 0 : hi > 20 ? 1 : 2);
    var fmt = function (v) { return v.toLocaleString("de-DE", { minimumFractionDigits: prec, maximumFractionDigits: prec }); };

    /* Grid + Achsen */
    var ticks = QC.niceTicks(lo, hi, 6);
    ticks.forEach(function (t) {
      if (t < lo || t > hi) return;
      svg.appendChild(svgEl("line", { class: "grid", x1: PAD.left, x2: w - PAD.right, y1: ys(t), y2: ys(t) }));
      svg.appendChild(svgEl("text", { class: "axis", x: w - PAD.right + 6, y: ys(t) + 3.5, "text-anchor": "start", text: fmt(t) }));
    });
    var labelCount = w < 500 ? 3 : 6;
    for (var k = 0; k < labelCount; k++) {
      var idx = Math.round(i0 + (i1 - i0) * (k / (labelCount - 1)));
      svg.appendChild(svgEl("text", { class: "axis", x: xs(idx), y: h - 8, "text-anchor": k === 0 ? "start" : k === labelCount - 1 ? "end" : "middle", text: QC.shortDate(bars.timestamps[idx]) }));
    }
    /* Zukunftsbereich */
    svg.appendChild(svgEl("rect", { class: "future-area", x: xs(i1), y: PAD.top, width: Math.max(0, xs(i1 + futureBars) - xs(i1)), height: h - PAD.top - PAD.bottom }));

    /* Volumen */
    if (volH) {
      var vmax = 0; for (var v = i0; v <= i1; v++) if (isNum(bars.volume[v]) && bars.volume[v] > vmax) vmax = bars.volume[v];
      var slot = (xs(i1) - xs(i0)) / Math.max(1, i1 - i0);
      var vbase = h - PAD.bottom + volH - 2;
      if (vmax > 0) for (var b = i0; b <= i1; b++) {
        if (!isNum(bars.volume[b])) continue;
        var vh = (bars.volume[b] / vmax) * (volH - 8);
        svg.appendChild(svgEl("rect", { class: "vol " + (bars.close[b] >= bars.open[b] ? "up" : "down"), x: xs(b) - slot * 0.4, y: vbase - vh, width: Math.max(0.6, slot * 0.8), height: vh }));
      }
    }

    /* Annotationen — Zonen und Serien unter dem Kurs, Linien/Labels darueber. */
    var anns = (opts.annotations || []).slice().sort(function (a, b) { return a.zOrder - b.zOrder; });
    /* Zeichenbereich clippen: nichts ragt in Achsen oder Volumen. */
    var clipId = "tclip-" + Math.random().toString(36).slice(2, 8);
    svg.appendChild(svgEl("clipPath", { id: clipId }, [svgEl("rect", { x: PAD.left, y: PAD.top, width: w - PAD.left - PAD.right, height: h - PAD.top - PAD.bottom })]));
    var under = svgEl("g", { class: "ann-under", "clip-path": "url(#" + clipId + ")" }), over = svgEl("g", { class: "ann-over", "clip-path": "url(#" + clipId + ")" }), labels = svgEl("g", { class: "ann-labels" });
    svg.appendChild(under);

    /* Kurs */
    var priceG = svgEl("g", { class: "price" });
    if (mode === "line") {
      var d = "";
      for (var c = i0; c <= i1; c++) d += (c === i0 ? "M" : "L") + xs(c).toFixed(2) + " " + ys(bars.close[c]).toFixed(2) + " ";
      priceG.appendChild(svgEl("path", { class: "line line-price", d: d.trim() }));
    } else {
      var cw = Math.max(1, ((xs(i1) - xs(i0)) / Math.max(1, i1 - i0)) * 0.7);
      for (var m = i0; m <= i1; m++) {
        var up = bars.close[m] >= bars.open[m];
        priceG.appendChild(svgEl("line", { class: "wick " + (up ? "up" : "down"), x1: xs(m), x2: xs(m), y1: ys(bars.high[m]), y2: ys(bars.low[m]) }));
        priceG.appendChild(svgEl("rect", { class: "candle " + (up ? "up" : "down"), x: xs(m) - cw / 2, y: ys(Math.max(bars.open[m], bars.close[m])), width: cw, height: Math.max(0.8, Math.abs(ys(bars.open[m]) - ys(bars.close[m]))) }));
      }
    }
    svg.appendChild(priceG);
    svg.appendChild(over); svg.appendChild(labels);

    var placed = [];   // Kollisionsvermeidung fuer Labels
    function placeLabel(x, y, text, cls, anchor) {
      if (opts.annotationLabels === false) return;
      /* Labels bleiben im Zeichenbereich: nie ueber dem oberen Rand, nie im Volumen. */
      var yy = Math.min(h - PAD.bottom - 4, Math.max(PAD.top + 10, y));
      for (var tries = 0; tries < 6; tries++) {
        var clash = placed.some(function (p) { return Math.abs(p.x - x) < 30 && Math.abs(p.y - yy) < 12; });
        if (!clash) break;
        yy += (tries % 2 ? 1 : -1) * 12 * (tries + 1);
        yy = Math.min(h - PAD.bottom - 4, Math.max(PAD.top + 10, yy));
      }
      placed.push({ x: x, y: yy });
      labels.appendChild(svgEl("text", { class: "ann-label " + cls, x: x, y: yy, "text-anchor": anchor || "middle", text: text }));
    }
    function styleClass(a) { return "st-" + a.status.toLowerCase() + " sem-" + String(a.semanticStyle || "neutral").replace(/\s+/g, " sem-"); }

    anns.forEach(function (a) {
      var cls = styleClass(a) + " t-" + a.type.toLowerCase();
      var xa = timeScale(a.startTime), xb = timeScale(a.endTime);
      switch (a.type) {
        case "SERIES": {
          var col = opts.series && opts.series[a.meta && a.meta.seriesRef];
          if (!col) return;
          var dd = "", started = false;
          for (var s = i0; s <= i1; s++) { var val = col[s]; if (!isNum(val)) { started = false; continue; } dd += (started ? "L" : "M") + xs(s).toFixed(2) + " " + ys(val).toFixed(2) + " "; started = true; }
          under.appendChild(svgEl("path", { class: "ann-series " + cls, d: dd.trim() }));
          return;
        }
        case "ZONE": case "ENTRY_ZONE": case "TARGET_ZONE": case "PROJECTION_ZONE": case "FIB_CLUSTER": {
          if (!isNum(a.startPrice) || !isNum(a.endPrice)) return;
          var x1 = Math.max(xs(i0), xs(xa === null ? i0 : xa)), x2 = xs(xb === null ? i1 + futureBars : xb);
          if (x2 <= x1) return;
          var yTop = ys(Math.max(a.startPrice, a.endPrice)), yBot = ys(Math.min(a.startPrice, a.endPrice));
          if (yBot < PAD.top || yTop > h - PAD.bottom) return;
          under.appendChild(svgEl("rect", { class: "ann-zone " + cls, x: x1, y: Math.max(PAD.top, yTop), width: x2 - x1, height: Math.max(1.5, Math.min(h - PAD.bottom, yBot) - Math.max(PAD.top, yTop)) }));
          if (a.label && (a.type !== "ZONE" || a.layers.indexOf("AUTO") !== -1)) placeLabel(Math.min(x2 - 4, w - PAD.right - 4), Math.min(h - PAD.bottom - 4, Math.max(PAD.top + 10, yTop + 11)), a.label, cls, "end");
          return;
        }
        case "LEVEL": case "FIB_LEVEL": case "INVALIDATION_LEVEL": {
          if (!isNum(a.startPrice)) return;
          var y = ys(a.startPrice); if (y < PAD.top || y > h - PAD.bottom) return;
          var lx1 = Math.max(xs(i0), xs(xa === null ? i0 : xa)), lx2 = xs(xb === null ? i1 + futureBars : xb);
          over.appendChild(svgEl("line", { class: "ann-level " + cls, x1: lx1, x2: lx2, y1: y, y2: y }));
          if (a.label) placeLabel(lx2 - 4, y - 3, a.label, cls, "end");
          return;
        }
        case "SWING_SEGMENT": case "WAVE_SEGMENT": case "PROJECTION_PATH": case "STRUCTURE_EVENT": case "FIB_ANCHOR": {
          if (xa === null || xb === null || !isNum(a.startPrice) || !isNum(a.endPrice)) return;
          if (xb < i0) return;
          /* AUDIT-FIX: beginnt das Segment vor dem Fenster, wird der Startpreis
             am Fensterrand interpoliert — sonst stimmt die Steigung nicht. */
          var sx = xa, sp = a.startPrice;
          if (xa < i0 && xb > xa) { sp = a.startPrice + (a.endPrice - a.startPrice) * ((i0 - xa) / (xb - xa)); sx = i0; }
          over.appendChild(svgEl("line", { class: "ann-seg " + cls, x1: xs(sx), y1: ys(sp), x2: xs(xb), y2: ys(a.endPrice) }));
          if (a.type === "STRUCTURE_EVENT" && a.label && a.layers.indexOf("STRUCTURE") !== -1) placeLabel(xs(xb), ys(a.endPrice) - 4, a.label, cls, "end");
          return;
        }
        case "PIVOT": {
          if (xa === null || xa < i0 || !isNum(a.startPrice)) return;
          over.appendChild(svgEl("circle", { class: "ann-pivot " + cls, cx: xs(xa), cy: ys(a.startPrice), r: a.status === "DEVELOPING" ? 4 : 3 }));
          if (a.label) placeLabel(xs(xa), ys(a.startPrice) - 7, a.label, cls);
          return;
        }
        case "STRUCTURE_LABEL": case "WAVE_LABEL": {
          if (xa === null || xa < i0 || !isNum(a.startPrice)) return;
          var isHigh = a.semanticStyle === "label-high" || (a.meta && a.meta.side === "HIGH");
          var ly = a.type === "WAVE_LABEL" ? ys(a.startPrice) + (a.startPrice >= (bars.close[Math.min(i1, Math.round(xa))] || 0) ? -8 : 14) : (isHigh ? ys(a.startPrice) - 6 : ys(a.startPrice) + 13);
          placeLabel(xs(xa), ly, a.label, cls);
          return;
        }
        case "NOW_DIVIDER": {
          over.appendChild(svgEl("line", { class: "ann-now", x1: xs(i1), x2: xs(i1), y1: PAD.top, y2: h - PAD.bottom + volH }));
          labels.appendChild(svgEl("text", { class: "ann-label ann-now-label", x: xs(i1) + 4, y: PAD.top + 10, "text-anchor": "start", text: "Now" }));
          labels.appendChild(svgEl("text", { class: "ann-label ann-now-label", x: xs(i1) + 4, y: PAD.top + 22, "text-anchor": "start", text: "Projektion →" }));
          return;
        }
        default: return;
      }
    });

    /* Letzter Kurs */
    var lastY = ys(bars.close[i1]);
    over.appendChild(svgEl("line", { class: "last-price", x1: xs(i1), x2: w - PAD.right, y1: lastY, y2: lastY }));
    svg.appendChild(svgEl("text", { class: "axis last-price-label", x: w - PAD.right + 6, y: lastY + 3.5, "text-anchor": "start", text: fmt(bars.close[i1]) }));
    return svg;
  }

  QC.technicalChart = technicalChart;
  QC.TECHNICAL_RANGES = Object.keys(RANGES);
  QC.visibleRange = visibleRange;
})(window);
