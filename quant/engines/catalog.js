/* =========================================================================
   VISION UNIVERSE QUANT — catalog.js
   FINANCIAL ONTOLOGY / FIELD CATALOG

   Ein einziger Katalog aller abfragbaren Felder. Er ist die gemeinsame
   Sprache von Screener, VUQL, Strategy Engine und AI Tool Layer (§27:
   "Screener und AI muessen dieselbe Query Engine nutzen" — die
   Voraussetzung dafuer ist, dass beide dieselbe Feldliste kennen).

   Ein Feld existiert genau einmal. Wer ein Feld ergaenzt, ergaenzt es hier
   und es steht automatisch in Screener-UI, VUQL-Parser, Query-Validierung,
   Strategy-Filtern und AI-Tool-Beschreibung zur Verfuegung.

   unit-Semantik (§30 "Units validieren"):
     pct    Prozent, als Prozentzahl gespeichert (12.5 = 12,5 %)
     ratio  dimensionsloses Verhaeltnis
     x      Multiplikator (EV/EBITDA = 14.2x)
     usd    Betrag in USD
     usd_m  Betrag in Mio. USD
     score  0..100
     pctl   Perzentil 0..100
     count  Anzahl
     years  Jahre
   ========================================================================= */
(function (global) {
  "use strict";

  var Schema = (typeof module !== "undefined" && module.exports)
    ? require("./schema.js") : global.VUSchema;

  var OPERATORS = {
    eq:    { label: "=",  arity: 1, types: ["number", "string", "enum", "boolean"] },
    ne:    { label: "≠",  arity: 1, types: ["number", "string", "enum", "boolean"] },
    gt:    { label: ">",  arity: 1, types: ["number"] },
    gte:   { label: "≥",  arity: 1, types: ["number"] },
    lt:    { label: "<",  arity: 1, types: ["number"] },
    lte:   { label: "≤",  arity: 1, types: ["number"] },
    in:    { label: "in", arity: "list", types: ["string", "enum"] },
    notIn: { label: "not in", arity: "list", types: ["string", "enum"] },
    between: { label: "between", arity: 2, types: ["number"] }
  };

  function f(id, label, type, unit, category, opts) {
    opts = opts || {};
    return {
      id: id,
      label: label,
      type: type,                          // "number" | "string" | "enum" | "boolean"
      unit: unit,
      category: category,                  // reference | market | quality | momentum | value | growth | risk | income | score
      higherIsBetter: opts.higherIsBetter === undefined ? null : opts.higherIsBetter,
      percentileAvailable: opts.pctl === true,
      values: opts.values || null,
      description: opts.description || "",
      /* factorComponent: dieses Feld ist Bestandteil des genannten Faktors
         und wird von factors.js verwendet. */
      factorComponent: opts.factorComponent || null,
      /* VUQL-Token. Standard ist die abgeleitete SCREAMING_SNAKE_CASE-Form;
         wo diese schlecht lesbar waere (DISTANCE_TO52W_HIGH), steht hier ein
         explizites Token. aliases erlauben zusaetzliche Schreibweisen, damit
         eingespielte Kurzformen (FCF, DIV_GROWTH_YEARS) gueltig bleiben. */
      token: opts.token || null,
      aliases: opts.aliases || []
    };
  }

  var FIELD_LIST = [
    /* --- Reference ---------------------------------------------------- */
    f("ticker", "Ticker", "string", null, "reference"),
    f("name", "Name", "string", null, "reference"),
    f("sector", "Sektor", "enum", null, "reference", { values: Schema.SECTORS }),
    f("industry", "Industrie", "enum", null, "reference", {
      values: Object.keys(Schema.INDUSTRIES).reduce(function (acc, s) {
        return acc.concat(Schema.INDUSTRIES[s]); }, [])
    }),
    f("country", "Land", "enum", null, "reference", { values: ["US"] }),
    f("assetType", "Asset-Typ", "enum", null, "reference", { values: Schema.ASSET_TYPES }),
    f("status", "Listing-Status", "enum", null, "reference", { values: Schema.SECURITY_STATUS }),

    /* --- Market ------------------------------------------------------- */
    f("price", "Kurs", "number", "usd", "market", { description: "Letzter Schlusskurs" }),
    f("marketCap", "Market Cap", "number", "usd_m", "market", { pctl: true, description: "Marktkapitalisierung in Mio. USD" }),
    f("avgDollarVolume", "Ø Handelsvolumen", "number", "usd_m", "market", { pctl: true, description: "60-Tage-Durchschnitt in Mio. USD/Tag — Liquiditaetsmass" }),

    /* --- Quality ------------------------------------------------------ */
    f("roic", "ROIC", "number", "pct", "quality", { higherIsBetter: true, pctl: true, factorComponent: "quality", description: "Return on Invested Capital, NOPAT / (Eigenkapital + Nettoverschuldung)" }),
    f("grossProfitability", "Gross Profitability", "number", "ratio", "quality", { higherIsBetter: true, pctl: true, factorComponent: "quality", description: "Bruttogewinn / Bilanzsumme (Novy-Marx)" }),
    f("fcfMargin", "FCF-Marge", "number", "pct", "quality", { higherIsBetter: true, pctl: true, factorComponent: "quality", description: "Free Cash Flow / Umsatz" }),
    f("operatingMargin", "Operative Marge", "number", "pct", "quality", { higherIsBetter: true, pctl: true, factorComponent: "quality" }),
    f("balanceSheetQuality", "Bilanzqualitaet", "number", "score", "quality", { higherIsBetter: true, pctl: true, factorComponent: "quality", description: "Zusammengesetzt aus Liquiditaet, Zinsdeckung und Accrual-Anteil" }),
    f("leverage", "Verschuldung", "number", "x", "quality", { higherIsBetter: false, pctl: true, factorComponent: "quality", description: "Nettoverschuldung / EBITDA" }),

    /* --- Momentum ----------------------------------------------------- */
    f("momentum3m", "Momentum 3M", "number", "pct", "momentum", { higherIsBetter: true, pctl: true, factorComponent: "momentum", token: "MOMENTUM_3M" }),
    f("momentum6m", "Momentum 6M", "number", "pct", "momentum", { higherIsBetter: true, pctl: true, factorComponent: "momentum", token: "MOMENTUM_6M" }),
    f("momentum12m", "Momentum 12M", "number", "pct", "momentum", { higherIsBetter: true, pctl: true, factorComponent: "momentum", token: "MOMENTUM_12M" }),
    f("momentum12m1m", "Momentum 12-1", "number", "pct", "momentum", { higherIsBetter: true, pctl: true, factorComponent: "momentum", token: "MOMENTUM_12_1", description: "12-Monats-Rendite ohne den letzten Monat (Jegadeesh/Titman)" }),
    f("relativeStrength", "Relative Staerke", "number", "pct", "momentum", { higherIsBetter: true, pctl: true, factorComponent: "momentum", description: "12M-Rendite abzueglich Universums-Median" }),
    f("distanceTo52wHigh", "Abstand 52W-Hoch", "number", "pct", "momentum", { higherIsBetter: false, pctl: true, factorComponent: "momentum", token: "DISTANCE_52W_HIGH", description: "Prozentualer Abstand unter das 52-Wochen-Hoch (George/Hwang)" }),
    f("priceTo50dma", "Kurs vs. 50DMA", "number", "pct", "momentum", { higherIsBetter: true, pctl: true, factorComponent: "momentum", token: "PRICE_TO_50DMA" }),
    f("priceTo200dma", "Kurs vs. 200DMA", "number", "pct", "momentum", { higherIsBetter: true, pctl: true, factorComponent: "momentum", token: "PRICE_TO_200DMA" }),

    /* --- Value -------------------------------------------------------- */
    f("earningsYield", "Earnings Yield", "number", "pct", "value", { higherIsBetter: true, pctl: true, factorComponent: "value" }),
    f("fcfYield", "FCF-Rendite", "number", "pct", "value", { higherIsBetter: true, pctl: true, factorComponent: "value" }),
    f("evToEbitda", "EV/EBITDA", "number", "x", "value", { higherIsBetter: false, pctl: true, factorComponent: "value", token: "EV_EBITDA" }),
    f("evToSales", "EV/Sales", "number", "x", "value", { higherIsBetter: false, pctl: true, factorComponent: "value", token: "EV_SALES" }),
    f("priceToFcf", "Kurs/FCF", "number", "x", "value", { higherIsBetter: false, pctl: true, factorComponent: "value", token: "PRICE_FCF" }),

    /* --- Growth ------------------------------------------------------- */
    f("revenueGrowth", "Umsatzwachstum", "number", "pct", "growth", { higherIsBetter: true, pctl: true, factorComponent: "growth", description: "Umsatz TTM gegenueber Vorjahr" }),
    f("epsGrowth", "EPS-Wachstum", "number", "pct", "growth", { higherIsBetter: true, pctl: true, factorComponent: "growth" }),
    f("fcfGrowth", "FCF-Wachstum", "number", "pct", "growth", { higherIsBetter: true, pctl: true, factorComponent: "growth" }),
    f("marginExpansion", "Margenausweitung", "number", "pct", "growth", { higherIsBetter: true, pctl: true, factorComponent: "growth", description: "Veraenderung der operativen Marge in Prozentpunkten ggue. Vorjahr" }),

    /* --- Risk --------------------------------------------------------- */
    f("volatility", "Volatilitaet", "number", "pct", "risk", { higherIsBetter: false, pctl: true, factorComponent: "risk", description: "Annualisierte Standardabweichung der Tagesrenditen, 1 Jahr" }),
    f("downsideVolatility", "Downside-Volatilitaet", "number", "pct", "risk", { higherIsBetter: false, pctl: true, factorComponent: "risk" }),
    f("maxDrawdown", "Max. Drawdown", "number", "pct", "risk", { higherIsBetter: false, pctl: true, factorComponent: "risk", description: "Groesster Rueckgang der letzten 12 Monate (positiver Wert)" }),
    f("beta", "Beta", "number", "ratio", "risk", { higherIsBetter: false, pctl: true, factorComponent: "risk", description: "Beta-Proxy gegen das gleichgewichtete Universum" }),

    /* --- Income ------------------------------------------------------- */
    f("dividendYield", "Dividendenrendite", "number", "pct", "income", { higherIsBetter: true, pctl: true }),
    f("consecutiveDividendGrowthYears", "Jahre Dividendenwachstum", "number", "years", "income", { higherIsBetter: true, pctl: true, aliases: ["DIV_GROWTH_YEARS"] }),

    /* --- Fundamentale Rohgroessen (fuer Filter wie "FCF > 0") ---------- */
    f("revenue", "Umsatz TTM", "number", "usd_m", "quality", { higherIsBetter: true, pctl: true }),
    f("freeCashFlow", "Free Cash Flow TTM", "number", "usd_m", "quality", { higherIsBetter: true, pctl: true, aliases: ["FCF"] }),
    f("netIncome", "Nettoergebnis TTM", "number", "usd_m", "quality", { higherIsBetter: true, pctl: true }),

    /* --- Scores ------------------------------------------------------- */
    f("quantScore", "VU Quant Score", "number", "score", "score", { higherIsBetter: true, pctl: false }),
    f("qualityScore", "Quality Score", "number", "score", "score", { higherIsBetter: true }),
    f("momentumScore", "Momentum Score", "number", "score", "score", { higherIsBetter: true }),
    f("valueScore", "Value Score", "number", "score", "score", { higherIsBetter: true }),
    f("growthScore", "Growth Score", "number", "score", "score", { higherIsBetter: true }),
    f("riskScore", "Risk Score", "number", "score", "score", { higherIsBetter: true, description: "Hoeher = geringeres Risiko" }),
    f("coverage", "Datenabdeckung", "number", "ratio", "score", { higherIsBetter: true }),
    f("scoreVelocity30d", "Score-Velocity 30T", "number", "score", "score", { higherIsBetter: true, token: "SCORE_VELOCITY_30D", description: "Veraenderung des VU Quant Score ueber 30 Kalendertage" }),
    f("scoreVelocity60d", "Score-Velocity 60T", "number", "score", "score", { higherIsBetter: true, token: "SCORE_VELOCITY_60D" }),
    f("scoreAcceleration", "Score-Beschleunigung", "number", "score", "score", { higherIsBetter: true, description: "Velocity 30T minus Velocity der vorangegangenen 30 Tage" })
  ];

  var FIELDS = Object.create(null);
  FIELD_LIST.forEach(function (fd) { FIELDS[fd.id] = fd; });

  /* VUQL-Token: SCREAMING_SNAKE_CASE des Feldnamens. Eine einzige Regel,
     damit der Katalog die einzige Wahrheit bleibt und kein zweites
     Namensmapping gepflegt werden muss. */
  function toToken(id) {
    return id.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
             .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
             .toUpperCase();
  }
  var TOKEN_TO_FIELD = Object.create(null);
  FIELD_LIST.forEach(function (fd) {
    if (!fd.token) fd.token = toToken(fd.id);
    TOKEN_TO_FIELD[fd.token] = fd.id;
    fd.aliases.forEach(function (a) { TOKEN_TO_FIELD[a.toUpperCase()] = fd.id; });
  });

  function field(id) { return FIELDS[id] || null; }
  function fieldByToken(token) {
    var id = TOKEN_TO_FIELD[String(token).toUpperCase()];
    return id ? FIELDS[id] : null;
  }
  function tokenOf(id) { return FIELDS[id] ? FIELDS[id].token : toToken(id); }
  function fieldsByCategory(category) {
    return FIELD_LIST.filter(function (fd) { return fd.category === category; });
  }
  function componentsOfFactor(factorId) {
    return FIELD_LIST.filter(function (fd) { return fd.factorComponent === factorId; });
  }
  function operator(op) { return OPERATORS[op] || null; }

  /**
   * Strukturierte Formatierungsteile eines Wertes.
   *
   * Der Grund fuer diese Trennung: Zahl und Einheit muessen getrennt
   * bleiben, damit die Lokalisierung nur die Zahl anfasst. Ein naiver
   * Austausch von "." und "," im fertigen String macht aus "$1.3 Mrd."
   * ein "$1,3 Mrd," — der Punkt der Abkuerzung wird mitgetauscht.
   *
   * @returns {{value:number, digits:number, prefix:string, suffix:string}|null}
   */
  function formatParts(fieldId, value) {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    var fd = FIELDS[fieldId];
    if (!fd) return { value: value, digits: 2, prefix: "", suffix: "" };
    switch (fd.unit) {
      case "pct":   return { value: value, digits: 1, prefix: "", suffix: " %" };
      case "pctl":  return { value: value, digits: 0, prefix: "", suffix: ". Perzentil" };
      case "score": return { value: value, digits: 1, prefix: "", suffix: "" };
      case "x":     return { value: value, digits: 1, prefix: "", suffix: "x" };
      case "usd":   return { value: value, digits: 2, prefix: "$", suffix: "" };
      case "usd_m":
        if (Math.abs(value) >= 1000000) return { value: value / 1000000, digits: 2, prefix: "$", suffix: " Bio." };
        if (Math.abs(value) >= 1000)    return { value: value / 1000, digits: 1, prefix: "$", suffix: " Mrd." };
        return { value: value, digits: 0, prefix: "$", suffix: " Mio." };
      case "count_m": return { value: value, digits: 1, prefix: "", suffix: " Mio." };
      case "ratio": return { value: value, digits: 2, prefix: "", suffix: "" };
      case "years": return { value: value, digits: 0, prefix: "", suffix: " J." };
      case "count": return { value: value, digits: 0, prefix: "", suffix: "" };
      default:      return { value: value, digits: 2, prefix: "", suffix: "" };
    }
  }

  /** Formatierung mit Punkt als Dezimaltrennzeichen (Engine-/Testkontext). */
  function formatValue(fieldId, value) {
    var p = formatParts(fieldId, value);
    if (!p) return "–";
    return p.prefix + p.value.toFixed(p.digits) + p.suffix;
  }

  var api = {
    OPERATORS: OPERATORS,
    FIELD_LIST: FIELD_LIST,
    FIELDS: FIELDS,
    field: field,
    fieldByToken: fieldByToken,
    tokenOf: tokenOf,
    fieldsByCategory: fieldsByCategory,
    componentsOfFactor: componentsOfFactor,
    operator: operator,
    formatValue: formatValue,
    formatParts: formatParts
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUCatalog = api;
})(typeof window !== "undefined" ? window : globalThis);
