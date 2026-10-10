/* =========================================================================
   VISION UNIVERSE TECHNICAL INTELLIGENCE — ti/engine.js
   ORCHESTRATOR → TechnicalAnalysisResult (schema vu-technical-analysis-2)

     MARKET DATA → prepare() [Features, Pivots — einmal, kausal]
                 → analyzeAt(t) [Trend, Momentum, Volatilitaet, Volumen,
                    Niveaus, Formationen, Wyckoff, Elliott V2]
                 → Scenario Engine [Konfluenz, Szenarien, Confidence]
                 → Evidence-Lookup [empirische Trefferquoten]
                 → strukturiertes Ergebnis → (Text/LLM nur erklaerend)

   Multi-Timeframe: der Tageschart ist der taktische Rahmen, der Wochen-
   chart (aus Tagesbars aggregiert) der uebergeordnete. Fuer Bar t zaehlt
   nur die letzte ABGESCHLOSSENE Woche — eine laufende Wochenbar wuerde
   High/Low/Schluss der restlichen Woche vorwegnehmen.
   Intraday: keine Intraday-Historie im Bestand (nur Tagessnapshots) →
   kein Ausfuehrungs-Zeitrahmen; ehrlich als UNAVAILABLE ausgewiesen.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  function mod(path, key) { return isNode ? require(path) : global.VUTechnical[key]; }
  var Ctx = mod("./context.js", "TIContext");
  var Dow = mod("./dow-trend.js", "TIDowTrend");
  var MV = mod("./momentum-volatility.js", "TIMomentumVolatility");
  var Vol = mod("./volume-intelligence.js", "TIVolume");
  var Lv = mod("./levels.js", "TILevels");
  var Pat = mod("./chart-patterns.js", "TIChartPatterns");
  var Wy = mod("./wyckoff.js", "TIWyckoff");
  var Sc = mod("./scenario.js", "TIScenario");
  var EV2 = isNode ? require("../elliott/elliott-v2.js") : global.VUTechnical.ElliottV2;
  var EV3 = isNode ? require("../elliott/elliott-v3.js") : (global.VUTechnical && global.VUTechnical.ElliottV3) || null;
  var Timeframe = isNode ? require("../timeframe.js") : global.VUTechnical.Timeframe;

  var SCHEMA_VERSION = "vu-technical-analysis-2.0.0";
  var BUNDLE_VERSION = "ti-bundle-2.0.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function r4(v) { return isNum(v) ? Math.round(v * 1e4) / 1e4 : null; }

  /**
   * Teure Vorberechnung. Bei Tagesdaten zusaetzlich die Wochensicht.
   * @param {object} series CanonicalBarSeries (SPLIT_ADJUSTED)
   */
  function prepare(series, opts) {
    opts = opts || {};
    if (!series || !series.length || !series.close || !series.close.length) throw new Error("Technical Intelligence: leere Kursreihe");
    if (series.priceSeriesType !== "SPLIT_ADJUSTED") throw new Error("Technical Intelligence rechnet ausschliesslich auf SPLIT_ADJUSTED (erhalten: " + series.priceSeriesType + ")");
    var daily = Ctx.prepare(series, opts);
    var weekly = null;
    if (series.timeframe === "1D" && opts.weekly !== false && series.length >= 260) {
      var w = Timeframe.aggregate(series, "1W", {});
      weekly = { prep: Ctx.prepare(w, opts), spans: w.meta.bucketSpans };
    }
    return { main: daily, weekly: weekly, opts: opts };
  }

  /** Letzte abgeschlossene Woche zum Tagesindex t. */
  function completedWeek(weekly, t) {
    if (!weekly) return -1;
    var sp = weekly.spans, lo = 0, hi = sp.length - 1, b = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (sp[mid][0] <= t) { b = mid; lo = mid + 1; } else hi = mid - 1; }
    if (b < 0) return -1;
    return sp[b][1] <= t && b === sp.length - 1 && weekly.closedLast ? b : b - 1;
  }

  /** Alle Engines auf einem Kontext. */
  function engines(ctx, meth, elliottPrevious) {
    meth = meth || {};
    var dow = Dow.analyze(ctx);
    var momentum = MV.analyzeMomentum(ctx, "scale-2");
    var volatility = MV.analyzeVolatility(ctx);
    var volume = Vol.analyze(ctx, "scale-3");
    var levels = { sr: Lv.supportResistance(ctx), fib: Lv.fibonacci(ctx) };
    var patterns = Pat.analyze(ctx, {});
    var wyckoff = Wy.analyze(ctx, {});
    /* Engine-Wahl ueber den Methodenvertrag (elliottEngine: "v2" | "v3"); v3 nur, wenn geladen. */
    var useV3 = meth.elliottEngine === "v3" && EV3;
    var elliott = useV3 ? EV3.analyzeElliottV3({ series: ctx.series, features: ctx.prep.features, pivots: ctx.prep.pivots, asOfIndex: ctx.t, methodology: meth, barsPerYear: ctx.profile.barsPerYear, previous: elliottPrevious || null })
                        : EV2.analyzeElliottV2({ series: ctx.series, features: ctx.prep.features, pivots: ctx.prep.pivots, asOfIndex: ctx.t, methodology: meth.elliottV2 || null, barsPerYear: ctx.profile.barsPerYear, previous: elliottPrevious || null });
    return { dow: dow, momentum: momentum, volatility: volatility, volume: volume, levels: levels, patterns: patterns, wyckoff: wyckoff, elliott: elliott };
  }

  function higherFrom(wk) {
    if (!wk) return { available: false, direction: 0 };
    var d = wk.dow.direction, m = wk.momentum.direction;
    return { available: d !== 0 || m !== 0, direction: Math.max(-1, Math.min(1, 0.7 * d + 0.3 * m)) };
  }

  /**
   * Ergebnis an Bar t.
   * @param {object} P   prepare()-Ergebnis
   * @param {number} [t] Bar-Index (Standard: letzte Bar)
   * @param {object} [o] { methodology, evidenceTable, calibration, symbol, includeChart, skipHigher }
   */
  function analyzeAt(P, t, o) {
    o = o || {};
    var t0 = Date.now();
    var ctx = Ctx.at(P.main, t);
    var meth = o.methodology || {};
    var E = engines(ctx, meth, o.elliottPrevious || null);
    var wk = null, wkCtx = null, wi = -1;
    if (P.weekly && !o.skipHigher) {
      wi = completedWeek(P.weekly, ctx.t);
      if (wi >= 60) { wkCtx = Ctx.at(P.weekly.prep, wi); wk = engines(wkCtx, meth); }
    }
    var higher = higherFrom(wk);
    var scenario = Sc.build(Object.assign({ ctx: ctx, higher: higher, evidenceTable: o.evidenceTable || null, calibration: o.calibration || null, timeframe: ctx.series.timeframe }, E), meth.scenario || null);
    var weeklyScenario = wk ? Sc.build(Object.assign({ ctx: wkCtx, higher: null, evidenceTable: o.weeklyEvidenceTable || null, timeframe: "1W" }, wk), meth.scenario || null) : null;
    var res = assemble(ctx, E, scenario, wkCtx, wk, weeklyScenario, o);
    res.diagnostics.computeMs = Date.now() - t0;
    return res;
  }

  function checklist(E, scenario) {
    var dir = scenario.confluence.direction, items = [];
    function add(family, list, available, reason) {
      if (!available) { items.push({ family: family, status: "UNAVAILABLE", statement: reason }); return; }
      (list || []).forEach(function (e) {
        var pol = e.polarity || 0;
        items.push({ family: family, status: dir === 0 || Math.abs(pol) < 0.1 ? "NEUTRAL" : pol * dir > 0 ? "SUPPORTS" : "CONTRADICTS", statement: e.statement, key: e.key });
      });
    }
    add("TREND", E.dow.evidence, true);
    add("MOMENTUM", E.momentum.evidence, E.momentum.state !== "UNDETERMINED", "Zu kurze Historie für Momentum");
    add("VOLUME", E.volume.evidence, E.volume.status === "OK", "Kein Volumen in dieser Kursreihe");
    add("PATTERN", E.patterns.evidence, true);
    add("WYCKOFF", E.wyckoff.evidence, true);
    add("VOLATILITY", E.volatility.evidence, true);
    var ep = E.elliott;
    if (ep && ep.primary) {
      /* Elliott = Kontext (vorab registrierte Entscheidung): beschreibt die Struktur, stimmt nicht ueber die Richtung ab. */
      items.push({ family: "ELLIOTT", status: "NEUTRAL", context: true,
                   statement: ep.applicability && ep.applicability.abstain ? "Die aktuelle Kursstruktur lässt keine verlässliche Elliott-Zählung zu" : ep.primary.patternName + ", aktuell Welle " + ep.primary.currentWave.label + " (Strukturbeschreibung, kein Prognosebeitrag)" });
    } else items.push({ family: "ELLIOTT", status: "UNAVAILABLE", statement: "Keine regelkonforme Wellenzählung" });
    return items;
  }

  function structureLabel(E, scenario) {
    var ph = E.dow.phase, d = E.dow.direction;
    if (E.wyckoff.status === "TRADING_RANGE" && scenario.outlook === "NEUTRAL") return "SIDEWAYS_RANGE";
    if (d > 0) return ph === "TREND_ADVANCING" ? "UPTREND_ADVANCING" : "CORRECTION_IN_UPTREND";
    if (d < 0) return ph === "TREND_ADVANCING" ? "DOWNTREND_ADVANCING" : "RALLY_IN_DOWNTREND";
    return "NO_CLEAR_TREND";
  }

  /** Alert-Zustand: alles, was ein spaeterer Vergleich zweier Snapshots braucht. */
  function alertState(ctx, scenario) {
    var p = scenario.primary;
    if (!p || !p.entryZone) return { scenarioId: p ? p.scenarioId : null, outlook: scenario.outlook, confidence: scenario.confidence.overall };
    var c = ctx.close;
    return {
      scenarioId: p.scenarioId, outlook: scenario.outlook, confidence: scenario.confidence.overall, direction: p.direction,
      levels: { entryLow: p.entryZone.zoneLow, entryHigh: p.entryZone.zoneHigh, invalidation: p.invalidation ? p.invalidation.price : null,
                confirmation: p.confirmation ? p.confirmation.price : null, target1: p.targets[0] ? [p.targets[0].zoneLow, p.targets[0].zoneHigh] : null },
      flags: { inEntryZone: c >= p.entryZone.zoneLow && c <= p.entryZone.zoneHigh,
               invalidated: p.invalidation ? (p.invalidation.direction === "below" ? c < p.invalidation.price : c > p.invalidation.price) : false,
               target1Reached: p.targets[0] ? (p.direction === "BULLISH" ? c >= p.targets[0].zoneLow : c <= p.targets[0].zoneHigh) : false,
               confirmed: p.confirmation && isNum(p.confirmation.price) ? (p.direction === "BULLISH" ? c > p.confirmation.price : c < p.confirmation.price) : false }
    };
  }

  function assemble(ctx, E, scenario, wkCtx, wk, wsc, o) {
    var s = ctx.series;
    var items = checklist(E, scenario);
    var why = items.filter(function (i) { return i.status === "SUPPORTS"; }).slice(0, 3).map(function (i) { return i.statement; });
    var against = items.filter(function (i) { return i.status === "CONTRADICTS"; }).map(function (i) { return i.statement; });
    var weekly = wk ? {
      asOf: wkCtx.time, outlook: wsc.outlook, trendPhase: wk.dow.phase, primaryTrend: wk.dow.primary.direction, stage: wk.dow.stage.stage,
      elliott: wk.elliott.primary ? { pattern: wk.elliott.primary.pattern, patternName: wk.elliott.primary.patternName, wave: wk.elliott.primary.currentWave.label, clarity: wk.elliott.clarityLevel } : null,
      primaryScenario: wsc.primary ? { direction: wsc.primary.direction, template: wsc.primary.template, invalidation: wsc.primary.invalidation, targets: wsc.primary.targets } : null
    } : null;
    var alignment = !weekly ? "UNAVAILABLE" : weekly.outlook === scenario.outlook ? "ALIGNED"
      : (weekly.outlook === "BULLISH" && scenario.outlook === "BEARISH") || (weekly.outlook === "BEARISH" && scenario.outlook === "BULLISH") ? "COUNTER_TREND" : "MIXED";
    return {
      schemaVersion: SCHEMA_VERSION, bundleVersion: BUNDLE_VERSION,
      symbol: o.symbol || s.instrumentId, timeframe: s.timeframe, asOf: ctx.time, asOfIndex: ctx.t, dataCutoff: ctx.time,
      price: { close: r4(ctx.close), atr: r4(ctx.atr), atrPct: r4(ctx.atr / ctx.close) },
      dataQuality: { bars: ctx.t + 1, stalePriceBars: scenario.dataStatus && scenario.dataStatus.stale ? scenario.dataStatus.flatBars : null, closeOnly: ctx.closeOnly, hasVolume: ctx.hasVolume, priceSeriesType: s.priceSeriesType, dataVersion: s.dataVersion, source: s.source },
      outlook: { label: scenario.outlook, structure: structureLabel(E, scenario), confidence: scenario.confidence.overall },
      regime: { volatility: E.volatility.regime, trendPhase: E.dow.phase, stage: E.dow.stage.stage },
      scenarios: scenario.scenarios, primaryScenario: scenario.primary, alternativeScenario: scenario.alternative, tailScenario: scenario.tail,
      confidence: scenario.confidence, confluence: scenario.confluence, signature: scenario.signature,
      evidence: { checklist: items, why: why, against: against },
      timeframes: { daily: { outlook: scenario.outlook }, weekly: weekly, intraday: { status: "UNAVAILABLE", reason: "Keine Intraday-Historie im Datenbestand" }, alignment: alignment },
      methods: { trend: E.dow, momentum: E.momentum, volatility: E.volatility, volume: E.volume, supportResistance: E.levels.sr, fibonacci: E.levels.fib, patterns: E.patterns, wyckoff: E.wyckoff, elliott: E.elliott },
      alerts: alertState(ctx, scenario),
      diagnostics: { engineVersions: { scenario: Sc.ENGINE_VERSION, elliott: E.elliott.engineVersion, dow: E.dow.engineVersion, momentum: E.momentum.engineVersion, volume: E.volume.engineVersion, levels: E.levels.sr.engineVersion, patterns: E.patterns.engineVersion, wyckoff: E.wyckoff.engineVersion },
                     repaintingPolicy: "Alle TI-Engines lesen nur Bars <= asOf und nur bestätigte Pivots; Szenarien gelten je Snapshot.", isProbability: scenario.isProbability }
    };
  }

  function analyze(series, o) {
    var P = prepare(series, o || {});
    return analyzeAt(P, series.length - 1, o);
  }

  var api = { SCHEMA_VERSION: SCHEMA_VERSION, BUNDLE_VERSION: BUNDLE_VERSION, prepare: prepare, analyzeAt: analyzeAt, analyze: analyze, engines: engines, completedWeek: completedWeek };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.TIEngine = api; }
})(typeof window !== "undefined" ? window : globalThis);
