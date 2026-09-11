/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/artwork.js

   DATA-DRIVEN STOCK ARTWORK

   Jedes Poster trägt eine visuelle Signatur, die aus den Kennzahlen dieses
   Titels entsteht - und nur daraus. Es gibt hier kein zufälliges Muster,
   keine Textur aus einem Hash, keine Dekoration ohne Bezug. Wer das Bild
   liest, liest Daten:

     KOMPOSITION          woher sie kommt
     ------------------------------------------------------------------
     Verlaufslinie        Kursreihe, sonst rebasierter Renditepfad
     Schwankungsband      volatility252d, als Hüllkurve um den Verlauf
     Jahresspannen-Leiste distanceTo52wHigh / distanceTo52wLow
     Lichtschein          Position in der Jahresspanne (Ort) und
                          leadershipPercentile (Stärke)
     Hochmarke            new52WeekHigh - Linie am oberen Rand plus Marke
     Tickertypografie     das Kürzel selbst, als Fläche
     Farbwelt             die Kategorie der Reihe (Category Color System)

   WAS HIER NICHT PASSIERT

   Zwischen den Stützstellen des Renditepfades wird nichts erfunden. Das
   Schwankungsband ist eine Hüllkurve aus einer ausgelieferten Kennzahl und
   keine Kursspanne. Und keine Form entsteht aus dem Namen oder dem Zufall:
   zwei Titel sehen nur dann gleich aus, wenn ihre Zahlen gleich sind.
   ========================================================================= */
