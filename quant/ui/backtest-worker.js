/* =========================================================================
   VISION UNIVERSE QUANT — ui/backtest-worker.js

   Fuehrt Backtests ausserhalb des Hauptthreads aus.

   Ein 20-Jahres-Lauf mit monatlichem Rebalancing berechnet 250 vollstaendige
   Faktor- und Score-Panels ueber rund 480 Titel — etwa 20 Sekunden Rechenzeit
   und 20 MB fuer die Preisreihen. Im Hauptthread waere die Seite in dieser
   Zeit vollstaendig eingefroren.

   Die Engines sind bewusst als UMD-Module geschrieben (globalThis statt
   window), deshalb laufen sie hier per importScripts unveraendert.
   ========================================================================= */
/* eslint-env worker */
"use strict";

var BASE = "/quant/";

importScripts(
  BASE + "engines/hash.js",
  BASE + "engines/schema.js",
  BASE + "engines/catalog.js",
  BASE + "engines/provider.js",
  BASE + "engines/methodology.js",
  BASE + "engines/normalization.js",
  BASE + "engines/query.js",
  BASE + "engines/strategy.js",
  BASE + "engines/factors.js",
  BASE + "engines/quant-score.js",
  BASE + "engines/mock-generator.js",
  BASE + "engines/mock-provider.js",
  BASE + "engines/backtest.js",
  BASE + "engines/trust-score.js"
);

var state = { provider: null, dataSnapshotId: null };

/**
 * Laedt die Methodikdateien.
 *
 * Synchron, weil der Worker damit nur sich selbst blockiert und der
 * gesamte Lauf ohnehin nicht ohne diese Dateien beginnen kann.
 *
 * Mit Wiederholung, weil ein einzelner verlorener Abruf sonst den ganzen
 * Backtest mit einer Meldung abbricht, die nach einem Rechenfehler klingt
 * ("Methodik nicht ladbar") statt nach dem, was es war: ein Netzhaenger.
 * Dieselbe Ueberlegung wie bei loadJSON im Hauptthread — nur war der Worker
 * dort zunaechst uebersehen worden.
 *
 * Ein 404 wird nicht wiederholt: eine fehlende Datei kommt nicht zurueck.
 */
function loadFile(path, attempts) {
  var lastError = null;
  for (var i = 0; i < attempts; i++) {
    var req = new XMLHttpRequest();
    req.open("GET", path, false);
    try {
      req.send(null);
    } catch (err) {
      lastError = new Error("Methodik " + path + " nicht erreichbar: " + ((err && err.message) || err));
      continue;
    }
    /* status 0 gilt bei file:// und bei manchen Worker-Kontexten als Erfolg. */
    if (req.status === 200 || req.status === 0) {
      try {
        return JSON.parse(req.responseText);
      } catch (err) {
        /* Kein JSON: fast immer eine Fehlerseite. Wiederholen hilft nicht. */
        throw new Error("Methodik " + path + " ist kein gueltiges JSON.");
      }
    }
    if (req.status >= 400 && req.status < 500 && req.status !== 408 && req.status !== 429) {
      throw new Error("Methodik " + path + " nicht gefunden (HTTP " + req.status + ").");
    }
    lastError = new Error("Methodik " + path + " nicht ladbar (HTTP " + req.status + ")");
  }
  throw lastError;
}

function loadMethodology() {
  var files = self.VUMethodology.FILES;
  var configs = {};
  Object.keys(files).forEach(function (key) {
    configs[key] = loadFile(BASE + "methodology/" + files[key], 3);
  });
  self.VUMethodology.configure(configs);
}

function ensureProvider() {
  if (state.provider) return state.provider;
  postMessage({ type: "progress", fraction: 0.02, label: "Modelluniversum wird erzeugt …" });
  var dataset = self.VUMockGenerator.generateDataset();
  state.dataSnapshotId = dataset.meta.dataSnapshotId;
  state.provider = self.VUMockProvider.createMockProvider({ dataset: dataset });
  return state.provider;
}

self.onmessage = function (event) {
  var msg = event.data;
  if (msg.type !== "run") return;
  try {
    if (!self.VUMethodology.isLoaded()) loadMethodology();
    var provider = ensureProvider();

    var result = self.VUBacktest.runBacktest({
      definition: msg.definition,
      strategyId: msg.strategyId,
      strategyVersion: msg.strategyVersion,
      startDate: msg.startDate,
      endDate: msg.endDate,
      provider: provider,
      dataSnapshotId: state.dataSnapshotId,
      onProgress: function (fraction, label) {
        postMessage({ type: "progress", fraction: 0.05 + fraction * 0.85, label: "Rebalancing " + label });
      }
    });
    result.strategyName = msg.strategyName || null;

    postMessage({ type: "progress", fraction: 0.92, label: "Aktuelles Modellportfolio …" });
    var holdings = self.VUBacktest.currentHoldings({
      definition: msg.definition, provider: provider, dataSnapshotId: state.dataSnapshotId
    });

    postMessage({ type: "progress", fraction: 0.97, label: "Trust Score …" });
    var subperiods = self.VUBacktest.subperiods(result, 3);
    var trustScore = self.VUTrustScore.computeTrustScore(result, msg.trustContext || {});

    postMessage({ type: "done", result: result, trustScore: trustScore, currentHoldings: holdings, subperiods: subperiods });
  } catch (err) {
    postMessage({ type: "error", message: (err && err.message) || String(err) });
  }
};
