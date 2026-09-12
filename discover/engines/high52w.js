/* =========================================================================
   VISION UNIVERSE DISCOVER — high52w.js

   Wann ist ein Titel auf einem neuen 52-Wochen-Hoch?

   Die Frage klingt nach einer Zeile Code und ist in Wahrheit vier
   Entscheidungen:

   1. WELCHE KURSREIHE. Ein Split macht aus 900 $ ueber Nacht 90 $. Eine
      unbereinigte Reihe meldet danach monatelang kein neues Hoch mehr -
      und eine dividendenbereinigte meldet Hochs, die es am Markt nie gab.
      Diese Engine rechnet auf SPLIT_ADJUSTED und sagt es im Ergebnis.

   2. WELCHES FENSTER. Das Vergleichshoch schliesst den aktuellen Tag AUS.
      Sonst ist jeder Titel per Definition auf seinem Hoch, und das Signal
      waere wertlos.

   3. WIE OFT GERECHNET WIRD. Nicht bei jedem Tick ueber die ganze
      Historie: das rollierende Hoch wird im Build vorberechnet, zur
      Laufzeit steht ein Vergleich gegen EINE Zahl. Das ist der
      Unterschied zwischen einem Discover-Feed und einem Batchlauf.

   4. WELCHE FRAGE GESTELLT WIRD. "Neues Hoch" hat zwei Lesarten, und die
      bestehende Faktorenengine fuehrt beide getrennt: das TAGESHOCH
      erreicht das Fenstermaximum (newHigh52w) oder der SCHLUSSKURS tut es
      (closeAtHigh52w). Ein Titel kann intraday ein neues Hoch machen und
      darunter schliessen - dann ist der Abstand negativ und das Signal
      trotzdem richtig. Diese Engine kennt beide Lesarten und benennt in
      `basis`, welche sie beantwortet hat.

   5. WIE ALT DER KURS SEIN DARF. Ein Kurs von gestern gegen ein Hoch von
      heute ist kein Signal, sondern ein Messfehler. Ueberschreitet die
      Quote das Altersfenster, faellt der Zustand auf `stale` zurueck -
      nicht auf `false`, denn "kein neues Hoch" und "wir wissen es nicht"
      sind verschiedene Auskuenfte.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var ENGINE_VERSION = "high52w-1.0.0";

  var DEFAULTS = {
    lookbackTradingDays: 252,
    minBars: 200,
    nearHighPct: 0.02,
    watchPct: 0.05,
    maxQuoteAgeMs: 15 * 60 * 1000
  };

  /* Die Zustaende, die diese Engine kennt. `unknown` ist bewusst dabei:
     ohne ihn wuerde jede fehlende Voraussetzung als "kein Hoch" gelesen. */
  var STATES = ["newHigh", "atHigh", "nearHigh", "watch", "below", "stale", "unknown"];

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  /**
   * Rollierendes 52-Wochen-Hoch/Tief je Bar - der Wert, der vorberechnet
   * und ausgeliefert wird.
   *
   * @param {number[]} closes  SPLIT_ADJUSTED Schlusskurse, aufsteigend
   * @param {object} [opts] {lookbackTradingDays, highs, lows}
   * @returns {{high: (number|null)[], low: (number|null)[]}}
   *   Index i traegt das Hoch der VORHERGEHENDEN `lookback` Bars,
   *   ohne Bar i selbst.
   */
  function rollingExtremes(closes, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    var lookback = opts.lookbackTradingDays;
    var highSource = opts.highs || closes;
    var lowSource = opts.lows || closes;
    var high = new Array(closes.length);
    var low = new Array(closes.length);

    for (var i = 0; i < closes.length; i++) {
      var from = Math.max(0, i - lookback);
      if (i === 0) { high[i] = null; low[i] = null; continue; }
      var h = -Infinity, l = Infinity, n = 0;
      for (var j = from; j < i; j++) {
        var hv = highSource[j], lv = lowSource[j];
        if (isNum(hv) && hv > h) h = hv;
        if (isNum(lv) && lv < l) l = lv;
        if (isNum(hv) || isNum(lv)) n++;
      }
      high[i] = n ? h : null;
      low[i] = n ? l : null;
    }
    return { high: high, low: low };
  }

  /**
   * Der ausgelieferte Referenzwert eines Titels: das 52-Wochen-Hoch der
   * Bars VOR dem Stichtag, plus die Zahl der verwendeten Bars.
   *
   * @param {Array} bars [{date, close, high, low}] aufsteigend
   */
  function referenceFromBars(bars, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    bars = (bars || []).filter(function (b) { return b && isNum(b.close); });
    if (bars.length < 2) {
      return { ok: false, reason: "noData", bars: bars.length,
               previous52WeekHigh: null, previous52WeekLow: null, asOf: null };
    }
    var last = bars[bars.length - 1];
    var window = bars.slice(Math.max(0, bars.length - 1 - opts.lookbackTradingDays), bars.length - 1);
    /* Die Schwelle gilt absolut. Sie an der vorhandenen Laenge zu messen
       ("mindestens so viele, wie da sind") waere eine Bedingung, die nie
       greift - und genau so war sie in der ersten Fassung geschrieben. */
    if (window.length < opts.minBars) {
      return { ok: false, reason: "insufficientHistory", bars: bars.length,
               previous52WeekHigh: null, previous52WeekLow: null, asOf: last.date || null };
    }
    var hi = -Infinity, lo = Infinity;
    window.forEach(function (b) {
      var h = isNum(b.high) ? b.high : b.close;
      var l = isNum(b.low) ? b.low : b.close;
      if (h > hi) hi = h;
      if (l < lo) lo = l;
    });
    return {
      ok: true, reason: null, engineVersion: ENGINE_VERSION,
      bars: bars.length, windowBars: window.length,
      priceSeriesType: opts.priceSeriesType || "SPLIT_ADJUSTED",
      previous52WeekHigh: hi, previous52WeekLow: lo,
      lastClose: last.close, asOf: last.date || null
    };
  }

  /**
   * Der Laufzeitvergleich. Eine Zahl gegen eine Zahl - mehr passiert bei
   * einem Tick nicht.
   *
   * @param {object} input
   *   previous52WeekHigh  Referenz (ohne den aktuellen Tag)
   *   previous52WeekLow   optional, fuer die Range-Position
   *   currentPrice        aktueller Kurs, gleiche Kursart wie die Referenz
   *   quoteAt             Zeitstempel des Kurses (ISO oder ms)
   *   now                 Vergleichszeit (ISO oder ms), Standard: Date.now()
   *   priceSeriesType     Kursart, muss zur Referenz passen
   * @returns {object} {state, isNew52WeekHigh, distanceTo52WeekHigh, rangePosition, ...}
   */
  function evaluate(input, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    input = input || {};

    var high = input.previous52WeekHigh;
    var low = input.previous52WeekLow;
    var price = input.currentPrice;
    var dayHigh = isNum(input.dayHigh) ? input.dayHigh : null;

    var base = {
      engineVersion: ENGINE_VERSION,
      state: "unknown", isNew52WeekHigh: false,
      distanceTo52WeekHigh: null, distanceTo52WeekLow: null, rangePosition: null,
      previous52WeekHigh: isNum(high) ? high : null,
      currentPrice: isNum(price) ? price : null,
      touchedHigh: false, closeAtHigh: false,
      basis: dayHigh === null ? "close" : "intradayHigh",
      quoteAgeMs: null, reason: null,
      priceSeriesType: input.priceSeriesType || opts.priceSeriesType || null
    };

    if (!isNum(high) || high <= 0) {
      base.reason = input.referenceWithheld ? "referenceLevelWithheld" : "noReference";
      return base;
    }
    if (!isNum(price) || price <= 0) {
      base.reason = "noQuote";
      return base;
    }
    /* Zwei Kursarten zu vergleichen ist der Fehler, der am spaetesten
       auffaellt: das Ergebnis sieht in beiden Faellen wie eine Zahl aus. */
    if (input.referencePriceSeriesType && input.priceSeriesType &&
        input.referencePriceSeriesType !== input.priceSeriesType) {
      base.reason = "priceSeriesMismatch";
      return base;
    }

    var now = toMs(input.now) || Date.now();
    var quoteAt = toMs(input.quoteAt);
    if (quoteAt !== null) {
      base.quoteAgeMs = Math.max(0, now - quoteAt);
      if (base.quoteAgeMs > opts.maxQuoteAgeMs) {
        base.state = "stale";
        base.reason = "staleQuote";
        base.distanceTo52WeekHigh = price / high - 1;
        return base;
      }
    }

    var distance = price / high - 1;
    base.distanceTo52WeekHigh = distance;
    if (isNum(low) && low > 0) {
      base.distanceTo52WeekLow = price / low - 1;
      var span = high - low;
      base.rangePosition = span > 0 ? clamp((price - low) / span, 0, 1) : null;
    }

    base.closeAtHigh = price >= high;
    base.touchedHigh = dayHigh !== null ? dayHigh >= high : base.closeAtHigh;

    if (base.closeAtHigh) {
      base.state = price > high ? "newHigh" : "atHigh";
      base.isNew52WeekHigh = true;
    } else if (base.touchedHigh) {
      /* Intraday ueber dem Jahreshoch, darunter geschlossen. Das Signal
         gilt - der Abstand bleibt negativ, und beides steht im Ergebnis. */
      base.state = "newHigh";
      base.isNew52WeekHigh = true;
    } else if (distance >= -opts.nearHighPct) {
      base.state = "nearHigh";
    } else if (distance >= -opts.watchPct) {
      base.state = "watch";
    } else {
      base.state = "below";
    }
    return base;
  }

  /**
   * Derselbe Zustand, aber aus bereits gerechneten Abstaenden - fuer die
   * realen Titel, deren absolute Kursniveaus nach der Redistributionsregel
   * nicht ausgeliefert werden. Ohne diesen Weg muesste die Oberflaeche
   * entweder ein verbotenes Niveau kennen oder das Signal weglassen.
   */
  function fromDistance(distanceTo52wHigh, distanceTo52wLow, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    var touched = opts.touchedHigh === true;
    var out = {
      engineVersion: ENGINE_VERSION, state: "unknown", isNew52WeekHigh: false,
      distanceTo52WeekHigh: null, distanceTo52WeekLow: null, rangePosition: null,
      previous52WeekHigh: null, currentPrice: null, quoteAgeMs: null,
      touchedHigh: touched, closeAtHigh: false,
      basis: touched ? "intradayHigh" : "close",
      reason: "referenceLevelWithheld", priceSeriesType: opts.priceSeriesType || null
    };
    if (!isNum(distanceTo52wHigh)) return out;
    out.distanceTo52WeekHigh = distanceTo52wHigh;
    out.distanceTo52WeekLow = isNum(distanceTo52wLow) ? distanceTo52wLow : null;
    if (isNum(distanceTo52wLow)) {
      /* Position in der Jahresspanne allein aus den beiden Abstaenden:
         p/h - 1 und p/l - 1 genuegen, das Niveau selbst wird nicht
         gebraucht und bleibt damit auch nicht in der Auslieferung. */
      var ratioHigh = 1 + distanceTo52wHigh;          // p/h
      var ratioLow = 1 + distanceTo52wLow;            // p/l
      if (ratioHigh > 0 && ratioLow > 0) {
        var lowOverHigh = ratioHigh / ratioLow;       // l/h
        var span = 1 - lowOverHigh;
        out.rangePosition = span > 0 ? clamp((ratioHigh - lowOverHigh) / span, 0, 1) : null;
      }
    }
    out.closeAtHigh = distanceTo52wHigh >= 0;
    out.isNew52WeekHigh = out.closeAtHigh || touched;
    out.state = out.isNew52WeekHigh ? "newHigh"
      : distanceTo52wHigh >= -opts.nearHighPct ? "nearHigh"
      : distanceTo52wHigh >= -opts.watchPct ? "watch" : "below";
    return out;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function toMs(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    var t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION, DEFAULTS: DEFAULTS, STATES: STATES,
    rollingExtremes: rollingExtremes, referenceFromBars: referenceFromBars,
    evaluate: evaluate, fromDistance: fromDistance
  };

  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.High52w = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
