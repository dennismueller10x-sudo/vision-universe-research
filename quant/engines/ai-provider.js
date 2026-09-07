/* =========================================================================
   VISION UNIVERSE QUANT — ai-provider.js
   AI RESEARCH LAYER (§48, §51–§54, §97)

   ZENTRALE REGEL DES GESAMTEN SYSTEMS (§5):

       AI IST NICHT DIE WAHRHEITSSCHICHT.

   Diese Datei uebersetzt Sprache in Struktur und Struktur in Sprache. Sie
   berechnet nichts. Sie kennt keinen einzigen Kurs, keinen Score, keine
   Rendite. Alle Zahlen entstehen in den Domain Engines und kommen ueber
   registrierte Tools zurueck (§54).

   Die Pipeline:

       Natuerliche Sprache
              |
       Intent + Entitaeten          <- hier
              |
       Query-/Strategy-AST          <- hier
              |
       Schema-Validierung           <- query.js / strategy.js
              |
       Registriertes Tool           <- ai-tools.js
              |
       Domain Engine                <- die Wahrheitsschicht
              |
       Ergebnis + Provenance
              |
       Erklaerung                   <- hier, ausschliesslich aus dem Ergebnis

   MockAIProvider ist ein deterministischer, regelbasierter Parser. Er ist
   ausdruecklich KEIN Sprachmodell und gibt sich auch nicht als eines aus.
   Sein Zweck: die gesamte Architektur — Interpretation, Bestaetigung,
   Validierung, Tool-Aufruf, Erklaerung — ist ohne API-Key vollstaendig
   testbar und nutzbar (§7, §48). Ein OpenAIProvider oder ClaudeProvider
   implementiert spaeter dasselbe Interface; die Seiten und die Tool-Schicht
   bleiben unveraendert.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Query = isNode ? require("./query.js") : global.VUQuery;
  var Strategy = isNode ? require("./strategy.js") : global.VUStrategy;
  var Catalog = isNode ? require("./catalog.js") : global.VUCatalog;
  var Methodology = isNode ? require("./methodology.js") : global.VUMethodology;

  /* Interface, das jeder AI-Provider erfuellen muss. */
  var AI_PROVIDER_METHODS = ["interpretQuery", "interpretStrategy", "explain", "healthCheck"];

  function implementsAiProvider(impl) {
    return AI_PROVIDER_METHODS.every(function (m) { return impl && typeof impl[m] === "function"; });
  }

  var INTENTS = ["screen", "strategy", "backtest", "explain", "compare", "rank", "watchlist", "methodology", "unknown"];

  // ---------------------------------------------------------------------
  // Sprachliche Merkmale — die Financial Ontology in Wortform
  // ---------------------------------------------------------------------
  var SECTOR_WORDS = {
    "technolog": "Technology", "tech": "Technology", "software": "Technology", "halbleiter": "Technology", "semiconduct": "Technology",
    "gesundheit": "Health Care", "health": "Health Care", "pharma": "Health Care", "biotech": "Health Care",
    "finanz": "Financials", "financial": "Financials", "bank": "Financials", "versicher": "Financials",
    "konsum": "Consumer Discretionary", "consumer discretionary": "Consumer Discretionary", "einzelhandel": "Consumer Discretionary", "retail": "Consumer Discretionary",
    "basiskonsum": "Consumer Staples", "staples": "Consumer Staples",
    "industrie": "Industrials", "industrial": "Industrials", "maschinen": "Industrials",
    "energie": "Energy", "energy": "Energy", "oel": "Energy", "öl": "Energy",
    "material": "Materials", "chemie": "Materials", "rohstoff": "Materials",
    "kommunikation": "Communication Services", "communication": "Communication Services", "medien": "Communication Services",
    "versorger": "Utilities", "utilit": "Utilities",
    "immobilien": "Real Estate", "real estate": "Real Estate", "reit": "Real Estate"
  };

  var FACTOR_WORDS = {
    quality: ["qualit", "quality", "margen", "roic", "bilanz", "solide", "kapitalrendite", "hohe rendite auf"],
    momentum: ["momentum", "staerke", "stärke", "trend", "relative strength", "kursstark", "aufwaerts", "aufwärts"],
    value: ["value", "guenstig", "günstig", "bewertung", "billig", "unterbewertet", "preiswert"],
    growth: ["wachstum", "growth", "wachsend", "umsatzwachstum", "schnell wachsend"],
    risk: ["risiko", "volatil", "schwankung", "defensiv", "sicher", "stabil", "low vol", "drawdown"]
  };

  var LOW_RISK_WORDS = ["wenig volatil", "geringe volatil", "niedrige volatil", "low vol", "defensiv", "schwankungsarm", "stabil", "wenig risiko", "geringes risiko"];
  var PROFITABLE_WORDS = ["profitabel", "profitable", "gewinnbringend", "ertragsstark"];
  /* "positivem FCF", "positiver Free Cash Flow", "Cashflow positiv" — die
     Reihenfolge und die Schreibweise variieren zu stark fuer eine Wortliste. */
  var PROFITABLE_PATTERNS = [
    /positiv\w*\s+(?:free\s*)?cash\s*flow/,
    /positiv\w*\s+fcf/,
    /(?:free\s*)?cash\s*flow\s+positiv/,
    /fcf\s*(?:>|ueber|groesser)\s*0/
  ];
  var DIVIDEND_WORDS = ["dividende", "dividend", "ausschuett", "ausschütt"];

  /* Ausgeschriebene Zahlwoerter — "seit mindestens fuenf Jahren" ist im
     Deutschen mindestens so haeufig wie "seit 5 Jahren". */
  var NUMBER_WORDS = {
    "null": 0, "ein": 1, "eine": 1, "einem": 1, "zwei": 2, "drei": 3, "vier": 4, "fuenf": 5,
    "sechs": 6, "sieben": 7, "acht": 8, "neun": 9, "zehn": 10, "elf": 11, "zwoelf": 12,
    "fifteen": 15, "twenty": 20, "zwanzig": 20, "fuenfzehn": 15, "dreissig": 30
  };

  function numberWordPattern() {
    return Object.keys(NUMBER_WORDS).sort(function (a, b) { return b.length - a.length; }).join("|");
  }

  function normalize(text) {
    return String(text || "").toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  }
  function hasAny(text, words) {
    return words.some(function (w) { return text.indexOf(normalize(w)) !== -1; });
  }

  // ---------------------------------------------------------------------
  // Intent
  // ---------------------------------------------------------------------
  function detectIntent(text) {
    var t = normalize(text);
    if (hasAny(t, ["was waere passiert", "was waere gewesen", "haette ich", "backtest", "teste", "getestet", "historisch getestet", "rueckblickend"])) return "backtest";
    if (hasAny(t, ["baue mir eine strategie", "erstelle eine strategie", "strategie mit", "strategie aus", "baue eine strategie", "strategie fuer", "portfolio aus", "positionen halten"])) return "strategy";
    if (hasAny(t, ["warum", "erklaere", "erklaer", "wie kommt", "weshalb", "wodurch", "begruende"])) return "explain";
    if (hasAny(t, ["vergleiche", "vergleich ", "gegenueber", "versus", " vs "])) return "compare";
    if (hasAny(t, ["watchlist", "beobachtungsliste", "was hat sich veraendert", "meine liste"])) return "watchlist";
    /* Methodikfragen vor Erklaerungsfragen: "Wie wird der VU Quant Score
       berechnet?" ist keine Frage zu einem einzelnen Titel. Die
       Formulierungen variieren zu stark fuer eine Wortliste, deshalb ein
       Muster statt fester Phrasen. */
    if (hasAny(t, ["methodik", "methodology", "methodenversion"]) ||
        (/wie\s+(?:wird|werden|funktioniert|entsteht|setzt)/.test(t) &&
         /(berechnet|ermittelt|gebildet|zusammen|score|gewicht)/.test(t))) return "methodology";
    if (hasAny(t, ["am staerksten verbessert", "groesste verbesserung", "beste ", "top ", "rangliste", "ranking", "die staerksten"])) return "rank";
    return "screen";
  }

  // ---------------------------------------------------------------------
  // Entitaeten
  // ---------------------------------------------------------------------
  function extractEntities(text) {
    var t = normalize(text);
    var e = { sectors: [], factors: [], tickers: [], numbers: {}, flags: {} };

    Object.keys(SECTOR_WORDS).forEach(function (word) {
      var sector = SECTOR_WORDS[word];
      if (t.indexOf(normalize(word)) !== -1 && e.sectors.indexOf(sector) === -1) e.sectors.push(sector);
    });

    Object.keys(FACTOR_WORDS).forEach(function (factor) {
      if (hasAny(t, FACTOR_WORDS[factor])) e.factors.push(factor);
    });

    var tickerMatch = String(text).toUpperCase().match(/\bVU(?:F\d{3}|\d{4})\b/g);
    if (tickerMatch) e.tickers = tickerMatch.filter(function (v, i, a) { return a.indexOf(v) === i; });

    /* Zahlen mit ihrer Bedeutung, nicht als lose Liste — "20 Aktien" und
       "20 Prozent" duerfen nicht verwechselt werden. */
    /* "20 Aktien", aber auch "20 US-Aktien" oder "20 amerikanische Aktien" —
       ein optionales Zwischenwort gehoert dazwischen. */
    var positions = t.match(/(\d{1,3})\s*(?:[a-z]+[-\s]\s*)?(?:aktien|titel|positionen|werte|unternehmen)/);
    if (positions) e.numbers.positions = parseInt(positions[1], 10);

    var distance = t.match(/(?:maximal|hoechstens|max\.?|bis zu)?\s*(\d{1,2}(?:[.,]\d)?)\s*%?\s*(?:unter|vom|von|zum)\s*(?:dem\s*)?52/);
    if (distance) e.numbers.distanceTo52wHigh = parseFloat(distance[1].replace(",", "."));

    var years = t.match(/seit\s*(19|20)(\d{2})/);
    if (years) e.numbers.startYear = parseInt(years[1] + years[2], 10);

    var divYears = t.match(new RegExp("(?:seit|ueber|mindestens|von)?\\s*(\\d{1,2}|" + numberWordPattern() + ")\\s*jahren?"));
    if (divYears && hasAny(t, DIVIDEND_WORDS)) {
      var raw = divYears[1];
      e.numbers.dividendGrowthYears = /^\d+$/.test(raw) ? parseInt(raw, 10) : NUMBER_WORDS[raw];
    }

    var growth = t.match(/(\d{1,2})\s*%\s*(?:umsatzwachstum|wachstum)/);
    if (growth) e.numbers.revenueGrowth = parseInt(growth[1], 10);

    e.flags.profitable = hasAny(t, PROFITABLE_WORDS) ||
      PROFITABLE_PATTERNS.some(function (re) { return re.test(t); });
    e.flags.lowRisk = hasAny(t, LOW_RISK_WORDS);
    e.flags.dividend = hasAny(t, DIVIDEND_WORDS);
    e.flags.near52High = t.indexOf("52") !== -1 && t.indexOf("hoch") !== -1;
    e.flags.monthly = hasAny(t, ["monatlich", "monthly", "jeden monat"]);
    e.flags.quarterly = hasAny(t, ["quartal", "quarterly", "vierteljaehrlich"]);
    e.flags.lowerDrawdown = hasAny(t, ["drawdown ist mir zu hoch", "drawdown zu hoch", "weniger drawdown", "geringerer drawdown", "zu hoher verlust", "verlust zu hoch", "zu riskant", "weniger risiko"]);
    e.flags.largeCap = hasAny(t, ["grosse unternehmen", "large cap", "grosskonzern", "megacap"]);
    e.flags.smallCap = hasAny(t, ["kleine unternehmen", "small cap", "nebenwerte"]);
    return e;
  }

  // ---------------------------------------------------------------------
  // Sprache -> Query-AST (§51)
  // ---------------------------------------------------------------------
  function buildQuery(entities) {
    var filters = [];
    var notes = [];

    entities.sectors.forEach(function (sector) {
      filters.push({ field: "sector", operator: "eq", value: sector, scale: "raw" });
    });
    if (entities.sectors.length > 1) {
      filters = filters.filter(function (f) { return f.field !== "sector"; });
      filters.push({ field: "sector", operator: "in", value: entities.sectors, scale: "raw" });
    }

    if (entities.flags.profitable) {
      filters.push({ field: "freeCashFlow", operator: "gt", value: 0, scale: "raw" });
      notes.push("„profitabel“ wurde als positiver Free Cash Flow interpretiert.");
    }
    if (entities.factors.indexOf("momentum") !== -1) {
      filters.push({ field: "momentum6m", operator: "gte", value: 80, scale: "percentile" });
      notes.push("„starkes Momentum“ wurde als oberstes Fuenftel der 6-Monats-Kursentwicklung interpretiert.");
    }
    if (entities.factors.indexOf("quality") !== -1) {
      filters.push({ field: "roic", operator: "gte", value: 70, scale: "percentile" });
      notes.push("„Qualitaet“ wurde als ROIC im obersten Drittel interpretiert.");
    }
    if (entities.factors.indexOf("value") !== -1) {
      filters.push({ field: "fcfYield", operator: "gte", value: 70, scale: "percentile" });
      notes.push("„guenstig“ wurde als hohe Free-Cash-Flow-Rendite interpretiert.");
    }
    if (entities.factors.indexOf("growth") !== -1) {
      var threshold = entities.numbers.revenueGrowth || 10;
      filters.push({ field: "revenueGrowth", operator: "gte", value: threshold, scale: "raw" });
      notes.push("„Wachstum“ wurde als Umsatzwachstum von mindestens " + threshold + " % interpretiert.");
    }
    if (entities.flags.lowRisk) {
      filters.push({ field: "volatility", operator: "gte", value: 70, scale: "percentile" });
      notes.push("„wenig Volatilitaet“ wurde als oberstes Drittel im Risikoperzentil interpretiert (hohes Perzentil = niedrige Schwankung).");
    }
    if (Number.isFinite(entities.numbers.distanceTo52wHigh)) {
      filters.push({ field: "distanceTo52wHigh", operator: "lte", value: entities.numbers.distanceTo52wHigh, scale: "raw" });
    } else if (entities.flags.near52High) {
      filters.push({ field: "distanceTo52wHigh", operator: "lte", value: 3, scale: "raw" });
      notes.push("„nahe am 52-Wochen-Hoch“ wurde ohne konkrete Angabe als hoechstens 3 % Abstand interpretiert.");
    }
    if (Number.isFinite(entities.numbers.dividendGrowthYears)) {
      filters.push({ field: "consecutiveDividendGrowthYears", operator: "gte",
                     value: entities.numbers.dividendGrowthYears, scale: "raw" });
    } else if (entities.flags.dividend) {
      filters.push({ field: "dividendYield", operator: "gt", value: 0, scale: "raw" });
    }
    if (entities.flags.largeCap) filters.push({ field: "marketCap", operator: "gte", value: 10000, scale: "raw" });
    if (entities.flags.smallCap) filters.push({ field: "marketCap", operator: "lte", value: 5000, scale: "raw" });

    return {
      query: Query.createQuery({
        filters: filters,
        sort: [{ field: "quantScore", direction: "desc" }],
        limit: entities.numbers.positions || 25
      }),
      notes: notes
    };
  }

  // ---------------------------------------------------------------------
  // Sprache -> Strategy Definition (§53, §62)
  // ---------------------------------------------------------------------
  function buildStrategy(entities, baseDefinition) {
    var notes = [];
    var base = baseDefinition ? JSON.parse(JSON.stringify(baseDefinition)) : Strategy.createDefinition({});

    var factors = entities.factors.filter(function (f) { return Strategy.RANKABLE_FACTORS.indexOf(f) !== -1; });
    if (!factors.length) {
      factors = ["quality", "momentum"];
      notes.push("Ohne genannte Faktoren wurde die Standardkombination Quality und Momentum verwendet.");
    }

    /* Risk bekommt bewusst weniger Gewicht: er ist eine Defensivkomponente,
       kein Renditetreiber. Das entspricht den Gewichten in quant-v1.json. */
    var weights = {};
    var riskCount = factors.indexOf("risk") !== -1 ? 1 : 0;
    var mainCount = factors.length - riskCount;
    var riskWeight = riskCount ? 0.2 : 0;
    factors.forEach(function (f) {
      weights[f] = f === "risk" ? riskWeight : (1 - riskWeight) / mainCount;
    });
    base.ranking = { factors: factors.map(function (f) { return { factor: f, weight: round2(weights[f]) }; }) };
    normalizeWeights(base.ranking.factors);

    var built = buildQuery(entities);
    /* Perzentilfilter aus der Sprache werden im Ranking bereits abgebildet;
       als zusaetzlicher Vorfilter wuerden sie das Universum doppelt
       verengen. Uebernommen werden nur harte Kriterien. */
    base.filters = built.query.filters.filter(function (f) {
      if (f.scale === "percentile") return f.field === "volatility";
      return true;
    });
    notes = notes.concat(built.notes.filter(function (n) { return n.indexOf("Momentum") === -1 && n.indexOf("Qualitaet") === -1; }));

    if (Number.isFinite(entities.numbers.positions)) base.portfolio.positions = clamp(entities.numbers.positions, 5, 200);
    if (entities.flags.monthly) base.rebalance = "monthly";
    if (entities.flags.quarterly) base.rebalance = "quarterly";

    if (entities.flags.lowRisk) {
      base.portfolio.maxSectorWeight = Math.min(base.portfolio.maxSectorWeight, 0.25);
      notes.push("Wegen des Wunsches nach geringerer Schwankung wurde das maximale Sektorgewicht auf 25 % gesenkt.");
    }

    return { definition: base, notes: notes };
  }

  /**
   * Ableitung einer neuen Version aus einem Feedbacksatz (§97).
   * Die AI darf NICHT rueckwirkend Parameter suchen, bis das Ergebnis
   * besser aussieht. Sie schlaegt eine begruendete Regelaenderung vor;
   * getestet wird sie anschliessend separat.
   */
  function reviseStrategy(text, baseDefinition) {
    var entities = extractEntities(text);
    var def = JSON.parse(JSON.stringify(baseDefinition));
    var changes = [];

    if (entities.flags.lowerDrawdown || entities.flags.lowRisk) {
      var hasVolFilter = def.filters.some(function (f) { return f.field === "volatility"; });
      if (!hasVolFilter) {
        def.filters.push({ field: "volatility", operator: "gte", value: 30, scale: "percentile" });
        changes.push("Titel im volatilsten Drittel werden ausgeschlossen.");
      }
      if (def.portfolio.maxSectorWeight > 0.25) {
        def.portfolio.maxSectorWeight = 0.25;
        changes.push("Maximales Sektorgewicht von " + Math.round(baseDefinition.portfolio.maxSectorWeight * 100) + " % auf 25 % gesenkt.");
      }
      if (def.portfolio.minMarketCapM < 5000) {
        def.portfolio.minMarketCapM = 5000;
        changes.push("Mindest-Marktkapitalisierung auf 5 Mrd. USD angehoben.");
      }
      var riskEntry = def.ranking.factors.filter(function (f) { return f.factor === "risk"; })[0];
      if (!riskEntry) {
        def.ranking.factors.forEach(function (f) { f.weight = f.weight * 0.8; });
        def.ranking.factors.push({ factor: "risk", weight: 0.2 });
        changes.push("Risk als Rankingfaktor mit 20 % Gewicht ergaenzt.");
      }
      normalizeWeights(def.ranking.factors);
    }

    if (entities.flags.quarterly && def.rebalance !== "quarterly") {
      def.rebalance = "quarterly";
      changes.push("Rebalancing von monatlich auf quartalsweise umgestellt — das senkt Umschlag und Kosten.");
    }
    if (Number.isFinite(entities.numbers.positions) && entities.numbers.positions !== def.portfolio.positions) {
      def.portfolio.positions = clamp(entities.numbers.positions, 5, 200);
      changes.push("Positionszahl auf " + def.portfolio.positions + " gesetzt.");
    }

    return { definition: def, changes: changes };
  }

  function normalizeWeights(factors) {
    var sum = factors.reduce(function (s, f) { return s + f.weight; }, 0);
    if (sum <= 0) return factors;
    factors.forEach(function (f) { f.weight = round2(f.weight / sum); });
    /* Rundungsrest auf den groessten Faktor legen, damit die Summe exakt 1
       ergibt — die Validierung laesst nichts anderes durch. */
    var rest = 1 - factors.reduce(function (s, f) { return s + f.weight; }, 0);
    if (Math.abs(rest) > 1e-9) {
      var biggest = factors.reduce(function (a, b) { return b.weight > a.weight ? b : a; }, factors[0]);
      biggest.weight = round2(biggest.weight + rest);
    }
    return factors;
  }
  function round2(v) { return Math.round(v * 100) / 100; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---------------------------------------------------------------------
  // MockAIProvider
  // ---------------------------------------------------------------------
  function createMockAiProvider() {
    return {
      name: "MockAIProvider",
      isMock: true,

      healthCheck: function () {
        return {
          status: "ok", provider: "MockAIProvider",
          message: "Deterministischer, regelbasierter Parser. Kein Sprachmodell, kein API-Key, keine Netzwerkverbindung. " +
                   "Er dient dazu, die AI-Architektur ohne externen Anbieter vollstaendig nutzbar und testbar zu halten.",
          capabilities: ["interpretQuery", "interpretStrategy", "explain"]
        };
      },

      /** Natuerliche Sprache -> Intent + AST. Ergebnis wird dem Nutzer vor
          der Ausfuehrung gezeigt (§52). */
      interpretQuery: function (text, context) {
        context = context || {};
        var intent = detectIntent(text);
        var entities = extractEntities(text);
        var out = {
          provider: "MockAIProvider", isMock: true, input: text,
          intent: intent, entities: entities, notes: [], toolPlan: [],
          query: null, strategyDefinition: null, validation: null
        };

        if (intent === "screen" || intent === "backtest" || intent === "strategy") {
          var built = buildQuery(entities);
          out.query = built.query;
          out.notes = built.notes;
          out.validation = Query.validate(built.query);
        }

        if (intent === "strategy" || intent === "backtest") {
          var strategy = buildStrategy(entities, context.baseDefinition);
          out.strategyDefinition = strategy.definition;
          out.notes = out.notes.concat(strategy.notes);
          out.strategyValidation = Strategy.validate(strategy.definition);
          if (Number.isFinite(entities.numbers.startYear)) {
            out.startDate = entities.numbers.startYear + "-01-02";
          }
        }

        out.toolPlan = planTools(intent, entities, out);
        if (intent === "unknown" || (!out.query && !out.strategyDefinition && !out.toolPlan.length)) {
          out.notes.push("Die Anfrage konnte nicht in eine strukturierte Abfrage uebersetzt werden.");
        }
        return out;
      },

      interpretStrategy: function (text, context) {
        context = context || {};
        if (context.baseDefinition && extractEntities(text).flags.lowerDrawdown) {
          var revised = reviseStrategy(text, context.baseDefinition);
          return {
            provider: "MockAIProvider", isMock: true, input: text,
            intent: "revise", strategyDefinition: revised.definition,
            changes: revised.changes,
            strategyValidation: Strategy.validate(revised.definition),
            notes: ["Aenderungen erzeugen eine neue Strategieversion. Die Vorversion bleibt unveraendert bestehen."]
          };
        }
        var entities = extractEntities(text);
        var built = buildStrategy(entities, context.baseDefinition);
        return {
          provider: "MockAIProvider", isMock: true, input: text,
          intent: "strategy", strategyDefinition: built.definition,
          changes: [], notes: built.notes,
          strategyValidation: Strategy.validate(built.definition)
        };
      },

      /**
       * Erklaerung AUSSCHLIESSLICH aus Tool-Ergebnissen (§54).
       * Ohne verwertbares Ergebnis lautet die Antwort "data unavailable" —
       * es wird nicht geraten.
       */
      explain: function (kind, payload) {
        var results = (payload && payload.toolResults) || [];
        var usable = results.filter(function (r) { return r && r.ok && r.data; });
        if (!usable.length) {
          return {
            provider: "MockAIProvider", isMock: true, dataUnavailable: true,
            text: "Dazu liegt kein Ergebnis aus einer berechneten Quelle vor. Vision Universe gibt in diesem Fall " +
                  "keine Einschaetzung ab, statt eine plausibel klingende Zahl zu erfinden.",
            sources: []
          };
        }
        return {
          provider: "MockAIProvider", isMock: true, dataUnavailable: false,
          text: composeExplanation(kind, usable, payload),
          sources: usable.map(function (r) { return r.tool; })
        };
      },

      reviseStrategy: reviseStrategy
    };
  }

  function planTools(intent, entities, interpretation) {
    var plan = [];
    if (intent === "screen" && interpretation.query) {
      plan.push({ tool: "screenStocks", args: { query: interpretation.query } });
    }
    if (intent === "rank") {
      var rankingId = entities.factors.length ? factorRanking(entities.factors[0]) : "overall";
      if (hasAny(normalize(interpretation.input), ["verbessert", "velocity", "veraendert"])) rankingId = "score_velocity";
      plan.push({ tool: "rankStocks", args: { rankingId: rankingId, limit: entities.numbers.positions || 15 } });
    }
    if (intent === "explain" && entities.tickers.length) {
      plan.push({ tool: "explainQuantScore", args: { ticker: entities.tickers[0] } });
    }
    if (intent === "compare" && entities.tickers.length > 1) {
      plan.push({ tool: "compareStocks", args: { tickers: entities.tickers } });
    }
    if (intent === "watchlist") plan.push({ tool: "getWatchlistChanges", args: {} });
    if (intent === "methodology") plan.push({ tool: "getMethodology", args: { id: "quant" } });
    if ((intent === "strategy" || intent === "backtest") && interpretation.strategyDefinition) {
      plan.push({ tool: "validateStrategy", args: { definition: interpretation.strategyDefinition } });
      if (intent === "backtest") {
        plan.push({ tool: "runBacktest", args: {
          definition: interpretation.strategyDefinition,
          startDate: interpretation.startDate || undefined
        }});
      }
    }
    if (intent === "screen" && entities.tickers.length === 1) {
      plan.unshift({ tool: "getStockSnapshot", args: { ticker: entities.tickers[0] } });
    }
    return plan;
  }

  function factorRanking(factor) {
    return { quality: "quality", momentum: "momentum", value: "value", growth: "growth", risk: "risk" }[factor] || "overall";
  }

  /* Formulierung ausschliesslich aus vorliegenden Zahlen. Jede Aussage
     verweist auf das Tool, aus dem sie stammt. */
  function composeExplanation(kind, results, payload) {
    var parts = [];
    results.forEach(function (r) {
      var d = r.data;
      if (r.tool === "screenStocks" && d && d.result) {
        var res = d.result;
        parts.push(res.matchedCount + " von " + res.universeSize + " Titeln im Modelluniversum erfuellen alle Regeln.");
        if (res.rows.length) {
          var top = res.rows[0];
          parts.push("Den hoechsten VU Quant Score in dieser Auswahl hat " + top.ticker +
                     (Number.isFinite(top.quantScore) ? " mit " + Math.round(top.quantScore) : "") + ".");
        } else {
          parts.push("Es gibt keinen Treffer. Fehlende Daten erfuellen keinen Filter — ein Unternehmen ohne " +
                     "die abgefragte Kennzahl wird nicht mitgezaehlt.");
        }
      }
      if (r.tool === "explainQuantScore" && d && d.found) {
        var contributions = Object.keys(d.contributions || {})
          .filter(function (f) { return d.contributions[f] > 0; })
          .sort(function (a, b) { return d.contributions[b] - d.contributions[a]; });
        if (d.status === "incomplete") {
          parts.push(d.ticker + " hat keinen vollstaendigen VU Quant Score: die Datenabdeckung liegt bei " +
                     Math.round(d.coverage * 100) + " %.");
        } else {
          parts.push(d.ticker + " hat einen VU Quant Score von " + Math.round(d.score) +
                     " bei einem Composite von " + d.compositeScore + ".");
          if (contributions.length) {
            parts.push("Den groessten Beitrag liefert " + contributions[0] + " mit " +
                       d.contributions[contributions[0]] + " Punkten; die Beitraege aller Faktoren summieren sich exakt zum Composite.");
          }
          parts.push("Datenabdeckung " + Math.round(d.coverage * 100) + " %, Methodik " + d.methodologyVersion + ".");
        }
      }
      if (r.tool === "rankStocks" && d && d.found) {
        parts.push("Rangliste „" + d.rankingId + "“ zum Stand " + d.asOf + ": " +
                   d.entries.slice(0, 3).map(function (e) { return e.ticker + " (" + Math.round(e.value) + ")"; }).join(", ") + ".");
      }
      if (r.tool === "compareStocks" && d && d.stocks) {
        var scored = d.stocks.filter(function (s) { return s.row && Number.isFinite(s.row.quantScore); });
        if (scored.length) {
          var best = scored.reduce(function (a, b) { return b.row.quantScore > a.row.quantScore ? b : a; });
          parts.push("Von den verglichenen Titeln hat " + best.ticker + " den hoechsten VU Quant Score (" +
                     Math.round(best.row.quantScore) + ").");
        }
        var missing = d.stocks.filter(function (s) { return s.found === false; });
        if (missing.length) parts.push("Nicht gefunden: " + missing.map(function (s) { return s.ticker; }).join(", ") + ".");
      }
      if (r.tool === "validateStrategy" && d) {
        parts.push(d.valid
          ? "Die Strategiedefinition ist gueltig (Hash " + d.definitionHash + ") und kann getestet werden."
          : "Die Strategiedefinition ist nicht gueltig: " + d.errors.join("; "));
      }
      if (r.tool === "runBacktest" && d && d.ok && d.record) {
        var m = d.record.metrics;
        parts.push("Der Backtest ueber " + d.record.startDate + " bis " + d.record.endDate + " ergibt " +
                   m.cagr + " % CAGR bei einem maximalen Drawdown von " + m.maxDrawdown + " %" +
                   (m.benchmark ? " (Benchmark " + m.benchmark.cagr + " %)" : "") + ".");
        if (d.record.trustScore) {
          parts.push("Der Backtest Trust Score liegt bei " + d.record.trustScore.score + " von 100 — " +
                     d.record.trustScore.label + ".");
        }
      }
      if (r.tool === "getWatchlistChanges" && d) {
        parts.push(d.members.length + " beobachtete Titel, " + d.events.length + " relevante Veraenderungen seit dem letzten Snapshot.");
      }
      if (r.tool === "getMethodology" && d && d.found) {
        var cfg = d.methodology.config;
        parts.push("Methodik " + d.methodology.methodologyVersion + ": " +
                   Object.keys(cfg.factorWeights || {}).map(function (f) {
                     return f + " " + Math.round(cfg.factorWeights[f] * 100) + " %";
                   }).join(", ") + ".");
      }
      if (r.tool === "getStockSnapshot" && d && d.found) {
        parts.push(d.row.ticker + " (" + d.row.name + ", " + d.row.industry + "): VU Quant Score " +
                   (Number.isFinite(d.row.quantScore) ? Math.round(d.row.quantScore) : "nicht verfuegbar") +
                   ", Datenabdeckung " + Math.round(d.row.coverage * 100) + " %.");
      }
    });

    if (!parts.length) {
      return "Die Werkzeuge haben ein Ergebnis geliefert, das sich nicht in eine Aussage uebersetzen laesst.";
    }
    parts.push("Alle Zahlen stammen aus den genannten Werkzeugen und beziehen sich auf den synthetischen Modelldatensatz.");
    return parts.join(" ");
  }

  var api = {
    AI_PROVIDER_METHODS: AI_PROVIDER_METHODS,
    INTENTS: INTENTS,
    implementsAiProvider: implementsAiProvider,
    detectIntent: detectIntent,
    extractEntities: extractEntities,
    buildQuery: buildQuery,
    buildStrategy: buildStrategy,
    reviseStrategy: reviseStrategy,
    createMockAiProvider: createMockAiProvider
  };

  if (isNode) module.exports = api;
  else global.VUAiProvider = api;
})(typeof window !== "undefined" ? window : globalThis);
