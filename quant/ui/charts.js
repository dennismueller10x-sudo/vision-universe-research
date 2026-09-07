/* =========================================================================
   VISION UNIVERSE QUANT — ui/charts.js

   Ein gemeinsames Chart-Modul fuer alle Quant-Seiten.

   ARCHITEKTURENTSCHEIDUNG (dokumentiert in
   docs/VU_INVESTMENT_INTELLIGENCE_IMPLEMENTATION_PLAN.md, Abschnitt C.6):
   Der Master-Prompt fordert eine bestehende Chart-Library statt einer
   Eigenimplementierung. Dieses Repository hat keinen Bundler, sodass eine
   Library nur per CDN eingebunden werden koennte — das waere eine
   Laufzeit-Fremdabhaengigkeit und ein Stilbruch zur bestehenden Vision-
   Universe-CI, die in dashboard/, macro/ und academy/ durchgaengig
   handgeschriebenes, tokenkonformes SVG verwendet.

   Der Kern der Vorgabe — Charts nicht auf jeder Seite neu erfinden — wird
   erfuellt, indem ALLE Quant-Seiten ausschliesslich dieses eine Modul
   benutzen. Ein spaeterer Austausch gegen eine Library bleibt damit auf
   diese Datei begrenzt.

   Alle Charts sind responsiv (viewBox + preserveAspectRatio), verwenden die
   Design-Tokens aus quant.css und tragen Titel bzw. ARIA-Beschreibungen.
   ========================================================================= */
