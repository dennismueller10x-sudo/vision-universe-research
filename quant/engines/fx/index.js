/* =========================================================================
   VISION UNIVERSE — fx/index.js   (Currency Layer V1)

   Ein Einstieg fuer Node-Aufrufer. Im Browser laden die Seiten die
   Dateien einzeln und finden sie unter global.VUFx - deshalb gibt es
   hier keinen Bundler-Schritt und keine Modulaufloesung zur Laufzeit.

   Reihenfolge im Browser (Abhaengigkeiten zuerst):
     capabilities.js
     fx/fx-capability.js
     fx/fx-rates.js
     fx/fx-freshness.js
     fx/currency-registry.js
     fx/currency-class.js
     fx/currency-engine.js
     fx/money-format.js
     fx/currency-preference.js
     fx/currency-contract.js
     fx/fx-realtime-state.js
   ========================================================================= */
"use strict";

module.exports = {
  Capability:    require("./fx-capability.js"),
  Rates:         require("./fx-rates.js"),
  Freshness:     require("./fx-freshness.js"),
  Registry:      require("./currency-registry.js"),
  Class:         require("./currency-class.js"),
  Engine:        require("./currency-engine.js"),
  Format:        require("./money-format.js"),
  Preference:    require("./currency-preference.js"),
  Contract:      require("./currency-contract.js"),
  RealtimeState: require("./fx-realtime-state.js"),
  BROWSER_LOAD_ORDER: [
    "quant/engines/capabilities.js",
    "quant/engines/fx/fx-capability.js",
    "quant/engines/fx/fx-rates.js",
    "quant/engines/fx/fx-freshness.js",
    "quant/engines/fx/currency-registry.js",
    "quant/engines/fx/currency-class.js",
    "quant/engines/fx/currency-engine.js",
    "quant/engines/fx/money-format.js",
    "quant/engines/fx/currency-preference.js",
    "quant/engines/fx/currency-contract.js",
    "quant/engines/fx/fx-realtime-state.js"
  ]
};
