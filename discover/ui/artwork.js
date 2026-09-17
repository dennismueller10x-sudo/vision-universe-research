/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/artwork.js

   DATA-DRIVEN STOCK ARTWORK

   Jedes Poster trägt eine visuelle Signatur, die aus den Kennzahlen dieses
   Titels entsteht - und nur daraus. Es gibt hier kein zufälliges Muster,
   keine Textur aus einem Hash, keine Dekoration ohne Bezug. Wer das Bild
   liest, liest Daten:

     KOMPOSITION          woher sie kommt
     ------------------------------------------------------------------
     Verlaufslinie        NUR aus einer ausgelieferten Kursreihe
                          (priceSeries, Status CALCULATED)
     Renditeleiter        sonst: Rendite über 1M, 3M, 6M, 1J als Balken -
                          dieselben Zahlen, aber sichtbar KEIN Verlauf
     Jahresspannen-Leiste distanceTo52wHigh / distanceTo52wLow
     Lichtschein          Position in der Jahresspanne (Ort) und
                          leadershipPercentile (Stärke)
     Hochmarke            new52WeekHigh - Linie am oberen Rand plus Marke
     Tickertypografie     das Kürzel selbst, als Fläche
     Farbwelt             die Kategorie der Reihe (Category Color System)

   WAS HIER NICHT MEHR PASSIERT (V3)

   Die erste Fassung zeichnete für Titel ohne Kursreihe einen rebasierten
   Renditepfad: vier Renditen als Punkte, durch Linien verbunden. Das war
   rechnerisch korrekt - und sah trotzdem aus wie ein Kurschart. Seit V3
   gibt es keine Linie ohne Kursreihe. Wo keine ausgeliefert wird, stehen
   die vier Renditen als Balken (ui/microchart.js, ladderInto), und keine
   Form entsteht aus dem Namen oder dem Zufall: zwei Titel sehen nur dann
   gleich aus, wenn ihre Zahlen gleich sind.
   ========================================================================= */