(function (global) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var ENGINE_VERSION = "discover-artwork-1.0.0";

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
   * Die Punkte des Verlaufs, normiert auf 0..1 (x) und 0..1 (y).
   * Kursreihe, wo eine ausgeliefert wird; sonst der rebasierte Renditepfad.
   */
  function verlauf(card) {
    if (Array.isArray(card.sparkline) && card.sparkline.length > 2) {
      var werte = card.sparkline.filter(isNum);
      if (werte.length < 3) return null;
      return { werte: card.sparkline, art: "price", stuetzstellen: false };
    }
    if (Array.isArray(card.performancePath) && card.performancePath.length > 2) {
      return { werte: card.performancePath.map(function (p) { return p.value; }),
               art: "rebased", stuetzstellen: true,
               labels: card.performancePath.map(function (p) { return p.label; }) };
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
    var reihe = verlauf(card);

    var node = svg("svg", {
      class: "dx-art dx-art--" + (options.scale || "poster"),
      viewBox: "0 0 " + w + " " + h, preserveAspectRatio: "none",
      role: "img", "aria-label": beschreibung(card, reihe)
    });

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
      node.appendChild(svg("text", { class: "dx-art-none", x: w / 2, y: h / 2,
        "text-anchor": "middle", text: "kein Verlauf ausgeliefert" }));
      return node;
    }

    /* Geometrie des Verlaufs. */
    var padTop = Math.max(10, h * 0.16), padBottom = Math.max(14, h * 0.2), padX = w * 0.03;
    var lo = Math.min.apply(null, werte), hi = Math.max.apply(null, werte);
    if (lo === hi) { lo -= 1; hi += 1; }
    var spanne = hi - lo;
    lo -= spanne * 0.16; hi += spanne * 0.16;
    var x = function (i) { return padX + (i / (reihe.werte.length - 1)) * (w - padX * 2); };
    var y = function (v) { return h - padBottom - ((v - lo) / (hi - lo)) * (h - padTop - padBottom); };

    /* --------------------------------------------------- 3 Schwankungsband
       Die Hüllkurve ist keine Kursspanne, sondern die ausgelieferte
       Jahresvolatilität, auf den gezeigten Zeitraum skaliert und um den
       Verlauf gelegt. Ein ruhiger Titel bekommt ein schmales Band, ein
       unruhiger ein weites - das ist der sichtbare Unterschied zwischen
       einem stetigen Marktführer und einem zappeligen Ausbrecher. */
    var vol = m.volatility252d;
    if (options.band !== false && isNum(vol) && vol > 0 && reihe.werte.length > 1) {
      var anteil = clamp(vol / 0.7, 0.03, 1) * 0.34;    // 70 % Jahresvol = ein Drittel der Höhe
      var oben = "", unten = "";
      reihe.werte.forEach(function (v, i) {
        if (!isNum(v)) return;
        /* Das Band wächst zum aktuellen Rand hin - die Unsicherheit über
           den Weg ZWISCHEN zwei Stützstellen ist in der Mitte am größten,
           nicht am Stützpunkt selbst. */
        var naehe = reihe.stuetzstellen
          ? 1 - Math.abs((i / (reihe.werte.length - 1)) * 2 - 1) * 0.55
          : 1;
        var breite = spanne * anteil * naehe;
        oben += (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v + breite).toFixed(1) + " ";
      });
      for (var j = reihe.werte.length - 1; j >= 0; j--) {
        var wert = reihe.werte[j];
        if (!isNum(wert)) continue;
        var naehe2 = reihe.stuetzstellen
          ? 1 - Math.abs((j / (reihe.werte.length - 1)) * 2 - 1) * 0.55 : 1;
        unten += "L" + x(j).toFixed(1) + " " + y(wert - spanne * anteil * naehe2).toFixed(1) + " ";
      }
      node.appendChild(svg("path", { class: "dx-art-band", d: (oben + unten + "Z").trim() }));
    }

    /* ------------------------------------------------------ 4 Nulllinie
       Der Stand vor zwölf Monaten. Ohne ihn sagt die Form nichts darüber,
       ob der Titel überhaupt gestiegen ist. */
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

    /* Stützstellen sichtbar lassen: der Renditepfad hat vier davon und den
       heutigen Stand - das darf die Darstellung nicht verwischen. */
    if (reihe.stuetzstellen) {
      reihe.werte.forEach(function (v, i) {
        if (!isNum(v)) return;
        node.appendChild(svg("circle", { class: "dx-art-node", cx: x(i).toFixed(1),
          cy: y(v).toFixed(1), r: i === reihe.werte.length - 1 ? 3 : 1.8 }));
      });
    } else {
      var letzter = reihe.werte.length - 1;
      node.appendChild(svg("circle", { class: "dx-art-node", cx: x(letzter).toFixed(1),
        cy: y(werte[werte.length - 1]).toFixed(1), r: 2.8 }));
    }

    /* --------------------------------------------------- 6 Hochmarke (§6)
       Nur wenn die Engine ein neues 52-Wochen-Hoch belegt hat. */
    if (card.signals && card.signals.new52WeekHigh) {
      var yTop = padTop * 0.58;
      node.appendChild(svg("line", { class: "dx-art-high", x1: w * 0.74, x2: w - padX,
                                     y1: yTop, y2: yTop }));
      node.appendChild(svg("path", { class: "dx-art-high-mark",
        d: "M" + (w - padX) + " " + (yTop - 3) + " l0 6 l-5 -3 Z" }));
    }

    /* ------------------------------------------- 7 Jahresspannen-Leiste
       Zwölf Marken für das Jahr, die aktuelle Position hervorgehoben. Auf
       kleinen Formaten entfällt sie - eine Leiste, die man nicht lesen
       kann, ist Dekoration. */
    if (position !== null && options.scale !== "mini") {
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
    return node;
  }

  /** Was ein Screenreader hört. Dieselben Daten, nur als Satz. */
  function beschreibung(card, reihe) {
    var m = card.metrics || {};
    var teile = [card.symbol];
    if (!reihe) teile.push("kein Verlauf ausgeliefert");
    else if (reihe.art === "price") teile.push("Kursverlauf der letzten 52 Wochen");
    else teile.push("rebasierter Renditepfad über zwölf Monate");
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
