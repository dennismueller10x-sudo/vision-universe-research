/* =========================================================================
   VISION UNIVERSE DISCOVER — scoring.js

   Der Market Leadership Score und seine Geschwister.

   "Market Leader" ist im Auftrag ausdruecklich keine subjektive Vergabe
   (§9). Diese Datei ist die Stelle, an der aus dieser Forderung eine Zahl
   wird - und zwar eine, die man nachrechnen kann:

     TRANSPARENT     jede Komponente traegt ihren Beitrag im Ergebnis
     DETERMINISTISCH gleiche Eingabe, gleiche Ausgabe, keine Zufallszahl
     KONFIGURIERBAR  Gewichte stehen in discover/methodology/discover-v1.json
     TESTBAR         die Tests rechnen von Hand nach

   ZWEI ENTSCHEIDUNGEN, DIE HIER WICHTIG SIND

   1. Fehlende Komponenten werden nicht mit 0 bewertet. Eine fehlende
      Volumenkennzahl heisst nicht "kein Volumen", sie heisst "unbekannt".
      Das Gewicht wird herausgerechnet und die Abdeckung mitgeliefert;
      faellt sie unter die Schwelle, gibt es keinen Score, sondern
      INCOMPLETE. Ein Score aus zwei von neun Komponenten sieht aus wie
      einer aus neun - das ist der Fehler, den die Abdeckung verhindert.

   2. Der Score ist absolut (aus festen Schwellen), das Perzentil ist
      relativ (im Universum). Beides zusammen, weil "83 von 100" und
      "Top 3 %" verschiedene Fragen beantworten - und weil ein Perzentil
      allein bei einem schwachen Gesamtmarkt Fuehrerschaft behaupten
      wuerde, wo keine ist.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var ENGINE_VERSION = "discover-scoring-1.0.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /**
   * Normalisiert einen Rohwert auf 0..1 anhand der in der Methodik
   * hinterlegten Spanne. Ausserhalb der Spanne wird geklemmt: ein Titel,
   * der 300 % gestiegen ist, ist nicht dreimal so sehr Marktfuehrer wie
   * einer mit 100 %.
   */
  function transform(component, value) {
    if (!isNum(value)) return null;
    var from = component.from, to = component.to;
    if (!isNum(from) || !isNum(to) || from === to) return null;
    if (component.transform && component.transform !== "linear") {
      throw new Error("discover/scoring: unbekannte Transformation " + component.transform);
    }
    return clamp01((value - from) / (to - from));
  }

  /**
   * @param {object} config  Abschnitt aus discover-v1.json (components, minCoverage)
   * @param {object} metrics flache Kennzahlen {feldname: wert}
   * @returns {object} {score, status, coverage, contributions[], scoreVersion}
   */
  function composite(config, metrics) {
    if (!config || !Array.isArray(config.components)) {
      throw new Error("discover/scoring: Konfiguration ohne components");
    }
    metrics = metrics || {};
    var totalWeight = 0, usedWeight = 0, weighted = 0;
    var contributions = [];

    config.components.forEach(function (c) {
      totalWeight += c.weight;
      var raw = metrics[c.field];
      var normalized = transform(c, raw);
      if (normalized === null) {
        contributions.push({ id: c.id, label: c.label, weight: c.weight, value: null,
                             normalized: null, contribution: null, status: "MISSING" });
        return;
      }
      usedWeight += c.weight;
      weighted += normalized * c.weight;
      contributions.push({ id: c.id, label: c.label, weight: c.weight, value: raw,
                           normalized: round6(normalized),
                           contribution: round6(normalized * c.weight * 100),
                           status: "CALCULATED" });
    });

    var coverage = totalWeight > 0 ? usedWeight / totalWeight : 0;
    var minCoverage = isNum(config.minCoverage) ? config.minCoverage : 0.6;

    if (coverage < minCoverage || usedWeight === 0) {
      return {
        engineVersion: ENGINE_VERSION, scoreVersion: config.scoreVersion || null,
        score: null, status: "INCOMPLETE", coverage: round6(coverage),
        minCoverage: minCoverage, contributions: contributions,
        reason: "Abdeckung " + Math.round(coverage * 100) + " % unter der Schwelle von " +
                Math.round(minCoverage * 100) + " %."
      };
    }

    /* Auf das tatsaechlich verwendete Gewicht normiert - sonst waere ein
       Titel mit einer fehlenden Komponente automatisch schwaecher als ein
       identischer mit vollstaendigen Daten. */
    var score = (weighted / usedWeight) * 100;
    return {
      engineVersion: ENGINE_VERSION, scoreVersion: config.scoreVersion || null,
      score: round6(score), status: "SCORED", coverage: round6(coverage),
      minCoverage: minCoverage, contributions: contributions, reason: null
    };
  }

  /**
   * Trendqualitaet als eine Zahl 0..1 aus der MA-Struktur.
   * Vier Durchschnitte, vier Antworten - und ein kleiner Aufschlag dafuer,
   * dass sie in der richtigen Reihenfolge stehen (20 ueber 50 ueber 200
   * ist ein anderer Zustand als "irgendwie alle unterschritten").
   */
  function trendAlignment(values) {
    values = values || {};
    var flags = ["priceAboveSMA20", "priceAboveSMA50", "priceAboveSMA100", "priceAboveSMA200"];
    var known = 0, positive = 0;
    flags.forEach(function (f) {
      if (typeof values[f] !== "boolean") return;
      known++;
      if (values[f]) positive++;
    });
    if (!known) return null;
    var base = positive / known;
    if (values.aboveAllSMA === true) base = Math.min(1, base + 0.0);
    return base;
  }

  /**
   * Perzentil-Rang innerhalb eines Universums.
   * Gleiche Werte bekommen denselben Rang (Durchschnittsrang), sonst
   * haengt das Ergebnis an der Sortierreihenfolge - und die ist beliebig.
   *
   * @param {number[]} values  nur gueltige Zahlen
   * @returns {function(number): number} 0..100
   */
  function percentileScale(values) {
    var sorted = values.filter(isNum).slice().sort(function (a, b) { return a - b; });
    var n = sorted.length;
    return function (v) {
      if (!isNum(v) || n === 0) return null;
      var lo = lowerBound(sorted, v);
      var hi = upperBound(sorted, v);
      /* Mittelpunkt der Bindungsgruppe: bei n=1 ergibt das 50, nicht 100 -
         "Top 1 %" aus einem Universum von einem Titel waere Unsinn. */
      var rank = (lo + hi) / 2;
      return round6((rank / n) * 100);
    };
  }

  function lowerBound(arr, v) {
    var lo = 0, hi = arr.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] < v) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function upperBound(arr, v) {
    var lo = 0, hi = arr.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] <= v) lo = mid + 1; else hi = mid; }
    return lo;
  }

  /**
   * Breakout-Bewertung. Bewusst keine gewichtete Mischung, sondern eine
   * Bedingung mit Abstufung: ein Ausbruch ohne Volumen ist kein Ausbruch,
   * und ein Volumensprung in einem Abwaertstrend ist eine Kapitulation.
   */
  function breakoutScore(values) {
    values = values || {};
    var spike = values.volumeSpikeRatio;
    var ratio = values.volumeRatio20over60;
    var distance = values.distanceTo52wHigh;
    var aboveShort = values.priceAboveSMA20 === true && values.priceAboveSMA50 === true;
    if (!isNum(spike) && !isNum(ratio)) return { score: null, status: "INCOMPLETE", reason: "Keine Volumenkennzahl." };
    if (!isNum(distance)) return { score: null, status: "INCOMPLETE", reason: "Kein Abstand zum Jahreshoch." };
    if (!aboveShort) return { score: 0, status: "SCORED", reason: "Kurs nicht ueber SMA20 und SMA50." };

    var volumePart = clamp01((((isNum(spike) ? spike : ratio)) - 1.0) / 1.0);   // 1.0x -> 0, 2.0x -> 1
    var proximity = clamp01((distance + 0.15) / 0.15);                         // -15 % -> 0, 0 % -> 1
    var confirmation = values.volumeBreakout === true ? 1 : 0.6;
    return { score: round6(volumePart * 0.5 * 100 * confirmation + proximity * 0.5 * 100 * confirmation),
             status: "SCORED", reason: null };
  }

  function round6(v) { return isNum(v) ? Math.round(v * 1e6) / 1e6 : v; }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION,
    transform: transform, composite: composite, trendAlignment: trendAlignment,
    percentileScale: percentileScale, breakoutScore: breakoutScore
  };

  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.Scoring = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
