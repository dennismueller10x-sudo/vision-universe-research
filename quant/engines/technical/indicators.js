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
   seit 1.1.0 Williams %R, Aroon, Parabolic SAR, Ichimoku, CMF, VWMA;
   seit 1.2.0 Pivot-Punkte, ROC 63/126/252, TRIX, Ultimate Oscillator, CMO,
   KAMA, Hull MA, Chandelier Exit, Regressionskanal, Inside Bar, NR7,
   Heikin-Ashi; seit 1.3.0 DEMA, TEMA, TRIMA, T3, ZLEMA, ALMA, McGinley,
   PPO, Stochastic RSI, NATR, A/D-Linie, Chaikin-Oszillator, Balance of
   Power, Momentum, Standardabweichung, R² des Regressionskanals; seit 1.4.0
   Vortex, Mass Index, Choppiness, Ulcer Index, Force Index, Elder Ray,
   Ease of Movement, Awesome Oscillator, Coppock, KST, TSI, DPO, historische
   Volatilitaet, Z-Score, NVI/PVI, PVO, Connors RSI, Elder Impulse,
   Chaikin-Volatilitaet, Envelope, Pivot-Varianten Fibonacci/Camarilla/Woodie). Die
   Eintraege ab 1.2.0 tragen `catalogOnly: true`: Sie stehen
   im Katalog und in compute(), aber noch in keiner Produktflaeche
   (Methodik-Seite, Screener-Felder, Abfragekatalog). Sie dort freizugeben,
   ist eine Fachmodellaenderung mit eigenem PR. Uebersicht:
   docs/technical/INDICATORS_CATALOG.md.

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

  var INDICATORS_VERSION = "technical-indicators-1.6.0";

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
   * wie TA-Lib; seit 1.2.1), AF = step.
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

  /* ------------------------------------------- Katalogerweiterung 1.2.0 (B6) */

  /**
   * Klassische Floor-Pivots aus der VORBAR (i−1): P = (H+L+C)/3, R1 = 2P − L, S1 = 2P − H,
   * R2 = P + (H − L), S2 = P − (H − L). Kausal: Der Wert an i ist schon zur Eroeffnung von i bekannt.
   * Fehlt H, L oder C der Vorbar: NaN.
   */
  function pivots(high, low, close) {
    var h = col(high), l = col(low), c = col(close), n = c.length;
    var p = arr(n), r1 = arr(n), r2 = arr(n), s1 = arr(n), s2 = arr(n);
    for (var i = 1; i < n; i++) {
      var H = h[i - 1], L = l[i - 1], C = c[i - 1];
      if (!isNum(H) || !isNum(L) || !isNum(C)) continue;
      var P = (H + L + C) / 3, R = H - L;
      p[i] = P; r1[i] = 2 * P - L; s1[i] = 2 * P - H; r2[i] = P + R; s2[i] = P - R;
    }
    return { pivot: p, r1: r1, r2: r2, s1: s1, s2: s2 };
  }

  /**
   * TRIX (Hutson): E3 = EMA_n(EMA_n(EMA_n(C))), TRIX = 100·(E3_i / E3_{i−1} − 1) in Prozent,
   * Signal = EMA_s(TRIX). EMA wie feature-store.js (Start SMA_n, dann rekursiv).
   */
  function trix(close, period, signal) {
    var e3 = F.ema(F.ema(F.ema(col(close), period), period), period), n = e3.length, t = arr(n);
    for (var i = 1; i < n; i++) if (isNum(e3[i]) && isNum(e3[i - 1]) && e3[i - 1] !== 0) t[i] = 100 * (e3[i] / e3[i - 1] - 1);
    return { trix: t, signal: F.ema(t, signal) };
  }

  /**
   * Ultimate Oscillator (Williams 1985): BP = C − min(L, C_{−1}), TR = max(H, C_{−1}) − min(L, C_{−1});
   * A_n = Σ_n BP / Σ_n TR; UO = 100·(4·A_kurz + 2·A_mittel + A_lang)/7. Erste Bar ohne Vorschluss liefert
   * kein BP/TR. Ist eine Fenstersumme der TR 0 (keine Spanne): 50 (Mitte). Fehlt ein Wert im Fenster: NaN.
   */
  function ultimateOscillator(high, low, close, shortP, mediumP, longP) {
    var h = col(high), l = col(low), c = col(close), n = c.length, bp = arr(n), tr = arr(n), out = arr(n);
    for (var i = 1; i < n; i++) {
      if (!isNum(h[i]) || !isNum(l[i]) || !isNum(c[i]) || !isNum(c[i - 1])) continue;
      var lo = Math.min(l[i], c[i - 1]);
      bp[i] = c[i] - lo; tr[i] = Math.max(h[i], c[i - 1]) - lo;
    }
    function avg(i, p) {
      var sb = 0, st = 0;
      for (var j = i - p + 1; j <= i; j++) { if (j < 1 || !isNum(bp[j])) return NaN; sb += bp[j]; st += tr[j]; }
      return st > 0 ? sb / st : 0.5;
    }
    for (var k = Math.max(shortP, mediumP, longP); k < n; k++) {
      var a = avg(k, shortP), b = avg(k, mediumP), d = avg(k, longP);
      if (isNum(a) && isNum(b) && isNum(d)) out[k] = 100 * (4 * a + 2 * b + d) / 7;
    }
    return out;
  }

  /**
   * Chande Momentum Oscillator (Chande/Kroll 1994, ungeglaettet): ueber die letzten n Schlusskursaenderungen
   * Su = Σ Anstiege, Sd = Σ |Rueckgaenge|; CMO = 100·(Su − Sd)/(Su + Sd), Bereich −100..+100. Su + Sd = 0: 0.
   * (TA-Lib glaettet nach Wilder; hier die Originaldefinition mit einfachen Summen.)
   */
  function cmo(close, period) {
    var c = col(close), n = c.length, out = arr(n);
    for (var i = period; i < n; i++) {
      var up = 0, dn = 0, ok = true;
      for (var j = i - period + 1; j <= i; j++) {
        if (!isNum(c[j]) || !isNum(c[j - 1])) { ok = false; break; }
        var d = c[j] - c[j - 1];
        if (d > 0) up += d; else dn -= d;
      }
      if (ok) out[i] = up + dn > 0 ? 100 * (up - dn) / (up + dn) : 0;
    }
    return out;
  }

  /**
   * KAMA (Kaufman): ER = |C_i − C_{i−n}| / Σ_{j=i−n+1..i} |C_j − C_{j−1}| (0, wenn der Nenner 0 ist),
   * SC = (ER·(2/(f+1) − 2/(s+1)) + 2/(s+1))², KAMA_i = KAMA_{i−1} + SC·(C_i − KAMA_{i−1}).
   * Start: KAMA_{n−1} = C_{n−1} (Startwert, nicht ausgegeben), erster Wert an Bar n.
   * Fehlt ein Wert im ER-Fenster: NaN an dieser Bar, der letzte Zustand wird weitergetragen.
   */
  function kama(close, period, fast, slow) {
    var c = col(close), n = c.length, out = arr(n), fsc = 2 / (fast + 1), ssc = 2 / (slow + 1), prev = NaN;
    for (var i = period; i < n; i++) {
      var vol = 0, ok = isNum(c[i]) && isNum(c[i - period]);
      for (var j = i - period + 1; ok && j <= i; j++) { if (!isNum(c[j - 1]) || !isNum(c[j])) ok = false; else vol += Math.abs(c[j] - c[j - 1]); }
      if (!ok) continue;
      if (!isNum(prev)) prev = c[i - 1];
      var er = vol > 0 ? Math.abs(c[i] - c[i - period]) / vol : 0, sc = Math.pow(er * (fsc - ssc) + ssc, 2);
      prev = prev + sc * (c[i] - prev);
      out[i] = prev;
    }
    return out;
  }

  /**
   * Hull Moving Average (Hull 2005): HMA_n = WMA_{⌊√n⌋}(2·WMA_{⌊n/2⌋}(C) − WMA_n(C)).
   * Erster Wert an Bar (n − 1) + (⌊√n⌋ − 1). n < 2: keine Werte.
   */
  function hma(close, period) {
    var c = col(close), n = c.length, half = Math.floor(period / 2), root = Math.floor(Math.sqrt(period));
    if (half < 1 || root < 1) return arr(n);
    var wh = wma(c, half), wf = wma(c, period);
    return wma(wh.map(function (v, i) { return isNum(v) && isNum(wf[i]) ? 2 * v - wf[i] : NaN; }), root);
  }

  /**
   * Chandelier Exit (LeBeau): lang = hoechstes Hoch_n − m·ATR_n, kurz = tiefstes Tief_n + m·ATR_n
   * (ATR nach Wilder wie atr(); Extreme ueber die letzten n Bars inkl. i).
   */
  function chandelier(high, low, close, period, multiplier) {
    var hh = F.rollingMax(col(high), period), ll = F.rollingMin(col(low), period), a = atr(high, low, close, period);
    return {
      long: hh.map(function (v, i) { return isNum(v) && isNum(a[i]) ? v - multiplier * a[i] : NaN; }),
      short: ll.map(function (v, i) { return isNum(v) && isNum(a[i]) ? v + multiplier * a[i] : NaN; })
    };
  }

  /**
   * Linearer Regressionskanal ueber die letzten n Schlusskurse (x = 0..n−1, KQ-Gerade):
   * value = Gerade am juengsten Punkt (x = n−1), slope = Steigung je Bar,
   * upper/lower = value ± k·σ der Residuen (Populationsstreuung, wie Bollinger), r2 = Bestimmtheitsmass
   * 1 − SS_res/SS_tot (seit 1.3.0; konstante Reihe: NaN, weil es nichts zu erklaeren gibt). Fehlt ein Wert: NaN.
   */
  function linreg(close, period, k) {
    var c = col(close), n = c.length, val = arr(n), slope = arr(n), up = arr(n), lo = arr(n), r2 = arr(n);
    var mx = (period - 1) / 2, sxx = 0;
    for (var x = 0; x < period; x++) sxx += (x - mx) * (x - mx);
    for (var i = period - 1; i < n; i++) {
      var my = 0, ok = true;
      for (var j = 0; j < period; j++) { var y = c[i - period + 1 + j]; if (!isNum(y)) { ok = false; break; } my += y; }
      if (!ok) continue;
      my /= period;
      var sxy = 0;
      for (var q = 0; q < period; q++) sxy += (q - mx) * (c[i - period + 1 + q] - my);
      var b = sxx > 0 ? sxy / sxx : 0, a0 = my - b * mx, ss = 0, st = 0;
      for (var r = 0; r < period; r++) { var y0 = c[i - period + 1 + r], e = y0 - (a0 + b * r); ss += e * e; st += (y0 - my) * (y0 - my); }
      var sd = Math.sqrt(ss / period);
      val[i] = a0 + b * (period - 1); slope[i] = b; up[i] = val[i] + k * sd; lo[i] = val[i] - k * sd;
      if (st > 0) r2[i] = 1 - ss / st;
    }
    return { value: val, slope: slope, upper: up, lower: lo, r2: r2 };
  }

  /** Inside Bar: H_i < H_{i−1} und L_i > L_{i−1} (strikt). 1/0, NaN ohne Vorbar oder bei fehlendem Wert. */
  function insideBar(high, low) {
    var h = col(high), l = col(low), n = h.length, out = arr(n);
    for (var i = 1; i < n; i++) if (isNum(h[i]) && isNum(l[i]) && isNum(h[i - 1]) && isNum(l[i - 1])) out[i] = h[i] < h[i - 1] && l[i] > l[i - 1] ? 1 : 0;
    return out;
  }

  /**
   * NR_n (Crabel, Standard n = 7): Spanne H_i − L_i ist die kleinste der letzten n Spannen (inkl. i);
   * Gleichstand mit einer Vorbar zaehlt als schmalste. 1/0, NaN waehrend der Aufwaermphase oder bei Luecken.
   */
  function narrowRange(high, low, period) {
    var h = col(high), l = col(low), n = h.length, out = arr(n);
    for (var i = period - 1; i < n; i++) {
      var ok = isNum(h[i]) && isNum(l[i]), r = h[i] - l[i], narrow = true;
      for (var j = i - period + 1; ok && j < i; j++) { if (!isNum(h[j]) || !isNum(l[j])) ok = false; else if (h[j] - l[j] < r) narrow = false; }
      if (ok) out[i] = narrow ? 1 : 0;
    }
    return out;
  }

  /**
   * Heikin-Ashi: HC = (O+H+L+C)/4; HO_0 = (O_0 + C_0)/2, danach HO_i = (HO_{i−1} + HC_{i−1})/2;
   * HH = max(H, HO, HC), HL = min(L, HO, HC). Lueckenbar: NaN, die Rekursion setzt an der letzten
   * gueltigen Heikin-Ashi-Bar fort.
   */
  function heikinAshi(open, high, low, close) {
    var o = col(open), h = col(high), l = col(low), c = col(close), n = c.length;
    var ho = arr(n), hh = arr(n), hl = arr(n), hc = arr(n), po = NaN, pc = NaN;
    for (var i = 0; i < n; i++) {
      if (!isNum(o[i]) || !isNum(h[i]) || !isNum(l[i]) || !isNum(c[i])) continue;
      hc[i] = (o[i] + h[i] + l[i] + c[i]) / 4;
      ho[i] = isNum(po) ? (po + pc) / 2 : (o[i] + c[i]) / 2;
      hh[i] = Math.max(h[i], ho[i], hc[i]); hl[i] = Math.min(l[i], ho[i], hc[i]);
      po = ho[i]; pc = hc[i];
    }
    return { open: ho, high: hh, low: hl, close: hc };
  }

  /* ------------------------------------------- Katalogerweiterung 1.3.0 (L2a) */

  /** Elementweise Verknuepfung zweier Reihen; NaN, sobald ein Eingang fehlt. */
  function zip2(a, b, f) { return a.map(function (v, i) { return isNum(v) && isNum(b[i]) ? f(v, b[i]) : NaN; }); }

  /**
   * DEMA (Mulloy 1994): 2·E1 − E2, E1 = EMA_n(C), E2 = EMA_n(E1). Jede EMA wie feature-store.js
   * (Start SMA_n ihrer Eingabe), E2 startet also n − 1 Bars nach E1.
   */
  function dema(close, period) {
    var e1 = F.ema(col(close), period), e2 = F.ema(e1, period);
    return zip2(e1, e2, function (a, b) { return 2 * a - b; });
  }

  /** TEMA (Mulloy 1994): 3·E1 − 3·E2 + E3, E3 = EMA_n(E2). */
  function tema(close, period) {
    var e1 = F.ema(col(close), period), e2 = F.ema(e1, period), e3 = F.ema(e2, period);
    return e1.map(function (v, i) { return isNum(v) && isNum(e2[i]) && isNum(e3[i]) ? 3 * v - 3 * e2[i] + e3[i] : NaN; });
  }

  /**
   * TRIMA (dreieckig gewichteter Durchschnitt): SMA_a(SMA_b(C)), ungerades n: a = b = (n+1)/2,
   * gerades n: a = n/2, b = n/2 + 1. Gewichte 1, 2, …, Mitte, …, 2, 1 (wie TA-Lib).
   */
  function trima(close, period) {
    var a = period % 2 ? (period + 1) / 2 : period / 2, b = period % 2 ? a : period / 2 + 1;
    return F.sma(F.sma(col(close), b), a);
  }

  /**
   * T3 (Tillson 1998): sechsfach verkettete EMA_n, T3 = c1·E6 + c2·E5 + c3·E4 + c4·E3 mit
   * Volumenfaktor v: c1 = −v³, c2 = 3v² + 3v³, c3 = −6v² − 3v − 3v³, c4 = 1 + 3v + v³ + 3v².
   */
  function t3(close, period, vfactor) {
    var v = vfactor, e = [F.ema(col(close), period)];
    for (var k = 1; k < 6; k++) e.push(F.ema(e[k - 1], period));
    var c1 = -v * v * v, c2 = 3 * v * v + 3 * v * v * v, c3 = -6 * v * v - 3 * v - 3 * v * v * v, c4 = 1 + 3 * v + v * v * v + 3 * v * v;
    return e[5].map(function (x, i) { return isNum(x) && isNum(e[4][i]) && isNum(e[3][i]) && isNum(e[2][i]) ? c1 * x + c2 * e[4][i] + c3 * e[3][i] + c4 * e[2][i] : NaN; });
  }

  /**
   * ZLEMA (Ehlers/Way 2010): EMA_n(2·C_i − C_{i−lag}), lag = ⌊(n−1)/2⌋. Der Vorgriff auf die
   * Steigung kompensiert die Verzoegerung; kausal, weil nur C_{i−lag} benutzt wird.
   */
  function zlema(close, period) {
    var c = col(close), lag = Math.floor((period - 1) / 2), x = arr(c.length);
    for (var i = lag; i < c.length; i++) if (isNum(c[i]) && isNum(c[i - lag])) x[i] = 2 * c[i] - c[i - lag];
    return F.ema(x, period);
  }

  /**
   * ALMA (Arnaud Legoux): Gauss-Gewichte w_j = exp(−(j − m)²/(2s²)), j = 0 (aeltester) … n−1,
   * m = offset·(n − 1), s = n/sigma; Wert = Σ w_j·C_j / Σ w_j. Fehlt ein Wert im Fenster: NaN.
   */
  function alma(close, period, offset, sigma) {
    var c = col(close), n = c.length, out = arr(n), m = offset * (period - 1), s = period / sigma, w = [], ws = 0;
    for (var j = 0; j < period; j++) { w.push(Math.exp(-((j - m) * (j - m)) / (2 * s * s))); ws += w[j]; }
    for (var i = period - 1; i < n; i++) {
      var acc = 0, ok = true;
      for (var q = 0; q < period; q++) { var y = c[i - period + 1 + q]; if (!isNum(y)) { ok = false; break; } acc += w[q] * y; }
      if (ok) out[i] = acc / ws;
    }
    return out;
  }

  /**
   * McGinley Dynamic (1990): MD_i = MD_{i−1} + (C_i − MD_{i−1}) / (n·(C_i/MD_{i−1})⁴).
   * Start MD_{n−1} = SMA_n (wie die EMA). Lueckenbar: NaN, der Zustand bleibt.
   */
  function mcginley(close, period) {
    var c = col(close), n = c.length, out = arr(n), seed = F.sma(c, period), prev = NaN;
    for (var i = 0; i < n; i++) {
      if (!isNum(prev)) { if (isNum(seed[i])) { prev = seed[i]; out[i] = prev; } continue; }
      if (!isNum(c[i]) || prev <= 0 || c[i] <= 0) continue;
      prev = prev + (c[i] - prev) / (period * Math.pow(c[i] / prev, 4));
      out[i] = prev;
    }
    return out;
  }

  /** PPO (Percentage Price Oscillator): 100·(EMA_f − EMA_s)/EMA_s, Signal = EMA_sig(PPO), Histogramm = PPO − Signal. */
  function ppo(close, fast, slow, signal) {
    var c = col(close), f = F.ema(c, fast), s = F.ema(c, slow);
    var p = zip2(f, s, function (a, b) { return b !== 0 ? 100 * (a - b) / b : NaN; }), sig = F.ema(p, signal);
    return { ppo: p, signal: sig, histogram: zip2(p, sig, function (a, b) { return a - b; }) };
  }

  /**
   * Stochastic RSI (Chande/Kroll 1994): roh = 100·(RSI − min RSI_m)/(max RSI_m − min RSI_m) ueber m Bars,
   * %K = SMA_k(roh), %D = SMA_d(%K). Keine Spanne (max = min): 50 (Mitte), wie stochastic().
   */
  function stochRsi(close, rsiPeriod, stochPeriod, kSmooth, dPeriod) {
    var r = F.rsi(col(close), rsiPeriod), hh = F.rollingMax(r, stochPeriod), ll = F.rollingMin(r, stochPeriod), n = r.length, raw = arr(n);
    for (var i = 0; i < n; i++) {
      if (!isNum(r[i]) || !isNum(hh[i]) || !isNum(ll[i])) continue;
      var span = hh[i] - ll[i];
      raw[i] = span > 0 ? 100 * (r[i] - ll[i]) / span : 50;
    }
    var k = kSmooth > 1 ? F.sma(raw, kSmooth) : raw;
    return { k: k, d: F.sma(k, dPeriod), raw: raw };
  }

  /** NATR = 100·ATR_n/C (ATR nach Wilder wie atr()), in Prozent des Schlusskurses. */
  function natr(high, low, close, period) {
    return zip2(atr(high, low, close, period), col(close), function (a, c) { return c !== 0 ? 100 * a / c : NaN; });
  }

  /**
   * Akkumulation/Distribution (Chaikin): AD_i = AD_{i−1} + V_i·((C−L) − (H−C))/(H−L); H = L: Beitrag 0.
   * Start mit dem Beitrag der ersten Bar. Fehlende Bar: NaN, die Summe laeuft weiter.
   */
  function adLine(high, low, close, volume) {
    var h = col(high), l = col(low), c = col(close), v = col(volume), n = c.length, out = arr(n), sum = 0;
    for (var i = 0; i < n; i++) {
      if (!isNum(h[i]) || !isNum(l[i]) || !isNum(c[i]) || !isNum(v[i])) continue;
      var span = h[i] - l[i];
      sum += span > 0 ? v[i] * ((c[i] - l[i]) - (h[i] - c[i])) / span : 0;
      out[i] = sum;
    }
    return out;
  }

  /** Chaikin-Oszillator: EMA_f(AD) − EMA_s(AD) (EMA wie feature-store.js, Start SMA). */
  function chaikinOsc(high, low, close, volume, fast, slow) {
    var ad = adLine(high, low, close, volume);
    return zip2(F.ema(ad, fast), F.ema(ad, slow), function (a, b) { return a - b; });
  }

  /**
   * Balance of Power (Livshits 2001): BOP = (C − O)/(H − L), H = L: 0. Bereich −1 … +1.
   * `smoothed` = SMA_n(BOP), die uebliche Lesart.
   */
  function balanceOfPower(open, high, low, close, period) {
    var o = col(open), h = col(high), l = col(low), c = col(close), n = c.length, b = arr(n);
    for (var i = 0; i < n; i++) if (isNum(o[i]) && isNum(h[i]) && isNum(l[i]) && isNum(c[i])) b[i] = h[i] > l[i] ? (c[i] - o[i]) / (h[i] - l[i]) : 0;
    return { bop: b, smoothed: F.sma(b, period) };
  }

  /** Momentum: C_i − C_{i−n} (absolute Kursaenderung, im Gegensatz zum prozentualen ROC). */
  function momentum(close, period) {
    var c = col(close), n = c.length, out = arr(n);
    for (var i = period; i < n; i++) if (isNum(c[i]) && isNum(c[i - period])) out[i] = c[i] - c[i - period];
    return out;
  }

  /** Standardabweichung (Population) der letzten n Schlusskurse (feature-store.js#rollingStd, wie Bollinger). */
  function stdDev(close, period) { return F.rollingStd(col(close), period); }

  /* ------------------------------------------- Katalogerweiterung 1.4.0 (L2b) */

  /** Summe der letzten n Werte inkl. i; fehlt einer: NaN. */
  function rollingSum(values, period) {
    var n = values.length, out = arr(n);
    for (var i = period - 1; i < n; i++) {
      var s = 0, ok = true;
      for (var j = i - period + 1; j <= i; j++) { if (!isNum(values[j])) { ok = false; break; } s += values[j]; }
      if (ok) out[i] = s;
    }
    return out;
  }

  /**
   * Vortex (Botes/Siepman 2010): VM+ = |H_i − L_{i−1}|, VM− = |L_i − H_{i−1}|;
   * VI+ = Σ_n VM+ / Σ_n TR, VI− = Σ_n VM− / Σ_n TR (TR mit Vorschluss). Erster Wert an Bar n.
   */
  function vortex(high, low, close, period) {
    var h = col(high), l = col(low), c = col(close), n = c.length, vp = arr(n), vm = arr(n), tr = arr(n);
    for (var i = 1; i < n; i++) {
      if (!isNum(h[i]) || !isNum(l[i]) || !isNum(h[i - 1]) || !isNum(l[i - 1]) || !isNum(c[i - 1])) continue;
      vp[i] = Math.abs(h[i] - l[i - 1]); vm[i] = Math.abs(l[i] - h[i - 1]);
      tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
    }
    var sp = rollingSum(vp, period), sm = rollingSum(vm, period), st = rollingSum(tr, period);
    return { plus: zip2(sp, st, function (a, b) { return b > 0 ? a / b : NaN; }), minus: zip2(sm, st, function (a, b) { return b > 0 ? a / b : NaN; }) };
  }

  /** Mass Index (Dorsey 1992): Σ_s (E1/E2), E1 = EMA_e(H − L), E2 = EMA_e(E1); Standard e = 9, s = 25. */
  function massIndex(high, low, emaPeriod, sumPeriod) {
    var r = zip2(col(high), col(low), function (a, b) { return a - b; }), e1 = F.ema(r, emaPeriod), e2 = F.ema(e1, emaPeriod);
    return rollingSum(zip2(e1, e2, function (a, b) { return b > 0 ? a / b : NaN; }), sumPeriod);
  }

  /**
   * Choppiness Index (Dreiss): 100·log10(Σ_n TR / (HH_n − LL_n)) / log10(n), TR mit Vorschluss;
   * HH = LL (keine Spanne): NaN. Werte nahe 100 = Seitwaerts, nahe 0 = Trend.
   */
  function choppiness(high, low, close, period) {
    var h = col(high), l = col(low), c = col(close), n = c.length, tr = arr(n), out = arr(n);
    for (var i = 1; i < n; i++) if (isNum(h[i]) && isNum(l[i]) && isNum(c[i - 1])) tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
    var st = rollingSum(tr, period), hh = F.rollingMax(h, period), ll = F.rollingMin(l, period);
    for (var k = period; k < n; k++) if (isNum(st[k]) && isNum(hh[k]) && isNum(ll[k]) && hh[k] > ll[k]) out[k] = 100 * Math.log10(st[k] / (hh[k] - ll[k])) / Math.log10(period);
    return out;
  }

  /**
   * Ulcer Index (Martin 1987): Rueckgang D_j = 100·(C_j − max C_{j−n+1..j}) / max,
   * UI = √(Mittel der letzten n Werte D²). Erster Wert an Bar 2(n−1).
   */
  function ulcerIndex(close, period) {
    var c = col(close), mx = F.rollingMax(c, period), d2 = c.map(function (v, i) { return isNum(v) && isNum(mx[i]) && mx[i] > 0 ? Math.pow(100 * (v - mx[i]) / mx[i], 2) : NaN; });
    return F.sma(d2, period).map(function (v) { return isNum(v) ? Math.sqrt(v) : NaN; });
  }

  /** Force Index (Elder): EMA_n((C_i − C_{i−1})·V_i), Standard n = 13. */
  function forceIndex(close, volume, period) {
    var c = col(close), v = col(volume), n = c.length, raw = arr(n);
    for (var i = 1; i < n; i++) if (isNum(c[i]) && isNum(c[i - 1]) && isNum(v[i])) raw[i] = (c[i] - c[i - 1]) * v[i];
    return F.ema(raw, period);
  }

  /**
   * Klinger Volume Oscillator (Klinger; Definition wie StockCharts):
   *   Trend_i = +1, wenn (H+L+C)_i > (H+L+C)_{i−1}, sonst −1;  dm_i = H_i − L_i
   *   cm_i = cm_{i−1} + dm_i bei gleichem Trend, sonst dm_{i−1} + dm_i (Start an Bar 1 wie ein Trendwechsel)
   *   VF_i = V_i · |2·dm_i/cm_i − 1| · Trend_i · 100;  KVO = EMA_f(VF) − EMA_s(VF);  Signal = EMA_g(KVO).
   * cm = 0 oder fehlender Wert: VF nicht definiert (NaN); die EMAs halten dort den Vorwert (feature-store.ema).
   */
  function klinger(high, low, close, volume, fast, slow, signal) {
    var h = col(high), l = col(low), c = col(close), v = col(volume), n = c.length, vf = arr(n);
    var prevTrend = 0, cm = NaN;
    for (var i = 1; i < n; i++) {
      if (!(isNum(h[i]) && isNum(l[i]) && isNum(c[i]) && isNum(v[i]) && isNum(h[i - 1]) && isNum(l[i - 1]) && isNum(c[i - 1]))) { prevTrend = 0; continue; }
      var trend = h[i] + l[i] + c[i] > h[i - 1] + l[i - 1] + c[i - 1] ? 1 : -1, dm = h[i] - l[i], dmPrev = h[i - 1] - l[i - 1];
      cm = trend === prevTrend && isNum(cm) ? cm + dm : dmPrev + dm;
      prevTrend = trend;
      if (cm > 0) vf[i] = v[i] * Math.abs(2 * dm / cm - 1) * trend * 100;
    }
    var kvo = zip2(F.ema(vf, fast), F.ema(vf, slow), function (a, b) { return a - b; });
    return { kvo: kvo, signal: F.ema(kvo, signal) };
  }

  /** Elder Ray: Bull Power = H − EMA_n(C), Bear Power = L − EMA_n(C), Standard n = 13. */
  function elderRay(high, low, close, period) {
    var e = F.ema(col(close), period);
    return { bull: zip2(col(high), e, function (a, b) { return a - b; }), bear: zip2(col(low), e, function (a, b) { return a - b; }) };
  }

  /**
   * Ease of Movement (Arms): EMV = ((H+L)/2 − (H_{−1}+L_{−1})/2) / ((V/scale)/(H − L)), geglaettet SMA_n.
   * H = L oder V = 0: nicht definiert (NaN). Standard scale = 100.000.000.
   */
  function easeOfMovement(high, low, volume, period, scale) {
    var h = col(high), l = col(low), v = col(volume), n = h.length, raw = arr(n);
    for (var i = 1; i < n; i++) {
      if (!isNum(h[i]) || !isNum(l[i]) || !isNum(h[i - 1]) || !isNum(l[i - 1]) || !isNum(v[i]) || !(h[i] > l[i]) || !(v[i] > 0)) continue;
      raw[i] = ((h[i] + l[i]) / 2 - (h[i - 1] + l[i - 1]) / 2) / ((v[i] / scale) / (h[i] - l[i]));
    }
    return F.sma(raw, period);
  }

  /** Awesome Oscillator (Williams): SMA_f(M) − SMA_s(M), M = (H + L)/2, Standard 5/34. */
  function awesomeOscillator(high, low, fast, slow) {
    var m = zip2(col(high), col(low), function (a, b) { return (a + b) / 2; });
    return zip2(F.sma(m, fast), F.sma(m, slow), function (a, b) { return a - b; });
  }

  /** Coppock-Kurve: WMA_w(ROC_a + ROC_b), Standard 14/11/10 (Bars; Coppock rechnete in Monaten). */
  function coppock(close, rocLong, rocShort, wmaPeriod) {
    return wma(zip2(roc(close, rocLong), roc(close, rocShort), function (a, b) { return a + b; }), wmaPeriod);
  }

  /**
   * Know Sure Thing (Pring): KST = 1·SMA10(ROC10) + 2·SMA10(ROC15) + 3·SMA10(ROC20) + 4·SMA15(ROC30),
   * Signal = SMA9(KST). Perioden in Bars (Tagesvariante nach Pring).
   */
  function kst(close) {
    var parts = [[10, 10, 1], [15, 10, 2], [20, 10, 3], [30, 15, 4]].map(function (q) { return F.sma(roc(close, q[0]), q[1]).map(function (v) { return v * q[2]; }); });
    var k = parts[0].map(function (v, i) { return isNum(v) && isNum(parts[1][i]) && isNum(parts[2][i]) && isNum(parts[3][i]) ? v + parts[1][i] + parts[2][i] + parts[3][i] : NaN; });
    return { kst: k, signal: F.sma(k, 9) };
  }

  /** True Strength Index (Blau): 100·EMA_s(EMA_l(ΔC)) / EMA_s(EMA_l(|ΔC|)), Signal = EMA_sig(TSI). Standard 25/13/7. */
  function tsi(close, longP, shortP, signal) {
    var c = col(close), n = c.length, m = arr(n), a = arr(n);
    for (var i = 1; i < n; i++) if (isNum(c[i]) && isNum(c[i - 1])) { m[i] = c[i] - c[i - 1]; a[i] = Math.abs(m[i]); }
    var num = F.ema(F.ema(m, longP), shortP), den = F.ema(F.ema(a, longP), shortP);
    var t = zip2(num, den, function (x, y) { return y > 0 ? 100 * x / y : NaN; });
    return { tsi: t, signal: F.ema(t, signal) };
  }

  /**
   * Detrended Price Oscillator, kausale Form (StockCharts): DPO_i = C_{i−k} − SMA_n(i), k = ⌊n/2⌋ + 1.
   * Die zentrierte Lehrbuchform braucht Zukunftswerte und wird bewusst nicht angeboten.
   */
  function dpo(close, period) {
    var c = col(close), s = F.sma(c, period), k = Math.floor(period / 2) + 1;
    return s.map(function (v, i) { return isNum(v) && i - k >= 0 && isNum(c[i - k]) ? c[i - k] - v : NaN; });
  }

  /** Historische Volatilitaet: Stichprobenstreuung (n−1) der letzten n Log-Renditen · √annual, in Prozent. */
  function historicalVolatility(close, period, annual) {
    var c = col(close), n = c.length, r = arr(n), out = arr(n);
    for (var i = 1; i < n; i++) if (isNum(c[i]) && isNum(c[i - 1]) && c[i] > 0 && c[i - 1] > 0) r[i] = Math.log(c[i] / c[i - 1]);
    for (var k = period; k < n; k++) {
      var s = 0, ok = true;
      for (var j = k - period + 1; j <= k; j++) { if (!isNum(r[j])) { ok = false; break; } s += r[j]; }
      if (!ok || period < 2) continue;
      var m = s / period, ss = 0;
      for (var q = k - period + 1; q <= k; q++) ss += (r[q] - m) * (r[q] - m);
      out[k] = 100 * Math.sqrt(ss / (period - 1)) * Math.sqrt(annual);
    }
    return out;
  }

  /** Z-Score: (C − SMA_n)/σ_n (Populationsstreuung wie Bollinger); σ = 0: NaN. */
  function zScore(close, period) {
    var c = col(close), m = F.sma(c, period), s = F.rollingStd(c, period);
    return c.map(function (v, i) { return isNum(v) && isNum(m[i]) && isNum(s[i]) && s[i] > 0 ? (v - m[i]) / s[i] : NaN; });
  }

  /**
   * Negative/Positive Volume Index (Fosback): Start 1000; NVI aendert sich nur an Tagen mit geringerem
   * Volumen als am Vortag (um die Schlusskursrendite), PVI nur an Tagen mit hoeherem Volumen.
   */
  function volumeIndex(close, volume, positive) {
    var c = col(close), v = col(volume), n = c.length, out = arr(n), x = 1000, started = false;
    for (var i = 0; i < n; i++) {
      if (!started) { if (isNum(c[i]) && isNum(v[i])) { started = true; out[i] = x; } continue; }
      if (!isNum(c[i]) || !isNum(v[i]) || !isNum(c[i - 1]) || !isNum(v[i - 1])) continue;
      if ((positive ? v[i] > v[i - 1] : v[i] < v[i - 1]) && c[i - 1] !== 0) x = x * c[i] / c[i - 1];
      out[i] = x;
    }
    return out;
  }
  function nvi(close, volume) { return volumeIndex(close, volume, false); }
  function pvi(close, volume) { return volumeIndex(close, volume, true); }

  /** Percentage Volume Oscillator: PPO auf dem Volumen, 100·(EMA_f(V) − EMA_s(V))/EMA_s(V). */
  function pvo(volume, fast, slow, signal) {
    var r = ppo(volume, fast, slow, signal);
    return { pvo: r.ppo, signal: r.signal, histogram: r.histogram };
  }

  /**
   * Connors RSI: (RSI_a(C) + RSI_b(Serie) + Perzentilrang_p(ROC1)) / 3. Serie = Zahl der Tage in Folge
   * mit steigendem (+) bzw. fallendem (−) Schluss, 0 bei unveraendert. Perzentilrang = Anteil der
   * vorherigen p Tagesrenditen, die kleiner sind als die heutige, in Prozent. Standard 3/2/100.
   */
  function connorsRsi(close, rsiPeriod, streakPeriod, rankPeriod) {
    var c = col(close), n = c.length, streak = arr(n), r1 = arr(n), rank = arr(n), s = 0;
    for (var i = 1; i < n; i++) {
      if (!isNum(c[i]) || !isNum(c[i - 1])) { s = 0; continue; }
      var d = c[i] - c[i - 1];
      s = d > 0 ? (s > 0 ? s + 1 : 1) : d < 0 ? (s < 0 ? s - 1 : -1) : 0;
      streak[i] = s;
      if (c[i - 1] !== 0) r1[i] = c[i] / c[i - 1] - 1;
    }
    for (var k = rankPeriod + 1; k < n; k++) {
      if (!isNum(r1[k])) continue;
      var less = 0, ok = true;
      for (var j = k - rankPeriod; j < k; j++) { if (!isNum(r1[j])) { ok = false; break; } if (r1[j] < r1[k]) less++; }
      if (ok) rank[k] = 100 * less / rankPeriod;
    }
    var a = F.rsi(c, rsiPeriod), b = F.rsi(streak.map(function (v, i) { return i === 0 ? NaN : v; }), streakPeriod);
    return a.map(function (v, i) { return isNum(v) && isNum(b[i]) && isNum(rank[i]) ? (v + b[i] + rank[i]) / 3 : NaN; });
  }

  /** Elder Impulse: +1, wenn EMA_n und MACD-Histogramm beide steigen; −1, wenn beide fallen; sonst 0. */
  function elderImpulse(close, period, fast, slow, signal) {
    var e = F.ema(col(close), period), h = macd(close, fast, slow, signal).histogram, n = e.length, out = arr(n);
    for (var i = 1; i < n; i++) {
      if (!isNum(e[i]) || !isNum(e[i - 1]) || !isNum(h[i]) || !isNum(h[i - 1])) continue;
      var de = e[i] - e[i - 1], dh = h[i] - h[i - 1];
      out[i] = de > 0 && dh > 0 ? 1 : de < 0 && dh < 0 ? -1 : 0;
    }
    return out;
  }

  /** Chaikin-Volatilitaet: 100·(EMA_n(H − L)_i / EMA_n(H − L)_{i−r} − 1), Standard 10/10. */
  function chaikinVolatility(high, low, period, rocPeriod) {
    var e = F.ema(zip2(col(high), col(low), function (a, b) { return a - b; }), period), n = e.length, out = arr(n);
    for (var i = rocPeriod; i < n; i++) if (isNum(e[i]) && isNum(e[i - rocPeriod]) && e[i - rocPeriod] > 0) out[i] = 100 * (e[i] / e[i - rocPeriod] - 1);
    return out;
  }

  /** Envelope: SMA_n ± pct % (Prozentband um den Durchschnitt). */
  function envelope(close, period, pct) {
    var m = F.sma(col(close), period), f = pct / 100;
    return { middle: m, upper: m.map(function (v) { return isNum(v) ? v * (1 + f) : NaN; }), lower: m.map(function (v) { return isNum(v) ? v * (1 - f) : NaN; }) };
  }

  /**
   * Pivot-Varianten aus Hoch, Tief und Schluss der Vorbar (wie pivots()):
   *   fibonacci: P = (H+L+C)/3, R/S1..3 = P ± {0,382; 0,618; 1,0}·(H − L)
   *   camarilla: R/S1..4 = C ± (H − L)·1,1/{12; 6; 4; 2}, P = (H+L+C)/3
   *   woodie:    P = (H + L + 2C)/4, R1 = 2P − L, S1 = 2P − H, R2 = P + (H − L), S2 = P − (H − L)
   */
  function pivotVariant(high, low, close, method) {
    var h = col(high), l = col(low), c = col(close), n = c.length, keys = method === "camarilla" ? ["p", "r1", "r2", "r3", "r4", "s1", "s2", "s3", "s4"] : method === "fibonacci" ? ["p", "r1", "r2", "r3", "s1", "s2", "s3"] : ["p", "r1", "r2", "s1", "s2"];
    var out = {}; keys.forEach(function (k) { out[k] = arr(n); });
    for (var i = 1; i < n; i++) {
      var H = h[i - 1], L = l[i - 1], C = c[i - 1];
      if (!isNum(H) || !isNum(L) || !isNum(C)) continue;
      var R = H - L, P;
      if (method === "woodie") {
        P = (H + L + 2 * C) / 4;
        out.p[i] = P; out.r1[i] = 2 * P - L; out.s1[i] = 2 * P - H; out.r2[i] = P + R; out.s2[i] = P - R;
      } else if (method === "fibonacci") {
        P = (H + L + C) / 3; out.p[i] = P;
        [0.382, 0.618, 1].forEach(function (f, k) { out["r" + (k + 1)][i] = P + f * R; out["s" + (k + 1)][i] = P - f * R; });
      } else {
        out.p[i] = (H + L + C) / 3;
        [12, 6, 4, 2].forEach(function (d, k) { out["r" + (k + 1)][i] = C + R * 1.1 / d; out["s" + (k + 1)][i] = C - R * 1.1 / d; });
      }
    }
    return out;
  }

  /* ------------------------------------------- Katalogerweiterung 1.6.0 (L12) */

  /** Absolute Price Oscillator: EMA_fast(C) − EMA_slow(C) (wie MACD ohne Signal, absolute Preiseinheiten). */
  function apo(close, fast, slow) { var c = col(close); return zip2(F.ema(c, fast), F.ema(c, slow), function (a, b) { return a - b; }); }

  /** Midprice: (hoechstes Hoch + tiefstes Tief der letzten n Bars) / 2. */
  function midprice(high, low, period) {
    return zip2(F.rollingMax(col(high), period), F.rollingMin(col(low), period), function (a, b) { return (a + b) / 2; });
  }

  /** Time Series Forecast: Regressionsgerade der letzten n Schluesse, um einen Bar fortgeschrieben (Wert + Steigung). */
  function tsf(close, period) {
    var r = linreg(close, period, 0);
    return zip2(r.value, r.slope, function (v, b) { return v + b; });
  }

  /** ADXR (Wilder): (ADX_i + ADX_{i−(n−1)}) / 2. */
  function adxr(high, low, close, period) {
    var a = F.adx(col(high), col(low), col(close), period).adx, n = a.length, out = arr(n);
    for (var i = period - 1; i < n; i++) if (isNum(a[i]) && isNum(a[i - period + 1])) out[i] = (a[i] + a[i - period + 1]) / 2;
    return out;
  }

  /** Schnelle Stochastik: %K = 100·(C − LL_n)/(HH_n − LL_n) ungeglaettet, %D = SMA_d(%K). */
  function stochFast(high, low, close, kPeriod, dPeriod) {
    var raw = stochastic(high, low, close, kPeriod, 1, dPeriod).raw;
    return { k: raw, d: F.sma(raw, dPeriod) };
  }

  /**
   * Fisher Transform (Ehlers 2002): x = (HL2 − LL_n)/max(HH_n − LL_n, 0,001) − 0,5 aus dem Medianpreis HL2;
   * v = 0,66·x + 0,67·v₋₁, begrenzt auf ±0,999 (ab |v| > 0,99); F = 0,5·ln((1+v)/(1−v)) + 0,5·F₋₁.
   * Startwert F = 0 an Bar n−1 (wie pandas-ta). Signal = F des Vorbars.
   */
  function fisher(high, low, period) {
    var h = col(high), l = col(low), n = h.length, med = arr(n), fish = arr(n), sig = arr(n);
    for (var i = 0; i < n; i++) if (isNum(h[i]) && isNum(l[i])) med[i] = (h[i] + l[i]) / 2;
    var hh = F.rollingMax(med, period), ll = F.rollingMin(med, period), v = 0;
    if (n >= period) fish[period - 1] = 0;
    for (var k = period; k < n; k++) {
      if (!isNum(med[k]) || !isNum(hh[k]) || !isNum(ll[k]) || !isNum(fish[k - 1])) continue;
      var x = (med[k] - ll[k]) / Math.max(hh[k] - ll[k], 0.001) - 0.5;
      v = 0.66 * x + 0.67 * v;
      if (v < -0.99) v = -0.999;
      if (v > 0.99) v = 0.999;
      fish[k] = 0.5 * (Math.log((1 + v) / (1 - v)) + fish[k - 1]);
    }
    for (var j = 1; j < n; j++) sig[j] = fish[j - 1];
    return { fisher: fish, signal: sig };
  }

  /**
   * Schaff Trend Cycle (Schaff 1999): MACD = EMA_fast − EMA_slow; %K1 = Stochastik des MACD ueber `cycle` Bars
   * (Spanne 0: Vorwert), PF = PF₋₁ + f·(%K1 − PF₋₁) mit Start PF = %K1; %K2 = Stochastik von PF ueber `cycle` Bars,
   * STC = STC₋₁ + f·(%K2 − STC₋₁) mit Start STC = %K2. Werte 0..100.
   */
  function stc(close, fast, slow, cycle, factor) {
    var c = col(close), m = zip2(F.ema(c, fast), F.ema(c, slow), function (a, b) { return a - b; });
    function stochSmooth(x) {
      var n = x.length, k = arr(n), out = arr(n), first = -1;
      for (var i = 0; i < n; i++) if (isNum(x[i])) { first = i; break; }
      if (first < 0) return out;
      for (var t = first + cycle - 1; t < n; t++) {
        var lo = Infinity, hi = -Infinity, ok = true;
        for (var q = t - cycle + 1; q <= t; q++) { if (!isNum(x[q])) { ok = false; break; } lo = Math.min(lo, x[q]); hi = Math.max(hi, x[q]); }
        if (!ok) continue;
        k[t] = hi > lo ? 100 * (x[t] - lo) / (hi - lo) : (isNum(k[t - 1]) ? k[t - 1] : 0);
        out[t] = isNum(out[t - 1]) ? out[t - 1] + factor * (k[t] - out[t - 1]) : k[t];
      }
      return out;
    }
    return stochSmooth(stochSmooth(m));
  }

  /** Symmetrisch gewichteter Durchschnitt ueber 4 Bars: (x₋₃ + 2x₋₂ + 2x₋₁ + x)/6. */
  function swma4(x) {
    var n = x.length, out = arr(n);
    for (var i = 3; i < n; i++) if (isNum(x[i]) && isNum(x[i - 1]) && isNum(x[i - 2]) && isNum(x[i - 3])) out[i] = (x[i - 3] + 2 * x[i - 2] + 2 * x[i - 1] + x[i]) / 6;
    return out;
  }

  /** Relative Vigor Index (Ehlers): RVGI = Σ_n SWMA(C − O) / Σ_n SWMA(H − L), Signal = SWMA(RVGI). */
  function rvgi(open, high, low, close, period) {
    var o = col(open), h = col(high), l = col(low), c = col(close);
    var num = rollingSum(swma4(zip2(c, o, function (a, b) { return a - b; })), period);
    var den = rollingSum(swma4(zip2(h, l, function (a, b) { return a - b; })), period);
    var r = zip2(num, den, function (a, b) { return b !== 0 ? a / b : NaN; });
    return { rvgi: r, signal: swma4(r) };
  }

  /** Price Volume Trend: PVT_i = PVT_{i−1} + V_i·(C_i − C_{i−1})/C_{i−1}, Start PVT_1 = V_1·(C_1 − C_0)/C_0. */
  function pvt(close, volume) {
    var c = col(close), v = col(volume), n = c.length, out = arr(n), acc = 0, started = false;
    for (var i = 1; i < n; i++) {
      if (!isNum(c[i]) || !isNum(c[i - 1]) || !isNum(v[i]) || c[i - 1] === 0) { if (started) out[i] = acc; continue; }
      acc += v[i] * (c[i] - c[i - 1]) / c[i - 1]; started = true; out[i] = acc;
    }
    return out;
  }

  /** Vertical Horizontal Filter (White): (hoechster − tiefster Schluss der letzten n Bars) / Σ_n |C − C₋₁|. */
  function vhf(close, period) {
    var c = col(close), n = c.length, d = arr(n);
    for (var i = 1; i < n; i++) if (isNum(c[i]) && isNum(c[i - 1])) d[i] = Math.abs(c[i] - c[i - 1]);
    return zip2(zip2(F.rollingMax(c, period), F.rollingMin(c, period), function (a, b) { return a - b; }), rollingSum(d, period),
      function (r, s) { return s > 0 ? r / s : NaN; });
  }

  /** Efficiency Ratio (Kaufman): |C − C₋ₙ| / Σ_n |C − C₋₁| (1 = gerader Trend, nahe 0 = Rauschen). */
  function efficiencyRatio(close, period) {
    var c = col(close), n = c.length, d = arr(n), out = arr(n);
    for (var i = 1; i < n; i++) if (isNum(c[i]) && isNum(c[i - 1])) d[i] = Math.abs(c[i] - c[i - 1]);
    var s = rollingSum(d, period);
    for (var k = period; k < n; k++) if (isNum(c[k]) && isNum(c[k - period]) && isNum(s[k]) && s[k] > 0) out[k] = Math.abs(c[k] - c[k - period]) / s[k];
    return out;
  }

  /** QStick (Chande): SMA_n(C − O). */
  function qstick(open, close, period) { return F.sma(zip2(col(close), col(open), function (a, b) { return a - b; }), period); }

  /** Williams Alligator: SMMA (Wilder) des Medianpreises (H+L)/2, Kiefer 13/8, Zaehne 8/5, Lippen 5/3 (Laenge/Versatz).
   *  Der Versatz zeigt in die Zukunft; am Bar i steht deshalb der SMMA-Wert von Bar i − Versatz (kausal). */
  function alligator(high, low, jaw, jawShift, teeth, teethShift, lips, lipsShift) {
    var h = col(high), l = col(low), med = zip2(h, l, function (a, b) { return (a + b) / 2; });
    function shifted(period, by) { var s = F.wilder(med, period), out = arr(s.length); for (var i = by; i < s.length; i++) out[i] = s[i - by]; return out; }
    return { jaw: shifted(jaw, jawShift), teeth: shifted(teeth, teethShift), lips: shifted(lips, lipsShift) };
  }

  /** Williams Fractals: Hoch-Fraktal an Bar c, wenn H_c strikt ueber den zwei Hochs davor und danach liegt (Tief entsprechend).
   *  Erkennbar erst zwei Bars spaeter; ausgewiesen am Bestaetigungsbar c + 2 (kein Vorgriff): up/down = 1/0,
   *  upPrice/downPrice = Preis von Bar c, sonst NaN. */
  function fractals(high, low) {
    var h = col(high), l = col(low), n = h.length, up = arr(n), dn = arr(n), upPrice = arr(n), downPrice = arr(n);
    for (var i = 4; i < n; i++) {
      var c = i - 2, okH = true, okL = true, defined = true;
      for (var j = c - 2; j <= c + 2; j++) {
        if (!isNum(h[j]) || !isNum(l[j])) { defined = false; break; }
        if (j === c) continue;
        if (!(h[c] > h[j])) okH = false;
        if (!(l[c] < l[j])) okL = false;
      }
      if (!defined) continue;
      up[i] = okH ? 1 : 0; dn[i] = okL ? 1 : 0;
      if (okH) upPrice[i] = h[c];
      if (okL) downPrice[i] = l[c];
    }
    return { up: up, down: dn, upPrice: upPrice, downPrice: downPrice };
  }

  /* ------------------------------------------------------- Hilfsfunktionen */

  /** Hoechster Schluss bzw. Hoch der letzten n Bars inkl. i (52 Wochen = 252 Tagesbars bzw. 52 Wochenbars). */
  function rollingHigh(values, period) { return F.rollingMax(col(values), period); }
  function rollingLow(values, period) { return F.rollingMin(col(values), period); }

  /* --------------------------------------------------------------- Katalog */

  /**
   * Der Katalog ist die dokumentierte Definition. `warmup` = erste Bar-Position (0-basiert), an der
   * der Indikator bei lueckenloser Eingabe einen Wert hat. `inputs` = benoetigte Spalten.
   * `family` steuert Gruppierung im Chart Studio. `base` = Formel eines anderen Eintrags mit eigenen
   * Standardparametern (Voreinstellung, z. B. roc63). `catalogOnly` = definiert und berechenbar, aber in
   * keiner Produktflaeche gelistet (Methodik-Seite filtert sie aus, Screener/Abfrage kennen sie nicht).
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
      definition: "relative Volumenstaerke >= Schwelle", warmup: function (p) { return p.period; } },

    /* 1.2.0 (B6): nur Katalog und compute(); keine Produktflaeche (catalogOnly). */
    { id: "pivots", family: "TREND", name: "Pivot-Punkte (Floor, Vortag)", params: {}, inputs: ["high", "low", "close"], overlay: true, catalogOnly: true,
      definition: "aus Hoch, Tief und Schluss der Vorbar: P = (H+L+C)/3, R1 = 2P − L, S1 = 2P − H, R2 = P + (H−L), S2 = P − (H−L)", warmup: function () { return 1; } },
    { id: "kama", family: "TREND", name: "Kaufman Adaptive Moving Average (KAMA)", params: { period: 10, fast: 2, slow: 30 }, inputs: ["close"], overlay: true, catalogOnly: true,
      definition: "Effizienz ER = |C − C_{−n}| / Σ|ΔC|; SC = (ER·(2/(f+1) − 2/(s+1)) + 2/(s+1))²; KAMA += SC·(C − KAMA), Start C_{n−1}", warmup: function (p) { return p.period; } },
    { id: "hma", family: "TREND", name: "Hull Moving Average (HMA)", params: { period: 20 }, inputs: ["close"], overlay: true, catalogOnly: true,
      definition: "WMA_{⌊√n⌋}(2·WMA_{⌊n/2⌋} − WMA_n)", warmup: function (p) { return p.period + Math.floor(Math.sqrt(p.period)) - 2; } },
    { id: "linreg", family: "TREND", name: "Linearer Regressionskanal", params: { period: 50, k: 2 }, inputs: ["close"], overlay: true, catalogOnly: true,
      definition: "KQ-Gerade durch die letzten n Schlusskurse: Endwert, Steigung je Bar, Kanal ± k·Standardabweichung (Population) der Residuen, R² (seit 1.3.0)", warmup: function (p) { return p.period - 1; } },
    { id: "heikinAshi", family: "TREND", name: "Heikin-Ashi", params: {}, inputs: ["open", "high", "low", "close"], overlay: true, catalogOnly: true,
      definition: "HC = (O+H+L+C)/4, HO = (HO_{−1} + HC_{−1})/2 (Start (O+C)/2), HH = max(H, HO, HC), HL = min(L, HO, HC)", warmup: function () { return 0; } },
    { id: "roc63", family: "MOMENTUM", name: "Rate of Change 63 (3 Monate)", base: "roc", params: { period: 63 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "ROC = 100·(C_i/C_{i−63} − 1) in Prozent", warmup: function (p) { return p.period; } },
    { id: "roc126", family: "MOMENTUM", name: "Rate of Change 126 (6 Monate)", base: "roc", params: { period: 126 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "ROC = 100·(C_i/C_{i−126} − 1) in Prozent", warmup: function (p) { return p.period; } },
    { id: "roc252", family: "MOMENTUM", name: "Rate of Change 252 (12 Monate)", base: "roc", params: { period: 252 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "ROC = 100·(C_i/C_{i−252} − 1) in Prozent", warmup: function (p) { return p.period; } },
    { id: "trix", family: "MOMENTUM", name: "TRIX", params: { period: 15, signal: 9 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "100·(E3_i/E3_{i−1} − 1), E3 = dreifach geglaettete EMA_n; Signal = EMA_s(TRIX)", warmup: function (p) { return 3 * (p.period - 1) + 1; } },
    { id: "ultimateOscillator", family: "MOMENTUM", name: "Ultimate Oscillator", params: { short: 7, medium: 14, long: 28 }, inputs: ["high", "low", "close"], overlay: false, catalogOnly: true,
      definition: "100·(4·A_7 + 2·A_14 + A_28)/7, A_n = Σ Kaufdruck / Σ True Range, Kaufdruck = C − min(L, C_{−1})", warmup: function (p) { return Math.max(p.short, p.medium, p.long); } },
    { id: "cmo", family: "MOMENTUM", name: "Chande Momentum Oscillator (CMO)", params: { period: 14 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "100·(Σ Anstiege − Σ Rueckgaenge)/(Σ Anstiege + Σ Rueckgaenge) der letzten n Schlusskursaenderungen, ungeglaettet", warmup: function (p) { return p.period; } },
    { id: "chandelier", family: "VOLATILITY", name: "Chandelier Exit (ATR-Baender)", params: { period: 22, multiplier: 3 }, inputs: ["high", "low", "close"], overlay: true, catalogOnly: true,
      definition: "lang = hoechstes Hoch_n − m·ATR_n, kurz = tiefstes Tief_n + m·ATR_n (ATR nach Wilder)", warmup: function (p) { return p.period - 1; } },
    { id: "insideBar", family: "VOLATILITY", name: "Inside Bar", params: {}, inputs: ["high", "low"], overlay: false, catalogOnly: true,
      definition: "1, wenn H < H_{−1} und L > L_{−1}, sonst 0", warmup: function () { return 1; } },
    { id: "nr7", family: "VOLATILITY", name: "Narrow Range (NR7)", params: { period: 7 }, inputs: ["high", "low"], overlay: false, catalogOnly: true,
      definition: "1, wenn die Spanne H − L die kleinste der letzten n Bars ist (Gleichstand zaehlt), sonst 0", warmup: function (p) { return p.period - 1; } },

    /* 1.3.0 (L2a): nur Katalog und compute(); Referenz TA-Lib, wo es ein Gegenstueck gibt (INDICATORS_EXTERNAL_REFERENCE.md). */
    { id: "dema", family: "TREND", name: "Double Exponential Moving Average (DEMA)", params: { period: 20 }, inputs: ["close"], overlay: true, catalogOnly: true,
      definition: "2·EMA_n(C) − EMA_n(EMA_n(C))", warmup: function (p) { return 2 * (p.period - 1); } },
    { id: "tema", family: "TREND", name: "Triple Exponential Moving Average (TEMA)", params: { period: 20 }, inputs: ["close"], overlay: true, catalogOnly: true,
      definition: "3·E1 − 3·E2 + E3, E1 = EMA_n(C), E2 = EMA_n(E1), E3 = EMA_n(E2)", warmup: function (p) { return 3 * (p.period - 1); } },
    { id: "trima", family: "TREND", name: "Dreieckig gewichteter Durchschnitt (TRIMA)", params: { period: 20 }, inputs: ["close"], overlay: true, catalogOnly: true,
      definition: "SMA ueber SMA: ungerades n je (n+1)/2, gerades n: n/2 und n/2+1; Gewichte 1, 2, …, Mitte, …, 2, 1", warmup: function (p) { return p.period - 1; } },
    { id: "t3", family: "TREND", name: "Tillson T3", params: { period: 5, vfactor: 0.7 }, inputs: ["close"], overlay: true, catalogOnly: true,
      definition: "sechsfach verkettete EMA_n, T3 = c1·E6 + c2·E5 + c3·E4 + c4·E3 mit Volumenfaktor v (c1 = −v³ …)", warmup: function (p) { return 6 * (p.period - 1); } },
    { id: "zlema", family: "TREND", name: "Zero-Lag EMA (ZLEMA)", params: { period: 20 }, inputs: ["close"], overlay: true, catalogOnly: true,
      definition: "EMA_n(2·C − C_{−lag}), lag = ⌊(n−1)/2⌋", warmup: function (p) { return Math.floor((p.period - 1) / 2) + p.period - 1; } },
    { id: "alma", family: "TREND", name: "Arnaud Legoux Moving Average (ALMA)", params: { period: 9, offset: 0.85, sigma: 6 }, inputs: ["close"], overlay: true, catalogOnly: true,
      definition: "Gauss-gewichteter Durchschnitt: w_j = exp(−(j − m)²/(2s²)), m = offset·(n−1), s = n/sigma", warmup: function (p) { return p.period - 1; } },
    { id: "mcginley", family: "TREND", name: "McGinley Dynamic", params: { period: 14 }, inputs: ["close"], overlay: true, catalogOnly: true,
      definition: "MD += (C − MD)/(n·(C/MD)⁴), Start SMA_n", warmup: function (p) { return p.period - 1; } },
    { id: "ppo", family: "MOMENTUM", name: "Percentage Price Oscillator (PPO)", params: { fast: 12, slow: 26, signal: 9 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "100·(EMA_fast − EMA_slow)/EMA_slow; Signal = EMA_signal(PPO); Histogramm = Differenz", warmup: function (p) { return p.slow + p.signal - 2; } },
    { id: "stochRsi", family: "MOMENTUM", name: "Stochastic RSI", params: { rsiPeriod: 14, stochPeriod: 14, kSmooth: 3, dPeriod: 3 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "Stochastik auf dem RSI: 100·(RSI − min)/(max − min) ueber m Bars, %K = SMA_k, %D = SMA_d(%K)",
      warmup: function (p) { return p.rsiPeriod + p.stochPeriod - 1 + p.kSmooth - 1 + p.dPeriod - 1; } },
    { id: "natr", family: "VOLATILITY", name: "Normalisierte ATR (NATR)", params: { period: 14 }, inputs: ["high", "low", "close"], overlay: false, catalogOnly: true,
      definition: "100·ATR_n/C, ATR nach Wilder", warmup: function (p) { return p.period - 1; } },
    { id: "adLine", family: "VOLUME", name: "Akkumulation/Distribution (A/D-Linie)", params: {}, inputs: ["high", "low", "close", "volume"], overlay: false, catalogOnly: true,
      definition: "kumuliert V·((C−L) − (H−C))/(H−L), H = L zaehlt 0", warmup: function () { return 0; } },
    { id: "chaikinOsc", family: "VOLUME", name: "Chaikin-Oszillator", params: { fast: 3, slow: 10 }, inputs: ["high", "low", "close", "volume"], overlay: false, catalogOnly: true,
      definition: "EMA_fast(A/D) − EMA_slow(A/D)", warmup: function (p) { return Math.max(p.fast, p.slow) - 1; } },
    { id: "balanceOfPower", family: "MOMENTUM", name: "Balance of Power (BOP)", params: { period: 14 }, inputs: ["open", "high", "low", "close"], overlay: false, catalogOnly: true,
      definition: "(C − O)/(H − L), H = L: 0; geglaettet SMA_n", warmup: function () { return 0; } },
    { id: "momentum", family: "MOMENTUM", name: "Momentum", params: { period: 10 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "C_i − C_{i−n} (absolute Kursaenderung)", warmup: function (p) { return p.period; } },
    { id: "stdDev", family: "VOLATILITY", name: "Standardabweichung", params: { period: 20 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "Populationsstreuung der letzten n Schlusskurse", warmup: function (p) { return p.period - 1; } },

    /* 1.4.0 (L2b): nur Katalog; ohne TA-Lib-Gegenstueck, naive Referenzen in technical-indicators-catalog-l2b.test.mjs. */
    { id: "vortex", family: "TREND", name: "Vortex-Indikator", params: { period: 14 }, inputs: ["high", "low", "close"], overlay: false, catalogOnly: true,
      definition: "VI+ = Σ|H − L₋₁| / ΣTR, VI− = Σ|L − H₋₁| / ΣTR ueber n Bars", warmup: function (p) { return p.period; } },
    { id: "massIndex", family: "VOLATILITY", name: "Mass Index", params: { emaPeriod: 9, sumPeriod: 25 }, inputs: ["high", "low"], overlay: false, catalogOnly: true,
      definition: "Σ_s EMA_e(H − L) / EMA_e(EMA_e(H − L))", warmup: function (p) { return 2 * (p.emaPeriod - 1) + p.sumPeriod - 1; } },
    { id: "choppiness", family: "TREND", name: "Choppiness Index", params: { period: 14 }, inputs: ["high", "low", "close"], overlay: false, catalogOnly: true,
      definition: "100·log10(ΣTR_n / (HH_n − LL_n)) / log10(n)", warmup: function (p) { return p.period; } },
    { id: "ulcerIndex", family: "VOLATILITY", name: "Ulcer Index", params: { period: 14 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "√ Mittel der quadrierten prozentualen Rueckgaenge vom n-Bar-Hoch", warmup: function (p) { return 2 * (p.period - 1); } },
    { id: "forceIndex", family: "VOLUME", name: "Force Index", params: { period: 13 }, inputs: ["close", "volume"], overlay: false, catalogOnly: true,
      definition: "EMA_n((C − C₋₁)·V)", warmup: function (p) { return p.period; } },
    { id: "klinger", family: "VOLUME", name: "Klinger Volume Oscillator", params: { fast: 34, slow: 55, signal: 13 }, inputs: ["high", "low", "close", "volume"], overlay: false, catalogOnly: true,
      definition: "EMA_f(VF) − EMA_s(VF), VF = V·|2·dm/cm − 1|·Trend·100; Signal EMA_g", warmup: function (p) { return p.slow; } },
    { id: "elderRay", family: "MOMENTUM", name: "Elder Ray (Bull/Bear Power)", params: { period: 13 }, inputs: ["high", "low", "close"], overlay: false, catalogOnly: true,
      definition: "Bull = H − EMA_n(C), Bear = L − EMA_n(C)", warmup: function (p) { return p.period - 1; } },
    { id: "easeOfMovement", family: "VOLUME", name: "Ease of Movement (EMV)", params: { period: 14, scale: 100000000 }, inputs: ["high", "low", "volume"], overlay: false, catalogOnly: true,
      definition: "SMA_n(Δ Mittelpreis / ((V/scale)/(H − L)))", warmup: function (p) { return p.period; } },
    { id: "awesomeOscillator", family: "MOMENTUM", name: "Awesome Oscillator", params: { fast: 5, slow: 34 }, inputs: ["high", "low"], overlay: false, catalogOnly: true,
      definition: "SMA_f((H+L)/2) − SMA_s((H+L)/2)", warmup: function (p) { return Math.max(p.fast, p.slow) - 1; } },
    { id: "coppock", family: "MOMENTUM", name: "Coppock-Kurve", params: { rocLong: 14, rocShort: 11, wmaPeriod: 10 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "WMA_w(ROC_a + ROC_b)", warmup: function (p) { return Math.max(p.rocLong, p.rocShort) + p.wmaPeriod - 1; } },
    { id: "kst", family: "MOMENTUM", name: "Know Sure Thing (KST)", params: {}, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "1·SMA10(ROC10) + 2·SMA10(ROC15) + 3·SMA10(ROC20) + 4·SMA15(ROC30); Signal SMA9", warmup: function () { return 44; } },
    { id: "tsi", family: "MOMENTUM", name: "True Strength Index (TSI)", params: { longPeriod: 25, shortPeriod: 13, signal: 7 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "100·EMA_s(EMA_l(ΔC)) / EMA_s(EMA_l(|ΔC|)); Signal EMA", warmup: function (p) { return p.longPeriod + p.shortPeriod - 1; } },
    { id: "dpo", family: "MOMENTUM", name: "Detrended Price Oscillator (kausal)", params: { period: 20 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "C_{i−(⌊n/2⌋+1)} − SMA_n(i)", warmup: function (p) { return Math.max(p.period - 1, Math.floor(p.period / 2) + 1); } },
    { id: "historicalVolatility", family: "VOLATILITY", name: "Historische Volatilitaet", params: { period: 20, annual: 252 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "Stichprobenstreuung der letzten n Log-Renditen · √annual, in Prozent", warmup: function (p) { return p.period; } },
    { id: "zScore", family: "VOLATILITY", name: "Z-Score", params: { period: 20 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "(C − SMA_n)/σ_n (Population)", warmup: function (p) { return p.period - 1; } },
    { id: "nvi", family: "VOLUME", name: "Negative Volume Index (NVI)", params: {}, inputs: ["close", "volume"], overlay: false, catalogOnly: true,
      definition: "Start 1000, aendert sich nur bei sinkendem Volumen um die Tagesrendite", warmup: function () { return 0; } },
    { id: "pvi", family: "VOLUME", name: "Positive Volume Index (PVI)", params: {}, inputs: ["close", "volume"], overlay: false, catalogOnly: true,
      definition: "Start 1000, aendert sich nur bei steigendem Volumen um die Tagesrendite", warmup: function () { return 0; } },
    { id: "pvo", family: "VOLUME", name: "Percentage Volume Oscillator (PVO)", params: { fast: 12, slow: 26, signal: 9 }, inputs: ["volume"], overlay: false, catalogOnly: true,
      definition: "100·(EMA_f(V) − EMA_s(V))/EMA_s(V); Signal EMA", warmup: function (p) { return p.slow + p.signal - 2; } },
    { id: "connorsRsi", family: "MOMENTUM", name: "Connors RSI", params: { rsiPeriod: 3, streakPeriod: 2, rankPeriod: 100 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "(RSI_3(C) + RSI_2(Serie) + Perzentilrang_100(ROC1))/3", warmup: function (p) { return Math.max(p.rsiPeriod, p.streakPeriod + 1, p.rankPeriod + 1); } },
    { id: "elderImpulse", family: "MOMENTUM", name: "Elder Impulse", params: { period: 13, fast: 12, slow: 26, signal: 9 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "+1, wenn EMA_n und MACD-Histogramm steigen; −1, wenn beide fallen; sonst 0", warmup: function (p) { return Math.max(p.period, p.slow + p.signal - 1); } },
    { id: "chaikinVolatility", family: "VOLATILITY", name: "Chaikin-Volatilitaet", params: { period: 10, rocPeriod: 10 }, inputs: ["high", "low"], overlay: false, catalogOnly: true,
      definition: "100·(EMA_n(H − L) / EMA_n(H − L)₋ᵣ − 1)", warmup: function (p) { return p.period - 1 + p.rocPeriod; } },
    { id: "envelope", family: "TREND", name: "Envelope (Prozentband)", params: { period: 20, pct: 2.5 }, inputs: ["close"], overlay: true, catalogOnly: true,
      definition: "SMA_n ± pct %", warmup: function (p) { return p.period - 1; } },
    { id: "pivotsFib", family: "TREND", name: "Pivot-Punkte (Fibonacci)", params: {}, inputs: ["high", "low", "close"], overlay: true, catalogOnly: true,
      definition: "P = (H+L+C)/3 der Vorbar, R/S1..3 = P ± {0,382; 0,618; 1}·(H − L)", warmup: function () { return 1; } },
    { id: "pivotsCamarilla", family: "TREND", name: "Pivot-Punkte (Camarilla)", params: {}, inputs: ["high", "low", "close"], overlay: true, catalogOnly: true,
      definition: "R/S1..4 = C ± (H − L)·1,1/{12; 6; 4; 2} der Vorbar", warmup: function () { return 1; } },
    { id: "pivotsWoodie", family: "TREND", name: "Pivot-Punkte (Woodie)", params: {}, inputs: ["high", "low", "close"], overlay: true, catalogOnly: true,
      definition: "P = (H + L + 2C)/4 der Vorbar, R1 = 2P − L, S1 = 2P − H, R2/S2 = P ± (H − L)", warmup: function () { return 1; } },
    /* 1.6.0 (L12) */
    { id: "apo", family: "MOMENTUM", name: "Absolute Price Oscillator (APO)", params: { fast: 12, slow: 26 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "EMA_fast(C) − EMA_slow(C)", warmup: function (p) { return p.slow - 1; } },
    { id: "midprice", family: "TREND", name: "Midprice", params: { period: 14 }, inputs: ["high", "low"], overlay: true, catalogOnly: true,
      definition: "(hoechstes Hoch + tiefstes Tief der letzten n Bars) / 2", warmup: function (p) { return p.period - 1; } },
    { id: "tsf", family: "TREND", name: "Time Series Forecast (TSF)", params: { period: 14 }, inputs: ["close"], overlay: true, catalogOnly: true,
      definition: "Regressionsgerade der letzten n Schluesse, einen Bar fortgeschrieben", warmup: function (p) { return p.period - 1; } },
    { id: "adxr", family: "TREND", name: "Average Directional Movement Rating (ADXR)", params: { period: 14 }, inputs: ["high", "low", "close"], overlay: false, catalogOnly: true,
      definition: "(ADX_i + ADX_{i−(n−1)}) / 2", warmup: function (p) { return 3 * p.period - 2; } },
    { id: "stochFast", family: "MOMENTUM", name: "Schnelle Stochastik", params: { kPeriod: 14, dPeriod: 3 }, inputs: ["high", "low", "close"], overlay: false, catalogOnly: true,
      definition: "%K = 100·(C − LL_n)/(HH_n − LL_n) ungeglaettet, %D = SMA_d(%K)", warmup: function (p) { return p.kPeriod - 1; } },
    { id: "fisher", family: "MOMENTUM", name: "Fisher Transform", params: { period: 9 }, inputs: ["high", "low"], overlay: false, catalogOnly: true,
      definition: "x = (HL2 − LL_n)/(HH_n − LL_n) − 0,5; v = 0,66·x + 0,67·v₋₁ (±0,999); F = 0,5·ln((1+v)/(1−v)) + 0,5·F₋₁; Signal = F₋₁", warmup: function (p) { return p.period - 1; } },
    { id: "stc", family: "MOMENTUM", name: "Schaff Trend Cycle (STC)", params: { fast: 23, slow: 50, cycle: 10, factor: 0.5 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "zweifach geglaettete Stochastik des MACD (EMA_fast − EMA_slow) ueber `cycle` Bars, Glaettung f", warmup: function (p) { return p.slow + 2 * p.cycle - 3; } },
    { id: "rvgi", family: "MOMENTUM", name: "Relative Vigor Index (RVGI)", params: { period: 10 }, inputs: ["open", "high", "low", "close"], overlay: false, catalogOnly: true,
      definition: "Σ_n SWMA₄(C − O) / Σ_n SWMA₄(H − L), Signal = SWMA₄(RVGI)", warmup: function (p) { return p.period + 2; } },
    { id: "pvt", family: "VOLUME", name: "Price Volume Trend (PVT)", params: {}, inputs: ["close", "volume"], overlay: false, catalogOnly: true,
      definition: "kumuliert V·(C − C₋₁)/C₋₁", warmup: function () { return 1; } },
    { id: "vhf", family: "TREND", name: "Vertical Horizontal Filter (VHF)", params: { period: 28 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "(max − min der Schluesse ueber n) / Σ_n |C − C₋₁|", warmup: function (p) { return p.period; } },
    { id: "efficiencyRatio", family: "TREND", name: "Efficiency Ratio (Kaufman)", params: { period: 10 }, inputs: ["close"], overlay: false, catalogOnly: true,
      definition: "|C − C₋ₙ| / Σ_n |C − C₋₁|", warmup: function (p) { return p.period; } },
    { id: "qstick", family: "MOMENTUM", name: "QStick (Chande)", params: { period: 10 }, inputs: ["open", "close"], overlay: false, catalogOnly: true,
      definition: "SMA_n(C − O)", warmup: function (p) { return p.period - 1; } },
    { id: "alligator", family: "TREND", name: "Williams Alligator", params: { jaw: 13, jawShift: 8, teeth: 8, teethShift: 5, lips: 5, lipsShift: 3 }, inputs: ["high", "low"], overlay: true, catalogOnly: true,
      definition: "SMMA des Medianpreises: Kiefer 13 (8 Bars versetzt), Zaehne 8 (5), Lippen 5 (3); am Bar i der Wert von i − Versatz", warmup: function (p) { return p.jaw + p.jawShift - 1; } },
    { id: "fractals", family: "TREND", name: "Williams Fractals", params: {}, inputs: ["high", "low"], overlay: true, catalogOnly: true,
      definition: "Hoch/Tief strikt ueber/unter den zwei Bars davor und danach; ausgewiesen am Bestaetigungsbar (zwei Bars spaeter) als 1/0 und Preis", warmup: function () { return 4; } }
  ];

  var FRACTIONAL = ["multiplier", "k", "threshold", "step", "max", "vfactor", "offset", "sigma", "pct", "factor"];
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
    switch (entry.base || id) {
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
      case "pivots": v = pivots(s.high, s.low, s.close); break;
      case "kama": v = kama(s.close, p.period, p.fast, p.slow); break;
      case "hma": v = hma(s.close, p.period); break;
      case "linreg": v = linreg(s.close, p.period, p.k); break;
      case "heikinAshi": v = heikinAshi(s.open, s.high, s.low, s.close); break;
      case "trix": v = trix(s.close, p.period, p.signal); break;
      case "ultimateOscillator": v = ultimateOscillator(s.high, s.low, s.close, p.short, p.medium, p.long); break;
      case "cmo": v = cmo(s.close, p.period); break;
      case "chandelier": v = chandelier(s.high, s.low, s.close, p.period, p.multiplier); break;
      case "insideBar": v = insideBar(s.high, s.low); break;
      case "nr7": v = narrowRange(s.high, s.low, p.period); break;
      case "dema": v = dema(s.close, p.period); break;
      case "tema": v = tema(s.close, p.period); break;
      case "trima": v = trima(s.close, p.period); break;
      case "t3": v = t3(s.close, p.period, p.vfactor); break;
      case "zlema": v = zlema(s.close, p.period); break;
      case "alma": v = alma(s.close, p.period, p.offset, p.sigma); break;
      case "mcginley": v = mcginley(s.close, p.period); break;
      case "ppo": v = ppo(s.close, p.fast, p.slow, p.signal); break;
      case "stochRsi": v = stochRsi(s.close, p.rsiPeriod, p.stochPeriod, p.kSmooth, p.dPeriod); break;
      case "natr": v = natr(s.high, s.low, s.close, p.period); break;
      case "adLine": v = adLine(s.high, s.low, s.close, s.volume); break;
      case "chaikinOsc": v = chaikinOsc(s.high, s.low, s.close, s.volume, p.fast, p.slow); break;
      case "balanceOfPower": v = balanceOfPower(s.open, s.high, s.low, s.close, p.period); break;
      case "momentum": v = momentum(s.close, p.period); break;
      case "stdDev": v = stdDev(s.close, p.period); break;
      case "vortex": v = vortex(s.high, s.low, s.close, p.period); break;
      case "massIndex": v = massIndex(s.high, s.low, p.emaPeriod, p.sumPeriod); break;
      case "choppiness": v = choppiness(s.high, s.low, s.close, p.period); break;
      case "ulcerIndex": v = ulcerIndex(s.close, p.period); break;
      case "forceIndex": v = forceIndex(s.close, s.volume, p.period); break;
      case "klinger": v = klinger(s.high, s.low, s.close, s.volume, p.fast, p.slow, p.signal); break;
      case "elderRay": v = elderRay(s.high, s.low, s.close, p.period); break;
      case "easeOfMovement": v = easeOfMovement(s.high, s.low, s.volume, p.period, p.scale); break;
      case "awesomeOscillator": v = awesomeOscillator(s.high, s.low, p.fast, p.slow); break;
      case "coppock": v = coppock(s.close, p.rocLong, p.rocShort, p.wmaPeriod); break;
      case "kst": v = kst(s.close); break;
      case "tsi": v = tsi(s.close, p.longPeriod, p.shortPeriod, p.signal); break;
      case "dpo": v = dpo(s.close, p.period); break;
      case "historicalVolatility": v = historicalVolatility(s.close, p.period, p.annual); break;
      case "zScore": v = zScore(s.close, p.period); break;
      case "nvi": v = nvi(s.close, s.volume); break;
      case "pvi": v = pvi(s.close, s.volume); break;
      case "pvo": v = pvo(s.volume, p.fast, p.slow, p.signal); break;
      case "connorsRsi": v = connorsRsi(s.close, p.rsiPeriod, p.streakPeriod, p.rankPeriod); break;
      case "elderImpulse": v = elderImpulse(s.close, p.period, p.fast, p.slow, p.signal); break;
      case "chaikinVolatility": v = chaikinVolatility(s.high, s.low, p.period, p.rocPeriod); break;
      case "envelope": v = envelope(s.close, p.period, p.pct); break;
      case "pivotsFib": v = pivotVariant(s.high, s.low, s.close, "fibonacci"); break;
      case "pivotsCamarilla": v = pivotVariant(s.high, s.low, s.close, "camarilla"); break;
      case "pivotsWoodie": v = pivotVariant(s.high, s.low, s.close, "woodie"); break;
      case "apo": v = apo(s.close, p.fast, p.slow); break;
      case "midprice": v = midprice(s.high, s.low, p.period); break;
      case "tsf": v = tsf(s.close, p.period); break;
      case "adxr": v = adxr(s.high, s.low, s.close, p.period); break;
      case "stochFast": v = stochFast(s.high, s.low, s.close, p.kPeriod, p.dPeriod); break;
      case "fisher": v = fisher(s.high, s.low, p.period); break;
      case "stc": v = stc(s.close, p.fast, p.slow, p.cycle, p.factor); break;
      case "rvgi": v = rvgi(s.open, s.high, s.low, s.close, p.period); break;
      case "pvt": v = pvt(s.close, s.volume); break;
      case "vhf": v = vhf(s.close, p.period); break;
      case "efficiencyRatio": v = efficiencyRatio(s.close, p.period); break;
      case "qstick": v = qstick(s.open, s.close, p.period); break;
      case "alligator": v = alligator(s.high, s.low, p.jaw, p.jawShift, p.teeth, p.teethShift, p.lips, p.lipsShift); break;
      case "fractals": v = fractals(s.high, s.low); break;
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
    psar: psar, ichimoku: ichimoku, vwma: vwma, williamsR: williamsR, aroon: aroon, cmf: cmf,
    /* 1.2.0 (B6) */
    pivots: pivots, trix: trix, ultimateOscillator: ultimateOscillator, cmo: cmo, kama: kama, hma: hma,
    chandelier: chandelier, linreg: linreg, insideBar: insideBar, narrowRange: narrowRange, heikinAshi: heikinAshi,
    /* 1.3.0 (L2a) */
    dema: dema, tema: tema, trima: trima, t3: t3, zlema: zlema, alma: alma, mcginley: mcginley, ppo: ppo, stochRsi: stochRsi,
    natr: natr, adLine: adLine, chaikinOsc: chaikinOsc, balanceOfPower: balanceOfPower, momentum: momentum, stdDev: stdDev,
    /* 1.4.0 (L2b) */
    vortex: vortex, massIndex: massIndex, choppiness: choppiness, ulcerIndex: ulcerIndex, forceIndex: forceIndex, elderRay: elderRay,
    easeOfMovement: easeOfMovement, awesomeOscillator: awesomeOscillator, coppock: coppock, kst: kst, tsi: tsi, dpo: dpo,
    historicalVolatility: historicalVolatility, zScore: zScore, nvi: nvi, pvi: pvi, pvo: pvo, connorsRsi: connorsRsi,
    elderImpulse: elderImpulse, chaikinVolatility: chaikinVolatility, envelope: envelope, pivotVariant: pivotVariant,
    /* 1.6.0 (L12) */
    apo: apo, midprice: midprice, tsf: tsf, adxr: adxr, stochFast: stochFast, fisher: fisher, stc: stc, rvgi: rvgi, pvt: pvt,
    vhf: vhf, efficiencyRatio: efficiencyRatio, qstick: qstick, alligator: alligator, fractals: fractals
  };

  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Indicators = api; }
})(typeof window !== "undefined" ? window : globalThis);
