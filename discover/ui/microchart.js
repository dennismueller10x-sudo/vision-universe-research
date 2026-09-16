/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/microchart.js

   VU MICRO PRICE CHART — UND SEIN EHRLICHES GEGENSTÜCK

   Zwei Dinge, und die Grenze dazwischen ist der Grund für diese Datei:

   1. Der Micro-Chart. Eine Linie aus echten Tagesschlusskursen, ohne
      Achsen, ohne Indikatoren, ohne Werkzeuge. Er wird NUR gezeichnet,
      wenn die Karte eine Kursreihe mit Status CALCULATED trägt - also
      dort, wo sie ausgeliefert werden darf. Quelle, Reihentyp und Stand
      stehen im <title> der Zeichnung; ein Chart ohne Herkunft gibt es
      nicht.

   2. Die Renditeleiter. Für Titel, deren Kursreihe zurückbleibt, zeichnete
      die vorige Fassung einen "rebasierten Renditepfad": vier Renditen als
      Punkte, durch Linien verbunden. Das war rechnerisch korrekt und sah
      trotzdem aus wie ein Kurschart - und genau das darf es nicht. Die
      Leiter zeigt dieselben vier Zahlen als Balken: 1M, 3M, 6M, 1J. Man
      sieht auf einen Blick, ob und wie stark ein Titel gestiegen ist -
      und man sieht ebenso klar, dass das KEIN Verlauf ist.

   CHART TRUTH CONTRACT (§12)

     priceSeries.status === "CALCULATED" && points.length >= 5  → Linie
     sonst                                                     → keine Linie

   Es gibt keinen dritten Weg. Insbesondere wird nie aus Renditen eine
   Kurve konstruiert.
   ========================================================================= */
