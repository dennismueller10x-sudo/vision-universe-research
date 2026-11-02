/* =========================================================================
   VISION UNIVERSE QUANT — BACKTEST KINDS (backtest-kinds-1.0.0)

   Kanonische Registry der sechs Backtest-Arten und der sieben
   Research-Methoden, mit einer expliziten Abbildung auf jede Taxonomie,
   die heute im Repository vorkommt. Keine Taxonomie wird geaendert; diese
   Datei uebersetzt nur.

     certification       quant/methodology/backtest-certification-v1.json#kinds
     readinessV2Id       scripts/quant/build-backtest-readiness.mjs kinds[].id (A–F)
     readinessV2Key      dieselben Eintraege, Feld key (F = MARKET_PATTERN_BACKTEST)
     evidenceStatus      scripts/quant/build-evidence-status.mjs kinds[].id
     researchArea        quant/engines/research-contract.cjs AREAS
     runResearchMethod   scripts/quant/run-research.cjs METHODS (CLI-Namen)
     researchStudyKind   quant/engines/research-studies.cjs finish(c, '<kind>', …)

   Jede fremde Kennung loest auf genau eines auf: eine Art (kind) ODER eine
   Methode (method). Unbekannte Kennungen werfen (fail-closed).
   ========================================================================= */
