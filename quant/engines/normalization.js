/* =========================================================================
   VISION UNIVERSE QUANT — normalization.js
   SCORE-NORMALISIERUNG (§17, §18, §21)

   Pipeline:

       Raw Metric
          |
       Validation          nicht endliche Werte werden zu null, nicht zu 0
          |
       Outlier Handling    Winsorization an den Konfigurationsgrenzen
          |
       Peer Normalization  Industry -> Sector -> Universe
          |
       Percentile / Robust Z-Score
          |
       Factor Score
          |
       Composite Score

   Zwei bewusste Entscheidungen:

   1. Fuer den Nutzer sichtbar ist das PERZENTIL, nicht der Z-Score.
      "Quality 94" heisst: besser als 94 % der Vergleichsgruppe. Es heisst
      NICHT "94 % Wahrscheinlichkeit auf steigende Kurse".

   2. Fehlende Werte bekommen KEIN Ersatzperzentil. Ein fehlender Wert ist
      fehlend und schlaegt auf die Coverage durch (§21). Er wird niemals
      als 50 (neutral) behandelt.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  /** Nicht endliche Werte werden zu null — kein stiller Ersatz durch 0. */
  function validateValue(v) { return isNum(v) ? v : null; }

  function sortedNumbers(values) {
    var out = [];
    for (var i = 0; i < values.length; i++) if (isNum(values[i])) out.push(values[i]);
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  /** Perzentilschwelle einer bereits sortierten Zahlenliste (lineare Interpolation). */
  function quantile(sorted, p) {
    if (!sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    var idx = (p / 100) * (sorted.length - 1);
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  /**
   * Winsorization: Extremwerte werden auf die Grenzen gestutzt statt
   * entfernt. Ein einzelner Ausreisser (etwa ein ROIC von 4000 % nach einer
   * Sonderbuchung) darf weder die Verteilung noch einen Mittelwert kippen.
   */
  function winsorize(values, lowerPct, upperPct) {
    var sorted = sortedNumbers(values);
    if (sorted.length < 5) return values.slice();
    var lo = quantile(sorted, lowerPct);
    var hi = quantile(sorted, upperPct);
    return values.map(function (v) {
      if (!isNum(v)) return null;
      return Math.min(hi, Math.max(lo, v));
    });
  }

  /**
   * Perzentilraenge 0..100 fuer eine Werteliste.
   * Ties erhalten denselben mittleren Rang. higherIsBetter === false dreht
   * die Skala, sodass 100 immer "gut" bedeutet (niedrige Volatilitaet,
   * niedrige Verschuldung, niedriges EV/EBITDA).
   */
  function percentileRanks(values, higherIsBetter) {
    var n = values.length;
    var out = new Array(n).fill(null);
    var items = [];
    for (var i = 0; i < n; i++) if (isNum(values[i])) items.push({ i: i, v: values[i] });
    var m = items.length;
    if (m === 0) return out;
    if (m === 1) { out[items[0].i] = 50; return out; }

    items.sort(function (a, b) { return a.v - b.v; });

    var k = 0;
    while (k < m) {
      var j = k;
      while (j + 1 < m && items[j + 1].v === items[k].v) j++;
      /* Mittlerer Rang der Bindungsgruppe, auf 0..100 abgebildet. */
      var meanRank = (k + j) / 2;
      var pct = (meanRank / (m - 1)) * 100;
      for (var t = k; t <= j; t++) {
        out[items[t].i] = higherIsBetter === false ? 100 - pct : pct;
      }
      k = j + 1;
    }
    return out;
  }

  function median(values) {
    var s = sortedNumbers(values);
    if (!s.length) return null;
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  /** Median Absolute Deviation — robuster Streuungsmassstab. */
  function mad(values, med) {
    var m = med === undefined ? median(values) : med;
    if (m === null) return null;
    var devs = [];
    for (var i = 0; i < values.length; i++) if (isNum(values[i])) devs.push(Math.abs(values[i] - m));
    return median(devs);
  }

  /**
   * Robuster Z-Score auf Median/MAD statt Mittelwert/Standardabweichung.
   * Wird intern verwendet und in der Methodik ausgewiesen; die UI zeigt
   * das Perzentil, weil es fuer Anleger verstaendlicher ist.
   */
  function robustZScores(values, higherIsBetter) {
    var med = median(values);
    var scale = mad(values, med);
    var n = values.length;
    var out = new Array(n).fill(null);
    if (med === null || !scale) return out;
    var norm = 1.4826 * scale;   // MAD -> vergleichbar zur Standardabweichung
    for (var i = 0; i < n; i++) {
      if (!isNum(values[i])) continue;
      var z = (values[i] - med) / norm;
      out[i] = higherIsBetter === false ? -z : z;
    }
    return out;
  }

  /**
   * Peer-Normalisierung (§18).
   *
   * V1: 70 % Perzentil in der Peer Group, 30 % Perzentil im Gesamtuniversum.
   * Damit wird ein Softwareunternehmen nicht an den Margen einer Bank
   * gemessen — und zugleich entsteht nicht automatisch in jeder objektiv
   * schwachen Branche ein "Top Pick".
   *
   * Fallback-Kette bei zu kleiner Peer Group: Industry -> Sector -> Universe.
   *
   * @param {Array}  rows           beliebige Objekte
   * @param {string} metricId
   * @param {Function} getValue     row -> number|null
   * @param {object} config         normalization-Block aus quant-v1.json
   * @param {object} groupKeys      {industry: row->string, sector: row->string}
   * @param {boolean} higherIsBetter
   * @returns {Array<{percentile, peerPercentile, universePercentile, robustZ, peerGroup, raw, winsorized}>}
   */
  function peerNormalize(rows, getValue, config, groupKeys, higherIsBetter, options) {
    options = options || {};
    var n = rows.length;
    var raw = rows.map(function (r) { return validateValue(getValue(r)); });

    var w = config.winsorization;
    var winsorized = winsorize(raw, w.lowerPercentile, w.upperPercentile);

    var universePct = percentileRanks(winsorized, higherIsBetter);
    /* Der robuste Z-Score wird nur fuer die Anzeige gebraucht. In einem
       Backtest mit 250 Rebalancing-Terminen kosten die zusaetzlichen
       Median-/MAD-Sortierungen mehr als der Rest der Normalisierung. */
    var universeZ = options.robustZ === false ? null : robustZScores(winsorized, higherIsBetter);

    /* Gruppenindizes je Ebene der Fallback-Kette aufbauen. */
    var levels = config.peerFallbackChain;
    var groups = {};
    levels.forEach(function (level) {
      if (level === "universe") return;
      var g = Object.create(null);
      for (var i = 0; i < n; i++) {
        var key = groupKeys[level] ? groupKeys[level](rows[i]) : null;
        if (key === null || key === undefined) continue;
        (g[key] || (g[key] = [])).push(i);
      }
      groups[level] = g;
    });

    /* Perzentile innerhalb jeder ausreichend grossen Gruppe. */
    var groupPct = {};
    Object.keys(groups).forEach(function (level) {
      groupPct[level] = Object.create(null);
      var g = groups[level];
      Object.keys(g).forEach(function (key) {
        var idxs = g[key];
        var withValue = idxs.filter(function (i) { return isNum(winsorized[i]); });
        if (withValue.length < config.minPeerGroupSize) return;
        var vals = idxs.map(function (i) { return winsorized[i]; });
        var pct = percentileRanks(vals, higherIsBetter);
        var map = Object.create(null);
        idxs.forEach(function (i, k) { map[i] = pct[k]; });
        groupPct[level][key] = map;
      });
    });

    var peerW = config.peerWeights.peer;
    var univW = config.peerWeights.universe;

    return rows.map(function (row, i) {
      if (!isNum(winsorized[i])) {
        return { percentile: null, peerPercentile: null, universePercentile: null,
                 robustZ: null, peerGroup: null, raw: raw[i], winsorized: null };
      }
      var peerPct = null, peerGroup = "universe";
      for (var l = 0; l < levels.length; l++) {
        var level = levels[l];
        if (level === "universe") break;
        var key = groupKeys[level] ? groupKeys[level](row) : null;
        if (key === null || key === undefined) continue;
        var map = groupPct[level] && groupPct[level][key];
        if (map && isNum(map[i])) { peerPct = map[i]; peerGroup = level + ":" + key; break; }
      }
      var combined = peerPct === null
        ? universePct[i]
        : peerW * peerPct + univW * universePct[i];
      return {
        percentile: Math.round(combined * 100) / 100,
        peerPercentile: peerPct === null ? null : Math.round(peerPct * 100) / 100,
        universePercentile: Math.round(universePct[i] * 100) / 100,
        robustZ: (!universeZ || universeZ[i] === null) ? null : Math.round(universeZ[i] * 1000) / 1000,
        peerGroup: peerGroup,
        raw: raw[i],
        winsorized: winsorized[i]
      };
    });
  }

  /**
   * Gewichteter Mittelwert ueber verfuegbare Komponenten mit
   * Renormalisierung. Gibt zusaetzlich die tatsaechlich erreichte
   * Gewichtsabdeckung zurueck — sie ist die Grundlage der Coverage-Logik.
   */
  function weightedAverage(entries) {
    var sum = 0, wSum = 0, totalW = 0;
    entries.forEach(function (e) {
      totalW += e.weight;
      if (e.value === null || !isNum(e.value)) return;
      sum += e.weight * e.value;
      wSum += e.weight;
    });
    return {
      value: wSum > 0 ? sum / wSum : null,
      coverage: totalW > 0 ? wSum / totalW : 0,
      usedWeight: wSum,
      totalWeight: totalW
    };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  var api = {
    isNum: isNum,
    validateValue: validateValue,
    quantile: quantile,
    winsorize: winsorize,
    percentileRanks: percentileRanks,
    median: median,
    mad: mad,
    robustZScores: robustZScores,
    peerNormalize: peerNormalize,
    weightedAverage: weightedAverage,
    clamp: clamp
  };

  if (isNode) module.exports = api;
  else global.VUNormalization = api;
})(typeof window !== "undefined" ? window : globalThis);
