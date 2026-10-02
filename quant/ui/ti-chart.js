/* =========================================================================
   VISION UNIVERSE QUANT — ui/ti-chart.js
   SZENARIO-CHART fuer das Chartbild

   Ein Chart, der zuerst Ergebnis zeigt, nicht Methode:
     • Kursverlauf (Kerzen; reine Schlusskurs-Reihen als Linie)
     • Einstiegszone (Band), Zielzonen (Baender), Ungueltig-Linie
     • Risikobereich zwischen Einstiegszone und Ungueltig-Linie
     • Szenario-Raum rechts von "Heute": stilisierter Pfad mit Korridor —
       ausdruecklich KEINE Zeitprognose (die x-Achse hat dort keine Daten)
     • optional Wellenmarken (Einsteiger: Ziffern/Buchstaben; Profi:
       Notation des Grades)
   SVG statt Canvas: 300–500 Kerzen sind fuer SVG leicht, die Grafik bleibt
   scharf, druckbar und fuer Screenreader beschreibbar (title/desc).
   Farbe ist nie die einzige Information: jede Zone traegt ein Textlabel,
   die Ungueltig-Linie ist gestrichelt.
   ========================================================================= */
(function (global) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs, kids) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, String(attrs[k])); });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function fmt(v) { if (!isNum(v)) return "–"; var d = v < 10 ? 2 : v < 100 ? 1 : 0; return v.toLocaleString("de-DE", { minimumFractionDigits: v < 10 ? d : 0, maximumFractionDigits: d }); }
  function monthLabel(iso, withYear) { var m = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"][+iso.slice(5, 7) - 1]; return withYear ? m + " " + iso.slice(2, 4) : m; }

  /**
   * @param {object} o {
   *   chart: { timestamps, open?, high?, low?, close, closeOnly },
   *   scenario: Szenario-Objekt (Zonen), alt?: Szenario fuer die Alternative (gedimmt),
   *   waves?: [{ label, toTime, toPrice, status }], width, height, bars, mode: "candles"|"line",
   *   currency, title, labels: bool
   * }
   */
  function render(o) {
    var W = Math.max(300, o.width || 720), H = Math.max(240, o.height || 380);
    var c = o.chart, n = c.timestamps.length, nb = Math.min(n, o.bars || n), from = n - nb;
    var ts = c.timestamps.slice(from), cl = c.close.slice(from);
    var hi = (c.high || c.close).slice(from), lo = (c.low || c.close).slice(from), op = (c.open || c.close).slice(from);
    var line = o.mode === "line" || c.closeOnly;
    var padL = 6, padR = W < 520 ? 52 : 64, padT = 14, padB = 24;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var projShare = W < 520 ? 0.3 : 0.24;
    var histW = plotW * (1 - projShare), x0 = padL, xNow = padL + histW, xEnd = padL + plotW;
    var s = o.scenario, alt = o.alt;
    // ---------------------------------------------------------------- y-Domain
    var vals = [];
    for (var i = 0; i < nb; i++) { vals.push(hi[i], lo[i]); }
    var dataMin = Math.min.apply(null, vals), dataMax = Math.max.apply(null, vals), span = dataMax - dataMin;
    var extra = [];
    function addZone(z) { if (z && isNum(z.zoneLow)) extra.push(z.zoneLow, z.zoneHigh); }
    if (s) { addZone(s.entryZone); (s.targets || []).slice(0, 2).forEach(addZone); if (s.invalidation) extra.push(s.invalidation.price); if (s.range) { addZone(s.range.support); addZone(s.range.resistance); } }
    var offChart = [];
    var lim = { lo: dataMin - span * 1.2, hi: dataMax + span * 1.2 };
    extra.forEach(function (v) { if (v < lim.lo || v > lim.hi) offChart.push(v); });
    var yMin = Math.min.apply(null, [dataMin].concat(extra.filter(function (v) { return v >= lim.lo; })));
    var yMax = Math.max.apply(null, [dataMax].concat(extra.filter(function (v) { return v <= lim.hi; })));
    var pad = (yMax - yMin) * 0.06; yMin -= pad; yMax += pad;
    function y(v) { return padT + (yMax - v) / (yMax - yMin) * plotH; }
    function clampY(v) { return Math.max(padT, Math.min(padT + plotH, y(v))); }
    var step = histW / nb, bw = Math.max(1, Math.min(9, step * 0.62));
    function x(k) { return x0 + step * (k + 0.5); }

    var root = svg("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", class: "ti-chart", role: "img", "aria-labelledby": "ti-chart-title ti-chart-desc", preserveAspectRatio: "xMidYMid meet" });
    root.appendChild(svg("title", { id: "ti-chart-title" }, [o.title || "Chartbild"]));
    root.appendChild(svg("desc", { id: "ti-chart-desc" }, [describe(s, o.currency)]));
    var defs = svg("defs", {});
    defs.appendChild(svg("linearGradient", { id: "ti-area", x1: "0", y1: "0", x2: "0", y2: "1" }, [svg("stop", { offset: "0%", class: "ti-area-top" }), svg("stop", { offset: "100%", class: "ti-area-bottom" })]));
    defs.appendChild(svg("pattern", { id: "ti-risk", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, [svg("line", { x1: 0, y1: 0, x2: 0, y2: 6, class: "ti-risk-hatch" })]));
    root.appendChild(defs);
    // ---------------------------------------------------------------- Gitter + Achsen
    var grid = svg("g", { class: "ti-grid" });
    var ticks = niceTicks(yMin, yMax, H < 300 ? 4 : 5);
    ticks.forEach(function (v) { grid.appendChild(svg("line", { x1: x0, x2: xEnd, y1: y(v), y2: y(v) })); grid.appendChild(svg("text", { x: xEnd + 6, y: y(v) + 4, class: "ti-axis" }, [fmt(v)])); });
    var lastLabel = -999, years = new Set(ts.map(function (d) { return d.slice(0, 4); })).size > 1;
    for (var k = 1; k < nb; k++) {
      var newPeriod = c.timeframe === "1W" || nb > 400 ? ts[k].slice(0, 4) !== ts[k - 1].slice(0, 4) : ts[k].slice(5, 7) !== ts[k - 1].slice(5, 7);
      if (!newPeriod || x(k) - lastLabel < 56) continue;
      lastLabel = x(k);
      grid.appendChild(svg("text", { x: x(k), y: H - 7, class: "ti-axis ti-axis-x", "text-anchor": "middle" }, [c.timeframe === "1W" || nb > 400 ? ts[k].slice(0, 4) : monthLabel(ts[k], years && ts[k].slice(5, 7) === "01")]));
    }
    root.appendChild(grid);
    // ---------------------------------------------------------------- Szenario-Raum
    root.appendChild(svg("rect", { x: xNow, y: padT, width: xEnd - xNow, height: plotH, class: "ti-proj-bg" }));
    root.appendChild(svg("text", { x: xNow + 6, y: padT + plotH - 8, class: "ti-proj-label" }, [W < 520 ? "Szenario" : "Szenario · keine Vorhersage"]));
    // ---------------------------------------------------------------- Zonen
    var zoneStart = xNow - histW * 0.22;
    function band(z, cls, label, sub) {
      if (!z || !isNum(z.zoneLow)) return null;
      var y1 = clampY(z.zoneHigh), y2 = clampY(z.zoneLow);
      var g = svg("g", { class: "ti-zone " + cls });
      g.appendChild(svg("rect", { x: zoneStart, y: y1, width: xEnd - zoneStart, height: Math.max(2, y2 - y1), rx: 3 }));
      if (label && o.labels !== false) {
        /* Schmal: nur das Wort ("Ziel 1"); die Zahlen stehen in den Kacheln ueber dem Chart. */
        var tx = svg("text", { x: xEnd - 6, y: (y1 + y2) / 2 + 4, "text-anchor": "end", class: "ti-zone-label" }, [label + (sub && W >= 520 ? " " + sub : "")]);
        g.appendChild(tx);
      }
      return g;
    }
    if (s && s.entryZone && s.invalidation) {
      var down = s.invalidation.direction === "below";
      var r1 = down ? s.invalidation.price : s.entryZone.zoneHigh, r2 = down ? s.entryZone.zoneLow : s.invalidation.price;
      root.appendChild(svg("rect", { x: xNow, y: clampY(r2), width: xEnd - xNow, height: Math.max(0, clampY(r1) - clampY(r2)), class: "ti-risk", fill: "url(#ti-risk)" }));
    }
    if (alt && alt.entryZone) root.appendChild(band(alt.entryZone, "ti-zone-alt", null));
    if (s) {
      if (s.range) { root.appendChild(band(s.range.resistance, "ti-zone-target", "Obergrenze")); root.appendChild(band(s.range.support, "ti-zone-entry", "Untergrenze")); }
      (s.targets || []).slice(0, 2).forEach(function (z, q) { var b = band(z, "ti-zone-target", "Ziel " + (q + 1), fmt(z.zoneLow) + "–" + fmt(z.zoneHigh)); if (b) root.appendChild(b); });
      var eb = band(s.entryZone, "ti-zone-entry", s.kind === "TAIL" ? "Tiefere Zone" : "Einstieg", s.entryZone ? fmt(s.entryZone.zoneLow) + "–" + fmt(s.entryZone.zoneHigh) : ""); if (eb) root.appendChild(eb);
      if (s.invalidation && isNum(s.invalidation.price)) {
        var iy = clampY(s.invalidation.price);
        var ig = svg("g", { class: "ti-invalid" });
        ig.appendChild(svg("line", { x1: x0, x2: xEnd, y1: iy, y2: iy }));
        if (o.labels !== false) ig.appendChild(svg("text", { x: xEnd - 6, y: iy + (s.invalidation.direction === "below" ? 14 : -6), "text-anchor": "end", class: "ti-invalid-label" }, [(W < 520 ? "Ungültig " : "Ungültig " + (s.invalidation.direction === "below" ? "unter " : "über ")) + fmt(s.invalidation.price)]));
        root.appendChild(ig);
      }
    }
    // ---------------------------------------------------------------- Kurs
    var price = svg("g", { class: "ti-price" });
    if (line) {
      var d = "", area = "";
      for (var j = 0; j < nb; j++) d += (j ? "L" : "M") + x(j).toFixed(1) + " " + y(cl[j]).toFixed(1);
      area = d + "L" + x(nb - 1).toFixed(1) + " " + (padT + plotH) + "L" + x(0).toFixed(1) + " " + (padT + plotH) + "Z";
      price.appendChild(svg("path", { d: area, class: "ti-area", fill: "url(#ti-area)" }));
      price.appendChild(svg("path", { d: d, class: "ti-line" }));
    } else {
      for (var q2 = 0; q2 < nb; q2++) {
        var up = cl[q2] >= op[q2], cx = x(q2);
        var g2 = svg("g", { class: up ? "ti-candle ti-up" : "ti-candle ti-down" });
        g2.appendChild(svg("line", { x1: cx, x2: cx, y1: y(hi[q2]), y2: y(lo[q2]) }));
        var top = y(Math.max(op[q2], cl[q2])), h = Math.max(1, Math.abs(y(op[q2]) - y(cl[q2])));
        g2.appendChild(svg("rect", { x: cx - bw / 2, y: top, width: bw, height: h }));
        price.appendChild(g2);
      }
    }
    root.appendChild(price);
    // ---------------------------------------------------------------- Heute
    var lastClose = cl[nb - 1], ly = y(lastClose);
    root.appendChild(svg("line", { x1: xNow, x2: xNow, y1: padT, y2: padT + plotH, class: "ti-now" }));
    root.appendChild(svg("circle", { cx: x(nb - 1), cy: ly, r: 3.5, class: "ti-last" }));
    root.appendChild(svg("g", { class: "ti-last-tag" }, [svg("rect", { x: xEnd + 2, y: ly - 9, width: padR - 4, height: 18, rx: 9 }), svg("text", { x: xEnd + padR / 2, y: ly + 4, "text-anchor": "middle" }, [fmt(lastClose)])]));
    // ---------------------------------------------------------------- Szenario-Pfad
    function pathFor(sc, cls) {
      if (!sc || !sc.entryZone || !(sc.targets && sc.targets.length)) return null;
      var pts = [[x(nb - 1), ly]], e = (sc.entryZone.zoneLow + sc.entryZone.zoneHigh) / 2;
      var inZone = lastClose >= sc.entryZone.zoneLow && lastClose <= sc.entryZone.zoneHigh;
      var wP = xEnd - xNow;
      if (!inZone) pts.push([xNow + wP * 0.22, clampY(e)]);
      sc.targets.slice(0, 2).forEach(function (t, q) { pts.push([xNow + wP * (q === 0 ? 0.6 : 0.92), clampY((t.zoneLow + t.zoneHigh) / 2)]); });
      var g = svg("g", { class: "ti-path " + cls });
      /* Korridor: waechst mit dem Abstand zu Heute — Unsicherheit, keine Linie mit Datum. */
      var upper = [], lower = [];
      pts.forEach(function (p, q) { var w = 4 + q * 10; upper.push([p[0], p[1] - w]); lower.unshift([p[0], p[1] + w]); });
      g.appendChild(svg("path", { d: "M" + upper.concat(lower).map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("L") + "Z", class: "ti-corridor" }));
      g.appendChild(svg("path", { d: "M" + pts.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("L"), class: "ti-path-line" }));
      pts.slice(1).forEach(function (p) { g.appendChild(svg("circle", { cx: p[0], cy: p[1], r: 3 })); });
      return g;
    }
    var altPath = pathFor(alt, "ti-path-alt"); if (altPath) root.appendChild(altPath);
    var mainPath = pathFor(s, "ti-path-main"); if (mainPath) root.appendChild(mainPath);
    // ---------------------------------------------------------------- Wellen
    if (o.waves && o.waves.length) {
      var idx = {}; ts.forEach(function (d0, k0) { idx[d0] = k0; });
      var wg = svg("g", { class: "ti-waves" });
      o.waves.forEach(function (w) {
        var k1 = idx[w.toTime]; if (k1 === undefined) return;
        var upLeg = w.toPrice >= w.fromPrice, wy = y(w.toPrice) + (upLeg ? -12 : 16);
        wg.appendChild(svg("circle", { cx: x(k1), cy: y(w.toPrice), r: 2.5, class: w.status === "DEVELOPING" ? "ti-wave-dev" : "" }));
        wg.appendChild(svg("text", { x: x(k1), y: Math.max(padT + 10, Math.min(padT + plotH - 2, wy)), "text-anchor": "middle", class: "ti-wave-label" + (w.status === "DEVELOPING" ? " ti-wave-dev" : "") }, [w.display || w.label]));
      });
      root.appendChild(wg);
    }
    // ---------------------------------------------------------------- ausserhalb
    if (offChart.length) {
      var hiOff = offChart.filter(function (v) { return v > yMax; }), loOff = offChart.filter(function (v) { return v < yMin; });
      if (hiOff.length) root.appendChild(svg("text", { x: xEnd - 6, y: padT + 30, "text-anchor": "end", class: "ti-offchart" }, ["↑ weitere Zone bei " + fmt(Math.min.apply(null, hiOff))]));
      if (loOff.length) root.appendChild(svg("text", { x: xEnd - 6, y: padT + plotH - 8, "text-anchor": "end", class: "ti-offchart" }, ["↓ weitere Zone bei " + fmt(Math.max.apply(null, loOff))]));
    }
    // ---------------------------------------------------------------- Interaktion
    var cross = svg("g", { class: "ti-cross", visibility: "hidden" }, [svg("line", { y1: padT, y2: padT + plotH }), svg("rect", { width: 116, height: 38, rx: 8 }), svg("text", { class: "ti-cross-d" }), svg("text", { class: "ti-cross-p" })]);
    root.appendChild(cross);
    var hit = svg("rect", { x: x0, y: padT, width: histW, height: plotH, class: "ti-hit" });
    function move(ev) {
      var r = root.getBoundingClientRect(), px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      var sx = px * W / r.width, k3 = Math.max(0, Math.min(nb - 1, Math.round((sx - x0) / step - 0.5)));
      var cx3 = x(k3), bx = cx3 + 120 > xNow ? cx3 - 124 : cx3 + 8;
      cross.setAttribute("visibility", "visible");
      cross.childNodes[0].setAttribute("x1", cx3); cross.childNodes[0].setAttribute("x2", cx3);
      cross.childNodes[1].setAttribute("x", bx); cross.childNodes[1].setAttribute("y", padT + 4);
      cross.childNodes[2].setAttribute("x", bx + 8); cross.childNodes[2].setAttribute("y", padT + 18); cross.childNodes[2].textContent = ts[k3].split("-").reverse().join(".");
      cross.childNodes[3].setAttribute("x", bx + 8); cross.childNodes[3].setAttribute("y", padT + 33); cross.childNodes[3].textContent = line ? fmt(cl[k3]) : "S " + fmt(cl[k3]) + " · H " + fmt(hi[k3]);
    }
    hit.addEventListener("pointermove", move); hit.addEventListener("touchmove", move, { passive: true });
    hit.addEventListener("pointerleave", function () { cross.setAttribute("visibility", "hidden"); });
    root.appendChild(hit);
    return root;
  }

  function niceTicks(a, b, n) {
    var span = b - a, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    var st = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = [];
    for (var v = Math.ceil(a / st) * st; v <= b; v += st) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }

  /** Textfassung fuer Screenreader. */
  function describe(s, cur) {
    if (!s) return "Kursverlauf ohne Szenario.";
    var t = [];
    if (s.entryZone) t.push("Einstiegszone " + fmt(s.entryZone.zoneLow) + " bis " + fmt(s.entryZone.zoneHigh) + " " + (cur || ""));
    (s.targets || []).forEach(function (z, q) { t.push("Zielzone " + (q + 1) + " " + fmt(z.zoneLow) + " bis " + fmt(z.zoneHigh)); });
    if (s.invalidation) t.push("ungültig " + (s.invalidation.direction === "below" ? "unter " : "über ") + fmt(s.invalidation.price));
    return "Kursverlauf mit Szenario. " + t.join(", ") + ". Der Bereich rechts von heute zeigt ein Szenario, keine Vorhersage.";
  }

  global.VUTIChart = { render: render, describe: describe, niceTicks: niceTicks };
})(typeof window !== "undefined" ? window : globalThis);
