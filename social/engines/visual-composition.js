/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/visual-composition.js

   AUS DEN DATEN DIESES OBJEKTS WIRD SEIN BILD

   -------------------------------------------------------------------------
   WARUM DAS EINE ENGINE IST UND KEIN TEIL DES RENDERERS
   -------------------------------------------------------------------------

   Der Renderer macht Pixel. Was auf dem Bild STEHT, ist eine Rechnung:
   welcher Punkt der Kursreihe liegt wo, wie breit ist ein Balken bei
   27,35 von 30, welcher Wert ist der groesste im Vergleich. Rechnungen
   gehoeren dorthin, wo man sie pruefen kann.

   Diese Trennung hat einen konkreten Anlass. Die erste gerenderte Karte
   war ein gueltiges JPEG und sagte dreimal dasselbe - der Renderer
   konnte nicht wissen, dass eine Karte etwas AUSSAGEN muss. Er hatte
   nur einen Begriff davon, dass sie gezeichnet werden kann.

   -------------------------------------------------------------------------
   JEDES BILD IST EIN ANDERES
   -------------------------------------------------------------------------

   Es gibt hier keine Bildbibliothek und keine Vorlage mit
   ausgetauschter Zahl. Eine Kursreihe von 270 Punkten ergibt einen
   Pfad, den genau dieses Instrument in genau diesem Zeitraum hat. Sechs
   Score-Beitraege ergeben sechs Balken mit genau diesen Laengen. Zwei
   Content Objects teilen sich kein Bild.

   -------------------------------------------------------------------------
   WAS NICHT GEZEICHNET WIRD
   -------------------------------------------------------------------------

   Eine Komposition, deren Daten nicht reichen, wird NICHT notduerftig
   gefuellt. Ein Chart mit drei Punkten, eine Rangliste mit einem
   Eintrag, ein Score ohne Beitraege: in allen Faellen gibt diese Datei
   einen Befund zurueck und kein Layout. Ein leeres Chart mit
   beschrifteten Achsen ist schlimmer als keines - es sieht nach
   Information aus.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* Die Zeichenflaeche. Gleiche Geometrie wie die bestehende Karte,
     damit beide Formen nebeneinander bestehen koennen. */
  var FLAECHE = { breite: 1080, hoehe: 1350, rand: 88 };

  /* -------------------------------------------------------------------
     MINDESTMENGEN

     Keine gegriffenen Zahlen, sondern jeweils die Menge, unter der die
     Darstellung ihre Aussage verliert.
     ------------------------------------------------------------------- */
  var MINDEST = {
    /* Ein Verlauf braucht genug Punkte, dass die Form etwas zeigt und
       nicht nur zwei Zustaende verbindet. 20 Handelstage ist ein Monat -
       der kuerzeste Zeitraum, ueber den unsere Evidenz ueberhaupt
       spricht (1M-Rendite). */
    punkte: 20,
    /* Ein Vergleich braucht etwas zu vergleichen. */
    vergleichswerte: 2,
    /* Ein zerlegter Score braucht mehr als eine Komponente, sonst ist
       er keine Zerlegung. */
    beitraege: 2
  };

  function zahl(x) {
    var n = typeof x === "number" ? x : parseFloat(String(x).replace(",", "."));
    return isFinite(n) ? n : null;
  }

  function befund(reason, message) {
    return { ok: false, reason: reason, explanation: message };
  }

  /* -------------------------------------------------------------------
     DAS DATUM AUF DEM BILD IST OEFFENTLICHER TEXT

     In den Daten steht "2026-09-11" - das ist die Schreibweise, in der
     Maschinen sortieren. Auf dem Bild liest es ein Mensch, und der
     liest deutsch. Dieselbe Trennung wie zwischen Evidence und Public
     Copy, nur eine Ebene tiefer: die Quelle bleibt unveraendert, die
     Darstellung folgt dem Leser.
     ------------------------------------------------------------------- */
  function datumDe(iso) {
    var t = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    return t ? (t[3] + "." + t[2] + "." + t[1]) : String(iso || "");
  }

  /* ------------------------------------------------------------------ */
  /* CHART — der Verlauf dieses Instruments                             */
  /* ------------------------------------------------------------------ */

  /**
   * `points` ist die Reihe, wie sie in den Quant-Daten steht:
   * [["2025-08-15", 106.49], ...] - Datum und Schlusskurs.
   */
  function chart(spec) {
    spec = spec || {};
    var roh = Array.isArray(spec.points) ? spec.points : [];
    var reihe = [];
    for (var i = 0; i < roh.length; i++) {
      var p = roh[i];
      var wert = Array.isArray(p) ? zahl(p[1]) : zahl(p && p.value);
      var datum = Array.isArray(p) ? p[0] : (p && p.date);
      if (wert === null || !datum) continue;
      reihe.push({ date: String(datum), value: wert });
    }

    if (reihe.length < MINDEST.punkte) {
      return befund("tooFewPoints",
        "Ein Verlauf aus " + reihe.length + " Punkten zeigt keine Form " +
        "(mindestens " + MINDEST.punkte + "). Eine Linie zwischen zwei " +
        "Zustaenden ist kein Chart, sondern eine Behauptung mit Achsen.");
    }

    var werte = reihe.map(function (r) { return r.value; });
    var min = Math.min.apply(null, werte);
    var max = Math.max.apply(null, werte);
    if (max === min) {
      return befund("flatSeries",
        "Alle " + reihe.length + " Werte sind gleich. Ein waagerechter " +
        "Strich braucht kein Bild.");
    }

    /* Die Zeichenflaeche des Charts innerhalb der Karte. Unten bleibt
       Platz fuer Achsenbeschriftung, oben fuer die Aussage. */
    var breite = FLAECHE.breite - 2 * FLAECHE.rand;
    var hoehe = 420;

    /* Ein Polster, damit Hoch- und Tiefpunkt nicht am Rand kleben. Zehn
       Prozent der Spanne - genug, dass die Extrempunkte als Punkte
       lesbar bleiben. */
    var polster = (max - min) * 0.1;
    var unten = min - polster, oben = max + polster;

    var punkte = reihe.map(function (r, idx) {
      return {
        x: (idx / (reihe.length - 1)) * breite,
        y: hoehe - ((r.value - unten) / (oben - unten)) * hoehe,
        date: r.date, value: r.value
      };
    });

    var erster = reihe[0], letzter = reihe[reihe.length - 1];
    var veraenderung = ((letzter.value - erster.value) / erster.value) * 100;

    return {
      ok: true,
      kind: "CHART",
      width: breite, height: hoehe,
      points: punkte,
      path: punkte.map(function (p, i) {
        return (i === 0 ? "M" : "L") + p.x.toFixed(2) + " " + p.y.toFixed(2);
      }).join(" "),
      /* Die Flaeche unter der Linie, geschlossen bis zur Grundlinie. */
      area: punkte.map(function (p, i) {
        return (i === 0 ? "M" : "L") + p.x.toFixed(2) + " " + p.y.toFixed(2);
      }).join(" ") + " L" + breite.toFixed(2) + " " + hoehe + " L0 " + hoehe + " Z",
      domain: { min: min, max: max, first: erster, last: letzter },
      changePercent: veraenderung,
      /* Gestiegen oder gefallen - aus den Daten, nicht aus einer Meinung. */
      direction: veraenderung >= 0 ? "up" : "down",
      labels: { start: datumDe(erster.date), end: datumDe(letzter.date),
        startIso: erster.date, endIso: letzter.date },
      explanation: reihe.length + " Punkte von " + erster.date + " bis " +
        letzter.date + ", " + (veraenderung >= 0 ? "+" : "") +
        veraenderung.toFixed(1) + " %."
    };
  }

  /* ------------------------------------------------------------------ */
  /* SCORE — woraus sich der Wert zusammensetzt                         */
  /* ------------------------------------------------------------------ */

  /**
   * `contributions`: [{ label, value, max }]. Die Balkenlaenge ist der
   * ANTEIL am eigenen Maximum, nicht der Rohwert - sonst waere ein
   * Beitrag von 27 aus 30 kuerzer als einer von 8 aus 10 laenger
   * aussehend, und das Bild sagte etwas Falsches.
   */
  function score(spec) {
    spec = spec || {};
    var roh = Array.isArray(spec.contributions) ? spec.contributions : [];
    var teile = [];
    roh.forEach(function (c) {
      var wert = zahl(c && c.value), max = zahl(c && c.max);
      if (wert === null || max === null || max <= 0) return;
      teile.push({ label: String(c.label || ""), value: wert, max: max,
        share: wert / max });
    });

    if (teile.length < MINDEST.beitraege) {
      return befund("tooFewContributions",
        "Ein Score aus " + teile.length + " Beitrag/Beitraegen ist keine " +
        "Zerlegung (mindestens " + MINDEST.beitraege + ").");
    }

    var gesamt = zahl(spec.total), gesamtMax = zahl(spec.totalMax);
    var leitAnteil = (gesamt !== null && gesamtMax) ? gesamt / gesamtMax : null;

    var breite = FLAECHE.breite - 2 * FLAECHE.rand;
    return {
      ok: true,
      kind: "SCORE",
      width: breite,
      total: gesamt, totalMax: gesamtMax, totalShare: leitAnteil,
      bars: teile.map(function (t) {
        return {
          label: t.label, value: t.value, max: t.max, share: t.share,
          pixels: t.share * breite,
          /* Zieht dieser Beitrag nach oben oder bremst er? Gemessen am
             Leitwert selbst - dieselbe Regel wie in story-selection.js,
             damit Bild und Text dieselbe Geschichte erzaehlen. */
          above: leitAnteil === null ? null : t.share > leitAnteil
        };
      }),
      explanation: teile.length + " Beitraege" +
        (leitAnteil !== null
          ? ", Leitwert " + Math.round(leitAnteil * 100) + " %" : "") + "."
    };
  }

  /* ------------------------------------------------------------------ */
  /* PERFORMANCE — Entwicklungen ueber die gemessenen Horizonte          */
  /* ------------------------------------------------------------------ */

  function performance(spec) {
    spec = spec || {};
    var roh = Array.isArray(spec.returns) ? spec.returns : [];
    var werte = [];
    roh.forEach(function (r) {
      var v = zahl(r && r.value);
      if (v === null) return;
      werte.push({ label: String(r.label || ""), value: v });
    });

    if (!werte.length) {
      return befund("noReturns", "Keine Entwicklungen vorhanden.");
    }

    /* Die Skala umfasst null, sonst zeigten negative und positive
       Balken in dieselbe Richtung. */
    var alle = werte.map(function (w) { return w.value; }).concat([0]);
    var min = Math.min.apply(null, alle), max = Math.max.apply(null, alle);
    var spanne = max - min;
    var breite = FLAECHE.breite - 2 * FLAECHE.rand;
    var nullX = spanne === 0 ? 0 : ((0 - min) / spanne) * breite;

    return {
      ok: true,
      kind: "PERFORMANCE",
      width: breite, zeroX: nullX,
      bars: werte.map(function (w) {
        var x = spanne === 0 ? nullX : ((w.value - min) / spanne) * breite;
        return { label: w.label, value: w.value,
          from: Math.min(nullX, x), to: Math.max(nullX, x),
          pixels: Math.abs(x - nullX),
          positive: w.value >= 0 };
      }),
      domain: { min: min, max: max },
      explanation: werte.length + " Horizonte von " + min.toFixed(1) +
        " % bis " + max.toFixed(1) + " %."
    };
  }

  /* ------------------------------------------------------------------ */
  /* COMPARISON / RANKING — dieses Objekt in seiner Gruppe               */
  /* ------------------------------------------------------------------ */

  function comparison(spec) {
    spec = spec || {};
    var roh = Array.isArray(spec.peers) ? spec.peers : [];
    var werte = [];
    roh.forEach(function (p) {
      var v = zahl(p && p.value);
      if (v === null || !p.label) return;
      werte.push({ label: String(p.label), value: v,
        /* Die Schreibweise der Quelle, wenn sie eine hat. Sie wird hier
           nur DURCHGEREICHT - diese Datei rechnet, sie textet nicht. */
        anzeige: (typeof p.anzeige === "string" && p.anzeige.trim())
          ? p.anzeige.trim() : null,
        highlight: !!p.highlight });
    });

    if (werte.length < MINDEST.vergleichswerte) {
      return befund("tooFewPeers",
        "Ein Vergleich braucht mindestens " + MINDEST.vergleichswerte +
        " Werte, vorhanden sind " + werte.length + ".");
    }

    werte.sort(function (a, b) { return b.value - a.value; });
    var max = werte[0].value;
    if (max <= 0) {
      return befund("noPositiveScale",
        "Ohne positiven Hoechstwert gibt es keine Balkenskala.");
    }

    var breite = FLAECHE.breite - 2 * FLAECHE.rand;
    return {
      ok: true,
      kind: "COMPARISON",
      width: breite,
      /* Die Einheit gehoert zur Achse, nicht zum einzelnen Balken:
         zwei Werte auf einer Achse haben dieselbe. Sie steht hier,
         damit der Satz unter der Grafik den Abstand benennen kann,
         ohne sich eine Einheit auszudenken. */
      einheit: (typeof spec.einheit === "string" && spec.einheit.trim())
        ? spec.einheit.trim() : null,
      bars: werte.map(function (w, i) {
        return { label: w.label, value: w.value, anzeige: w.anzeige,
          rank: i + 1,
          pixels: (w.value / max) * breite, highlight: w.highlight };
      }),
      highlightRank: (werte.filter(function (w) { return w.highlight; })[0] || {}).label
        ? werte.findIndex(function (w) { return w.highlight; }) + 1 : null,
      explanation: werte.length + " Werte, Hoechstwert " + max + "."
    };
  }

  /* -------------------------------------------------------------------
     DIE AUSSAGE DER GRAFIK

     Eine Grafik braucht einen Satz ueber SICH. Der erste Versuch setzte
     den Hook darueber - und dann stand "65,3 Technical Opportunity
     Score" ueber einer Kurskurve: zwei Aussagen auf einer Flaeche, und
     der Betrachter muss raten, welche gilt.

     Der Satz wird aus der Komposition GERECHNET und nicht getextet.
     Jede Zahl darin steht schon in den Daten.
     ------------------------------------------------------------------- */
  /* Schmales geschuetztes Leerzeichen vor dem Prozentzeichen. Ohne das
     bricht "43,5 %" um, und auf der naechsten Zeile steht ein einsames
     Prozentzeichen. */
  var NBSP = "\u202F";

  /* Wie viele Nachkommastellen die Werte einer Achse WIRKLICH haben.
     Nicht geraten und nicht fest gesetzt: 21,6 und 13,4 haben eine,
     27,35 hat zwei, 8 hat keine. Gedeckelt bei zwei - mehr traegt
     eine Balkenbeschriftung nicht. */
  function stellenAus(werte) {
    var max = 0;
    (werte || []).forEach(function (w) {
      var s = String(w && w.value !== undefined ? w.value : w);
      var punkt = s.indexOf(".");
      if (punkt >= 0) max = Math.max(max, Math.min(s.length - punkt - 1, 2));
    });
    return max;
  }

  function wertDe(x, stellen) {
    return Number(x).toFixed(stellen === undefined ? 1 : stellen).replace(".", ",");
  }

  function prozentDe(x, stellen) {
    var s = Math.abs(x).toFixed(stellen === undefined ? 1 : stellen).replace(".", ",");
    return (x >= 0 ? "+" : "\u2212") + s + NBSP + "%";
  }

  /**
   * `entitaet` steht bereits als Zeile UEBER der Aussage. Sie hier zu
   * wiederholen ergaebe "AAPL / AAPL seit ..." - dieselbe Redundanz,
   * die visual-quality.js an der ersten Karte gefunden hat: dreimal
   * dasselbe, technisch einwandfrei, inhaltlich leer.
   */
  function aussage(k, entitaet) {
    if (!k || !k.ok) return null;
    switch (k.kind) {
      case "CHART":
        return "Seit " + k.labels.start + ": " + prozentDe(k.changePercent) + ".";
      case "SCORE":
        return k.total !== null
          ? "Woraus sich " + String(k.total).replace(".", ",") + " von " +
            k.totalMax + " zusammensetzen."
          : "Woraus sich der Wert zusammensetzt.";
      case "PERFORMANCE":
        return "Entwicklung ueber " + k.bars.length + " gemessene Horizonte.";
      case "COMPARISON": {
        /* -------------------------------------------------------------
           "RANG 2 VON 2 IN DIESEM LAUF."

           So stand es unter der fertigen Grafik. Zwei Maengel in einem
           Satz: "in diesem Lauf" ist ein Begriff aus unserer Maschine
           und sagt dem Leser nichts, und ein Rang unter ZWEI Werten
           ist keine Information - er sagt nur, dass einer der beiden
           der kleinere ist, was die Balken schon zeigen.

           Bei zwei Werten ist der ABSTAND die Aussage. Er steht in
           keiner Beschriftung, also fuegt er etwas hinzu. Ab drei
           Werten traegt die Rangfolge wieder, und sie wird dann so
           benannt, wie ein Leser sie liest - im Vergleich, nicht in
           einem Lauf.
           ------------------------------------------------------------- */
        var stellen = stellenAus(k.bars);
        if (k.bars.length === 2) {
          var vorn = k.bars[0], hinten = k.bars[1];
          var abstand = wertDe(Math.abs(vorn.value - hinten.value), stellen);
          var mass = k.einheit
            ? abstand + (k.einheit === "%" ? NBSP : " ") + k.einheit
            : "um " + abstand;
          return vorn.label + " liegt " + mass + " vor " + hinten.label + ".";
        }
        var eigener = k.bars.filter(function (b) { return b.highlight; })[0];
        return eigener
          ? eigener.label + " auf Rang " + eigener.rank + " von " +
            k.bars.length + " im Vergleich."
          : "Die Rangfolge im Vergleich.";
      }
      default: return null;
    }
  }

  /** Die Komposition zu einer Strategie. Unbekannt heisst unbekannt. */
  function compose(strategy, spec) {
    switch (String(strategy || "")) {
      case "CHART": return chart(spec);
      case "SCORE": return score(spec);
      case "PERFORMANCE": return performance(spec);
      case "COMPARISON":
      case "RANKING": return comparison(spec);
      default:
        return befund("unsupportedStrategy",
          "Fuer " + strategy + " gibt es hier keine Komposition. Das ist " +
          "kein Fehler - es heisst, dass eine andere Stelle zustaendig ist.");
    }
  }

  var api = {
    FLAECHE: FLAECHE, MINDEST: MINDEST,
    datumDe: datumDe,
    aussage: aussage, prozentDe: prozentDe, wertDe: wertDe,
    stellenAus: stellenAus,
    chart: chart, score: score, performance: performance,
    comparison: comparison, compose: compose
  };

  if (isNode) module.exports = api;
  else global.VUSocialVisualComposition = api;
})(typeof window !== "undefined" ? window : globalThis);
