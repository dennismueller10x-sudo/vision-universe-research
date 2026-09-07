/* =========================================================================
   VISION UNIVERSE QUANT — market-quality.js
   QUALITAETSPRUEFUNG EINGEHENDER MARKTDATEN (Phase 2, §17)

   Kein Datensatz erreicht die Quant Engine ungeprueft.

   Der Grund ist asymmetrisch: eine falsche Bar faellt in der Kursanzeige
   kaum auf, kann aber in einem Momentum-Faktor oder einem Backtest einen
   Scheingewinn von 100 % erzeugen — und der sieht dann aus wie ein
   Ergebnis. Ein nicht angekuendigter Split ist der haeufigste Fall: der
   Kurs halbiert sich ueber Nacht, und ohne Bereinigung liest die Engine
   das als Kurssturz.

   Befunde sind nach Schwere getrennt:
     error    Bar bzw. Reihe darf nicht verwendet werden
     warning  verwendbar, aber kennzeichnungspflichtig
     info     Hinweis
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var DEFAULTS = {
    maxDailyMovePct: 35,        // darueber: Verdacht auf Corporate Action
    splitRatios: [2, 3, 4, 5, 6, 7, 8, 10, 20, 1.5],
    splitTolerance: 0.04,
    maxGapTradingDays: 5,       // fehlende Handelstage in Folge
    minBars: 2
  };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function round(v, d) { var f = Math.pow(10, d || 2); return Math.round(v * f) / f; }

  function finding(severity, code, message, context) {
    return { severity: severity, code: code, message: message, context: context || null };
  }

  /** Sieht das Kursverhaeltnis nach einem gaengigen Split aus? */
  function looksLikeSplit(ratio, config) {
    var candidates = config.splitRatios;
    for (var i = 0; i < candidates.length; i++) {
      var r = candidates[i];
      if (Math.abs(ratio - r) / r <= config.splitTolerance) return { ratio: r, direction: "down" };
      if (Math.abs(ratio - 1 / r) * r <= config.splitTolerance) return { ratio: r, direction: "up" };
    }
    return null;
  }

  /**
   * Prueft eine Kursreihe.
   * @param {Array} bars aufsteigend nach Datum
   * @param {object} options {today, tradingDays, config, adjustmentStatus}
   */
  function validateBars(bars, options) {
    options = options || {};
    var config = Object.assign({}, DEFAULTS, options.config || {});
    var today = options.today || new Date().toISOString().slice(0, 10);
    var findings = [];
    var usable = [];

    if (!Array.isArray(bars) || bars.length < config.minBars) {
      findings.push(finding("error", "too_few_bars",
        "Zu wenige Bars (" + (bars ? bars.length : 0) + "). Eine Reihe unter " + config.minBars +
        " Punkten laesst keine Pruefung und keine Faktorberechnung zu."));
      return { ok: false, findings: findings, bars: [], stats: null };
    }

    var seenDates = Object.create(null);
    var previous = null;
    var suspectedSplits = [];
    var gaps = [];

    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      var where = { index: i, date: bar && bar.date };
      var barErrors = 0;

      if (!bar || !/^\d{4}-\d{2}-\d{2}$/.test(String(bar.date))) {
        findings.push(finding("error", "invalid_date", "Bar ohne gueltiges Datum.", where));
        continue;
      }
      /* Bars aus der Zukunft sind kein Randfall: sie entstehen durch
         Zeitzonenfehler und wuerden im Backtest als Look-Ahead wirken. */
      if (bar.date > today) {
        findings.push(finding("error", "future_bar",
          "Bar liegt in der Zukunft (" + bar.date + " > " + today + ").", where));
        continue;
      }
      if (seenDates[bar.date]) {
        findings.push(finding("error", "duplicate_bar", "Doppelte Bar fuer " + bar.date + ".", where));
        continue;
      }
      seenDates[bar.date] = true;

      if (previous && bar.date <= previous.date) {
        findings.push(finding("error", "non_monotonic",
          "Zeitstempel nicht aufsteigend: " + bar.date + " nach " + previous.date + ".", where));
        barErrors++;
      }

      var o = bar.open, h = bar.high, l = bar.low, c = bar.close;
      if (!isNum(c) || c <= 0) {
        findings.push(finding("error", "invalid_close", "Schlusskurs fehlt oder ist nicht positiv.", where));
        continue;
      }
      if (isNum(h) && isNum(l) && h < l) {
        findings.push(finding("error", "high_below_low", "High (" + h + ") unter Low (" + l + ").", where));
        barErrors++;
      }
      if (isNum(h) && ((isNum(o) && h < o) || h < c)) {
        findings.push(finding("error", "high_below_body",
          "High (" + h + ") unter Open/Close.", where));
        barErrors++;
      }
      if (isNum(l) && ((isNum(o) && l > o) || l > c)) {
        findings.push(finding("error", "low_above_body",
          "Low (" + l + ") ueber Open/Close.", where));
        barErrors++;
      }
      if (isNum(bar.volume) && bar.volume < 0) {
        findings.push(finding("error", "negative_volume", "Negatives Volumen.", where));
        barErrors++;
      }
      if (isNum(o) && o <= 0) {
        findings.push(finding("warning", "non_positive_open", "Eroeffnungskurs nicht positiv.", where));
      }

      if (previous && isNum(previous.close) && previous.close > 0) {
        var change = c / previous.close - 1;
        var movePct = Math.abs(change) * 100;
        if (movePct > config.maxDailyMovePct) {
          var split = looksLikeSplit(previous.close / c, config);
          if (split) {
            suspectedSplits.push({ date: bar.date, ratio: split.ratio, direction: split.direction,
                                   from: previous.close, to: c });
            findings.push(finding("error", "suspected_unadjusted_split",
              "Kurssprung von " + round(movePct, 1) + " % am " + bar.date + " entspricht einem " +
              split.ratio + ":1-Verhaeltnis. Das ist mit hoher Wahrscheinlichkeit ein nicht bereinigter " +
              "Split. Unbereinigt gerechnet wuerde die Engine daraus einen echten Kursverlust ableiten.",
              where));
          } else {
            findings.push(finding("warning", "large_move",
              "Kurssprung von " + round(movePct, 1) + " % am " + bar.date + " ohne erkennbares Split-Verhaeltnis. " +
              "Pruefen, ob ein Unternehmensereignis oder ein Datenfehler vorliegt.", where));
          }
        }
      }

      /* Luecken: mehr als N fehlende Handelstage deuten auf einen
         unvollstaendigen Abruf hin, nicht auf Feiertage. */
      if (previous && options.tradingDays) {
        var missing = countMissingTradingDays(previous.date, bar.date, options.tradingDays);
        if (missing > config.maxGapTradingDays) {
          gaps.push({ from: previous.date, to: bar.date, missing: missing });
          findings.push(finding("warning", "missing_bars",
            missing + " fehlende Handelstage zwischen " + previous.date + " und " + bar.date + ".", where));
        }
      }

      if (barErrors === 0) usable.push(bar);
      previous = bar;
    }

    /* Unbereinigte Reihen sind fuer die Renditerechnung nicht geeignet.
       Das ist eine Eigenschaft der Reihe, kein Fehler einer Bar. */
    if (options.adjustmentStatus === "unadjusted") {
      findings.push(finding("warning", "unadjusted_series",
        "Die Reihe ist nicht um Splits und Dividenden bereinigt. Sie ist fuer die Anzeige geeignet, " +
        "aber nicht als Grundlage fuer Total-Return-Kennzahlen oder Backtests."));
    } else if (options.adjustmentStatus === "splitAdjusted") {
      /* Der unauffaelligere und darum gefaehrlichere Fall: die Reihe sieht
         sauber aus, weil die Splits herausgerechnet sind. Die Dividenden
         fehlen aber weiterhin. Wer darauf eine Total-Return-Kennzahl
         rechnet, unterschaetzt die Rendite systematisch - bei einem
         Dividendenwert ueber zehn Jahre um mehrere Prozentpunkte pro Jahr.
         Kein Fehler der Reihe, aber eine Grenze ihrer Verwendbarkeit. */
      findings.push(finding("warning", "split_adjusted_only",
        "Die Reihe ist splitbereinigt, aber nicht dividendenbereinigt. Fuer Charts und " +
        "Momentum-Kennzahlen geeignet, fuer Total-Return-Kennzahlen nicht."));
    }

    var errors = findings.filter(function (f) { return f.severity === "error"; });
    var stats = {
      bars: bars.length, usable: usable.length,
      first: usable.length ? usable[0].date : null,
      last: usable.length ? usable[usable.length - 1].date : null,
      suspectedSplits: suspectedSplits.length,
      gaps: gaps.length,
      errors: errors.length,
      warnings: findings.length - errors.length
    };
    return { ok: errors.length === 0, findings: findings, bars: usable, stats: stats,
             suspectedSplits: suspectedSplits, gaps: gaps };
  }

  function countMissingTradingDays(fromDate, toDate, tradingDays) {
    var from = tradingDays.indexOf(fromDate);
    var to = tradingDays.indexOf(toDate);
    if (from < 0 || to < 0 || to <= from) return 0;
    return to - from - 1;
  }

  /** Prueft einen ganzen Abruf ueber mehrere Titel. */
  function validateBatch(seriesById, options) {
    var results = {};
    var summary = { securities: 0, ok: 0, rejected: 0, totalErrors: 0, totalWarnings: 0, rejectedIds: [] };
    Object.keys(seriesById).forEach(function (securityId) {
      var entry = seriesById[securityId];
      var res = validateBars(entry.bars || entry, Object.assign({}, options, {
        adjustmentStatus: entry.adjustmentStatus || (options && options.adjustmentStatus)
      }));
      results[securityId] = res;
      summary.securities++;
      summary.totalErrors += res.stats ? res.stats.errors : 1;
      summary.totalWarnings += res.stats ? res.stats.warnings : 0;
      if (res.ok) summary.ok++;
      else { summary.rejected++; summary.rejectedIds.push(securityId); }
    });
    return { results: results, summary: summary };
  }

  var api = { DEFAULTS: DEFAULTS, validateBars: validateBars, validateBatch: validateBatch, looksLikeSplit: looksLikeSplit };

  if (isNode) module.exports = api;
  else global.VUMarketQuality = api;
})(typeof window !== "undefined" ? window : globalThis);
