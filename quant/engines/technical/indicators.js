/* =========================================================================
   VISION UNIVERSE TECHNICAL — indicators.js
   INDIKATOR-KATALOG FUER DIE PRODUKTWELT TECHNICAL

   Eine Stelle, an der jeder Indikator, den Technical anzeigt oder filtert,
   mit Definition, Parametern und Aufwaermperiode steht. Die Mathematik der
   bereits geprueften Primitive kommt aus feature-store.js (SMA, EMA,
   Wilder/RMA, True Range, RSI, ADX, rollierende Extreme und Streuung,
   Median-Volumenbasis) und wird hier NICHT neu geschrieben. Neu sind nur
   Indikatoren, die es im Bestand nicht gab (WMA, Supertrend, Donchian-Kanal,
   Stochastik, CCI, Bollinger-/Keltner-Baender, OBV, MFI, Volumenspitzen).

   Grundsaetze (wie feature-store.js):
     • kausal: Wert an i nutzt nur Bars <= i
     • fehlende Historie ergibt NaN (serialisiert null), nie 0
     • fehlende Eingabewerte (null/NaN) erzeugen NaN an dieser Bar;
       rekursive Glaettungen (EMA, Wilder) tragen den letzten Zustand weiter
     • keine Zufallsquellen, keine Uhrzeit: gleiche Eingabe, gleiche Ausgabe

   Zeitrahmen: Die Formeln sind zeitrahmenneutral und rechnen in Bars. Wer
   Wochenwerte will, aggregiert vorher mit timeframe.js#aggregate
   (abgeschlossene ISO-Wochen). Perioden bleiben Bar-Zahlen.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var F = isNode ? require("./feature-store.js") : global.VUTechnical.Features;

  var INDICATORS_VERSION = "technical-indicators-1.0.0";

  function arr(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = NaN; return a; }
  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function num(v) { return isNum(v) ? v : NaN; }
  function col(values) { return (values || []).map(num); }

  /* ------------------------------------------------------------- Trend */

  /** WMA_n(i) = Σ_{j=0..n-1} (n-j)·x_{i-j} / (n(n+1)/2). Fehlt ein Wert im Fenster: NaN. */
  function wma(values, period) {
    var x = col(values), n = x.length, out = arr(n), denom = period * (period + 1) / 2;
    for (var i = period - 1; i < n; i++) {
      var s = 0, ok = true;
      for (var j = 0; j < period; j++) { var v = x[i - j]; if (!isNum(v)) { ok = false; break; } s += (period - j) * v; }
      if (ok) out[i] = s / denom;
    }
    return out;
  }

  /** Donchian-Kanal: oberes Band = hoechstes Hoch, unteres = tiefstes Tief der letzten n Bars (inkl. i). */
  function donchian(high, low, period) {
    var upper = F.rollingMax(col(high), period), lower = F.rollingMin(col(low), period);
    var mid = upper.map(function (u, i) { return isNum(u) && isNum(lower[i]) ? (u + lower[i]) / 2 : NaN; });
    return { upper: upper, lower: lower, middle: mid };
  }

  /**
   * Supertrend (Seban): Basisband = (H+L)/2 ± m·ATR_p (Wilder).
   * Finales oberes Band sinkt nur oder springt, wenn der Vorschluss darueber lag;
   * finales unteres Band steigt nur oder springt, wenn der Vorschluss darunter lag.
   * Richtung +1, solange der Schluss ueber dem finalen oberen Band ausgebrochen ist,
   * bis er unter das finale untere Band faellt (und umgekehrt).
   */
  function supertrend(high, low, close, period, multiplier) {
    var h = col(high), l = col(low), c = col(close), n = c.length;
    var atr = F.wilder(F.trueRange(h, l, c), period);
    var line = arr(n), dir = arr(n), fu = arr(n), fl = arr(n);
    for (var i = 0; i < n; i++) {
      if (!isNum(atr[i]) || !isNum(h[i]) || !isNum(l[i]) || !isNum(c[i])) continue;
      var mid = (h[i] + l[i]) / 2, bu = mid + multiplier * atr[i], bl = mid - multiplier * atr[i];
      var pu = fu[i - 1], pl = fl[i - 1], pc = c[i - 1], pd = dir[i - 1];
      if (!isNum(pu)) { fu[i] = bu; fl[i] = bl; dir[i] = c[i] >= mid ? 1 : -1; line[i] = dir[i] > 0 ? fl[i] : fu[i]; continue; }
      fu[i] = (bu < pu || pc > pu) ? bu : pu;
      fl[i] = (bl > pl || pc < pl) ? bl : pl;
      if (pd > 0) dir[i] = c[i] < fl[i] ? -1 : 1;
      else dir[i] = c[i] > fu[i] ? 1 : -1;
      line[i] = dir[i] > 0 ? fl[i] : fu[i];
    }
    return { line: line, direction: dir, upper: fu, lower: fl };
  }

  /* ----------------------------------------------------------- Momentum */

  /** MACD = EMA_fast − EMA_slow; Signal = EMA_signal(MACD); Histogramm = MACD − Signal. */
  function macd(close, fast, slow, signal) {
    var c = col(close), f = F.ema(c, fast), s = F.ema(c, slow), n = c.length, m = arr(n);
    for (var i = 0; i < n; i++) if (isNum(f[i]) && isNum(s[i])) m[i] = f[i] - s[i];
    var sig = F.ema(m, signal);
    return { macd: m, signal: sig, histogram: m.map(function (v, i) { return isNum(v) && isNum(sig[i]) ? v - sig[i] : NaN; }) };
  }

  /** ROC_n in Prozent: 100·(C_i / C_{i−n} − 1). */
  function roc(close, period) {
    var c = col(close), n = c.length, out = arr(n);
    for (var i = period; i < n; i++) if (isNum(c[i]) && isNum(c[i - period]) && c[i - period] !== 0) out[i] = 100 * (c[i] / c[i - period] - 1);
    return out;
  }

  /**
   * Stochastik (langsam): %K_roh = 100·(C − LL_k)/(HH_k − LL_k), %K = SMA_smooth(%K_roh),
   * %D = SMA_d(%K). HH = LL (keine Spanne) ergibt 50 (Mitte), nicht 0.
   */
  function stochastic(high, low, close, kPeriod, smooth, dPeriod) {
    var h = col(high), l = col(low), c = col(close), n = c.length;
    var hh = F.rollingMax(h, kPeriod), ll = F.rollingMin(l, kPeriod), raw = arr(n);
    for (var i = 0; i < n; i++) {
      if (!isNum(hh[i]) || !isNum(ll[i]) || !isNum(c[i])) continue;
      var span = hh[i] - ll[i];
      raw[i] = span > 0 ? 100 * (c[i] - ll[i]) / span : 50;
    }
    var k = smooth > 1 ? F.sma(raw, smooth) : raw;
    return { k: k, d: F.sma(k, dPeriod), raw: raw };
  }

  /** CCI_n = (TP − SMA_n(TP)) / (0,015 · mittlere absolute Abweichung), TP = (H+L+C)/3. */
  function cci(high, low, close, period) {
    var h = col(high), l = col(low), c = col(close), n = c.length, tp = arr(n), out = arr(n);
    for (var i = 0; i < n; i++) if (isNum(h[i]) && isNum(l[i]) && isNum(c[i])) tp[i] = (h[i] + l[i] + c[i]) / 3;
    var m = F.sma(tp, period);
    for (var k = period - 1; k < n; k++) {
      if (!isNum(m[k])) continue;
      var dev = 0;
      for (var j = k - period + 1; j <= k; j++) dev += Math.abs(tp[j] - m[k]);
      dev /= period;
      out[k] = dev > 0 ? (tp[k] - m[k]) / (0.015 * dev) : 0;
    }
    return out;
  }

  /* -------------------------------------------------------- Volatilitaet */

  /** ATR_n = Wilder-Glaettung der True Range (feature-store.js). */
  function atr(high, low, close, period) { return F.wilder(F.trueRange(col(high), col(low), col(close)), period); }

  /** Bollinger: Mitte SMA_n, Baender ± k·σ_n (Populationsstreuung, wie Bollinger 2001). */
  function bollinger(close, period, k) {
    var c = col(close), mid = F.sma(c, period), sd = F.rollingStd(c, period);
    var up = mid.map(function (m, i) { return isNum(m) && isNum(sd[i]) ? m + k * sd[i] : NaN; });
    var lo = mid.map(function (m, i) { return isNum(m) && isNum(sd[i]) ? m - k * sd[i] : NaN; });
    var width = mid.map(function (m, i) { return isNum(up[i]) && m !== 0 ? (up[i] - lo[i]) / m : NaN; });
    var pctB = c.map(function (v, i) { return isNum(up[i]) && up[i] > lo[i] && isNum(v) ? (v - lo[i]) / (up[i] - lo[i]) : NaN; });
    return { middle: mid, upper: up, lower: lo, width: width, percentB: pctB };
  }

  /** Keltner (Raschke-Variante): Mitte EMA_n(C), Baender ± m·ATR_a. */
  function keltner(high, low, close, period, multiplier, atrPeriod) {
    var mid = F.ema(col(close), period), a = atr(high, low, close, atrPeriod);
    return {
      middle: mid,
      upper: mid.map(function (m, i) { return isNum(m) && isNum(a[i]) ? m + multiplier * a[i] : NaN; }),
      lower: mid.map(function (m, i) { return isNum(m) && isNum(a[i]) ? m - multiplier * a[i] : NaN; })
    };
  }

  /* -------------------------------------------------------------- Volumen */

  /** OBV: kumulierte Summe ±Volumen nach Schlussrichtung, Start 0 an der ersten Bar. Lueckenbar: Wert bleibt. */
  function obv(close, volume) {
    var c = col(close), v = col(volume), n = c.length, out = arr(n), acc = 0;
    if (!n) return out;
    out[0] = 0;
    for (var i = 1; i < n; i++) {
      if (isNum(c[i]) && isNum(c[i - 1]) && isNum(v[i])) acc += c[i] > c[i - 1] ? v[i] : c[i] < c[i - 1] ? -v[i] : 0;
      out[i] = acc;
    }
    return out;
  }

  /** MFI_n = 100 − 100/(1 + Σpositiver Fluss / Σnegativer Fluss), Fluss = TP·Volumen. Kein negativer Fluss: 100. */
  function mfi(high, low, close, volume, period) {
    var h = col(high), l = col(low), c = col(close), v = col(volume), n = c.length, out = arr(n), tp = arr(n), pos = arr(n), neg = arr(n);
    for (var i = 0; i < n; i++) if (isNum(h[i]) && isNum(l[i]) && isNum(c[i])) tp[i] = (h[i] + l[i] + c[i]) / 3;
    for (var k = 1; k < n; k++) {
      if (!isNum(tp[k]) || !isNum(tp[k - 1]) || !isNum(v[k])) continue;
      var flow = tp[k] * v[k];
      pos[k] = tp[k] > tp[k - 1] ? flow : 0; neg[k] = tp[k] < tp[k - 1] ? flow : 0;
    }
    for (var j = period; j < n; j++) {
      var p = 0, q = 0, ok = true;
      for (var m = j - period + 1; m <= j; m++) { if (!isNum(pos[m])) { ok = false; break; } p += pos[m]; q += neg[m]; }
      if (ok) out[j] = q === 0 ? 100 : 100 - 100 / (1 + p / q);
    }
    return out;
  }

  /** Relative Volumenstaerke = Volumen_i / Median der VORHERIGEN n Volumina (feature-store.js, robuste Basis). */
  function relativeVolume(volume, period) {
    var v = col(volume), base = F.rollingMedianPrior(v, period);
    return v.map(function (x, i) { return isNum(x) && isNum(base[i]) && base[i] > 0 ? x / base[i] : NaN; });
  }

  /** Volumenspitze: relatives Volumen >= Schwelle (Standard 2,0). 1/0, NaN ohne Basis. */
  function volumeSpikes(volume, period, threshold) {
    return relativeVolume(volume, period).map(function (r) { return isNum(r) ? (r >= threshold ? 1 : 0) : NaN; });
  }

  /* ------------------------------------------------------- Hilfsfunktionen */

  /** Hoechster Schluss bzw. Hoch der letzten n Bars inkl. i (52 Wochen = 252 Tagesbars bzw. 52 Wochenbars). */
  function rollingHigh(values, period) { return F.rollingMax(col(values), period); }
  function rollingLow(values, period) { return F.rollingMin(col(values), period); }

  /* --------------------------------------------------------------- Katalog */

  /**
   * Der Katalog ist die dokumentierte Definition. `warmup` = erste Bar-Position (0-basiert), an der
   * der Indikator bei lueckenloser Eingabe einen Wert hat. `inputs` = benoetigte Spalten.
   * `family` steuert Gruppierung im Chart Studio.
   */
  var CATALOG = [
    { id: "sma", family: "TREND", name: "Einfacher gleitender Durchschnitt (SMA)", params: { period: 50 }, inputs: ["close"], overlay: true,
      definition: "SMA_n = arithmetisches Mittel der letzten n Schlusskurse", warmup: function (p) { return p.period - 1; } },
    { id: "ema", family: "TREND", name: "Exponentieller gleitender Durchschnitt (EMA)", params: { period: 200 }, inputs: ["close"], overlay: true,
      definition: "EMA_i = EMA_{i-1} + 2/(n+1)·(C_i − EMA_{i-1}); Startwert SMA_n", warmup: function (p) { return p.period - 1; } },
    { id: "wma", family: "TREND", name: "Gewichteter gleitender Durchschnitt (WMA)", params: { period: 20 }, inputs: ["close"], overlay: true,
      definition: "lineare Gewichte n, n−1, …, 1 auf die letzten n Schlusskurse", warmup: function (p) { return p.period - 1; } },
    { id: "adx", family: "TREND", name: "Average Directional Index (ADX)", params: { period: 14 }, inputs: ["high", "low", "close"], overlay: false,
      definition: "Wilder: +DI/−DI aus geglaetteten Richtungsbewegungen, DX = 100·|+DI−−DI|/(+DI+−DI), ADX = Wilder(DX)", warmup: function (p) { return 2 * p.period - 1; } },
    { id: "supertrend", family: "TREND", name: "Supertrend", params: { period: 10, multiplier: 3 }, inputs: ["high", "low", "close"], overlay: true,
      definition: "Bandlinie (H+L)/2 ± m·ATR mit Nachziehregel; Richtung wechselt beim Schluss jenseits des Gegenbands", warmup: function (p) { return p.period - 1; } },
    { id: "donchian", family: "TREND", name: "Donchian-Kanal", params: { period: 20 }, inputs: ["high", "low"], overlay: true,
      definition: "oberes Band = hoechstes Hoch, unteres Band = tiefstes Tief der letzten n Bars", warmup: function (p) { return p.period - 1; } },
    { id: "rsi", family: "MOMENTUM", name: "Relative Strength Index (RSI)", params: { period: 14 }, inputs: ["close"], overlay: false,
      definition: "Wilder: RSI = 100 − 100/(1 + RMA(Gewinne)/RMA(Verluste))", warmup: function (p) { return p.period; } },
    { id: "macd", family: "MOMENTUM", name: "MACD", params: { fast: 12, slow: 26, signal: 9 }, inputs: ["close"], overlay: false,
      definition: "MACD = EMA_fast − EMA_slow; Signal = EMA_signal(MACD); Histogramm = Differenz", warmup: function (p) { return p.slow + p.signal - 2; } },
    { id: "stochastic", family: "MOMENTUM", name: "Stochastik (langsam)", params: { kPeriod: 14, smooth: 3, dPeriod: 3 }, inputs: ["high", "low", "close"], overlay: false,
      definition: "%K = SMA_smooth(100·(C−LL)/(HH−LL)), %D = SMA_d(%K)", warmup: function (p) { return p.kPeriod + p.smooth + p.dPeriod - 3; } },
    { id: "roc", family: "MOMENTUM", name: "Rate of Change (ROC)", params: { period: 21 }, inputs: ["close"], overlay: false,
      definition: "ROC = 100·(C_i/C_{i−n} − 1) in Prozent", warmup: function (p) { return p.period; } },
    { id: "cci", family: "MOMENTUM", name: "Commodity Channel Index (CCI)", params: { period: 20 }, inputs: ["high", "low", "close"], overlay: false,
      definition: "(TP − SMA(TP)) / (0,015·mittlere absolute Abweichung), TP = (H+L+C)/3", warmup: function (p) { return p.period - 1; } },
    { id: "atr", family: "VOLATILITY", name: "Average True Range (ATR)", params: { period: 14 }, inputs: ["high", "low", "close"], overlay: false,
      definition: "Wilder-Glaettung der True Range max(H−L, |H−C_{−1}|, |L−C_{−1}|)", warmup: function (p) { return p.period - 1; } },
    { id: "bollinger", family: "VOLATILITY", name: "Bollinger-Baender", params: { period: 20, k: 2 }, inputs: ["close"], overlay: true,
      definition: "SMA_n ± k·Standardabweichung (Population) der letzten n Schlusskurse", warmup: function (p) { return p.period - 1; } },
    { id: "keltner", family: "VOLATILITY", name: "Keltner-Kanal", params: { period: 20, multiplier: 2, atrPeriod: 10 }, inputs: ["high", "low", "close"], overlay: true,
      definition: "EMA_n(C) ± m·ATR_a", warmup: function (p) { return Math.max(p.period, p.atrPeriod) - 1; } },
    { id: "obv", family: "VOLUME", name: "On-Balance-Volume (OBV)", params: {}, inputs: ["close", "volume"], overlay: false,
      definition: "kumuliertes Volumen mit Vorzeichen der Schlusskursaenderung, Start 0", warmup: function () { return 0; } },
    { id: "mfi", family: "VOLUME", name: "Money Flow Index (MFI)", params: { period: 14 }, inputs: ["high", "low", "close", "volume"], overlay: false,
      definition: "100 − 100/(1 + positiver/negativer Geldfluss), Geldfluss = TP·Volumen", warmup: function (p) { return p.period; } },
    { id: "relativeVolume", family: "VOLUME", name: "Relative Volumenstaerke", params: { period: 20 }, inputs: ["volume"], overlay: false,
      definition: "Volumen / Median der vorherigen n Volumina", warmup: function (p) { return p.period; } },
    { id: "volumeSpikes", family: "VOLUME", name: "Volumenspitzen", params: { period: 20, threshold: 2 }, inputs: ["volume"], overlay: false,
      definition: "relative Volumenstaerke >= Schwelle", warmup: function (p) { return p.period; } }
  ];

  function catalogEntry(id) { for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) return CATALOG[i]; return null; }

  /**
   * Berechnet einen Indikator aus dem Katalog auf einer Serie {open,high,low,close,volume} (Spalten).
   * @returns {{id, params, warmup, values}|{id, error}}  values: Array oder Objekt aus Arrays
   */
  function compute(series, id, params) {
    var entry = catalogEntry(id);
    if (!entry) return { id: id, error: "UNKNOWN_INDICATOR" };
    var p = Object.assign({}, entry.params, params || {});
    for (var k in p) if (!isNum(p[k]) || p[k] < 0 || (k !== "multiplier" && k !== "k" && k !== "threshold" && (p[k] < 1 || p[k] !== Math.floor(p[k])))) return { id: id, error: "INVALID_PARAM:" + k };
    var missing = entry.inputs.filter(function (c) { return !series[c] || !series[c].some(isNum); });
    if (missing.length) return { id: id, error: "MISSING_INPUT:" + missing.join(",") };
    var s = series, v;
    switch (id) {
      case "sma": v = F.sma(col(s.close), p.period); break;
      case "ema": v = F.ema(col(s.close), p.period); break;
      case "wma": v = wma(s.close, p.period); break;
      case "adx": v = F.adx(col(s.high), col(s.low), col(s.close), p.period); break;
      case "supertrend": v = supertrend(s.high, s.low, s.close, p.period, p.multiplier); break;
      case "donchian": v = donchian(s.high, s.low, p.period); break;
      case "rsi": v = F.rsi(col(s.close), p.period); break;
      case "macd": v = macd(s.close, p.fast, p.slow, p.signal); break;
      case "stochastic": v = stochastic(s.high, s.low, s.close, p.kPeriod, p.smooth, p.dPeriod); break;
      case "roc": v = roc(s.close, p.period); break;
      case "cci": v = cci(s.high, s.low, s.close, p.period); break;
      case "atr": v = atr(s.high, s.low, s.close, p.period); break;
      case "bollinger": v = bollinger(s.close, p.period, p.k); break;
      case "keltner": v = keltner(s.high, s.low, s.close, p.period, p.multiplier, p.atrPeriod); break;
      case "obv": v = obv(s.close, s.volume); break;
      case "mfi": v = mfi(s.high, s.low, s.close, s.volume, p.period); break;
      case "relativeVolume": v = relativeVolume(s.volume, p.period); break;
      case "volumeSpikes": v = volumeSpikes(s.volume, p.period, p.threshold); break;
    }
    return { id: id, version: INDICATORS_VERSION, params: p, warmup: entry.warmup(p), values: v };
  }

  var api = {
    INDICATORS_VERSION: INDICATORS_VERSION, CATALOG: CATALOG, catalogEntry: catalogEntry, compute: compute,
    /* wiederverwendet (eine Mathematik mit feature-store.js) */
    sma: F.sma, ema: F.ema, rsi: F.rsi, adx: F.adx, trueRange: F.trueRange, wilder: F.wilder,
    /* neu */
    wma: wma, donchian: donchian, supertrend: supertrend, macd: macd, roc: roc, stochastic: stochastic, cci: cci,
    atr: atr, bollinger: bollinger, keltner: keltner, obv: obv, mfi: mfi, relativeVolume: relativeVolume, volumeSpikes: volumeSpikes,
    rollingHigh: rollingHigh, rollingLow: rollingLow
  };

  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Indicators = api; }
})(typeof window !== "undefined" ? window : globalThis);
