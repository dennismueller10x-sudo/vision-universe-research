/* =========================================================================
   VISION UNIVERSE QUANT 2.0 — RETURN BASIS COMPARISON v1

   Rechnet dieselben Momentumgroessen zweimal - einmal auf der
   splitbereinigten Kursreihe, einmal auf der Gesamtrenditereihe - und
   misst, was sich dazwischen bewegt.

   WARUM RANGVERGLEICH UND NICHT WERTVERGLEICH

   Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil:
   der Titel steht im obersten Zehntel oder er steht es nicht. Dass die
   Gesamtrendite eines Dividendenzahlers ueber zwoelf Monate um zwei
   Punkte hoeher liegt, aendert fuer sich genommen nichts. Es aendert
   etwas, wenn dadurch andere Titel an ihm vorbeiziehen. Deshalb sind
   RANK_DELTA und PERCENTILE_DELTA die eigentliche Messung und der
   Wertunterschied nur der Zwischenschritt.

   WARUM NUR TITEL MIT BEIDEN REIHEN GEZAEHLT WERDEN

   Ein Perzentil ist eine Aussage ueber ein Feld. Wenn Basis A ueber 6.000
   Titel rankt und Basis B ueber 5.800, dann unterscheiden sich die
   Raenge schon deshalb, weil die Felder verschieden gross sind - und der
   gemessene Unterschied waere ein Artefakt der Abdeckung, nicht der
   Methodik. Das Vergleichsfeld ist deshalb die Schnittmenge, und seine
   Groesse steht als UNIVERSE_N im Ergebnis.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var ENGINE_VERSION = "vu-return-basis-comparison-1.0.0";

  /* Dieselben Fenster wie market-factors.js. Bewusst wiederholt statt
     importiert - market-factors laeuft hier nicht mit -, und ein Test
     haelt die Uebereinstimmung fest. */
  var WINDOWS = { "3M": 63, "6M": 126, "12M": 252 };
  var EX_MONTH = 21;
  var YEAR = 252;

  var MEASURES = ["3M", "6M", "12M", "12M-1M", "RELATIVE_STRENGTH"];

  function finite(v) { return typeof v === "number" && Number.isFinite(v); }

  /**
   * Die fuenf Momentumgroessen an einem Index der Reihe.
   *
   * `series` ist eine der beiden Return-Reihen, `benchIndex` der letzte
   * Benchmarktag, der am Stichtag dieses Titels bekannt war - nie ein
   * spaeterer, sonst waere es Future Leakage.
   */
  function momentumAt(series, i, bench, benchIndex) {
    var out = {};
    Object.keys(WINDOWS).forEach(function (h) {
      var w = WINDOWS[h];
      out[h] = (i - w >= 0 && finite(series[i]) && finite(series[i - w]) && series[i - w] > 0)
        ? series[i] / series[i - w] - 1 : null;
    });
    out["12M-1M"] = (i - YEAR >= 0 && finite(series[i - EX_MONTH]) &&
                     finite(series[i - YEAR]) && series[i - YEAR] > 0)
      ? series[i - EX_MONTH] / series[i - YEAR] - 1 : null;

    /* Relative Staerke: Differenz der Log-Renditen ueber zwoelf Monate,
       dieselbe Definition wie relative-strength-engine.js. Die Benchmark
       traegt dieselbe Basis wie der Titel - eine Gesamtrenditereihe gegen
       einen Kursindex zu halten waere ein Vergleich zweier Massstaebe. */
    out.RELATIVE_STRENGTH = null;
    if (bench && benchIndex >= YEAR && i - YEAR >= 0 &&
        finite(series[i]) && finite(series[i - YEAR]) && series[i - YEAR] > 0 &&
        finite(bench[benchIndex]) && finite(bench[benchIndex - YEAR]) && bench[benchIndex - YEAR] > 0) {
      out.RELATIVE_STRENGTH = Math.log(series[i] / series[i - YEAR]) -
                              Math.log(bench[benchIndex] / bench[benchIndex - YEAR]);
    }

    /* Dasselbe ueber das 12-1-Fenster. Die Produktion rechnet ihre
       Momentumkomponente relativeStrength12m1m genau so; die volle
       Zwoelfmonatsreihe daneben ist eine andere Groesse und steht hier
       nur, weil der Auditauftrag "Relative Strength" als eigene
       Messgroesse nennt. Beide auszuweisen ist billiger, als spaeter zu
       raten, welche gemeint war. */
    out.RELATIVE_STRENGTH_12M_1M = null;
    if (bench && benchIndex >= YEAR && i - YEAR >= 0 &&
        finite(series[i - EX_MONTH]) && finite(series[i - YEAR]) && series[i - YEAR] > 0 &&
        finite(bench[benchIndex - EX_MONTH]) && finite(bench[benchIndex - YEAR]) &&
        bench[benchIndex - YEAR] > 0) {
      out.RELATIVE_STRENGTH_12M_1M = Math.log(series[i - EX_MONTH] / series[i - YEAR]) -
                                     Math.log(bench[benchIndex - EX_MONTH] / bench[benchIndex - YEAR]);
    }
    return out;
  }

  /**
   * Raenge und Perzentile ueber ein Feld von Werten.
   *
   * Gleiche Werte bekommen denselben Rang (Durchschnittsrang), sonst
   * erzeugte die Sortierreihenfolge einen Unterschied, den es in den
   * Daten nicht gibt. Rang 1 ist der hoechste Wert; Perzentil 100 ist
   * das obere Ende, weil das Produkt so herum liest.
   */
  function rankField(values) {
    var order = values
      .map(function (v, idx) { return { idx: idx, v: v }; })
      .filter(function (e) { return finite(e.v); })
      .sort(function (a, b) { return b.v - a.v; });

    var ranks = new Array(values.length).fill(null);
    var pct = new Array(values.length).fill(null);
    var n = order.length;
    var i = 0;
    while (i < n) {
      var j = i;
      while (j + 1 < n && order[j + 1].v === order[i].v) j++;
      var shared = (i + j) / 2 + 1;
      for (var k = i; k <= j; k++) {
        ranks[order[k].idx] = shared;
        pct[order[k].idx] = n > 1 ? (n - shared) / (n - 1) * 100 : 100;
      }
      i = j + 1;
    }
    return { ranks: ranks, percentiles: pct, n: n };
  }

  function spearman(rankA, rankB) {
    var pairs = [];
    for (var i = 0; i < rankA.length; i++) {
      if (finite(rankA[i]) && finite(rankB[i])) pairs.push([rankA[i], rankB[i]]);
    }
    var n = pairs.length;
    if (n < 3) return null;
    var ma = 0, mb = 0;
    pairs.forEach(function (p) { ma += p[0]; mb += p[1]; });
    ma /= n; mb /= n;
    var num = 0, da = 0, db = 0;
    pairs.forEach(function (p) {
      var x = p[0] - ma, y = p[1] - mb;
      num += x * y; da += x * x; db += y * y;
    });
    if (da <= 0 || db <= 0) return null;
    return num / Math.sqrt(da * db);
  }

  function quantile(sorted, q) {
    if (!sorted.length) return null;
    var pos = (sorted.length - 1) * q;
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  /**
   * Die Verteilung der Rangverschiebung. Der Owner hat ausdruecklich
   * verlangt, nicht aus Durchschnittswerten zu schliessen: ein Median
   * von null Raengen und ein P95 von vierhundert sind gleichzeitig wahr,
   * und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten
   * Dezil faellt.
   */
  function shiftStatistics(a, b) {
    var rankDeltas = [], pctDeltas = [];
    for (var i = 0; i < a.ranks.length; i++) {
      if (!finite(a.ranks[i]) || !finite(b.ranks[i])) continue;
      rankDeltas.push(Math.abs(a.ranks[i] - b.ranks[i]));
      pctDeltas.push(Math.abs(a.percentiles[i] - b.percentiles[i]));
    }
    var sortedRank = rankDeltas.slice().sort(function (x, y) { return x - y; });
    return {
      UNIVERSE_N: rankDeltas.length,
      SPEARMAN_RANK_CORRELATION: spearman(a.ranks, b.ranks),
      MEDIAN_ABSOLUTE_RANK_CHANGE: quantile(sortedRank, 0.5),
      P90_RANK_CHANGE: quantile(sortedRank, 0.9),
      P95_RANK_CHANGE: quantile(sortedRank, 0.95),
      MAX_RANK_CHANGE: sortedRank.length ? sortedRank[sortedRank.length - 1] : null,
      TITLES_MOVING_1_PERCENTILE: pctDeltas.filter(function (d) { return d >= 1; }).length,
      TITLES_MOVING_5_PERCENTILES: pctDeltas.filter(function (d) { return d >= 5; }).length,
      TITLES_MOVING_10_PERCENTILES: pctDeltas.filter(function (d) { return d >= 10; }).length
    };
  }

  /**
   * Wer war im obersten Dezil und ist es auf der anderen Basis nicht
   * mehr? Das ist die Groesse, die eine Strategie wirklich trifft -
   * ein Momentum-Screener nimmt die oberen zehn Prozent, und wer dort
   * herausfaellt, steht nicht mehr auf der Liste.
   */
  function decileChurn(a, b) {
    var inA = [], inB = [];
    for (var i = 0; i < a.percentiles.length; i++) {
      if (finite(a.percentiles[i]) && a.percentiles[i] >= 90) inA.push(i);
      if (finite(b.percentiles[i]) && b.percentiles[i] >= 90) inB.push(i);
    }
    var setB = new Set(inB);
    var setA = new Set(inA);
    return {
      TOP_DECILE_A: inA.length,
      TOP_DECILE_B: inB.length,
      LEAVING: inA.filter(function (i) { return !setB.has(i); }).length,
      ENTERING: inB.filter(function (i) { return !setA.has(i); }).length,
      leavingIndices: inA.filter(function (i) { return !setB.has(i); }),
      enteringIndices: inB.filter(function (i) { return !setA.has(i); })
    };
  }

  /**
   * Segmentierte Auswertung - nach Dividendenrendite, nach Sektor. Die
   * Gruppen kommen von aussen, weil die Engine nicht entscheidet, was
   * "hohe Rendite" heisst; sie rechnet nur, was in der Gruppe passiert.
   */
  function segmentStatistics(groups, a, b) {
    var out = {};
    Object.keys(groups).forEach(function (key) {
      var idx = groups[key];
      var momentumDelta = [], rankDelta = [], pctDelta = [];
      idx.forEach(function (i) {
        if (finite(a.values[i]) && finite(b.values[i])) momentumDelta.push(b.values[i] - a.values[i]);
        if (finite(a.ranks[i]) && finite(b.ranks[i])) rankDelta.push(b.ranks[i] - a.ranks[i]);
        if (finite(a.percentiles[i]) && finite(b.percentiles[i])) pctDelta.push(b.percentiles[i] - a.percentiles[i]);
      });
      function median(arr) {
        var s = arr.slice().sort(function (x, y) { return x - y; });
        return quantile(s, 0.5);
      }
      out[key] = {
        N: idx.length,
        MOMENTUM_DELTA_MEDIAN: median(momentumDelta),
        RANK_DELTA_MEDIAN: median(rankDelta),
        FACTOR_PERCENTILE_DELTA_MEDIAN: median(pctDelta),
        FACTOR_PERCENTILE_DELTA_P95: quantile(pctDelta.map(Math.abs).sort(function (x, y) { return x - y; }), 0.95)
      };
    });
    return out;
  }

  /* Die sechs Komponenten der Momentumnote und ihre Gewichte, wie sie in
     quant/data/product/factor-evidence-v1 veroeffentlicht sind. Sie
     stehen hier, damit die Simulation nicht ihre eigene Gewichtung
     erfindet und ein Test die Uebereinstimmung mit den
     veroeffentlichten componentSpecs festhalten kann.

     Die Schluessel sind die Komponenten-Ids der Produktion; woraus jede
     hier gerechnet wird, entscheidet das Studienskript. */
  var PRODUCTION_MOMENTUM_WEIGHTS = {
    totalReturn12m1m: 0.30,
    totalReturn6m: 0.20,
    totalReturn3m: 0.10,
    relativeStrength12m1m: 0.20,
    distanceTo52wHigh: 0.10,
    distanceToSma200: 0.10
  };

  /* Welche Messgroesse dieser Studie welche Produktionskomponente
     nachbaut. */
  var COMPONENT_SOURCE = {
    totalReturn12m1m: "12M-1M",
    totalReturn6m: "6M",
    totalReturn3m: "3M",
    relativeStrength12m1m: "RELATIVE_STRENGTH_12M_1M",
    distanceTo52wHigh: "distanceTo52wHigh",
    distanceToSma200: "distanceToSma200"
  };

  /* Bei dieser Komponente ist der kleinere Wert der bessere. */
  var LOWER_IS_BETTER = ["distanceTo52wHigh"];

  var api = {
    ENGINE_VERSION: ENGINE_VERSION,
    WINDOWS: WINDOWS,
    PRODUCTION_MOMENTUM_WEIGHTS: PRODUCTION_MOMENTUM_WEIGHTS,
    COMPONENT_SOURCE: COMPONENT_SOURCE,
    LOWER_IS_BETTER: LOWER_IS_BETTER,
    MEASURES: MEASURES,
    momentumAt: momentumAt,
    rankField: rankField,
    spearman: spearman,
    quantile: quantile,
    shiftStatistics: shiftStatistics,
    decileChurn: decileChurn,
    segmentStatistics: segmentStatistics
  };

  if (isNode) module.exports = api;
  else global.VUReturnBasisComparison = api;
})(typeof window !== "undefined" ? window : globalThis);
