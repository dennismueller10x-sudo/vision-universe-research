/* =========================================================================
   VISION UNIVERSE — coverage-metrics.js

   Drei Fragen, die man nicht mit einer Zahl beantworten kann.

   Der Backfill hat eine einzige Kennzahl geliefert: 84,81 %. Sie stand
   fuer "CHART_READY" und war in dieser Form falsch - nicht weil die
   Rechnung falsch war, sondern weil sie drei verschiedene Fragen zu
   einer verruehrte:

     1. Haben wir die Historie ueberhaupt?          STORAGE_COVERAGE
     2. Kann der Chart sie zeichnen?                CHART_AVAILABILITY
     3. Reicht sie fuer die Technik?                TECHNICAL_HISTORY_ELIGIBILITY

   Die 84,81 % beantworten ausschliesslich Frage 3, und zwar mit der
   Schwelle der Technik (250 Bars). Als Chartaussage gelesen behaupten
   sie, 15 % der Titel liessen sich nicht darstellen. Das stimmt nicht:
   die Chart-Engine zeichnet ab ZWEI Bars (chart-ranges.js, MIN_BARS).
   Ein Titel mit 33 Bars hat keinen 10-Jahres-Chart - er hat einen
   Chart.

   DIE SCHWELLEN WERDEN NICHT HIER ERFUNDEN

   Jede Schwelle stammt aus der Stelle, die sie tatsaechlich anwendet:

     chartMinBars       chart-ranges.js            MIN_BARS = 2
     technicalMinBars   run-technical-scale.mjs    MIN_BARS = 300
     longHistoryMinBars tiingo-scale.json          historyCoverageMinBars = 250

   Eine hier neu gesetzte Zahl waere eine Zweitmeinung ueber fremdes
   Verhalten. Sie werden deshalb hereingereicht, nicht gesetzt.

   DER NENNER IST DAS EIGENTLICHE THEMA

   Die Historienquote fiel auf 84,81 %, weil das Universum um 2.119
   Titel gewachsen ist - darunter 920, die erstmals 2026 gehandelt
   wurden. Ein Titel, der seit acht Monaten existiert, KANN keine 250
   Bars haben. Ihn in den Nenner einer Historienquote zu stellen misst
   nicht die Datenqualitaet, sondern das Alter des Universums.

   Die Antwort ist nicht, die Schwelle zu senken (dann misst die Quote
   gar nichts mehr), sondern den Nenner auf die Titel zu beschraenken,
   bei denen die Frage ueberhaupt beantwortbar ist:

     ELIGIBLE_FOR_LONG_HISTORY_CHECK  Listing alt genug, Gattung im
                                      Produktuniversum, Anbieter liefert
     PASS / FAIL                      innerhalb dieses Nenners
     LONG_HISTORY_COVERAGE_PERCENT    PASS / ELIGIBLE

   Ein Titel, der aus dem Nenner faellt, verschwindet nicht: er steht
   mit Grund in der Aufstellung. "Zu jung" ist ein Ergebnis.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

  var VERSION = "coverage-metrics-1.0.0";

  /* Handelstage pro Kalenderjahr. 252 ist die uebliche Annahme; sie
     wird hier nur gebraucht, um aus einer Barschwelle ein Mindestalter
     zu machen, und ist dafuer genau genug. Bewusst grosszuegig
     gerundet: lieber ein Titel zu viel im Nenner als ein echter
     Luckenfall heimlich daraus entfernt. */
  var TRADING_DAYS_PER_YEAR = 252;

  /* Gruende, aus denen ein Titel nicht in den Nenner der Langhistorie
     gehoert. Jeder Grund ist eine Aussage ueber den Titel, keine ueber
     unsere Daten. */
  var NOT_ELIGIBLE = {
    LISTING_TOO_YOUNG: "LISTING_TOO_YOUNG",
    NOT_IN_PRODUCT_UNIVERSE: "NOT_IN_PRODUCT_UNIVERSE",
    PROVIDER_HAS_NO_SERIES: "PROVIDER_HAS_NO_SERIES",
    START_DATE_UNKNOWN: "START_DATE_UNKNOWN"
  };

  function dayDiff(fromIso, toIso) {
    var a = Date.parse(String(fromIso).slice(0, 10) + "T00:00:00Z");
    var b = Date.parse(String(toIso).slice(0, 10) + "T00:00:00Z");
    if (!isFinite(a) || !isFinite(b)) return null;
    return Math.floor((b - a) / 86400000);
  }

  /* Das Mindestalter in Kalendertagen, das ein Listing braucht, damit
     die geforderte Zahl Bars ueberhaupt entstehen konnte. */
  function minCalendarDaysFor(bars) {
    return Math.ceil((bars / TRADING_DAYS_PER_YEAR) * 365);
  }

  /**
   * Gehoert dieser Titel in den Nenner der Langhistorienquote?
   *
   * @param {object} sec       {ticker, startDate}
   * @param {object} opts      {today, minBars, inProductUniverse,
   *                            providerHasSeries}
   * @returns {{eligible:boolean, reason:string, ageDays:number|null,
   *            requiredAgeDays:number}}
   */
  function longHistoryEligible(sec, opts) {
    opts = opts || {};
    sec = sec || {};
    var minBars = opts.minBars || 250;
    var required = minCalendarDaysFor(minBars);

    if (opts.inProductUniverse === false) {
      return { eligible: false, reason: NOT_ELIGIBLE.NOT_IN_PRODUCT_UNIVERSE,
               ageDays: null, requiredAgeDays: required };
    }
    /* Der Anbieter fuehrt den Titel, liefert aber keine Reihe. Das ist
       eine Anbieterluecke und keine Aussage ueber unsere Ablage - sie
       gehoert getrennt gezaehlt, nicht in den Nenner. */
    if (opts.providerHasSeries === false) {
      return { eligible: false, reason: NOT_ELIGIBLE.PROVIDER_HAS_NO_SERIES,
               ageDays: null, requiredAgeDays: required };
    }
    var start = sec.startDate || sec.start_date || null;
    if (!start) {
      return { eligible: false, reason: NOT_ELIGIBLE.START_DATE_UNKNOWN,
               ageDays: null, requiredAgeDays: required };
    }
    var age = dayDiff(start, opts.today);
    if (age === null) {
      return { eligible: false, reason: NOT_ELIGIBLE.START_DATE_UNKNOWN,
               ageDays: null, requiredAgeDays: required };
    }
    if (age < required) {
      return { eligible: false, reason: NOT_ELIGIBLE.LISTING_TOO_YOUNG,
               ageDays: age, requiredAgeDays: required };
    }
    return { eligible: true, reason: "ELIGIBLE", ageDays: age, requiredAgeDays: required };
  }

  function pct(a, b) {
    if (!b) return 0;
    return Math.round((a / b) * 10000) / 100;
  }

  /**
   * Die drei Kennzahlen plus die nennerbewusste Langhistorienpruefung.
   *
   * @param {object} input
   *   universe        [{ticker, startDate, ...}]  Mitgliedschaft, unveraendert.
   *   stored          {TICKER: {bars, first, last, bytes}}  Was in der Ablage liegt.
   *   productEligible {TICKER: boolean}  Produkteignung aus dem Stamm.
   *   providerNoSeries {TICKER: true}    Anbieter fuehrt den Titel ohne Reihe.
   *   today           "YYYY-MM-DD"
   *   chartMinBars, technicalMinBars, longHistoryMinBars
   *   minLongHistoryRate  Schwelle der Konfiguration (0.9). Sie wird
   *                       NICHT gesenkt; sie gilt jetzt auf dem
   *                       richtigen Nenner.
   */
  function computeCoverage(input) {
    input = input || {};
    var universe = input.universe || [];
    var stored = input.stored || {};
    var productEligible = input.productEligible || null;
    var providerNoSeries = input.providerNoSeries || {};
    var today = input.today || new Date().toISOString().slice(0, 10);
    var chartMin = input.chartMinBars || 2;
    var techMin = input.technicalMinBars || 300;
    var longMin = input.longHistoryMinBars || 250;
    var minRate = typeof input.minLongHistoryRate === "number" ? input.minLongHistoryRate : 0.9;

    function inProduct(t) {
      if (!productEligible) return true;
      return productEligible[t] !== false;
    }

    var storage = { denominator: 0, stored: 0, missing: 0,
                    missingProviderUnavailable: 0, missingUnexplained: 0,
                    missingSymbols: [] };
    var chart = { denominator: 0, renderable: 0, notRenderable: 0, notRenderableSymbols: [] };
    var technical = { denominator: 0, eligible: 0, tooShort: 0 };
    var longHistory = {
      universeSize: universe.length,
      ELIGIBLE_FOR_LONG_HISTORY_CHECK: 0,
      PASS: 0, FAIL: 0,
      LONG_HISTORY_COVERAGE_PERCENT: 0,
      notEligibleByReason: {},
      failSymbols: []
    };

    universe.forEach(function (s) {
      var t = String(s.ticker || "").toUpperCase();
      if (!t) return;
      var rec = stored[t] || null;
      var bars = rec ? (rec.bars || 0) : 0;
      var product = inProduct(t);

      /* 1. STORAGE_COVERAGE - liegt die Historie in der Ablage?
         Nenner ist das gelieferte Universum; hier zaehlt jede
         Mitgliedschaft, auch die eines Titels, der spaeter aus dem
         Produkt faellt: wir haben sie geholt, also verantworten wir
         sie. */
      storage.denominator++;
      if (rec) storage.stored++;
      else {
        storage.missing++;
        if (providerNoSeries[t]) storage.missingProviderUnavailable++;
        else { storage.missingUnexplained++; storage.missingSymbols.push(t); }
      }

      /* 2. CHART_AVAILABILITY - kann der Chart sie zeichnen?
         Die Schwelle ist die der Chart-Engine, nicht die der Technik.
         Nenner ist das Produktuniversum: ein ausgeschlossener Warrant
         soll gar nicht gezeichnet werden. */
      if (product) {
        chart.denominator++;
        if (bars >= chartMin) chart.renderable++;
        else { chart.notRenderable++; chart.notRenderableSymbols.push(t); }
      }

      /* 3. TECHNICAL_HISTORY_ELIGIBILITY - reicht sie fuer Indikatoren? */
      if (product) {
        technical.denominator++;
        if (bars >= techMin) technical.eligible++;
        else technical.tooShort++;
      }

      /* 4. Langhistorie mit nennerbewusster Eignung. */
      var e = longHistoryEligible(s, {
        today: today, minBars: longMin,
        inProductUniverse: product,
        providerHasSeries: providerNoSeries[t] ? false : true
      });
      if (!e.eligible) {
        longHistory.notEligibleByReason[e.reason] =
          (longHistory.notEligibleByReason[e.reason] || 0) + 1;
        return;
      }
      longHistory.ELIGIBLE_FOR_LONG_HISTORY_CHECK++;
      if (bars >= longMin) longHistory.PASS++;
      else { longHistory.FAIL++; longHistory.failSymbols.push({ ticker: t, bars: bars, startDate: s.startDate || null }); }
    });

    storage.STORAGE_COVERAGE_PERCENT = pct(storage.stored, storage.denominator);
    chart.CHART_AVAILABILITY_PERCENT = pct(chart.renderable, chart.denominator);
    technical.TECHNICAL_HISTORY_ELIGIBILITY_PERCENT = pct(technical.eligible, technical.denominator);
    longHistory.LONG_HISTORY_COVERAGE_PERCENT =
      pct(longHistory.PASS, longHistory.ELIGIBLE_FOR_LONG_HISTORY_CHECK);

    var rate = longHistory.ELIGIBLE_FOR_LONG_HISTORY_CHECK
      ? longHistory.PASS / longHistory.ELIGIBLE_FOR_LONG_HISTORY_CHECK : 0;
    longHistory.threshold = minRate;
    longHistory.thresholdSource = "tiingo-scale.json:pass.minHistoryCoverageRate";
    longHistory.ok = rate >= minRate;

    /* Die alte Zahl bleibt stehen - nicht als Zusage, sondern als
       Vergleichspunkt. Wer sie sucht, soll sehen, was sie war und
       warum sie nicht mehr allein berichtet wird. */
    var legacyDen = universe.length;
    var legacyPass = 0;
    universe.forEach(function (s) {
      var rec = stored[String(s.ticker || "").toUpperCase()];
      if (rec && (rec.bars || 0) >= longMin) legacyPass++;
    });

    return {
      version: VERSION,
      today: today,
      thresholds: {
        chartMinBars: chartMin, chartMinBarsSource: "quant/engines/chart-ranges.js:MIN_BARS",
        technicalMinBars: techMin, technicalMinBarsSource: "scripts/technical/run-technical-scale.mjs:MIN_BARS",
        longHistoryMinBars: longMin, longHistoryMinBarsSource: "tiingo-scale.json:pass.historyCoverageMinBars",
        tradingDaysPerYear: TRADING_DAYS_PER_YEAR
      },
      STORAGE_COVERAGE: storage,
      CHART_AVAILABILITY: chart,
      TECHNICAL_HISTORY_ELIGIBILITY: technical,
      LONG_HISTORY: longHistory,
      legacy: {
        metric: "historyCoverageRate ueber das gesamte Universum",
        denominator: legacyDen, pass: legacyPass, percent: pct(legacyPass, legacyDen),
        note: "Diese Zahl mischt Ablagedeckung, Chartfaehigkeit und Listingalter. " +
              "Sie wird nur noch zum Vergleich gefuehrt."
      }
    };
  }

  var api = {
    VERSION: VERSION,
    TRADING_DAYS_PER_YEAR: TRADING_DAYS_PER_YEAR,
    NOT_ELIGIBLE: NOT_ELIGIBLE,
    minCalendarDaysFor: minCalendarDaysFor,
    longHistoryEligible: longHistoryEligible,
    computeCoverage: computeCoverage
  };

  if (isNode) module.exports = api;
  else global.VUCoverageMetrics = api;
})(typeof window !== "undefined" ? window : globalThis);