(function (global) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var ENGINE_VERSION = "discover-artwork-3.0.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function svg(tag, attrs) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined) return;
      if (k === "text") node.textContent = String(attrs[k]);
      else node.setAttribute(k, String(attrs[k]));
    });
    return node;
  }

  /** Position in der Jahresspanne, ausschließlich aus den beiden Abständen. */
  function rangePosition(metrics) {
    var high = metrics.distanceTo52wHigh, low = metrics.distanceTo52wLow;
    if (!isNum(high) || !isNum(low)) return null;
    var ratioHigh = 1 + high, ratioLow = 1 + low;
    if (ratioHigh <= 0 || ratioLow <= 0) return null;
    var lowOverHigh = ratioHigh / ratioLow;
    var span = 1 - lowOverHigh;
    return span > 0 ? clamp((ratioHigh - lowOverHigh) / span, 0, 1) : null;
  }

  /**
   * Die Werte des Verlaufs - und zwar ausschliesslich aus einer
   * ausgelieferten Kursreihe. Gibt es keine, gibt es keinen Verlauf.
   * Der rebasierte Renditepfad (performancePath) wird hier bewusst NICHT
   * mehr gelesen: er ist eine Zahlenreihe, keine Kurve.
   */
  function verlauf(card, range) {
    var MC = global.VUDiscover && global.VUDiscover.MicroChart;
    var ps = card.priceSeries;
    var punkte = MC ? MC.pointsFor(ps, range || (ps && ps.range) || "6M") : null;
    if (ps && ps.status === "CALCULATED" && ps.source && Array.isArray(punkte) && punkte.length >= 5) {
      return { werte: punkte.map(function (p) { return p[1]; }), art: "price",
               range: range || ps.range || "6M", source: ps.source, asOf: ps.asOf };
    }
    /* Aeltere Auslieferungen ohne priceSeries, aber mit Sparkline (Golden
       Five): auch das sind echte Schlusskurse. */
    if (!ps && Array.isArray(card.sparkline) && card.sparkline.filter(isNum).length >= 5) {
      return { werte: card.sparkline, art: "price", range: "1J", source: "technical-instrument", asOf: card.asOf || null };
    }
    return null;
  }

  /**
   * Das Artwork eines Titels.
   *
   * @param {object} card    Contract.toCard- oder toMiniCard-Form
   * @param {object} options {width, height, ticker: boolean, band: boolean,
   *                          scale: "poster"|"hero"|"mini"}
   * @returns {SVGElement}
   */
  function stockArtwork(card, options) {
    options = options || {};
    var w = options.width || 300;
    var h = options.height || 140;
    var m = card.metrics || {};
    var reihe = verlauf(card, options.range);

    var node = svg("svg", {
      class: "dx-art dx-art--" + (options.scale || "poster"),
      viewBox: "0 0 " + w + " " + h, preserveAspectRatio: "none",
      role: "img", "aria-label": beschreibung(card, reihe)
    });

    /* Dieselbe Beschreibung als <title>: sie erscheint als Tooltip, wenn
       jemand auf dem Bild stehen bleibt. Auf Karte und Poster steht keine
       Bildunterschrift - dort waere sie Laerm -, aber die Auskunft, ob man
       eine Kursreihe oder einen rebasierten Renditepfad sieht, darf
       nirgends fehlen. */
    var titel = svg("title", {});
    titel.textContent = beschreibung(card, reihe);
    node.appendChild(titel);

    /* Jede Zeichnung braucht eigene Verlaufs-IDs: zwei Artworks im selben
       Dokument dürfen sich nicht gegenseitig die Füllung überschreiben. */
    var lauf = (stockArtwork.zaehler = (stockArtwork.zaehler || 0) + 1);
    var defs = svg("defs", {});
    node.appendChild(defs);
    var fuellId = "dxf" + lauf;
    var fuell = svg("linearGradient", { id: fuellId, x1: 0, y1: 0, x2: 0, y2: 1 });
    fuell.appendChild(svg("stop", { offset: "0%", "stop-color": "currentColor", "stop-opacity": ".26" }));
    fuell.appendChild(svg("stop", { offset: "62%", "stop-color": "currentColor", "stop-opacity": ".07" }));
    fuell.appendChild(svg("stop", { offset: "100%", "stop-color": "currentColor", "stop-opacity": "0" }));
    defs.appendChild(fuell);

    var werte = reihe ? reihe.werte.filter(isNum) : [];
    var auf = werte.length > 1 ? werte[werte.length - 1] >= werte[0] : true;
    node.setAttribute("data-direction", auf ? "up" : "down");

    /* ------------------------------------------------------ 1 Lichtschein
       Ort: wo der Kurs in seiner Jahresspanne steht. Stärke: wie weit vorn
       der Titel im Universum liegt. Ein Titel am Jahrestief leuchtet links
       und schwach, einer auf dem Hoch rechts und deutlich. */
    var position = rangePosition(m);
    var staerke = isNum(m.leadershipPercentile) ? m.leadershipPercentile / 100
                : isNum(m.leadershipScore) ? m.leadershipScore / 100 : 0.4;
    if (position !== null) {
      var glowId = "dxg" + lauf;
      var grad = svg("radialGradient", { id: glowId, cx: position.toFixed(3), cy: "0.86", r: "0.66" });
      grad.appendChild(svg("stop", { offset: "0%", "stop-color": "currentColor",
                                     "stop-opacity": (0.05 + staerke * 0.14).toFixed(3) }));
      grad.appendChild(svg("stop", { offset: "100%", "stop-color": "currentColor", "stop-opacity": "0" }));
      defs.appendChild(grad);
      node.appendChild(svg("rect", { class: "dx-art-glow", x: 0, y: 0, width: w, height: h,
                                     fill: "url(#" + glowId + ")" }));
    }

    /* -------------------------------------------------- 2 Tickertypografie
       Das Kürzel als Fläche, nicht als Beschriftung. Nur dort, wo Platz
       ist - auf einer kompakten Karte wäre es Lärm. */
    if (options.ticker && card.symbol) {
      node.appendChild(svg("text", {
        class: "dx-art-ticker", x: w * 0.5, y: h * 0.66, "text-anchor": "middle",
        "font-size": Math.round(h * (card.symbol.length > 4 ? 0.44 : 0.56)),
        "aria-hidden": "true", text: card.symbol
      }));
    }

    if (!reihe) {
      /* Keine Kursreihe: die Renditeleiter. Vier Balken, vier Zahlen -
         und sichtbar kein Verlauf. Auf grossen Flaechen mit Werten, auf
         der Karte nur mit den Zeitraeumen; die Karte nennt die Zahl
         ohnehin gross darueber. */
      var MC = global.VUDiscover && global.VUDiscover.MicroChart;
      var gross = options.scale === "hero";
      /* Unten bleibt Platz fuer die Jahresspannen-Leiste (12 Einheiten),
         damit die Zeitraum-Beschriftung nicht in die Marken laeuft. */
      var innen = { x: w * 0.06, y: gross ? h * 0.10 : h * 0.10, w: w * 0.88,
                    h: h - (gross ? h * 0.10 : h * 0.10) - (options.scale === "mini" ? 6 : 14) };
      var ok = MC && MC.ladderInto(node, m, innen, { values: gross, labels: options.scale !== "mini",
                                                    scale: options.scale });
      if (!ok) {
        node.appendChild(svg("text", { class: "dx-art-none", x: w / 2, y: h / 2,
          "text-anchor": "middle", text: "keine Rendite ausgeliefert" }));
      }
      node.setAttribute("data-art", "ladder");
      /* Die Jahresspannen-Leiste bleibt: sie ist ein Zustand, kein Verlauf. */
      leiste(node, position, w, h, padXFor(w), options);
      return node;
    }
    node.setAttribute("data-art", "price");

    /* Geometrie des Verlaufs. */
    var padTop = Math.max(10, h * 0.16), padBottom = Math.max(14, h * 0.2), padX = w * 0.03;
    var lo = Math.min.apply(null, werte), hi = Math.max.apply(null, werte);
    if (lo === hi) { lo -= 1; hi += 1; }
    var spanne = hi - lo;
    lo -= spanne * 0.16; hi += spanne * 0.16;
    var x = function (i) { return padX + (i / (reihe.werte.length - 1)) * (w - padX * 2); };
    var y = function (v) { return h - padBottom - ((v - lo) / (hi - lo)) * (h - padTop - padBottom); };

    /* ------------------------------------------------------ 3 Startlinie
       Der erste Schlusskurs des Zeitraums. Ohne ihn sagt die Form nichts
       darüber, ob der Titel im Zeitraum überhaupt gestiegen ist. Ein
       Schwankungsband gibt es auf dem echten Chart nicht mehr: es gehörte
       zum Renditepfad, und auf einer Kursreihe sähe es aus wie ein
       Indikator. */
    node.appendChild(svg("line", { class: "dx-art-base", x1: 0, x2: w,
      y1: y(werte[0]).toFixed(1), y2: y(werte[0]).toFixed(1) }));

    /* ------------------------------------------------------ 5 Der Verlauf */
    var d = "";
    reihe.werte.forEach(function (v, i) {
      if (!isNum(v)) return;
      d += (d ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1) + " ";
    });
    node.appendChild(svg("path", { class: "dx-art-fill", fill: "url(#" + fuellId + ")",
      d: d + "L" + x(reihe.werte.length - 1).toFixed(1) + " " + h + " L" + x(0).toFixed(1) + " " + h + " Z" }));
    node.appendChild(svg("path", { class: "dx-art-line", d: d.trim() }));

    var letzter = reihe.werte.length - 1;
    node.appendChild(svg("circle", { class: "dx-art-node", cx: x(letzter).toFixed(1),
      cy: y(werte[werte.length - 1]).toFixed(1), r: 2.8 }));

    /* --------------------------------------------------- 6 Hochmarke (§6)
       Nur wenn die Engine ein neues 52-Wochen-Hoch belegt hat. */
    if (card.signals && card.signals.new52WeekHigh) {
      var yTop = padTop * 0.58;
      node.appendChild(svg("line", { class: "dx-art-high", x1: w * 0.74, x2: w - padX,
                                     y1: yTop, y2: yTop }));
      node.appendChild(svg("path", { class: "dx-art-high-mark",
        d: "M" + (w - padX) + " " + (yTop - 3) + " l0 6 l-5 -3 Z" }));
    }

    leiste(node, position, w, h, padX, options);
    return node;
  }

  function padXFor(w) { return w * 0.03; }

  /* ----------------------------------------------- Jahresspannen-Leiste
     Zwölf Marken für das Jahr, die aktuelle Position hervorgehoben. Auf
     kleinen Formaten entfällt sie - eine Leiste, die man nicht lesen
     kann, ist Dekoration. */
  function leiste(node, position, w, h, padX, options) {
    if (position === null || options.scale === "mini") return;
    var marken = 12;
    var yLeiste = h - 6;
    for (var k = 0; k < marken; k++) {
      var px = padX + (k / (marken - 1)) * (w - padX * 2);
      var aktiv = Math.round(position * (marken - 1)) === k;
      node.appendChild(svg("rect", {
        class: "dx-art-tick" + (aktiv ? " on" : ""),
        x: px.toFixed(1), y: aktiv ? yLeiste - 5 : yLeiste - 2,
        width: aktiv ? 2.4 : 1.4, height: aktiv ? 7 : 3, rx: 0.7
      }));
    }
  }

  /** Was ein Screenreader hört. Dieselben Daten, nur als Satz. */
  function beschreibung(card, reihe) {
    var m = card.metrics || {};
    var teile = [card.symbol];
    if (!reihe) teile.push("Rendite über 1, 3, 6 und 12 Monate als Balken, kein Kursverlauf");
    else teile.push("Kursverlauf über " + ({ "1M": "einen Monat", "3M": "drei Monate",
                     "6M": "sechs Monate", "1J": "zwölf Monate" }[reihe.range] || reihe.range) +
                    ", Tagesschlusskurse, Stand " + (reihe.asOf || "unbekannt"));
    if (isNum(m.return12M)) {
      teile.push("zwölf Monate " + (m.return12M >= 0 ? "plus " : "minus ") +
                 Math.abs(m.return12M * 100).toFixed(1) + " Prozent");
    }
    if (isNum(m.distanceTo52wHigh)) {
      teile.push("Abstand zum Jahreshoch " + (m.distanceTo52wHigh * 100).toFixed(1) + " Prozent");
    }
    if (card.signals && card.signals.new52WeekHigh) teile.push("neues 52-Wochen-Hoch");
    return teile.join(", ");
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION,
    stockArtwork: stockArtwork, rangePosition: rangePosition, verlauf: verlauf
  };

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.Artwork = api;
})(window);
