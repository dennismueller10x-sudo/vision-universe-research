/* =========================================================================
   VISION UNIVERSE QUANT — schema.js
   CANONICAL FINANCIAL DATA MODEL (§10, §11, §14)

   Vision Universe besitzt sein eigenes kanonisches Financial Schema. Kein
   Vendor besitzt die interne Architektur. Oberhalb der Provider-Adapter
   existieren ausschliesslich die hier definierten Entitaeten.

   Ohne Build-Step gibt es kein TypeScript. Statt dessen: deklarative
   Feldspezifikationen + Laufzeit-Validatoren. Das ist an den
   Systemgrenzen (Provider-Ingest, Query-/Strategy-Eingaben) sogar
   belastbarer als reine Compile-Zeit-Typen.

   ZEITDIMENSIONEN (§11) sind der kritische Teil dieses Modells. Ein
   FundamentalFact traegt fuenf verschiedene Zeitpunkte, weil ein Backtest
   nicht fragen darf "wie war Q1 2018?", sondern "was war am 2018-05-07
   ueber Q1 2018 bekannt?".
   ========================================================================= */
(function (global) {
  "use strict";

  var Hash = (typeof module !== "undefined" && module.exports)
    ? require("./hash.js") : global.VUHash;

  // ---------------------------------------------------------------------
  // Enumerationen
  // ---------------------------------------------------------------------
  var ASSET_TYPES = ["equity", "etf", "index"];
  var SECURITY_STATUS = ["active", "delisted", "suspended", "acquired"];
  /* Bereinigungsstufen einer Kursreihe. Deckungsgleich mit
     quant/methodology/price-adjustment-v1.json; das Schema kennt sie, damit
     eine Bar ihre Stufe mitfuehren kann, ohne dass jeder Adapter eine
     eigene Schreibweise erfindet. */
  var ADJUSTMENT_STATUS = ["raw", "unadjusted", "splitAdjusted", "adjusted", "unknown"];

  var CORPORATE_ACTION_TYPES = ["split", "dividend", "special_dividend", "delisting", "merger", "symbol_change", "spinoff"];
  var RESTATEMENT_STATUS = ["original", "restated", "preliminary"];
  var FISCAL_PERIODS = ["Q1", "Q2", "Q3", "Q4", "FY"];
  var FACTOR_IDS = ["quality", "momentum", "value", "growth", "risk", "revisions"];
  var COVERAGE_CONFIDENCE = ["high", "medium", "low", "insufficient"];
  var EVENT_SEVERITY = ["info", "notable", "high"];

  var SECTORS = [
    "Technology", "Health Care", "Financials", "Consumer Discretionary",
    "Consumer Staples", "Industrials", "Energy", "Materials",
    "Communication Services", "Utilities", "Real Estate"
  ];

  /* Industry je Sector — Peer Groups fuer die Normalisierung (§18). */
  var INDUSTRIES = {
    "Technology": ["Semiconductors", "Software Infrastructure", "Application Software", "IT Services", "Hardware & Equipment"],
    "Health Care": ["Biotechnology", "Pharmaceuticals", "Medical Devices", "Healthcare Providers"],
    "Financials": ["Banks", "Insurance", "Capital Markets", "Financial Data & Exchanges"],
    "Consumer Discretionary": ["Specialty Retail", "Automobiles", "Restaurants", "Leisure Products", "Apparel"],
    "Consumer Staples": ["Beverages", "Food Products", "Household Products", "Food & Staples Retailing"],
    "Industrials": ["Aerospace & Defense", "Machinery", "Transportation & Logistics", "Building Products", "Commercial Services"],
    "Energy": ["Oil & Gas Exploration", "Oil & Gas Equipment", "Refining & Marketing", "Renewable Energy"],
    "Materials": ["Chemicals", "Metals & Mining", "Construction Materials", "Packaging"],
    "Communication Services": ["Interactive Media", "Telecom", "Entertainment", "Publishing"],
    "Utilities": ["Electric Utilities", "Gas Utilities", "Water Utilities"],
    "Real Estate": ["REIT Industrial", "REIT Residential", "REIT Retail", "Real Estate Services"]
  };

  var EXCHANGES = [
    { id: "XMOC", name: "Vision Universe Mock Exchange", mic: "XMOC", country: "US", currency: "USD", timezone: "America/New_York" }
  ];

  // ---------------------------------------------------------------------
  // Feldspezifikationen der Entitaeten
  //   t: "string" | "number" | "boolean" | "date" | "datetime" | "array" | "object"
  //   r: required
  //   e: erlaubte Werte
  // ---------------------------------------------------------------------
  var ENTITIES = {

    /* --- Reference Data ------------------------------------------------ */
    Security: {
      securityId:   { t: "string", r: true },
      ticker:       { t: "string", r: true },
      name:         { t: "string", r: true },
      assetType:    { t: "string", r: true, e: ASSET_TYPES },
      exchangeId:   { t: "string", r: true },
      currency:     { t: "string", r: true },
      country:      { t: "string", r: true },
      sector:       { t: "string", r: true },
      industry:     { t: "string", r: true },
      status:       { t: "string", r: true, e: SECURITY_STATUS },
      firstTradingDate: { t: "date", r: true },
      lastTradingDate:  { t: "date", r: false },
      isMock:       { t: "boolean", r: true },
      fixtureId:    { t: "string", r: false },
      dataSourceId: { t: "string", r: true }
    },
    SecurityIdentifier: {
      securityId: { t: "string", r: true },
      scheme:     { t: "string", r: true },   // "ticker" | "vuid" | "isin" | "figi" ...
      value:      { t: "string", r: true },
      validFrom:  { t: "date", r: true },
      validTo:    { t: "date", r: false }
    },
    Exchange: {
      id: { t: "string", r: true }, name: { t: "string", r: true }, mic: { t: "string", r: true },
      country: { t: "string", r: true }, currency: { t: "string", r: true }, timezone: { t: "string", r: true }
    },
    Sector:   { id: { t: "string", r: true }, name: { t: "string", r: true } },
    Industry: { id: { t: "string", r: true }, name: { t: "string", r: true }, sectorId: { t: "string", r: true } },

    /* --- Market Data --------------------------------------------------- */
    PriceBar: {
      securityId: { t: "string", r: true },
      date:       { t: "date", r: true },
      /* Der unbereinigte Handelskurs: was an dem Tag auf der Tafel stand.
         Fuer Ordergroessen und Volumenanalyse die einzig richtige Reihe. */
      open:       { t: "number", r: true },
      high:       { t: "number", r: true },
      low:        { t: "number", r: true },
      close:      { t: "number", r: true },
      volume:     { t: "number", r: true },

      /* adjustedClose ist total-return-adjustiert (Splits + Dividenden).
         Der Backtest rechnet darauf, die UI zeigt close.

         NICHT mehr Pflichtfeld. Ein Anbieter, der keine bestaetigte
         Bereinigung liefert, muss null eintragen duerfen - ein
         unbereinigter Kurs an dieser Stelle waere kein ungenauer Wert,
         sondern ein falscher, und ein Pflichtfeld erzwaenge genau das.
         Welche Stufe tatsaechlich vorliegt, sagt adjustmentStatus. */
      adjustedClose: { t: "number", r: false },

      /* Die uebrigen bereinigten Werte, sofern der Anbieter sie mitliefert.
         Tiingo tut das, Twelve Data nicht. Optional, weil ihr Fehlen kein
         Mangel der Bar ist, sondern eine Eigenschaft der Quelle. */
      adjustedOpen:   { t: "number", r: false },
      adjustedHigh:   { t: "number", r: false },
      adjustedLow:    { t: "number", r: false },
      adjustedVolume: { t: "number", r: false },

      /* Welche Bereinigung diese Bar traegt. Siehe
         quant/methodology/price-adjustment-v1.json - das Feld ist die
         Verbindung zwischen der Providerschicht und der Semantik aus
         Phase 3 und darum kanonisch, nicht vendor-spezifisch. */
      adjustmentStatus: { t: "string", r: false, e: ADJUSTMENT_STATUS },

      /* Kapitalmassnahmen an genau diesem Tag, sofern der Anbieter sie in
         der Kursreihe mitfuehrt. splitFactor 1 und dividend 0 heissen: an
         diesem Tag ist nichts passiert. Ohne Angabe: unbekannt. Der
         Unterschied traegt - aus splitFactor laesst sich eine Reihe selbst
         hochstufen, aus einem fehlenden Feld nicht. */
      splitFactor: { t: "number", r: false },
      dividend:    { t: "number", r: false },

      /* Der Zeitpunkt innerhalb des Handelstages. Eine Tagesbar hat ihn
         nicht, eine Intraday-Bar braucht ihn - und `date` bleibt in beiden
         Faellen der Handelstag. Ohne diese Trennung muesste alles
         Nachgelagerte zwei Schreibweisen fuer denselben Bezug kennen:
         genau daran ist der 1T-Chart gescheitert, als der Adapter nur
         `timestamp` lieferte und die Chartschicht `date` las. */
      timestamp:  { t: "datetime", r: false },

      currency:   { t: "string", r: true },
      dataSourceId: { t: "string", r: true }
    },
    CorporateAction: {
      actionId:   { t: "string", r: true },
      securityId: { t: "string", r: true },
      type:       { t: "string", r: true, e: CORPORATE_ACTION_TYPES },
      exDate:     { t: "date", r: true },
      /* announcedAt: ab wann die Massnahme bekannt war — auch Corporate
         Actions unterliegen der Point-in-Time-Regel. */
      announcedAt: { t: "date", r: true },
      ratio:      { t: "number", r: false },   // Split: neue je alte Aktie
      amount:     { t: "number", r: false },   // Dividende je Aktie
      currency:   { t: "string", r: false },
      notes:      { t: "string", r: false },
      dataSourceId: { t: "string", r: true }
    },

    /* --- Fundamentals (bitemporal) ------------------------------------- */
    Filing: {
      filingId:   { t: "string", r: true },
      securityId: { t: "string", r: true },
      formType:   { t: "string", r: true },
      fiscalPeriod: { t: "string", r: true, e: FISCAL_PERIODS },
      fiscalYear: { t: "number", r: true },
      periodEnd:  { t: "date", r: true },
      filedAt:    { t: "date", r: true },
      restatementStatus: { t: "string", r: true, e: RESTATEMENT_STATUS },
      dataSourceId: { t: "string", r: true }
    },
    /* Das zentrale Objekt des gesamten Systems (§11). */
    FundamentalFact: {
      securityId:  { t: "string", r: true },
      metricId:    { t: "string", r: true },
      fiscalPeriod:{ t: "string", r: true, e: FISCAL_PERIODS },
      fiscalYear:  { t: "number", r: true },
      periodEnd:   { t: "date", r: true },     // Ende der Berichtsperiode
      value:       { t: "number", r: false },  // null = fehlend, nicht 0
      unit:        { t: "string", r: true },
      currency:    { t: "string", r: false },
      reportedAt:  { t: "date", r: true },     // Veroeffentlichung durch Unternehmen
      filedAt:     { t: "date", r: true },     // Einreichung des Filings
      availableAt: { t: "date", r: true },     // ab wann fuer VU nutzbar — DIE Entscheidungsgrenze
      ingestedAt:  { t: "datetime", r: true }, // wann VU den Datensatz aufgenommen hat
      revisionId:  { t: "number", r: true },   // 0 = Original, 1..n = Revisionen
      restatementStatus: { t: "string", r: true, e: RESTATEMENT_STATUS },
      sourceFilingId: { t: "string", r: false },
      dataSourceId: { t: "string", r: true }
    },
    EstimateSnapshot: {
      securityId:  { t: "string", r: true },
      metricId:    { t: "string", r: true },
      fiscalPeriod:{ t: "string", r: true, e: FISCAL_PERIODS },
      fiscalYear:  { t: "number", r: true },
      consensusMean: { t: "number", r: false },
      analystCount:{ t: "number", r: false },
      snapshotAt:  { t: "date", r: true },
      availableAt: { t: "date", r: true },
      dataSourceId: { t: "string", r: true }
    },

    /* --- Quant --------------------------------------------------------- */
    FactorDefinition: {
      factorId:    { t: "string", r: true, e: FACTOR_IDS },
      label:       { t: "string", r: true },
      description: { t: "string", r: true },
      components:  { t: "array", r: true },
      methodologyVersion: { t: "string", r: true }
    },
    FactorSnapshot: {
      securityId:  { t: "string", r: true },
      factorId:    { t: "string", r: true, e: FACTOR_IDS },
      asOf:        { t: "date", r: true },
      score:       { t: "number", r: false },   // 0..100 Perzentil, null wenn nicht berechenbar
      components:  { t: "object", r: true },    // componentId -> {raw, percentile, asOf}
      coverage:    { t: "number", r: true },    // 0..1
      methodologyVersion: { t: "string", r: true },
      peerGroup:   { t: "string", r: true },    // "industry:Semiconductors" | "sector:..." | "universe"
      dataSnapshotId: { t: "string", r: true }
    },
    QuantScoreSnapshot: {
      securityId:  { t: "string", r: true },
      asOf:        { t: "date", r: true },
      score:       { t: "number", r: false },   // 0..100, null bei INCOMPLETE
      status:      { t: "string", r: true },    // "scored" | "incomplete"
      factorScores:{ t: "object", r: true },
      factorContributions: { t: "object", r: true },
      coverage:    { t: "number", r: true },
      confidence:  { t: "string", r: true, e: COVERAGE_CONFIDENCE },
      methodologyVersion: { t: "string", r: true },
      dataSnapshotId: { t: "string", r: true }
    },

    /* --- Universe ------------------------------------------------------ */
    Universe: {
      universeId: { t: "string", r: true },
      name:       { t: "string", r: true },
      region:     { t: "string", r: true },
      assetType:  { t: "string", r: true, e: ASSET_TYPES },
      rules:      { t: "object", r: true }
    },
    /* Historische Mitgliedschaft — Voraussetzung gegen Survivorship Bias (§39). */
    UniverseMembership: {
      universeId: { t: "string", r: true },
      securityId: { t: "string", r: true },
      validFrom:  { t: "date", r: true },
      validTo:    { t: "date", r: false },      // null = weiterhin Mitglied
      exitReason: { t: "string", r: false }
    },

    /* --- Strategy ------------------------------------------------------ */
    StrategyDefinition: {
      strategyId:  { t: "string", r: true },
      name:        { t: "string", r: true },
      thesis:      { t: "string", r: true },
      origin:      { t: "string", r: true },    // "library" | "builder" | "ai"
      createdAt:   { t: "datetime", r: true },
      latestVersion: { t: "number", r: true }
    },
    StrategyVersion: {
      strategyId:    { t: "string", r: true },
      version:       { t: "number", r: true },
      parentVersion: { t: "number", r: false },
      changeReason:  { t: "string", r: true },
      createdAt:     { t: "datetime", r: true },
      definitionHash:{ t: "string", r: true },
      definition:    { t: "object", r: true }
    },

    /* --- Backtest ------------------------------------------------------ */
    BacktestRun: {
      backtestId:  { t: "string", r: true },
      strategyId:  { t: "string", r: true },
      strategyVersion: { t: "number", r: true },
      startDate:   { t: "date", r: true },
      endDate:     { t: "date", r: true },
      engineVersion: { t: "string", r: true },
      methodologyVersion: { t: "string", r: true },
      dataSnapshotId: { t: "string", r: true },
      reproductionHash: { t: "string", r: true },
      createdAt:   { t: "datetime", r: true }
    },
    BacktestPosition: {
      backtestId: { t: "string", r: true },
      date:       { t: "date", r: true },
      securityId: { t: "string", r: true },
      shares:     { t: "number", r: true },
      price:      { t: "number", r: true },
      weight:     { t: "number", r: true }
    },
    BacktestTrade: {
      backtestId: { t: "string", r: true },
      date:       { t: "date", r: true },
      securityId: { t: "string", r: true },
      side:       { t: "string", r: true },     // "open" | "close" | "adjust"
      shares:     { t: "number", r: true },
      price:      { t: "number", r: true },
      grossValue: { t: "number", r: true },
      costs:      { t: "number", r: true },
      reason:     { t: "string", r: true }
    },
    BacktestMetric: {
      backtestId: { t: "string", r: true },
      metricId:   { t: "string", r: true },
      value:      { t: "number", r: false },
      unit:       { t: "string", r: true }
    },

    /* --- Portfolio / Watchlist ----------------------------------------- */
    Portfolio: {
      portfolioId: { t: "string", r: true }, name: { t: "string", r: true },
      currency: { t: "string", r: true }, createdAt: { t: "datetime", r: true }
    },
    PortfolioHolding: {
      portfolioId: { t: "string", r: true }, securityId: { t: "string", r: true },
      shares: { t: "number", r: true }, costBasis: { t: "number", r: false }, asOf: { t: "date", r: true }
    },
    Watchlist: {
      watchlistId: { t: "string", r: true }, name: { t: "string", r: true },
      securityIds: { t: "array", r: true }, createdAt: { t: "datetime", r: true }
    },
    IntelligenceEvent: {
      eventId:     { t: "string", r: true },
      securityId:  { t: "string", r: true },
      eventType:   { t: "string", r: true },
      severity:    { t: "string", r: true, e: EVENT_SEVERITY },
      previousValue: { t: "number", r: false },
      newValue:    { t: "number", r: false },
      occurredAt:  { t: "date", r: true },
      detectedAt:  { t: "date", r: true },
      methodologyVersion: { t: "string", r: true },
      headline:    { t: "string", r: true }
    },

    /* --- Provenance ---------------------------------------------------- */
    DataSource: {
      dataSourceId: { t: "string", r: true },
      provider:     { t: "string", r: true },
      dataset:      { t: "string", r: true },
      isMock:       { t: "boolean", r: true },
      licenseStatus:{ t: "string", r: true },   // "mock" | "internal_use_todo" | "display_todo"
      pitCapable:   { t: "boolean", r: true }
    },
    DataProvenance: {
      provider:    { t: "string", r: true },
      source:      { t: "string", r: true },
      asOf:        { t: "date", r: true },
      availableAt: { t: "date", r: false },
      ingestedAt:  { t: "datetime", r: true },
      methodologyVersion: { t: "string", r: false },
      dataSnapshotId: { t: "string", r: true },
      isMock:      { t: "boolean", r: true }
    }
  };

  // ---------------------------------------------------------------------
  // Validierung
  // ---------------------------------------------------------------------
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

  function typeOk(value, t) {
    switch (t) {
      case "string":   return typeof value === "string";
      case "number":   return typeof value === "number" && Number.isFinite(value);
      case "boolean":  return typeof value === "boolean";
      case "date":     return typeof value === "string" && DATE_RE.test(value);
      case "datetime": return typeof value === "string" && DATETIME_RE.test(value);
      case "array":    return Array.isArray(value);
      case "object":   return value !== null && typeof value === "object" && !Array.isArray(value);
      default:         return false;
    }
  }

  /**
   * Validiert ein Objekt gegen eine Entitaet des kanonischen Modells.
   * @returns {{valid:boolean, errors:string[]}}
   */
  function validate(entityName, obj) {
    var spec = ENTITIES[entityName];
    var errors = [];
    if (!spec) return { valid: false, errors: ["unknown entity: " + entityName] };
    if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
      return { valid: false, errors: [entityName + ": expected object"] };
    }
    Object.keys(spec).forEach(function (field) {
      var def = spec[field];
      var v = obj[field];
      var missing = v === undefined || v === null;
      if (missing) {
        if (def.r) errors.push(entityName + "." + field + ": required");
        return;
      }
      if (!typeOk(v, def.t)) {
        errors.push(entityName + "." + field + ": expected " + def.t + ", got " + JSON.stringify(v));
        return;
      }
      if (def.e && def.e.indexOf(v) === -1) {
        errors.push(entityName + "." + field + ": '" + v + "' not in [" + def.e.join(", ") + "]");
      }
    });
    /* Unbekannte Felder sind ein Architekturfehler: so schleichen sich
       Vendor-spezifische Felder ins kanonische Modell (§9). */
    Object.keys(obj).forEach(function (field) {
      if (!spec[field]) errors.push(entityName + "." + field + ": unknown field (vendor leakage?)");
    });
    return { valid: errors.length === 0, errors: errors };
  }

  function assertValid(entityName, obj) {
    var res = validate(entityName, obj);
    if (!res.valid) throw new Error("Schema violation — " + res.errors.join("; "));
    return obj;
  }

  // ---------------------------------------------------------------------
  // Point-in-Time-Zugriff (§11, §36, §40)
  // ---------------------------------------------------------------------

  /**
   * DIE zentrale Zugriffsfunktion auf Fundamentaldaten.
   * Liefert den zum Entscheidungszeitpunkt zuletzt BEKANNTEN Wert einer
   * Kennzahl — nicht den heute korrektesten.
   *
   * Regel: availableAt <= decisionDate. Unter mehreren zulaessigen
   * Revisionen gewinnt die zuletzt verfuegbar gewordene; bei gleichem
   * availableAt die hoehere revisionId.
   *
   * @param {Array} facts       FundamentalFact[] einer Security
   * @param {string} metricId
   * @param {string} decisionDate  YYYY-MM-DD
   * @param {object} [opts]     {periodEnd} um eine bestimmte Periode zu erfragen
   */
  function latestKnownFact(facts, metricId, decisionDate, opts) {
    var wantPeriodEnd = opts && opts.periodEnd;
    var best = null;
    for (var i = 0; i < facts.length; i++) {
      var f = facts[i];
      if (f.metricId !== metricId) continue;
      if (f.availableAt > decisionDate) continue;             // Look-Ahead-Sperre
      if (wantPeriodEnd && f.periodEnd !== wantPeriodEnd) continue;
      if (!best) { best = f; continue; }
      if (f.periodEnd > best.periodEnd) { best = f; continue; }
      if (f.periodEnd < best.periodEnd) continue;
      if (f.availableAt > best.availableAt) { best = f; continue; }
      if (f.availableAt === best.availableAt && f.revisionId > best.revisionId) best = f;
    }
    return best;
  }

  /** Die n zuletzt bekannten Perioden einer Kennzahl, neueste zuerst. */
  function latestKnownSeries(facts, metricId, decisionDate, count) {
    var byPeriod = Object.create(null);
    for (var i = 0; i < facts.length; i++) {
      var f = facts[i];
      if (f.metricId !== metricId) continue;
      if (f.availableAt > decisionDate) continue;
      var cur = byPeriod[f.periodEnd];
      if (!cur || f.availableAt > cur.availableAt ||
         (f.availableAt === cur.availableAt && f.revisionId > cur.revisionId)) {
        byPeriod[f.periodEnd] = f;
      }
    }
    var out = Object.keys(byPeriod).sort().reverse().map(function (p) { return byPeriod[p]; });
    return count ? out.slice(0, count) : out;
  }

  /** War die Security am Stichtag Teil des handelbaren Universums? */
  function wasListed(security, date) {
    if (date < security.firstTradingDate) return false;
    if (security.lastTradingDate && date > security.lastTradingDate) return false;
    return true;
  }

  // ---------------------------------------------------------------------
  // Provenance
  // ---------------------------------------------------------------------

  // ---------------------------------------------------------------------
  // Bulk-Repraesentation von Fundamentaldaten
  //
  // FundamentalPeriod ist eine verlustfreie, kompakte Kodierung mehrerer
  // FundamentalFacts derselben Periode und Revision. Sie existiert aus
  // einem einzigen Grund: 500 Titel x 80 Quartale x 15 Kennzahlen sind
  // 600.000 Einzelobjekte, und Cross-Sectional-Quant braucht sie am Stueck.
  // expandPeriodToFacts() beweist die Aequivalenz zur kanonischen Form und
  // wird genau dafuer getestet.
  // ---------------------------------------------------------------------
  var METRIC_UNITS = {
    revenue: "usd_m", grossProfit: "usd_m", operatingIncome: "usd_m", netIncome: "usd_m",
    ebitda: "usd_m", freeCashFlow: "usd_m", totalAssets: "usd_m", totalEquity: "usd_m",
    netDebt: "usd_m", investedCapital: "usd_m", capex: "usd_m", interestExpense: "usd_m",
    sharesOutstanding: "count_m", dividendPerShare: "usd", accruals: "ratio"
  };

  function expandPeriodToFacts(period, securityId, dataSourceId) {
    var out = [];
    Object.keys(period.values).forEach(function (metricId) {
      var unit = METRIC_UNITS[metricId] || "ratio";
      out.push({
        securityId: securityId,
        metricId: metricId,
        fiscalPeriod: period.fiscalPeriod,
        fiscalYear: period.fiscalYear,
        periodEnd: period.periodEnd,
        value: period.values[metricId] === null ? undefined : period.values[metricId],
        unit: unit,
        currency: unit === "ratio" || unit === "count_m" ? undefined : "USD",
        reportedAt: period.reportedAt,
        filedAt: period.filedAt,
        availableAt: period.availableAt,
        ingestedAt: period.ingestedAt,
        revisionId: period.revisionId,
        restatementStatus: period.restatementStatus,
        sourceFilingId: period.sourceFilingId,
        dataSourceId: dataSourceId
      });
    });
    return out;
  }

  /** Die zum Stichtag zuletzt bekannten Perioden (Bulk-Variante von
      latestKnownSeries, arbeitet auf FundamentalPeriod statt Facts). */
  function latestKnownPeriods(periods, decisionDate, count) {
    var byPeriod = Object.create(null);
    for (var i = 0; i < periods.length; i++) {
      var p = periods[i];
      if (p.availableAt > decisionDate) continue;
      var cur = byPeriod[p.periodEnd];
      if (!cur || p.availableAt > cur.availableAt ||
         (p.availableAt === cur.availableAt && p.revisionId > cur.revisionId)) {
        byPeriod[p.periodEnd] = p;
      }
    }
    var keys = Object.keys(byPeriod).sort().reverse();
    if (count) keys = keys.slice(0, count);
    return keys.map(function (k) { return byPeriod[k]; });
  }

  function makeProvenance(fields) {
    return assertValid("DataProvenance", {
      provider: fields.provider,
      source: fields.source,
      asOf: fields.asOf,
      availableAt: fields.availableAt,
      ingestedAt: fields.ingestedAt,
      methodologyVersion: fields.methodologyVersion,
      dataSnapshotId: fields.dataSnapshotId,
      isMock: fields.isMock === true
    });
  }

  function definitionHash(definition) { return Hash.hashValue(definition); }

  var api = {
    ENTITIES: ENTITIES,
    ASSET_TYPES: ASSET_TYPES,
    SECURITY_STATUS: SECURITY_STATUS,
    CORPORATE_ACTION_TYPES: CORPORATE_ACTION_TYPES,
    ADJUSTMENT_STATUS: ADJUSTMENT_STATUS,
    RESTATEMENT_STATUS: RESTATEMENT_STATUS,
    FISCAL_PERIODS: FISCAL_PERIODS,
    FACTOR_IDS: FACTOR_IDS,
    COVERAGE_CONFIDENCE: COVERAGE_CONFIDENCE,
    EVENT_SEVERITY: EVENT_SEVERITY,
    SECTORS: SECTORS,
    INDUSTRIES: INDUSTRIES,
    EXCHANGES: EXCHANGES,
    validate: validate,
    assertValid: assertValid,
    latestKnownFact: latestKnownFact,
    latestKnownSeries: latestKnownSeries,
    wasListed: wasListed,
    METRIC_UNITS: METRIC_UNITS,
    expandPeriodToFacts: expandPeriodToFacts,
    latestKnownPeriods: latestKnownPeriods,
    makeProvenance: makeProvenance,
    definitionHash: definitionHash
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUSchema = api;
})(typeof window !== "undefined" ? window : globalThis);
