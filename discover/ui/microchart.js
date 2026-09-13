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
  var MODULE_VERSION = "discover-microchart-1.0.0";

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
           " — Quelle " + ps.source + ", Stand " + (ps.asOf || "unbekannt");
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
  global.VUDiscover.MicroChart = {
    MODULE_VERSION: MODULE_VERSION, hasSeries: hasSeries, pointsFor: pointsFor,
    render: render, ladder: ladder, ladderInto: ladderInto, prozent: prozent, RANGE_BARS: RANGE_BARS
  };
})(window);
