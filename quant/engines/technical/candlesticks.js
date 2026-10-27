/* =========================================================================
   VISION UNIVERSE TECHNICAL — candlesticks.js
   CANDLESTICK-MUSTERBIBLIOTHEK (L4, docs/technical/CANDLESTICKS.md)

   Erkennt etablierte Ein-, Zwei-, Drei- und Fuenfkerzenmuster nach Nison
   bzw. Morris. Die Schwellen sind relativ zur juengeren Kerzenhistorie und
   folgen den dokumentierten Standardeinstellungen von TA-Lib (CandleSettings),
   damit die Erkennung gegen eine fremde Implementierung messbar ist:

     Einstellung       Bezug          Fenster  Faktor   Bedeutung
     BodyLong          Koerper        10       1,0      Koerper > Mittel der Koerper
     BodyVeryLong      Koerper        10       3,0
     BodyShort         Koerper        10       1,0      Koerper < Mittel der Koerper
     BodyDoji          Spanne H−L     10       0,1      Koerper ≤ 10 % der mittleren Spanne
     ShadowLong        Koerper        0        1,0      Schatten > eigener Koerper
     ShadowVeryLong    Koerper        0        2,0      Schatten > 2 × eigener Koerper
     ShadowShort       Schatten       10       1,0      Schatten < Mittel (oben+unten)/2
     ShadowVeryShort   Spanne H−L     10       0,1      Schatten < 10 % der mittleren Spanne
     Near              Spanne H−L     5        0,2
     Far               Spanne H−L     5        0,6
     Equal             Spanne H−L     5        0,05

   „Mittel“ ist das Mittel ueber die Fenster-Kerzen VOR der Bezugskerze
   (ohne sie). Bei Fenster 0 ist es der Wert der Bezugskerze selbst. Ist das
   Mittel 0 (keine Bewegung im Fenster, z. B. ruhender Titel), gibt es keinen
   Massstab: Das Muster ist an dieser Bar nicht entscheidbar (NaN).
   Gleichstaende: Masse und Mittel auf 10 signifikante Stellen gerundet.

   Ausgabe je Muster: eine Reihe mit +1 (bullisch), −1 (baerisch), 0 (kein
   Muster) und NaN (nicht entscheidbar: Aufwaermphase oder fehlender Wert in
   einer benutzten Kerze). Das Signal steht an der LETZTEN Kerze des Musters.
   Kausal: Bar i nutzt nur Bars ≤ i. Keine Zufallsquellen, keine Uhrzeit.

   Kontext: Die Kerzenform allein ist das Muster. Ein vorausgehender Trend
   wird nur dort verlangt, wo die Definition ihn enthaelt (Hammer/Hanging
   Man: Lage zum Vortagestief bzw. -hoch; Inverted Hammer/Shooting Star:
   Koerperluecke). Eine Bewertung, ob ein Muster „wirkt“, gehoert in die
   Evidenz (Trefferquoten mit Definition und Stichprobe), nicht hierher.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var CANDLESTICKS_VERSION = "technical-candlesticks-1.0.0";

  var SETTINGS = {
    BodyLong: { range: "body", period: 10, factor: 1.0 },
    BodyVeryLong: { range: "body", period: 10, factor: 3.0 },
    BodyShort: { range: "body", period: 10, factor: 1.0 },
    BodyDoji: { range: "hl", period: 10, factor: 0.1 },
    ShadowLong: { range: "body", period: 0, factor: 1.0 },
    ShadowVeryLong: { range: "body", period: 0, factor: 2.0 },
    ShadowShort: { range: "shadows", period: 10, factor: 1.0 },
    ShadowVeryShort: { range: "hl", period: 10, factor: 0.1 },
    Near: { range: "hl", period: 5, factor: 0.2 },
    Far: { range: "hl", period: 5, factor: 0.6 },
    Equal: { range: "hl", period: 5, factor: 0.05 }
  };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function arr(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = NaN; return a; }
  /* Kurse haben 4 Nachkommastellen; Koerper, Schatten und Mittel werden auf 10 signifikante Stellen
     gerundet, damit ein Gleichstand (z. B. Koerper 0,14 gegen Mittel 0,14) nicht vom Gleitkommarest
     entschieden wird: strikt groesser ist dann falsch, hoechstens ist wahr. */
  function round10(v) { return isNum(v) ? Number(v.toPrecision(10)) : v; }

  /** Kerzenmasse und rollierende Summen fuer die Einstellungen; ein Kontext je Reihe. */
  function context(series, opts) {
    /* opts.roundTies === false: ohne Rundung (nur fuer den Nachweis, dass alle Abweichungen zu TA-Lib Gleichstaende sind). */
    var q = opts && opts.roundTies === false ? function (v) { return v; } : round10;
    var o = series.open || [], h = series.high || [], l = series.low || [], c = series.close || [], n = c.length;
    var ok = new Array(n), body = arr(n), hl = arr(n), up = arr(n), lo = arr(n), sh = arr(n);
    for (var i = 0; i < n; i++) {
      ok[i] = isNum(o[i]) && isNum(h[i]) && isNum(l[i]) && isNum(c[i]);
      if (!ok[i]) continue;
      body[i] = q(Math.abs(c[i] - o[i])); hl[i] = q(h[i] - l[i]);
      up[i] = q(h[i] - Math.max(o[i], c[i])); lo[i] = q(Math.min(o[i], c[i]) - l[i]); sh[i] = q(up[i] + lo[i]);
    }
    var src = { body: body, hl: hl, shadows: sh };
    /* Praefixsummen und Zahl der Luecken: Mittel ueber [k − p, k − 1] in O(1), Luecke im Fenster ergibt NaN. */
    var pre = {};
    Object.keys(src).forEach(function (key) {
      var s = new Array(n + 1), g = new Array(n + 1); s[0] = 0; g[0] = 0;
      for (var j = 0; j < n; j++) { var v = src[key][j]; s[j + 1] = s[j] + (isNum(v) ? v : 0); g[j + 1] = g[j] + (isNum(v) ? 0 : 1); }
      pre[key] = { s: s, g: g };
    });
    function avg(name, k) {
      var st = SETTINGS[name];
      if (k < 0 || k >= n || !ok[k]) return NaN;
      var base;
      if (st.period === 0) base = src[st.range][k];
      else {
        if (k - st.period < 0) return NaN;
        var P = pre[st.range];
        if (P.g[k] - P.g[k - st.period] > 0) return NaN;
        base = q((P.s[k] - P.s[k - st.period]) / st.period);
        /* Ohne Bewegung im Fenster (Mittel 0) gibt es keinen Massstab: nicht entscheidbar. */
        if (!(base > 0)) return NaN;
      }
      return q(st.factor * base / (st.range === "shadows" ? 2 : 1));
    }
    return { n: n, o: o, h: h, l: l, c: c, ok: ok, body: body, hl: hl, up: up, lo: lo, avg: avg,
      color: function (k) { return c[k] >= o[k] ? 1 : -1; },
      top: function (k) { return Math.max(o[k], c[k]); },
      bottom: function (k) { return Math.min(o[k], c[k]); } };
  }

  /* Koerper- und Kerzenluecken (Nison): Koerperluecke = kein Ueberlappen der Koerper, Kerzenluecke = kein Ueberlappen von H/L. */
  function bodyGapUp(x, a, b) { return x.bottom(a) > x.top(b); }
  function bodyGapDown(x, a, b) { return x.top(a) < x.bottom(b); }
  function candleGapUp(x, a, b) { return x.l[a] > x.h[b]; }
  function candleGapDown(x, a, b) { return x.h[a] < x.l[b]; }

  /**
   * Musterkatalog. `candles` = Zahl der Kerzen, `uses` = benutzte Einstellungen je Kerzenabstand
   * (fuer die Aufwaermphase), `ta` = TA-Lib-Gegenstueck (Abgleich, nicht Abhaengigkeit),
   * `rule` = dokumentierte Regel, `fn(x, i)` = Signal an Bar i (alle Kerzen vorhanden).
   */
  var PATTERNS = [
    { id: "doji", name: "Doji", candles: 1, direction: "neutral", ta: "CDLDOJI", uses: [[0, "BodyDoji"]],
      rule: "Koerper ≤ BodyDoji", fn: function (x, i) { return x.body[i] <= x.avg("BodyDoji", i) ? 1 : 0; } },
    { id: "dragonflyDoji", name: "Libellen-Doji", candles: 1, direction: "bullish", ta: "CDLDRAGONFLYDOJI", uses: [[0, "BodyDoji"], [0, "ShadowVeryShort"]],
      rule: "Doji, oberer Schatten < ShadowVeryShort, unterer Schatten > ShadowVeryShort",
      fn: function (x, i) { var s = x.avg("ShadowVeryShort", i); return x.body[i] <= x.avg("BodyDoji", i) && x.up[i] < s && x.lo[i] > s ? 1 : 0; } },
    { id: "gravestoneDoji", name: "Grabstein-Doji", candles: 1, direction: "bearish", ta: "CDLGRAVESTONEDOJI", uses: [[0, "BodyDoji"], [0, "ShadowVeryShort"]],
      rule: "Doji, unterer Schatten < ShadowVeryShort, oberer Schatten > ShadowVeryShort",
      fn: function (x, i) { var s = x.avg("ShadowVeryShort", i); return x.body[i] <= x.avg("BodyDoji", i) && x.lo[i] < s && x.up[i] > s ? -1 : 0; } },
    { id: "longLeggedDoji", name: "Long-Legged Doji", candles: 1, direction: "neutral", ta: "CDLLONGLEGGEDDOJI", uses: [[0, "BodyDoji"], [0, "ShadowLong"]],
      rule: "Doji mit mindestens einem langen Schatten (> ShadowLong)",
      fn: function (x, i) { var s = x.avg("ShadowLong", i); return x.body[i] <= x.avg("BodyDoji", i) && (x.lo[i] > s || x.up[i] > s) ? 1 : 0; } },
    { id: "hammer", name: "Hammer", candles: 1, direction: "bullish", ta: "CDLHAMMER", uses: [[0, "BodyShort"], [0, "ShadowLong"], [0, "ShadowVeryShort"], [1, "Near"]],
      rule: "kurzer Koerper, unterer Schatten > ShadowLong, oberer Schatten < ShadowVeryShort, Koerper am oder unter dem Vortagestief (≤ L₋₁ + Near)",
      fn: function (x, i) { return x.body[i] < x.avg("BodyShort", i) && x.lo[i] > x.avg("ShadowLong", i) && x.up[i] < x.avg("ShadowVeryShort", i) && x.bottom(i) <= x.l[i - 1] + x.avg("Near", i - 1) ? 1 : 0; } },
    { id: "hangingMan", name: "Hanging Man", candles: 1, direction: "bearish", ta: "CDLHANGINGMAN", uses: [[0, "BodyShort"], [0, "ShadowLong"], [0, "ShadowVeryShort"], [1, "Near"]],
      rule: "Form des Hammers, Koerper am oder ueber dem Vortageshoch (≥ H₋₁ − Near)",
      fn: function (x, i) { return x.body[i] < x.avg("BodyShort", i) && x.lo[i] > x.avg("ShadowLong", i) && x.up[i] < x.avg("ShadowVeryShort", i) && x.bottom(i) >= x.h[i - 1] - x.avg("Near", i - 1) ? -1 : 0; } },
    { id: "invertedHammer", name: "Umgekehrter Hammer", candles: 2, direction: "bullish", ta: "CDLINVERTEDHAMMER", uses: [[0, "BodyShort"], [0, "ShadowLong"], [0, "ShadowVeryShort"]],
      rule: "kurzer Koerper, oberer Schatten > ShadowLong, unterer Schatten < ShadowVeryShort, Koerperluecke nach unten zur Vorkerze",
      fn: function (x, i) { return x.body[i] < x.avg("BodyShort", i) && x.up[i] > x.avg("ShadowLong", i) && x.lo[i] < x.avg("ShadowVeryShort", i) && bodyGapDown(x, i, i - 1) ? 1 : 0; } },
    { id: "shootingStar", name: "Shooting Star", candles: 2, direction: "bearish", ta: "CDLSHOOTINGSTAR", uses: [[0, "BodyShort"], [0, "ShadowLong"], [0, "ShadowVeryShort"]],
      rule: "Form des umgekehrten Hammers, Koerperluecke nach oben zur Vorkerze",
      fn: function (x, i) { return x.body[i] < x.avg("BodyShort", i) && x.up[i] > x.avg("ShadowLong", i) && x.lo[i] < x.avg("ShadowVeryShort", i) && bodyGapUp(x, i, i - 1) ? -1 : 0; } },
    { id: "marubozu", name: "Marubozu", candles: 1, direction: "both", ta: "CDLMARUBOZU", uses: [[0, "BodyLong"], [0, "ShadowVeryShort"]],
      rule: "langer Koerper (> BodyLong), beide Schatten < ShadowVeryShort; Richtung = Farbe",
      fn: function (x, i) { var s = x.avg("ShadowVeryShort", i); return x.body[i] > x.avg("BodyLong", i) && x.up[i] < s && x.lo[i] < s ? x.color(i) : 0; } },
    { id: "spinningTop", name: "Spinning Top", candles: 1, direction: "neutral", ta: "CDLSPINNINGTOP", uses: [[0, "BodyShort"]],
      rule: "kurzer Koerper (< BodyShort), beide Schatten laenger als der Koerper; Vorzeichen = Farbe (TA-Lib-Konvention)",
      fn: function (x, i) { return x.body[i] < x.avg("BodyShort", i) && x.up[i] > x.body[i] && x.lo[i] > x.body[i] ? x.color(i) : 0; } },
    { id: "engulfing", name: "Engulfing (umschliessend)", candles: 2, direction: "both", ta: "CDLENGULFING", uses: [],
      rule: "Koerper der zweiten Kerze umschliesst den Koerper der ersten, Farben entgegengesetzt (eine Kante darf gleich sein); Richtung = Farbe der zweiten",
      fn: function (x, i) {
        var o = x.o, c = x.c, a = i - 1;
        if (x.color(i) === 1 && x.color(a) === -1 && ((c[i] >= o[a] && o[i] < c[a]) || (c[i] > o[a] && o[i] <= c[a]))) return 1;
        if (x.color(i) === -1 && x.color(a) === 1 && ((o[i] >= c[a] && c[i] < o[a]) || (o[i] > c[a] && c[i] <= o[a]))) return -1;
        return 0;
      } },
    { id: "harami", name: "Harami", candles: 2, direction: "both", ta: "CDLHARAMI", uses: [[1, "BodyLong"], [0, "BodyShort"]],
      rule: "langer erster Koerper, kurzer zweiter Koerper innerhalb des ersten (Kanten duerfen gleich sein); Richtung = Gegenfarbe der ersten",
      fn: function (x, i) {
        var a = i - 1;
        if (!(x.body[a] > x.avg("BodyLong", a) && x.body[i] <= x.avg("BodyShort", i))) return 0;
        return x.top(i) <= x.top(a) && x.bottom(i) >= x.bottom(a) ? -x.color(a) : 0;
      } },
    { id: "haramiCross", name: "Harami Cross", candles: 2, direction: "both", ta: "CDLHARAMICROSS", uses: [[1, "BodyLong"], [0, "BodyDoji"]],
      rule: "Harami mit Doji als zweiter Kerze (≤ BodyDoji)",
      fn: function (x, i) {
        var a = i - 1;
        if (!(x.body[a] > x.avg("BodyLong", a) && x.body[i] <= x.avg("BodyDoji", i))) return 0;
        return x.top(i) <= x.top(a) && x.bottom(i) >= x.bottom(a) ? -x.color(a) : 0;
      } },
    { id: "piercing", name: "Piercing Line", candles: 2, direction: "bullish", ta: "CDLPIERCING", uses: [[1, "BodyLong"], [0, "BodyLong"]],
      rule: "lange schwarze, dann lange weisse Kerze: Eroeffnung unter dem Vortagestief, Schluss ueber der Koerpermitte der ersten, aber unter deren Eroeffnung",
      fn: function (x, i) {
        var a = i - 1;
        return x.color(a) === -1 && x.body[a] > x.avg("BodyLong", a) && x.color(i) === 1 && x.body[i] > x.avg("BodyLong", i) &&
          x.o[i] < x.l[a] && x.c[i] < x.o[a] && x.c[i] > x.c[a] + x.body[a] * 0.5 ? 1 : 0;
      } },
    { id: "darkCloudCover", name: "Dark Cloud Cover", candles: 2, direction: "bearish", ta: "CDLDARKCLOUDCOVER", uses: [[1, "BodyLong"]],
      rule: "lange weisse, dann schwarze Kerze: Eroeffnung ueber dem Vortageshoch, Schluss unter der Koerpermitte der ersten, aber ueber deren Eroeffnung",
      fn: function (x, i) {
        var a = i - 1;
        return x.color(a) === 1 && x.body[a] > x.avg("BodyLong", a) && x.color(i) === -1 &&
          x.o[i] > x.h[a] && x.c[i] > x.o[a] && x.c[i] < x.c[a] - x.body[a] * 0.5 ? -1 : 0;
      } },
    { id: "tweezer", name: "Tweezer Top/Bottom", candles: 2, direction: "both", ta: null, uses: [[1, "Equal"], [1, "BodyLong"]],
      rule: "Gegenfarbige Kerzen mit gleichem Hoch (Top, baerisch: erste weiss und lang) bzw. gleichem Tief (Bottom, bullisch: erste schwarz und lang); gleich = Abstand ≤ Equal",
      fn: function (x, i) {
        var a = i - 1, eq = x.avg("Equal", a);
        if (!(x.body[a] > x.avg("BodyLong", a)) || x.color(a) === x.color(i)) return 0;
        if (x.color(a) === -1 && Math.abs(x.l[i] - x.l[a]) <= eq) return 1;
        if (x.color(a) === 1 && Math.abs(x.h[i] - x.h[a]) <= eq) return -1;
        return 0;
      } },
    { id: "kicking", name: "Kicker (Kicking)", candles: 2, direction: "both", ta: "CDLKICKING", uses: [[1, "BodyLong"], [1, "ShadowVeryShort"], [0, "BodyLong"], [0, "ShadowVeryShort"]],
      rule: "zwei gegenfarbige Marubozu mit Kerzenluecke in Richtung der zweiten",
      fn: function (x, i) {
        var a = i - 1;
        function maru(k) { var s = x.avg("ShadowVeryShort", k); return x.body[k] > x.avg("BodyLong", k) && x.up[k] < s && x.lo[k] < s; }
        if (x.color(a) === x.color(i) || !maru(a) || !maru(i)) return 0;
        if (x.color(a) === -1 && candleGapUp(x, i, a)) return 1;
        if (x.color(a) === 1 && candleGapDown(x, i, a)) return -1;
        return 0;
      } },
    { id: "morningStar", name: "Morning Star", candles: 3, direction: "bullish", ta: "CDLMORNINGSTAR", uses: [[2, "BodyLong"], [1, "BodyShort"], [0, "BodyShort"]],
      rule: "lange schwarze Kerze, kurzer Koerper mit Koerperluecke nach unten, weisse Kerze (> BodyShort) mit Schluss ueber 30 % in den ersten Koerper",
      fn: function (x, i) {
        var a = i - 2, b = i - 1;
        return x.body[a] > x.avg("BodyLong", a) && x.color(a) === -1 && x.body[b] <= x.avg("BodyShort", b) && bodyGapDown(x, b, a) &&
          x.body[i] > x.avg("BodyShort", i) && x.color(i) === 1 && x.c[i] > x.c[a] + x.body[a] * 0.3 ? 1 : 0;
      } },
    { id: "eveningStar", name: "Evening Star", candles: 3, direction: "bearish", ta: "CDLEVENINGSTAR", uses: [[2, "BodyLong"], [1, "BodyShort"], [0, "BodyShort"]],
      rule: "lange weisse Kerze, kurzer Koerper mit Koerperluecke nach oben, schwarze Kerze (> BodyShort) mit Schluss unter 30 % in den ersten Koerper",
      fn: function (x, i) {
        var a = i - 2, b = i - 1;
        return x.body[a] > x.avg("BodyLong", a) && x.color(a) === 1 && x.body[b] <= x.avg("BodyShort", b) && bodyGapUp(x, b, a) &&
          x.body[i] > x.avg("BodyShort", i) && x.color(i) === -1 && x.c[i] < x.c[a] - x.body[a] * 0.3 ? -1 : 0;
      } },
    { id: "morningDojiStar", name: "Morning Doji Star", candles: 3, direction: "bullish", ta: "CDLMORNINGDOJISTAR", uses: [[2, "BodyLong"], [1, "BodyDoji"], [0, "BodyShort"]],
      rule: "Morning Star mit Doji als mittlerer Kerze",
      fn: function (x, i) {
        var a = i - 2, b = i - 1;
        return x.body[a] > x.avg("BodyLong", a) && x.color(a) === -1 && x.body[b] <= x.avg("BodyDoji", b) && bodyGapDown(x, b, a) &&
          x.body[i] > x.avg("BodyShort", i) && x.color(i) === 1 && x.c[i] > x.c[a] + x.body[a] * 0.3 ? 1 : 0;
      } },
    { id: "eveningDojiStar", name: "Evening Doji Star", candles: 3, direction: "bearish", ta: "CDLEVENINGDOJISTAR", uses: [[2, "BodyLong"], [1, "BodyDoji"], [0, "BodyShort"]],
      rule: "Evening Star mit Doji als mittlerer Kerze",
      fn: function (x, i) {
        var a = i - 2, b = i - 1;
        return x.body[a] > x.avg("BodyLong", a) && x.color(a) === 1 && x.body[b] <= x.avg("BodyDoji", b) && bodyGapUp(x, b, a) &&
          x.body[i] > x.avg("BodyShort", i) && x.color(i) === -1 && x.c[i] < x.c[a] - x.body[a] * 0.3 ? -1 : 0;
      } },
    { id: "abandonedBaby", name: "Abandoned Baby", candles: 3, direction: "both", ta: "CDLABANDONEDBABY", uses: [[2, "BodyLong"], [1, "BodyDoji"], [0, "BodyShort"]],
      rule: "lange Kerze, Doji mit Kerzenluecke, Gegenkerze mit Kerzenluecke zurueck und Schluss 30 % in den ersten Koerper",
      fn: function (x, i) {
        var a = i - 2, b = i - 1;
        if (!(x.body[a] > x.avg("BodyLong", a) && x.body[b] <= x.avg("BodyDoji", b) && x.body[i] > x.avg("BodyShort", i))) return 0;
        if (x.color(a) === 1 && x.color(i) === -1 && x.c[i] < x.c[a] - x.body[a] * 0.3 && candleGapUp(x, b, a) && candleGapDown(x, i, b)) return -1;
        if (x.color(a) === -1 && x.color(i) === 1 && x.c[i] > x.c[a] + x.body[a] * 0.3 && candleGapDown(x, b, a) && candleGapUp(x, i, b)) return 1;
        return 0;
      } },
    { id: "threeWhiteSoldiers", name: "Three White Soldiers", candles: 3, direction: "bullish", ta: "CDL3WHITESOLDIERS",
      uses: [[2, "ShadowVeryShort"], [1, "ShadowVeryShort"], [0, "ShadowVeryShort"], [2, "Near"], [1, "Near"], [2, "Far"], [1, "Far"], [0, "BodyShort"]],
      rule: "drei weisse Kerzen mit steigenden Schluessen und sehr kurzen oberen Schatten; jede eroeffnet im oder knapp ueber dem Vorkoerper (≤ Near), Koerper nicht deutlich kleiner als der vorige (> − Far), letzte nicht kurz",
      fn: function (x, i) {
        var a = i - 2, b = i - 1, o = x.o, c = x.c;
        return x.color(a) === 1 && x.up[a] < x.avg("ShadowVeryShort", a) && x.color(b) === 1 && x.up[b] < x.avg("ShadowVeryShort", b) &&
          x.color(i) === 1 && x.up[i] < x.avg("ShadowVeryShort", i) && c[i] > c[b] && c[b] > c[a] &&
          o[b] > o[a] && o[b] <= c[a] + x.avg("Near", a) && o[i] > o[b] && o[i] <= c[b] + x.avg("Near", b) &&
          x.body[b] > x.body[a] - x.avg("Far", a) && x.body[i] > x.body[b] - x.avg("Far", b) && x.body[i] > x.avg("BodyShort", i) ? 1 : 0;
      } },
    { id: "threeBlackCrows", name: "Three Black Crows", candles: 4, direction: "bearish", ta: "CDL3BLACKCROWS",
      uses: [[2, "ShadowVeryShort"], [1, "ShadowVeryShort"], [0, "ShadowVeryShort"]],
      rule: "nach einer weissen Kerze drei schwarze mit fallenden Schluessen und sehr kurzen unteren Schatten; jede eroeffnet im Vorkoerper; erste schliesst unter dem Hoch der weissen",
      fn: function (x, i) {
        var w = i - 3, a = i - 2, b = i - 1, o = x.o, c = x.c;
        return x.color(w) === 1 && x.color(a) === -1 && x.lo[a] < x.avg("ShadowVeryShort", a) && x.color(b) === -1 && x.lo[b] < x.avg("ShadowVeryShort", b) &&
          x.color(i) === -1 && x.lo[i] < x.avg("ShadowVeryShort", i) && o[b] < o[a] && o[b] > c[a] && o[i] < o[b] && o[i] > c[b] &&
          x.h[w] > c[a] && c[a] > c[b] && c[b] > c[i] ? -1 : 0;
      } },
    { id: "threeInside", name: "Three Inside Up/Down", candles: 3, direction: "both", ta: "CDL3INSIDE", uses: [[2, "BodyLong"], [1, "BodyShort"]],
      rule: "Harami (strikt innerhalb), dann Bestaetigungskerze mit Schluss jenseits der Eroeffnung der ersten",
      fn: function (x, i) {
        var a = i - 2, b = i - 1;
        if (!(x.body[a] > x.avg("BodyLong", a) && x.body[b] <= x.avg("BodyShort", b) && x.top(b) < x.top(a) && x.bottom(b) > x.bottom(a))) return 0;
        if (x.color(a) === 1 && x.color(i) === -1 && x.c[i] < x.o[a]) return -1;
        if (x.color(a) === -1 && x.color(i) === 1 && x.c[i] > x.o[a]) return 1;
        return 0;
      } },
    { id: "threeOutside", name: "Three Outside Up/Down", candles: 3, direction: "both", ta: "CDL3OUTSIDE", uses: [],
      rule: "Engulfing (strikt), dann Schluss jenseits des Schlusses der zweiten Kerze",
      fn: function (x, i) {
        var a = i - 2, b = i - 1, o = x.o, c = x.c;
        if (x.color(b) === 1 && x.color(a) === -1 && c[b] > o[a] && o[b] < c[a] && c[i] > c[b]) return 1;
        if (x.color(b) === -1 && x.color(a) === 1 && o[b] > c[a] && c[b] < o[a] && c[i] < c[b]) return -1;
        return 0;
      } },
    { id: "threeMethods", name: "Rising/Falling Three Methods", candles: 5, direction: "both", ta: "CDLRISEFALL3METHODS",
      uses: [[4, "BodyLong"], [3, "BodyShort"], [2, "BodyShort"], [1, "BodyShort"], [0, "BodyLong"]],
      rule: "lange Kerze, drei kurze Gegenkerzen innerhalb ihrer Spanne gegenlaeufig gestaffelt, lange Kerze der ersten Farbe mit Eroeffnung jenseits und Schluss ueber bzw. unter dem Schluss der ersten",
      fn: function (x, i) {
        var a = i - 4, k1 = i - 3, k2 = i - 2, k3 = i - 1, d = x.color(a), c = x.c, o = x.o;
        if (!(x.body[a] > x.avg("BodyLong", a) && x.body[k1] < x.avg("BodyShort", k1) && x.body[k2] < x.avg("BodyShort", k2) &&
          x.body[k3] < x.avg("BodyShort", k3) && x.body[i] > x.avg("BodyLong", i))) return 0;
        if (!(x.color(k1) === -d && x.color(k2) === -d && x.color(k3) === -d && x.color(i) === d)) return 0;
        for (var k = k1; k <= k3; k++) if (!(x.bottom(k) < x.h[a] && x.top(k) > x.l[a])) return 0;
        if (!(c[k2] * d < c[k1] * d && c[k3] * d < c[k2] * d && o[i] * d > c[k3] * d && c[i] * d > c[a] * d)) return 0;
        return d;
      } }
  ];

  /** Aufwaermphase: erste Bar, an der alle Kerzen und alle benutzten Mittel vorhanden sind. */
  function warmup(p) {
    var w = p.candles - 1;
    p.uses.forEach(function (u) { var st = SETTINGS[u[1]]; w = Math.max(w, u[0] + st.period); });
    return w;
  }
  PATTERNS.forEach(function (p) { p.warmup = warmup(p); });

  function pattern(id) { for (var i = 0; i < PATTERNS.length; i++) if (PATTERNS[i].id === id) return PATTERNS[i]; return null; }

  /** Signalreihe eines Musters. Fehlt eine benutzte Kerze oder ein benutztes Mittel: NaN. */
  function detectOne(x, p) {
    var out = arr(x.n);
    for (var i = p.warmup; i < x.n; i++) {
      var ok = true;
      for (var k = i - p.candles + 1; k <= i; k++) if (!x.ok[k]) { ok = false; break; }
      for (var u = 0; ok && u < p.uses.length; u++) if (!isNum(x.avg(p.uses[u][1], i - p.uses[u][0]))) ok = false;
      if (ok) out[i] = p.fn(x, i);
    }
    return out;
  }

  /**
   * @param {{open, high, low, close}} series Spalten (gleiche Laenge)
   * @param {{only?: string[], roundTies?: boolean}} [opts] nur diese Muster; roundTies false nur fuer Pruefzwecke
   * @returns {{version, patterns: Object<string, number[]>}} je Muster +1/−1/0/NaN an der letzten Kerze
   */
  function detect(series, opts) {
    var x = context(series || {}, opts), want = opts && opts.only, out = {};
    PATTERNS.forEach(function (p) { if (!want || want.indexOf(p.id) >= 0) out[p.id] = detectOne(x, p); });
    return { version: CANDLESTICKS_VERSION, patterns: out };
  }

  /** Muster an der letzten Bar (Stichtag): Liste {id, signal} aller Treffer, fuer Screener und Erklaerung. */
  function atCutoff(series) {
    var r = detect(series), list = [];
    PATTERNS.forEach(function (p) { var a = r.patterns[p.id], v = a[a.length - 1]; if (v === 1 || v === -1) list.push({ id: p.id, signal: v }); });
    return list;
  }

  var api = { CANDLESTICKS_VERSION: CANDLESTICKS_VERSION, SETTINGS: SETTINGS, PATTERNS: PATTERNS, pattern: pattern, detect: detect, atCutoff: atCutoff };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Candlesticks = api; }
})(typeof window !== "undefined" ? window : globalThis);
