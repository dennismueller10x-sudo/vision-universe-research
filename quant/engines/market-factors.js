/* =========================================================================
   VISION UNIVERSE — market-factors.js   (Tiingo Commercial, §14, §15, §16, §17)

   Marktdatenbasierte Faktoren fuer das Scale-Universum.

   WAS DIESE DATEI IST: eine Zusammenfassung ueber tausende Titel. Gleitende
   Durchschnitte, 52-Wochen-Hoch, Renditen ueber vier Horizonte,
   Volatilitaet, Volumen - genau die Groessen, aus denen der Screener seine
   Fragen beantwortet.

   WAS SIE AUSDRUECKLICH NICHT IST: eine zweite Technical-Intelligence-
   Engine. Sie erfindet keine Methodik. Die Rechenprimitive kommen aus
   quant/engines/technical/feature-store.js - dieselben Funktionen, die
   auch die Zustandsengines benutzen. Wo eine Groesse dort schon definiert
   ist (Momentumhorizonte 21/63/126/252 Handelstage), wird sie uebernommen
   und nicht neu festgelegt.

   Der Unterschied zur Technical Intelligence ist der Umfang, nicht die
   Methode: dort ein vollstaendiges Bundle je Titel mit Szenarien und
   Elliott, hier eine Zeile je Titel, die sich ueber 2.000 Titel in
   Sekunden rechnet und in einen Screener passt.

   §30 - KEINE STILLE NULL

   Jedes Feld traegt einen Status. Ein SMA200 ueber 150 Bars ist nicht 0
   und nicht "irgendwas", sondern INSUFFICIENT_HISTORY. Der Screener kann
   dann sagen "nicht berechenbar" statt "liegt nicht darueber" - zwei
   verschiedene Aussagen, die ohne Status dieselbe waeren.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Features = isNode ? require("./technical/feature-store.js")
                        : global.VUTechnical.Features;

  var VERSION = "market-factors-1.0.0";

  /* Dieselben Horizonte wie momentum-engine.js und
     relative-strength-engine.js. Bewusst dupliziert und nicht importiert:
     ein Import waere eine Abhaengigkeit auf eine Engine, die hier gar
     nicht laeuft. Die Zahlen stimmen ueberein, und ein Test haelt das
     fest. */
  var HORIZONS = { "1M": 21, "3M": 63, "6M": 126, "12M": 252 };
  var SMA_PERIODS = [20, 50, 100, 200];
  var YEAR_WINDOW = 252;

  var STATUS = {
    CALCULATED: "CALCULATED",
    INSUFFICIENT_HISTORY: "INSUFFICIENT_HISTORY",
    SOURCE_MISSING: "SOURCE_MISSING",
    NOT_APPLICABLE: "NOT_APPLICABLE"
  };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function round(v, d) {
    if (!isNum(v)) return null;
    var m = Math.pow(10, d === undefined ? 6 : d);
    return Math.round(v * m) / m;
  }

  /**
   * Welche Preisspalte traegt die Rechnung?
   *
   * Dieselbe Frage wie in market-quality.validateBars, und aus demselben
   * Grund: die rohe Spalte springt an einem Split. Ein SMA200 ueber eine
   * unbereinigte Reihe mit Split ist keine Naeherung, sondern eine
   * falsche Zahl. Liegt keine belastbare bereinigte Spalte vor, wird auf
   * der rohen gerechnet - und der Basiswert steht im Ergebnis.
   */
  function priceBasis(bars, adjustmentStatus) {
    var stufe = String(adjustmentStatus || "").toUpperCase();
    var belastbar = stufe === "TOTAL_RETURN" || stufe === "SPLIT_ADJUSTED" ||
                    adjustmentStatus === "adjusted" || adjustmentStatus === "splitAdjusted";
    var hatSpalte = belastbar && bars.some(function (b) {
      return b && isNum(b.adjustedClose) && b.adjustedClose > 0;
    });
    return hatSpalte ? "adjustedClose" : "close";
  }

  function column(bars, field, fallbackField) {
    return bars.map(function (b) {
      var v = b ? b[field] : null;
      if (isNum(v) && v > 0) return v;
      if (fallbackField && b && isNum(b[fallbackField])) return b[fallbackField];
      return NaN;
    });
  }

  /**
   * Rechnet die Faktoren einer Reihe.
   *
   * @param {object} payload {bars, adjustmentStatus, ticker, ...}
   * @param {object} [opts]  {asOfIndex, benchmark: {closes, dates}}
   */
  function computeFactors(payload, opts) {
    opts = opts || {};
    var bars = (payload && payload.bars) || [];
    var fieldStatus = {};

    function set(name, value, status) {
      fieldStatus[name] = status;
      return isNum(value) ? value : null;
    }

    if (!bars.length) {
      return {
        version: VERSION, ticker: (payload && payload.ticker) || null,
        status: "UNAVAILABLE", statusReason: "noBars",
        bars: 0, asOf: null, basis: null,
        values: {}, fieldStatus: {},
        note: "Keine Kursreihe. Es wird nichts gerechnet und nichts geschaetzt."
      };
    }

    var basis = priceBasis(bars, payload.adjustmentStatus);
    var close = column(bars, basis, basis === "adjustedClose" ? "close" : null);
    var high = column(bars, basis === "adjustedClose" ? "adjustedHigh" : "high", "high");
    var low = column(bars, basis === "adjustedClose" ? "adjustedLow" : "low", "low");
    var volume = bars.map(function (b) { return isNum(b.volume) ? b.volume : NaN; });
    var n = close.length;
    var i = opts.asOfIndex === undefined ? n - 1 : opts.asOfIndex;
    if (i < 0 || i >= n) i = n - 1;

    var px = close[i];
    var values = {};

    /* --------------------------------------------- Gleitende Durchschnitte */
    SMA_PERIODS.forEach(function (p) {
      var key = "sma" + p;
      if (i + 1 < p) {
        values[key] = set(key, null, STATUS.INSUFFICIENT_HISTORY);
        values["priceAboveSMA" + p] = null;
        fieldStatus["priceAboveSMA" + p] = STATUS.INSUFFICIENT_HISTORY;
        values["distanceToSMA" + p] = null;
        fieldStatus["distanceToSMA" + p] = STATUS.INSUFFICIENT_HISTORY;
        return;
      }
      var series = Features.sma(close, p);
      var v = series[i];
      values[key] = set(key, round(v, 6), isNum(v) ? STATUS.CALCULATED : STATUS.INSUFFICIENT_HISTORY);
      if (isNum(v) && isNum(px) && v > 0) {
        values["priceAboveSMA" + p] = px > v;
        fieldStatus["priceAboveSMA" + p] = STATUS.CALCULATED;
        values["distanceToSMA" + p] = round(px / v - 1, 6);
        fieldStatus["distanceToSMA" + p] = STATUS.CALCULATED;
      } else {
        values["priceAboveSMA" + p] = null;
        fieldStatus["priceAboveSMA" + p] = STATUS.INSUFFICIENT_HISTORY;
        values["distanceToSMA" + p] = null;
        fieldStatus["distanceToSMA" + p] = STATUS.INSUFFICIENT_HISTORY;
      }
    });

    /* Der Stapel: ueber allen vieren. Ein eigenes Feld, weil genau danach
       gefragt wird (§15) und weil "alle vier true" nicht dasselbe ist wie
       "keiner false" - fehlende Werte duerfen nicht als Zustimmung
       durchgehen. */
    var stackKnown = SMA_PERIODS.every(function (p) {
      return typeof values["priceAboveSMA" + p] === "boolean";
    });
    values.aboveAllSMA = stackKnown
      ? SMA_PERIODS.every(function (p) { return values["priceAboveSMA" + p] === true; })
      : null;
    fieldStatus.aboveAllSMA = stackKnown ? STATUS.CALCULATED : STATUS.INSUFFICIENT_HISTORY;

    values.aboveSMA20And50And200 =
      typeof values.priceAboveSMA20 === "boolean" &&
      typeof values.priceAboveSMA50 === "boolean" &&
      typeof values.priceAboveSMA200 === "boolean"
        ? (values.priceAboveSMA20 && values.priceAboveSMA50 && values.priceAboveSMA200)
        : null;
    fieldStatus.aboveSMA20And50And200 =
      values.aboveSMA20And50And200 === null ? STATUS.INSUFFICIENT_HISTORY : STATUS.CALCULATED;

    /* ------------------------------------------------- 52 Wochen */
    if (i + 1 >= YEAR_WINDOW) {
      var hi = Features.rollingMax(high, YEAR_WINDOW)[i];
      var lo = Features.rollingMin(low, YEAR_WINDOW)[i];
      values.high52w = set("high52w", round(hi, 6), STATUS.CALCULATED);
      values.low52w = set("low52w", round(lo, 6), STATUS.CALCULATED);
      values.distanceTo52wHigh = isNum(hi) && hi > 0
        ? set("distanceTo52wHigh", round(px / hi - 1, 6), STATUS.CALCULATED) : null;
      values.distanceTo52wLow = isNum(lo) && lo > 0
        ? set("distanceTo52wLow", round(px / lo - 1, 6), STATUS.CALCULATED) : null;
      /* Ein neues 52-Wochen-Hoch: der Tageshoechstkurs erreicht das
         Fenstermaximum. Auf dem Schlusskurs zu pruefen waere die
         haeufigere, aber andere Frage - deshalb beide Felder. */
      values.newHigh52w = isNum(hi) && isNum(high[i]) ? high[i] >= hi - 1e-9 : null;
      fieldStatus.newHigh52w = values.newHigh52w === null ? STATUS.INSUFFICIENT_HISTORY : STATUS.CALCULATED;
      values.closeAtHigh52w = isNum(hi) && isNum(px) ? px >= hi - 1e-9 : null;
      fieldStatus.closeAtHigh52w = values.closeAtHigh52w === null ? STATUS.INSUFFICIENT_HISTORY : STATUS.CALCULATED;
      values.within5PctOf52wHigh = isNum(values.distanceTo52wHigh)
        ? values.distanceTo52wHigh >= -0.05 : null;
      fieldStatus.within5PctOf52wHigh =
        values.within5PctOf52wHigh === null ? STATUS.INSUFFICIENT_HISTORY : STATUS.CALCULATED;
    } else {
      ["high52w", "low52w", "distanceTo52wHigh", "distanceTo52wLow",
       "newHigh52w", "closeAtHigh52w", "within5PctOf52wHigh"].forEach(function (k) {
        values[k] = null; fieldStatus[k] = STATUS.INSUFFICIENT_HISTORY;
      });
    }

    /* -------------------------------------------------- Momentum */
    values.returns = {};
    fieldStatus.returns = {};
    Object.keys(HORIZONS).forEach(function (h) {
      var w = HORIZONS[h];
      if (i - w < 0 || !isNum(close[i - w]) || close[i - w] <= 0 || !isNum(px)) {
        values.returns[h] = null;
        fieldStatus.returns[h] = STATUS.INSUFFICIENT_HISTORY;
        return;
      }
      values.returns[h] = round(px / close[i - w] - 1, 6);
      fieldStatus.returns[h] = STATUS.CALCULATED;
    });

    /* 12-1-Momentum: die in der Literatur uebliche Variante, die den
       letzten Monat auslaesst. Dieselbe Definition wie
       feature-store.momentum12m1m - hier auf einfacher Rendite statt
       Log, weil der Screener Prozente zeigt. */
    if (i - 252 >= 0 && isNum(close[i - 21]) && isNum(close[i - 252]) && close[i - 252] > 0) {
      values.return12M1M = round(close[i - 21] / close[i - 252] - 1, 6);
      fieldStatus.return12M1M = STATUS.CALCULATED;
    } else {
      values.return12M1M = null;
      fieldStatus.return12M1M = STATUS.INSUFFICIENT_HISTORY;
    }

    /* Beschleunigung: kurzfristige gegen mittelfristige Rendite. Kein
       neuer Faktor, sondern die Frage aus §15 ("Trendbeschleunigung") in
       der einfachsten Form, die sich aus vorhandenen Groessen ergibt. */
    if (isNum(values.returns["1M"]) && isNum(values.returns["3M"])) {
      values.momentumAcceleration = round(values.returns["1M"] - values.returns["3M"] / 3, 6);
      fieldStatus.momentumAcceleration = STATUS.CALCULATED;
    } else {
      values.momentumAcceleration = null;
      fieldStatus.momentumAcceleration = STATUS.INSUFFICIENT_HISTORY;
    }

    /* ------------------------------------------------ Volatilitaet */
    var logRet = new Array(n);
    for (var k = 0; k < n; k++) {
      logRet[k] = k > 0 && isNum(close[k]) && isNum(close[k - 1]) && close[k - 1] > 0
        ? Math.log(close[k] / close[k - 1]) : NaN;
    }
    [20, 60, 252].forEach(function (w) {
      var key = "volatility" + w + "d";
      if (i + 1 < w + 1) { values[key] = null; fieldStatus[key] = STATUS.INSUFFICIENT_HISTORY; return; }
      var sd = Features.rollingStd(logRet, w)[i];
      values[key] = isNum(sd) ? round(sd * Math.sqrt(252), 6) : null;
      fieldStatus[key] = isNum(sd) ? STATUS.CALCULATED : STATUS.INSUFFICIENT_HISTORY;
    });

    /* Maximaler Rueckgang ueber ein Jahr. Der Risikofaktor, der ohne
       Fundamentaldaten auskommt (§17). */
    if (i + 1 >= YEAR_WINDOW) {
      var peak = -Infinity, mdd = 0;
      for (var m = i - YEAR_WINDOW + 1; m <= i; m++) {
        if (!isNum(close[m])) continue;
        if (close[m] > peak) peak = close[m];
        if (peak > 0) { var dd = close[m] / peak - 1; if (dd < mdd) mdd = dd; }
      }
      values.maxDrawdown252d = round(mdd, 6);
      fieldStatus.maxDrawdown252d = STATUS.CALCULATED;
    } else {
      values.maxDrawdown252d = null;
      fieldStatus.maxDrawdown252d = STATUS.INSUFFICIENT_HISTORY;
    }

    /* ----------------------------------------------------- Volumen */
    [20, 60].forEach(function (w) {
      var key = "avgVolume" + w + "d";
      if (i + 1 < w) { values[key] = null; fieldStatus[key] = STATUS.INSUFFICIENT_HISTORY; return; }
      var v = Features.sma(volume, w)[i];
      values[key] = isNum(v) ? Math.round(v) : null;
      fieldStatus[key] = isNum(v) ? STATUS.CALCULATED : STATUS.INSUFFICIENT_HISTORY;
    });
    if (isNum(values.avgVolume20d) && isNum(values.avgVolume60d) && values.avgVolume60d > 0) {
      values.volumeRatio20over60 = round(values.avgVolume20d / values.avgVolume60d, 4);
      fieldStatus.volumeRatio20over60 = STATUS.CALCULATED;
      /* "Volumen-Ausbruch" aus §15: das Tagesvolumen deutlich ueber dem
         20-Tage-Mittel. Die Schwelle 2.0 ist eine Konvention und steht
         als Feld im Ergebnis, damit sie nachvollziehbar bleibt. */
      values.volumeSpikeRatio = isNum(volume[i]) && values.avgVolume20d > 0
        ? round(volume[i] / values.avgVolume20d, 4) : null;
      fieldStatus.volumeSpikeRatio = isNum(values.volumeSpikeRatio)
        ? STATUS.CALCULATED : STATUS.SOURCE_MISSING;
      values.volumeBreakout = isNum(values.volumeSpikeRatio) ? values.volumeSpikeRatio >= 2 : null;
      fieldStatus.volumeBreakout = values.volumeBreakout === null
        ? STATUS.INSUFFICIENT_HISTORY : STATUS.CALCULATED;
    } else {
      ["volumeRatio20over60", "volumeSpikeRatio", "volumeBreakout"].forEach(function (k) {
        values[k] = null; fieldStatus[k] = STATUS.INSUFFICIENT_HISTORY;
      });
    }

    /* ------------------------------------------ Relative Staerke

       Nur gegen eine uebergebene Benchmarkreihe, und mit derselben
       Definition wie relative-strength-engine.js: Differenz der
       Log-Renditen ueber denselben Horizont. Keine neue Methodik (§16).
       Ohne Benchmark bleibt das Feld leer - mit Grund. */
    values.relativeStrength = {};
    fieldStatus.relativeStrength = {};
    var bench = opts.benchmark && Array.isArray(opts.benchmark.closes)
      ? opts.benchmark.closes : null;
    var benchDates = opts.benchmark && Array.isArray(opts.benchmark.dates)
      ? opts.benchmark.dates : null;

    /* Auf welchen Benchmark-Tag wird verglichen?

       Nicht auf den letzten, den die Benchmark hat, sondern auf den
       letzten, den sie am Stichtag DIESES Titels hatte. Der Unterschied
       faellt nur bei Titeln auf, deren Reihe frueher endet - und genau
       dort waere er ein Fehler: die relative Staerke verglichen dann
       einen alten Kurs gegen einen frischen Index und zeigte eine
       Schwaeche, die es nicht gab.

       Dieselbe Regel wie in relative-strength-engine.js: der letzte
       bekannte Wert, nie ein spaeterer. */
    var benchIndex = bench ? bench.length - 1 : -1;
    var asOfDate = bars[i] ? bars[i].date : null;
    if (bench && benchDates && asOfDate) {
      benchIndex = -1;
      for (var bd = 0; bd < benchDates.length && benchDates[bd] <= asOfDate; bd++) benchIndex = bd;
    }

    Object.keys(HORIZONS).forEach(function (h) {
      var w = HORIZONS[h];
      if (!bench) {
        values.relativeStrength[h] = null;
        fieldStatus.relativeStrength[h] = STATUS.SOURCE_MISSING;
        return;
      }
      if (benchIndex < 0) {
        /* Die Benchmark beginnt spaeter als dieser Titel endet. Das ist
           keine zu kurze Historie, sondern eine fehlende Ueberschneidung. */
        values.relativeStrength[h] = null;
        fieldStatus.relativeStrength[h] = STATUS.NOT_APPLICABLE;
        return;
      }
      var bi = benchIndex;
      if (bi - w < 0 || i - w < 0 || !isNum(bench[bi]) || !isNum(bench[bi - w]) ||
          !isNum(close[i]) || !isNum(close[i - w]) || bench[bi - w] <= 0 || close[i - w] <= 0) {
        values.relativeStrength[h] = null;
        fieldStatus.relativeStrength[h] = STATUS.INSUFFICIENT_HISTORY;
        return;
      }
      values.relativeStrength[h] = round(
        Math.log(close[i] / close[i - w]) - Math.log(bench[bi] / bench[bi - w]), 6);
      fieldStatus.relativeStrength[h] = STATUS.CALCULATED;
    });

    return {
      version: VERSION,
      ticker: payload.ticker || null,
      status: "OK",
      bars: n,
      asOf: bars[i] ? bars[i].date : null,
      /* Auf welcher Spalte gerechnet wurde. Ohne diese Angabe laesst sich
         ein SMA200 nicht einordnen. */
      basis: basis,
      adjustmentStatus: payload.adjustmentStatus || null,
      /* Gegen welchen Benchmark-Tag verglichen wurde. Ohne diese Angabe
         laesst sich eine relative Staerke nicht einordnen. */
      benchmarkAsOf: bench && benchDates && benchIndex >= 0 ? benchDates[benchIndex] : null,
      /* Der Kurs selbst gehoert NICHT in die ausgelieferte Faktorzeile
         (§34: keine Rohkursweitergabe). Er steht hier, weil derselbe
         Aufruf auch intern benutzt wird; das Schreibskript laesst ihn
         weg. */
      price: round(px, 6),
      values: values,
      fieldStatus: fieldStatus
    };
  }

  /* Felder, die eine Kursgroesse tragen und deshalb nicht in ein
     oeffentlich ausgeliefertes Artefakt duerfen. Sie stehen hier und
     nicht im Schreibskript, damit die Liste an derselben Stelle gepflegt
     wird wie die Berechnung - ein neuer Kursfaktor faellt sonst durch. */
  var PRICE_LEVEL_FIELDS = ["sma20", "sma50", "sma100", "sma200",
                            "high52w", "low52w"];

  /**
   * Entfernt absolute Kursgroessen und behaelt Zustaende und Abstaende.
   *
   * Der Unterschied ist der ganze Punkt: "5 % unter dem 52-Wochen-Hoch"
   * ist eine abgeleitete Aussage, "das 52-Wochen-Hoch liegt bei 184,20"
   * ist der Kurs des Anbieters. Das eine darf ausgeliefert werden, das
   * andere nicht, solange die Weitergabe nicht freigegeben ist.
   */
  function stripPriceLevels(factors) {
    var out = JSON.parse(JSON.stringify(factors));
    delete out.price;
    PRICE_LEVEL_FIELDS.forEach(function (f) {
      if (out.values && Object.prototype.hasOwnProperty.call(out.values, f)) {
        delete out.values[f];
        if (out.fieldStatus) out.fieldStatus[f] = "WITHHELD_REDISTRIBUTION";
      }
    });
    out.priceLevelsWithheld = true;
    out.priceLevelsWithheldReason =
      "Absolute Kursgroessen (SMA-Niveaus, 52-Wochen-Hoch/Tief) sind Anbieterkurse und " +
      "bleiben bis zu einer Weitergabefreigabe intern. Zustaende und Abstaende bleiben erhalten.";
    return out;
  }

  var api = {
    VERSION: VERSION,
    HORIZONS: HORIZONS,
    SMA_PERIODS: SMA_PERIODS,
    YEAR_WINDOW: YEAR_WINDOW,
    STATUS: STATUS,
    PRICE_LEVEL_FIELDS: PRICE_LEVEL_FIELDS,
    priceBasis: priceBasis,
    computeFactors: computeFactors,
    stripPriceLevels: stripPriceLevels
  };

  if (isNode) module.exports = api;
  else { global.VUMarketFactors = api; }
})(typeof window !== "undefined" ? window : globalThis);
