/* =========================================================================
   VISION UNIVERSE QUANT — mock-generator.js
   SYNTHETISCHES UNIVERSUM (§7, §12, §13)

   Erzeugt 500 synthetische Securities plus 11 gezielte Edge-Case-Fixtures.
   BEWUSST KEINE realen Unternehmen mit erfundenen Fundamentaldaten: alle
   Titel heissen VU#### / VUF### und tragen isMock = true, damit synthetische
   Werte nie wie echte Investmentdaten wirken koennen (§12, §94).

   DETERMINISMUS IST EINE ARCHITEKTURANFORDERUNG, KEIN DETAIL.
   Gleicher Seed -> bitgleiche Daten in Browser und Node. Nur dadurch ist ein
   reproductionHash eines Backtests (§44) ueberhaupt etwas wert. Deshalb
   Mulberry32 statt Math.random und typisierte Arrays statt Objektlisten.

   Speicher: Preisreihen liegen als Float32Array (ca. 21 MB fuer 511 Titel
   ueber 20 Jahre). Fundamentaldaten liegen intern kompakt je Quartal; die
   Expansion in kanonische FundamentalFact-Objekte passiert im Adapter
   (mock-provider.js) — genau die Grenze, an der auch ein echter Vendor
   uebersetzt wuerde.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("./hash.js") : global.VUHash;
  var Schema = isNode ? require("./schema.js") : global.VUSchema;

  var DEFAULT_SEED = "vision-universe-quant-v1";
  var HISTORY_START = "2006-01-02";
  var HISTORY_END = "2026-09-04";
  var SECURITY_COUNT = 500;
  var DATA_SOURCE_ID = "ds_mock_v1";
  var BENCHMARK_ID = "VUBM_EW";

  // ---------------------------------------------------------------------
  // Datumshilfen (UTC, keine Zeitzonen-Ueberraschungen)
  // ---------------------------------------------------------------------
  var MS_DAY = 86400000;
  function toDate(s) { return new Date(s + "T00:00:00Z"); }
  function toISO(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { return toISO(new Date(toDate(s).getTime() + n * MS_DAY)); }
  function dayDiff(a, b) { return Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS_DAY); }

  /** Handelstage = Wochentage. Feiertage sind bewusst nicht modelliert;
      das ist im Mock-Datensatz dokumentiert und fuer die Faktor- und
      Backtest-Semantik ohne Bedeutung. */
  function buildTradingDays(start, end) {
    var out = [];
    var t = toDate(start).getTime();
    var endT = toDate(end).getTime();
    while (t <= endT) {
      var d = new Date(t);
      var wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) out.push(toISO(d));
      t += MS_DAY;
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Marktregime — sorgt dafuer, dass Backtests echte Zyklen sehen
  // ---------------------------------------------------------------------
  var CRISIS_WINDOWS = [
    { from: "2007-10-10", to: "2009-03-09", drift: -0.00135, vol: 0.0210, label: "Finanzkrise" },
    { from: "2011-07-25", to: "2011-10-03", drift: -0.00160, vol: 0.0180, label: "Eurokrise" },
    { from: "2015-08-10", to: "2016-02-11", drift: -0.00055, vol: 0.0135, label: "Wachstumsangst" },
    { from: "2018-10-01", to: "2018-12-24", drift: -0.00170, vol: 0.0150, label: "Zinsangst" },
    { from: "2020-02-20", to: "2020-03-23", drift: -0.00950, vol: 0.0400, label: "Pandemie-Schock" },
    { from: "2022-01-04", to: "2022-10-12", drift: -0.00110, vol: 0.0150, label: "Zins- und Inflationsschock" },
    { from: "2025-03-10", to: "2025-06-18", drift: -0.00090, vol: 0.0140, label: "Bewertungskorrektur" }
  ];
  var NORMAL_REGIME = { drift: 0.00006, vol: 0.0084 };

  function regimeFor(date) {
    for (var i = 0; i < CRISIS_WINDOWS.length; i++) {
      var w = CRISIS_WINDOWS[i];
      if (date >= w.from && date <= w.to) return w;
    }
    return NORMAL_REGIME;
  }

  /** Gemeinsamer Marktfaktor. Alle Titel laden ueber ihr Beta darauf. */
  function buildMarketReturns(tradingDays, seed) {
    var rand = Hash.mulberry32(Hash.seedFromString(seed + "|market"));
    var out = new Float32Array(tradingDays.length);
    for (var t = 0; t < tradingDays.length; t++) {
      var r = regimeFor(tradingDays[t]);
      out[t] = r.drift + r.vol * Hash.gaussian(rand);
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Archetypen — realistische Streuung statt Gleichverteilung (§12)
  // ---------------------------------------------------------------------
  var ARCHETYPES = {
    compounder:  { share: 0.16, growth: [0.06, 0.14], grossMargin: [0.52, 0.74], opMargin: [0.20, 0.34], capitalIntensity: [0.05, 0.12], vol: [0.19, 0.29], beta: [0.75, 1.05], alpha:  0.00020, leverage: [0.2, 1.6], payout: 0.55, valuationPremium: [1.25, 1.85] },
    hypergrowth: { share: 0.12, growth: [0.20, 0.48], grossMargin: [0.55, 0.80], opMargin: [-0.05, 0.16], capitalIntensity: [0.08, 0.20], vol: [0.38, 0.62], beta: [1.20, 1.75], alpha:  0.00026, leverage: [-0.5, 0.8], payout: 0.00, valuationPremium: [1.90, 3.30] },
    steady:      { share: 0.20, growth: [0.02, 0.08], grossMargin: [0.30, 0.52], opMargin: [0.10, 0.20], capitalIntensity: [0.06, 0.14], vol: [0.15, 0.24], beta: [0.65, 0.95], alpha:  0.00008, leverage: [0.8, 2.6], payout: 0.45, valuationPremium: [0.85, 1.25] },
    cyclical:    { share: 0.16, growth: [-0.06, 0.18], grossMargin: [0.18, 0.36], opMargin: [0.03, 0.16], capitalIntensity: [0.12, 0.26], vol: [0.28, 0.44], beta: [1.15, 1.60], alpha:  0.00004, leverage: [1.2, 3.4], payout: 0.30, valuationPremium: [0.55, 0.95] },
    defensive:   { share: 0.12, growth: [0.01, 0.06], grossMargin: [0.32, 0.50], opMargin: [0.11, 0.21], capitalIntensity: [0.05, 0.11], vol: [0.11, 0.18], beta: [0.40, 0.70], alpha:  0.00006, leverage: [1.0, 2.8], payout: 0.62, valuationPremium: [0.90, 1.30] },
    deepValue:   { share: 0.12, growth: [-0.03, 0.05], grossMargin: [0.16, 0.32], opMargin: [0.04, 0.12], capitalIntensity: [0.10, 0.22], vol: [0.24, 0.38], beta: [0.90, 1.35], alpha: -0.00004, leverage: [1.6, 3.8], payout: 0.40, valuationPremium: [0.32, 0.58] },
    laggard:     { share: 0.12, growth: [-0.12, 0.02], grossMargin: [0.14, 0.30], opMargin: [-0.04, 0.08], capitalIntensity: [0.10, 0.24], vol: [0.30, 0.50], beta: [1.00, 1.45], alpha: -0.00021, leverage: [2.0, 4.5], payout: 0.20, valuationPremium: [0.30, 0.62] }
  };
  var ARCHETYPE_IDS = Object.keys(ARCHETYPES);

  function pickArchetype(rand) {
    var x = rand(), acc = 0;
    for (var i = 0; i < ARCHETYPE_IDS.length; i++) {
      acc += ARCHETYPES[ARCHETYPE_IDS[i]].share;
      if (x <= acc) return ARCHETYPE_IDS[i];
    }
    return ARCHETYPE_IDS[ARCHETYPE_IDS.length - 1];
  }

  function between(rand, range) { return range[0] + rand() * (range[1] - range[0]); }

  /* Kurzformen fuer sprechende, unmissverstaendlich synthetische Namen. */
  var INDUSTRY_SHORT = {
    "Semiconductors": "Semis", "Software Infrastructure": "Software Infra", "Application Software": "AppSoftware",
    "IT Services": "IT Services", "Hardware & Equipment": "Hardware", "Biotechnology": "Biotech",
    "Pharmaceuticals": "Pharma", "Medical Devices": "MedTech", "Healthcare Providers": "Health Services",
    "Banks": "Banking", "Insurance": "Insurance", "Capital Markets": "Capital Markets",
    "Financial Data & Exchanges": "Fin Data", "Specialty Retail": "Retail", "Automobiles": "Auto",
    "Restaurants": "Restaurants", "Leisure Products": "Leisure", "Apparel": "Apparel",
    "Beverages": "Beverages", "Food Products": "Food", "Household Products": "Household",
    "Food & Staples Retailing": "Staples Retail", "Aerospace & Defense": "Aerospace", "Machinery": "Machinery",
    "Transportation & Logistics": "Logistics", "Building Products": "Building", "Commercial Services": "Services",
    "Oil & Gas Exploration": "Upstream", "Oil & Gas Equipment": "Oilfield", "Refining & Marketing": "Refining",
    "Renewable Energy": "Renewables", "Chemicals": "Chemicals", "Metals & Mining": "Mining",
    "Construction Materials": "Materials", "Packaging": "Packaging", "Interactive Media": "Media",
    "Telecom": "Telecom", "Entertainment": "Entertainment", "Publishing": "Publishing",
    "Electric Utilities": "Electric", "Gas Utilities": "Gas", "Water Utilities": "Water",
    "REIT Industrial": "REIT Industrial", "REIT Residential": "REIT Residential",
    "REIT Retail": "REIT Retail", "Real Estate Services": "RE Services"
  };

  /* Sektorgewichte — grob an einer breiten US-Marktverteilung orientiert,
     damit Peer Groups unterschiedlich gross sind und die Fallback-Kette
     Industry -> Sector -> Universe (§18) realistisch getestet wird. */
  var SECTOR_WEIGHTS = [
    ["Technology", 0.22], ["Health Care", 0.13], ["Financials", 0.13],
    ["Consumer Discretionary", 0.11], ["Industrials", 0.10], ["Communication Services", 0.07],
    ["Consumer Staples", 0.06], ["Energy", 0.05], ["Materials", 0.05],
    ["Utilities", 0.04], ["Real Estate", 0.04]
  ];

  function pickSector(rand) {
    var x = rand(), acc = 0;
    for (var i = 0; i < SECTOR_WEIGHTS.length; i++) {
      acc += SECTOR_WEIGHTS[i][1];
      if (x <= acc) return SECTOR_WEIGHTS[i][0];
    }
    return SECTOR_WEIGHTS[0][0];
  }

  // ---------------------------------------------------------------------
  // Edge-Case-Fixtures (§13)
  // ---------------------------------------------------------------------
  var FIXTURES = [
    { fixtureId: "MOCK_HIGH_QUALITY",     ticker: "VUF001", archetype: "compounder",  purpose: "Sehr hohe Quality-Komponenten — prueft die obere Kante der Quality-Normalisierung.",
      overrides: { opMargin: 0.36, grossMargin: 0.72, growth: 0.11, leverage: 0.3, vol: 0.20, beta: 0.85, alpha: 0.00024 } },
    { fixtureId: "MOCK_HIGH_MOMENTUM",    ticker: "VUF002", archetype: "hypergrowth", purpose: "Anhaltend starke Kursentwicklung nahe dem 52-Wochen-Hoch.",
      overrides: { alpha: 0.00090, vol: 0.34, beta: 1.25, growth: 0.30 } },
    { fixtureId: "MOCK_HIGH_GROWTH",      ticker: "VUF003", archetype: "hypergrowth", purpose: "Extremes Umsatzwachstum bei duenner Marge — Growth ohne Quality.",
      overrides: { growth: 0.46, opMargin: 0.02, grossMargin: 0.62, vol: 0.52, beta: 1.55 } },
    { fixtureId: "MOCK_DEEP_VALUE",       ticker: "VUF004", archetype: "deepValue",   purpose: "Sehr niedrige Bewertung bei intakter Cash-Erzeugung.",
      overrides: { valuationPremium: 0.28, opMargin: 0.10, growth: 0.02 } },
    { fixtureId: "MOCK_VALUE_TRAP",       ticker: "VUF005", archetype: "laggard",     purpose: "Optisch guenstig, aber schrumpfend und mit negativem Momentum — der Screener darf das nicht als Value-Chance ausgeben.",
      overrides: { valuationPremium: 0.30, growth: -0.11, opMargin: 0.01, marginTrend: -0.010, alpha: -0.00075, leverage: 4.0 } },
    { fixtureId: "MOCK_LOW_VOL",          ticker: "VUF006", archetype: "defensive",   purpose: "Sehr niedrige Volatilitaet — obere Kante des Risk-Faktors.",
      overrides: { vol: 0.085, beta: 0.32, growth: 0.03 } },
    { fixtureId: "MOCK_MISSING_DATA",     ticker: "VUF007", archetype: "steady",      purpose: "Mehrere Fundamentalkennzahlen fehlen — der Titel darf KEINEN vollstaendigen Quant Score bekommen, sondern muss als INCOMPLETE erscheinen (§21).",
      overrides: {}, missingMetrics: ["freeCashFlow", "ebitda", "investedCapital", "operatingIncome", "grossProfit"] },
    { fixtureId: "MOCK_DELISTED",         ticker: "VUF008", archetype: "cyclical",    purpose: "2019 delistet. Muss im historischen Universum bleiben, damit Backtests keinen Survivorship Bias haben (§39).",
      overrides: { alpha: -0.00120, vol: 0.42, leverage: 3.8 }, delistOn: "2019-06-28" },
    { fixtureId: "MOCK_RESTATEMENT",      ticker: "VUF009", archetype: "steady",      purpose: "Meldet 2017 zu hohe Zahlen und korrigiert sie 2018. Ein Backtest vor der Korrektur darf ausschliesslich die Originalzahlen sehen (§40).",
      overrides: {}, restatement: { periods: ["2017-03-31", "2017-06-30", "2017-09-30"], factor: 0.68, restatedAvailableAt: "2018-05-04" } },
    { fixtureId: "MOCK_FUTURE_DATA_LEAK", ticker: "VUF010", archetype: "compounder",  purpose: "Traegt einen Datensatz, dessen availableAt in der Zukunft liegt. Er darf heute nirgendwo auftauchen (§36).",
      overrides: {}, futureFact: { periodEnd: "2026-09-30", availableAt: "2027-02-11", metric: "revenue", multiple: 2.4 } },
    { fixtureId: "MOCK_CORPORATE_ACTION", ticker: "VUF011", archetype: "compounder",  purpose: "4:1-Split und Sonderdividende — prueft, dass Renditen ueber Corporate Actions hinweg korrekt bleiben (§38).",
      overrides: { alpha: 0.00030 }, corporateAction: { splitDate: "2021-08-31", splitRatio: 4, specialDividendDate: "2023-11-15", specialDividendPct: 0.05 } }
  ];

  // ---------------------------------------------------------------------
  // Profil je Security
  // ---------------------------------------------------------------------
  function buildProfile(index, seed, fixture) {
    var ticker = fixture ? fixture.ticker : "VU" + String(index + 1).padStart(4, "0");
    var rand = Hash.mulberry32(Hash.seedFromString(seed + "|" + ticker));

    var archetypeId = fixture ? fixture.archetype : pickArchetype(rand);
    var a = ARCHETYPES[archetypeId];
    var sector = pickSector(rand);
    var industries = Schema.INDUSTRIES[sector];
    var industry = industries[Math.floor(rand() * industries.length)];

    var p = {
      ticker: ticker,
      securityId: "sec_" + ticker,
      index: index,
      archetype: archetypeId,
      sector: sector,
      industry: industry,
      name: "VU Mock " + (INDUSTRY_SHORT[industry] || industry) + " " + ticker.slice(2),
      fixtureId: fixture ? fixture.fixtureId : null,
      growth: between(rand, a.growth),
      grossMargin: between(rand, a.grossMargin),
      opMargin: between(rand, a.opMargin),
      capitalIntensity: between(rand, a.capitalIntensity),
      vol: between(rand, a.vol),
      beta: between(rand, a.beta),
      alpha: a.alpha + (rand() - 0.5) * 0.00030,
      leverage: between(rand, a.leverage),
      payout: a.payout * (0.6 + rand() * 0.8),
      valuationPremium: between(rand, a.valuationPremium),
      /* Margentrend erzeugt Margenausweitung/-erosion und damit einen
         echten marginExpansion-Faktor statt einer Zufallszahl. */
      marginTrend: (rand() - 0.45) * 0.010,
      growthDecay: 0.90 + rand() * 0.09,
      /* Startumsatz log-normal verteilt: viele mittelgrosse, wenige sehr
         grosse Titel — wie in einem realen Querschnitt. */
      startRevenue: Math.exp(4.6 + 1.55 * Hash.gaussian(rand)) * 60,
      startPrice: 40,   // Platzhalter; wird in buildFinancials aus der Ertragslage abgeleitet
      turnoverRate: 0.0035 + rand() * 0.0095,
      reportingLagDays: 30 + Math.floor(rand() * 18),
      dividendPayer: rand() < (a.payout > 0.3 ? 0.85 : 0.15),
      firstTradingDate: HISTORY_START,
      lastTradingDate: null,
      status: "active",
      missingMetrics: (fixture && fixture.missingMetrics) || [],
      restatement: (fixture && fixture.restatement) || null,
      futureFact: (fixture && fixture.futureFact) || null,
      corporateAction: (fixture && fixture.corporateAction) || null,
      purpose: fixture ? fixture.purpose : null
    };

    if (fixture && fixture.overrides) {
      Object.keys(fixture.overrides).forEach(function (k) { p[k] = fixture.overrides[k]; });
    }
    if (fixture && fixture.delistOn) {
      p.lastTradingDate = fixture.delistOn;
      p.status = "delisted";
    }
    /* Ein Teil des regulaeren Universums verschwindet ebenfalls historisch —
       sonst waere der Survivorship-Bias-Test ein Sonderfall statt Normalzustand. */
    if (!fixture && rand() < 0.06) {
      var year = 2010 + Math.floor(rand() * 15);
      p.lastTradingDate = year + "-" + String(1 + Math.floor(rand() * 12)).padStart(2, "0") + "-15";
      p.status = rand() < 0.5 ? "delisted" : "acquired";
    }
    /* Nicht jeder Titel existiert seit 2006 — spaetere Listings sind fuer
       die historische Universumszugehoerigkeit genauso wichtig. */
    if (!fixture && rand() < 0.22) {
      var y = 2008 + Math.floor(rand() * 14);
      p.firstTradingDate = y + "-" + String(1 + Math.floor(rand() * 12)).padStart(2, "0") + "-05";
    }
    return p;
  }

  // ---------------------------------------------------------------------
  // Fundamentaldaten (bitemporal)
  // ---------------------------------------------------------------------
  var QUARTER_ENDS = [["Q1", "-03-31"], ["Q2", "-06-30"], ["Q3", "-09-30"], ["Q4", "-12-31"]];

  function buildFinancials(profile, startYear, endDate, seed) {
    var rand = Hash.mulberry32(Hash.seedFromString(seed + "|fin|" + profile.ticker));
    var periods = [];
    var revenue = profile.startRevenue / 4;          // Quartalsumsatz
    var growth = profile.growth;
    var opMargin = profile.opMargin;
    var totalAssets = revenue * 4 * (1.1 + rand() * 1.6);
    /* Aktienzahl und Startkurs werden NICHT frei gewuerfelt, sondern aus
       den ersten Fundamentaldaten und der Bewertungspraemie des Archetyps
       abgeleitet. Sonst waeren Kurs, Marktkapitalisierung, Dividende und
       Bewertungskennzahlen voneinander entkoppelt — und eine Dividende
       koennte den Kurs uebersteigen. Frei ist nur das Kursniveau; die
       Marktkapitalisierung folgt der Ertragslage. */
    var shares = null;
    var targetPrice = 12 + rand() * 108;
    var BASE_PE = 17;
    var BASE_PS = 2.4;

    for (var year = startYear; year <= toDate(endDate).getUTCFullYear(); year++) {
      for (var q = 0; q < 4; q++) {
        var periodEnd = year + QUARTER_ENDS[q][1];
        if (periodEnd > endDate) continue;
        if (periodEnd < profile.firstTradingDate) { revenue *= 1 + growth / 4; continue; }
        if (profile.lastTradingDate && periodEnd > profile.lastTradingDate) continue;

        /* Wachstum konvergiert langfristig, Margen driften mit dem
           Margentrend, beides mit Quartalsrauschen. */
        var noise = 1 + (rand() - 0.5) * 0.09;
        revenue = revenue * (1 + growth / 4) * noise;
        growth = growth * profile.growthDecay + 0.045 * (1 - profile.growthDecay);
        opMargin = Math.max(-0.35, Math.min(0.50, opMargin + profile.marginTrend / 4 + (rand() - 0.5) * 0.006));

        var grossProfit = revenue * profile.grossMargin;
        var operatingIncome = revenue * opMargin;
        var da = revenue * profile.capitalIntensity * 0.55;
        var ebitda = operatingIncome + da;
        var netDebt = Math.max(-revenue * 4 * 0.35, ebitda * 4 * profile.leverage);
        var interestExpense = Math.max(0, netDebt) * 0.011;
        var pretax = operatingIncome - interestExpense;
        var netIncome = pretax * (pretax > 0 ? 0.79 : 1);
        var capex = revenue * profile.capitalIntensity;
        var workingCapitalChange = revenue * growth * 0.14;
        var freeCashFlow = operatingIncome + da - capex - workingCapitalChange - Math.max(0, pretax) * 0.21;
        totalAssets = totalAssets * (1 + growth / 4 * 0.85) + capex * 0.4;
        var totalEquity = Math.max(revenue * 0.4, totalAssets - Math.max(0, netDebt) - revenue * 0.9);
        var investedCapital = Math.max(revenue * 0.5, totalEquity + Math.max(0, netDebt));
        if (shares === null) {
          var annualNet = netIncome * 4;
          var annualRev = revenue * 4;
          var targetMarketCap = annualNet > 0
            ? annualNet * BASE_PE * profile.valuationPremium
            : annualRev * BASE_PS * profile.valuationPremium;
          shares = Math.max(5, targetMarketCap / targetPrice);
          profile.startPrice = targetPrice;
          profile.startShares = shares;
        }

        var dividendPerShare = profile.dividendPayer && netIncome > 0
          ? (netIncome * profile.payout) / shares : 0;
        /* Accruals als Qualitaetsindikator: Ergebnis minus Cashflow. */
        var accruals = (netIncome - freeCashFlow) / Math.max(1, totalAssets);

        var reportingLag = profile.reportingLagDays;
        var reportedAt = addDays(periodEnd, reportingLag);
        var filedAt = addDays(reportedAt, 2);
        var availableAt = addDays(filedAt, 1);

        var values = {
          revenue: revenue, grossProfit: grossProfit, operatingIncome: operatingIncome,
          netIncome: netIncome, ebitda: ebitda, freeCashFlow: freeCashFlow,
          totalAssets: totalAssets, totalEquity: totalEquity, netDebt: netDebt,
          investedCapital: investedCapital, sharesOutstanding: shares,
          dividendPerShare: dividendPerShare, capex: capex,
          interestExpense: interestExpense, accruals: accruals
        };

        profile.missingMetrics.forEach(function (m) { values[m] = null; });

        periods.push({
          fiscalPeriod: QUARTER_ENDS[q][0], fiscalYear: year, periodEnd: periodEnd,
          reportedAt: reportedAt, filedAt: filedAt, availableAt: availableAt,
          ingestedAt: availableAt + "T06:00:00Z", revisionId: 0,
          restatementStatus: "original", values: values
        });

        shares = shares * (1 + (profile.dividendPayer ? -0.0015 : 0.0035));
      }
    }

    /* Restatement-Fixture: Originale bleiben unveraendert bestehen, die
       Korrektur kommt als eigene Revision mit spaeterem availableAt dazu.
       Genau so muss ein PIT-Store funktionieren (§40). */
    if (profile.restatement) {
      var rs = profile.restatement;
      periods.slice().forEach(function (p) {
        if (rs.periods.indexOf(p.periodEnd) === -1) return;
        var corrected = {};
        Object.keys(p.values).forEach(function (k) {
          corrected[k] = (k === "sharesOutstanding" || p.values[k] === null)
            ? p.values[k] : p.values[k] * (k === "netDebt" ? 1 / rs.factor : rs.factor);
        });
        periods.push({
          fiscalPeriod: p.fiscalPeriod, fiscalYear: p.fiscalYear, periodEnd: p.periodEnd,
          reportedAt: rs.restatedAvailableAt, filedAt: rs.restatedAvailableAt,
          availableAt: rs.restatedAvailableAt,
          ingestedAt: rs.restatedAvailableAt + "T06:00:00Z",
          revisionId: 1, restatementStatus: "restated", values: corrected
        });
      });
    }

    /* Future-Leak-Fixture: ein Datensatz, der heute noch nicht bekannt sein
       darf. Er liegt im Store, aber jede PIT-Abfrage muss ihn ignorieren. */
    if (profile.futureFact) {
      var ff = profile.futureFact;
      var last = periods[periods.length - 1];
      if (last) {
        var leaked = {};
        Object.keys(last.values).forEach(function (k) {
          leaked[k] = last.values[k] === null ? null : last.values[k] * (k === ff.metric ? ff.multiple : 1);
        });
        periods.push({
          fiscalPeriod: "Q3", fiscalYear: toDate(ff.periodEnd).getUTCFullYear(), periodEnd: ff.periodEnd,
          reportedAt: ff.availableAt, filedAt: ff.availableAt, availableAt: ff.availableAt,
          ingestedAt: ff.availableAt + "T06:00:00Z", revisionId: 0,
          restatementStatus: "preliminary", values: leaked
        });
      }
    }

    return periods;
  }

  // ---------------------------------------------------------------------
  // Corporate Actions
  // ---------------------------------------------------------------------
  function buildCorporateActions(profile, financials) {
    var actions = [];
    var n = 0;

    financials.forEach(function (p) {
      if (p.revisionId !== 0) return;
      var dps = p.values.dividendPerShare;
      if (!dps || dps <= 0) return;
      var exDate = addDays(p.periodEnd, profile.reportingLagDays + 12);
      actions.push({
        actionId: profile.securityId + "_div_" + (++n),
        securityId: profile.securityId, type: "dividend",
        exDate: exDate, announcedAt: addDays(p.periodEnd, profile.reportingLagDays),
        amount: dps, currency: "USD", dataSourceId: DATA_SOURCE_ID
      });
    });

    if (profile.corporateAction) {
      var ca = profile.corporateAction;
      actions.push({
        actionId: profile.securityId + "_split_1", securityId: profile.securityId, type: "split",
        exDate: ca.splitDate, announcedAt: addDays(ca.splitDate, -30), ratio: ca.splitRatio,
        notes: "Aktiensplit " + ca.splitRatio + ":1", dataSourceId: DATA_SOURCE_ID
      });
      actions.push({
        actionId: profile.securityId + "_specdiv_1", securityId: profile.securityId, type: "special_dividend",
        exDate: ca.specialDividendDate, announcedAt: addDays(ca.specialDividendDate, -21),
        amount: 0, currency: "USD", notes: "Sonderdividende, " + Math.round(ca.specialDividendPct * 100) + " % des Kurses",
        dataSourceId: DATA_SOURCE_ID
      });
    }

    if (profile.lastTradingDate) {
      actions.push({
        actionId: profile.securityId + "_delist_1", securityId: profile.securityId,
        type: profile.status === "acquired" ? "merger" : "delisting",
        exDate: profile.lastTradingDate, announcedAt: addDays(profile.lastTradingDate, -45),
        notes: profile.status === "acquired" ? "Uebernahme, Barabfindung" : "Delisting",
        dataSourceId: DATA_SOURCE_ID
      });
    }
    return actions;
  }

  // ---------------------------------------------------------------------
  // Preisreihen
  // ---------------------------------------------------------------------
  /**
   * Kursreihe als FUNDAMENTALANKER x BEWERTUNGSMULTIPLIKATOR.
   *
   * Ein reiner Random Walk waere hier ein Modellierungsfehler mit Folgen:
   * Kurs und Ertragslage waeren nach 20 Jahren voellig entkoppelt, ein
   * Titel koennte bei einem KGV von 0,5 handeln und eine Dividendenrendite
   * von 300 % ausweisen. Die Value- und Quality-Faktoren wuerden dann nicht
   * Bewertung messen, sondern kumuliertes Rauschen.
   *
   * Deshalb:
   *   Kurs_t = Startkurs x Ertragsanker_t x exp(Rerating_t + Abweichung_t)
   *
   *   Ertragsanker   TTM-Ertragskraft aus den Fundamentaldaten, taeglich
   *                  interpoliert. Traegt die langfristige Rendite.
   *   Abweichung     Ornstein-Uhlenbeck-Prozess, gespeist aus Marktfaktor
   *                  (ueber Beta) und idiosynkratischem Schock. Erzeugt
   *                  Momentum, Volatilitaet, Drawdowns und schwankende
   *                  Bewertungsniveaus — kehrt aber ueber Jahre zurueck,
   *                  sodass Multiplikatoren in einer plausiblen Bandbreite
   *                  bleiben.
   *   Rerating       gedaempfte, dauerhafte Bewertungsverschiebung aus dem
   *                  Alpha des Archetyps (Compounder werden hoeher
   *                  bewertet, Nachzuegler niedriger), begrenzt auf +/-55 %.
   *
   * adjustedClose ist die Total-Return-Reihe (Kursrendite + Dividenden),
   * close der tatsaechlich sichtbare Kurs (Dividendenabschlag, Splits).
   */
  var OU_PERSISTENCE = 0.9985;      // Halbwertszeit der Abweichung ca. 1,8 Jahre
  var MAX_RERATING = 0.55;          // maximale dauerhafte Bewertungsverschiebung (log)

  /** Taeglich interpolierte TTM-Ertragskraft, normiert auf den Starttag. */
  function buildEarningsAnchor(profile, financials, tradingDays, dayIndex, startIdx, endIdx) {
    var originals = financials.filter(function (p) { return p.revisionId === 0; })
      .sort(function (a, b) { return a.periodEnd < b.periodEnd ? -1 : 1; });

    var points = [];
    for (var i = 0; i < originals.length; i++) {
      var window = originals.slice(Math.max(0, i - 3), i + 1);
      var scale = 4 / window.length;
      var ttmNet = 0, ttmRev = 0, haveNet = false;
      window.forEach(function (w) {
        if (Number.isFinite(w.values.netIncome)) { ttmNet += w.values.netIncome; haveNet = true; }
        if (Number.isFinite(w.values.revenue)) ttmRev += w.values.revenue;
      });
      ttmNet *= scale; ttmRev *= scale;
      /* Verlustbringer und fruehe Wachstumsphasen werden ueber den Umsatz
         verankert — sonst waere ihr Anker negativ und der Kurs undefiniert. */
      var power = Math.max(haveNet ? ttmNet : 0, ttmRev * 0.05, 1);
      var idx = indexAtOrAfter(tradingDays, dayIndex, originals[i].periodEnd);
      if (idx >= 0) points.push({ t: idx, v: Math.log(power) });
    }

    var anchor = new Float32Array(tradingDays.length);
    if (!points.length) { anchor.fill(1); return anchor; }

    var base = points[0].v;
    var pi = 0;
    for (var t = 0; t < tradingDays.length; t++) {
      while (pi < points.length - 2 && points[pi + 1].t <= t) pi++;
      var a = points[pi], b = points[Math.min(pi + 1, points.length - 1)];
      var logV;
      if (b.t <= a.t || t <= a.t) logV = a.v;
      else if (t >= b.t) logV = b.v;
      else logV = a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t));
      anchor[t] = Math.exp(logV - base);
    }
    return anchor;
  }

  function indexAtOrAfter(tradingDays, dayIndex, date) {
    var idx = dayIndex[date];
    if (idx !== undefined) return idx;
    for (var i = 0; i < tradingDays.length; i++) if (tradingDays[i] >= date) return i;
    return -1;
  }

  function buildPriceSeries(profile, financials, tradingDays, dayIndex, marketReturns, corporateActions, seed) {
    var n = tradingDays.length;
    var rand = Hash.mulberry32(Hash.seedFromString(seed + "|px|" + profile.ticker));
    var adj = new Float32Array(n);
    var close = new Float32Array(n);

    var startIdx = indexAtOrAfter(tradingDays, dayIndex, profile.firstTradingDate);
    if (startIdx < 0) startIdx = 0;
    var endIdx = n - 1;
    if (profile.lastTradingDate) {
      for (var e = n - 1; e >= 0; e--) { if (tradingDays[e] <= profile.lastTradingDate) { endIdx = e; break; } }
    }
    if (endIdx < startIdx) endIdx = startIdx;

    var anchor = buildEarningsAnchor(profile, financials, tradingDays, dayIndex, startIdx, endIdx);
    var anchorBase = anchor[startIdx] || 1;

    var totalDailyVol = profile.vol / Math.sqrt(252);
    var marketDailyVol = 0.0084 * profile.beta;
    /* Idiosynkratischer Rest, damit die Gesamtvolatilitaet dem Profil
       entspricht statt sie zu ueberschreiten. */
    var idioVol = Math.sqrt(Math.max(0.000004, totalDailyVol * totalDailyVol - marketDailyVol * marketDailyVol));

    var divByDay = Object.create(null);
    var splitByDay = Object.create(null);
    corporateActions.forEach(function (a) {
      if (a.type === "dividend" || a.type === "special_dividend") divByDay[a.exDate] = a;
      if (a.type === "split") splitByDay[a.exDate] = a.ratio;
    });

    var dev = 0;
    var splitFactor = 1;
    var prevRaw = null;   // splitbereinigter Kurs des Vortages

    for (var t = startIdx; t <= endIdx; t++) {
      if (t > startIdx) {
        dev = OU_PERSISTENCE * dev + profile.beta * marketReturns[t] + idioVol * Hash.gaussian(rand);
      }
      var elapsed = t - startIdx;
      var rerating = MAX_RERATING * Math.tanh(profile.alpha * 0.45 * elapsed / MAX_RERATING);
      var raw = profile.startPrice * (anchor[t] / anchorBase) * Math.exp(rerating + dev);
      raw = Math.max(0.05, raw);

      var day = tradingDays[t];
      if (splitByDay[day]) splitFactor *= splitByDay[day];

      var dividendAmount = 0;
      var div = divByDay[day];
      if (div && prevRaw !== null) {
        dividendAmount = div.type === "special_dividend"
          ? (prevRaw / splitFactor) * (profile.corporateAction ? profile.corporateAction.specialDividendPct : 0.02)
          : div.amount;
        /* Der Dividendenabschlag darf den Kurs nie aufzehren — eine
           Ausschuettung ueber 25 % des Kurses ist ein Datenfehler, kein
           Marktereignis. */
        dividendAmount = Math.min(dividendAmount, (prevRaw / splitFactor) * 0.25);
        div.amount = Math.round(dividendAmount * 10000) / 10000;
      }

      var priceBeforeDividend = raw / splitFactor;
      close[t] = Math.max(0.05, priceBeforeDividend - dividendAmount);

      if (t === startIdx) {
        adj[t] = close[t];
      } else {
        var priceReturn = raw / prevRaw - 1;                       // splitbereinigt
        var divYield = dividendAmount / Math.max(0.05, prevRaw / splitFactor);
        adj[t] = adj[t - 1] * (1 + priceReturn + divYield);
      }
      prevRaw = raw;
    }

    for (var f = endIdx + 1; f < n; f++) { adj[f] = 0; close[f] = 0; }
    return { adjustedClose: adj, close: close, startIndex: startIdx, endIndex: endIdx };
  }

  // ---------------------------------------------------------------------
  // Dataset
  // ---------------------------------------------------------------------
  /**
   * @param {object} [options]
   *   seed          Basis-Seed (Standard: DEFAULT_SEED)
   *   start,end     Historienfenster
   *   count         Zahl der regulaeren Securities
   *   includePrices Preisreihen erzeugen (Standard: true)
   */
  function generateDataset(options) {
    options = options || {};
    var seed = options.seed || DEFAULT_SEED;
    var start = options.start || HISTORY_START;
    var end = options.end || HISTORY_END;
    var count = options.count === undefined ? SECURITY_COUNT : options.count;
    var includePrices = options.includePrices !== false;

    var tradingDays = buildTradingDays(start, end);
    var dayIndex = Object.create(null);
    tradingDays.forEach(function (d, i) { dayIndex[d] = i; });

    var marketReturns = buildMarketReturns(tradingDays, seed);
    var startYear = toDate(start).getUTCFullYear();

    var profiles = [];
    for (var i = 0; i < count; i++) profiles.push(buildProfile(i, seed, null));
    FIXTURES.forEach(function (fx, k) { profiles.push(buildProfile(count + k, seed, fx)); });

    var securities = [];
    var financials = Object.create(null);
    var corporateActions = [];
    var prices = Object.create(null);
    var universeMembership = [];
    var filings = Object.create(null);

    profiles.forEach(function (p) {
      securities.push(Schema.assertValid("Security", {
        securityId: p.securityId, ticker: p.ticker, name: p.name, assetType: "equity",
        exchangeId: "XMOC", currency: "USD", country: "US",
        sector: p.sector, industry: p.industry, status: p.status,
        firstTradingDate: p.firstTradingDate, lastTradingDate: p.lastTradingDate || undefined,
        isMock: true, fixtureId: p.fixtureId || undefined, dataSourceId: DATA_SOURCE_ID
      }));

      var fin = buildFinancials(p, startYear, end, seed);
      financials[p.securityId] = fin;

      filings[p.securityId] = fin.map(function (f, idx) {
        return {
          filingId: p.securityId + "_f" + idx, securityId: p.securityId,
          formType: f.fiscalPeriod === "Q4" ? "10-K" : "10-Q",
          fiscalPeriod: f.fiscalPeriod, fiscalYear: f.fiscalYear, periodEnd: f.periodEnd,
          filedAt: f.filedAt, restatementStatus: f.restatementStatus, dataSourceId: DATA_SOURCE_ID
        };
      });

      var actions = buildCorporateActions(p, fin);
      if (includePrices) {
        prices[p.securityId] = buildPriceSeries(p, fin, tradingDays, dayIndex, marketReturns, actions, seed);
      }
      corporateActions = corporateActions.concat(actions);

      universeMembership.push({
        universeId: "US_EQUITIES", securityId: p.securityId,
        validFrom: p.firstTradingDate,
        validTo: p.lastTradingDate || undefined,
        exitReason: p.lastTradingDate ? (p.status === "acquired" ? "merger" : "delisting") : undefined
      });
    });

    /* Gleichgewichteter Benchmark ueber ALLE zum jeweiligen Tag gelisteten
       Titel — inklusive derjenigen, die spaeter verschwinden. Ein Benchmark
       aus heutigen Ueberlebenden waere selbst survivorship-biased. */
    var benchmark = includePrices ? buildBenchmark(profiles, prices, tradingDays) : null;

    var meta = {
      seed: seed, start: start, end: end, tradingDays: tradingDays.length,
      securityCount: securities.length, isMock: true,
      generatorVersion: "mock-generator-1.0.0"
    };
    meta.dataSnapshotId = Hash.prefixedHash("snap", meta);

    return {
      meta: meta,
      dataSources: [{
        dataSourceId: DATA_SOURCE_ID, provider: "VisionUniverseMock", dataset: "synthetic-us-equities",
        isMock: true, licenseStatus: "mock", pitCapable: true
      }],
      exchanges: Schema.EXCHANGES,
      tradingDays: tradingDays,
      dayIndex: dayIndex,
      marketReturns: marketReturns,
      profiles: profiles,
      profileById: profiles.reduce(function (acc, p) { acc[p.securityId] = p; return acc; }, Object.create(null)),
      securities: securities,
      securityById: securities.reduce(function (acc, s) { acc[s.securityId] = s; return acc; }, Object.create(null)),
      financials: financials,
      filings: filings,
      corporateActions: corporateActions,
      prices: prices,
      benchmark: benchmark,
      universeMembership: universeMembership,
      fixtures: FIXTURES
    };
  }

  function buildBenchmark(profiles, prices, tradingDays) {
    var n = tradingDays.length;
    var level = new Float32Array(n);
    level[0] = 100;
    for (var t = 1; t < n; t++) {
      var sum = 0, cnt = 0;
      for (var i = 0; i < profiles.length; i++) {
        var series = prices[profiles[i].securityId];
        if (!series) continue;
        if (t <= series.startIndex || t > series.endIndex) continue;
        var prev = series.adjustedClose[t - 1];
        if (!prev) continue;
        sum += series.adjustedClose[t] / prev - 1;
        cnt++;
      }
      level[t] = cnt ? level[t - 1] * (1 + sum / cnt) : level[t - 1];
    }
    return { benchmarkId: BENCHMARK_ID, level: level };
  }

  var api = {
    DEFAULT_SEED: DEFAULT_SEED,
    HISTORY_START: HISTORY_START,
    HISTORY_END: HISTORY_END,
    SECURITY_COUNT: SECURITY_COUNT,
    DATA_SOURCE_ID: DATA_SOURCE_ID,
    BENCHMARK_ID: BENCHMARK_ID,
    FIXTURES: FIXTURES,
    ARCHETYPES: ARCHETYPES,
    CRISIS_WINDOWS: CRISIS_WINDOWS,
    buildTradingDays: buildTradingDays,
    generateDataset: generateDataset,
    addDays: addDays,
    dayDiff: dayDiff
  };

  if (isNode) module.exports = api;
  else global.VUMockGenerator = api;
})(typeof window !== "undefined" ? window : globalThis);
