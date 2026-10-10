/* =========================================================================
   VISION UNIVERSE QUANT — ui/ti-chart.js
   SZENARIO-CHART fuer das Chartbild (API v3, Datenvertrag "overlays")

   Ein Chart, der zuerst Ergebnis zeigt, nicht Methode:
     • Kursverlauf als ruhige Linie mit Flaeche (Kerzen optional)
     • Schluesselzone (Band), Zielbereich (Baender), Ungueltig-Linie
     • Szenario-Raum rechts von "Heute": weicher Pfad mit Korridor, der
       mit dem Abstand zu heute breiter wird — ausdruecklich KEINE
       Zeitprognose (rechts von heute gibt es keine Datumsachse)
     • bei unklarer Struktur: breiterer, blasserer Korridor statt Fehler
     • Wellenmarken als antippbare Punkte (oeffnen den Wellen-Inspektor)
     • Zeitreise: nur Bars bis zum gewaehlten Tag (Rest ausgegraut)
     • Elliott-Projektion (o.projection): Basis / Erweitert / Extrem als
       zurueckhaltende Baender rechts von heute (abnehmende Betonung),
       Bestaetigungs- und Ungueltig-Linie, struktureller Pfad ohne Zeitachse;
       optional logarithmische Preisachse (o.logScale) fuer grosse Spannen
   SVG statt Canvas: scharf, druckbar, fuer Screenreader beschreibbar.
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

  /** Szenario-Sicht aus dem Datenvertrag (overlays) oder einem Szenario-Objekt (Rueckwaertskompatibilitaet). */
  function viewOf(o) {
    var kind = o.scenarioKind || (o.scenario && o.scenario.kind) || "PRIMARY", ov = o.overlays;
    if (ov) {
      var zs = ov.zones.filter(function (z) { return z.scenario === kind; });
      return {
        kind: kind,
        entry: zs.filter(function (z) { return z.kind === "ENTRY" || z.kind === "DEEPER"; })[0] || null,
        targets: zs.filter(function (z) { return z.kind === "TARGET"; }),
        range: zs.filter(function (z) { return z.kind === "RANGE_LOW" || z.kind === "RANGE_HIGH"; }),
        invalidation: ov.invalidations.filter(function (x) { return x.scenario === kind; })[0] || null,
        path: (ov.projectedPaths || []).filter(function (p) { return p.scenario === kind; })[0] || null
      };
    }
    var s = o.scenario || {};
    var z = function (x) { return x ? { low: x.zoneLow, high: x.zoneHigh } : null; };
    return { kind: kind, entry: z(s.entryZone), targets: (s.targets || []).map(z), range: s.range ? [Object.assign(z(s.range.support), { kind: "RANGE_LOW" }), Object.assign(z(s.range.resistance), { kind: "RANGE_HIGH" })] : [],
             invalidation: s.invalidation ? { price: s.invalidation.price, direction: s.invalidation.direction } : null, path: null };
  }

  /**
   * @param {object} o {
   *   chart: { timestamps, open?, high?, low?, close, closeOnly, timeframe },
   *   overlays?: Datenvertrag v3, scenarioKind?: "PRIMARY"|"ALTERNATIVE"|"TAIL", scenario?: (alt) Szenario-Objekt,
   *   waves?: [{ label, display, time, price, status, key }], waveTone?: "alt" (Alternative Lesart), onWave?: fn(wave), uncertain?: bool,
   *   cutoff?: ISO-Datum (Zeitreise: nur Bars bis hier), width, height, bars, mode: "line"|"candles", title, labels
   * }
   */
  function render(o) {
    var W = Math.max(300, o.width || 720), H = Math.max(240, o.height || 380), narrow = W < 520;
    var c = o.chart, n = c.timestamps.length, nb = Math.min(n, o.bars || n), from = n - nb;
    var ts = c.timestamps.slice(from), cl = c.close.slice(from);
    var hi = (c.high || c.close).slice(from), lo = (c.low || c.close).slice(from), op = (c.open || c.close).slice(from);
    var line = o.mode !== "candles" || c.closeOnly;
    var cut = nb - 1;
    if (o.cutoff) { for (var q0 = nb - 1; q0 >= 0; q0--) if (ts[q0] <= o.cutoff) { cut = q0; break; } }
    var padL = 4, padR = narrow ? 50 : 62, padT = 12, padB = 24;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var projShare = narrow ? 0.3 : 0.26;
    var histW = plotW * (1 - projShare), x0 = padL, xEnd = padL + plotW;
    var step = histW / nb;
    function x(k) { return x0 + step * (k + 0.5); }
    var xNow = x(cut) + step * 0.5;
    var PJ = o.projection || null;
    var v = PJ ? { kind: "PROJECTION", entry: null, targets: [], range: [], invalidation: null, path: null } : viewOf(o);
    /* ---------------------------------------------------------- y-Domain */
    var vals = [];
    for (var i = 0; i < nb; i++) vals.push(hi[i], lo[i]);
    var dataMin = Math.min.apply(null, vals), dataMax = Math.max.apply(null, vals), span = dataMax - dataMin || dataMax * 0.1;
    var extra = [];
    function add(z) { if (z && isNum(z.low)) extra.push(z.low, z.high); }
    add(v.entry); v.targets.slice(0, 2).forEach(add); v.range.forEach(add);
    if (v.invalidation) extra.push(v.invalidation.price);
    if (PJ) { PJ.zones.forEach(add); [PJ.invalidation, PJ.confirmation].forEach(function (l) { if (l && isNum(l.price)) extra.push(l.price); }); }
    var LOG = !!(PJ && o.logScale) && dataMin > 0;
    var lim = LOG ? { lo: 1e-12, hi: Infinity } : { lo: dataMin - span * (PJ ? 2.5 : 1.0), hi: dataMax + span * (PJ ? 2.5 : 1.0) }, offChart = [];
    extra.forEach(function (e) { if (e < lim.lo || e > lim.hi) offChart.push(e); });
    var inn = extra.filter(function (e) { return e >= lim.lo && e <= lim.hi; });
    var yMin = Math.min.apply(null, [dataMin].concat(inn)), yMax = Math.max.apply(null, [dataMax].concat(inn));
    var pad = (yMax - yMin) * 0.07;
    if (LOG) { var lp = (Math.log(yMax) - Math.log(yMin)) * 0.06; yMin = Math.exp(Math.log(yMin) - lp); yMax = Math.exp(Math.log(yMax) + lp); }
    else { yMin -= pad; yMax += pad; if (PJ && yMin < 0 && dataMin > 0) yMin = 0; }
    function y(val) { return LOG ? padT + (Math.log(yMax) - Math.log(Math.max(val, yMin * 1e-3))) / (Math.log(yMax) - Math.log(yMin)) * plotH : padT + (yMax - val) / (yMax - yMin) * plotH; }
    function clampY(val) { return Math.max(padT, Math.min(padT + plotH, y(val))); }

    var root = svg("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", class: "ti-chart" + (o.uncertain ? " is-uncertain" : ""), role: "img", "aria-labelledby": "ti-chart-title ti-chart-desc", preserveAspectRatio: "xMidYMid meet" });
    root.appendChild(svg("title", { id: "ti-chart-title" }, [o.title || "Chartbild"]));
    root.appendChild(svg("desc", { id: "ti-chart-desc" }, [PJ ? describeProjection(PJ) : describe(v, o.uncertain)]));
    var defs = svg("defs", {});
    defs.appendChild(svg("linearGradient", { id: "ti-area", x1: "0", y1: "0", x2: "0", y2: "1" }, [svg("stop", { offset: "0%", class: "ti-area-top" }), svg("stop", { offset: "100%", class: "ti-area-bottom" })]));
    defs.appendChild(svg("linearGradient", { id: "ti-corr", x1: "0", y1: "0", x2: "1", y2: "0" }, [svg("stop", { offset: "0%", class: "ti-corr-a" }), svg("stop", { offset: "100%", class: "ti-corr-b" })]));
    root.appendChild(defs);
    /* ---------------------------------------------------------- Gitter */
    var grid = svg("g", { class: "ti-grid" });
    (LOG ? logTicks(yMin, yMax, H < 320 ? 4 : 6) : niceTicks(yMin, yMax, H < 320 ? 4 : 5)).forEach(function (t) { grid.appendChild(svg("line", { x1: x0, x2: xEnd, y1: y(t), y2: y(t) })); grid.appendChild(svg("text", { x: xEnd + 6, y: y(t) + 4, class: "ti-axis" }, [fmt(t)])); });
    var lastLabel = -999, weekly = c.timeframe === "1W" || nb > 400;
    for (var k = 1; k < nb; k++) {
      var newP = weekly ? ts[k].slice(0, 4) !== ts[k - 1].slice(0, 4) : ts[k].slice(5, 7) !== ts[k - 1].slice(5, 7);
      if (!newP || x(k) - lastLabel < (narrow ? 48 : 60)) continue;
      lastLabel = x(k);
      grid.appendChild(svg("text", { x: x(k), y: H - 7, class: "ti-axis ti-axis-x", "text-anchor": "middle" }, [weekly ? ts[k].slice(0, 4) : ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"][+ts[k].slice(5, 7) - 1]]));
    }
    root.appendChild(grid);
    /* ---------------------------------------------------------- Szenario-Raum */
    root.appendChild(svg("rect", { x: xNow, y: padT, width: Math.max(0, xEnd - xNow), height: plotH, class: "ti-proj-bg" }));
    root.appendChild(svg("text", { x: xNow + 8, y: padT + plotH - 8, class: "ti-proj-label" }, [PJ ? (narrow ? "Projektion" : "Projektion · keine Zeitangabe" + (LOG ? " · log" : "")) : narrow ? "Szenario" : "Szenario · keine Zeitangabe"]));
    /* ---------------------------------------------------------- Zonen */
    var zoneStart = Math.max(x0, xNow - histW * 0.2);
    function band(z, cls, label) {
      if (!z || !isNum(z.low)) return null;
      var y1 = clampY(z.high), y2 = clampY(z.low);
      var g = svg("g", { class: "ti-zone " + cls });
      g.appendChild(svg("rect", { x: zoneStart, y: y1, width: xEnd - zoneStart, height: Math.max(3, y2 - y1), rx: 4 }));
      if (label && o.labels !== false) g.appendChild(svg("text", { x: xEnd - 8, y: (y1 + y2) / 2 + 4, "text-anchor": "end", class: "ti-zone-label" }, [label]));
      return g;
    }
    v.range.forEach(function (z) { root.appendChild(band(z, "ti-zone-range", z.kind === "RANGE_LOW" ? "Untergrenze" : "Obergrenze")); });
    v.targets.slice(0, 2).forEach(function (z, q) { var b = band(z, "ti-zone-target", narrow ? (q ? "Ziel 2" : "Ziel 1") : "Zielbereich " + (q + 1)); if (b) root.appendChild(b); });
    var eb = band(v.entry, "ti-zone-entry", v.kind === "TAIL" ? "Tiefere Zone" : "Schlüsselzone"); if (eb) root.appendChild(eb);
    if (v.invalidation && isNum(v.invalidation.price)) {
      var iy = clampY(v.invalidation.price), ig = svg("g", { class: "ti-invalid" });
      ig.appendChild(svg("line", { x1: x0, x2: xEnd, y1: iy, y2: iy }));
      if (o.labels !== false) ig.appendChild(svg("text", { x: xEnd - 8, y: iy + (v.invalidation.direction === "below" ? 15 : -7), "text-anchor": "end", class: "ti-invalid-label" }, ["Ungültig " + (v.invalidation.direction === "below" ? "unter " : "über ") + fmt(v.invalidation.price)]));
      root.appendChild(ig);
    }
    /* ---------------------------------------------------------- Elliott-Projektion */
    if (PJ) {
      var pg = svg("g", { class: "ti-pj" + (PJ.tone === "alt" ? " is-alt" : "") }), px0 = xNow + 4, pw = Math.max(20, xEnd - px0 - 2);
      var TL = { BASE: narrow ? "Basis" : "Basis", EXTENDED: narrow ? "Erw." : "Erweitert", EXTREME: narrow ? "Extrem" : "Extrem" };
      PJ.zones.forEach(function (z, q) {
        if (!isNum(z.low) || !isNum(z.high)) return;
        var y1 = clampY(z.high), y2 = clampY(z.low), off = (z.high < yMin || z.low > yMax);
        if (off) return;
        var g4 = svg("g", { class: "ti-pz ti-pz-" + z.tier.toLowerCase() + (z.passed ? " is-passed" : "") });
        g4.appendChild(svg("rect", { x: px0 + q * 6, y: y1, width: Math.max(8, pw - q * 6), height: Math.max(3, y2 - y1), rx: 4 }));
        if (o.labels !== false) g4.appendChild(svg("text", { x: xEnd - 6, y: Math.max(padT + 11, Math.min(padT + plotH - 4, (y1 + y2) / 2 + 4)), "text-anchor": "end", class: "ti-pz-label" }, [TL[z.tier] + (narrow ? "" : " " + fmt(z.dLow) + "–" + fmt(z.dHigh))]));
        pg.appendChild(g4);
      });
      function hline(l, cls, text, below) {
        if (!l || !isNum(l.price) || l.price < yMin || l.price > yMax) return;
        var ly0 = y(l.price), g5 = svg("g", { class: cls });
        g5.appendChild(svg("line", { x1: x0, x2: xEnd, y1: ly0, y2: ly0 }));
        if (o.labels !== false) g5.appendChild(svg("text", { x: x0 + 6, y: ly0 + (below ? 14 : -6), class: cls + "-label" }, [text]));
        pg.appendChild(g5);
      }
      hline(PJ.confirmation, "ti-pj-conf", "Bestätigung " + (PJ.direction === "DOWN" ? "unter " : "über ") + fmt(PJ.confirmation && PJ.confirmation.price), PJ.direction === "DOWN");
      hline(PJ.invalidation, "ti-invalid", "Ungültig " + (PJ.invalidation && PJ.invalidation.direction === "below" ? "unter " : "über ") + fmt(PJ.invalidation && PJ.invalidation.price), PJ.invalidation && PJ.invalidation.direction === "below");
      root.appendChild(pg);
    }
    /* ---------------------------------------------------------- Kurs */
    var price = svg("g", { class: "ti-price" });
    if (line) {
      var d = "";
      for (var j = 0; j <= cut; j++) d += (j ? "L" : "M") + x(j).toFixed(1) + " " + y(cl[j]).toFixed(1);
      price.appendChild(svg("path", { d: d + "L" + x(cut).toFixed(1) + " " + (padT + plotH) + "L" + x(0).toFixed(1) + " " + (padT + plotH) + "Z", class: "ti-area", fill: "url(#ti-area)" }));
      price.appendChild(svg("path", { d: d, class: "ti-line" }));
      if (cut < nb - 1) { var dF = ""; for (var j2 = cut; j2 < nb; j2++) dF += (j2 === cut ? "M" : "L") + x(j2).toFixed(1) + " " + y(cl[j2]).toFixed(1); price.appendChild(svg("path", { d: dF, class: "ti-line-future" })); }
    } else {
      var bw = Math.max(1, Math.min(9, step * 0.62));
      for (var q2 = 0; q2 < nb; q2++) {
        var up = cl[q2] >= op[q2], cx = x(q2);
        var g2 = svg("g", { class: "ti-candle " + (up ? "ti-up" : "ti-down") + (q2 > cut ? " ti-future" : "") });
        g2.appendChild(svg("line", { x1: cx, x2: cx, y1: y(hi[q2]), y2: y(lo[q2]) }));
        g2.appendChild(svg("rect", { x: cx - bw / 2, y: y(Math.max(op[q2], cl[q2])), width: bw, height: Math.max(1, Math.abs(y(op[q2]) - y(cl[q2]))) }));
        price.appendChild(g2);
      }
    }
    root.appendChild(price);
    /* ---------------------------------------------------------- Heute */
    var last = cl[cut], ly = y(last);
    root.appendChild(svg("line", { x1: xNow, x2: xNow, y1: padT, y2: padT + plotH, class: "ti-now" }));
    root.appendChild(svg("circle", { cx: x(cut), cy: ly, r: 4.5, class: "ti-last-halo" }));
    root.appendChild(svg("circle", { cx: x(cut), cy: ly, r: 3.2, class: "ti-last" }));
    root.appendChild(svg("g", { class: "ti-last-tag" }, [svg("rect", { x: xEnd + 3, y: ly - 10, width: padR - 6, height: 20, rx: 10 }), svg("text", { x: xEnd + padR / 2, y: ly + 4, "text-anchor": "middle" }, [fmt(last)])]));
    /* ---------------------------------------------------------- Szenario-Pfad mit Korridor */
    var pathPts = v.path ? v.path.points : null;
    if (!pathPts && (v.entry || v.targets.length)) {   // ohne Datenvertrag: aus Zonen ableiten
      pathPts = [{ step: 0, price: last, half: 0 }];
      if (v.entry && !(last >= v.entry.low && last <= v.entry.high)) pathPts.push({ step: 1, price: (v.entry.low + v.entry.high) / 2, half: span * 0.03 });
      v.targets.slice(0, 2).forEach(function (t, q) { pathPts.push({ step: pathPts.length, price: (t.low + t.high) / 2, half: span * (0.06 + 0.05 * q) }); });
    }
    if (pathPts && pathPts.length > 1 && o.showPath !== false) {
      var wP = xEnd - xNow, nS = pathPts.length - 1, unc = o.uncertain ? 1.6 : 1;
      var P = pathPts.map(function (p, q) { return { x: q === 0 ? x(cut) : xNow + wP * (0.14 + 0.8 * q / nS), y: q === 0 ? ly : clampY(p.price), h: q === 0 ? 0 : Math.max(4, Math.abs(y(p.price + p.half * unc) - y(p.price))) }; });
      var top = P.map(function (p) { return { x: p.x, y: p.y - p.h }; }), bot = P.map(function (p) { return { x: p.x, y: p.y + p.h }; }).reverse();
      var gp = svg("g", { class: "ti-path ti-path-" + v.kind.toLowerCase() });
      gp.appendChild(svg("path", { d: smooth(top) + "L" + smooth(bot).slice(1) + "Z", class: "ti-corridor", fill: "url(#ti-corr)" }));
      gp.appendChild(svg("path", { d: smooth(P), class: "ti-path-line" }));
      P.slice(1).forEach(function (p) { gp.appendChild(svg("circle", { cx: p.x, cy: p.y, r: 3.2, class: "ti-path-dot" })); });
      root.appendChild(gp);
    }
    if (PJ && PJ.zones.length && o.showPath !== false) {
      var wQ = xEnd - xNow, pp = [{ x: x(cut), y: ly }];
      /* Pfad nur zu noch offenen Zonen (bereits erreichte bleiben als blasse Baender sichtbar) */
      PJ.zones.forEach(function (z, q) { var m = Math.sqrt(z.low * z.high); if (!z.passed && m >= yMin && m <= yMax) pp.push({ x: xNow + wQ * (0.22 + 0.62 * (q + 1) / PJ.zones.length), y: y(m), tier: z.tier }); });
      var pgp = svg("g", { class: "ti-pj-path" });
      for (var q5 = 1; q5 < pp.length; q5++) pgp.appendChild(svg("path", { d: "M" + pp[q5 - 1].x.toFixed(1) + " " + pp[q5 - 1].y.toFixed(1) + "L" + pp[q5].x.toFixed(1) + " " + pp[q5].y.toFixed(1), class: "ti-pj-seg ti-pj-seg-" + String(pp[q5].tier).toLowerCase() }));
      pp.slice(1).forEach(function (p) { pgp.appendChild(svg("circle", { cx: p.x, cy: p.y, r: 3, class: "ti-pj-dot ti-pj-dot-" + String(p.tier).toLowerCase() })); });
      root.appendChild(pgp);
    }
    /* ---------------------------------------------------------- Wellenmarken */
    if (o.waves && o.waves.length) {
      var idx = {}; ts.forEach(function (d0, k0) { idx[d0] = k0; });
      var wg = svg("g", { class: "ti-waves" + (o.waveTone === "alt" ? " is-alt" : "") });
      var placed = [];
      o.waves.forEach(function (w, wi) {
        var k1 = idx[w.time]; if (k1 === undefined || k1 > cut) return;
        var prev = wi > 0 ? o.waves[wi - 1].price : w.fromPrice;
        var upLeg = isNum(prev) ? w.price >= prev : true, wy = y(w.price) + (upLeg ? -14 : 20);
        var dev = w.status === "DEVELOPING", rB = narrow ? 11 : 10, cx0 = x(k1);
        /* Kollisionen vermeiden (UI-Audit Mission III): liegt eine Marke auf einer bereits gesetzten, wird sie vom Kurs weg verschoben */
        var cy0 = Math.max(padT + 9, Math.min(padT + plotH - 6, wy));
        for (var tries = 0; tries < 4 && placed.some(function (p0) { return Math.abs(p0[0] - cx0) < 2 * rB + 1 && Math.abs(p0[1] - cy0) < 2 * rB + 1; }); tries++) cy0 = Math.max(padT + 9, Math.min(padT + plotH - 6, cy0 + (upLeg ? -1 : 1) * (2 * rB + 2)));
        wy = cy0; placed.push([cx0, cy0]);
        var g3 = svg("g", { class: "ti-wave" + (dev ? " is-dev" : "") + (o.onWave ? " is-tap" : ""), tabindex: o.onWave ? "0" : null, role: o.onWave ? "button" : null, "aria-label": o.onWave ? "Welle " + w.label + " erklären" : null });
        g3.appendChild(svg("circle", { cx: x(k1), cy: y(w.price), r: 3, class: "ti-wave-pt" }));
        g3.appendChild(svg("circle", { cx: x(k1), cy: Math.max(padT + 9, Math.min(padT + plotH - 6, wy)) - 4, r: narrow ? 11 : 10, class: "ti-wave-badge" }));
        g3.appendChild(svg("text", { x: x(k1), y: Math.max(padT + 9, Math.min(padT + plotH - 6, wy)), "text-anchor": "middle", class: "ti-wave-label" }, [w.display || w.label]));
        if (o.onWave) {
          g3.addEventListener("click", function () { o.onWave(w); });
          g3.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); o.onWave(w); } });
        }
        wg.appendChild(g3);
      });
      root.appendChild(wg);
    }
    /* ---------------------------------------------------------- ausserhalb */
    if (offChart.length) {
      var hiOff = offChart.filter(function (e) { return e > yMax; }), loOff = offChart.filter(function (e) { return e < yMin; });
      if (hiOff.length) root.appendChild(svg("text", { x: xEnd - 8, y: padT + 30, "text-anchor": "end", class: "ti-offchart" }, ["↑ weitere Zone bei " + fmt(Math.min.apply(null, hiOff))]));
      if (loOff.length) root.appendChild(svg("text", { x: xEnd - 8, y: padT + plotH - 22, "text-anchor": "end", class: "ti-offchart" }, ["↓ weitere Zone bei " + fmt(Math.max.apply(null, loOff))]));
    }
    /* ---------------------------------------------------------- Fadenkreuz */
    var cross = svg("g", { class: "ti-cross", visibility: "hidden" }, [svg("line", { y1: padT, y2: padT + plotH }), svg("rect", { width: 116, height: 38, rx: 10 }), svg("text", { class: "ti-cross-d" }), svg("text", { class: "ti-cross-p" })]);
    root.appendChild(cross);
    var hit = svg("rect", { x: x0, y: padT, width: Math.max(0, xNow - x0), height: plotH, class: "ti-hit" });
    function move(ev) {
      var r = root.getBoundingClientRect(), px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      var sx = px * W / r.width, k3 = Math.max(0, Math.min(cut, Math.round((sx - x0) / step - 0.5)));
      var cx3 = x(k3), bx = cx3 + 122 > xNow ? cx3 - 124 : cx3 + 8;
      cross.setAttribute("visibility", "visible");
      cross.childNodes[0].setAttribute("x1", cx3); cross.childNodes[0].setAttribute("x2", cx3);
      cross.childNodes[1].setAttribute("x", bx); cross.childNodes[1].setAttribute("y", padT + 4);
      cross.childNodes[2].setAttribute("x", bx + 9); cross.childNodes[2].setAttribute("y", padT + 18); cross.childNodes[2].textContent = ts[k3].split("-").reverse().join(".");
      cross.childNodes[3].setAttribute("x", bx + 9); cross.childNodes[3].setAttribute("y", padT + 33); cross.childNodes[3].textContent = fmt(cl[k3]);
    }
    hit.addEventListener("pointermove", move); hit.addEventListener("touchmove", move, { passive: true });
    hit.addEventListener("pointerleave", function () { cross.setAttribute("visibility", "hidden"); });
    /* Treffer-Flaeche unter die Wellenmarken legen, damit diese antippbar bleiben. */
    root.insertBefore(hit, root.querySelector(".ti-waves") || cross);
    return root;
  }

  /** Weicher Pfad (Catmull-Rom → kubische Bezier) durch Punkte {x,y}. */
  function smooth(P) {
    if (P.length < 3) return "M" + P.map(function (p) { return p.x.toFixed(1) + " " + p.y.toFixed(1); }).join("L");
    var d = "M" + P[0].x.toFixed(1) + " " + P[0].y.toFixed(1);
    for (var i = 0; i < P.length - 1; i++) {
      var p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
      var c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6, c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += "C" + c1x.toFixed(1) + " " + c1y.toFixed(1) + " " + c2x.toFixed(1) + " " + c2y.toFixed(1) + " " + p2.x.toFixed(1) + " " + p2.y.toFixed(1);
    }
    return d;
  }

  function niceTicks(a, b, n) {
    var span = b - a, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    var st = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = [];
    for (var t = Math.ceil(a / st) * st; t <= b; t += st) out.push(Math.round(t * 1e6) / 1e6);
    return out;
  }

  /** Logarithmische Achse: 1-2-5-Raster je Dekade, ausgeduennt auf hoechstens n Marken. */
  function logTicks(a, b, n) {
    var out = [];
    for (var e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) [1, 2, 5].forEach(function (m) { var t = m * Math.pow(10, e); if (t >= a && t <= b) out.push(Math.round(t * 1e6) / 1e6); });
    while (out.length > n) out = out.filter(function (_, i) { return i % 2 === 0; });
    return out.length ? out : niceTicks(a, b, n);
  }

  /** Textfassung fuer Screenreader. */
  function describe(v, uncertain) {
    if (!v || (!v.entry && !v.targets.length && !v.range.length)) return "Kursverlauf ohne Szenario.";
    var t = [];
    if (v.entry) t.push("Schlüsselzone " + fmt(v.entry.low) + " bis " + fmt(v.entry.high));
    v.targets.forEach(function (z, q) { t.push("Zielbereich " + (q + 1) + " " + fmt(z.low) + " bis " + fmt(z.high)); });
    if (v.invalidation) t.push("ungültig " + (v.invalidation.direction === "below" ? "unter " : "über ") + fmt(v.invalidation.price));
    return "Kursverlauf mit Szenario. " + t.join(", ") + ". Der Bereich rechts von heute zeigt ein Szenario ohne Zeitangabe" + (uncertain ? "; die Struktur ist derzeit unklar, deshalb ist der Korridor breiter" : "") + ".";
  }

  function describeProjection(P) {
    var t = (P.zones || []).map(function (z) { return ({ BASE: "Basis", EXTENDED: "Erweitert", EXTREME: "Extrem" }[z.tier] || z.tier) + " " + fmt(z.dLow) + " bis " + fmt(z.dHigh); });
    if (P.invalidation) t.push("ungültig " + (P.invalidation.direction === "below" ? "unter " : "über ") + fmt(P.invalidation.price));
    return "Kursverlauf mit Elliott-Projektion (keine Zeitangabe, keine Wahrscheinlichkeit). " + t.join(", ") + ".";
  }
  global.VUTIChart = { render: render, describe: function (s) { return describe(viewOf({ scenario: s })); }, niceTicks: niceTicks, logTicks: logTicks, smooth: smooth, viewOf: viewOf };
})(typeof window !== "undefined" ? window : globalThis);
