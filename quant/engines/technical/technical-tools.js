/* =========================================================================
   VISION UNIVERSE TECHNICAL — technical-tools.js
   AI TOOL CONTRACTS

   Die AI erklaert ausschliesslich strukturierte Engine-Outputs. Sie
   bestimmt keine Pivots, Wellen, Kursniveaus oder Scores. Diese Datei
   definiert Tool-Definitionen im Format von ai-tools.js und registriert
   sie auf einer bestehenden Tool-Registry (createToolRegistry) — die
   Sicherheitsgrenze bleibt dieselbe (nur registrierte Werkzeuge, keine
   freien Ausdruecke).

   Jede Zahl in einem Tool-Ergebnis stammt aus einem Bundle/Snapshot und
   traegt Provenienz (dataCutoff, dataVersion, engineVersions).
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Scanner = isNode ? require("./scanner.js") : global.VUTechnical.Scanner;

  var TOOLS_VERSION = "technical-tools-1.0.0";

  function toolDefinitions() {
    var sym = { symbol: { type: "string", required: true } };
    return [
      { name: "getTechnicalSnapshot", category: "technical", description: "Technischer Gesamtzustand eines Instruments: Score, Trend, Struktur, Momentum, RS, Volatilitaet, Volumen, Primary Scenario, Provenienz.", parameters: sym },
      { name: "getMarketStructure", category: "technical", description: "Marktstruktur (HH/HL/LH/LL, BOS, Range, Compression) auf der Setup-Skala.", parameters: sym },
      { name: "getTrendState", category: "technical", description: "Trendzustand mit Komponenten und Methodology Score (keine Wahrscheinlichkeit).", parameters: sym },
      { name: "getMomentumState", category: "technical", description: "Multi-Horizon-Momentum, Beschleunigung; RSI/MACD nur erklaerend.", parameters: sym },
      { name: "getSupportResistance", category: "technical", description: "Preiszonen (Support/Resistance) mit Staerke, Touches, Herkunft.", parameters: sym },
      { name: "getTechnicalScenarios", category: "technical", description: "PRIMARY / ALTERNATIVE / BEAR Szenarien mit Entry Zone, Invalidation, Target Zones, Evidence.", parameters: sym },
      { name: "getTradeSetup", category: "technical", description: "Trade Setup (Risk, Reward, RR als Range, Setup Quality) — nur wenn Entry + Invalidation + Target vorliegen.", parameters: sym },
      { name: "getElliottAnalysis", category: "technical", description: "Elliott Beta: Historical Wave Map, Primary/Alternative Count, Invalidation, Projection Zones, Method Fit.", parameters: sym },
      { name: "getChartAnnotations", category: "technical", description: "Renderer-neutrale Chart-Annotationen eines Layers.", parameters: { symbol: { type: "string", required: true }, layer: { type: "string", required: false } } },
      { name: "scanTechnicalSetups", category: "technical", description: "Universe-Scan mit strukturierten Filtern (Feld, Operator, Wert). Kein freier Ausdruck.", parameters: { filters: { type: "array", required: false }, limit: { type: "number", required: false } } },
      { name: "compareTechnicalSetups", category: "technical", description: "Vergleicht mehrere Instrumente anhand ihrer technischen Summaries.", parameters: { symbols: { type: "array", required: true } } },
      { name: "getTechnicalMethodology", category: "meta", description: "Versionierte Technical-/Elliott-Methodik (Gewichte, Schwellen, Regeln).", parameters: { id: { type: "string", required: false } } }
    ];
  }

  function provenance(b) {
    return { instrumentId: b.instrumentId, analysisTime: b.analysisTime, dataCutoff: b.dataCutoff, dataVersion: b.dataVersion, parametersHash: b.parametersHash,
             methodologyVersion: b.methodologyVersion, engineVersions: b.engineVersions, priceSeriesType: b.priceSeriesType, source: b.source };
  }
  function notFound(symbol) { return { found: false, symbol: symbol, reason: "Keine technische Analyse fuer " + symbol + " verfuegbar." }; }

  /**
   * Registriert die Tools auf einer Registry.
   * @param {object} registry  ai-tools.createToolRegistry(...)
   * @param {object} access    { getBundle(symbol) → Promise<bundle|null>, getScan() → Promise<scan|null>, getMethodology(id) }
   */
  function registerTechnicalTools(registry, access) {
    var defs = {};
    toolDefinitions().forEach(function (d) { defs[d.name] = d; });
    function withBundle(symbol, fn) {
      return Promise.resolve(access.getBundle(symbol)).then(function (b) { return b ? fn(b) : notFound(symbol); });
    }
    registry.register(defs.getTechnicalSnapshot, function (a) {
      return withBundle(a.symbol, function (b) {
        var p = b.scenarios.primary;
        return { found: true, provenance: provenance(b), close: b.lastBar.close, opportunityScore: b.opportunityScore, trend: { direction: b.trend.direction, score: b.trend.trendScore, components: b.trend.components },
                 structure: { regime: b.structure.state.regime, lastHighLabel: b.structure.state.lastHighLabel, lastLowLabel: b.structure.state.lastLowLabel },
                 momentum: { state: b.momentum.state, score: b.momentum.momentumScore, horizons: b.momentum.horizons }, relativeStrength: { state: b.relativeStrength.state, score: b.relativeStrength.rsScore },
                 volatility: { regime: b.volatility.regime, atrPct: b.volatility.metrics.atrPct, compression: b.volatility.compression }, volume: { state: b.volume.state },
                 primaryScenario: p ? { direction: p.direction, template: p.template, status: p.status, entryZone: p.entryZone, invalidation: p.invalidation, targetZones: p.targetZones, confidence: p.confidence, confidenceType: p.confidenceType, whatMustHappen: p.whatMustHappen } : null,
                 tradeSetup: b.tradeSetup, confluence: { score: b.confluence.confluenceScore, agreeing: b.confluence.agreeingFamilies, opposing: b.confluence.opposingFamilies } };
      });
    });
    registry.register(defs.getMarketStructure, function (a) { return withBundle(a.symbol, function (b) { return { found: true, provenance: provenance(b), scaleId: b.structure.scaleId, state: b.structure.state, swings: b.structure.swings.slice(-12), events: b.structure.events.slice(-12) }; }); });
    registry.register(defs.getTrendState, function (a) { return withBundle(a.symbol, function (b) { return { found: true, provenance: provenance(b), trend: b.trend }; }); });
    registry.register(defs.getMomentumState, function (a) { return withBundle(a.symbol, function (b) { return { found: true, provenance: provenance(b), momentum: b.momentum, relativeStrength: b.relativeStrength }; }); });
    registry.register(defs.getSupportResistance, function (a) { return withBundle(a.symbol, function (b) { return { found: true, provenance: provenance(b), zones: b.supportResistance.zones, nearestSupport: b.supportResistance.nearestSupport, nearestResistance: b.supportResistance.nearestResistance, periodLevels: b.supportResistance.periodLevels }; }); });
    registry.register(defs.getTechnicalScenarios, function (a) { return withBundle(a.symbol, function (b) { return { found: true, provenance: provenance(b), direction: b.scenarios.direction, scenarios: b.scenarios.scenarios }; }); });
    registry.register(defs.getTradeSetup, function (a) { return withBundle(a.symbol, function (b) { return { found: true, provenance: provenance(b), tradeSetup: b.tradeSetup, alternativeSetup: b.alternativeSetup }; }); });
    registry.register(defs.getElliottAnalysis, function (a) { return withBundle(a.symbol, function (b) { return { found: true, provenance: provenance(b), elliott: b.elliott || { status: "UNAVAILABLE", reason: "Elliott nicht berechnet" } }; }); });
    registry.register(defs.getChartAnnotations, function (a) { return withBundle(a.symbol, function (b) {
      if (!b.annotations) return { found: true, provenance: provenance(b), annotations: [] };
      var layer = a.layer || "AUTO";
      return { found: true, provenance: provenance(b), layer: layer, annotations: b.annotations.annotations.filter(function (x) { return x.layers.indexOf(layer) !== -1; }) };
    }); });
    registry.register(defs.scanTechnicalSetups, function (a) {
      var v = Scanner.validateFilter(a.filters || []);
      if (!v.valid) throw new Error("Ungueltige Filter: " + v.errors.join("; "));
      return Promise.resolve(access.getScan()).then(function (scan) { return scan ? Object.assign({ found: true, universeId: scan.universeId, asOf: scan.asOf, methodologyVersion: scan.methodologyVersion }, Scanner.applyFilters(scan, a.filters || [], a.limit || 25)) : { found: false, reason: "Kein Scan verfuegbar" }; });
    });
    registry.register(defs.compareTechnicalSetups, function (a) {
      return Promise.all(a.symbols.slice(0, 8).map(function (s) { return Promise.resolve(access.getBundle(s)).then(function (b) { return b ? { symbol: s, found: true, summary: (isNode ? require("./technical-analysis.js") : global.VUTechnical.Analysis).summarize(b), provenance: provenance(b) } : notFound(s); }); }))
        .then(function (rows) { return { rows: rows }; });
    });
    registry.register(defs.getTechnicalMethodology, function (a) { return Promise.resolve(access.getMethodology(a.id || "technical")); });
    return registry;
  }

  var api = { TOOLS_VERSION: TOOLS_VERSION, toolDefinitions: toolDefinitions, registerTechnicalTools: registerTechnicalTools, provenance: provenance };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Tools = api; }
})(typeof window !== "undefined" ? window : globalThis);
