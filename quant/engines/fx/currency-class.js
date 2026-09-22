/* =========================================================================
   VISION UNIVERSE — fx/currency-class.js   (Currency Layer V1, §10, §13, §33, §34)

   WELCHE KENNZAHL DARF DER CURRENCY LAYER UEBERHAUPT ANFASSEN?

   Dies ist die Datei, an der sich entscheidet, ob der EUR-Schalter ein
   Produkt verbessert oder es beschaedigt. Eine falsch eingeordnete
   Kennzahl faellt nicht auf: eine Marge, die mit 0,85 multipliziert wurde,
   sieht aus wie eine Marge. Sie ist nur falsch.

   FUENF KLASSEN, UND DIE FUENFTE IST DIE WICHTIGE

   MONETARY_*   Betraege. Werden umgerechnet - jede mit ihrer eigenen
                FX-Regel, weil ein Bilanzwert an einem Tag entsteht und ein
                Umsatz ueber ein Jahr.

   RATIO_METRIC Margen, Renditen auf Kapital, Wachstumsraten,
                Verschuldungsgrade. Werden NIE umgerechnet: Zaehler und
                Nenner tragen dieselbe Waehrung, sie kuerzt sich heraus.

   MULTIPLE     KGV, EV/EBITDA, KUV, KBV. Werden NIE umgerechnet. Ein
                Multiple ist dimensionslos - "KGV in Euro" existiert
                nicht. Was es gibt, ist die Pflicht, Zaehler und Nenner
                VOR der Division auf eine Waehrung zu bringen (§26).

   SCORE/COUNT  Scores, Perzentile, Raenge, Stueckzahlen. Nie.

   PRICE_RETURN Der Sonderfall, der die bequeme Regel "Prozentwerte niemals
                anfassen" widerlegt. Eine Kursrendite in EUR wird nicht
                umgerechnet - sie wird aus der EUR-Kursreihe NEU BERECHNET.
                Eine Aktie mit +100 % in USD kann +107 % in EUR gemacht
                haben, und beide Zahlen sind richtig. Wer PRICE_RETURN wie
                RATIO_METRIC behandelt, zeigt im EUR-Modus einen EUR-Chart
                mit USD-Performance darunter - zwei Zahlen, die nicht
                zueinander gehoeren.

   WOHER DIE EINORDNUNG KOMMT

   Zuerst aus einer ausdruecklichen Zuordnung (METRIC_CLASSES), dann aus
   der Einheit des bestehenden Feldkatalogs. Nie aus dem Namen. "Cash Flow
   Margin" enthaelt "Cash Flow" und ist trotzdem eine Marge; "Dividend per
   Share" enthaelt "per Share" und ist trotzdem ein Betrag. Eine Heuristik
   auf Namen waere genau die stille Vermutung, gegen die dieses Modul
   gebaut ist.

   Eine unbekannte Kennzahl ist UNKNOWN und wird NICHT umgerechnet. Der
   teurere Fehler ist die falsche Umrechnung, nicht die fehlende.

   ZUR EINHEIT "usd_m"

   Der bestehende Katalog nennt Betraege "usd" und "usd_m". Das benennt
   den MASSSTAB (Einzelbetrag / Millionen), nicht die Waehrung des
   konkreten Wertes. Die Waehrung steht am Wert (fact.currency) und wird
   von currency-registry.js aufgeloest. Ein Fact in SEK mit unit "usd_m"
   ist ein Betrag in Millionen SEK - und wuerde von einer Engine, die
   "usd_m" als Waehrungsangabe liest, in USD umgerechnet, ohne je USD
   gewesen zu sein.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var VERSION = "currency-class-1.0.0";

  var CLASSES = {
    MONETARY_STOCK:     "MONETARY_STOCK",
    MONETARY_FLOW:      "MONETARY_FLOW",
    MONETARY_PRICE:     "MONETARY_PRICE",
    MONETARY_PER_SHARE: "MONETARY_PER_SHARE",
    RATIO_METRIC:       "RATIO_METRIC",
    MULTIPLE:           "MULTIPLE",
    SCORE:              "SCORE",
    COUNT:              "COUNT",
    PRICE_RETURN:       "PRICE_RETURN",
    UNKNOWN:            "UNKNOWN"
  };

  /* Welcher Umrechnungskontext je Klasse gilt. Das ist die Bruecke von
     "was ist das fuer eine Zahl" zu "welcher Wechselkurs gilt". */
  var CONTEXT_BY_CLASS = {
    MONETARY_STOCK:     "BALANCE_SHEET",
    MONETARY_FLOW:      "INCOME_STATEMENT",
    MONETARY_PRICE:     "MARKET_PRICE",
    MONETARY_PER_SHARE: "PER_SHARE",
    RATIO_METRIC:       null,
    MULTIPLE:           null,
    SCORE:              null,
    COUNT:              null,
    PRICE_RETURN:       null,
    UNKNOWN:            null
  };

  /* Feinere Herkunft innerhalb einer Klasse.

     MONETARY_FLOW deckt GuV und Kapitalflussrechnung ab - beide folgen
     derselben FX-Regel (Periodendurchschnitt), stammen aber aus
     verschiedenen Rechenwerken. Der Vertrag
     (quant/methodology/currency-fx-v1.json) fuehrt beide Kontexte
     getrennt, und ein Money-Objekt, das fuer den Free Cash Flow
     INCOME_STATEMENT meldet, macht diesen Vertragsteil zu totem Text.

     Die FX-Regel aendert sich dadurch nicht. Die Herkunft schon - und
     sie steht im Ergebnis, weil sie dort hingehoert. */
  var METRIC_CONTEXT_OVERRIDES = {
    operatingCashFlow: "CASH_FLOW", operating_cash_flow: "CASH_FLOW",
    freeCashFlow: "CASH_FLOW", free_cash_flow: "CASH_FLOW",
    capex: "CASH_FLOW", capitalExpenditures: "CASH_FLOW", capital_expenditures: "CASH_FLOW",
    dividendsPaid: "CASH_FLOW", dividends_paid: "CASH_FLOW"
  };

  var CONVERTS = {
    MONETARY_STOCK: true, MONETARY_FLOW: true, MONETARY_PRICE: true, MONETARY_PER_SHARE: true,
    RATIO_METRIC: false, MULTIPLE: false, SCORE: false, COUNT: false,
    PRICE_RETURN: false, UNKNOWN: false
  };

  /* Ausdrueckliche Zuordnung. Die Schluessel decken die Bezeichner ab, die
     im Repository tatsaechlich vorkommen: die kanonischen SEC-metricIds,
     die Spalten des Consumer-Fundamentalvertrags (snake_case) und die
     Felder des Screener-Katalogs. Drei Schreibweisen fuer dieselbe Sache
     sind kein schoener Zustand - aber sie sind der Zustand, und eine
     Zuordnung, die nur eine davon kennt, schuetzt nur ein Drittel des
     Systems. */
  var METRIC_CLASSES = {
    /* --- Bilanz: Stichtagsgroessen (§32) --- */
    totalAssets: "MONETARY_STOCK", total_assets: "MONETARY_STOCK",
    totalEquity: "MONETARY_STOCK", stockholders_equity: "MONETARY_STOCK",
    netDebt: "MONETARY_STOCK", net_debt: "MONETARY_STOCK",
    totalDebt: "MONETARY_STOCK", total_debt: "MONETARY_STOCK",
    longTermDebt: "MONETARY_STOCK", long_term_debt: "MONETARY_STOCK",
    cash: "MONETARY_STOCK", cashAndEquivalents: "MONETARY_STOCK", cash_and_equivalents: "MONETARY_STOCK",
    marketableSecurities: "MONETARY_STOCK", inventory: "MONETARY_STOCK", receivables: "MONETARY_STOCK",
    investedCapital: "MONETARY_STOCK", invested_capital: "MONETARY_STOCK",
    /* Boersenwert und Unternehmenswert sind Stichtagsgroessen aus einem
       Kurs mal einer Stueckzahl. Historisch heisst das: historischer Kurs
       mal historische Stueckzahl, dann historischer FX-Stand (§27). */
    marketCap: "MONETARY_STOCK", market_cap: "MONETARY_STOCK",
    enterpriseValue: "MONETARY_STOCK", enterprise_value: "MONETARY_STOCK",

    /* --- GuV und Cashflow: Flussgroessen (§31) --- */
    revenue: "MONETARY_FLOW",
    grossProfit: "MONETARY_FLOW", gross_profit: "MONETARY_FLOW",
    operatingIncome: "MONETARY_FLOW", operating_income: "MONETARY_FLOW",
    ebit: "MONETARY_FLOW", ebitda: "MONETARY_FLOW",
    netIncome: "MONETARY_FLOW", net_income: "MONETARY_FLOW",
    operatingCashFlow: "MONETARY_FLOW", operating_cash_flow: "MONETARY_FLOW",
    freeCashFlow: "MONETARY_FLOW", free_cash_flow: "MONETARY_FLOW",
    capex: "MONETARY_FLOW", capitalExpenditures: "MONETARY_FLOW", capital_expenditures: "MONETARY_FLOW",
    dividendsPaid: "MONETARY_FLOW", dividends_paid: "MONETARY_FLOW",
    stockBasedCompensation: "MONETARY_FLOW", stock_based_compensation: "MONETARY_FLOW",
    interestExpense: "MONETARY_FLOW", interest_expense: "MONETARY_FLOW",
    accruals: "MONETARY_FLOW",
    avgDollarVolume: "MONETARY_FLOW",

    /* --- Kurs --- */
    price: "MONETARY_PRICE", close: "MONETARY_PRICE", adjustedClose: "MONETARY_PRICE",
    open: "MONETARY_PRICE", high: "MONETARY_PRICE", low: "MONETARY_PRICE",
    last: "MONETARY_PRICE", bid: "MONETARY_PRICE", ask: "MONETARY_PRICE",

    /* --- Je Aktie: monetaer, aber nicht alle (§34) --- */
    eps: "MONETARY_PER_SHARE", epsDiluted: "MONETARY_PER_SHARE", eps_diluted: "MONETARY_PER_SHARE",
    bookValuePerShare: "MONETARY_PER_SHARE", book_value_per_share: "MONETARY_PER_SHARE",
    fcfPerShare: "MONETARY_PER_SHARE", revenuePerShare: "MONETARY_PER_SHARE",
    dividendPerShare: "MONETARY_PER_SHARE", dividend_per_share: "MONETARY_PER_SHARE",

    /* --- Verhaeltniszahlen: nie umrechnen (§33) --- */
    operatingMargin: "RATIO_METRIC", grossMargin: "RATIO_METRIC", netMargin: "RATIO_METRIC",
    fcfMargin: "RATIO_METRIC", marginExpansion: "RATIO_METRIC",
    roe: "RATIO_METRIC", roa: "RATIO_METRIC", roic: "RATIO_METRIC",
    grossProfitability: "RATIO_METRIC", leverage: "RATIO_METRIC", debtToEquity: "RATIO_METRIC",
    revenueGrowth: "RATIO_METRIC", epsGrowth: "RATIO_METRIC", fcfGrowth: "RATIO_METRIC",
    dividendYield: "RATIO_METRIC", earningsYield: "RATIO_METRIC", fcfYield: "RATIO_METRIC",
    volatility: "RATIO_METRIC", downsideVolatility: "RATIO_METRIC", maxDrawdown: "RATIO_METRIC",
    beta: "RATIO_METRIC", coverage: "RATIO_METRIC",
    technicalRiskReward: "RATIO_METRIC", technicalDistanceTo52wHigh: "RATIO_METRIC",
    distanceTo52wHigh: "RATIO_METRIC", priceTo50dma: "RATIO_METRIC", priceTo200dma: "RATIO_METRIC",

    /* --- Multiples: dimensionslos (§13 D, §33) --- */
    pe: "MULTIPLE", peRatio: "MULTIPLE", priceToEarnings: "MULTIPLE", kgv: "MULTIPLE",
    priceToSales: "MULTIPLE", priceToBook: "MULTIPLE", priceToFcf: "MULTIPLE",
    evToEbitda: "MULTIPLE", evToSales: "MULTIPLE",

    /* --- Scores und Zaehlungen --- */
    quantScore: "SCORE", qualityScore: "SCORE", momentumScore: "SCORE", valueScore: "SCORE",
    growthScore: "SCORE", riskScore: "SCORE", balanceSheetQuality: "SCORE", trustScore: "SCORE",
    scoreVelocity30d: "SCORE", scoreVelocity60d: "SCORE", scoreAcceleration: "SCORE",
    technicalOpportunityScore: "SCORE", technicalOpportunityPercentile: "SCORE",
    technicalScenarioConfidence: "SCORE", technicalRelativeStrengthPercentile: "SCORE",
    sharesOutstanding: "COUNT", shares_outstanding: "COUNT",
    dilutedWeightedAverageShares: "COUNT", diluted_weighted_average_shares: "COUNT",
    volume: "COUNT", employees: "COUNT", consecutiveDividendGrowthYears: "COUNT",

    /* --- Kursrenditen: neu berechnen, nicht umrechnen (§10, §41) --- */
    momentum3m: "PRICE_RETURN", momentum6m: "PRICE_RETURN", momentum12m: "PRICE_RETURN",
    momentum12m1m: "PRICE_RETURN", relativeStrength: "PRICE_RETURN",
    technicalMomentum12MReturn: "PRICE_RETURN",
    priceReturn1d: "PRICE_RETURN", priceReturn1w: "PRICE_RETURN", priceReturn1m: "PRICE_RETURN",
    priceReturn6m: "PRICE_RETURN", priceReturn1y: "PRICE_RETURN", priceReturn5y: "PRICE_RETURN",
    priceReturnMax: "PRICE_RETURN", totalReturn: "PRICE_RETURN", cagr: "PRICE_RETURN",
    performance: "PRICE_RETURN"
  };

  /* Einheiten des bestehenden Katalogs als zweite Instanz. Absichtlich
     nur dort entscheidend, wo die Einheit eindeutig ist: "pct" allein
     verraet nicht, ob eine Marge oder eine Kursrendite gemeint ist, und
     deshalb landet ein unbekanntes pct-Feld nicht bei RATIO_METRIC,
     sondern bei UNKNOWN. */
  var UNIT_CLASSES = {
    usd: "MONETARY_STOCK", usd_m: "MONETARY_STOCK", USD: "MONETARY_STOCK",
    "USD/shares": "MONETARY_PER_SHARE",
    x: "MULTIPLE",
    score: "SCORE", pctl: "SCORE",
    count: "COUNT", count_m: "COUNT", shares: "COUNT", years: "COUNT"
  };

  function classify(metricId, opts) {
    opts = opts || {};

    if (opts.classOverride && CLASSES[opts.classOverride]) {
      return describe(opts.classOverride, "OVERRIDE", metricId);
    }

    var id = typeof metricId === "string" ? metricId : null;
    if (id && METRIC_CLASSES[id]) return describe(METRIC_CLASSES[id], "METRIC_MAP", id);

    /* Die Einheit hilft nur, wenn sie eindeutig ist. "usd_m" bei einem
       unbekannten Bezeichner heisst: ein Betrag, aber wir wissen nicht,
       ob Stichtag oder Periode. Das ist keine Einordnung, mit der man
       einen Wechselkurs waehlen kann - also UNKNOWN_MONETARY statt einer
       geratenen FX-Regel. */
    var unit = opts.unit;
    if (unit && UNIT_CLASSES[unit]) {
      var cls = UNIT_CLASSES[unit];
      if (cls === "MONETARY_STOCK" && !id) {
        return describe("UNKNOWN", "UNIT_AMBIGUOUS", id,
          "Einheit " + unit + " weist einen Betrag aus, aber ohne Bezeichner ist nicht entscheidbar, ob Stichtag oder Berichtsperiode gilt.");
      }
      if (cls === "MONETARY_STOCK" && id) {
        return describe("UNKNOWN", "UNIT_AMBIGUOUS", id,
          "Einheit " + unit + " weist einen Betrag aus; die Kennzahl '" + id + "' ist aber keiner FX-Regel zugeordnet. " +
          "Eintrag in METRIC_CLASSES ergaenzen, statt zwischen Stichtag und Periode zu raten.");
      }
      return describe(cls, "UNIT_MAP", id);
    }

    return describe("UNKNOWN", "UNMAPPED", id,
      "Kennzahl '" + (id || "?") + "' ist dem Currency Layer nicht bekannt. Sie wird nicht umgerechnet.");
  }

  function describe(cls, provenance, metricId, note) {
    var context = CONTEXT_BY_CLASS[cls] || null;
    if (context && metricId && METRIC_CONTEXT_OVERRIDES[metricId]) {
      context = METRIC_CONTEXT_OVERRIDES[metricId];
    }
    return {
      metricId: metricId || null,
      currencyClass: cls,
      converts: CONVERTS[cls] === true,
      /* Der Sonderfall bekommt ein eigenes Flag, damit ihn niemand
         uebersieht: false bei `converts` und true bei `recompute`. */
      recomputeFromDisplaySeries: cls === "PRICE_RETURN",
      conversionContext: context,
      provenance: provenance,
      note: note || null
    };
  }

  /** Bequemlichkeit fuer Aufrufer, die nur die Ja/Nein-Frage haben. */
  function converts(metricId, opts) { return classify(metricId, opts).converts === true; }

  /**
   * Die Gegenprobe fuer Regressionstests: welche Kennzahlen darf ein
   * Waehrungswechsel veraendern? Genau die monetaeren und die
   * Kursrenditen - Letztere jedoch durch Neuberechnung, nicht durch
   * Multiplikation.
   */
  function invariantUnderCurrencySwitch(metricId, opts) {
    var c = classify(metricId, opts);
    return c.converts === false && c.recomputeFromDisplaySeries === false;
  }

  var api = {
    VERSION: VERSION,
    CLASSES: CLASSES, CONVERTS: CONVERTS, CONTEXT_BY_CLASS: CONTEXT_BY_CLASS,
    METRIC_CONTEXT_OVERRIDES: METRIC_CONTEXT_OVERRIDES,
    METRIC_CLASSES: METRIC_CLASSES, UNIT_CLASSES: UNIT_CLASSES,
    classify: classify, converts: converts,
    invariantUnderCurrencySwitch: invariantUnderCurrencySwitch
  };

  if (isNode) module.exports = api;
  else { global.VUFx = global.VUFx || {}; global.VUFx.Class = api; }
})(typeof window !== "undefined" ? window : globalThis);