(function (global) {
  'use strict';
  var VERSION = 'backtest-kinds-1.0.0';
  var KINDS = Object.freeze(['SAME_STOCK_REPLAY', 'PATTERN_EVIDENCE', 'SIGNAL_BACKTEST', 'SETUP_BACKTEST', 'STRATEGY_BACKTEST', 'FACTOR_RANKING_BACKTEST']);
  var METHODS = Object.freeze(['MONTE_CARLO', 'WALK_FORWARD', 'OUT_OF_SAMPLE', 'MARKET_REGIME', 'PARAMETER_SENSITIVITY', 'EVENT_DRIVEN', 'PORTFOLIO_REBALANCING']);
  var K = function (kind) { return Object.freeze({ kind: kind, method: null }); };
  var M = function (method) { return Object.freeze({ kind: null, method: method }); };

  var TAXONOMIES = Object.freeze({
    certification: Object.freeze({
      source: 'quant/methodology/backtest-certification-v1.json#kinds',
      map: Object.freeze({ SAME_STOCK_REPLAY: K('SAME_STOCK_REPLAY'), PATTERN_EVIDENCE: K('PATTERN_EVIDENCE'), SIGNAL_BACKTEST: K('SIGNAL_BACKTEST'),
        SETUP_BACKTEST: K('SETUP_BACKTEST'), STRATEGY_BACKTEST: K('STRATEGY_BACKTEST'), FACTOR_RANKING_BACKTEST: K('FACTOR_RANKING_BACKTEST') })
    }),
    readinessV2Id: Object.freeze({
      source: 'scripts/quant/build-backtest-readiness.mjs kinds[].id (backtest-readiness-2.0.0)',
      map: Object.freeze({ A: K('SAME_STOCK_REPLAY'), B: K('SETUP_BACKTEST'), C: K('SIGNAL_BACKTEST'), D: K('STRATEGY_BACKTEST'), E: K('FACTOR_RANKING_BACKTEST'), F: K('PATTERN_EVIDENCE') })
    }),
    readinessV2Key: Object.freeze({
      source: 'scripts/quant/build-backtest-readiness.mjs kinds[].key (backtest-readiness-2.0.0)',
      map: Object.freeze({ SAME_STOCK_REPLAY: K('SAME_STOCK_REPLAY'), SETUP_BACKTEST: K('SETUP_BACKTEST'), SIGNAL_BACKTEST: K('SIGNAL_BACKTEST'),
        STRATEGY_BACKTEST: K('STRATEGY_BACKTEST'), FACTOR_RANKING_BACKTEST: K('FACTOR_RANKING_BACKTEST'),
        /* Readiness nennt die marktweite Musterstudie "Marktmuster-Backtest"; fachlich ist es dieselbe Art wie PATTERN_EVIDENCE. */
        MARKET_PATTERN_BACKTEST: K('PATTERN_EVIDENCE') })
    }),
    evidenceStatus: Object.freeze({
      /* Kein Eintrag fuer FACTOR_RANKING_BACKTEST: evidence-status-1.0.0 fuehrt diese Art nicht. */
      source: 'scripts/quant/build-evidence-status.mjs kinds[].id (evidence-status-1.0.0)',
      map: Object.freeze({ HISTORICAL_REPLAY: K('SAME_STOCK_REPLAY'), PATTERN_EVIDENCE: K('PATTERN_EVIDENCE'), STRATEGY_BACKTEST: K('STRATEGY_BACKTEST'),
        SETUP_BACKTEST: K('SETUP_BACKTEST'), SIGNAL_BACKTEST: K('SIGNAL_BACKTEST') })
    }),
    researchArea: Object.freeze({
      source: 'quant/engines/research-contract.cjs AREAS (quant-research-contract-1.0.0)',
      map: Object.freeze({ SAME_STOCK_REPLAY: K('SAME_STOCK_REPLAY'), PATTERN_EVIDENCE: K('PATTERN_EVIDENCE'), SIGNAL_BACKTEST: K('SIGNAL_BACKTEST'),
        SETUP_BACKTEST: K('SETUP_BACKTEST'), STRATEGY_BACKTEST: K('STRATEGY_BACKTEST'), FACTOR_RANKING_BACKTEST: K('FACTOR_RANKING_BACKTEST'),
        MONTE_CARLO: M('MONTE_CARLO'), WALK_FORWARD: M('WALK_FORWARD'), OUT_OF_SAMPLE: M('OUT_OF_SAMPLE'), MARKET_REGIME: M('MARKET_REGIME'),
        PARAMETER_SENSITIVITY: M('PARAMETER_SENSITIVITY'), EVENT_DRIVEN: M('EVENT_DRIVEN'), PORTFOLIO_REBALANCING: M('PORTFOLIO_REBALANCING') })
    }),
    runResearchMethod: Object.freeze({
      source: 'scripts/quant/run-research.cjs METHODS',
      map: Object.freeze({ replay: K('SAME_STOCK_REPLAY'), pattern: K('PATTERN_EVIDENCE'), signal: K('SIGNAL_BACKTEST'), setup: K('SETUP_BACKTEST'),
        strategy: K('STRATEGY_BACKTEST'), factor: K('FACTOR_RANKING_BACKTEST'),
        'monte-carlo': M('MONTE_CARLO'), 'walk-forward': M('WALK_FORWARD'), 'out-of-sample': M('OUT_OF_SAMPLE'), regime: M('MARKET_REGIME'),
        event: M('EVENT_DRIVEN'), rebalancing: M('PORTFOLIO_REBALANCING'), sensitivity: M('PARAMETER_SENSITIVITY') })
    }),
    researchStudyKind: Object.freeze({
      source: "quant/engines/research-studies.cjs finish(c, '<kind>', …)",
      map: Object.freeze({ SIGNAL_BACKTEST: K('SIGNAL_BACKTEST'), SAME_STOCK_REPLAY_RULE: K('SAME_STOCK_REPLAY'), PATTERN_EVIDENCE: K('PATTERN_EVIDENCE'),
        SETUP_BACKTEST: K('SETUP_BACKTEST'), FACTOR_RANKING_BACKTEST: K('FACTOR_RANKING_BACKTEST'), EVENT_DRIVEN: M('EVENT_DRIVEN') })
    })
  });

  function taxonomy(name) {
    if (!Object.prototype.hasOwnProperty.call(TAXONOMIES, name)) throw new Error('UNKNOWN_TAXONOMY:' + name);
    return TAXONOMIES[name];
  }
  /* Fremde Kennung -> { kind, method }. Wirft bei Unbekanntem. */
  function resolve(name, id) {
    var t = taxonomy(name);
    if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(t.map, id)) throw new Error('UNKNOWN_TAXONOMY_ID:' + name + ':' + id);
    return t.map[id];
  }
  function kindOf(name, id) { var r = resolve(name, id); if (!r.kind) throw new Error('TAXONOMY_ID_IS_A_METHOD:' + name + ':' + id); return r.kind; }
  /* Kanonische Art -> alle Kennungen einer Taxonomie (leer, wenn die Taxonomie die Art nicht fuehrt). */
  function idsFor(name, kindOrMethod) {
    if (KINDS.indexOf(kindOrMethod) < 0 && METHODS.indexOf(kindOrMethod) < 0) throw new Error('UNKNOWN_KIND_OR_METHOD:' + kindOrMethod);
    var t = taxonomy(name);
    return Object.keys(t.map).filter(function (id) { return t.map[id].kind === kindOrMethod || t.map[id].method === kindOrMethod; }).sort();
  }
  function isKind(x) { return KINDS.indexOf(x) >= 0; }
  function isMethod(x) { return METHODS.indexOf(x) >= 0; }
  /* Gesamttabelle: je Art die Kennungen aller Taxonomien. */
  function table() {
    return KINDS.concat(METHODS).map(function (x) {
      var row = { id: x, type: isKind(x) ? 'KIND' : 'METHOD' };
      Object.keys(TAXONOMIES).forEach(function (n) { row[n] = idsFor(n, x); });
      return row;
    });
  }

  var api = { VERSION: VERSION, KINDS: KINDS, METHODS: METHODS, TAXONOMIES: TAXONOMIES, resolve: resolve, kindOf: kindOf, idsFor: idsFor, isKind: isKind, isMethod: isMethod, table: table };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.VUBacktestKinds = api;
})(typeof window !== 'undefined' ? window : globalThis);
