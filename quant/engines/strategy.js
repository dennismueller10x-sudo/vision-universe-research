/* =========================================================================
   VISION UNIVERSE QUANT — strategy.js
   STRATEGY SCHEMA, VALIDIERUNG, VERSIONIERUNG, LINEAGE (§31–34, §62, §74)

   Eine Strategie ist eine vollstaendige, versionierte, unveraenderliche
   Regelbeschreibung. Der manuelle Strategy Builder und die AI erzeugen
   exakt dasselbe Objekt — es gibt nur eine Strategy Engine (§62).

   Unveraenderlichkeit (§32): Eine Aenderung ueberschreibt V1 nicht, sie
   erzeugt V2 mit parentVersion, changeReason und eigenem definitionHash.
   Damit bleibt jede historische Backtest-Aussage nachvollziehbar und die
   Strategy Lineage (§33) entsteht als Nebenprodukt statt als Extra-Feature.

   POST /v1/backtests akzeptiert niemals natuerliche Sprache (§74) —
   ausschliesslich ein Objekt, das validate() hier bestanden hat.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Catalog = isNode ? require("./catalog.js") : global.VUCatalog;
  var Query = isNode ? require("./query.js") : global.VUQuery;
  var Hash = isNode ? require("./hash.js") : global.VUHash;
  var Methodology = isNode ? require("./methodology.js") : global.VUMethodology;

  var STRATEGY_SCHEMA_VERSION = "1.0";
  var WEIGHTINGS = ["equal", "score", "volatility"];
  var RANKABLE_FACTORS = ["quality", "momentum", "value", "growth", "risk"];
  var ORIGINS = ["library", "builder", "ai"];

  // ---------------------------------------------------------------------
  // Defaults aus der zentralen Methodik — keine Magic Numbers hier.
  // ---------------------------------------------------------------------
  function defaults() {
    var bt = Methodology.backtest();
    return {
      schemaVersion: STRATEGY_SCHEMA_VERSION,
      universe: { universeId: "US_EQUITIES", region: "US", assetType: "equity" },
      filters: [],
      ranking: { factors: [{ factor: "quality", weight: 0.5 }, { factor: "momentum", weight: 0.5 }] },
      portfolio: {
        positions: 25,
        weighting: "equal",
        maxPositionWeight: bt.constraints.defaultMaxPositionWeight,
        maxSectorWeight: bt.constraints.defaultMaxSectorWeight,
        minDollarVolumeM: bt.constraints.defaultMinDollarVolumeM,
        minMarketCapM: bt.constraints.defaultMinMarketCapM
      },
      rebalance: bt.rebalance.default,
      execution: {
        timing: bt.execution.defaultTiming,
        transactionCostsBps: bt.costs.defaultTransactionCostsBps,
        slippageBps: bt.costs.defaultSlippageBps
      }
    };
  }

  function createDefinition(partial) {
    var d = defaults();
    partial = partial || {};
    return {
      schemaVersion: partial.schemaVersion || d.schemaVersion,
      universe: Object.assign({}, d.universe, partial.universe || {}),
      filters: (partial.filters || d.filters).map(function (f) {
        return { field: f.field, operator: f.operator, value: f.value, scale: f.scale || "raw" };
      }),
      ranking: {
        factors: ((partial.ranking && partial.ranking.factors) || d.ranking.factors).map(function (r) {
          return { factor: r.factor, weight: r.weight };
        })
      },
      portfolio: Object.assign({}, d.portfolio, partial.portfolio || {}),
      rebalance: partial.rebalance || d.rebalance,
      execution: Object.assign({}, d.execution, partial.execution || {})
    };
  }

  // ---------------------------------------------------------------------
  // Validierung
  // ---------------------------------------------------------------------
  function validate(def) {
    var errors = [];
    var warnings = [];
    var bt = Methodology.backtest();
    var quantCfg = Methodology.quant();

    function err(m) { errors.push(m); }

    if (!def || typeof def !== "object" || Array.isArray(def)) {
      return { valid: false, errors: ["strategy definition must be an object"], warnings: [] };
    }
    if (def.schemaVersion !== STRATEGY_SCHEMA_VERSION) {
      err("schemaVersion: expected '" + STRATEGY_SCHEMA_VERSION + "', got " + JSON.stringify(def.schemaVersion));
    }

    /* Universe — identische Regeln wie im Screener. */
    if (!def.universe || !Query.UNIVERSES[def.universe.universeId]) {
      err("universe.universeId: unknown universe " + JSON.stringify(def.universe && def.universe.universeId));
    }

    /* Filter — bewusst ueber denselben Validator wie der Screener (§27). */
    if (!Array.isArray(def.filters)) {
      err("filters: must be an array");
    } else {
      var probe = Query.createQuery({
        universe: def.universe, filters: def.filters,
        sort: [{ field: "quantScore", direction: "desc" }], limit: 25
      });
      var qv = Query.validate(probe);
      qv.errors.forEach(function (m) {
        if (m.indexOf("filters") === 0) err(m);
      });
      qv.warnings.forEach(function (m) { warnings.push(m); });
    }

    /* Ranking */
    var r = def.ranking;
    if (!r || !Array.isArray(r.factors) || r.factors.length === 0) {
      err("ranking.factors: at least one ranking factor is required");
    } else {
      var sum = 0;
      var seen = Object.create(null);
      r.factors.forEach(function (rf, i) {
        var p = "ranking.factors[" + i + "]";
        if (RANKABLE_FACTORS.indexOf(rf.factor) === -1) {
          /* Revisions existiert im Schema, ist aber ohne lizenzierte
             PIT-Estimates nicht verfuegbar (§16) und darf keine Strategie
             tragen, die anschliessend historisch getestet wird. */
          var factorCfg = quantCfg.factors[rf.factor];
          if (factorCfg && factorCfg.available === false) {
            err(p + ".factor: '" + rf.factor + "' is not available — " + factorCfg.unavailableReason);
          } else {
            err(p + ".factor: unknown factor '" + rf.factor + "'");
          }
          return;
        }
        if (seen[rf.factor]) err(p + ".factor: duplicate factor '" + rf.factor + "'");
        seen[rf.factor] = true;
        if (typeof rf.weight !== "number" || !Number.isFinite(rf.weight)) {
          err(p + ".weight: must be a number");
          return;
        }
        if (rf.weight <= 0 || rf.weight > 1) err(p + ".weight: must be greater than 0 and at most 1");
        sum += rf.weight;
      });
      if (errors.length === 0 && Math.abs(sum - 1) > 0.005) {
        err("ranking.factors: weights must sum to 1.0 (got " + sum.toFixed(3) + ")");
      }
    }

    /* Portfolio */
    var p = def.portfolio;
    if (!p || typeof p !== "object") {
      err("portfolio: required object");
    } else {
      var c = bt.constraints;
      if (!Number.isInteger(p.positions)) err("portfolio.positions: must be an integer");
      else if (p.positions < c.minPositions || p.positions > c.maxPositions) {
        err("portfolio.positions: must be between " + c.minPositions + " and " + c.maxPositions);
      }
      if (WEIGHTINGS.indexOf(p.weighting) === -1) err("portfolio.weighting: must be one of " + WEIGHTINGS.join(", "));
      numberInRange(p.maxPositionWeight, 0.005, 1, "portfolio.maxPositionWeight", err);
      numberInRange(p.maxSectorWeight, 0.05, 1, "portfolio.maxSectorWeight", err);
      numberInRange(p.minDollarVolumeM, 0, 1000, "portfolio.minDollarVolumeM", err);
      numberInRange(p.minMarketCapM, 0, 1000000, "portfolio.minMarketCapM", err);

      /* Semantische Pruefung: die Positionszahl muss mit der maximalen
         Einzelgewichtung ueberhaupt erreichbar sein. */
      if (Number.isInteger(p.positions) && Number.isFinite(p.maxPositionWeight)) {
        if (p.positions * p.maxPositionWeight < 0.999) {
          err("portfolio: " + p.positions + " positions at max weight " +
              (p.maxPositionWeight * 100).toFixed(1) + " % cannot reach 100 % invested");
        }
      }
      if (Number.isFinite(p.maxSectorWeight) && Number.isFinite(p.maxPositionWeight) &&
          p.maxSectorWeight < p.maxPositionWeight) {
        err("portfolio: maxSectorWeight must not be smaller than maxPositionWeight");
      }
    }

    /* Rebalance */
    if (bt.rebalance.allowed.indexOf(def.rebalance) === -1) {
      err("rebalance: must be one of " + bt.rebalance.allowed.join(", ") + " — " + bt.rebalance.note);
    }

    /* Execution */
    var x = def.execution;
    if (!x || typeof x !== "object") {
      err("execution: required object");
    } else {
      if (bt.execution.allowedTimings.indexOf(x.timing) === -1) {
        err("execution.timing: must be one of " + bt.execution.allowedTimings.join(", "));
      }
      numberInRange(x.transactionCostsBps, 0, bt.costs.maxTransactionCostsBps, "execution.transactionCostsBps", err);
      numberInRange(x.slippageBps, 0, bt.costs.maxSlippageBps, "execution.slippageBps", err);
      if (x.transactionCostsBps === 0 && x.slippageBps === 0) {
        warnings.push("execution: a backtest without any costs overstates realistic results and is capped by the Trust Score.");
      }
    }

    /* Unbekannte Top-Level-Felder ablehnen — sonst wandern stillschweigend
       Vendor- oder Ad-hoc-Felder in gespeicherte Strategien. */
    var allowed = ["schemaVersion", "universe", "filters", "ranking", "portfolio", "rebalance", "execution"];
    Object.keys(def).forEach(function (k) {
      if (allowed.indexOf(k) === -1) err("unknown field '" + k + "' in strategy definition");
    });

    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  }

  function numberInRange(v, lo, hi, path, err) {
    if (typeof v !== "number" || !Number.isFinite(v)) { err(path + ": must be a number"); return; }
    if (v < lo || v > hi) err(path + ": must be between " + lo + " and " + hi);
  }

  function assertValid(def) {
    var res = validate(def);
    if (!res.valid) {
      var e = new Error("Invalid strategy definition: " + res.errors.join("; "));
      e.validation = res;
      throw e;
    }
    return def;
  }

  function definitionHash(def) { return Hash.prefixedHash("sdef", def); }

  // ---------------------------------------------------------------------
  // Versionierung und Lineage
  // ---------------------------------------------------------------------

  /** Erzeugt eine neue Strategie mit unveraenderlicher Version 1. */
  function createStrategy(fields) {
    var def = assertValid(createDefinition(fields.definition));
    var createdAt = fields.createdAt || new Date().toISOString();
    var strategyId = fields.strategyId || Hash.prefixedHash("strat", { name: fields.name, def: def, createdAt: createdAt });
    if (ORIGINS.indexOf(fields.origin) === -1) throw new Error("strategy origin must be one of " + ORIGINS.join(", "));

    return {
      strategy: {
        strategyId: strategyId,
        name: fields.name,
        thesis: fields.thesis || "",
        origin: fields.origin,
        createdAt: createdAt,
        latestVersion: 1
      },
      versions: [{
        strategyId: strategyId,
        version: 1,
        parentVersion: null,
        changeReason: fields.changeReason || "Initiale Version",
        createdAt: createdAt,
        definitionHash: definitionHash(def),
        definition: def
      }]
    };
  }

  /**
   * Erzeugt eine neue, unveraenderliche Version. Die Vorversion bleibt
   * unangetastet — sie wird nirgends mutiert (§32).
   */
  function addVersion(record, newDefinition, changeReason, options) {
    options = options || {};
    var def = assertValid(createDefinition(newDefinition));
    var parent = options.parentVersion || record.strategy.latestVersion;
    var parentEntry = record.versions.filter(function (v) { return v.version === parent; })[0];
    if (!parentEntry) throw new Error("parent version " + parent + " does not exist");

    if (parentEntry.definitionHash === definitionHash(def)) {
      throw new Error("New version is identical to version " + parent + " — no version created.");
    }
    if (!changeReason || !String(changeReason).trim()) {
      throw new Error("changeReason is required: every strategy version must state why it exists.");
    }

    var nextVersion = record.versions.reduce(function (m, v) { return Math.max(m, v.version); }, 0) + 1;
    var entry = {
      strategyId: record.strategy.strategyId,
      version: nextVersion,
      parentVersion: parent,
      changeReason: String(changeReason).trim(),
      createdAt: options.createdAt || new Date().toISOString(),
      definitionHash: definitionHash(def),
      definition: def
    };

    return {
      strategy: Object.assign({}, record.strategy, { latestVersion: nextVersion }),
      versions: record.versions.concat([entry])
    };
  }

  function getVersion(record, version) {
    var v = version || record.strategy.latestVersion;
    var entry = record.versions.filter(function (e) { return e.version === v; })[0];
    if (!entry) throw new Error("version " + v + " not found for strategy " + record.strategy.strategyId);
    return entry;
  }

  /** Lineage-Baum fuer die UI (§33). */
  function lineage(record) {
    var byParent = Object.create(null);
    record.versions.forEach(function (v) {
      var key = v.parentVersion === null ? "root" : String(v.parentVersion);
      (byParent[key] || (byParent[key] = [])).push(v);
    });
    function build(v) {
      return {
        version: v.version,
        changeReason: v.changeReason,
        createdAt: v.createdAt,
        definitionHash: v.definitionHash,
        children: (byParent[String(v.version)] || [])
          .sort(function (a, b) { return a.version - b.version; })
          .map(build)
      };
    }
    return (byParent.root || []).map(build);
  }

  /** Feldweise Unterschiede zweier Versionen — Basis fuer V1-vs-V2-Vergleich. */
  function diff(defA, defB) {
    var out = [];
    function walk(a, b, path) {
      var keys = Object.keys(Object.assign({}, a || {}, b || {}));
      keys.forEach(function (k) {
        var av = a ? a[k] : undefined;
        var bv = b ? b[k] : undefined;
        var p = path ? path + "." + k : k;
        var aObj = av && typeof av === "object" && !Array.isArray(av);
        var bObj = bv && typeof bv === "object" && !Array.isArray(bv);
        if (aObj || bObj) { walk(av, bv, p); return; }
        if (Hash.canonical(av) !== Hash.canonical(bv)) out.push({ path: p, from: av, to: bv });
      });
    }
    walk(defA, defB, "");
    return out;
  }

  /** Menschenlesbare Zusammenfassung — UI, AI-Bestaetigung und Doku teilen sie. */
  function describe(def) {
    return {
      universe: (Query.UNIVERSES[def.universe.universeId] || {}).label || def.universe.universeId,
      filters: def.filters.map(Query.describeFilter),
      ranking: def.ranking.factors.map(function (r) {
        var f = Methodology.quant().factors[r.factor];
        return (f ? f.label : r.factor) + " " + Math.round(r.weight * 100) + " %";
      }),
      positions: def.portfolio.positions,
      weighting: { equal: "Gleichgewichtet", score: "Score-gewichtet", volatility: "Volatilitaetsadjustiert" }[def.portfolio.weighting],
      maxPositionWeight: Math.round(def.portfolio.maxPositionWeight * 1000) / 10 + " %",
      maxSectorWeight: Math.round(def.portfolio.maxSectorWeight * 1000) / 10 + " %",
      rebalance: { monthly: "Monatlich", quarterly: "Quartalsweise" }[def.rebalance],
      execution: (def.execution.timing === "next_open" ? "Naechste Eroeffnung (T+1)" : "Naechster Schluss (T+1)") +
                 ", " + def.execution.transactionCostsBps + " bps Kosten, " + def.execution.slippageBps + " bps Slippage"
    };
  }

  /** Die fuenf Bibliotheksstrategien aus der zentralen Methodik (§34). */
  function libraryStrategies() {
    var cfg = Methodology.strategies();
    return cfg.strategies.map(function (s) {
      var record = createStrategy({
        strategyId: s.strategyId,
        name: s.name,
        thesis: s.thesis,
        origin: "library",
        definition: s.definition,
        changeReason: "Bibliotheksstrategie V1",
        createdAt: cfg.createdAt || "2026-09-06T00:00:00Z"
      });
      record.strategy.mainRisk = s.mainRisk;
      return record;
    });
  }

  var api = {
    STRATEGY_SCHEMA_VERSION: STRATEGY_SCHEMA_VERSION,
    WEIGHTINGS: WEIGHTINGS,
    RANKABLE_FACTORS: RANKABLE_FACTORS,
    ORIGINS: ORIGINS,
    defaults: defaults,
    createDefinition: createDefinition,
    validate: validate,
    assertValid: assertValid,
    definitionHash: definitionHash,
    createStrategy: createStrategy,
    addVersion: addVersion,
    getVersion: getVersion,
    lineage: lineage,
    diff: diff,
    describe: describe,
    libraryStrategies: libraryStrategies
  };

  if (isNode) module.exports = api;
  else global.VUStrategy = api;
})(typeof window !== "undefined" ? window : globalThis);
