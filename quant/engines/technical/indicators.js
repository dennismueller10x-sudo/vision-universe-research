/* =========================================================================
   VISION UNIVERSE TECHNICAL — indicators.js
   INDIKATOR-KATALOG FUER DIE PRODUKTWELT TECHNICAL

   Eine Stelle, an der jeder Indikator, den Technical anzeigt oder filtert,
   mit Definition, Parametern und Aufwaermperiode steht. Die Mathematik der
   bereits geprueften Primitive kommt aus feature-store.js (SMA, EMA,
   Wilder/RMA, True Range, RSI, ADX, rollierende Extreme und Streuung,
   Median-Volumenbasis) und wird hier NICHT neu geschrieben. Neu sind nur
   Indikatoren, die es im Bestand nicht gab (WMA, Supertrend, Donchian-Kanal,
   Stochastik, CCI, Bollinger-/Keltner-Baender, OBV, MFI, Volumenspitzen;
   seit 1.1.0 Williams %R, Aroon, Parabolic SAR, Ichimoku, CMF, VWMA).

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

  var INDICATORS_VERSION = "technical-indicators-1.1.1";

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

  /**
   * Parabolic SAR (Wilder 1978). Start: Richtung aus C_1 gegen C_0, SAR = Extrem der Gegenseite der ersten Bar,
   * Extrempunkt (EP) = Extrem der Richtungsseite. Je Bar: SAR += AF·(EP − SAR), begrenzt durch die Tiefs (lang)
   * bzw. Hochs (kurz) der zwei Vorbars; AF startet bei `step`, steigt bei jedem neuen EP um `step` bis `max`.
   * Durchbricht das Tief (lang) bzw. Hoch (kurz) den SAR, kehrt die Richtung: SAR = alter EP, mindestens das Hoch
   * (neu kurz) bzw. hoechstens das Tief (neu lang) der Umkehrbar, damit der SAR nie in ihrer Spanne liegt (Wilder,
   * wie TA-Lib; seit 1.1.1), AF = step.
   * Eine Luecke in H/L/C setzt die Berechnung zurueck (neuer Start nach zwei gueltigen Bars).
   */
  function psar(high, low, close, step, max) {
    var h = col(high), l = col(low), c = col(close), n = c.length, out = arr(n), dir = arr(n);
    var up = 0, sar = NaN, ep = NaN, af = step, start = -1;
    for (var i = 0; i < n; i++) {
      if (!isNum(h[i]) || !isNum(l[i]) || !isNum(c[i])) { start = -1; continue; }
      if (start < 0) { start = i; continue; }
      if (i === start + 1) {
        up = c[i] >= c[start] ? 1 : -1;
        sar = up > 0 ? Math.min(l[start], l[i]) : Math.max(h[start], h[i]);
        ep = up > 0 ? Math.max(h[start], h[i]) : Math.min(l[start], l[i]);
        af = step; out[i] = sar; dir[i] = up; continue;
      }
      var next = sar + af * (ep - sar);
      if (up > 0) {
        next = Math.min(next, l[i - 1], l[i - 2]);
        if (l[i] < next) { up = -1; next = Math.max(ep, h[i]); ep = l[i]; af = step; }
        else if (h[i] > ep) { ep = h[i]; af = Math.min(max, af + step); }
      } else {
        next = Math.max(next, h[i - 1], h[i - 2]);
        if (h[i] > next) { up = 1; next = Math.min(ep, l[i]); ep = h[i]; af = step; }
        else if (l[i] < ep) { ep = l[i]; af = Math.min(max, af + step); }
      }
      sar = next; out[i] = sar; dir[i] = up;
    }
    return { sar: out, direction: dir };
  }

  /**
   * Ichimoku (Hosoda): Tenkan = Mitte von HH/LL der letzten t Bars, Kijun = dasselbe ueber k Bars,
   * Senkou A = (Tenkan + Kijun)/2, Senkou B = Mitte von HH/LL der letzten b Bars.
   * Kausal: spanA/spanB sind an der Bar ihrer Berechnung abgelegt. Die Wolke, die an Bar i gilt,
   * ist cloudA/cloudB = spanA/spanB von Bar i − displacement (klassisch nach vorn verschoben gezeichnet).
   * Die Chikou-Linie (Schluss um displacement Bars zurueck verschoben) entfaellt: Sie zeigt an Bar i
   * einen Wert, der erst bei i + displacement bekannt ist.
   */
  function ichimoku(high, low, tenkanPeriod, kijunPeriod, spanBPeriod, displacement) {
    function mid(p) { var d = donchian(high, low, p); return d.middle; }
    var tenkan = mid(tenkanPeriod), kijun = mid(kijunPeriod), spanB = mid(spanBPeriod), n = tenkan.length;
    var spanA = tenkan.map(function (t, i) { return isNum(t) && isNum(kijun[i]) ? (t + kijun[i]) / 2 : NaN; });
    var cloudA = arr(n), cloudB = arr(n);
    for (var i = displacement; i < n; i++) { cloudA[i] = spanA[i - displacement]; cloudB[i] = spanB[i - displacement]; }
    return { tenkan: tenkan, kijun: kijun, spanA: spanA, spanB: spanB, cloudA: cloudA, cloudB: cloudB };
  }

  /** VWMA_n = Σ C·V / Σ V ueber die letzten n Bars. Fehlt ein Wert oder ist ΣV = 0: NaN. */
  function vwma(close, volume, period) {
    var c = col(close), v = col(volume), n = c.length, out = arr(n);
    for (var i = period - 1; i < n; i++) {
      var pv = 0, sv = 0, ok = true;
      for (var j = i - period + 1; j <= i; j++) { if (!isNum(c[j]) || !isNum(v[j])) { ok = false; break; } pv += c[j] * v[j]; sv += v[j]; }
      if (ok && sv > 0) out[i] = pv / sv;
    }
    return out;
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

  /** Williams %R_n = −100·(HH_n − C)/(HH_n − LL_n), Bereich −100..0. Keine Spanne: −50. */
  function williamsR(high, low, close, period) {
    var hh = F.rollingMax(col(high), period), ll = F.rollingMin(col(low), period), c = col(close);
    return c.map(function (v, i) {
      if (!isNum(v) || !isNum(hh[i]) || !isNum(ll[i])) return NaN;
      var span = hh[i] - ll[i];
      return span > 0 ? -100 * (hh[i] - v) / span : -50;
    });
  }

  /**
   * Aroon_n (Chande): Fenster = die letzten n+1 Bars (i−n..i). Up = 100·(n − Bars seit dem hoechsten Hoch)/n,
   * Down entsprechend mit dem tiefsten Tief; bei Gleichstand zaehlt das juengste Extrem. Oszillator = Up − Down.
   */
  function aroon(high, low, period) {
    var h = col(high), l = col(low), n = h.length, upA = arr(n), downA = arr(n), osc = arr(n);
    for (var i = period; i < n; i++) {
      var hi = -Infinity, hiAt = -1, lo = Infinity, loAt = -1, ok = true;
      for (var j = i - period; j <= i; j++) {
        if (!isNum(h[j]) || !isNum(l[j])) { ok = false; break; }
        if (h[j] >= hi) { hi = h[j]; hiAt = j; }
        if (l[j] <= lo) { lo = l[j]; loAt = j; }
      }
      if (!ok) continue;
      upA[i] = 100 * (period - (i - hiAt)) / period;
      downA[i] = 100 * (period - (i - loAt)) / period;
      osc[i] = upA[i] - downA[i];
    }
    return { up: upA, down: downA, oscillator: osc };
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

  /**
   * Chaikin Money Flow_n = Σ MFV / Σ V, MFV = V·((C − L) − (H − C))/(H − L). H = L ergibt Multiplikator 0.
   * Bereich −1..+1. Fehlt ein Wert im Fenster oder ist ΣV = 0: NaN.
   */
  function cmf(high, low, close, volume, period) {
    var h = col(high), l = col(low), c = col(close), v = col(volume), n = c.length, mfv = arr(n), out = arr(n);
    for (var i = 0; i < n; i++) {
      if (!isNum(h[i]) || !isNum(l[i]) || !isNum(c[i]) || !isNum(v[i])) continue;
      var span = h[i] - l[i];
      mfv[i] = span > 0 ? v[i] * ((c[i] - l[i]) - (h[i] - c[i])) / span : 0;
    }
    for (var k = period - 1; k < n; k++) {
      var sm = 0, sv = 0, ok = true;
      for (var j = k - period + 1; j <= k; j++) { if (!isNum(mfv[j])) { ok = false; break; } sm += mfv[j]; sv += v[j]; }
      if (ok && sv > 0) out[k] = sm / sv;
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
    { id: "psar", family: "TREND", name: "Parabolic SAR", params: { step: 0.02, max: 0.2 }, inputs: ["high", "low", "close"], overlay: true,
      definition: "Wilder: SAR += AF·(Extrempunkt − SAR), AF steigt je neuem Extrem um step bis max; Umkehr beim Durchbruch", warmup: function () { return 1; } },
    { id: "ichimoku", family: "TREND", name: "Ichimoku-Wolke", params: { tenkanPeriod: 9, kijunPeriod: 26, spanBPeriod: 52, displacement: 26 }, inputs: ["high", "low"], overlay: true,
      definition: "Tenkan/Kijun = Mitte von Hoch und Tief ueber 9/26 Bars; Wolke = Senkou A (Mittel beider) und Senkou B (52 Bars), um 26 Bars verschoben; ohne Chikou (nicht kausal)",
      warmup: function (p) { return p.spanBPeriod - 1 + p.displacement; } },
    { id: "vwma", family: "TREND", name: "Volumengewichteter Durchschnitt (VWMA)", params: { period: 20 }, inputs: ["close", "volume"], overlay: true,
      definition: "Σ Schluss·Volumen / Σ Volumen der letzten n Bars", warmup: function (p) { return p.period - 1; } },
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
    { id: "williamsR", family: "MOMENTUM", name: "Williams %R", params: { period: 14 }, inputs: ["high", "low", "close"], overlay: false,
      definition: "−100·(HH − C)/(HH − LL) ueber n Bars, Bereich −100 bis 0", warmup: function (p) { return p.period - 1; } },
    { id: "aroon", family: "MOMENTUM", name: "Aroon", params: { period: 25 }, inputs: ["high", "low"], overlay: false,
      definition: "Up/Down = 100·(n − Bars seit Hoch/Tief)/n im Fenster der letzten n+1 Bars; Oszillator = Up − Down", warmup: function (p) { return p.period; } },
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
    { id: "cmf", family: "VOLUME", name: "Chaikin Money Flow (CMF)", params: { period: 20 }, inputs: ["high", "low", "close", "volume"], overlay: false,
      definition: "Σ Volumen·((C−L)−(H−C))/(H−L) / Σ Volumen ueber n Bars, Bereich −1 bis +1", warmup: function (p) { return p.period - 1; } },
    { id: "relativeVolume", family: "VOLUME", name: "Relative Volumenstaerke", params: { period: 20 }, inputs: ["volume"], overlay: false,
      definition: "Volumen / Median der vorherigen n Volumina", warmup: function (p) { return p.period; } },
    { id: "volumeSpikes", family: "VOLUME", name: "Volumenspitzen", params: { period: 20, threshold: 2 }, inputs: ["volume"], overlay: false,
      definition: "relative Volumenstaerke >= Schwelle", warmup: function (p) { return p.period; } }
  ];

  var FRACTIONAL = ["multiplier", "k", "threshold", "step", "max"];
  function catalogEntry(id) { for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) return CATALOG[i]; return null; }

  /**
   * Berechnet einen Indikator aus dem Katalog auf einer Serie {open,high,low,close,volume} (Spalten).
   * @returns {{id, params, warmup, values}|{id, error}}  values: Array oder Objekt aus Arrays
   */
  function compute(series, id, params) {
    var entry = catalogEntry(id);
    if (!entry) return { id: id, error: "UNKNOWN_INDICATOR" };
    var p = Object.assign({}, entry.params, params || {});
    for (var k in p) if (!isNum(p[k]) || p[k] < 0 || (FRACTIONAL.indexOf(k) < 0 && (p[k] < 1 || p[k] !== Math.floor(p[k])))) return { id: id, error: "INVALID_PARAM:" + k };
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
      case "psar": v = psar(s.high, s.low, s.close, p.step, p.max); break;
      case "ichimoku": v = ichimoku(s.high, s.low, p.tenkanPeriod, p.kijunPeriod, p.spanBPeriod, p.displacement); break;
      case "vwma": v = vwma(s.close, s.volume, p.period); break;
      case "williamsR": v = williamsR(s.high, s.low, s.close, p.period); break;
      case "aroon": v = aroon(s.high, s.low, p.period); break;
      case "cmf": v = cmf(s.high, s.low, s.close, s.volume, p.period); break;
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
    rollingHigh: rollingHigh, rollingLow: rollingLow,
    psar: psar, ichimoku: ichimoku, vwma: vwma, williamsR: williamsR, aroon: aroon, cmf: cmf
  };

  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Indicators = api; }
})(typeof window !== "undefined" ? window : globalThis);
