/* =========================================================================
   VISION UNIVERSE QUANT — methodology.js
   METHODOLOGY REGISTRY (§19, §20, §72)

   Alle Methodikparameter liegen zentral und versioniert in
   quant/methodology/*.json. Keine verstreuten Zahlenwerte, keine Magic
   Numbers in Engine oder UI. Wer eine Gewichtung aendert, aendert die JSON
   und vergibt eine neue methodologyVersion — nicht eine Zahl im Code.

   Laden: in Node direkt per require, im Browser ueber configure() mit den
   von shell.js einmalig geladenen JSON-Dateien. Beide Wege fuehren zum
   identischen Objekt, es gibt nur eine Quelle.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var store = Object.create(null);

  if (isNode) {
    store.quant = require("../methodology/quant-v1.json");
    store.backtest = require("../methodology/backtest-v1.json");
    store.trustScore = require("../methodology/trust-score-v1.json");
    store.strategies = require("../methodology/strategies-v1.json");
  }

  /** Browser-Einstieg: shell.js laedt die JSON-Dateien und injiziert sie. */
  function configure(configs) {
    Object.keys(configs || {}).forEach(function (k) { store[k] = configs[k]; });
    return store;
  }

  function get(name) {
    var cfg = store[name];
    if (!cfg) {
      throw new Error("Methodology '" + name + "' not loaded. Call Methodology.configure() first.");
    }
    return cfg;
  }

  function quant()      { return get("quant"); }
  function backtest()   { return get("backtest"); }
  function trustScore() { return get("trustScore"); }
  function strategies() { return get("strategies"); }
  function isLoaded()   { return !!(store.quant && store.backtest && store.trustScore && store.strategies); }

  /** Alle geladenen Methodiken als Liste — speist GET /v1/methodologies. */
  function list() {
    return Object.keys(store).map(function (k) {
      return {
        id: k,
        methodologyVersion: store[k].methodologyVersion,
        label: store[k].label || k,
        config: store[k]
      };
    });
  }

  /** Rating-Band eines Scores gemaess zentraler Konfiguration. */
  function bandFor(bands, score) {
    if (score === null || !Number.isFinite(score)) return null;
    for (var i = 0; i < bands.length; i++) {
      if (score >= bands[i].min) return bands[i];
    }
    return bands[bands.length - 1] || null;
  }

  var api = {
    configure: configure,
    get: get,
    quant: quant,
    backtest: backtest,
    trustScore: trustScore,
    strategies: strategies,
    isLoaded: isLoaded,
    list: list,
    bandFor: bandFor,
    /** Dateinamen, die der Browser laden muss. Eine Liste, ein Ort. */
    FILES: {
      quant: "quant-v1.json",
      backtest: "backtest-v1.json",
      trustScore: "trust-score-v1.json",
      strategies: "strategies-v1.json"
    }
  };

  if (isNode) module.exports = api;
  else global.VUMethodology = api;
})(typeof window !== "undefined" ? window : globalThis);
