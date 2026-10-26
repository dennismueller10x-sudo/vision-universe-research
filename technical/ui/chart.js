/* =========================================================================
   VISION UNIVERSE TECHNICAL — ui/chart.js
   CHART-STUDIO-RENDERER (SVG, rechnet nichts)

   Zeichnet nur, was die Engines geliefert haben: Kerzen oder Linie,
   Indikator-Overlays (Arrays je Bar), Zwei-Punkt-Linien (Trendlinien,
   Kanaele, Formationskanten), Zonen (Unterstuetzung/Widerstand, Range),
   horizontale Niveaus, Marker, Volumen und einen Indikatorbereich
   (RSI, MACD, Stochastik). Farben kommen aus CSS-Variablen (--tc-*),
   deshalb folgt der Chart Hell/Dunkel ohne eigenen Zustand.

   VUTechnicalChart.render(host, cfg) -> { redraw(cfg?), destroy() }
   ========================================================================= */
(function (global) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function node(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function fmt(v) {
    if (!isNum(v)) return "–";
    var d = Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 1 ? 2 : 4;
    return v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function fmtVol(v) { return !isNum(v) ? "–" : v >= 1e9 ? fmt(v / 1e9) + " Mrd." : v >= 1e6 ? fmt(v / 1e6) + " Mio." : Math.round(v).toLocaleString("de-DE"); }
  function niceStep(span, target) {
    var raw = span / Math.max(1, target), mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * mag;   // naechster Wert aus 1-2-5
  }
  function dateLabel(iso, withYear) { var m = MONTHS[Number(iso.slice(5, 7)) - 1]; return withYear ? m + " " + iso.slice(2, 4) : m; }

  function render(host, cfg) {
    var state = { cfg: cfg, hover: null };
    host.classList.add("tc-chart");
    host.innerHTML = "";
    var svg = node("svg", { role: "img", "aria-label": cfg.title || "Kurschart" }, host);
    var tip = document.createElement("div");
    tip.className = "tc-tip"; tip.hidden = true;
    host.appendChild(tip);

    function draw() {
      var c = state.cfg, W = Math.max(280, host.clientWidth || 600);
      var hasVol = c.volume && c.data.volume && c.data.volume.some(isNum);
      var paneH = c.pane ? 96 : 0, volH = hasVol ? 56 : 0, mainH = c.height || (W < 520 ? 260 : 340);
      var axisW = 52, padT = 10, gap = 10, xAxisH = 22;
      var H = padT + mainH + (volH ? gap + volH : 0) + (paneH ? gap + paneH : 0) + xAxisH;
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.setAttribute("width", W); svg.setAttribute("height", H);
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      var d = c.data, n = d.dates.length, from = Math.max(0, n - (c.window || n)), cnt = n - from;
      if (!cnt) return;
      var plotW = W - axisW - 4, step = plotW / cnt, bodyW = Math.max(1, Math.min(9, step * 0.62));
      function X(i) { return 4 + (i - from + 0.5) * step; }
      var idxOf = {};
      for (var q = 0; q < n; q++) idxOf[d.dates[q]] = q;
      function idxOfDate(t) {
        if (idxOf[t] !== undefined) return idxOf[t];
        for (var k = 0; k < n; k++) if (d.dates[k] >= t) return k;
        return n - 1;
      }

      /* Wertebereich: Kurs + sichtbare Overlays + Niveaus in Sichtweite */
      var lo = Infinity, hi = -Infinity, line = c.mode === "line";
      for (var i = from; i < n; i++) {
        var a = line ? d.close[i] : d.low[i], b = line ? d.close[i] : d.high[i];
        if (isNum(a)) lo = Math.min(lo, a); if (isNum(b)) hi = Math.max(hi, b);
      }
      var priceLo = lo, priceHi = hi;
      (c.overlays || []).forEach(function (o) { for (var k = from; k < n; k++) { var v = o.values[k]; if (isNum(v) && v > priceLo * 0.7 && v < priceHi * 1.3) { lo = Math.min(lo, v); hi = Math.max(hi, v); } } });
      (c.levels || []).concat(c.zones || []).forEach(function (l) {
        [l.price, l.low, l.high].forEach(function (v) { if (isNum(v) && v > priceLo * 0.85 && v < priceHi * 1.15) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
      });
      var pad = (hi - lo) * 0.06 || hi * 0.02 || 1; lo -= pad; hi += pad;
      var y0 = padT, y1 = padT + mainH;
      function Y(v) { return y1 - (v - lo) / (hi - lo) * mainH; }

      /* Raster + Preisachse */
      var grid = node("g", { class: "tc-grid" }, svg), ys = niceStep(hi - lo, mainH / 48);
      for (var gv = Math.ceil(lo / ys) * ys; gv <= hi; gv += ys) {
        node("line", { x1: 4, x2: 4 + plotW, y1: Y(gv), y2: Y(gv) }, grid);
        var t = node("text", { x: W - 4, y: Y(gv) + 4, "text-anchor": "end", class: "tc-axis" }, grid); t.textContent = fmt(gv);
      }
      /* Zeitachse: Monatswechsel, ausgeduennt */
      var lastM = null, labels = [], bottomY = H - 6;
      for (var m = from; m < n; m++) { var mk = d.dates[m].slice(0, 7); if (mk !== lastM) { if (lastM !== null) labels.push(m); lastM = mk; } }
      var every = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(plotW / 70))));
      labels.forEach(function (li, k) {
        if (k % every) return;
        node("line", { x1: X(li), x2: X(li), y1: y0, y2: H - xAxisH, class: "tc-vgrid" }, grid);
        var tt = node("text", { x: Math.max(18, Math.min(4 + plotW - 18, X(li))), y: bottomY, "text-anchor": "middle", class: "tc-axis" }, grid);
        tt.textContent = dateLabel(d.dates[li], d.dates[li].slice(5, 7) === "01" || k === 0);
      });

      var clip = "tc-clip-" + Math.random().toString(36).slice(2, 8);
      var defs = node("defs", {}, svg), cp = node("clipPath", { id: clip }, defs);
      node("rect", { x: 0, y: y0, width: 4 + plotW, height: mainH }, cp);
      var main = node("g", { "clip-path": "url(#" + clip + ")" }, svg);

      /* Zonen */
      (c.zones || []).forEach(function (z) {
        var xa = z.from ? X(Math.max(from, idxOfDate(z.from))) - step / 2 : 4, xb = z.to ? X(idxOfDate(z.to)) + step / 2 : 4 + plotW;
        if (xb < 4) return;
        node("rect", { x: Math.max(4, xa), y: Y(z.high), width: Math.max(1, xb - Math.max(4, xa)), height: Math.max(1, Y(z.low) - Y(z.high)), class: "tc-zone tc-" + (z.tone || "neutral") }, main);
        if (z.label) { var zl = node("text", { x: Math.max(8, xa + 4), y: Y(z.high) - 4, class: "tc-zone-label tc-" + (z.tone || "neutral") }, main); zl.textContent = z.label; }
      });

      /* Kurs */
      if (line) {
        var p = "";
        for (var li2 = from; li2 < n; li2++) if (isNum(d.close[li2])) p += (p ? "L" : "M") + X(li2).toFixed(1) + " " + Y(d.close[li2]).toFixed(1);
        node("path", { d: p, class: "tc-price-line" }, main);
      } else {
        var up = node("g", { class: "tc-up" }, main), dn = node("g", { class: "tc-down" }, main);
        for (var k2 = from; k2 < n; k2++) {
          if (!isNum(d.open[k2]) || !isNum(d.close[k2])) continue;
          var g = d.close[k2] >= d.open[k2] ? up : dn, x = X(k2);
          node("line", { x1: x, x2: x, y1: Y(d.high[k2]), y2: Y(d.low[k2]) }, g);
          var top = Y(Math.max(d.open[k2], d.close[k2])), bot = Y(Math.min(d.open[k2], d.close[k2]));
          node("rect", { x: x - bodyW / 2, y: top, width: bodyW, height: Math.max(1, bot - top) }, g);
        }
      }

      /* Overlays (Indikatorlinien) */
      (c.overlays || []).forEach(function (o) {
        var s = "", pen = false;
        for (var k = from; k < n; k++) {
          var v = o.values[k];
          if (!isNum(v)) { pen = false; continue; }
          s += (pen ? "L" : "M") + X(k).toFixed(1) + " " + Y(v).toFixed(1); pen = true;
        }
        node("path", { d: s, class: "tc-overlay", stroke: o.color, "stroke-dasharray": o.dash || null }, main);
      });

      /* Zwei-Punkt-Linien */
      (c.lines || []).forEach(function (l) {
        var ia = idxOfDate(l.from.time), ib = idxOfDate(l.to.time);
        if (ib < from) return;
        node("line", { x1: X(ia), y1: Y(l.from.price), x2: X(ib), y2: Y(l.to.price), class: "tc-line tc-" + (l.tone || "neutral"), "stroke-dasharray": l.dash || null }, main);
        /* Fortschreibung bis zum letzten Bar: dieselbe Gerade, nur bis heute (kein Blick in die Zukunft). */
        if (l.extend && ib > ia && ib < n - 1) {
          var slope = (l.to.price - l.from.price) / (ib - ia), pe = l.to.price + slope * (n - 1 - ib);
          if (isNum(pe) && pe > 0) node("line", { x1: X(ib), y1: Y(l.to.price), x2: X(n - 1), y2: Y(pe), class: "tc-line tc-proj tc-" + (l.tone || "neutral"), "stroke-dasharray": "3 4" }, main);
        }
      });

      /* Niveaus */
      (c.levels || []).forEach(function (l) {
        if (!isNum(l.price) || l.price < lo || l.price > hi) return;
        node("line", { x1: 4, x2: 4 + plotW, y1: Y(l.price), y2: Y(l.price), class: "tc-level tc-" + (l.tone || "neutral") }, svg);
        if (l.label) {
          var lt = node("text", { x: 4 + plotW - 4, y: Y(l.price) - 4, "text-anchor": "end", class: "tc-level-label tc-" + (l.tone || "neutral") }, svg);
          lt.textContent = l.label;
        }
      });

      /* Marker (Formationspunkte, Erkennung/Bestaetigung) */
      var placed = [];
      (c.markers || []).forEach(function (mk2) {
        var mi = idxOfDate(mk2.time);
        if (mi < from || !isNum(mk2.price)) return;
        if (mk2.shape === "cross") {
          var cr = mk2.size || 5, cx0 = X(mi), cy0 = Y(mk2.price);
          node("path", { d: "M" + (cx0 - cr) + " " + (cy0 - cr) + "L" + (cx0 + cr) + " " + (cy0 + cr) + "M" + (cx0 + cr) + " " + (cy0 - cr) + "L" + (cx0 - cr) + " " + (cy0 + cr), class: "tc-xmark tc-" + (mk2.tone || "neutral") }, main);
        } else node("circle", { cx: X(mi), cy: Y(mk2.price), r: mk2.size || 4, class: "tc-marker tc-" + (mk2.tone || "neutral") }, main);
        if (mk2.label) {
          var w = mk2.label.length * 6.6 + 14, bx = Math.min(Math.max(4, X(mi) - w / 2), 4 + plotW - w), by = Math.max(y0 + 2, Y(mk2.price) - 30);
          /* Beschriftungen duerfen sich nicht ueberdecken: nach oben ausweichen, sonst unter den Punkt. */
          for (var tries = 0; tries < 4 && placed.some(function (r) { return bx < r.x + r.w && r.x < bx + w && by < r.y + 22 && r.y < by + 22; }); tries++) by = by - 24 >= y0 + 2 ? by - 24 : Y(mk2.price) + 10 + tries * 24;
          placed.push({ x: bx, y: by, w: w });
          node("rect", { x: bx, y: by, width: w, height: 20, rx: 6, class: "tc-badge" + (mk2.badge ? " tc-badge-" + mk2.badge : "") }, svg);
          var bt = node("text", { x: bx + w / 2, y: by + 14, "text-anchor": "middle", class: "tc-badge-text" }, svg); bt.textContent = mk2.label;
        }
      });

      /* Volumen */
      var yv0 = y1 + gap;
      if (hasVol) {
        var vmax = 0;
        for (var v1 = from; v1 < n; v1++) if (isNum(d.volume[v1])) vmax = Math.max(vmax, d.volume[v1]);
        var vg = node("g", { class: "tc-vol" }, svg);
        for (var v2 = from; v2 < n; v2++) {
          if (!isNum(d.volume[v2]) || !vmax) continue;
          var hh = d.volume[v2] / vmax * volH;
          node("rect", { x: X(v2) - bodyW / 2, y: yv0 + volH - hh, width: bodyW, height: Math.max(0.5, hh), class: d.close[v2] >= d.open[v2] ? "tc-vol-up" : "tc-vol-down" }, vg);
        }
        var vl = node("text", { x: 8, y: yv0 + 10, class: "tc-axis" }, svg); vl.textContent = "Volumen";
      }

      /* Indikatorbereich */
      var yp0 = yv0 + (hasVol ? volH + gap : 0);
      if (c.pane) {
        var P = c.pane, pl = P.min, ph = P.max;
        if (!isNum(pl) || !isNum(ph)) {
          pl = Infinity; ph = -Infinity;
          P.series.forEach(function (s2) { for (var k = from; k < n; k++) { var v = s2.values[k]; if (isNum(v)) { pl = Math.min(pl, v); ph = Math.max(ph, v); } } });
          if (!isFinite(pl)) { pl = 0; ph = 1; }
          var pp = (ph - pl) * 0.1 || 1; pl -= pp; ph += pp;
          /* Balken wachsen von der Nulllinie: sie muss im Bereich liegen */
          if (P.series.some(function (s2) { return s2.bars; })) { pl = Math.min(pl, 0); ph = Math.max(ph, 0); }
        }
        var PY = function (v) { return yp0 + paneH - (v - pl) / (ph - pl) * paneH; };
        var pg = node("g", { class: "tc-pane" }, svg);
        node("rect", { x: 4, y: yp0, width: plotW, height: paneH, class: "tc-pane-bg" }, pg);
        (P.guides || []).forEach(function (gv2) {
          node("line", { x1: 4, x2: 4 + plotW, y1: PY(gv2), y2: PY(gv2), class: "tc-guide" }, pg);
          var gt = node("text", { x: W - 4, y: PY(gv2) + 4, "text-anchor": "end", class: "tc-axis" }, pg); gt.textContent = fmt(gv2);
        });
        P.series.forEach(function (s3) {
          if (s3.bars) {
            for (var k = from; k < n; k++) { var v = s3.values[k]; if (!isNum(v)) continue; var z0 = PY(0); node("rect", { x: X(k) - bodyW / 2, y: Math.min(z0, PY(v)), width: bodyW, height: Math.max(0.5, Math.abs(PY(v) - z0)), class: v >= 0 ? "tc-hist-up" : "tc-hist-down" }, pg); }
            return;
          }
          var s = "", pen = false;
          for (var k3 = from; k3 < n; k3++) { var v3 = s3.values[k3]; if (!isNum(v3)) { pen = false; continue; } s += (pen ? "L" : "M") + X(k3).toFixed(1) + " " + PY(v3).toFixed(1); pen = true; }
          node("path", { d: s, class: "tc-overlay", stroke: s3.color }, pg);
        });
        var pt = node("text", { x: 8, y: yp0 + 12, class: "tc-axis tc-pane-title" }, pg); pt.textContent = P.title || "";
      }

      /* Fadenkreuz */
      var cross = node("line", { y1: y0, y2: H - xAxisH, class: "tc-cross", visibility: "hidden" }, svg);
      var hit = node("rect", { x: 4, y: y0, width: plotW, height: H - xAxisH - y0, fill: "transparent" }, svg);
      function move(ev) {
        var r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) * (W / r.width);
        var i = Math.min(n - 1, Math.max(from, from + Math.floor((sx - 4) / step)));
        cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.setAttribute("visibility", "visible");
        var rows = ["<b>" + d.dates[i].split("-").reverse().join(".") + "</b>"];
        if (!line) rows.push("E " + fmt(d.open[i]) + " · H " + fmt(d.high[i]) + " · T " + fmt(d.low[i]) + " · S " + fmt(d.close[i]));
        else rows.push("Schluss " + fmt(d.close[i]));
        (c.overlays || []).forEach(function (o) { if (isNum(o.values[i])) rows.push('<i style="background:' + o.color + '"></i>' + o.label + " " + fmt(o.values[i])); });
        if (hasVol && isNum(d.volume[i])) rows.push("Volumen " + fmtVol(d.volume[i]));
        if (c.pane) c.pane.series.forEach(function (s4) { if (isNum(s4.values[i])) rows.push(s4.label + " " + fmt(s4.values[i])); });
        tip.innerHTML = rows.join("<br>");
        tip.hidden = false;
        var left = (X(i) / W) * r.width;
        tip.style.left = Math.min(Math.max(0, left + 12), r.width - 190) + "px";
        tip.style.top = "8px";
      }
      function leave() { cross.setAttribute("visibility", "hidden"); tip.hidden = true; }
      hit.addEventListener("pointermove", move);
      hit.addEventListener("pointerdown", move);
      hit.addEventListener("pointerleave", leave);
    }

    draw();
    var ro = typeof ResizeObserver === "function" ? new ResizeObserver(function () { draw(); }) : null;
    if (ro) ro.observe(host);
    function onTheme() { draw(); }
    document.addEventListener("vu-theme-change", onTheme);
    return {
      redraw: function (next) { if (next) state.cfg = next; draw(); },
      destroy: function () { if (ro) ro.disconnect(); document.removeEventListener("vu-theme-change", onTheme); host.innerHTML = ""; }
    };
  }

  /** Mini-Sparkline (Werte 0..99) als SVG-String; fuer Trefferlisten. */
  function sparkline(values, opts) {
    opts = opts || {};
    var w = opts.width || 120, h = opts.height || 32, n = values.length;
    if (n < 2) return "";
    var pts = values.map(function (v, i) { return (i * (w - 2) / (n - 1) + 1).toFixed(1) + "," + (h - 2 - v / 99 * (h - 4)).toFixed(1); }).join(" ");
    var upDay = values[n - 1] >= values[0];
    return '<svg class="tc-spark ' + (upDay ? "is-up" : "is-down") + '" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><polyline points="' + pts + '"/></svg>';
  }

  global.VUTechnicalChart = { render: render, sparkline: sparkline, fmt: fmt, fmtVol: fmtVol };
})(typeof window !== "undefined" ? window : globalThis);
