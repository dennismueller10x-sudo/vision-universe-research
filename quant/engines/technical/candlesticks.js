/* =========================================================================
   VISION UNIVERSE TECHNICAL — candlesticks.js
   CANDLESTICK-MUSTERBIBLIOTHEK (L4, docs/technical/CANDLESTICKS.md)

   Erkennt etablierte Ein- bis Fuenfkerzenmuster nach Nison
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

   Ab 1.1.0 (31 weitere Muster, z. B. Hikkake, Mat Hold, Tasuki Gap) folgen die
   Regeln Bar fuer Bar den TA-Lib-Funktionen (CDL*), einschliesslich ihrer
   Eigenheiten (Tri-Star misst alle drei Doji am Doji-Mass der ersten Kerze,
   Mat Hold mit Eindringtiefe 0,5). Hikkake ist in TA-Lib zustandsbehaftet
   (Muster ±100, Bestaetigung ±200 bis 3 Bars spaeter); hier wird der Zustand
   aus den letzten 6 Bars neu bestimmt (`span`), die Bestaetigungskerze traegt
   das Vorzeichen des Musters.

   Kontext: Die Kerzenform allein ist das Muster. Ein vorausgehender Trend
   wird nur dort verlangt, wo die Definition ihn enthaelt (Hammer/Hanging
   Man: Lage zum Vortagestief bzw. -hoch; Inverted Hammer/Shooting Star:
   Koerperluecke). Eine Bewertung, ob ein Muster „wirkt“, gehoert in die
   Evidenz (Trefferquoten mit Definition und Stichprobe), nicht hierher.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var CANDLESTICKS_VERSION = "technical-candlesticks-1.1.0";
  /* Mat Hold: hoechstes Eindringen der Zwischenkerzen in den ersten Koerper (TA-Lib optInPenetration, Standard 0,5). */
  var MATHOLD_PENETRATION = 0.5;

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
    /* Zwischenspeicher je Einstellung und Bar: Die Muster fragen dieselben Mittel vielfach ab; avg ist rein,
       der Speicher aendert keinen Wert (spart die wiederholte Rundung ueber toPrecision). */
    var memo = {};
    function avg(name, k) {
      if (k < 0 || k >= n) return NaN;
      var m = memo[name] || (memo[name] = { v: new Array(n), done: new Uint8Array(n) });
      if (m.done[k]) return m.v[k];
      var r = avgOnce(name, k);
      m.v[k] = r; m.done[k] = 1;
      return r;
    }
    function avgOnce(name, k) {
      var st = SETTINGS[name];
      if (!ok[k]) return NaN;
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
      } },
    /* ---------- ab 1.1.0: weitere 31 TA-Lib-Muster (Regeln wie TA-Lib, ohne Trendpruefung, wie dort) ---------- */
    { id: "twoCrows", name: "Two Crows", candles: 3, direction: "bearish", ta: "CDL2CROWS", uses: [[2, "BodyLong"]],
      rule: "lange weisse Kerze, schwarze Kerze mit Koerperluecke nach oben, schwarze Kerze mit Eroeffnung im zweiten Koerper und Schluss im ersten Koerper",
      fn: function (x, i) {
        var a = i - 2, b = i - 1, o = x.o, c = x.c;
        return x.color(a) === 1 && x.body[a] > x.avg("BodyLong", a) && x.color(b) === -1 && bodyGapUp(x, b, a) &&
          x.color(i) === -1 && o[i] < o[b] && o[i] > c[b] && c[i] > o[a] && c[i] < c[a] ? -1 : 0;
      } },
    { id: "threeLineStrike", name: "Three-Line Strike", candles: 4, direction: "both", ta: "CDL3LINESTRIKE", uses: [[3, "Near"], [2, "Near"]],
      rule: "drei gleichfarbige Kerzen mit steigenden (weiss) bzw. fallenden (schwarz) Schluessen, die zweite und dritte eroeffnen im oder nahe am Vorkoerper (± Near), vierte Gegenkerze eroeffnet jenseits des dritten Schlusses und schliesst jenseits der ersten Eroeffnung; Vorzeichen = Farbe der dritten Kerze (TA-Lib-Konvention)",
      fn: function (x, i) {
        var a = i - 3, b = i - 2, d = i - 1, o = x.o, c = x.c, na = x.avg("Near", a), nb = x.avg("Near", b);
        if (!(x.color(a) === x.color(b) && x.color(b) === x.color(d) && x.color(i) === -x.color(d))) return 0;
        if (!(o[b] >= x.bottom(a) - na && o[b] <= x.top(a) + na && o[d] >= x.bottom(b) - nb && o[d] <= x.top(b) + nb)) return 0;
        if (x.color(d) === 1 && c[d] > c[b] && c[b] > c[a] && o[i] > c[d] && c[i] < o[a]) return 1;
        if (x.color(d) === -1 && c[d] < c[b] && c[b] < c[a] && o[i] < c[d] && c[i] > o[a]) return -1;
        return 0;
      } },
    { id: "threeStarsInSouth", name: "Three Stars in the South", candles: 3, direction: "bullish", ta: "CDL3STARSINSOUTH",
      uses: [[2, "BodyLong"], [2, "ShadowLong"], [1, "ShadowVeryShort"], [0, "ShadowVeryShort"], [0, "BodyShort"]],
      rule: "drei schwarze Kerzen: lange erste mit langem unterem Schatten (> Koerper); zweite kleiner, eroeffnet ueber dem ersten Schluss bis zum ersten Hoch, Tief unter dem ersten Schluss, aber nicht unter dem ersten Tief, unterer Schatten nicht sehr kurz; dritte kurz ohne nennenswerte Schatten innerhalb der Spanne der zweiten",
      fn: function (x, i) {
        var a = i - 2, b = i - 1, o = x.o, h = x.h, l = x.l, c = x.c, s1 = x.avg("ShadowVeryShort", b), s0 = x.avg("ShadowVeryShort", i);
        return x.color(a) === -1 && x.color(b) === -1 && x.color(i) === -1 && x.body[a] > x.avg("BodyLong", a) && x.lo[a] > x.avg("ShadowLong", a) &&
          x.body[b] < x.body[a] && o[b] > c[a] && o[b] <= h[a] && l[b] < c[a] && l[b] >= l[a] && x.lo[b] > s1 &&
          x.body[i] < x.avg("BodyShort", i) && x.lo[i] < s0 && x.up[i] < s0 && l[i] > l[b] && h[i] < h[b] ? 1 : 0;
      } },
    { id: "advanceBlock", name: "Advance Block", candles: 3, direction: "bearish", ta: "CDLADVANCEBLOCK",
      uses: [[2, "Near"], [1, "Near"], [2, "Far"], [1, "Far"], [2, "BodyLong"], [2, "ShadowShort"], [1, "ShadowShort"], [0, "ShadowShort"], [0, "ShadowLong"]],
      rule: "drei weisse Kerzen mit steigenden Schluessen, jede eroeffnet im oder knapp ueber dem Vorkoerper (≤ Near), erste lang mit kurzem oberem Schatten; Schwaeche: Koerper schrumpfen deutlich (Far/Near) oder die spaeteren Kerzen haben lange obere Schatten (ShadowShort bzw. ShadowLong) – Kombination wie TA-Lib",
      fn: function (x, i) {
        var a = i - 2, b = i - 1, o = x.o, c = x.c, B = x.body;
        if (!(x.color(a) === 1 && x.color(b) === 1 && x.color(i) === 1 && c[i] > c[b] && c[b] > c[a] && o[b] > o[a] && o[b] <= c[a] + x.avg("Near", a) &&
          o[i] > o[b] && o[i] <= c[b] + x.avg("Near", b) && B[a] > x.avg("BodyLong", a) && x.up[a] < x.avg("ShadowShort", a))) return 0;
        var weak = (B[b] < B[a] - x.avg("Far", a) && B[i] < B[b] + x.avg("Near", b)) || B[i] < B[b] - x.avg("Far", b) ||
          (B[i] < B[b] && B[b] < B[a] && (x.up[i] > x.avg("ShadowShort", i) || x.up[b] > x.avg("ShadowShort", b))) ||
          (B[i] < B[b] && x.up[i] > x.avg("ShadowLong", i));
        return weak ? -1 : 0;
      } },
    { id: "beltHold", name: "Belt Hold", candles: 1, direction: "both", ta: "CDLBELTHOLD", uses: [[0, "BodyLong"], [0, "ShadowVeryShort"]],
      rule: "langer Koerper, der an seinem Extrem eroeffnet: weiss ohne nennenswerten unteren, schwarz ohne nennenswerten oberen Schatten (< ShadowVeryShort); Richtung = Farbe",
      fn: function (x, i) {
        var s = x.avg("ShadowVeryShort", i);
        if (!(x.body[i] > x.avg("BodyLong", i))) return 0;
        return (x.color(i) === 1 && x.lo[i] < s) || (x.color(i) === -1 && x.up[i] < s) ? x.color(i) : 0;
      } },
    { id: "breakaway", name: "Breakaway", candles: 5, direction: "both", ta: "CDLBREAKAWAY", uses: [[4, "BodyLong"]],
      rule: "lange Kerze, gleichfarbige zweite mit Koerperluecke in Trendrichtung, dritte und vierte setzen mit Hoch und Tief fort (vierte gleichfarbig), fuenfte Gegenkerze schliesst in der Luecke zwischen erstem Schluss und zweiter Eroeffnung; Richtung = Farbe der fuenften",
      fn: function (x, i) {
        var a = i - 4, b = i - 3, k = i - 2, d = i - 1, o = x.o, h = x.h, l = x.l, c = x.c;
        if (!(x.color(a) === x.color(b) && x.color(b) === x.color(d) && x.color(d) === -x.color(i) && x.body[a] > x.avg("BodyLong", a))) return 0;
        if (x.color(a) === -1 && bodyGapDown(x, b, a) && h[k] < h[b] && l[k] < l[b] && h[d] < h[k] && l[d] < l[k] && c[i] > o[b] && c[i] < c[a]) return x.color(i);
        if (x.color(a) === 1 && bodyGapUp(x, b, a) && h[k] > h[b] && l[k] > l[b] && h[d] > h[k] && l[d] > l[k] && c[i] < o[b] && c[i] > c[a]) return x.color(i);
        return 0;
      } },
    { id: "closingMarubozu", name: "Closing Marubozu", candles: 1, direction: "both", ta: "CDLCLOSINGMARUBOZU", uses: [[0, "BodyLong"], [0, "ShadowVeryShort"]],
      rule: "langer Koerper, der an seinem Extrem schliesst: weiss ohne nennenswerten oberen, schwarz ohne nennenswerten unteren Schatten (< ShadowVeryShort); Richtung = Farbe",
      fn: function (x, i) {
        var s = x.avg("ShadowVeryShort", i);
        if (!(x.body[i] > x.avg("BodyLong", i))) return 0;
        return (x.color(i) === 1 && x.up[i] < s) || (x.color(i) === -1 && x.lo[i] < s) ? x.color(i) : 0;
      } },
    { id: "concealingBabySwallow", name: "Concealing Baby Swallow", candles: 4, direction: "bullish", ta: "CDLCONCEALBABYSWALL",
      uses: [[3, "ShadowVeryShort"], [2, "ShadowVeryShort"], [1, "ShadowVeryShort"]],
      rule: "vier schwarze Kerzen: zwei schwarze Marubozu (Schatten < ShadowVeryShort), dritte mit Koerperluecke nach unten und langem oberem Schatten bis in den zweiten Koerper, vierte umschliesst die dritte samt Schatten",
      fn: function (x, i) {
        var a = i - 3, b = i - 2, d = i - 1, sa = x.avg("ShadowVeryShort", a), sb = x.avg("ShadowVeryShort", b);
        return x.color(a) === -1 && x.color(b) === -1 && x.color(d) === -1 && x.color(i) === -1 &&
          x.lo[a] < sa && x.up[a] < sa && x.lo[b] < sb && x.up[b] < sb && bodyGapDown(x, d, b) &&
          x.up[d] > x.avg("ShadowVeryShort", d) && x.h[d] > x.c[b] && x.h[i] > x.h[d] && x.l[i] < x.l[d] ? 1 : 0;
      } },
    { id: "counterattack", name: "Counterattack", candles: 2, direction: "both", ta: "CDLCOUNTERATTACK", uses: [[1, "BodyLong"], [0, "BodyLong"], [1, "Equal"]],
      rule: "zwei lange gegenfarbige Kerzen mit (fast) gleichem Schluss (± Equal); Richtung = Farbe der zweiten",
      fn: function (x, i) {
        var b = i - 1, e = x.avg("Equal", b);
        return x.color(b) === -x.color(i) && x.body[b] > x.avg("BodyLong", b) && x.body[i] > x.avg("BodyLong", i) &&
          x.c[i] <= x.c[b] + e && x.c[i] >= x.c[b] - e ? x.color(i) : 0;
      } },
    { id: "dojiStar", name: "Doji Star", candles: 2, direction: "both", ta: "CDLDOJISTAR", uses: [[1, "BodyLong"], [0, "BodyDoji"]],
      rule: "lange Kerze, dann Doji mit Koerperluecke in ihrer Richtung; Richtung = Gegenfarbe der ersten",
      fn: function (x, i) {
        var b = i - 1;
        if (!(x.body[b] > x.avg("BodyLong", b) && x.body[i] <= x.avg("BodyDoji", i))) return 0;
        return (x.color(b) === 1 && bodyGapUp(x, i, b)) || (x.color(b) === -1 && bodyGapDown(x, i, b)) ? -x.color(b) : 0;
      } },
    { id: "gapSideBySideWhite", name: "Gap Side-by-Side White Lines", candles: 3, direction: "both", ta: "CDLGAPSIDESIDEWHITE", uses: [[1, "Near"], [1, "Equal"]],
      rule: "zwei weisse Kerzen nebeneinander, beide mit Koerperluecke zur ersten Kerze (oben: bullisch, unten: baerisch), Koerper aehnlich (± Near), Eroeffnungen gleich (± Equal)",
      fn: function (x, i) {
        var a = i - 2, b = i - 1, n = x.avg("Near", b), e = x.avg("Equal", b), up = bodyGapUp(x, b, a) && bodyGapUp(x, i, a);
        if (!(up || (bodyGapDown(x, b, a) && bodyGapDown(x, i, a)))) return 0;
        return x.color(b) === 1 && x.color(i) === 1 && x.body[i] >= x.body[b] - n && x.body[i] <= x.body[b] + n &&
          x.o[i] >= x.o[b] - e && x.o[i] <= x.o[b] + e ? (bodyGapUp(x, b, a) ? 1 : -1) : 0;
      } },
    { id: "highWave", name: "High Wave", candles: 1, direction: "neutral", ta: "CDLHIGHWAVE", uses: [[0, "BodyShort"], [0, "ShadowVeryLong"]],
      rule: "kurzer Koerper (< BodyShort), beide Schatten laenger als der doppelte Koerper (ShadowVeryLong); Vorzeichen = Farbe (TA-Lib-Konvention)",
      fn: function (x, i) {
        var s = x.avg("ShadowVeryLong", i);
        return x.body[i] < x.avg("BodyShort", i) && x.up[i] > s && x.lo[i] > s ? x.color(i) : 0;
      } },
    { id: "hikkake", name: "Hikkake", candles: 3, span: 6, direction: "both", ta: "CDLHIKKAKE", uses: [],
      rule: "Innenstab, dann Ausbruch mit Hoch und Tief zur selben Seite: nach unten bullisch, nach oben baerisch (TA-Lib ±100). Bestaetigung (TA-Lib ±200): Schluss innerhalb der drei folgenden Bars jenseits des Hochs (bullisch) bzw. Tiefs (baerisch) des Innenstabs; gilt nur die erste Bestaetigung des juengsten Musters, ein neues Muster ersetzt das alte. Die Bestaetigungskerze traegt hier dasselbe Vorzeichen wie das Muster (+1/−1); die Bibliothek unterscheidet Muster und Bestaetigung nicht im Wert",
      fn: function (x, i) {
        var h = x.h, l = x.l, c = x.c;
        function hk(k) {
          if (!(h[k - 1] < h[k - 2] && l[k - 1] > l[k - 2])) return 0;
          if (h[k] < h[k - 1] && l[k] < l[k - 1]) return 1;
          if (h[k] > h[k - 1] && l[k] > l[k - 1]) return -1;
          return 0;
        }
        var s = hk(i);
        if (s) return s;
        /* Zustand wie TA-Lib ohne Gedaechtnis: juengstes Muster p in den drei Vorbars, noch nicht bestaetigt. */
        for (var p = i - 1; p >= i - 3; p--) {
          var sp = hk(p);
          if (!sp) continue;
          /* Bestaetigt, wenn der Schluss das Hoch (bullisch) bzw. Tief (baerisch) des Innenstabs p − 1 durchbricht; nur die erste zaehlt. */
          for (var k = p + 1; k <= i; k++) if (sp > 0 ? c[k] > h[p - 1] : c[k] < l[p - 1]) return k === i ? sp : 0;
          return 0;
        }
        return 0;
      } },
    { id: "homingPigeon", name: "Homing Pigeon", candles: 2, direction: "bullish", ta: "CDLHOMINGPIGEON", uses: [[1, "BodyLong"], [0, "BodyShort"]],
      rule: "lange schwarze Kerze, dann kurze schwarze Kerze (≤ BodyShort) mit Koerper innerhalb des ersten (Eroeffnung tiefer, Schluss hoeher)",
      fn: function (x, i) {
        var b = i - 1;
        return x.color(b) === -1 && x.color(i) === -1 && x.body[b] > x.avg("BodyLong", b) && x.body[i] <= x.avg("BodyShort", i) &&
          x.o[i] < x.o[b] && x.c[i] > x.c[b] ? 1 : 0;
      } },
    { id: "identicalThreeCrows", name: "Identical Three Crows", candles: 3, direction: "bearish", ta: "CDLIDENTICAL3CROWS",
      uses: [[2, "ShadowVeryShort"], [1, "ShadowVeryShort"], [0, "ShadowVeryShort"], [2, "Equal"], [1, "Equal"]],
      rule: "drei schwarze Kerzen mit fallenden Schluessen und sehr kurzen unteren Schatten, die zweite und dritte eroeffnen (fast) am Vortagesschluss (± Equal)",
      fn: function (x, i) {
        var a = i - 2, b = i - 1, o = x.o, c = x.c, ea = x.avg("Equal", a), eb = x.avg("Equal", b);
        return x.color(a) === -1 && x.lo[a] < x.avg("ShadowVeryShort", a) && x.color(b) === -1 && x.lo[b] < x.avg("ShadowVeryShort", b) &&
          x.color(i) === -1 && x.lo[i] < x.avg("ShadowVeryShort", i) && c[a] > c[b] && c[b] > c[i] &&
          o[b] <= c[a] + ea && o[b] >= c[a] - ea && o[i] <= c[b] + eb && o[i] >= c[b] - eb ? -1 : 0;
      } },
    { id: "inNeck", name: "In-Neck", candles: 2, direction: "bearish", ta: "CDLINNECK", uses: [[1, "BodyLong"], [1, "Equal"]],
      rule: "lange schwarze Kerze, weisse Kerze eroeffnet unter deren Tief und schliesst am oder knapp ueber deren Schluss (≤ Schluss + Equal)",
      fn: function (x, i) {
        var b = i - 1;
        return x.color(b) === -1 && x.body[b] > x.avg("BodyLong", b) && x.color(i) === 1 && x.o[i] < x.l[b] &&
          x.c[i] <= x.c[b] + x.avg("Equal", b) && x.c[i] >= x.c[b] ? -1 : 0;
      } },
    { id: "ladderBottom", name: "Ladder Bottom", candles: 5, direction: "bullish", ta: "CDLLADDERBOTTOM", uses: [[1, "ShadowVeryShort"]],
      rule: "drei schwarze Kerzen mit fallenden Eroeffnungen und Schluessen, vierte schwarz mit oberem Schatten (> ShadowVeryShort), fuenfte weiss eroeffnet ueber der vierten Eroeffnung und schliesst ueber deren Hoch",
      fn: function (x, i) {
        var o = x.o, c = x.c, d = i - 1;
        return x.color(i - 4) === -1 && x.color(i - 3) === -1 && x.color(i - 2) === -1 && o[i - 4] > o[i - 3] && o[i - 3] > o[i - 2] &&
          c[i - 4] > c[i - 3] && c[i - 3] > c[i - 2] && x.color(d) === -1 && x.up[d] > x.avg("ShadowVeryShort", d) &&
          x.color(i) === 1 && o[i] > o[d] && c[i] > x.h[d] ? 1 : 0;
      } },
    { id: "matchingLow", name: "Matching Low", candles: 2, direction: "bullish", ta: "CDLMATCHINGLOW", uses: [[1, "Equal"]],
      rule: "zwei schwarze Kerzen mit (fast) gleichem Schluss (± Equal)",
      fn: function (x, i) {
        var b = i - 1, e = x.avg("Equal", b);
        return x.color(b) === -1 && x.color(i) === -1 && x.c[i] <= x.c[b] + e && x.c[i] >= x.c[b] - e ? 1 : 0;
      } },
    { id: "matHold", name: "Mat Hold", candles: 5, direction: "bullish", ta: "CDLMATHOLD",
      uses: [[4, "BodyLong"], [3, "BodyShort"], [2, "BodyShort"], [1, "BodyShort"]],
      rule: "lange weisse Kerze, kurze schwarze mit Koerperluecke nach oben, zwei weitere kurze Kerzen fallend, die hoechstens 50 % in den ersten Koerper eindringen (TA-Lib-Standard penetration 0,5), fuenfte weiss eroeffnet ueber dem vierten Schluss und schliesst ueber den Hochs der Kerzen 2–4",
      fn: function (x, i) {
        var a = i - 4, b = i - 3, k = i - 2, d = i - 1, o = x.o, c = x.c, h = x.h, floor = c[a] - x.body[a] * MATHOLD_PENETRATION;
        return x.color(a) === 1 && x.color(b) === -1 && x.color(i) === 1 && bodyGapUp(x, b, a) &&
          x.bottom(k) < c[a] && x.bottom(d) < c[a] && x.bottom(k) > floor && x.bottom(d) > floor &&
          x.top(k) < o[b] && x.top(d) < x.top(k) && o[i] > c[d] && c[i] > Math.max(h[b], h[k], h[d]) &&
          x.body[a] > x.avg("BodyLong", a) && x.body[b] < x.avg("BodyShort", b) && x.body[k] < x.avg("BodyShort", k) && x.body[d] < x.avg("BodyShort", d) ? 1 : 0;
      } },
    { id: "onNeck", name: "On-Neck", candles: 2, direction: "bearish", ta: "CDLONNECK", uses: [[1, "BodyLong"], [1, "Equal"]],
      rule: "lange schwarze Kerze, weisse Kerze eroeffnet unter deren Tief und schliesst (fast) an diesem Tief (± Equal)",
      fn: function (x, i) {
        var b = i - 1, e = x.avg("Equal", b);
        return x.color(b) === -1 && x.body[b] > x.avg("BodyLong", b) && x.color(i) === 1 && x.o[i] < x.l[b] &&
          x.c[i] <= x.l[b] + e && x.c[i] >= x.l[b] - e ? -1 : 0;
      } },
    { id: "rickshawMan", name: "Rickshaw Man", candles: 1, direction: "neutral", ta: "CDLRICKSHAWMAN", uses: [[0, "BodyDoji"], [0, "ShadowLong"], [0, "Near"]],
      rule: "Doji mit zwei langen Schatten (> Koerper), Koerper nahe der Spannenmitte (± Near)",
      fn: function (x, i) {
        var s = x.avg("ShadowLong", i), n = x.avg("Near", i), mid = x.l[i] + (x.h[i] - x.l[i]) / 2;
        return x.body[i] <= x.avg("BodyDoji", i) && x.lo[i] > s && x.up[i] > s && x.bottom(i) <= mid + n && x.top(i) >= mid - n ? 1 : 0;
      } },
    { id: "separatingLines", name: "Separating Lines", candles: 2, direction: "both", ta: "CDLSEPARATINGLINES", uses: [[1, "Equal"], [0, "BodyLong"], [0, "ShadowVeryShort"]],
      rule: "Gegenkerze eroeffnet (fast) an der Vortageseroeffnung (± Equal), langer Koerper, der an seinem Extrem eroeffnet (Belt Hold); Richtung = Farbe der zweiten",
      fn: function (x, i) {
        var b = i - 1, e = x.avg("Equal", b), s = x.avg("ShadowVeryShort", i);
        if (!(x.color(b) === -x.color(i) && x.o[i] <= x.o[b] + e && x.o[i] >= x.o[b] - e && x.body[i] > x.avg("BodyLong", i))) return 0;
        return (x.color(i) === 1 && x.lo[i] < s) || (x.color(i) === -1 && x.up[i] < s) ? x.color(i) : 0;
      } },
    { id: "stalledPattern", name: "Stalled Pattern", candles: 3, direction: "bearish", ta: "CDLSTALLEDPATTERN",
      uses: [[2, "BodyLong"], [1, "BodyLong"], [1, "ShadowVeryShort"], [2, "Near"], [1, "Near"], [0, "BodyShort"]],
      rule: "zwei lange weisse Kerzen mit steigendem Schluss (zweite ohne nennenswerten oberen Schatten, eroeffnet im oder knapp ueber dem ersten Koerper), dann kurze weisse Kerze, die am oberen Ende des zweiten Koerpers aufsitzt",
      fn: function (x, i) {
        var a = i - 2, b = i - 1, o = x.o, c = x.c;
        return x.color(a) === 1 && x.color(b) === 1 && x.color(i) === 1 && c[i] > c[b] && c[b] > c[a] &&
          x.body[a] > x.avg("BodyLong", a) && x.body[b] > x.avg("BodyLong", b) && x.up[b] < x.avg("ShadowVeryShort", b) &&
          o[b] > o[a] && o[b] <= c[a] + x.avg("Near", a) && x.body[i] < x.avg("BodyShort", i) &&
          o[i] >= c[b] - x.body[i] - x.avg("Near", b) ? -1 : 0;
      } },
    { id: "stickSandwich", name: "Stick Sandwich", candles: 3, direction: "bullish", ta: "CDLSTICKSANDWICH", uses: [[2, "Equal"]],
      rule: "schwarz, weiss mit Tief ueber dem ersten Schluss, schwarz mit (fast) gleichem Schluss wie die erste (± Equal)",
      fn: function (x, i) {
        var a = i - 2, b = i - 1, e = x.avg("Equal", a);
        return x.color(a) === -1 && x.color(b) === 1 && x.color(i) === -1 && x.l[b] > x.c[a] &&
          x.c[i] <= x.c[a] + e && x.c[i] >= x.c[a] - e ? 1 : 0;
      } },
    { id: "takuri", name: "Takuri", candles: 1, direction: "bullish", ta: "CDLTAKURI", uses: [[0, "BodyDoji"], [0, "ShadowVeryShort"], [0, "ShadowVeryLong"]],
      rule: "Doji ohne nennenswerten oberen Schatten (< ShadowVeryShort) mit sehr langem unterem Schatten (> doppelter Koerper, ShadowVeryLong)",
      fn: function (x, i) {
        return x.body[i] <= x.avg("BodyDoji", i) && x.up[i] < x.avg("ShadowVeryShort", i) && x.lo[i] > x.avg("ShadowVeryLong", i) ? 1 : 0;
      } },
    { id: "tasukiGap", name: "Tasuki Gap", candles: 3, direction: "both", ta: "CDLTASUKIGAP", uses: [[1, "Near"]],
      rule: "Koerperluecke zwischen erster und zweiter Kerze, zweite in Luecken-Richtung gefaerbt, dritte Gegenkerze eroeffnet im zweiten Koerper und schliesst in der Luecke, ohne sie zu schliessen; Koerper der zweiten und dritten aehnlich (Differenz < Near); Richtung = Farbe der zweiten",
      fn: function (x, i) {
        var a = i - 2, b = i - 1, o = x.o, c = x.c, n = x.avg("Near", b), same = Math.abs(x.body[b] - x.body[i]) < n;
        if (bodyGapUp(x, b, a) && x.color(b) === 1 && x.color(i) === -1 && o[i] < c[b] && o[i] > o[b] && c[i] < o[b] && c[i] > x.top(a) && same) return 1;
        if (bodyGapDown(x, b, a) && x.color(b) === -1 && x.color(i) === 1 && o[i] < o[b] && o[i] > c[b] && c[i] > o[b] && c[i] < x.bottom(a) && same) return -1;
        return 0;
      } },
    { id: "thrusting", name: "Thrusting", candles: 2, direction: "bearish", ta: "CDLTHRUSTING", uses: [[1, "BodyLong"], [1, "Equal"]],
      rule: "lange schwarze Kerze, weisse Kerze eroeffnet unter deren Tief und schliesst deutlich ueber deren Schluss (> Schluss + Equal), aber hoechstens in der Koerpermitte",
      fn: function (x, i) {
        var b = i - 1;
        return x.color(b) === -1 && x.body[b] > x.avg("BodyLong", b) && x.color(i) === 1 && x.o[i] < x.l[b] &&
          x.c[i] > x.c[b] + x.avg("Equal", b) && x.c[i] <= x.c[b] + x.body[b] * 0.5 ? -1 : 0;
      } },
    { id: "triStar", name: "Tri-Star", candles: 3, direction: "both", ta: "CDLTRISTAR", uses: [[2, "BodyDoji"]],
      rule: "drei Doji (alle gegen das Doji-Mass der ersten Kerze, wie TA-Lib), mittlerer mit Koerperluecke: nach oben und dritter tiefer → baerisch, nach unten und dritter hoeher → bullisch",
      fn: function (x, i) {
        var a = i - 2, b = i - 1, d = x.avg("BodyDoji", a), r = 0;
        if (!(x.body[a] <= d && x.body[b] <= d && x.body[i] <= d)) return 0;
        if (bodyGapUp(x, b, a) && x.top(i) < x.top(b)) r = -1;
        if (bodyGapDown(x, b, a) && x.bottom(i) > x.bottom(b)) r = 1;
        return r;
      } },
    { id: "uniqueThreeRiver", name: "Unique Three River", candles: 3, direction: "bullish", ta: "CDLUNIQUE3RIVER", uses: [[2, "BodyLong"], [0, "BodyShort"]],
      rule: "lange schwarze Kerze, schwarzer Harami-Koerper mit tieferem Tief, kurze weisse Kerze eroeffnet ueber diesem Tief",
      fn: function (x, i) {
        var a = i - 2, b = i - 1;
        return x.color(a) === -1 && x.color(b) === -1 && x.color(i) === 1 && x.c[b] > x.c[a] && x.o[b] <= x.o[a] && x.l[b] < x.l[a] &&
          x.o[i] > x.l[b] && x.body[a] > x.avg("BodyLong", a) && x.body[i] < x.avg("BodyShort", i) ? 1 : 0;
      } },
    { id: "upsideGapTwoCrows", name: "Upside Gap Two Crows", candles: 3, direction: "bearish", ta: "CDLUPSIDEGAP2CROWS", uses: [[2, "BodyLong"], [1, "BodyShort"]],
      rule: "lange weisse Kerze, kurze schwarze mit Koerperluecke nach oben, schwarze Kerze umschliesst den zweiten Koerper und schliesst noch ueber dem ersten Schluss",
      fn: function (x, i) {
        var a = i - 2, b = i - 1;
        return x.color(a) === 1 && x.body[a] > x.avg("BodyLong", a) && x.color(b) === -1 && x.body[b] <= x.avg("BodyShort", b) && bodyGapUp(x, b, a) &&
          x.color(i) === -1 && x.o[i] > x.o[b] && x.c[i] < x.c[b] && x.c[i] > x.c[a] ? -1 : 0;
      } },
    { id: "xSideGapThreeMethods", name: "Upside/Downside Gap Three Methods", candles: 3, direction: "both", ta: "CDLXSIDEGAP3METHODS", uses: [],
      rule: "zwei gleichfarbige Kerzen mit Koerperluecke in ihrer Richtung, dritte Gegenkerze eroeffnet im zweiten Koerper und schliesst im ersten (Luecke geschlossen); Richtung = Farbe der ersten",
      fn: function (x, i) {
        var a = i - 2, b = i - 1, o = x.o, c = x.c;
        if (!(x.color(a) === x.color(b) && x.color(b) === -x.color(i) && o[i] < x.top(b) && o[i] > x.bottom(b) && c[i] < x.top(a) && c[i] > x.bottom(a))) return 0;
        return (x.color(a) === 1 && bodyGapUp(x, b, a)) || (x.color(a) === -1 && bodyGapDown(x, b, a)) ? x.color(a) : 0;
      } }
  ];

  /* Gelesene Bars je Signal: die Kerzen des Musters, bei Hikkake (Bestaetigung bis 3 Bars nach dem Muster) mehr (`span`). */
  function span(p) { return p.span || p.candles; }

  /** Aufwaermphase: erste Bar, an der alle Kerzen und alle benutzten Mittel vorhanden sind. */
  function warmup(p) {
    var w = span(p) - 1;
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
      for (var k = i - span(p) + 1; k <= i; k++) if (!x.ok[k]) { ok = false; break; }
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