(function (global) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var MODULE_VERSION = "discover-microchart-1.2.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function svg(tag, attrs) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined) return;
      if (k === "text") node.textContent = String(attrs[k]);
      else node.setAttribute(k, String(attrs[k]));
    });
    return node;
  }

  /** Darf hieraus eine Linie werden? Die einzige Stelle, die das entscheidet. */
  function hasSeries(ps) {
    return !!(ps && typeof ps === "object" && ps.status === "CALCULATED" &&
              Array.isArray(ps.points) && ps.points.length >= 5 && ps.source);
  }

  /* Handelstage je Zeitraum. Die Reihe traegt ein Jahr Tagesschluss; der
     Zeitraum ist ein Fenster darauf - kein zweiter Datensatz. */
  var RANGE_BARS = { "1M": 21, "3M": 63, "6M": 126, "1J": 252 };
  var MAX_POINTS = 64;

  /** Punkte eines Zeitraums: aus vorgerechneten Zeitraeumen (ranges) oder
      als Fenster auf die Tagesreihe (points), auf hoechstens 64 Punkte
      ausgeduennt - der letzte Punkt bleibt immer der letzte. */
  function pointsFor(ps, range) {
    if (!ps || ps.status !== "CALCULATED") return null;
    if (ps.ranges && range && ps.ranges[range]) return ps.ranges[range].points;
    if (Array.isArray(ps.points) && ps.points.length) {
      var n = RANGE_BARS[range] || ps.points.length;
      var fenster = ps.points.slice(-Math.min(n, ps.points.length));
      if (fenster.length <= MAX_POINTS) return fenster;
      var out = [], step = (fenster.length - 1) / (MAX_POINTS - 1);
      for (var i = 0; i < MAX_POINTS; i++) out.push(fenster[Math.round(i * step)]);
      out[out.length - 1] = fenster[fenster.length - 1];
      return out;
    }
    if (ps.ranges) { var k = Object.keys(ps.ranges); return k.length ? ps.ranges[k[0]].points : null; }
    return null;
  }

  var RANGE_WORT = { "1M": "einen Monat", "3M": "drei Monate", "6M": "sechs Monate", "1J": "zwölf Monate" };

  /**
   * Der Micro-Chart.
   *
   * @param {object} ps    priceSeries (Karte oder Detail)
   * @param {object} opt   {width, height, range, symbol, dates, area}
   * @returns {SVGElement|null}  null, wenn es nichts Belegtes zu zeichnen gibt
   */
  function render(ps, opt) {
    opt = opt || {};
    var range = opt.range || ps.range || "6M";
    var punkte = pointsFor(ps, range);
    if (!hasSeries(Object.assign({}, ps, { points: punkte }))) return null;

    var w = opt.width || 300, h = opt.height || 92;
    var padTop = Math.max(8, h * 0.12), padBottom = opt.dates ? Math.max(16, h * 0.18) : Math.max(6, h * 0.08);
    var padX = opt.padX !== undefined ? opt.padX : Math.max(4, w * 0.02);
    var closes = punkte.map(function (p) { return p[1]; }).filter(isNum);
    if (closes.length < 5) return null;
    var lo = Math.min.apply(null, closes), hi = Math.max.apply(null, closes);
    if (lo === hi) { lo -= 1; hi += 1; }
    var spanne = hi - lo;
    lo -= spanne * 0.08; hi += spanne * 0.08;
    var up = closes[closes.length - 1] >= closes[0];

    var node = svg("svg", {
      class: "dx-micro" + (up ? "" : " dx-micro--down"), viewBox: "0 0 " + w + " " + h,
      preserveAspectRatio: "none", role: "img", "data-direction": up ? "up" : "down",
      "aria-label": beschreibung(ps, range, opt.symbol)
    });
    var titel = svg("title", {});
    titel.textContent = beschreibung(ps, range, opt.symbol);
    node.appendChild(titel);

    var lauf = (render.zaehler = (render.zaehler || 0) + 1);
    var defs = svg("defs", {});
    var grad = svg("linearGradient", { id: "dxm" + lauf, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(svg("stop", { offset: "0%", "stop-color": "currentColor", "stop-opacity": ".28" }));
    grad.appendChild(svg("stop", { offset: "100%", "stop-color": "currentColor", "stop-opacity": "0" }));
    defs.appendChild(grad);
    node.appendChild(defs);

    var n = punkte.length;
    var x = function (i) { return padX + (i / (n - 1)) * (w - padX * 2); };
    var y = function (v) { return h - padBottom - ((v - lo) / (hi - lo)) * (h - padTop - padBottom); };
    var d = "";
    punkte.forEach(function (p, i) {
      if (!isNum(p[1])) return;
      d += (d ? "L" : "M") + x(i).toFixed(1) + " " + y(p[1]).toFixed(1) + " ";
    });
    /* Startlinie: der erste Schlusskurs des Zeitraums. Ohne sie sagt die
       Form nichts darueber, ob der Titel im Zeitraum gestiegen ist. */
    node.appendChild(svg("line", { class: "dx-art-base", x1: 0, x2: w,
      y1: y(closes[0]).toFixed(1), y2: y(closes[0]).toFixed(1) }));
    if (opt.area !== false) {
      node.appendChild(svg("path", { class: "dx-art-fill", fill: "url(#dxm" + lauf + ")",
        d: d + "L" + x(n - 1).toFixed(1) + " " + h + " L" + x(0).toFixed(1) + " " + h + " Z" }));
    }
    node.appendChild(svg("path", { class: "dx-art-line", d: d.trim() }));
    node.appendChild(svg("circle", { class: "dx-art-node", cx: x(n - 1).toFixed(1),
      cy: y(closes[closes.length - 1]).toFixed(1), r: 2.8 }));

    if (opt.dates) {
      node.appendChild(svg("text", { class: "dx-micro-date", x: padX, y: h - 4,
        "text-anchor": "start", text: datum(punkte[0][0]) }));
      node.appendChild(svg("text", { class: "dx-micro-date", x: w - padX, y: h - 4,
        "text-anchor": "end", text: datum(punkte[n - 1][0]) }));
    }
    return node;
  }

  function datum(iso) {
    if (!iso || iso.length < 10) return "";
    return iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(2, 4);
  }

  function beschreibung(ps, range, symbol) {
    return (symbol ? symbol + ": " : "") + "Kursverlauf über " + (RANGE_WORT[range] || range) +
           ", Tagesschlusskurse" + (ps.priceSeriesType === "SPLIT_ADJUSTED" ? ", split-bereinigt" : "") +
           " — Stand " + (ps.asOf || "unbekannt");
  }

  /* ------------------------------------------------ Zeitraum-Chart (V4) */

  /**
   * Der grosse Verbraucher-Chart der Aktienseite: eine durchgehende Linie
   * ueber echte Schlusskurse eines Zeitraums, Startlinie beim ersten Kurs,
   * Kursachse rechts (Hoch, Tief, letzter Kurs), Datumsachse unten. Keine
   * Kerzen, kein Volumen, keine Indikatoren - die stehen im Analyse-Chart.
   * Farbe: currentColor (die Welt); Richtung als data-direction fuer
   * Zahlen, nicht fuer die Linie.
   *
   * @param {Array} punkte  [[date, close], ...] aufsteigend
   * @param {object} opt    {width, height, symbol, range, label, grain}
   */
  function renderRange(punkte, opt) {
    opt = opt || {};
    var p = (punkte || []).filter(function (x) { return x && isNum(x[1]); });
    if (p.length < 2) return null;
    var w = opt.width || 1120, h = opt.height || 380;
    var padTop = 18, padBottom = 30, padL = 8, padR = 64;
    var closes = p.map(function (x) { return x[1]; });
    var lo = Math.min.apply(null, closes), hi = Math.max.apply(null, closes);
    if (lo === hi) { lo -= 1; hi += 1; }
    /* Lange Zeitraeume mit einem Vielfachen von mehr als 15 zwischen Tief
       und Hoch: logarithmische Kursachse, sonst ist die erste Haelfte der
       Reihe eine flache Linie am Boden. Eine Skala, kein Eingriff in die
       Kurse - und die Beschriftung sagt es (opt.log wird zurueckgemeldet). */
    var log = opt.log === true || (opt.log !== false && lo > 0 && hi / lo > 15);
    var tr = log ? function (v) { return Math.log(v); } : function (v) { return v; };
    var spanne = tr(hi) - tr(lo);
    var yLo = tr(lo) - spanne * 0.06, yHi = tr(hi) + spanne * 0.06;
    var t0 = Date.parse(p[0][0]), t1 = Date.parse(p[p.length - 1][0]);
    var tspan = Math.max(1, t1 - t0);
    var x = function (iso) { return padL + ((Date.parse(iso) - t0) / tspan) * (w - padL - padR); };
    var y = function (v) { return h - padBottom - ((tr(v) - yLo) / (yHi - yLo)) * (h - padTop - padBottom); };
    var up = closes[closes.length - 1] >= closes[0];
    var text = (opt.symbol ? opt.symbol + ": " : "") + "Kursverlauf " + (opt.label || opt.range || "") + ", " +
               (opt.grain === "weekly" ? "Wochenschlusskurse" : "Tagesschlusskurse") + ", von " + datum(p[0][0]) + " bis " + datum(p[p.length - 1][0]) +
               ", " + closes[0].toFixed(2) + " auf " + closes[closes.length - 1].toFixed(2);
    if (log) text += ", logarithmische Kursachse";
    var node = svg("svg", { class: "dx-range-chart", viewBox: "0 0 " + w + " " + h, preserveAspectRatio: "none",
                            role: "img", "aria-label": text, "data-direction": up ? "up" : "down", "data-range": opt.range || "",
                            "data-scale": log ? "log" : "linear" });
    var titel = svg("title", {}); titel.textContent = text; node.appendChild(titel);
    var lauf = (renderRange.zaehler = (renderRange.zaehler || 0) + 1);
    var defs = svg("defs", {});
    var grad = svg("linearGradient", { id: "dxr" + lauf, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(svg("stop", { offset: "0%", "stop-color": "currentColor", "stop-opacity": ".22" }));
    grad.appendChild(svg("stop", { offset: "100%", "stop-color": "currentColor", "stop-opacity": "0" }));
    defs.appendChild(grad); node.appendChild(defs);
    /* Leise Hilfslinien: Hoch, Tief, Startkurs. */
    [hi, lo].forEach(function (v) {
      node.appendChild(svg("line", { class: "dx-range-grid", x1: padL, x2: w - padR, y1: y(v).toFixed(1), y2: y(v).toFixed(1) }));
    });
    node.appendChild(svg("line", { class: "dx-art-base", x1: padL, x2: w - padR, y1: y(closes[0]).toFixed(1), y2: y(closes[0]).toFixed(1) }));
    var d = "", karte = [];
    p.forEach(function (pt) {
      var px = x(pt[0]), py = y(pt[1]);
      karte.push({ x: px, y: py, date: pt[0], close: pt[1] });
      d += (d ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1) + " ";
    });
    node.appendChild(svg("path", { class: "dx-art-fill", fill: "url(#dxr" + lauf + ")",
      d: d + "L" + x(p[p.length - 1][0]).toFixed(1) + " " + (h - padBottom) + " L" + x(p[0][0]).toFixed(1) + " " + (h - padBottom) + " Z" }));
    node.appendChild(svg("path", { class: "dx-art-line dx-range-line", d: d.trim(), "vector-effect": "non-scaling-stroke" }));
    var lx = x(p[p.length - 1][0]), ly = y(closes[closes.length - 1]);
    node.appendChild(svg("circle", { class: "dx-art-node", cx: lx.toFixed(1), cy: ly.toFixed(1), r: 3.4 }));
    /* Kursachse rechts: Hoch, zwei Zwischenwerte, Tief, letzter Kurs. */
    var fmt = function (v) { return v >= 1000 ? Math.round(v).toLocaleString("de-DE") : v.toFixed(2).replace(".", ","); };
    var stufen = [hi, lo];
    if (h >= 220) {
      stufen = [hi];
      [2, 1].forEach(function (k) { stufen.push(log ? Math.exp(tr(lo) + (tr(hi) - tr(lo)) * k / 3) : lo + (hi - lo) * k / 3); });
      stufen.push(lo);
    }
    stufen.forEach(function (v, i) {
      var klasse = "dx-range-axis" + (i === 0 || i === stufen.length - 1 ? "" : " dx-range-axis--mid");
      if (i !== 0 && i !== stufen.length - 1) node.appendChild(svg("line", { class: "dx-range-grid", x1: padL, x2: w - padR, y1: y(v).toFixed(1), y2: y(v).toFixed(1) }));
      node.appendChild(svg("text", { class: klasse, x: w - padR + 8, y: (y(v) + 4).toFixed(1), text: fmt(v) }));
    });
    /* Fuer die Beruehrung auf der Aktienseite: jeder Punkt mit seinen
       Bildkoordinaten (die viewBox ist dort pixelgenau). */
    node.__punkte = karte;
    node.__basis = { close: closes[0], date: p[0][0], padBottom: padBottom, padTop: padTop, padL: padL, padR: padR };
    if (Math.abs(ly - y(hi)) > 14 && Math.abs(ly - y(lo)) > 14) {
      node.appendChild(svg("text", { class: "dx-range-axis dx-range-axis--last", x: w - padR + 8, y: (ly + 4).toFixed(1), text: fmt(closes[closes.length - 1]) }));
    }
    /* Datumsachse: Anfang, Ende, dazwischen drei Stuetzen. */
    var ticks = 4;
    for (var i = 0; i <= ticks; i++) {
      var tt = t0 + (tspan * i) / ticks;
      var iso = new Date(tt).toISOString().slice(0, 10);
      var anchor = i === 0 ? "start" : i === ticks ? "end" : "middle";
      node.appendChild(svg("text", { class: "dx-range-date", x: x(iso).toFixed(1), y: h - 8, "text-anchor": anchor,
        text: opt.range === "1W" || opt.range === "1M" ? datum(iso) : (opt.range === "6M" || opt.range === "1Y" ? monat(iso) : iso.slice(0, 4)) }));
    }
    return node;
  }
  function monat(iso) {
    var m = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"][parseInt(iso.slice(5, 7), 10) - 1];
    return m + " " + iso.slice(2, 4);
  }

  /* -------------------------------------------------- Intraday-Verlauf */

  /**
   * Der Tagesverlauf einer Sitzung: 5-Minuten-Schlusskurse ueber der
   * Sitzungszeit. Die Zeitachse ist die ganze Sitzung (09:30-16:00 New
   * York); eine laufende Sitzung fuellt sie nur so weit, wie echte Punkte
   * reichen. Nichts wird animiert, nichts fortgeschrieben.
   *
   * Gezeichnet wird nur, was der Intraday-Vertrag durchlaesst
   * (VURealtime.IntradaySnapshot.validate). Sonst null.
   *
   * @param {object} snap  Snapshot (quant/engines/realtime/intraday-snapshot.js)
   * @param {object} opt   {width, height, symbol, label, axis}
   */
  function renderIntraday(snap, opt) {
    opt = opt || {};
    var Snap = global.VURealtime && global.VURealtime.IntradaySnapshot;
    if (!snap || !Array.isArray(snap.points) || snap.points.length < 2) return null;
    if (Snap && !Snap.validate(snap).ok) return null;

    var w = opt.width || 300, h = opt.height || 92, axis = opt.axis === true;
    var padTop = Math.max(8, h * 0.12), padBottom = axis ? Math.max(18, h * 0.14) : Math.max(6, h * 0.08);
    var padX = opt.padX !== undefined ? opt.padX : Math.max(4, w * 0.02);
    var padRight = axis ? Math.max(padX, 52) : padX;
    var openMin = minutesOf(snap.sessionOpenLocal || "09:30"), closeMin = minutesOf(snap.sessionCloseLocal || "16:00");
    var span = Math.max(1, closeMin - openMin);
    var closes = snap.points.map(function (p) { return p[1]; });
    var base = isNum(snap.previousClose) ? snap.previousClose : closes[0];
    var lo = Math.min.apply(null, closes.concat([base])), hi = Math.max.apply(null, closes.concat([base]));
    if (lo === hi) { lo -= 1; hi += 1; }
    var spanne = hi - lo; lo -= spanne * 0.1; hi += spanne * 0.1;
    var last = closes[closes.length - 1];
    var up = last >= base;
    var laeuft = snap.regularComplete !== true;

    var x = function (m) { return padX + ((m - openMin) / span) * (w - padX - padRight); };
    var y = function (v) { return h - padBottom - ((v - lo) / (hi - lo)) * (h - padTop - padBottom); };

    var text = beschreibungIntraday(snap, opt.symbol, opt.label);
    var node = svg("svg", {
      class: "dx-micro dx-micro--intraday" + (up ? "" : " dx-micro--down") + (laeuft ? " dx-micro--running" : ""),
      viewBox: "0 0 " + w + " " + h, preserveAspectRatio: "none", role: "img",
      "data-art": "intraday", "data-direction": up ? "up" : "down",
      "data-session": snap.sessionDate, "data-complete": laeuft ? "false" : "true",
      "aria-label": text
    });
    var titel = svg("title", {}); titel.textContent = text; node.appendChild(titel);

    var lauf = (render.zaehler = (render.zaehler || 0) + 1);
    var defs = svg("defs", {});
    var grad = svg("linearGradient", { id: "dxi" + lauf, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(svg("stop", { offset: "0%", "stop-color": "currentColor", "stop-opacity": ".26" }));
    grad.appendChild(svg("stop", { offset: "100%", "stop-color": "currentColor", "stop-opacity": "0" }));
    defs.appendChild(grad); node.appendChild(defs);

    /* Die Startlinie: der Vortagesschluss. Ohne ihn der erste Punkt - und
       dann sagt die Beschreibung das auch. */
    node.appendChild(svg("line", { class: "dx-art-base", x1: padX, x2: w - padRight,
      y1: y(base).toFixed(1), y2: y(base).toFixed(1) }));
    var d = "", karte = [];
    snap.points.forEach(function (p) {
      if (!isNum(p[1])) return;
      var px = x(minutesOf(p[0])), py = y(p[1]);
      karte.push({ x: px, y: py, time: p[0], close: p[1] });
      d += (d ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1) + " ";
    });
    node.__punkte = karte;
    node.__basis = { close: base, time: snap.sessionOpenLocal || "09:30", padBottom: padBottom, padTop: padTop, padL: padX, padR: padRight,
                     previousClose: isNum(snap.previousClose) ? snap.previousClose : null };
    var xLast = x(minutesOf(snap.points[snap.points.length - 1][0])), xFirst = x(minutesOf(snap.points[0][0]));
    if (opt.area !== false) {
      node.appendChild(svg("path", { class: "dx-art-fill", fill: "url(#dxi" + lauf + ")",
        d: d + "L" + xLast.toFixed(1) + " " + (h - padBottom).toFixed(1) + " L" + xFirst.toFixed(1) + " " + (h - padBottom).toFixed(1) + " Z" }));
    }
    node.appendChild(svg("path", { class: "dx-art-line", d: d.trim() }));
    if (laeuft) {
      node.appendChild(svg("circle", { class: "dx-art-node-ring", cx: xLast.toFixed(1), cy: y(last).toFixed(1), r: 5.5 }));
    }
    node.appendChild(svg("circle", { class: "dx-art-node", cx: xLast.toFixed(1), cy: y(last).toFixed(1), r: 2.8 }));

    if (axis) {
      var marken = [];
      for (var m = Math.ceil(openMin / 60) * 60; m <= closeMin; m += 60) marken.push(m);
      /* Eine Stundenmarke, die der Rand-Beschriftung (09:30, 16:00) zu
         nahe kaeme, faellt weg - pixelgenau, nicht nach Minuten. */
      marken.forEach(function (m) {
        if (x(m) - x(openMin) < 40 || x(closeMin) - x(m) < 40) return;
        node.appendChild(svg("line", { class: "dx-micro-grid", x1: x(m).toFixed(1), x2: x(m).toFixed(1),
          y1: padTop, y2: (h - padBottom).toFixed(1) }));
        node.appendChild(svg("text", { class: "dx-micro-axis", x: x(m).toFixed(1), y: h - 4,
          "text-anchor": "middle", text: pad2(Math.floor(m / 60)) + ":00" }));
      });
      node.appendChild(svg("text", { class: "dx-micro-axis", x: padX, y: h - 4, "text-anchor": "start",
        text: snap.sessionOpenLocal || "09:30" }));
      node.appendChild(svg("text", { class: "dx-micro-axis", x: (w - padRight).toFixed(1), y: h - 4,
        "text-anchor": "end", text: snap.sessionCloseLocal || "16:00" }));
      node.appendChild(svg("text", { class: "dx-micro-axis dx-micro-price", x: (w - padRight + 6).toFixed(1),
        y: (y(last) + 3.5).toFixed(1), "text-anchor": "start", text: preis(last) }));
      if (isNum(snap.previousClose) && Math.abs(y(base) - y(last)) > 12) {
        node.appendChild(svg("text", { class: "dx-micro-axis dx-micro-base", x: (w - padRight + 6).toFixed(1),
          y: (y(base) + 3.5).toFixed(1), "text-anchor": "start", text: preis(base) }));
      }
    }
    return node;
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function preis(v) { return (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2)).replace(".", ","); }
  function minutesOf(hhmm) {
    var p = String(hhmm || "").split(":");
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  function beschreibungIntraday(snap, symbol, label) {
    var erster = snap.points[0][0], letzter = snap.points[snap.points.length - 1][0];
    return (symbol ? symbol + ": " : "") + "Tagesverlauf " + datum(snap.sessionDate) + ", " +
           (snap.interval === "5min" ? "5-Minuten-Kurse" : "Intraday-Kurse") + " von " + erster + " bis " + letzter +
           " New Yorker Zeit" + (isNum(snap.previousClose) ? ", Startlinie Vortagesschluss" : ", Startlinie erster Kurs") +
           (label ? " — " + label : "") + " — 5-Minuten-Kurse" +
           ", Stand " + (snap.asOfLocal || snap.asOf || "unbekannt");
  }

  /* ------------------------------------------------------ Renditeleiter */

  var STUFEN = [["return1M", "1M"], ["return3M", "3M"], ["return6M", "6M"], ["return12M", "1J"]];

  function prozent(v) {
    var p = v * 100;
    var s = Math.abs(p) >= 20 ? p.toFixed(0) : p.toFixed(1);
    s = s.replace(".", ",");
    return (p > 0 ? "+" : "") + s + " %";
  }

  /**
   * Zeichnet die Leiter in ein vorhandenes SVG (das Artwork der Karte
   * nutzt das: Lichtschein und Kürzel bleiben, die Linie fällt weg).
   *
   * @param {SVGElement} node  Ziel
   * @param {object} metrics   return1M/3M/6M/12M
   * @param {object} box       {x, y, w, h}
   * @param {object} opt       {values: Werte beschriften, labels: Zeitraum beschriften}
   * @returns {boolean}        ob etwas gezeichnet wurde
   */
  function ladderInto(node, metrics, box, opt) {
    opt = opt || {};
    var m = metrics || {};
    var werte = STUFEN.map(function (s) { return { key: s[0], label: s[1], v: m[s[0]] }; });
    if (!werte.some(function (e) { return isNum(e.v); })) return false;

    /* Schriftgroessen in viewBox-Einheiten: auf grossen Flaechen (Hero,
       Detail) ist der viewBox 640 bis 900 breit, auf der Karte 300 -
       dieselbe Zahl saehe dort dreimal so gross aus. */
    var gross = opt.scale === "hero";
    var fLabel = gross ? 14 : 9.5, fValue = gross ? 20 : 11;
    var labelH = opt.labels === false ? 0 : fLabel + 5;
    var valueH = opt.values ? fValue + 4 : 0;
    var x0 = box.x, y0 = box.y + valueH, w = box.w, h = box.h - labelH - valueH;
    if (h < 16) return false;
    var maxAbs = Math.max(0.10, Math.max.apply(null, werte.map(function (e) { return isNum(e.v) ? Math.abs(e.v) : 0; })));
    /* Die Nulllinie liegt nicht in der Mitte, sondern dort, wo die Werte
       sie hinlegen: bei vier positiven Renditen fast unten, damit die
       Balken Platz haben. */
    var maxPos = Math.max(0, Math.max.apply(null, werte.map(function (e) { return isNum(e.v) ? e.v : 0; })));
    var maxNeg = Math.max(0, -Math.min.apply(null, werte.map(function (e) { return isNum(e.v) ? e.v : 0; })));
    var anteilPos = (maxPos + maxNeg) > 0 ? maxPos / (maxPos + maxNeg) : 1;
    anteilPos = Math.min(0.92, Math.max(0.08, anteilPos));
    var yBase = y0 + h * anteilPos;
    var skala = function (v) { return (Math.abs(v) / maxAbs) * (v >= 0 ? h * anteilPos : h * (1 - anteilPos)); };

    /* Vier Balken, dazwischen Luft: die Balken sollen wie Werte wirken,
       nicht wie eine Flaeche. */
    var luecke = w * 0.11;
    var breite = (w - luecke * 3) / 4;
    var g = svg("g", { class: "dx-ladder" });
    g.appendChild(svg("line", { class: "dx-ladder-base", x1: x0, x2: x0 + w,
                                y1: yBase.toFixed(1), y2: yBase.toFixed(1) }));
    werte.forEach(function (e, i) {
      var bx = x0 + i * (breite + luecke);
      if (!isNum(e.v)) {
        g.appendChild(svg("rect", { class: "dx-ladder-bar dx-ladder-bar--leer", x: bx.toFixed(1),
          y: (yBase - 2).toFixed(1), width: breite.toFixed(1), height: 2 }));
      } else {
        var hh = Math.max(2, skala(e.v));
        var by = e.v >= 0 ? yBase - hh : yBase;
        g.appendChild(svg("rect", {
          class: "dx-ladder-bar " + (e.v > 0 ? "up" : e.v < 0 ? "down" : "flat"),
          x: bx.toFixed(1), y: by.toFixed(1), width: breite.toFixed(1), height: hh.toFixed(1),
          rx: Math.min(4, breite / 4).toFixed(1)
        }));
        if (opt.values) {
          g.appendChild(svg("text", { class: "dx-ladder-val " + (e.v >= 0 ? "up" : "down"),
            "font-size": fValue,
            x: (bx + breite / 2).toFixed(1), y: (e.v >= 0 ? by - 5 : by + hh + fValue).toFixed(1),
            "text-anchor": "middle", text: prozent(e.v) }));
        }
      }
      if (opt.labels !== false) {
        g.appendChild(svg("text", { class: "dx-ladder-label", "font-size": fLabel,
          x: (bx + breite / 2).toFixed(1),
          y: (y0 + h + fLabel + 2).toFixed(1), "text-anchor": "middle", text: e.label }));
      }
    });
    node.appendChild(g);
    return true;
  }

  /** Die Leiter als eigenes Bild (Detailseite, Eingangsflaeche). */
  function ladder(metrics, opt) {
    opt = opt || {};
    var w = opt.width || 300, h = opt.height || 120;
    var node = svg("svg", { class: "dx-ladder-svg", viewBox: "0 0 " + w + " " + h,
                            role: "img", "aria-label": ladderText(metrics, opt.symbol) });
    var titel = svg("title", {});
    titel.textContent = ladderText(metrics, opt.symbol);
    node.appendChild(titel);
    var ok = ladderInto(node, metrics, { x: w * 0.04, y: 4, w: w * 0.92, h: h - 6 },
                        { values: opt.values !== false, labels: true, scale: "hero" });
    return ok ? node : null;
  }

  function ladderText(metrics, symbol) {
    var m = metrics || {};
    var teile = STUFEN.filter(function (s) { return isNum(m[s[0]]); })
      .map(function (s) { return s[1] + " " + prozent(m[s[0]]); });
    return (symbol ? symbol + ": " : "") + "Rendite über 1, 3, 6 und 12 Monate als Balken — " +
           "kein Kursverlauf. " + teile.join(", ");
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.MicroChart = { renderRange: renderRange,
    MODULE_VERSION: MODULE_VERSION, hasSeries: hasSeries, pointsFor: pointsFor,
    render: render, renderIntraday: renderIntraday, ladder: ladder, ladderInto: ladderInto,
    prozent: prozent, RANGE_BARS: RANGE_BARS
  };
})(window);
