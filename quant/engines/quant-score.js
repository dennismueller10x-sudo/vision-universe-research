/* =========================================================================
   VISION UNIVERSE QUANT — quant-score.js
   VU QUANT SCORE (§19–§22, §55)

   Composite 0–100 aus fuenf Faktoren mit zentral versionierten Gewichten.

   Drei Eigenschaften, die den Score von einer bunten Zahl unterscheiden:

   1. ZERLEGBARKEIT (§55). Die Faktorbeitraege summieren sich exakt zum
      Composite. Das ist kein Darstellungstrick, sondern folgt aus der
      Konstruktion: contribution_f = effektivesGewicht_f * Faktorscore_f,
      und die effektiven Gewichte summieren zu 1.

   2. EHRLICHE COVERAGE (§21). Fehlende Daten werden NICHT als neutrale 50
      eingesetzt. Sie senken die Coverage. Unterhalb der Mindestabdeckung
      gibt es keinen kuenstlich praezisen Score, sondern den Status
      INCOMPLETE.

   3. VERSIONIERUNG (§20). Jeder Score traegt methodologyVersion, asOf,
      coverage und dataSnapshotId. Eine Aenderung der Gewichte ist eine neue
      Methodikversion, keine stille Korrektur.

   Was der Score NICHT ist: eine Wahrscheinlichkeit. "Quality 94" heisst
   "besser als 94 % der Vergleichsgruppe", nicht "94 % Chance auf Kursgewinne".
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Norm = isNode ? require("./normalization.js") : global.VUNormalization;
  var Catalog = isNode ? require("./catalog.js") : global.VUCatalog;
  var Methodology = isNode ? require("./methodology.js") : global.VUMethodology;

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function round(v, d) {
    if (!isNum(v)) return null;
    var f = Math.pow(10, d === undefined ? 2 : d);
    return Math.round(v * f) / f;
  }

  /** Die im Composite tatsaechlich verwendeten Faktoren (Revisions ist in
      V1 als nicht verfuegbar konfiguriert und faellt hier automatisch raus). */
  function activeFactors(cfg) {
    return Object.keys(cfg.factorWeights).filter(function (id) {
      var f = cfg.factors[id];
      return f && f.available !== false && Object.keys(f.components).length > 0;
    });
  }

  /**
   * Normalisiert alle Faktorkomponenten ueber das gesamte Panel.
   * @returns {object} componentId -> Array (parallel zu rows)
   */
  function normalizeComponents(rows, cfg, options) {
    options = options || {};
    var out = Object.create(null);
    var groupKeys = {
      industry: function (r) { return r.industry; },
      sector: function (r) { return r.sector; }
    };

    activeFactors(cfg).forEach(function (factorId) {
      var components = cfg.factors[factorId].components;
      Object.keys(components).forEach(function (componentId) {
        if (out[componentId]) return;
        var field = Catalog.field(componentId);
        if (!field) throw new Error("Methodology references unknown field '" + componentId + "'");
        out[componentId] = Norm.peerNormalize(
          rows,
          function (r) { return r[componentId]; },
          cfg.normalization,
          groupKeys,
          field.higherIsBetter,
          { robustZ: options.robustZ !== false }
        );
      });
    });
    return out;
  }

  /**
   * Score fuer eine einzelne Security aus bereits normalisierten Komponenten.
   */
  function scoreSecurity(row, index, normalized, cfg, context) {
    var factors = activeFactors(cfg);
    var coverageCfg = cfg.coverage;

    var factorScores = {};
    var factorCoverage = {};
    var components = {};
    var peerGroups = {};

    factors.forEach(function (factorId) {
      var spec = cfg.factors[factorId].components;
      var entries = [];
      components[factorId] = {};

      Object.keys(spec).forEach(function (componentId) {
        var n = normalized[componentId][index];
        entries.push({ weight: spec[componentId], value: n.percentile });
        components[factorId][componentId] = {
          weight: spec[componentId],
          raw: n.raw,
          percentile: n.percentile,
          peerPercentile: n.peerPercentile,
          universePercentile: n.universePercentile,
          robustZ: n.robustZ,
          peerGroup: n.peerGroup,
          label: Catalog.field(componentId).label,
          unit: Catalog.field(componentId).unit,
          higherIsBetter: Catalog.field(componentId).higherIsBetter
        };
        if (n.peerGroup && !peerGroups[factorId]) peerGroups[factorId] = n.peerGroup;
      });

      var agg = Norm.weightedAverage(entries);
      factorCoverage[factorId] = round(agg.coverage, 4);
      /* Unter der Mindestabdeckung je Faktor gibt es keinen Faktorscore.
         Ein Quality-Score aus einer von sechs Komponenten waere kein
         Quality-Score. */
      factorScores[factorId] = agg.coverage >= coverageCfg.minComponentsPerFactor
        ? round(agg.value, 2) : null;
    });

    /* Effektive Gewichte: Gewichte nicht berechenbarer Faktoren werden auf
       die verbleibenden umgelegt — aber nur innerhalb einer festen Grenze. */
    var configured = cfg.factorWeights;
    var availableWeight = 0, droppedWeight = 0;
    factors.forEach(function (id) {
      if (factorScores[id] === null) droppedWeight += configured[id];
      else availableWeight += configured[id];
    });

    var effectiveWeights = {};
    var contributions = {};
    var composite = null;

    if (availableWeight > 0) {
      factors.forEach(function (id) {
        if (factorScores[id] === null) { effectiveWeights[id] = 0; contributions[id] = 0; return; }
        var w = configured[id] / availableWeight;
        effectiveWeights[id] = round(w, 6);
        contributions[id] = w * factorScores[id];
      });
      composite = factors.reduce(function (sum, id) { return sum + contributions[id]; }, 0);
    }

    /* Gesamtabdeckung: gewichtete Komponentenabdeckung ueber ALLE
       konfigurierten Faktoren — auch ueber die ausgefallenen. */
    var totalConfigured = factors.reduce(function (s, id) { return s + configured[id]; }, 0);
    var coverage = factors.reduce(function (s, id) {
      return s + configured[id] * (factorCoverage[id] || 0);
    }, 0) / (totalConfigured || 1);

    var status = "scored";
    var incompleteReasons = [];
    if (composite === null) {
      status = "incomplete";
      incompleteReasons.push("Kein Faktor konnte berechnet werden.");
    }
    if (coverage < coverageCfg.minTotalCoverage) {
      status = "incomplete";
      incompleteReasons.push("Datenabdeckung " + Math.round(coverage * 100) + " % liegt unter der Mindestabdeckung von " +
        Math.round(coverageCfg.minTotalCoverage * 100) + " %.");
    }
    if (droppedWeight > coverageCfg.maxFactorWeightRenormalization) {
      status = "incomplete";
      incompleteReasons.push("Faktoren mit zusammen " + Math.round(droppedWeight * 100) +
        " % Gewicht konnten nicht berechnet werden (Grenze: " +
        Math.round(coverageCfg.maxFactorWeightRenormalization * 100) + " %).");
    }

    var confidence = "insufficient";
    for (var i = 0; i < coverageCfg.confidenceBands.length; i++) {
      if (coverage >= coverageCfg.confidenceBands[i].min) { confidence = coverageCfg.confidenceBands[i].confidence; break; }
    }
    if (status === "incomplete") confidence = "insufficient";

    /* Der Composite wird auf eine Nachkommastelle gerundet; die Beitraege
       werden anschliessend proportional nachgezogen, damit die Summe der
       angezeigten Beitraege exakt dem angezeigten Score entspricht (§55). */
    var displayScore = composite === null ? null : round(composite, 1);
    var displayContributions = {};
    if (displayScore !== null && composite > 0) {
      var scale = displayScore / composite;
      var running = 0;
      var ids = factors.filter(function (id) { return contributions[id] > 0; });
      ids.forEach(function (id, k) {
        if (k === ids.length - 1) {
          displayContributions[id] = round(displayScore - running, 2);
        } else {
          var v = round(contributions[id] * scale, 2);
          displayContributions[id] = v;
          running = round(running + v, 2);
        }
      });
      factors.forEach(function (id) { if (!(id in displayContributions)) displayContributions[id] = 0; });
    } else {
      factors.forEach(function (id) { displayContributions[id] = 0; });
    }

    return {
      securityId: row.securityId,
      ticker: row.ticker,
      asOf: context.asOf,
      /* score (der VU Quant Score) wird erst im Panel gesetzt: er ist der
         Perzentilrang des Composite im Universum. Hier steht zunaechst der
         Composite selbst. */
      score: null,
      compositeScore: status === "incomplete" ? null : displayScore,
      rawComposite: composite === null ? null : round(composite, 4),
      status: status,
      incompleteReasons: incompleteReasons,
      coverage: round(coverage, 4),
      confidence: confidence,
      methodologyVersion: cfg.methodologyVersion,
      dataSnapshotId: context.dataSnapshotId || null,
      factorScores: factorScores,
      factorCoverage: factorCoverage,
      factorContributions: displayContributions,
      effectiveWeights: effectiveWeights,
      configuredWeights: configured,
      peerGroups: peerGroups,
      components: components,
      dataAsOfPeriodEnd: row._asOfPeriodEnd || null,
      dataAvailableAt: row._asOfAvailableAt || null,
      restatementStatus: row._restatementStatus || null
    };
  }

  /**
   * Scores fuer ein ganzes Panel.
   *
   * @param {object} input
   *   metricPanel  Ergebnis von factors.computeMetricPanel
   *   dataSnapshotId
   * @returns {{asOf, methodologyVersion, scores: Array, byId: object}}
   */
  function computeScorePanel(input) {
    var cfg = input.methodology || Methodology.quant();
    var rows = input.metricPanel.rows;
    var context = { asOf: input.metricPanel.asOf, dataSnapshotId: input.dataSnapshotId || null };

    var normalized = normalizeComponents(rows, cfg, { robustZ: input.robustZ !== false });
    var scores = rows.map(function (row, i) { return scoreSecurity(row, i, normalized, cfg, context); });

    /* Letzter Schritt der Pipeline (§17): Composite -> Universums-Perzentil
       -> VU Quant Score 0..100.
       Ein reiner gewichteter Mittelwert von fuenf Perzentilen zieht sich
       durch den zentralen Grenzwertsatz zur Mitte zusammen — der beste Titel
       eines Universums laege bei 78 statt bei 99. Der Perzentilschritt macht
       den Score wieder als Rang lesbar ("Top 5 %") und entspricht der
       regulatorisch bevorzugten Sprache (§81).
       Die Faktorbeitraege bleiben Beitraege zum COMPOSITE — sie summieren
       sich exakt zu compositeScore, nicht zum Perzentilrang. Beide Werte
       werden ausgewiesen, damit die Kette nachvollziehbar bleibt. */
    var compositeValues = scores.map(function (s) { return s.compositeScore; });
    var ranks = Norm.percentileRanks(compositeValues, true);
    scores.forEach(function (s, i) {
      s.score = (s.status === "incomplete" || ranks[i] === null) ? null : round(ranks[i], 1);
      s.universePercentile = s.score;
    });

    var byId = Object.create(null);
    scores.forEach(function (s) { byId[s.securityId] = s; });

    return {
      asOf: context.asOf,
      methodologyVersion: cfg.methodologyVersion,
      dataSnapshotId: context.dataSnapshotId,
      scores: scores,
      byId: byId,
      normalized: normalized
    };
  }

  /**
   * Verbindet Rohkennzahlen und Scores zu den Zeilen, auf denen der
   * Screener arbeitet. Genau diese Zeilen sieht auch die Strategy Engine —
   * eine Datenbasis, eine Filterlogik (§27).
   */
  function buildScreenerRows(metricPanel, scorePanel) {
    return metricPanel.rows.map(function (row, i) {
      var s = scorePanel.scores[i];
      var out = {};
      Object.keys(row).forEach(function (k) { if (k.charAt(0) !== "_") out[k] = row[k]; });

      out.quantScore = s.score;
      out.compositeScore = s.compositeScore;
      out.quantStatus = s.status;
      out.coverage = s.coverage;
      out.confidence = s.confidence;
      out.methodologyVersion = s.methodologyVersion;
      out.qualityScore = s.factorScores.quality;
      out.momentumScore = s.factorScores.momentum;
      out.valueScore = s.factorScores.value;
      out.growthScore = s.factorScores.growth;
      out.riskScore = s.factorScores.risk;

      /* Perzentile jeder Komponente stehen dem Screener direkt zur
         Verfuegung — "MOMENTUM_6M PCTL >= 80" braucht keine Neuberechnung. */
      out.percentiles = {};
      Object.keys(s.components).forEach(function (factorId) {
        Object.keys(s.components[factorId]).forEach(function (cid) {
          out.percentiles[cid] = s.components[factorId][cid].percentile;
        });
      });
      return out;
    });
  }

  /**
   * Perzentile fuer Felder, die keine Faktorkomponente sind (marketCap,
   * avgDollarVolume, dividendYield ...), damit auch dort PCTL-Filter
   * funktionieren.
   */
  function addAuxiliaryPercentiles(rows, cfg, options) {
    options = options || {};
    var only = options.fields ? options.fields : null;
    var groupKeys = {
      industry: function (r) { return r.industry; },
      sector: function (r) { return r.sector; }
    };
    Catalog.FIELD_LIST.forEach(function (field) {
      if (!field.percentileAvailable) return;
      /* Ein Backtest braucht nur die Perzentile, die seine Regeln
         tatsaechlich abfragen. Alle 20 Zusatzfelder an 250 Stichtagen zu
         normalisieren ist reine Verschwendung. */
      if (only && only.indexOf(field.id) === -1) return;
      if (rows.length && rows[0].percentiles && rows[0].percentiles[field.id] !== undefined) return;
      var norm = Norm.peerNormalize(rows, function (r) { return r[field.id]; },
        cfg.normalization, groupKeys, field.higherIsBetter, { robustZ: false });
      rows.forEach(function (r, i) {
        if (!r.percentiles) r.percentiles = {};
        if (r.percentiles[field.id] === undefined) r.percentiles[field.id] = norm[i].percentile;
      });
    });
    return rows;
  }

  /** Rating-Band eines Scores aus der zentralen Konfiguration. */
  function ratingFor(score, cfg) {
    return Methodology.bandFor((cfg || Methodology.quant()).ratingBands, score);
  }

  var api = {
    activeFactors: activeFactors,
    normalizeComponents: normalizeComponents,
    scoreSecurity: scoreSecurity,
    computeScorePanel: computeScorePanel,
    buildScreenerRows: buildScreenerRows,
    addAuxiliaryPercentiles: addAuxiliaryPercentiles,
    ratingFor: ratingFor
  };

  if (isNode) module.exports = api;
  else global.VUQuantScore = api;
})(typeof window !== "undefined" ? window : globalThis);
