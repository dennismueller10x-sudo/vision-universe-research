/* =========================================================================
   VISION UNIVERSE QUANT — radar.js
   SCORE HISTORY, SCORE MOMENTUM, QUANT RADAR (§23–§25, §57)

   Der eigentliche proprietaere Teil ist nicht die Frage "Wie hoch ist der
   Score?", sondern "Wie veraendert sich die Factor DNA?".

   WICHTIGE EINORDNUNG: Quant Score Momentum ist ein eigener Vision-
   Universe-Signaltyp. Er ist NICHT automatisch wissenschaftlich validiert,
   nur weil seine Bestandteile (Quality, Momentum, Value) es sind. Er muss
   gegen saubere historische Snapshots getestet werden, bevor irgendwo ein
   historischer Mehrwert behauptet wird. Diese Engine berechnet das Signal —
   sie behauptet nichts ueber seine Trefferquote.

   Die Historie besteht aus echten Score-Snapshots, die zu ihrem jeweiligen
   Stichtag mit den damals verfuegbaren Daten berechnet wurden. Sie wird
   NICHT rueckwirkend aus heutigen Daten rekonstruiert — das waere
   Look-Ahead Bias in der Signalhistorie selbst.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Methodology = isNode ? require("./methodology.js") : global.VUMethodology;
  var Hash = isNode ? require("./hash.js") : global.VUHash;

  var FACTOR_KEYS = ["quality", "momentum", "value", "growth", "risk"];

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function round(v, d) {
    if (!isNum(v)) return null;
    var f = Math.pow(10, d === undefined ? 1 : d);
    return Math.round(v * f) / f;
  }
  function daysBetween(a, b) {
    return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
  }

  /**
   * Leeres Historienobjekt im kanonischen Format.
   *   dates   aufsteigend sortierte Snapshot-Stichtage
   *   series  securityId -> { score:[], quality:[], ... } (parallel zu dates)
   */
  function createHistory(methodologyVersion, dataSnapshotId) {
    return { methodologyVersion: methodologyVersion, dataSnapshotId: dataSnapshotId, dates: [], series: Object.create(null) };
  }

  /** Haengt einen berechneten Score-Panel-Snapshot an die Historie an. */
  function appendSnapshot(history, scorePanel) {
    var slot = history.dates.length;
    history.dates.push(scorePanel.asOf);
    scorePanel.scores.forEach(function (s) {
      var series = history.series[s.securityId];
      if (!series) {
        series = history.series[s.securityId] = { score: [] };
        FACTOR_KEYS.forEach(function (f) { series[f] = []; });
      }
      while (series.score.length < slot) {
        series.score.push(null);
        FACTOR_KEYS.forEach(function (f) { series[f].push(null); });
      }
      series.score.push(round(s.score, 1));
      FACTOR_KEYS.forEach(function (f) { series[f].push(round(s.factorScores[f], 1)); });
    });
    /* Titel, die in diesem Snapshot fehlen (delistet, nicht gelistet),
       bekommen null — nicht den letzten bekannten Wert. */
    Object.keys(history.series).forEach(function (id) {
      var series = history.series[id];
      while (series.score.length <= slot) {
        series.score.push(null);
        FACTOR_KEYS.forEach(function (f) { series[f].push(null); });
      }
    });
    return history;
  }

  /** Der Snapshot-Index, der einem Stichtag am naechsten kommt (nicht danach). */
  function indexAtOrBefore(dates, date) {
    var best = -1;
    for (var i = 0; i < dates.length; i++) { if (dates[i] <= date) best = i; else break; }
    return best;
  }

  /** Wert n Kalendertage vor dem letzten Snapshot. */
  function valueDaysAgo(dates, values, days, fromIndex) {
    var target = dates[fromIndex];
    var cutoff = new Date(Date.parse(target + "T00:00:00Z") - days * 86400000).toISOString().slice(0, 10);
    for (var i = fromIndex; i >= 0; i--) {
      if (dates[i] <= cutoff) return { value: values[i], index: i, date: dates[i] };
    }
    return { value: null, index: -1, date: null };
  }

  /**
   * Score Momentum je Security (§24).
   *   scoreVelocity30d/60d  Veraenderung ueber 30/60 Kalendertage
   *   scoreAcceleration     Velocity der letzten 30 Tage minus Velocity der
   *                         30 Tage davor
   *   factorVelocity        dasselbe je Faktor
   */
  function computeVelocity(history, securityId, cfg) {
    cfg = cfg || Methodology.quant();
    var windows = cfg.scoreMomentum.velocityWindowsDays;
    var accWindow = cfg.scoreMomentum.accelerationWindowDays;
    var series = history.series[securityId];
    var out = {
      securityId: securityId, scoreVelocity30d: null, scoreVelocity60d: null,
      scoreAcceleration: null, factorVelocity: {}, previousScore: null, currentScore: null,
      historyPoints: 0
    };
    if (!series) return out;

    var last = history.dates.length - 1;
    while (last >= 0 && !isNum(series.score[last])) last--;
    if (last < 0) return out;

    out.currentScore = series.score[last];
    out.historyPoints = series.score.filter(isNum).length;

    windows.forEach(function (w) {
      var past = valueDaysAgo(history.dates, series.score, w, last);
      if (isNum(past.value)) out["scoreVelocity" + w + "d"] = round(out.currentScore - past.value, 1);
      if (w === accWindow) out.previousScore = past.value;
    });

    /* Beschleunigung: hat sich die Verbesserung selbst beschleunigt? */
    var p1 = valueDaysAgo(history.dates, series.score, accWindow, last);
    if (p1.index >= 0) {
      var p2 = valueDaysAgo(history.dates, series.score, accWindow, p1.index);
      if (isNum(p1.value) && isNum(p2.value)) {
        var v1 = out.currentScore - p1.value;
        var v0 = p1.value - p2.value;
        out.scoreAcceleration = round(v1 - v0, 1);
      }
    }

    FACTOR_KEYS.forEach(function (f) {
      var past = valueDaysAgo(history.dates, series[f], accWindow, last);
      out.factorVelocity[f] = (isNum(series[f][last]) && isNum(past.value))
        ? round(series[f][last] - past.value, 1) : null;
    });
    return out;
  }

  /** Velocity fuer alle Titel eines Panels. */
  function computeVelocityPanel(history, securityIds, cfg) {
    var out = Object.create(null);
    securityIds.forEach(function (id) { out[id] = computeVelocity(history, id, cfg); });
    return out;
  }

  // ---------------------------------------------------------------------
  // Intelligence Events (§57)
  // ---------------------------------------------------------------------
  function makeEvent(fields) {
    var base = {
      securityId: fields.securityId,
      eventType: fields.eventType,
      severity: fields.severity,
      previousValue: isNum(fields.previousValue) ? round(fields.previousValue, 1) : undefined,
      newValue: isNum(fields.newValue) ? round(fields.newValue, 1) : undefined,
      occurredAt: fields.occurredAt,
      detectedAt: fields.detectedAt,
      methodologyVersion: fields.methodologyVersion,
      headline: fields.headline
    };
    base.eventId = Hash.prefixedHash("evt", {
      s: base.securityId, t: base.eventType, o: base.occurredAt, n: base.newValue
    });
    return base;
  }

  /**
   * Erkennt Veraenderungen, die eine Benachrichtigung rechtfertigen.
   * Bewusst schwellenbasiert und zentral konfiguriert (§72) — nicht jede
   * Score-Bewegung ist ein Ereignis.
   */
  function detectEvents(rows, velocities, cfg) {
    cfg = cfg || Methodology.quant();
    var r = cfg.radar;
    var asOf = rows.length ? rows[0].asOf : null;
    var events = [];

    rows.forEach(function (row) {
      var v = velocities[row.securityId];
      if (!v) return;
      var common = { securityId: row.securityId, occurredAt: asOf, detectedAt: asOf, methodologyVersion: cfg.methodologyVersion };

      if (isNum(v.scoreVelocity30d) && v.scoreVelocity30d >= r.quantUpgradeMinDelta) {
        events.push(makeEvent(Object.assign({}, common, {
          eventType: "quant_upgrade",
          severity: v.scoreVelocity30d >= r.quantUpgradeMinDelta * 2 ? "high" : "notable",
          previousValue: v.previousScore, newValue: v.currentScore,
          headline: row.ticker + ": VU Quant Score " + v.previousScore + " → " + v.currentScore
        })));
      }
      if (isNum(v.scoreVelocity30d) && v.scoreVelocity30d <= r.quantDowngradeMaxDelta) {
        events.push(makeEvent(Object.assign({}, common, {
          eventType: "quant_downgrade",
          severity: v.scoreVelocity30d <= r.quantDowngradeMaxDelta * 2 ? "high" : "notable",
          previousValue: v.previousScore, newValue: v.currentScore,
          headline: row.ticker + ": VU Quant Score " + v.previousScore + " → " + v.currentScore
        })));
      }
      if (isNum(row.momentumScore) && row.momentumScore >= r.momentumLeaderMinScore &&
          isNum(v.factorVelocity.momentum) && v.factorVelocity.momentum > 0) {
        events.push(makeEvent(Object.assign({}, common, {
          eventType: "momentum_leader", severity: "notable",
          previousValue: row.momentumScore - v.factorVelocity.momentum, newValue: row.momentumScore,
          headline: row.ticker + ": Momentum-Score " + row.momentumScore + " (oberstes Dezil)"
        })));
      }
      if (isNum(row.qualityScore) && row.qualityScore >= r.qualityLeaderMinScore &&
          isNum(v.factorVelocity.quality) && v.factorVelocity.quality > 0) {
        events.push(makeEvent(Object.assign({}, common, {
          eventType: "quality_leader", severity: "notable",
          previousValue: row.qualityScore - v.factorVelocity.quality, newValue: row.qualityScore,
          headline: row.ticker + ": Quality-Score " + row.qualityScore
        })));
      }
      if (isNum(row.distanceTo52wHigh) && row.distanceTo52wHigh <= r.near52wHighMaxDistancePct &&
          isNum(row.quantScore) && row.quantScore >= r.near52wHighMinQuantScore) {
        events.push(makeEvent(Object.assign({}, common, {
          eventType: "near_52w_high_confirmed", severity: "info",
          newValue: row.quantScore,
          headline: row.ticker + ": " + row.distanceTo52wHigh.toFixed(1) + " % unter dem 52-Wochen-Hoch bei Quant Score " + row.quantScore
        })));
      }
      if (isNum(v.factorVelocity.quality) && isNum(v.factorVelocity.growth) &&
          v.factorVelocity.quality >= r.emergingCompounderMinFactorDelta &&
          v.factorVelocity.growth >= r.emergingCompounderMinFactorDelta) {
        events.push(makeEvent(Object.assign({}, common, {
          eventType: "emerging_compounder", severity: "notable",
          newValue: row.quantScore,
          headline: row.ticker + ": Quality und Growth verbessern sich gleichzeitig"
        })));
      }
      var breakoutFactors = FACTOR_KEYS.filter(function (f) {
        return isNum(v.factorVelocity[f]) && v.factorVelocity[f] >= r.factorBreakoutMinDelta;
      });
      if (breakoutFactors.length >= r.factorBreakoutMinFactors) {
        events.push(makeEvent(Object.assign({}, common, {
          eventType: "factor_breakout", severity: "high",
          newValue: row.quantScore,
          headline: row.ticker + ": sprunghafte Verbesserung in " + breakoutFactors.length + " Faktoren"
        })));
      }
      if (isNum(v.factorVelocity.quality) && v.factorVelocity.quality <= -r.factorBreakoutMinDelta) {
        events.push(makeEvent(Object.assign({}, common, {
          eventType: "quality_deterioration", severity: "high",
          previousValue: row.qualityScore - v.factorVelocity.quality, newValue: row.qualityScore,
          headline: row.ticker + ": Quality-Score faellt um " + Math.abs(v.factorVelocity.quality) + " Punkte"
        })));
      }
    });

    return events;
  }

  // ---------------------------------------------------------------------
  // Radar-Module (§25)
  // ---------------------------------------------------------------------
  var RADAR_MODULES = [
    { id: "biggest_upgrades",   label: "Groesste Quant-Verbesserungen", description: "Staerkste Score-Veraenderung ueber 30 Tage." },
    { id: "biggest_downgrades", label: "Groesste Quant-Verschlechterungen", description: "Staerkster Score-Rueckgang ueber 30 Tage." },
    { id: "new_momentum_leaders", label: "Neue Momentum-Fuehrer", description: "Momentum-Score im obersten Dezil mit steigender Tendenz." },
    { id: "new_quality_leaders", label: "Neue Quality-Fuehrer", description: "Quality-Score ueber 90 mit steigender Tendenz." },
    { id: "near_52w_high",      label: "52W-Hoch mit Quant-Bestaetigung", description: "Nahe am 52-Wochen-Hoch bei gleichzeitig hohem Quant Score." },
    { id: "emerging_compounders", label: "Emerging Compounders", description: "Quality und Growth verbessern sich gleichzeitig." },
    { id: "factor_breakouts",   label: "Factor Breakouts", description: "Mehrere Faktoren verbessern sich sprunghaft." }
  ];

  function buildRadar(rows, velocities, cfg, options) {
    cfg = cfg || Methodology.quant();
    options = options || {};
    var limit = options.limit || 10;
    var r = cfg.radar;
    var active = rows.filter(function (row) { return row.status === "active" && isNum(row.quantScore); });

    function withVelocity(row) {
      var v = velocities[row.securityId] || {};
      return Object.assign({}, row, {
        scoreVelocity30d: v.scoreVelocity30d === undefined ? null : v.scoreVelocity30d,
        scoreVelocity60d: v.scoreVelocity60d === undefined ? null : v.scoreVelocity60d,
        scoreAcceleration: v.scoreAcceleration === undefined ? null : v.scoreAcceleration,
        factorVelocity: v.factorVelocity || {},
        previousScore: v.previousScore === undefined ? null : v.previousScore
      });
    }
    var enriched = active.map(withVelocity);

    function topBy(list, key, direction, filterFn) {
      return list
        .filter(function (x) { return isNum(x[key]) && (!filterFn || filterFn(x)); })
        .sort(function (a, b) { return direction === "desc" ? b[key] - a[key] : a[key] - b[key]; })
        .slice(0, limit);
    }

    var modules = {
      biggest_upgrades: topBy(enriched, "scoreVelocity30d", "desc", function (x) { return x.scoreVelocity30d >= r.quantUpgradeMinDelta; }),
      biggest_downgrades: topBy(enriched, "scoreVelocity30d", "asc", function (x) { return x.scoreVelocity30d <= r.quantDowngradeMaxDelta; }),
      new_momentum_leaders: enriched
        .filter(function (x) { return isNum(x.momentumScore) && x.momentumScore >= r.momentumLeaderMinScore && isNum(x.factorVelocity.momentum) && x.factorVelocity.momentum > 0; })
        .sort(function (a, b) { return b.factorVelocity.momentum - a.factorVelocity.momentum; }).slice(0, limit),
      new_quality_leaders: enriched
        .filter(function (x) { return isNum(x.qualityScore) && x.qualityScore >= r.qualityLeaderMinScore && isNum(x.factorVelocity.quality) && x.factorVelocity.quality > 0; })
        .sort(function (a, b) { return b.factorVelocity.quality - a.factorVelocity.quality; }).slice(0, limit),
      near_52w_high: enriched
        .filter(function (x) { return isNum(x.distanceTo52wHigh) && x.distanceTo52wHigh <= r.near52wHighMaxDistancePct && x.quantScore >= r.near52wHighMinQuantScore; })
        .sort(function (a, b) { return b.quantScore - a.quantScore; }).slice(0, limit),
      emerging_compounders: enriched
        .filter(function (x) {
          return isNum(x.factorVelocity.quality) && isNum(x.factorVelocity.growth) &&
                 x.factorVelocity.quality >= r.emergingCompounderMinFactorDelta &&
                 x.factorVelocity.growth >= r.emergingCompounderMinFactorDelta;
        })
        .sort(function (a, b) { return (b.factorVelocity.quality + b.factorVelocity.growth) - (a.factorVelocity.quality + a.factorVelocity.growth); })
        .slice(0, limit),
      factor_breakouts: enriched
        .map(function (x) {
          var count = FACTOR_KEYS.filter(function (f) { return isNum(x.factorVelocity[f]) && x.factorVelocity[f] >= r.factorBreakoutMinDelta; }).length;
          return Object.assign({}, x, { breakoutFactorCount: count });
        })
        .filter(function (x) { return x.breakoutFactorCount >= r.factorBreakoutMinFactors; })
        .sort(function (a, b) { return b.breakoutFactorCount - a.breakoutFactorCount || b.scoreVelocity30d - a.scoreVelocity30d; })
        .slice(0, limit)
    };

    return { asOf: rows.length ? rows[0].asOf : null, methodologyVersion: cfg.methodologyVersion, modules: modules, definitions: RADAR_MODULES };
  }

  /** Score-Verlauf einer Security fuer die Detailseite. */
  function seriesFor(history, securityId) {
    var series = history.series[securityId];
    if (!series) return null;
    var points = [];
    for (var i = 0; i < history.dates.length; i++) {
      if (!isNum(series.score[i])) continue;
      var point = { date: history.dates[i], score: series.score[i] };
      FACTOR_KEYS.forEach(function (f) { point[f] = series[f][i]; });
      points.push(point);
    }
    return points;
  }

  var api = {
    FACTOR_KEYS: FACTOR_KEYS,
    RADAR_MODULES: RADAR_MODULES,
    createHistory: createHistory,
    appendSnapshot: appendSnapshot,
    computeVelocity: computeVelocity,
    computeVelocityPanel: computeVelocityPanel,
    detectEvents: detectEvents,
    buildRadar: buildRadar,
    seriesFor: seriesFor,
    indexAtOrBefore: indexAtOrBefore,
    daysBetween: daysBetween
  };

  if (isNode) module.exports = api;
  else global.VURadar = api;
})(typeof window !== "undefined" ? window : globalThis);
