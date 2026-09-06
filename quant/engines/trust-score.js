/* =========================================================================
   VISION UNIVERSE QUANT — trust-score.js
   VU BACKTEST TRUST SCORE (§45, §46)

   Der Trust Score bewertet die METHODISCHE GUETE eines Backtests, nicht
   seine Rendite. Eine Equity Curve mit 25 % CAGR und ohne
   Point-in-Time-Daten ist kein gutes Ergebnis, sondern ein unbrauchbares.

   Zwei Konstruktionsprinzipien:

   1. EVIDENZBASIERT. Bewertet werden ausschliesslich die `capabilities`,
      die der Backtest-Lauf selbst gemeldet hat — nicht Behauptungen ueber
      die Engine. Was nicht nachgewiesen ist, gibt keine Punkte.

   2. HARTE OBERGRENZEN. Ohne Point-in-Time-Fundamentaldaten sind maximal
      60 Punkte erreichbar, ohne delistete Titel maximal 70, fuer eine
      optimierte Strategie ohne Out-of-Sample-Pruefung maximal 75. Damit
      kann ein optisch beeindruckender Backtest mit methodischen Maengeln
      keinen hohen Trust Score bekommen — genau darum geht es.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Methodology = isNode ? require("./methodology.js") : global.VUMethodology;

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function round(v, d) {
    if (!isNum(v)) return null;
    var f = Math.pow(10, d === undefined ? 1 : d);
    return Math.round(v * f) / f;
  }

  /** Ein Pruefergebnis: erfuellt / teilweise / nicht erfuellt. */
  function check(id, label, maxPoints, ratio, note) {
    var value = Math.max(0, Math.min(1, ratio));
    return {
      id: id, label: label, maxPoints: maxPoints,
      points: round(maxPoints * value, 2),
      status: value >= 0.999 ? "pass" : (value > 0 ? "partial" : "fail"),
      note: note || null
    };
  }

  /**
   * @param {object} run       Ergebnis von backtest.runBacktest()
   * @param {object} [context] {userOptimized, outOfSample, parameterSensitivity, multipleTestingCount}
   */
  function computeTrustScore(run, context) {
    context = context || {};
    var cfg = Methodology.trustScore();
    var caps = run.capabilities || {};
    var thresholds = cfg.sampleQualityThresholds;

    var blocks = {};

    /* ---------------------------------------------------- Data Integrity */
    var di = cfg.blocks.dataIntegrity;
    blocks.dataIntegrity = {
      label: di.label, maxPoints: di.points,
      checks: [
        check("pointInTimeFundamentals", di.checks.pointInTimeFundamentals.label, di.checks.pointInTimeFundamentals.points,
          caps.pointInTimeFundamentals ? 1 : 0,
          caps.pointInTimeFundamentals
            ? "Fundamentaldaten wurden ausschliesslich mit availableAt <= Entscheidungszeitpunkt gelesen."
            : "Ohne Point-in-Time-Daten kann der Backtest zukuenftiges Wissen verwenden."),
        check("delistedSecurities", di.checks.delistedSecurities.label, di.checks.delistedSecurities.points,
          caps.delistedSecurities ? 1 : 0,
          caps.delistedSecurities
            ? "Das historische Universum enthaelt spaeter delistete und uebernommene Titel."
            : "Ein Universum aus heutigen Ueberlebenden erzeugt Survivorship Bias."),
        check("originalVsRestated", di.checks.originalVsRestated.label, di.checks.originalVsRestated.points,
          caps.originalVsRestated ? 1 : 0,
          caps.originalVsRestated
            ? "Spaetere Korrekturen wirken nicht rueckwirkend; zum Stichtag galt die Originalmeldung."
            : "Rueckwirkend korrigierte Zahlen waren zum Entscheidungszeitpunkt nicht bekannt."),
        check("corporateActions", di.checks.corporateActions.label, di.checks.corporateActions.points,
          caps.corporateActions ? 1 : 0,
          caps.corporateActions
            ? "Splits, Dividenden und Delistings sind in der Total-Return-Reihe beruecksichtigt."
            : "Ohne Corporate Actions sind historische Renditen systematisch falsch."),
        check("historicalUniverse", di.checks.historicalUniverse.label, di.checks.historicalUniverse.points,
          caps.historicalUniverse ? 1 : 0,
          caps.historicalUniverse
            ? "Das Universum wurde zu jedem Rebalancing-Termin neu aus dem historischen Security Master gebildet."
            : "Ein statisches Universum blendet Zugaenge und Abgaenge aus.")
      ]
    };

    /* -------------------------------------------------- Execution Realism */
    var er = cfg.blocks.executionRealism;
    var costBps = isNum(caps.transactionCostsBps) ? caps.transactionCostsBps : 0;
    var slipBps = isNum(caps.slippageBps) ? caps.slippageBps : 0;
    blocks.executionRealism = {
      label: er.label, maxPoints: er.points,
      checks: [
        check("transactionCosts", er.checks.transactionCosts.label, er.checks.transactionCosts.points,
          costBps <= 0 ? 0 : Math.min(1, costBps / 5),
          costBps > 0 ? costBps + " bps je Handel angesetzt."
                      : "Ohne Transaktionskosten ist jede Umschichtung kostenlos — das ist sie nie."),
        check("slippage", er.checks.slippage.label, er.checks.slippage.points,
          slipBps <= 0 ? 0 : Math.min(1, slipBps / 5),
          slipBps > 0 ? slipBps + " bps Slippage angesetzt."
                      : "Ohne Slippage wird jede Order zum Modellpreis ausgefuehrt."),
        check("liquidityConstraints", er.checks.liquidityConstraints.label, er.checks.liquidityConstraints.points,
          caps.liquidityConstraint ? 1 : 0,
          caps.liquidityConstraint
            ? "Mindestliquiditaet als Filter, nicht als nachtraegliche Korrektur."
            : "Ohne Liquiditaetsgrenze koennen beliebig illiquide Titel gekauft werden."),
        check("executionTiming", er.checks.executionTiming.label, er.checks.executionTiming.points,
          caps.executionAfterSignal ? 1 : 0,
          caps.executionAfterSignal
            ? "Signal am Schluss von T, Ausfuehrung fruehestens T+1."
            : "Ein Signal auf dem Schlusskurs darf nicht zu diesem Schlusskurs handeln.")
      ]
    };

    /* ------------------------------------------- Statistical Validation */
    var sv = cfg.blocks.statisticalValidation;
    blocks.statisticalValidation = {
      label: sv.label, maxPoints: sv.points,
      checks: [
        check("outOfSample", sv.checks.outOfSample.label, sv.checks.outOfSample.points,
          context.outOfSample ? 1 : 0,
          context.outOfSample
            ? "Ein Out-of-Sample-Abschnitt wurde separat ausgewertet."
            : "Ohne Out-of-Sample-Abschnitt ist nicht pruefbar, ob die Regeln auf ungesehene Daten uebertragbar sind."),
        check("parameterRobustness", sv.checks.parameterRobustness.label, sv.checks.parameterRobustness.points,
          context.parameterSensitivity ? 1 : 0,
          context.parameterSensitivity
            ? "Die Sensitivitaet gegenueber Parameteraenderungen wurde geprueft."
            : "Ohne Sensitivitaetsanalyse bleibt offen, ob das Ergebnis an einer exakt getroffenen Schwelle haengt."),
        check("multipleTesting", sv.checks.multipleTesting.label, sv.checks.multipleTesting.points,
          0,
          "Deflated Sharpe Ratio und Probability of Backtest Overfitting sind in V1 nicht implementiert. " +
          "Bei mehreren getesteten Varianten steigt die Wahrscheinlichkeit eines rein zufaellig guten Ergebnisses."),
        check("crossPeriod", sv.checks.crossPeriod.label, sv.checks.crossPeriod.points,
          caps.subperiodAnalysis ? 0.6 : 0,
          caps.subperiodAnalysis
            ? "Teilperioden werden ausgewiesen. Eine Validierung ueber mehrere Maerkte ist mit einem einzigen Mock-Universum nicht moeglich."
            : "Keine Teilperiodenbetrachtung.")
      ]
    };

    /* --------------------------------------------------- Sample Quality */
    var sq = cfg.blocks.sampleQuality;
    var years = isNum(caps.years) ? caps.years : 0;
    var rebalances = isNum(caps.rebalanceCount) ? caps.rebalanceCount : 0;
    var holdings = isNum(caps.averageHoldings) ? caps.averageHoldings : 0;
    var turnover = isNum(caps.annualTurnoverPct) ? caps.annualTurnoverPct : 0;

    var historyRatio = years >= thresholds.historyFullPointsYears ? 1
      : years >= thresholds.historyPartialPointsYears ? 0.6
      : years / Math.max(1, thresholds.historyPartialPointsYears) * 0.6;
    var obsRatio = rebalances >= thresholds.observationsFullPoints ? 1
      : rebalances >= thresholds.observationsPartialPoints ? 0.6
      : rebalances / Math.max(1, thresholds.observationsPartialPoints) * 0.6;
    var breadthRatio = Math.min(1, holdings / thresholds.breadthFullPointsPositions);
    if (turnover > thresholds.breadthMaxAnnualTurnoverPct) {
      /* Sehr hoher Umschlag macht ein Ergebnis stark von den
         Kostenannahmen abhaengig — das mindert die Aussagekraft. */
      breadthRatio *= 0.5;
    }

    blocks.sampleQuality = {
      label: sq.label, maxPoints: sq.points,
      checks: [
        check("historyLength", sq.checks.historyLength.label, sq.checks.historyLength.points, historyRatio,
          round(years, 1) + " Jahre Testzeitraum."),
        check("observations", sq.checks.observations.label, sq.checks.observations.points, obsRatio,
          rebalances + " Rebalancing-Termine."),
        check("breadth", sq.checks.breadth.label, sq.checks.breadth.points, breadthRatio,
          round(holdings, 1) + " Positionen im Durchschnitt, " + round(turnover, 0) + " % Umschlag pro Jahr" +
          (turnover > thresholds.breadthMaxAnnualTurnoverPct ? " — sehr hoch, Ergebnis stark kostenabhaengig." : "."))
      ]
    };

    /* ----------------------------------------------------- Summe + Caps */
    var raw = 0, maxTotal = 0;
    Object.keys(blocks).forEach(function (key) {
      blocks[key].points = round(blocks[key].checks.reduce(function (s, c) { return s + c.points; }, 0), 2);
      raw += blocks[key].points;
      maxTotal += blocks[key].maxPoints;
    });

    var appliedCaps = [];
    var capped = raw;
    cfg.hardCaps.forEach(function (cap) {
      var triggered =
        (cap.id === "noPointInTime" && !caps.pointInTimeFundamentals) ||
        (cap.id === "noDelisted" && !caps.delistedSecurities) ||
        (cap.id === "optimizedNoOos" && context.userOptimized && !context.outOfSample);
      if (!triggered) return;
      appliedCaps.push({ id: cap.id, label: cap.label, maxScore: cap.maxScore });
      capped = Math.min(capped, cap.maxScore);
    });

    var score = round(capped, 0);
    var band = Methodology.bandFor(cfg.ratingBands, score);

    return {
      score: score,
      rawScore: round(raw, 1),
      maxScore: maxTotal,
      label: band ? band.label : null,
      methodologyVersion: cfg.methodologyVersion,
      blocks: blocks,
      appliedCaps: appliedCaps,
      /* Was der Score NICHT aussagt — gehoert genauso in die Ausgabe wie
         die Zahl selbst (§46). */
      limitations: buildLimitations(blocks, appliedCaps, caps)
    };
  }

  function buildLimitations(blocks, appliedCaps, caps) {
    var out = [];
    Object.keys(blocks).forEach(function (key) {
      blocks[key].checks.forEach(function (c) {
        if (c.status !== "pass" && c.note) out.push({ label: c.label, status: c.status, note: c.note });
      });
    });
    appliedCaps.forEach(function (cap) {
      out.unshift({ label: "Obergrenze aktiv: " + cap.label, status: "fail",
                    note: "Der Trust Score kann dadurch hoechstens " + cap.maxScore + " Punkte erreichen." });
    });
    if (caps.isMock) {
      out.push({
        label: "Synthetische Datengrundlage", status: "partial",
        note: "Der Test lief auf einem generierten Universum. Er belegt die Funktionsweise der Engine, " +
              "nicht die historische Tragfaehigkeit der Strategie an realen Maerkten."
      });
    }
    return out;
  }

  var api = { computeTrustScore: computeTrustScore };

  if (isNode) module.exports = api;
  else global.VUTrustScore = api;
})(typeof window !== "undefined" ? window : globalThis);
