/* =========================================================================
   VISION UNIVERSE TECHNICAL — feature-store.js
   DERIVED FEATURE STORE

   Deterministische, versionierte, kausale Features auf einer
   CanonicalBarSeries. Jede Spalte an Index i benutzt ausschliesslich Bars
   <= i. Fehlende Historie ergibt NaN (serialisiert: null) — nie 0, nie
   einen neutralen Wert (Missing != Zero).

   Alle Parameter kommen aus technical-v1.json (features). Der
   parametersHash macht jeden Feature-Satz reproduzierbar identifizierbar.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;

  var FEATURE_VERSION = "features-1.0.0";

  var DEFAULTS = {
    atrPeriod: 14, realizedVolWindow: 20, realizedVolLongWindow: 60,
    smaPeriods: [20, 50, 200], emaPeriods: [20, 50], rsiPeriod: 14,
    macd: { fast: 12, slow: 26, signal: 9 }, rocPeriods: [10, 21],
    rollingWindow: 20, yearWindow: 252, volumeWindow: 20, volumeLongWindow: 60,
    regressionWindow: 60, adxPeriod: 14,
    momentumHorizons: { "1M": 21, "3M": 63, "6M": 126, "12M": 252 },
    annualizationFactor: 252
  };

  function arr(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = NaN; return a; }
  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  // ------------------------------------------------------------ Primitive
  function sma(values, period) {
    var n = values.length, out = arr(n), sum = 0, count = 0;
    for (var i = 0; i < n; i++) {
      var v = values[i];
      if (isNum(v)) { sum += v; count++; }
      if (i >= period) { var old = values[i - period]; if (isNum(old)) { sum -= old; count--; } }
      if (i >= period - 1 && count === period) out[i] = sum / period;
    }
    return out;
  }

  function ema(values, period) {
    var n = values.length, out = arr(n), k = 2 / (period + 1);
    var seed = sma(values, period);
    var started = false, prev = NaN;
    for (var i = 0; i < n; i++) {
      if (!started) { if (isNum(seed[i])) { prev = seed[i]; out[i] = prev; started = true; } continue; }
      if (!isNum(values[i])) { out[i] = prev; continue; }
      prev = (values[i] - prev) * k + prev;
      out[i] = prev;
    }
    return out;
  }

  /** Wilder-Glaettung (RMA) — fuer ATR, RSI, ADX. */
  function wilder(values, period) {
    var n = values.length, out = arr(n), sum = 0, count = 0, prev = NaN;
    for (var i = 0; i < n; i++) {
      var v = values[i];
      if (!isNum(prev)) {
        if (isNum(v)) { sum += v; count++; }
        if (count === period) { prev = sum / period; out[i] = prev; }
        continue;
      }
      if (isNum(v)) prev = (prev * (period - 1) + v) / period;
      out[i] = prev;
    }
    return out;
  }

  function trueRange(high, low, close) {
    var n = close.length, out = arr(n);
    for (var i = 0; i < n; i++) {
      if (i === 0) { out[i] = high[i] - low[i]; continue; }
      var pc = close[i - 1];
      out[i] = Math.max(high[i] - low[i], Math.abs(high[i] - pc), Math.abs(low[i] - pc));
    }
    return out;
  }

  function rollingMax(values, w) {
    var n = values.length, out = arr(n), dq = [];
    for (var i = 0; i < n; i++) {
      while (dq.length && values[dq[dq.length - 1]] <= values[i]) dq.pop();
      dq.push(i);
      while (dq[0] <= i - w) dq.shift();
      if (i >= w - 1) out[i] = values[dq[0]];
    }
    return out;
  }
  function rollingMin(values, w) {
    var n = values.length, out = arr(n), dq = [];
    for (var i = 0; i < n; i++) {
      while (dq.length && values[dq[dq.length - 1]] >= values[i]) dq.pop();
      dq.push(i);
      while (dq[0] <= i - w) dq.shift();
      if (i >= w - 1) out[i] = values[dq[0]];
    }
    return out;
  }

  function rollingStd(values, w) {
    var n = values.length, out = arr(n);
    var sum = 0, sq = 0, count = 0;
    for (var i = 0; i < n; i++) {
      var v = values[i];
      if (isNum(v)) { sum += v; sq += v * v; count++; }
      if (i >= w) { var o = values[i - w]; if (isNum(o)) { sum -= o; sq -= o * o; count--; } }
      if (i >= w - 1 && count === w) {
        var mean = sum / w, varc = Math.max(0, sq / w - mean * mean);
        out[i] = Math.sqrt(varc);
      }
    }
    return out;
  }

  /** Rollierender Median ueber die VORHERIGEN w Werte (exklusive i). */
  function rollingMedianPrior(values, w) {
    var n = values.length, out = arr(n);
    for (var i = w; i < n; i++) {
      var win = [];
      for (var j = i - w; j < i; j++) if (isNum(values[j])) win.push(values[j]);
      if (win.length < Math.ceil(w * 0.8)) continue;
      win.sort(function (a, b) { return a - b; });
      var m = win.length >> 1;
      out[i] = win.length % 2 ? win[m] : (win[m - 1] + win[m]) / 2;
    }
    return out;
  }

  function rsi(close, period) {
    var n = close.length, gains = arr(n), losses = arr(n);
    for (var i = 1; i < n; i++) { var d = close[i] - close[i - 1]; gains[i] = d > 0 ? d : 0; losses[i] = d < 0 ? -d : 0; }
    var ag = wilder(gains.slice(1), period), al = wilder(losses.slice(1), period);
    var out = arr(n);
    for (var k = 0; k < ag.length; k++) {
      if (!isNum(ag[k])) continue;
      out[k + 1] = al[k] === 0 ? 100 : 100 - 100 / (1 + ag[k] / al[k]);
    }
    return out;
  }

  /** Log-lineare Regressionssteigung ueber w Bars, je Bar (Anteil/Bar) + R². */
  function regressionSlope(logClose, w) {
    var n = logClose.length, slope = arr(n), r2 = arr(n);
    var sx = 0, sxx = 0;
    for (var k = 0; k < w; k++) { sx += k; sxx += k * k; }
    for (var i = w - 1; i < n; i++) {
      var sy = 0, sxy = 0, syy = 0, ok = true;
      for (var j = 0; j < w; j++) {
        var y = logClose[i - w + 1 + j];
        if (!isNum(y)) { ok = false; break; }
        sy += y; sxy += j * y; syy += y * y;
      }
      if (!ok) continue;
      var denom = w * sxx - sx * sx;
      var b = (w * sxy - sx * sy) / denom;
      var a = (sy - b * sx) / w;
      var ssTot = syy - sy * sy / w, ssRes = 0;
      for (var q = 0; q < w; q++) { var e = logClose[i - w + 1 + q] - (a + b * q); ssRes += e * e; }
      slope[i] = b;
      r2[i] = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
    }
    return { slope: slope, r2: r2 };
  }

  function adx(high, low, close, period) {
    var n = close.length, plusDM = arr(n), minusDM = arr(n), tr = trueRange(high, low, close);
    for (var i = 1; i < n; i++) {
      var up = high[i] - high[i - 1], down = low[i - 1] - low[i];
      plusDM[i] = (up > down && up > 0) ? up : 0;
      minusDM[i] = (down > up && down > 0) ? down : 0;
    }
    var atrW = wilder(tr.slice(1), period), pW = wilder(plusDM.slice(1), period), mW = wilder(minusDM.slice(1), period);
    var dx = arr(n - 1), plusDI = arr(n), minusDI = arr(n);
    for (var k = 0; k < atrW.length; k++) {
      if (!isNum(atrW[k]) || atrW[k] === 0) continue;
      var pdi = 100 * pW[k] / atrW[k], mdi = 100 * mW[k] / atrW[k];
      plusDI[k + 1] = pdi; minusDI[k + 1] = mdi;
      dx[k] = (pdi + mdi) === 0 ? 0 : 100 * Math.abs(pdi - mdi) / (pdi + mdi);
    }
    var adxW = wilder(dx, period), out = arr(n);
    for (var m = 0; m < adxW.length; m++) out[m + 1] = adxW[m];
    return { adx: out, plusDI: plusDI, minusDI: minusDI };
  }

  /** Perzentilrang von values[i] innerhalb der letzten w Werte (inkl. i), 0..100. */
  function percentileRank(values, w) {
    var n = values.length, out = arr(n);
    for (var i = w - 1; i < n; i++) {
      var v = values[i]; if (!isNum(v)) continue;
      var below = 0, count = 0;
      for (var j = i - w + 1; j <= i; j++) { var x = values[j]; if (!isNum(x)) continue; count++; if (x < v) below++; else if (x === v) below += 0.5; }
      if (count >= w * 0.8) out[i] = 100 * below / count;
    }
    return out;
  }

  // ------------------------------------------------------------ Compute
  /**
   * Berechnet den vollstaendigen Feature-Satz.
   * @param {object} series CanonicalBarSeries
   * @param {object} [cfg]  Parameter (technical-v1.json → features)
   */
  function computeFeatures(series, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    var n = series.length;
    var close = series.close, high = series.high, low = series.low, open = series.open, volume = series.volume;
    var C = {};

    var logClose = close.map(function (c) { return Math.log(c); });
    C.returns = arr(n); C.logReturns = arr(n);
    for (var i = 1; i < n; i++) { C.returns[i] = close[i] / close[i - 1] - 1; C.logReturns[i] = logClose[i] - logClose[i - 1]; }

    C.trueRange = trueRange(high, low, close);
    C.atr = wilder(C.trueRange, cfg.atrPeriod);
    C.atrPct = C.atr.map(function (a, k) { return isNum(a) ? a / close[k] : NaN; });

    var ann = Math.sqrt(cfg.annualizationFactor);
    C.realizedVol = rollingStd(C.logReturns, cfg.realizedVolWindow).map(function (s) { return isNum(s) ? s * ann : NaN; });
    C.realizedVolLong = rollingStd(C.logReturns, cfg.realizedVolLongWindow).map(function (s) { return isNum(s) ? s * ann : NaN; });
    var downside = C.logReturns.map(function (r) { return isNum(r) ? Math.min(0, r) : NaN; });
    C.downsideVol = rollingStd(downside, cfg.realizedVolWindow).map(function (s) { return isNum(s) ? s * ann : NaN; });

    cfg.smaPeriods.forEach(function (p) { C["sma" + p] = sma(close, p); });
    cfg.emaPeriods.forEach(function (p) { C["ema" + p] = ema(close, p); });
    cfg.rocPeriods.forEach(function (p) {
      C["roc" + p] = arr(n);
      for (var k = p; k < n; k++) C["roc" + p][k] = close[k] / close[k - p] - 1;
    });
    C["rsi" + cfg.rsiPeriod] = rsi(close, cfg.rsiPeriod);

    var fast = ema(close, cfg.macd.fast), slow = ema(close, cfg.macd.slow);
    C.macd = arr(n);
    for (var m = 0; m < n; m++) if (isNum(fast[m]) && isNum(slow[m])) C.macd[m] = fast[m] - slow[m];
    C.macdSignal = ema(C.macd, cfg.macd.signal);
    C.macdHistogram = C.macd.map(function (v, k) { return isNum(v) && isNum(C.macdSignal[k]) ? v - C.macdSignal[k] : NaN; });

    C.rollingHigh = rollingMax(high, cfg.rollingWindow);
    C.rollingLow = rollingMin(low, cfg.rollingWindow);
    C.high52w = rollingMax(high, cfg.yearWindow);
    C.low52w = rollingMin(low, cfg.yearWindow);
    C.distanceTo52wHigh = C.high52w.map(function (h, k) { return isNum(h) ? close[k] / h - 1 : NaN; });
    C.distanceTo52wLow = C.low52w.map(function (l, k) { return isNum(l) ? close[k] / l - 1 : NaN; });
    C.donchianWidthPct = C.rollingHigh.map(function (h, k) { return isNum(h) && isNum(C.rollingLow[k]) ? (h - C.rollingLow[k]) / close[k] : NaN; });
    var bbStd = rollingStd(close, 20), bbMid = sma(close, 20);
    C.bollingerWidthPct = bbStd.map(function (s, k) { return isNum(s) && isNum(bbMid[k]) ? (4 * s) / bbMid[k] : NaN; });

    /* Drawdown vom laufenden Hoechststand (kausal). */
    C.drawdown = arr(n); var runMax = -Infinity;
    for (var d = 0; d < n; d++) { if (close[d] > runMax) runMax = close[d]; C.drawdown[d] = close[d] / runMax - 1; }

    /* Volumen: robuste Medianbasis ueber die vorherigen Bars. */
    var hasVolume = volume.some(isNum);
    C.averageVolume = hasVolume ? rollingMedianPrior(volume, cfg.volumeWindow) : arr(n);
    C.averageVolumeLong = hasVolume ? rollingMedianPrior(volume, cfg.volumeLongWindow) : arr(n);
    C.relativeVolume = C.averageVolume.map(function (a, k) { return isNum(a) && a > 0 && isNum(volume[k]) ? volume[k] / a : NaN; });
    C.volumeTrend = C.averageVolume.map(function (a, k) { return isNum(a) && isNum(C.averageVolumeLong[k]) && C.averageVolumeLong[k] > 0 ? a / C.averageVolumeLong[k] - 1 : NaN; });

    /* Regression und Richtungsstaerke. */
    var reg = regressionSlope(logClose, cfg.regressionWindow);
    C.regressionSlope = reg.slope; C.regressionR2 = reg.r2;
    var dailyVol = rollingStd(C.logReturns, cfg.regressionWindow);
    C.regressionSlopeZ = reg.slope.map(function (s, k) { return isNum(s) && isNum(dailyVol[k]) && dailyVol[k] > 0 ? s / dailyVol[k] * Math.sqrt(cfg.regressionWindow) : NaN; });
    var a = adx(high, low, close, cfg.adxPeriod);
    C.adx = a.adx; C.plusDI = a.plusDI; C.minusDI = a.minusDI;

    /* MA-Steigungen in ATR-Einheiten ueber 20 Bars (normalisiert, §17). */
    cfg.smaPeriods.forEach(function (p) {
      var s = C["sma" + p], out = arr(n);
      for (var k = 20; k < n; k++) if (isNum(s[k]) && isNum(s[k - 20]) && isNum(C.atr[k]) && C.atr[k] > 0) out[k] = (s[k] - s[k - 20]) / C.atr[k];
      C["sma" + p + "SlopeAtr"] = out;
    });

    /* Multi-Horizon-Momentum (Log-Returns) + volatilitaetsstandardisierte z. */
    Object.keys(cfg.momentumHorizons).forEach(function (h) {
      var w = cfg.momentumHorizons[h], out = arr(n), z = arr(n);
      for (var k = w; k < n; k++) {
        out[k] = logClose[k] - logClose[k - w];
        var v = C.realizedVolLong[k];
        if (isNum(v) && v > 0) z[k] = out[k] / (v / ann * Math.sqrt(w));
      }
      C["momentum" + h] = out; C["momentum" + h + "Z"] = z;
    });
    /* Klassisches 12-1-Momentum (12M ohne letzten Monat). */
    C.momentum12m1m = arr(n);
    for (var q = 252; q < n; q++) C.momentum12m1m[q] = logClose[q - 21] - logClose[q - 252];

    C.atrPctPercentile = percentileRank(C.atrPct, cfg.yearWindow);
    C.bollingerWidthPercentile = percentileRank(C.bollingerWidthPct, cfg.yearWindow);
    C.gapPct = arr(n);
    for (var g = 1; g < n; g++) C.gapPct[g] = open[g] / close[g - 1] - 1;

    var params = { featureVersion: FEATURE_VERSION, cfg: cfg };
    return {
      featureVersion: FEATURE_VERSION,
      parametersHash: Hash.hashValue(params),
      params: cfg,
      length: n,
      columns: C,
      dataHash: series.dataHash,
      /** Alle Features an Bar i als Objekt (NaN → null). */
      at: function (i) {
        var o = {};
        Object.keys(C).forEach(function (k) { var v = C[k][i]; o[k] = isNum(v) ? v : null; });
        return o;
      },
      last: function () { return this.at(n - 1); }
    };
  }

  var api = {
    FEATURE_VERSION: FEATURE_VERSION, DEFAULTS: DEFAULTS,
    computeFeatures: computeFeatures,
    /* Primitive fuer Tests und andere Engines */
    sma: sma, ema: ema, wilder: wilder, trueRange: trueRange, rsi: rsi,
    rollingMax: rollingMax, rollingMin: rollingMin, rollingStd: rollingStd,
    rollingMedianPrior: rollingMedianPrior, regressionSlope: regressionSlope, adx: adx, percentileRank: percentileRank
  };

  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Features = api; }
})(typeof window !== "undefined" ? window : globalThis);
