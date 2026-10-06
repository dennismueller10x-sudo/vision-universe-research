/* =========================================================================
   VISION UNIVERSE DISCOVER — indicators.js

   Technische Ueberlagerungen fuer den Discover-Chart (§6).

   Warum hier und nicht in quant/engines/technical/: die bestehende
   Technical-Intelligence-Engine rechnet einen vollstaendigen Analyse-Bundle
   im Build und liefert davon SMA20/50/200, ATR, RSI14 und das relative
   Volumen als Serien aus. Discover braucht zusaetzlich EMAs, MACD und
   Bollinger-Baender, und zwar UMSCHALTBAR zur Laufzeit auf dem gerade
   gewaehlten Zeitfenster. Die bestehende Engine dafuer zu erweitern hiesse,
   eine produktive Datei anzufassen, die an einem Parameter-Hash haengt -
   und damit jeden vorberechneten Bundle zu invalidieren.

   Diese Datei rechnet deshalb dieselben Standardformeln eigenstaendig und
   ohne Seiteneffekt auf die vorhandenen Bars. Der Test in
   discover/tests/indicators.test.mjs rechnet SMA und RSI gegen die
   ausgelieferten Serien der bestehenden Engine nach - eine abweichende
   Formel faellt damit auf, statt still zwei Wahrheiten zu erzeugen.

   Alle Funktionen geben ein Array gleicher Laenge zurueck; fehlende Werte
   sind null, nicht 0. Ein EMA200 auf 50 Bars ist kein Wert, sondern eine
   Luecke - und eine Linie, die bei 0 beginnt, ist eine erfundene.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "discover-indicators-1.0.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function nulls(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = null; return a; }

  function sma(values, period) {
    var out = nulls(values.length);
    if (!(period > 0)) return out;
    var sum = 0, count = 0;
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (isNum(v)) { sum += v; count++; }
      if (i >= period) {
        var old = values[i - period];
        if (isNum(old)) { sum -= old; count--; }
      }
      if (i >= period - 1 && count === period) out[i] = sum / period;
    }
    return out;
  }

  /* EMA mit SMA-Startwert (Standardkonvention): ohne ihn haengt die erste
     Linie am ersten Kurs und laeuft je nach Historienlaenge anders. */
  function ema(values, period) {
    var out = nulls(values.length);
    if (!(period > 0) || values.length < period) return out;
    var k = 2 / (period + 1);
    var sum = 0;
    for (var i = 0; i < period; i++) {
      if (!isNum(values[i])) return out;
      sum += values[i];
    }
    var prev = sum / period;
    out[period - 1] = prev;
    for (var j = period; j < values.length; j++) {
      if (!isNum(values[j])) { out[j] = null; continue; }
      prev = values[j] * k + prev * (1 - k);
      out[j] = prev;
    }
    return out;
  }

  /** Wilder-RSI - dieselbe Glaettung, die die bestehende Engine verwendet. */
  function rsi(values, period) {
    period = period || 14;
    var out = nulls(values.length);
    if (values.length <= period) return out;
    var gain = 0, loss = 0, i;
    for (i = 1; i <= period; i++) {
      var d = values[i] - values[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    var avgGain = gain / period, avgLoss = loss / period;
    out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    for (i = period + 1; i < values.length; i++) {
      var diff = values[i] - values[i - 1];
      var up = diff > 0 ? diff : 0;
      var down = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + up) / period;
      avgLoss = (avgLoss * (period - 1) + down) / period;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return out;
  }

  function macd(values, fast, slow, signal) {
    fast = fast || 12; slow = slow || 26; signal = signal || 9;
    var emaFast = ema(values, fast), emaSlow = ema(values, slow);
    var line = values.map(function (_, i) {
      return isNum(emaFast[i]) && isNum(emaSlow[i]) ? emaFast[i] - emaSlow[i] : null;
    });
    /* Die Signallinie ist ein EMA der MACD-Linie - und die beginnt erst
       bei slow-1. Der EMA wird deshalb auf dem gueltigen Teilstueck
       gerechnet und wieder eingesetzt, statt Nullen zu glaetten. */
    var firstValid = line.findIndex(isNum);
    var sig = nulls(values.length);
    if (firstValid >= 0) {
      var part = line.slice(firstValid);
      var emaPart = ema(part, signal);
      for (var i = 0; i < emaPart.length; i++) sig[firstValid + i] = emaPart[i];
    }
    var hist = values.map(function (_, i) {
      return isNum(line[i]) && isNum(sig[i]) ? line[i] - sig[i] : null;
    });
    return { macd: line, signal: sig, histogram: hist };
  }

  function stdev(values, period) {
    var out = nulls(values.length);
    for (var i = period - 1; i < values.length; i++) {
      var sum = 0, sumSq = 0, ok = true;
      for (var j = i - period + 1; j <= i; j++) {
        if (!isNum(values[j])) { ok = false; break; }
        sum += values[j]; sumSq += values[j] * values[j];
      }
      if (!ok) continue;
      var mean = sum / period;
      var variance = Math.max(0, sumSq / period - mean * mean);
      out[i] = Math.sqrt(variance);
    }
    return out;
  }

  function bollinger(values, period, multiple) {
    period = period || 20; multiple = multiple || 2;
    var mid = sma(values, period);
    var sd = stdev(values, period);
    return {
      middle: mid,
      upper: mid.map(function (m, i) { return isNum(m) && isNum(sd[i]) ? m + multiple * sd[i] : null; }),
      lower: mid.map(function (m, i) { return isNum(m) && isNum(sd[i]) ? m - multiple * sd[i] : null; }),
      widthPct: mid.map(function (m, i) {
        return isNum(m) && isNum(sd[i]) && m !== 0 ? (2 * multiple * sd[i]) / m : null;
      })
    };
  }

  /** Wilder-ATR aus echten Bars. Ohne High/Low kein ATR - kein Ersatz aus Closes. */
  function atr(bars, period) {
    period = period || 14;
    var n = bars.length;
    var out = nulls(n);
    if (n <= period) return out;
    var tr = nulls(n);
    for (var i = 1; i < n; i++) {
      var b = bars[i], p = bars[i - 1];
      if (!isNum(b.high) || !isNum(b.low) || !isNum(p.close)) continue;
      tr[i] = Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close));
    }
    var sum = 0;
    for (var j = 1; j <= period; j++) {
      if (!isNum(tr[j])) return out;
      sum += tr[j];
    }
    var prev = sum / period;
    out[period] = prev;
    for (var k = period + 1; k < n; k++) {
      if (!isNum(tr[k])) { out[k] = null; continue; }
      prev = (prev * (period - 1) + tr[k]) / period;
      out[k] = prev;
    }
    return out;
  }

  /**
   * Volumen relativ zum eigenen Massstab.
   *
   * Es gibt im Repository zwei Definitionen davon, und beide sind richtig
   * fuer ihre Frage:
   *
   *   medianPrior  Median der VORHERGEHENDEN 20 Bars - die robuste Form der
   *                bestehenden Technical-Engine (feature-store.js). Ein
   *                einzelner Ausreisser verschiebt den Massstab nicht, und
   *                der aktuelle Tag ist nicht sein eigener Vergleichswert.
   *   mean         Mittel der letzten 20 Bars inklusive heute - die Form,
   *                die market-factors.js fuer volumeSpikeRatio verwendet.
   *
   * Der Chart benutzt die erste, damit er dieselbe Linie zeigt wie die
   * Technical-Seite. Die Karten zeigen die zweite, weil sie aus dem
   * ausgelieferten Faktorensatz stammt. Beide sind benannt, damit
   * niemand sie fuer dieselbe Zahl haelt.
   */
  function relativeVolume(volumes, period, opts) {
    period = period || 20;
    var basis = (opts && opts.basis) || "medianPrior";
    var reference = basis === "mean" ? sma(volumes, period) : medianPrior(volumes, period);
    return volumes.map(function (v, i) {
      return isNum(v) && isNum(reference[i]) && reference[i] > 0 ? v / reference[i] : null;
    });
  }

  /** Median der w Bars VOR i. Dieselbe Regel wie in feature-store.js. */
  function medianPrior(values, w) {
    var out = nulls(values.length);
    for (var i = w; i < values.length; i++) {
      var win = [];
      for (var j = i - w; j < i; j++) if (isNum(values[j])) win.push(values[j]);
      if (win.length < Math.ceil(w * 0.8)) continue;
      win.sort(function (a, b) { return a - b; });
      var m = win.length >> 1;
      out[i] = win.length % 2 ? win[m] : (win[m - 1] + win[m]) / 2;
    }
    return out;
  }

  /** Auf 100 normierte Reihe - fuer den Vergleich gegen Index oder Sektor. */
  function rebase(values, basis) {
    basis = basis || 100;
    var first = null;
    for (var i = 0; i < values.length; i++) { if (isNum(values[i]) && values[i] !== 0) { first = values[i]; break; } }
    if (first === null) return nulls(values.length);
    return values.map(function (v) { return isNum(v) ? (v / first) * basis : null; });
  }

  /** Relative Staerke als Verhaeltnis zweier normierter Reihen. */
  function relativeStrengthLine(values, benchmark) {
    var a = rebase(values), b = rebase(benchmark);
    return values.map(function (_, i) {
      return isNum(a[i]) && isNum(b[i]) && b[i] !== 0 ? a[i] / b[i] * 100 : null;
    });
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION,
    sma: sma, ema: ema, rsi: rsi, macd: macd, stdev: stdev, bollinger: bollinger,
    atr: atr, relativeVolume: relativeVolume, medianPrior: medianPrior, rebase: rebase,
    relativeStrengthLine: relativeStrengthLine
  };

  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.Indicators = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
