/* =========================================================================
   VISION UNIVERSE — assets/vu-chart.js            Kurschart (VU3 UI-System)

   Ein Kurschart fuer alle Welten. Vorbild ist der Verbraucher-Chart der
   Discover-Aktienseite (discover/ui/microchart.js#renderRange): eine
   durchgehende Linie ueber echte Kurse, Startlinie beim ersten Kurs
   (gestrichelt), Kursachse rechts (Hoch, Tief, letzter Kurs), Datum
   unten, Punkt am letzten Kurs. Kein Rahmen, keine Flaeche, kein Gitter.
   Farbe ueber currentColor: .vu-chart[data-direction=up|down] in
   assets/site-navigation.css (--vu-chart-up/--vu-chart-down).

   Dazu: Zeitraum-Leiste (.vu-ranges) und Fingerspur (Tippen/Ziehen zeigt
   Kurs und Datum). Daten kommen immer vom Aufrufer; der Chart rechnet
   nichts um und erfindet keinen Punkt.

   Browser: globalThis.VUChart; Node (Tests): module.exports.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUChart = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var VERSION = "vu-chart-1.1.0";
  var NS = "http://www.w3.org/2000/svg";
  var CUR = { USD: "$", EUR: "€", GBP: "£", CHF: "CHF" };

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function clean(points) {
    return (points || []).filter(function (p) { return p && typeof p[0] === "string" && isNum(p[1]) && isFinite(Date.parse(p[0])); });
  }
  function fmt(v) { return v >= 1000 ? Math.round(v).toLocaleString("de-DE") : v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function money(v, cur) { var c = CUR[cur] || cur || ""; return fmt(v) + (c ? " " + c : ""); }
  function isIntraday(p) { return p.length > 1 && p[0][0].length > 10 && p[0][0].slice(0, 10) === p[p.length - 1][0].slice(0, 10); }
  function dateLabel(iso, intraday) {
    if (intraday && iso.length > 10) return iso.slice(11, 16);
    return iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(2, 4);
  }

  /** Geometrie ohne DOM (fuer Tests und den Zeichner): Pfad, Achsen, Richtung. */
  function geometry(points, opt) {
    var p = clean(points), o = opt || {};
    if (p.length < 2) return null;
    var w = o.width || 640, h = o.height || 260;
    var padTop = 14, padBottom = 26, padL = 2, padR = o.axis === false ? 2 : 58;
    var vals = p.map(function (x) { return x[1]; });
    var base = isNum(o.base) ? o.base : vals[0];
    /* Kursmarken (Einstieg, Stop, Ziel) liegen im Bild, damit keine Linie am Rand klebt. */
    var levels = (o.levels || []).filter(function (l) { return l && isNum(l.value); });
    var extra = (isNum(o.base) ? [base] : []).concat(levels.map(function (l) { return l.value; }));
    var lo = Math.min.apply(null, vals.concat(extra)), hi = Math.max.apply(null, vals.concat(extra));
    if (lo === hi) { lo -= 1; hi += 1; }
    var log = o.log === true || (o.log !== false && lo > 0 && hi / lo > 15);
    var tr = log ? Math.log : function (v) { return v; };
    var span = tr(hi) - tr(lo), yLo = tr(lo) - span * 0.06, yHi = tr(hi) + span * 0.06;
    var t0 = Date.parse(p[0][0]), t1 = Date.parse(p[p.length - 1][0]), ts = Math.max(1, t1 - t0);
    /* Intraday: die x-Achse darf die ganze Sitzung zeigen (sessionEnd), damit ein halber Tag nicht gestreckt wirkt. */
    if (o.sessionEnd && isFinite(Date.parse(o.sessionEnd))) ts = Math.max(ts, Date.parse(o.sessionEnd) - t0);
    var X = function (iso) { return padL + ((Date.parse(iso) - t0) / ts) * (w - padL - padR); };
    var Y = function (v) { return h - padBottom - ((tr(v) - yLo) / (yHi - yLo)) * (h - padTop - padBottom); };
    var d = "", pts = [];
    p.forEach(function (pt, i) { var x = X(pt[0]), y = Y(pt[1]); pts.push({ x: x, y: y, t: pt[0], v: pt[1] }); d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1) + " "; });
    var last = vals[vals.length - 1];
    return {
      w: w, h: h, padR: padR, padBottom: padBottom, log: log, d: d.trim(), pts: pts, base: base, baseY: Y(base),
      direction: last > base ? "up" : last < base ? "down" : "flat", first: vals[0], last: last, hi: hi, lo: lo,
      yTicks: [hi, lo].map(function (v) { return { v: v, y: Y(v) }; }).concat([{ v: last, y: Y(last), last: true }]),
      xTicks: [0, Math.floor((p.length - 1) / 2), p.length - 1].map(function (i) { return { x: X(p[i][0]), t: p[i][0] }; }),
      intraday: isIntraday(p), y: Y,
      levels: levels.map(function (l) { return { value: l.value, label: l.label || "", tone: l.tone || "", y: Y(l.value) }; })
    };
  }

  function el(name, attrs) { var n = root.document.createElementNS(NS, name); for (var k in attrs) n.setAttribute(k, attrs[k]); return n; }

  /** SVG-Knoten des Charts oder null (zu wenig echte Punkte). */
  function render(points, opt) {
    var o = opt || {}, g = geometry(points, o);
    if (!g) return null;
    var label = (o.label ? o.label + ": " : "") + "Kursverlauf von " + dateLabel(g.pts[0].t, g.intraday) + " bis " + dateLabel(g.pts[g.pts.length - 1].t, g.intraday) +
      ", " + fmt(g.first) + " auf " + fmt(g.last) + (g.log ? ", logarithmische Kursachse" : "");
    var svg = el("svg", { viewBox: "0 0 " + g.w + " " + g.h, role: "img", "aria-label": label, "data-direction": g.direction, "data-scale": g.log ? "log" : "linear" });
    svg.appendChild(el("line", { class: "vu-chart-base", x1: 2, x2: g.w - g.padR, y1: g.baseY.toFixed(1), y2: g.baseY.toFixed(1) }));
    svg.appendChild(el("path", { class: "vu-chart-line", d: g.d, "vector-effect": "non-scaling-stroke" }));
    g.levels.forEach(function (l) {
      var gl = el("g", { class: "vu-chart-level", "data-tone": l.tone });
      gl.appendChild(el("line", { x1: 2, x2: g.w - g.padR, y1: l.y.toFixed(1), y2: l.y.toFixed(1) }));
      if (l.label) { var lt = el("text", { x: 4, y: (l.y - 5).toFixed(1) }); lt.textContent = l.label + " " + fmt(l.value); gl.appendChild(lt); }
      svg.appendChild(gl);
    });
    var lp = g.pts[g.pts.length - 1];
    svg.appendChild(el("circle", { class: "vu-chart-dot", cx: lp.x.toFixed(1), cy: lp.y.toFixed(1), r: 3.6 }));
    if (o.axis !== false) {
      /* Der letzte Kurs zuerst; Hoch oder Tief, die naeher als 14 px daneben laegen, entfallen (keine uebereinander gedruckten Zahlen). */
      var used = [];
      g.yTicks.slice().sort(function (a, b) { return (b.last ? 1 : 0) - (a.last ? 1 : 0); }).forEach(function (t) {
        if (used.some(function (u) { return Math.abs(u - t.y) < 14; })) return;
        used.push(t.y);
        var tx = el("text", { class: "vu-chart-axis", x: g.w - g.padR + 8, y: (t.y + 4).toFixed(1) });
        if (t.last) tx.setAttribute("font-weight", "800");
        tx.textContent = fmt(t.v); svg.appendChild(tx);
      });
      g.xTicks.forEach(function (t, i) {
        var tx = el("text", { class: "vu-chart-axis", x: t.x.toFixed(1), y: g.h - 6, "text-anchor": i === 0 ? "start" : i === 2 ? "end" : "middle" });
        tx.textContent = dateLabel(t.t, g.intraday); svg.appendChild(tx);
      });
    }
    svg.__vuGeometry = g;
    return svg;
  }

  /**
   * Chart mit Zeitraum-Leiste in host.
   * o.ranges: [{id, label, points?: [[iso, v]], load?: () => Promise<points>, base?, sessionEnd?}]
   * o.initial: id; o.currency; o.label; o.height (Standard: 300 Desktop, 220 mobil); o.onRange(id, geometry)
   */
  function mount(host, o) {
    if (!host) return { dispose: function () {} };
    var doc = host.ownerDocument, ranges = (o && o.ranges || []).filter(Boolean), alive = true;
    var box = doc.createElement("div"); box.className = "vu-chart" + (o.bleed === false ? "" : " vu-chart--bleed");
    var plot = doc.createElement("div"); plot.className = "vu-chart-plot"; plot.style.position = "relative";
    var tip = doc.createElement("div"); tip.className = "vu-chart-tip"; tip.hidden = true;
    var bar = doc.createElement("div"); bar.className = "vu-ranges"; bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "Zeitraum");
    box.appendChild(plot); plot.appendChild(tip);
    if (ranges.length > 1) box.appendChild(bar);
    host.replaceChildren(box);
    var current = null, cache = {}, svg = null, cross = null;
    ranges.forEach(function (r) {
      var b = doc.createElement("button"); b.type = "button"; b.textContent = r.label || r.id; b.dataset.range = r.id;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () { show(r.id); });
      bar.appendChild(b);
    });
    function size() { var w = Math.max(280, Math.round(plot.clientWidth || host.clientWidth || 640)); return { w: w, h: o.height || (w < 560 ? 220 : 300) }; }
    function draw(r, pts) {
      var s = size();
      var node = render(pts, { width: s.w, height: s.h, base: r.base, sessionEnd: r.sessionEnd, label: o.label, log: r.log, levels: r.levels || o.levels });
      if (svg) svg.remove();
      tip.hidden = true;
      if (!node) { svg = doc.createElement("div"); svg.className = "vu-chart-empty"; svg.textContent = "Für diesen Zeitraum liegen keine Kurse vor."; plot.appendChild(svg); box.dataset.direction = "flat"; return; }
      svg = node; plot.insertBefore(svg, tip);
      box.dataset.direction = node.getAttribute("data-direction");
      cross = el("line", { class: "vu-chart-cross", y1: 0, y2: s.h - 26, x1: 0, x2: 0, visibility: "hidden" });
      svg.appendChild(cross);
      if (o.onRange) o.onRange(r.id, node.__vuGeometry);
    }
    function show(id) {
      var r = ranges.filter(function (x) { return x.id === id; })[0] || ranges[0];
      if (!r) return;
      current = r.id;
      [].forEach.call(bar.children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.range === current)); });
      var got = r.points ? Promise.resolve(r.points) : cache[r.id] || (cache[r.id] = Promise.resolve(r.load ? r.load() : []).catch(function () { return []; }));
      got.then(function (pts) { if (alive && current === r.id) { r.points = pts; draw(r, pts); } });
    }
    function scrub(e) {
      if (!svg || !svg.__vuGeometry) return;
      var g = svg.__vuGeometry, rect = svg.getBoundingClientRect(), cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      var x = cx * g.w / rect.width, best = g.pts[0];
      g.pts.forEach(function (p) { if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p; });
      cross.setAttribute("x1", best.x.toFixed(1)); cross.setAttribute("x2", best.x.toFixed(1)); cross.setAttribute("visibility", "visible");
      tip.hidden = false; tip.textContent = money(best.v, o.currency) + " · " + dateLabel(best.t, g.intraday);
      tip.style.left = Math.min(rect.width - 60, Math.max(60, best.x * rect.width / g.w)) + "px";
    }
    function leave() { tip.hidden = true; if (cross) cross.setAttribute("visibility", "hidden"); }
    plot.addEventListener("pointermove", scrub);
    plot.addEventListener("pointerdown", scrub);
    plot.addEventListener("pointerleave", leave);
    var ro = root.ResizeObserver ? new root.ResizeObserver(function () { var r = ranges.filter(function (x) { return x.id === current; })[0]; if (r && r.points && svg && Math.abs(size().w - svg.__vuGeometry.w) > 4) draw(r, r.points); }) : null;
    if (ro) ro.observe(plot);
    show(o.initial || (ranges[0] && ranges[0].id));
    return { show: show, el: box, dispose: function () { alive = false; if (ro) ro.disconnect(); box.remove(); } };
  }

  return Object.freeze({ VERSION: VERSION, geometry: geometry, render: render, mount: mount, money: money });
});
