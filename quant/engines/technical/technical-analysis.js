/* =========================================================================
   VISION UNIVERSE TECHNICAL — technical-analysis.js
   ORCHESTRATOR

   analyze(input)            → vollstaendiges Analyse-Bundle
   analyzeAsOf(input, cutoff) → dasselbe, aber die Serie wird VOR jeder
                                Berechnung kausal geschnitten (Walk-Forward)

   Das Bundle traegt Provenienz: dataCutoff, dataVersion, dataHash,
   engineBundleVersion, methodologyVersion, parametersHash. Kein Ergebnis
   ohne Herkunft. displayWindow und analysisLookback sind getrennt: die
   Analyse laeuft immer ueber die gesamte uebergebene Historie.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  function mod(name, key) { return isNode ? require(name) : global.VUTechnical[key]; }
  var Hash = isNode ? require("../hash.js") : global.VUHash;
  var Canonical = mod("./canonical-bars.js", "CanonicalBars");
  var Features = mod("./feature-store.js", "Features");
  var Pivots = mod("./pivot-engine.js", "Pivots");
  var Structure = mod("./market-structure.js", "Structure");
  var Trend = mod("./trend-engine.js", "Trend");
  var Momentum = mod("./momentum-engine.js", "Momentum");
  var RS = mod("./relative-strength-engine.js", "RelativeStrength");
  var Volatility = mod("./volatility-engine.js", "Volatility");
  var Volume = mod("./volume-engine.js", "Volume");
  var SR = mod("./support-resistance.js", "SupportResistance");
  var Fib = mod("./fibonacci.js", "Fibonacci");
  var Scenario = mod("./scenario-engine.js", "Scenario");
  var TradeSetup = mod("./trade-setup.js", "TradeSetup");
  var Confluence = mod("./confluence.js", "Confluence");
  var Score = mod("./technical-score.js", "Score");

  var ENGINE_BUNDLE_VERSION = "technical-bundle-1.0.0";

  /** Optionale Module (Annotationen, Elliott, Snapshot) — registrierbar, damit der Kern ohne sie laeuft. */
  var optional = { annotations: null, elliott: null };
  function registerOptional(name, module) { optional[name] = module; }

  function cfgOf(methodology, key, fallback) { return methodology && methodology.technical && methodology.technical[key] ? methodology.technical[key] : fallback; }

  /**
   * @param {object} input {
   *   series            CanonicalBarSeries (SPLIT_ADJUSTED, Foundation 1D)
   *   benchmarkSeries?  Serie der Benchmark
   *   sectorSeries?     Serie des Sektor-Benchmarks
   *   universeRank?     { percentile, universeId, n }
   *   methodology?      { technical: technical-v1.json, elliott: elliott-v1.json }
   *   options?          { elliott: bool, annotations: bool, includeChartSeries: bool, displayWindow, setupScaleId }
   * }
   */
  function analyze(input) {
    var series = input.series, opts = input.options || {}, meth = input.methodology || {};
    if (!series || !series.length) throw new Error("analyze: leere Serie");
    if (series.priceSeriesType !== "SPLIT_ADJUSTED") {
      throw new Error("Technical Intelligence rechnet ausschliesslich auf SPLIT_ADJUSTED (erhalten: " + series.priceSeriesType + ")");
    }
    var tcfg = meth.technical || {};
    var features = Features.computeFeatures(series, cfgOf(meth, "features", undefined));
    var pivotCfg = cfgOf(meth, "pivots", {});
    var pivots = Pivots.runPivots(series, features, { scales: pivotCfg.scales });
    var setupScaleId = opts.setupScaleId || pivotCfg.setupScaleId || "scale-2";
    var structure = Structure.analyzeStructure(series, features, pivots, { scaleId: setupScaleId, cfg: cfgOf(meth, "structure", undefined) });
    var trend = Trend.analyzeTrend(series, features, cfgOf(meth, "trend", undefined));
    var momentum = Momentum.analyzeMomentum(series, features, cfgOf(meth, "momentum", undefined));
    var rs = RS.analyzeRelativeStrength(series, input.benchmarkSeries || null, { sectorSeries: input.sectorSeries || null, universeRank: input.universeRank || null, cfg: cfgOf(meth, "relativeStrength", undefined) });
    var volatility = Volatility.analyzeVolatility(series, features, cfgOf(meth, "volatility", undefined));
    var volume = Volume.analyzeVolume(series, features, cfgOf(meth, "volume", undefined));
    var sr = SR.analyzeSupportResistance(series, features, pivots, cfgOf(meth, "supportResistance", undefined));
    var fib = Fib.analyzeFibonacci(series, features, pivots, cfgOf(meth, "fibonacci", undefined));
    var elliott = null;
    if (opts.elliott !== false && optional.elliott) {
      elliott = optional.elliott.analyzeElliott({ series: series, features: features, pivots: pivots, structure: structure, momentum: momentum, volume: volume, supportResistance: sr, methodology: meth.elliott || null });
    }
    var engines = { pivots: pivots, structure: structure, trend: trend, momentum: momentum, relativeStrength: rs, volatility: volatility, volume: volume, supportResistance: sr, fibonacci: fib, elliott: elliott };
    var scenarios = Scenario.buildScenarios({ series: series, features: features, engines: engines, cfg: cfgOf(meth, "scenario", undefined), setupScaleId: setupScaleId });
    var confluence = Confluence.computeConfluence(engines, scenarios.direction === "RANGE" ? "NEUTRAL" : scenarios.direction, cfgOf(meth, "confluence", undefined));
    /* Methodology Confidence des Primary = Confluence in seiner Richtung. */
    scenarios.scenarios.forEach(function (s) {
      var c = Confluence.computeConfluence(engines, s.direction === "NEUTRAL" || s.direction === "UNDETERMINED" ? "NEUTRAL" : s.direction, cfgOf(meth, "confluence", undefined));
      s.confidence = c.confluenceScore; s.confidenceComponents = { agreeing: c.agreeingFamilies, opposing: c.opposingFamilies, conflictPenalty: c.conflictPenalty, coverage: c.coverage };
    });
    var i = series.length - 1;
    var tradeSetup = TradeSetup.buildTradeSetup(scenarios.primary, { close: series.close[i], atr: features.columns.atr[i], averageVolume: features.columns.averageVolume[i], cfg: cfgOf(meth, "scenario", undefined) });
    var altSetup = scenarios.alternative ? TradeSetup.buildTradeSetup(scenarios.alternative, { close: series.close[i], atr: features.columns.atr[i], averageVolume: features.columns.averageVolume[i] }) : null;
    var score = Score.computeOpportunityScore({ confluence: confluence, scenarios: scenarios, tradeSetup: tradeSetup, engines: engines }, cfgOf(meth, "opportunityScore", undefined));

    var parametersHash = Hash.hashValue({
      bundle: ENGINE_BUNDLE_VERSION, features: features.parametersHash, pivots: pivots.parametersHash, structure: structure.parametersHash, trend: trend.parametersHash,
      momentum: momentum.parametersHash, rs: rs.parametersHash, volatility: volatility.parametersHash, volume: volume.parametersHash, sr: sr.parametersHash, fib: fib.parametersHash,
      confluence: confluence.parametersHash, score: score.parametersHash, elliott: elliott ? elliott.parametersHash : null, setupScaleId: setupScaleId
    });

    var bundle = {
      bundleVersion: ENGINE_BUNDLE_VERSION,
      instrumentId: series.instrumentId, exchange: series.exchange, currency: series.currency, timeframe: series.timeframe,
      analysisTime: series.timestamps[i], dataCutoff: series.timestamps[i], dataCutoffIndex: i,
      dataVersion: series.dataVersion, dataHash: series.dataHash, priceSeriesType: series.priceSeriesType, source: series.source,
      analysisLookback: { bars: series.length, from: series.timestamps[0], to: series.timestamps[i] },
      displayWindow: opts.displayWindow || "5Y",
      methodologyVersion: tcfg.methodologyVersion || "technical-v1.0.0", elliottMethodologyVersion: meth.elliott ? meth.elliott.methodologyVersion : null,
      parametersHash: parametersHash,
      engineVersions: { features: features.featureVersion, pivots: pivots.engineVersion, structure: structure.engineVersion, trend: trend.engineVersion, momentum: momentum.engineVersion,
                        relativeStrength: rs.engineVersion, volatility: volatility.engineVersion, volume: volume.engineVersion, supportResistance: sr.engineVersion, fibonacci: fib.engineVersion,
                        scenario: scenarios.engineVersion, tradeSetup: tradeSetup.engineVersion, confluence: confluence.engineVersion, score: score.scoreVersion, elliott: elliott ? elliott.engineVersion : null },
      repaintingPolicies: { pivots: pivots.repaintingPolicy, structure: structure.repaintingPolicy, supportResistance: sr.repaintingPolicy, fibonacci: fib.repaintingPolicy, elliott: elliott ? elliott.repaintingPolicy : null, trend: "NON_REPAINTING", momentum: "NON_REPAINTING", volatility: "NON_REPAINTING", volume: "NON_REPAINTING" },
      lastBar: { timestamp: series.timestamps[i], open: series.open[i], high: series.high[i], low: series.low[i], close: series.close[i], volume: series.volume[i] },
      featuresAtCutoff: features.at(i),
      pivots: pivots, structure: structure, trend: trend, momentum: momentum, relativeStrength: rs, volatility: volatility, volume: volume,
      supportResistance: sr, fibonacci: fib, elliott: elliott,
      confluence: confluence, scenarios: scenarios, tradeSetup: tradeSetup, alternativeSetup: altSetup, opportunityScore: score,
      annotations: null
    };
    if (opts.includeChartSeries) {
      bundle.chartSeries = { sma20: features.columns.sma20.map(nz), sma50: features.columns.sma50.map(nz), sma200: features.columns.sma200.map(nz),
                             atr: features.columns.atr.map(nz), rsi14: features.columns.rsi14.map(nz), relativeVolume: features.columns.relativeVolume.map(nz) };
    }
    if (opts.annotations !== false && optional.annotations) bundle.annotations = optional.annotations.buildAnnotations(bundle, { calendarDays: series.timestamps });
    return bundle;
  }
  function nz(v) { return Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null; }

  /** Walk-Forward: Analyse mit Datenstand cutoff (Index oder Timestamp). */
  function analyzeAsOf(input, cutoff) {
    var s = Canonical.slice(input.series, cutoff);
    if (!s.length) throw new Error("analyzeAsOf: Cutoff vor der ersten Bar");
    var cut = s.timestamps[s.length - 1];
    var next = Object.assign({}, input, { series: s });
    if (input.benchmarkSeries) next.benchmarkSeries = Canonical.slice(input.benchmarkSeries, cut);
    if (input.sectorSeries) next.sectorSeries = Canonical.slice(input.sectorSeries, cut);
    return analyze(next);
  }

  /** Kompakte Zusammenfassung — fuer Scanner, AI-Tools, Listen. */
  function summarize(b) {
    var p = b.scenarios.primary;
    return {
      instrumentId: b.instrumentId, analysisTime: b.analysisTime, dataCutoff: b.dataCutoff, dataVersion: b.dataVersion, parametersHash: b.parametersHash,
      close: b.lastBar.close, opportunityScore: b.opportunityScore.score, scoreBand: b.opportunityScore.band ? b.opportunityScore.band.label : null,
      trend: b.trend.direction, trendScore: b.trend.trendScore, structure: b.structure.state.regime, momentum: b.momentum.state,
      relativeStrength: b.relativeStrength.state, volatilityRegime: b.volatility.regime, volume: b.volume.state,
      primaryDirection: p ? p.direction : null, primaryTemplate: p ? p.template : null, primaryStatus: p ? p.status : null, confidence: p ? p.confidence : null,
      riskReward: b.tradeSetup.riskReward ? b.tradeSetup.riskReward.low : null, setupStatus: b.tradeSetup.status,
      elliott: b.elliott ? { status: b.elliott.status, currentWave: b.elliott.primaryCount ? b.elliott.primaryCount.currentWave : null, confidence: b.elliott.confidence } : null
    };
  }

  var api = { ENGINE_BUNDLE_VERSION: ENGINE_BUNDLE_VERSION, registerOptional: registerOptional, analyze: analyze, analyzeAsOf: analyzeAsOf, summarize: summarize };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Analysis = api; }
})(typeof window !== "undefined" ? window : globalThis);
