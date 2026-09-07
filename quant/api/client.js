/* =========================================================================
   VISION UNIVERSE QUANT — api/client.js
   PRODUCT API — V1 CONTRACTS (§73, §74)

   Implementiert die dokumentierten v1-Endpunkte als Funktionsaufrufe. Das
   Repository liefert statisch von GitHub Pages aus; es gibt keinen
   HTTP-Server, an den man /v1/... richten koennte.

   Entscheidend ist die GRENZE, nicht das Transportprotokoll: Seiten und
   AI-Tools rufen ausschliesslich diese Schicht auf, niemals eine Engine
   direkt. Wer spaeter einen echten Service anschliesst, ersetzt die
   Rueckgabewerte hier durch fetch("/v1/...") — ohne eine Zeile in einer
   Seite oder einem AI-Tool zu aendern.

   Zwei Datenpfade:
     schnell   praekomputiertes JSON aus quant/data/**  (Screener, Ranking,
               Scores, Radar — alles, was ohne Neuberechnung auskommt)
     schwer    Mock-Dataset im Browser (Backtests, heutige Modellportfolios)
               — nur auf Anforderung erzeugt, weil das mehrere Sekunden und
               rund 20 MB Arbeitsspeicher kostet.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var Query = global.VUQuery;
  var Strategy = global.VUStrategy;
  var Methodology = global.VUMethodology;
  var Hash = global.VUHash;

  var ROUTES = {
    quantDetail: "GET /v1/stocks/{id}/quant",
    screen: "POST /v1/screen",
    ranking: "GET /v1/rankings/{id}",
    createStrategy: "POST /v1/strategies",
    createVersion: "POST /v1/strategies/{id}/versions",
    runBacktest: "POST /v1/backtests",
    getBacktest: "GET /v1/backtests/{id}",
    currentHoldings: "GET /v1/backtests/{id}/current-holdings",
    interpretQuery: "POST /v1/ai/interpret-query",
    interpretStrategy: "POST /v1/ai/interpret-strategy",
    watchlistIntelligence: "GET /v1/watchlists/{id}/intelligence",
    methodology: "GET /v1/methodologies/{id}"
  };

  var STRATEGY_STORE_KEY = "vu.quant.strategies.v1";
  var BACKTEST_STORE_KEY = "vu.quant.backtests.v1";
  var WATCHLIST_STORE_KEY = "vu.quant.watchlist.v1";

  var cache = {};

  var STORAGE_ERROR =
    "Speichern im Browser fehlgeschlagen. Der lokale Speicher ist voll oder in diesem Modus gesperrt " +
    "(private Fenster blockieren ihn haeufig). Loesche aeltere Backtests oder oeffne die Seite in einem " +
    "normalen Fenster.";

  function data(name) {
    if (!cache[name]) cache[name] = S.loadJSON(S.BASE + S.DATA_FILES[name]);
    return cache[name];
  }

  // -------------------------------------------------------------- Lesend
  function getMeta() { return data("meta"); }

  function getSecurities() { return data("securities"); }

  /** GET /v1/stocks/{id}/quant */
  function getStockQuant(ticker) {
    return Promise.all([data("securities"), S.loadFactorDna(ticker), data("meta")])
      .then(function (res) {
        var row = res[0].rows.filter(function (r) { return r.ticker === ticker; })[0];
        if (!row) return { found: false, ticker: ticker, reason: "Unbekannter Ticker im Modelluniversum." };
        var dna = res[1].securities[row.securityId];
        return {
          found: true, route: ROUTES.quantDetail, row: row, dna: dna,
          asOf: res[1].asOf, methodologyVersion: res[1].methodologyVersion,
          dataSnapshotId: res[2].dataSnapshotId
        };
      });
  }

  /** POST /v1/screen — akzeptiert ausschliesslich einen validierten AST. */
  function screen(query, options) {
    return Promise.all([data("securities"), data("meta")]).then(function (res) {
      var validation = Query.validate(query);
      if (!validation.valid) {
        return { ok: false, route: ROUTES.screen, errors: validation.errors, result: null };
      }
      var result = Query.execute(query, res[0].rows, {
        asOf: res[1].asOf,
        methodologyVersion: res[1].methodologyVersions.quant,
        dataSnapshotId: res[1].dataSnapshotId,
        includeDelisted: options && options.includeDelisted
      });
      return { ok: true, route: ROUTES.screen, errors: [], warnings: validation.warnings, result: result };
    });
  }

  /** GET /v1/rankings/{id} */
  function getRanking(rankingId) {
    return data("rankings").then(function (r) {
      var list = r.lists[rankingId];
      if (!list) return { found: false, reason: "Unbekanntes Ranking: " + rankingId, available: Object.keys(r.lists) };
      return { found: true, route: ROUTES.ranking, rankingId: rankingId, asOf: r.asOf,
               methodologyVersion: r.methodologyVersion, entries: list };
    });
  }

  function getRadar() { return data("radar"); }
  function getEvents() { return data("events"); }
  function getScoreHistory() { return data("scoreHistory"); }

  /** GET /v1/methodologies/{id} */
  function getMethodology(id) {
    var all = Methodology.list();
    var entry = all.filter(function (m) { return m.id === id; })[0];
    return Promise.resolve(entry
      ? { found: true, route: ROUTES.methodology, methodology: entry }
      : { found: false, available: all.map(function (m) { return m.id; }) });
  }

  // ---------------------------------------------------- Strategien (§32)
  function loadStore(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function saveStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  /** Bibliotheks- plus nutzereigene Strategien. */
  function listStrategies() {
    return data("strategies").then(function (lib) {
      var own = loadStore(STRATEGY_STORE_KEY, []);
      return { library: lib.strategies, own: own, methodologyVersion: lib.methodologyVersion };
    });
  }

  function getStrategy(strategyId) {
    return listStrategies().then(function (all) {
      var found = all.library.concat(all.own).filter(function (r) { return r.strategy.strategyId === strategyId; })[0];
      return found || null;
    });
  }

  /** POST /v1/strategies */
  function createStrategy(fields) {
    var validation = Strategy.validate(Strategy.createDefinition(fields.definition));
    if (!validation.valid) return Promise.resolve({ ok: false, route: ROUTES.createStrategy, errors: validation.errors });
    var record = Strategy.createStrategy(fields);
    var own = loadStore(STRATEGY_STORE_KEY, []);
    own.unshift(record);
    /* Ein fehlgeschlagener Schreibvorgang darf nicht als Erfolg gemeldet
       werden — der Nutzer wuerde sonst weitergeleitet und faende seine
       Strategie nicht wieder. */
    if (!saveStore(STRATEGY_STORE_KEY, own.slice(0, 40))) {
      return Promise.resolve({ ok: false, route: ROUTES.createStrategy, errors: [STORAGE_ERROR] });
    }
    return Promise.resolve({ ok: true, route: ROUTES.createStrategy, record: record, warnings: validation.warnings });
  }

  /** POST /v1/strategies/{id}/versions — erzeugt IMMER eine neue Version. */
  function createStrategyVersion(strategyId, definition, changeReason, parentVersion) {
    return getStrategy(strategyId).then(function (record) {
      if (!record) return { ok: false, errors: ["Unbekannte Strategie: " + strategyId] };
      try {
        var updated = Strategy.addVersion(record, definition, changeReason, { parentVersion: parentVersion });
        var own = loadStore(STRATEGY_STORE_KEY, []);
        var idx = own.findIndex(function (r) { return r.strategy.strategyId === strategyId; });
        if (idx >= 0) own[idx] = updated;
        else own.unshift(updated);   // abgeleitet von einer Bibliotheksstrategie
        if (!saveStore(STRATEGY_STORE_KEY, own.slice(0, 40))) {
          return { ok: false, route: ROUTES.createVersion, errors: [STORAGE_ERROR] };
        }
        return { ok: true, route: ROUTES.createVersion, record: updated,
                 version: updated.versions[updated.versions.length - 1] };
      } catch (err) {
        return { ok: false, route: ROUTES.createVersion, errors: [err.message] };
      }
    });
  }

  // ----------------------------------------------------------- Backtests
  var workerRef = null;

  /**
   * POST /v1/backtests — akzeptiert NIE natuerliche Sprache (§74),
   * ausschliesslich ein validiertes Strategy Schema.
   *
   * Die Ausfuehrung laeuft in einem Web Worker: ein 20-Jahres-Lauf mit
   * monatlichem Rebalancing berechnet 250 vollstaendige Faktor-Panels und
   * braucht dafuer rund 20 Sekunden. Im Hauptthread waere die Seite
   * solange eingefroren.
   */
  function runBacktest(request, onProgress) {
    var validation = Strategy.validate(request.definition);
    if (!validation.valid) {
      return Promise.resolve({ ok: false, route: ROUTES.runBacktest, errors: validation.errors });
    }
    if (typeof request.definition === "string") {
      return Promise.resolve({ ok: false, route: ROUTES.runBacktest,
        errors: ["POST /v1/backtests akzeptiert keine natuerliche Sprache, nur ein validiertes Strategy Schema."] });
    }

    return new Promise(function (resolve) {
      var worker = new Worker(S.BASE + "ui/backtest-worker.js");
      workerRef = worker;
      worker.onmessage = function (event) {
        var msg = event.data;
        if (msg.type === "progress") { if (onProgress) onProgress(msg.fraction, msg.label); return; }
        worker.terminate();
        workerRef = null;
        if (msg.type === "error") { resolve({ ok: false, route: ROUTES.runBacktest, errors: [msg.message] }); return; }
        var stored = persistBacktest(msg.result, msg.trustScore, msg.currentHoldings, msg.subperiods);
        resolve({ ok: true, route: ROUTES.runBacktest, backtestId: msg.result.backtestId, record: stored });
      };
      worker.onerror = function (err) {
        worker.terminate(); workerRef = null;
        resolve({ ok: false, route: ROUTES.runBacktest, errors: ["Worker-Fehler: " + (err.message || "unbekannt")] });
      };
      worker.postMessage({
        type: "run",
        definition: request.definition,
        strategyId: request.strategyId || null,
        strategyVersion: request.strategyVersion || null,
        strategyName: request.strategyName || null,
        startDate: request.startDate,
        endDate: request.endDate,
        trustContext: request.trustContext || {}
      });
    });
  }

  function cancelBacktest() {
    if (workerRef) { workerRef.terminate(); workerRef = null; }
  }

  /* Backtests werden lokal gespeichert. Die Equity-Kurve wird dabei auf
     wochentliche Punkte ausgeduennt — 5000 Tageswerte je Lauf wuerden den
     localStorage sonst nach wenigen Laeufen sprengen. */
  function persistBacktest(result, trustScore, currentHoldings, subperiods) {
    var record = {
      backtestId: result.backtestId,
      strategyId: result.strategyId,
      strategyVersion: result.strategyVersion,
      strategyName: result.strategyName || null,
      createdAt: result.createdAt,
      startDate: result.startDate, endDate: result.endDate,
      reproductionHash: result.reproductionHash,
      reproductionInput: result.reproductionInput,
      engineVersion: result.engineVersion,
      methodologyVersion: result.methodologyVersion,
      quantMethodologyVersion: result.quantMethodologyVersion,
      dataSnapshotId: result.dataSnapshotId,
      executionAssumptions: result.executionAssumptions,
      definition: result.definition,
      capabilities: result.capabilities,
      warnings: result.warnings || [],
      metrics: result.metrics,
      equity: thinSeries(result.equity, result.benchmark, result.metrics.drawdownSeries),
      benchmarkLabel: result.benchmark ? result.benchmark.label : null,
      rebalances: result.rebalances.slice(-24),
      rebalanceCount: result.rebalances.length,
      trades: result.trades.slice(-120),
      tradeCount: result.trades.length,
      trustScore: trustScore,
      currentHoldings: currentHoldings,
      subperiods: subperiods
    };
    var store = loadStore(BACKTEST_STORE_KEY, []);
    store = store.filter(function (b) { return b.backtestId !== record.backtestId; });
    store.unshift(record);
    if (!saveStore(BACKTEST_STORE_KEY, store.slice(0, 12))) {
      saveStore(BACKTEST_STORE_KEY, store.slice(0, 4));
    }
    return record;
  }

  function thinSeries(equity, benchmark, drawdown) {
    var step = Math.max(1, Math.ceil(equity.dates.length / 720));
    var dates = [], values = [], bench = [], dd = [];
    for (var i = 0; i < equity.dates.length; i += step) {
      dates.push(equity.dates[i]);
      values.push(equity.values[i]);
      if (benchmark) bench.push(benchmark.values[i]);
      if (drawdown) dd.push(drawdown[i]);
    }
    var last = equity.dates.length - 1;
    if (dates[dates.length - 1] !== equity.dates[last]) {
      dates.push(equity.dates[last]); values.push(equity.values[last]);
      if (benchmark) bench.push(benchmark.values[last]);
      if (drawdown) dd.push(drawdown[last]);
    }
    return { dates: dates, values: values, benchmark: benchmark ? bench : null, drawdown: drawdown ? dd : null };
  }

  /** GET /v1/backtests/{id} */
  function getBacktest(backtestId) {
    var store = loadStore(BACKTEST_STORE_KEY, []);
    return Promise.resolve(store.filter(function (b) { return b.backtestId === backtestId; })[0] || null);
  }

  function listBacktests() { return Promise.resolve(loadStore(BACKTEST_STORE_KEY, [])); }

  /** GET /v1/backtests/{id}/current-holdings */
  function getCurrentHoldings(backtestId) {
    return getBacktest(backtestId).then(function (b) {
      return b ? { found: true, route: ROUTES.currentHoldings, holdings: b.currentHoldings } : { found: false };
    });
  }

  // ----------------------------------------------------------- Watchlist
  function getWatchlist() {
    var stored = loadStore(WATCHLIST_STORE_KEY, null);
    if (stored && stored.securityIds) return Promise.resolve(stored);
    /* Erststart: eine nachvollziehbare Demo-Watchlist aus den Fixtures und
       den obersten Rankingplaetzen — nicht zufaellig, damit die Seite bei
       jedem Nutzer dasselbe zeigt. */
    return Promise.all([data("securities"), data("meta")]).then(function (res) {
      var top = res[0].rows.filter(function (r) { return r.status === "active" && Number.isFinite(r.quantScore); })
        .sort(function (a, b) { return b.quantScore - a.quantScore; }).slice(0, 6)
        .map(function (r) { return r.securityId; });
      var fixtures = ["sec_VUF001", "sec_VUF002", "sec_VUF005", "sec_VUF007"];
      var list = {
        watchlistId: "wl_demo", name: "Demo-Watchlist",
        securityIds: top.concat(fixtures.filter(function (f) { return top.indexOf(f) === -1; })),
        createdAt: new Date().toISOString()
      };
      saveStore(WATCHLIST_STORE_KEY, list);
      return list;
    });
  }

  function setWatchlist(list) { saveStore(WATCHLIST_STORE_KEY, list); return Promise.resolve(list); }

  function toggleWatchlist(securityId) {
    return getWatchlist().then(function (list) {
      var idx = list.securityIds.indexOf(securityId);
      if (idx >= 0) list.securityIds.splice(idx, 1);
      else list.securityIds.push(securityId);
      return setWatchlist(list);
    });
  }

  /** GET /v1/watchlists/{id}/intelligence */
  function getWatchlistIntelligence() {
    return Promise.all([getWatchlist(), data("securities"), data("events"), data("scoreHistory"), data("meta")])
      .then(function (res) {
        var list = res[0], rows = res[1].rows, events = res[2].events, history = res[3], meta = res[4];
        var byId = Object.create(null);
        rows.forEach(function (r) { byId[r.securityId] = r; });
        var cfg = Methodology.quant();

        var members = list.securityIds.map(function (id) { return byId[id]; }).filter(Boolean);
        var velocities = global.VURadar.computeVelocityPanel(history, members.map(function (m) { return m.securityId; }), cfg);
        var memberEvents = events.filter(function (e) { return list.securityIds.indexOf(e.securityId) !== -1; });

        return {
          route: ROUTES.watchlistIntelligence,
          watchlistId: list.watchlistId, name: list.name,
          asOf: meta.asOf, methodologyVersion: meta.methodologyVersions.quant,
          members: members.map(function (m) {
            var v = velocities[m.securityId] || {};
            return Object.assign({}, m, {
              scoreVelocity30d: v.scoreVelocity30d === undefined ? null : v.scoreVelocity30d,
              scoreVelocity60d: v.scoreVelocity60d === undefined ? null : v.scoreVelocity60d,
              factorVelocity: v.factorVelocity || {},
              previousScore: v.previousScore === undefined ? null : v.previousScore
            });
          }),
          events: memberEvents
        };
      });
  }

  var api = {
    ROUTES: ROUTES,
    STRATEGY_STORE_KEY: STRATEGY_STORE_KEY,
    BACKTEST_STORE_KEY: BACKTEST_STORE_KEY,
    getMeta: getMeta, getSecurities: getSecurities, getStockQuant: getStockQuant,
    screen: screen, getRanking: getRanking, getRadar: getRadar, getEvents: getEvents,
    getScoreHistory: getScoreHistory, getMethodology: getMethodology,
    listStrategies: listStrategies, getStrategy: getStrategy,
    createStrategy: createStrategy, createStrategyVersion: createStrategyVersion,
    runBacktest: runBacktest, cancelBacktest: cancelBacktest,
    getBacktest: getBacktest, listBacktests: listBacktests, getCurrentHoldings: getCurrentHoldings,
    getWatchlist: getWatchlist, setWatchlist: setWatchlist, toggleWatchlist: toggleWatchlist,
    getWatchlistIntelligence: getWatchlistIntelligence
  };

  global.QuantApi = api;
})(window);