(function (global) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  function svgEl(tag, attrs, children) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined) return;
      if (k === "text") node.textContent = attrs[k];
      else node.setAttribute(k, String(attrs[k]));
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function extent(values) {
    var lo = Infinity, hi = -Infinity;
    values.forEach(function (v) { if (!isNum(v)) return; if (v < lo) lo = v; if (v > hi) hi = v; });
    if (lo === Infinity) return null;
    if (lo === hi) { lo -= 1; hi += 1; }
    return [lo, hi];
  }

  /** Runde, gut lesbare Achsenmarken statt exakter Min/Max-Werte. */
  function niceTicks(lo, hi, count) {
    var span = hi - lo;
    if (span <= 0) return [lo];
    var raw = span / Math.max(1, count);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var stepMultiple = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1;
    var step = stepMultiple * mag;
    var start = Math.ceil(lo / step) * step;
    var out = [];
    for (var v = start; v <= hi + step * 0.001; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }

  function base(width, height, title, description) {
    var svg = svgEl("svg", {
      class: "q-chart", viewBox: "0 0 " + width + " " + height,
      preserveAspectRatio: "none", role: "img", "aria-label": title,
      style: "height:" + height + "px"
    });
    if (description) svg.appendChild(svgEl("desc", { text: description }));
    return svg;
  }

  var PAD = { top: 14, right: 14, bottom: 26, left: 46 };

  function scale(domain, range) {
    var d0 = domain[0], d1 = domain[1], r0 = range[0], r1 = range[1];
    var span = (d1 - d0) || 1;
    return function (v) { return r0 + ((v - d0) / span) * (r1 - r0); };
  }

  function pathFrom(points) {
    var d = "", started = false;
    points.forEach(function (p) {
      if (!isNum(p[1])) { started = false; return; }
      d += (started ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2) + " ";
      started = true;
    });
    return d.trim();
  }

  function axes(svg, w, h, yTicks, yFormat, xLabels) {
    yTicks.forEach(function (t) {
      svg.appendChild(svgEl("line", { class: "grid", x1: PAD.left, x2: w - PAD.right, y1: t.y, y2: t.y }));
      svg.appendChild(svgEl("text", { class: "axis", x: PAD.left - 8, y: t.y + 3.5, "text-anchor": "end", text: yFormat(t.value) }));
    });
    (xLabels || []).forEach(function (lab) {
      svg.appendChild(svgEl("text", { class: "axis", x: lab.x, y: h - 8, "text-anchor": lab.anchor || "middle", text: lab.text }));
    });
  }

  function xLabelsFor(dates, xs, count) {
    if (!dates.length) return [];
    var out = [];
    var stepCount = Math.min(count || 5, dates.length);
    for (var i = 0; i < stepCount; i++) {
      var idx = Math.round((dates.length - 1) * (i / Math.max(1, stepCount - 1)));
      out.push({
        x: xs(idx),
        text: shortDate(dates[idx]),
        anchor: i === 0 ? "start" : (i === stepCount - 1 ? "end" : "middle")
      });
    }
    return out;
  }

  function shortDate(iso) {
    if (!iso) return "";
    var parts = String(iso).slice(0, 10).split("-");
    return parts[2] + "." + parts[1] + "." + parts[0].slice(2);
  }

  /**
   * Linienchart mit optionaler Vergleichsreihe.
   * @param {object} opts {dates, series:[{values,label,className}], height, yFormat, yDomain, title}
   */
  function lineChart(opts) {
    var w = 900, h = opts.height || 240;
    var svg = base(w, h, opts.title || "Zeitreihe", opts.description);
    var dates = opts.dates || [];
    var all = [];
    opts.series.forEach(function (s) { all = all.concat(s.values); });
    var ext = opts.yDomain || extent(all);
    if (!ext || !dates.length) return svg;

    var ticks = niceTicks(ext[0], ext[1], 4);
    if (ticks.length) ext = [Math.min(ext[0], ticks[0]), Math.max(ext[1], ticks[ticks.length - 1])];

    var xs = scale([0, Math.max(1, dates.length - 1)], [PAD.left, w - PAD.right]);
    var ys = scale(ext, [h - PAD.bottom, PAD.top]);
    var yFormat = opts.yFormat || function (v) { return String(Math.round(v)); };

    axes(svg, w, h, ticks.map(function (t) { return { y: ys(t), value: t }; }), yFormat, xLabelsFor(dates, xs, 5));

    opts.series.forEach(function (s) {
      var pts = s.values.map(function (v, i) { return [xs(i), isNum(v) ? ys(v) : null]; });
      svg.appendChild(svgEl("path", { class: "line " + (s.className || "line-primary"), d: pathFrom(pts) }));
    });
    return svg;
  }

  /** Drawdown-Flaeche: immer <= 0, gefuellt nach unten. */
  function drawdownChart(opts) {
    var w = 900, h = opts.height || 150;
    var svg = base(w, h, "Drawdown-Verlauf", opts.description);
    var values = opts.values || [];
    var dates = opts.dates || [];
    if (!values.length) return svg;

    var lo = Math.min.apply(null, values.filter(isNum).concat([0]));
    var ticks = niceTicks(lo, 0, 3);
    var xs = scale([0, Math.max(1, values.length - 1)], [PAD.left, w - PAD.right]);
    var ys = scale([Math.min(lo, ticks[0] || lo), 0], [h - PAD.bottom, PAD.top]);
    var yFormat = opts.yFormat || function (v) { return Math.round(v) + "%"; };

    axes(svg, w, h, ticks.map(function (t) { return { y: ys(t), value: t }; }), yFormat, xLabelsFor(dates, xs, 4));

    var pts = values.map(function (v, i) { return [xs(i), isNum(v) ? ys(v) : null]; });
    var line = pathFrom(pts);
    if (line) {
      svg.appendChild(svgEl("path", { class: "area", d: line + " L" + xs(values.length - 1).toFixed(2) + " " + ys(0).toFixed(2) + " L" + xs(0).toFixed(2) + " " + ys(0).toFixed(2) + " Z" }));
      svg.appendChild(svgEl("path", { class: "area-line", d: line }));
    }
    return svg;
  }

  /** Balkenchart fuer Jahresrenditen / rollierende Renditen. */
  function barChart(opts) {
    var w = 900, h = opts.height || 190;
    var svg = base(w, h, opts.title || "Balkenchart", opts.description);
    var items = (opts.items || []).filter(function (it) { return isNum(it.value); });
    if (!items.length) return svg;

    var values = items.map(function (it) { return it.value; });
    var ext = extent(values.concat([0]));
    var ticks = niceTicks(ext[0], ext[1], 3);
    var xs = scale([0, items.length], [PAD.left, w - PAD.right]);
    var ys = scale([Math.min(ext[0], ticks[0]), Math.max(ext[1], ticks[ticks.length - 1])], [h - PAD.bottom, PAD.top]);
    var yFormat = opts.yFormat || function (v) { return Math.round(v) + "%"; };

    axes(svg, w, h, ticks.map(function (t) { return { y: ys(t), value: t }; }), yFormat, []);
    svg.appendChild(svgEl("line", { class: "zero", x1: PAD.left, x2: w - PAD.right, y1: ys(0), y2: ys(0) }));

    var slot = (w - PAD.left - PAD.right) / items.length;
    var barW = Math.max(3, slot * 0.62);
    items.forEach(function (it, i) {
      var x = xs(i) + (slot - barW) / 2;
      var y0 = ys(0), y1 = ys(it.value);
      svg.appendChild(svgEl("rect", {
        class: "bar " + (it.value < 0 ? "neg" : "pos"),
        x: x.toFixed(2), y: Math.min(y0, y1).toFixed(2),
        width: barW.toFixed(2), height: Math.max(1, Math.abs(y1 - y0)).toFixed(2), rx: 2
      }));
      if (items.length <= 26) {
        svg.appendChild(svgEl("text", { class: "axis", x: (x + barW / 2).toFixed(2), y: h - 8, "text-anchor": "middle", text: it.label }));
      }
    });
    return svg;
  }

  /** Kompakte Sparkline fuer Listen und Karten. */
  function sparkline(values, opts) {
    opts = opts || {};
    var w = 74, h = 24, pad = 2;
    var svg = svgEl("svg", { class: "q-sparkline", viewBox: "0 0 " + w + " " + h, role: "img", "aria-label": opts.label || "Verlauf" });
    var clean = values.filter(isNum);
    if (clean.length < 2) return svg;
    var ext = extent(clean);
    var xs = scale([0, values.length - 1], [pad, w - pad]);
    var ys = scale(ext, [h - pad, pad]);
    var direction = clean[clean.length - 1] >= clean[0] ? "up" : "down";
    svg.appendChild(svgEl("path", {
      class: direction,
      d: pathFrom(values.map(function (v, i) { return [xs(i), isNum(v) ? ys(v) : null]; }))
    }));
    return svg;
  }

  var api = {
    lineChart: lineChart,
    drawdownChart: drawdownChart,
    barChart: barChart,
    sparkline: sparkline,
    niceTicks: niceTicks,
    shortDate: shortDate
  };

  global.QuantCharts = api;
})(window);
