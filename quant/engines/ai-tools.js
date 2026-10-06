/* =========================================================================
   VISION UNIVERSE QUANT — ai-tools.js
   AI TOOL LAYER (§49, §50, §54)

   Die AI besitzt KEINEN Datenzugriff. Sie besitzt ausschliesslich das Recht,
   registrierte Werkzeuge aufzurufen.

   Was hier bewusst NICHT existiert und auch nicht nachtraeglich ergaenzt
   werden darf:
     - ein Tool, das SQL, JavaScript oder einen Ausdruck ausfuehrt
     - ein Tool, das eine beliebige URL abruft
     - ein Tool, das direkten Datenbank- oder Dateizugriff gewaehrt
   Das ist keine Konfiguration, sondern die Sicherheitsgrenze des Systems
   (§50). Eine Prompt Injection kann dadurch hoechstens bewirken, dass ein
   registriertes Tool mit anderen Argumenten laeuft — sie kann nie zu einem
   Zugriff fuehren, den das System nicht ohnehin erlaubt.

   Jedes Tool liefert maschinenlesbare Daten. Die Formulierung uebernimmt
   das Sprachmodell — die Zahlen niemals (§54).
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Query = isNode ? require("./query.js") : global.VUQuery;
  var Strategy = isNode ? require("./strategy.js") : global.VUStrategy;
  var Catalog = isNode ? require("./catalog.js") : global.VUCatalog;

  /* Ausdruecklich verbotene Werkzeugnamen. Der Registrierungsversuch
     scheitert, damit ein solches Tool nicht versehentlich durch eine
     spaetere Erweiterung entsteht. */
  var FORBIDDEN_TOOL_NAMES = [
    "sql", "query_sql", "runSql", "executeSql", "rawQuery",
    "eval", "exec", "execute", "shell", "bash",
    "fetch", "http", "request", "readFile", "writeFile", "database", "db"
  ];

  /**
   * Tool-Definitionen. `parameters` beschreibt die erlaubten Argumente —
   * unbekannte Argumente werden abgewiesen, nicht ignoriert.
   */
  function toolDefinitions() {
    return [
      { name: "screenStocks", category: "discovery",
        description: "Fuehrt eine strukturierte Aktienabfrage aus. Erwartet einen validierten Query-AST, keine natuerliche Sprache.",
        parameters: { query: { type: "object", required: true, description: "Query-AST nach query.js" } } },

      { name: "getStockSnapshot", category: "discovery",
        description: "Kennzahlen, Scores und Stammdaten eines Wertpapiers.",
        parameters: { ticker: { type: "string", required: true } } },

      { name: "compareStocks", category: "discovery",
        description: "Vergleicht mehrere Wertpapiere anhand ihrer Scores und Kennzahlen.",
        parameters: { tickers: { type: "array", required: true }, fields: { type: "array", required: false } } },

      { name: "getQuantScore", category: "quant",
        description: "VU Quant Score, Faktorscores, Coverage und Konfidenz eines Wertpapiers.",
        parameters: { ticker: { type: "string", required: true } } },

      { name: "explainQuantScore", category: "quant",
        description: "Zerlegt den Score in Faktorbeitraege und Komponenten. Die Beitraege summieren sich zum Composite.",
        parameters: { ticker: { type: "string", required: true } } },

      { name: "getFactorHistory", category: "quant",
        description: "Historische Score- und Faktorverlaeufe eines Wertpapiers.",
        parameters: { ticker: { type: "string", required: true } } },

      { name: "rankStocks", category: "quant",
        description: "Rangliste nach einem Score oder einer Score-Velocity.",
        parameters: { rankingId: { type: "string", required: true }, limit: { type: "number", required: false } } },

      { name: "createStrategy", category: "strategy",
        description: "Legt eine Strategie aus einer validierten Definition an.",
        parameters: { name: { type: "string", required: true }, thesis: { type: "string", required: false },
                      definition: { type: "object", required: true } } },

      { name: "validateStrategy", category: "strategy",
        description: "Prueft eine Strategy Definition, ohne sie auszufuehren.",
        parameters: { definition: { type: "object", required: true } } },

      { name: "runBacktest", category: "strategy",
        description: "Startet einen Backtest. Akzeptiert ausschliesslich eine validierte Strategy Definition (§74).",
        parameters: { definition: { type: "object", required: true }, startDate: { type: "string", required: false },
                      endDate: { type: "string", required: false }, strategyName: { type: "string", required: false } } },

      { name: "compareBacktests", category: "strategy",
        description: "Vergleicht zwei gespeicherte Backtests anhand ihrer Kennzahlen.",
        parameters: { backtestIds: { type: "array", required: true } } },

      { name: "getCurrentStrategyHoldings", category: "strategy",
        description: "Wendet eine Strategie auf den aktuellen Datenstand an und liefert die Titel, die ihre Regeln erfuellen.",
        parameters: { backtestId: { type: "string", required: true } } },

      { name: "getWatchlistChanges", category: "monitoring",
        description: "Veraenderungen der beobachteten Wertpapiere: Score-Deltas, Faktorbewegungen, Ereignisse.",
        parameters: {} },

      { name: "getMethodology", category: "meta",
        description: "Liefert eine versionierte Methodikbeschreibung.",
        parameters: { id: { type: "string", required: true } } },

      { name: "listFields", category: "meta",
        description: "Alle abfragbaren Felder mit Einheit, Kategorie und VUQL-Token.",
        parameters: { category: { type: "string", required: false } } }
    ];
  }

  /**
   * Erzeugt eine Tool-Registry ueber einer Datenzugriffsschicht.
   *
   * @param {object} access Funktionen, die die Product API bereitstellt.
   *   In der Anwendung ist das quant/api/client.js, in Tests ein Stub —
   *   die Registry selbst kennt weder Datenbank noch Dateisystem.
   */
  function createToolRegistry(access) {
    var tools = Object.create(null);
    var callLog = [];

    function register(def, handler) {
      if (FORBIDDEN_TOOL_NAMES.indexOf(def.name) !== -1) {
        throw new Error("Tool '" + def.name + "' ist ausdruecklich verboten: die AI darf keinen freien Datenzugriff erhalten (§50).");
      }
      if (typeof handler !== "function") throw new Error("Tool '" + def.name + "' ohne Handler");
      tools[def.name] = { def: def, handler: handler };
    }

    /** Argumentpruefung: fehlende Pflichtfelder und unbekannte Argumente. */
    function validateArgs(def, args) {
      var errors = [];
      args = args || {};
      Object.keys(def.parameters).forEach(function (key) {
        var spec = def.parameters[key];
        var value = args[key];
        if (value === undefined || value === null) {
          if (spec.required) errors.push("Pflichtargument '" + key + "' fehlt");
          return;
        }
        var actual = Array.isArray(value) ? "array" : typeof value;
        if (spec.type && actual !== spec.type) {
          errors.push("Argument '" + key + "': erwartet " + spec.type + ", erhalten " + actual);
        }
      });
      Object.keys(args).forEach(function (key) {
        if (!def.parameters[key]) errors.push("Unbekanntes Argument '" + key + "'");
      });
      return errors;
    }

    var registry = {
      list: function () {
        return Object.keys(tools).map(function (name) { return tools[name].def; });
      },
      has: function (name) { return !!tools[name]; },
      log: function () { return callLog.slice(); },
      clearLog: function () { callLog = []; },

      /**
       * Einziger Ausfuehrungsweg. Ein nicht registrierter Name wird
       * abgelehnt — es gibt keinen Fallback, kein dynamisches Nachladen
       * und keine Auswertung freier Ausdruecke.
       */
      call: function (name, args) {
        var entry = tools[name];
        if (!entry) {
          var result = {
            ok: false, tool: name, error: "Unbekanntes Werkzeug '" + name + "'. Die AI darf ausschliesslich registrierte " +
              "Werkzeuge verwenden; freier Daten- oder Abfragezugriff existiert nicht.",
            available: Object.keys(tools)
          };
          callLog.push({ tool: name, ok: false, rejected: true });
          return Promise.resolve(result);
        }
        var errors = validateArgs(entry.def, args);
        if (errors.length) {
          callLog.push({ tool: name, ok: false, rejected: true });
          return Promise.resolve({ ok: false, tool: name, error: errors.join("; ") });
        }
        return Promise.resolve()
          .then(function () { return entry.handler(args || {}); })
          .then(function (data) {
            callLog.push({ tool: name, ok: true });
            return { ok: true, tool: name, data: data };
          })
          .catch(function (err) {
            callLog.push({ tool: name, ok: false });
            return { ok: false, tool: name, error: (err && err.message) || String(err) };
          });
      }
    };

    var defs = {};
    toolDefinitions().forEach(function (d) { defs[d.name] = d; });

    register(defs.screenStocks, function (args) {
      var validation = Query.validate(args.query);
      if (!validation.valid) throw new Error("Ungueltiger Query-AST: " + validation.errors.join("; "));
      return access.screen(args.query);
    });

    register(defs.getStockSnapshot, function (args) { return access.getStockQuant(args.ticker); });
    register(defs.getQuantScore, function (args) { return access.getStockQuant(args.ticker); });

    register(defs.explainQuantScore, function (args) {
      return Promise.resolve(access.getStockQuant(args.ticker)).then(function (res) {
        if (!res || !res.found) return res;
        var dna = res.dna;
        return {
          found: true, ticker: args.ticker,
          score: dna.score, compositeScore: dna.compositeScore, status: dna.status,
          coverage: dna.coverage, confidence: dna.confidence,
          contributions: dna.factorContributions, effectiveWeights: dna.effectiveWeights,
          factorScores: dna.factorScores, peerGroups: dna.peerGroups,
          methodologyVersion: res.methodologyVersion, asOf: res.asOf
        };
      });
    });

    register(defs.compareStocks, function (args) {
      return Promise.all(args.tickers.slice(0, 8).map(function (t) { return access.getStockQuant(t); }))
        .then(function (results) {
          return {
            fields: args.fields || ["quantScore", "qualityScore", "momentumScore", "valueScore", "growthScore", "riskScore"],
            stocks: results.map(function (r) {
              return r && r.found
                ? { ticker: r.row.ticker, name: r.row.name, sector: r.row.sector, row: r.row, factorScores: r.dna.factorScores }
                : { ticker: (r && r.ticker) || null, found: false, reason: r && r.reason };
            })
          };
        });
    });

    register(defs.getFactorHistory, function (args) { return access.getFactorHistory(args.ticker); });
    register(defs.rankStocks, function (args) {
      return Promise.resolve(access.getRanking(args.rankingId)).then(function (res) {
        if (res && res.found && args.limit) res.entries = res.entries.slice(0, args.limit);
        return res;
      });
    });

    register(defs.validateStrategy, function (args) {
      var res = Strategy.validate(args.definition);
      return { valid: res.valid, errors: res.errors, warnings: res.warnings,
               describe: res.valid ? Strategy.describe(args.definition) : null,
               definitionHash: res.valid ? Strategy.definitionHash(args.definition) : null };
    });

    register(defs.createStrategy, function (args) {
      return access.createStrategy({
        name: args.name, thesis: args.thesis || "", origin: "ai",
        definition: args.definition, changeReason: "Aus einer Beschreibung in natuerlicher Sprache erzeugt"
      });
    });

    register(defs.runBacktest, function (args) {
      /* §74: hier landet ausschliesslich ein validiertes Schema. Der Text
         des Nutzers kommt nie bis hierher. */
      if (typeof args.definition === "string") {
        throw new Error("runBacktest akzeptiert keine natuerliche Sprache, nur eine validierte Strategy Definition.");
      }
      var validation = Strategy.validate(args.definition);
      if (!validation.valid) throw new Error("Ungueltige Strategy Definition: " + validation.errors.join("; "));
      return access.runBacktest(args);
    });

    register(defs.compareBacktests, function (args) { return access.compareBacktests(args.backtestIds); });
    register(defs.getCurrentStrategyHoldings, function (args) { return access.getCurrentHoldings(args.backtestId); });
    register(defs.getWatchlistChanges, function () { return access.getWatchlistIntelligence(); });
    register(defs.getMethodology, function (args) { return access.getMethodology(args.id); });

    register(defs.listFields, function (args) {
      var fields = Catalog.FIELD_LIST;
      if (args.category) fields = fields.filter(function (f) { return f.category === args.category; });
      return { count: fields.length, fields: fields.map(function (f) {
        return { id: f.id, label: f.label, unit: f.unit, category: f.category, token: f.token,
                 percentileAvailable: f.percentileAvailable };
      })};
    });

    registry.register = register;
    return registry;
  }

  var api = {
    FORBIDDEN_TOOL_NAMES: FORBIDDEN_TOOL_NAMES,
    toolDefinitions: toolDefinitions,
    createToolRegistry: createToolRegistry
  };

  if (isNode) module.exports = api;
  else global.VUAiTools = api;
})(typeof window !== "undefined" ? window : globalThis);
