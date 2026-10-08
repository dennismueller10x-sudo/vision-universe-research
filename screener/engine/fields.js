/* =========================================================================
   VISION UNIVERSE SCREENER — engine/fields.js

   DIE FILTERBIBLIOTHEK

   Jedes Kriterium ist genau einmal definiert. Oberflaeche, Suche,
   Query-Validierung, Why-Match, Tabellen-Spalten und Server-Adapter lesen
   dieselbe Definition.

   Einheiten der Rohwerte (so steht es auch im Universums-Artefakt):
     pct    Verhaeltnis (0.25 = 25 %)       usd   US-Dollar
     x      Vielfaches (KGV 18,2)            pp    Prozentpunkte (95,7)
     num    reine Zahl                        score 0-100
     count  Stueck                            year  Kalenderjahr

   available:false heisst: Es gibt fuer dieses Kriterium noch keine reale
   Datenquelle. Es steht sichtbar in der Bibliothek (Pro), ist aber nicht
   waehlbar - es wird nie simuliert.
   ========================================================================= */
(function (global) {
  'use strict';

  var GROUPS = [
    { id: 'company', label: 'Unternehmen', icon: 'building' },
    { id: 'size', label: 'Größe & Markt', icon: 'size' },
    { id: 'growth', label: 'Wachstum', icon: 'growth' },
    { id: 'quality', label: 'Qualität', icon: 'quality' },
    { id: 'balance', label: 'Bilanz', icon: 'balance', pro: true },
    { id: 'valuation', label: 'Bewertung', icon: 'valuation' },
    { id: 'momentum', label: 'Momentum', icon: 'momentum' },
    { id: 'technical', label: 'Technik', icon: 'technical' },
    { id: 'analysts', label: 'Analysten & Estimates', icon: 'analysts', pro: true },
    { id: 'vu', label: 'Vision Universe', icon: 'vu', pro: true }
  ];

  var NO_ESTIMATES = 'Für Analystenschätzungen ist noch keine lizenzierte Datenquelle angebunden.';
  var NO_SOURCE = 'Für diese Kennzahl liegt in Vision Universe noch keine belastbare Datenquelle vor.';
  var WITHHELD = 'Der Quant-Gesamtscore ist noch nicht freigegeben (Quant V2 nicht aktiv). Einzelne Faktoren sind filterbar.';
  var NO_METHOD = 'Für diesen Score gibt es noch keine veröffentlichte Methodik. Er wird nicht simuliert.';

  function n(id, o) { o.id = id; o.kind = o.kind || 'number'; return o; }

  var FIELDS = [
    // ---------------- UNTERNEHMEN ----------------
    n('country', { col: 'co', group: 'company', kind: 'enum', label: 'Börsenland', en: 'Country', source: 'master',
      desc: 'Land der Primärbörse laut Wertpapierstamm. Das aktuelle Universum umfasst US-Börsen.', keywords: ['land', 'usa', 'country'] }),
    n('region', { col: 'co', group: 'company', kind: 'enum', label: 'Region', en: 'Region', source: 'master', derive: 'region',
      desc: 'Region der Primärbörse, abgeleitet aus dem Börsenland.', keywords: ['region', 'nordamerika'] }),
    n('exchange', { col: 'ex', group: 'company', kind: 'enum', label: 'Börse', en: 'Exchange', source: 'master',
      desc: 'Primärbörse, an der die Aktie gehandelt wird.', keywords: ['nasdaq', 'nyse', 'exchange'] }),
    n('sector', { col: 'sec', group: 'company', kind: 'enum', label: 'Sektor', en: 'Sector', source: 'classification',
      desc: 'Sektor, abgeleitet aus dem SEC-SIC-Code des Emittenten (Vision-Universe-Zuordnung sic-sector-1.0.0). Kein GICS.', keywords: ['technologie', 'technology', 'branche', 'sector', 'tech'] }),
    n('industry', { col: 'sic2', group: 'company', kind: 'enum', label: 'Branche', en: 'Industry', source: 'classification',
      desc: 'SIC-Hauptgruppe (zweistellig) laut SEC, z. B. „Elektronik und Halbleiter“.', keywords: ['industry', 'halbleiter', 'software', 'sic'] }),
    n('ipoYear', { col: 'ipo', group: 'company', kind: 'number', unit: 'year', label: 'Erster Handelstag (Jahr)', short: 'Börsengang', en: 'IPO Date', source: 'master', derive: 'year',
      desc: 'Jahr des ersten Handelstags laut Wertpapierstamm – ein Näherungswert für den Börsengang.', keywords: ['ipo', 'börsengang', 'listing'], domain: [1960, 2026, 1], presets: [['Seit 2020', 'gte', 2020], ['Seit 2015', 'gte', 2015], ['Vor 2000', 'lt', 2000]] }),
    n('companyType', { col: 'cls', group: 'company', kind: 'enum', label: 'Unternehmenstyp', en: 'Company Type', source: 'master',
      desc: 'Wertpapierklasse laut Stammdaten: Stammaktie, REIT, SPAC, Trust oder ADR.', keywords: ['reit', 'spac', 'adr', 'type'] }),
    n('index', { col: 'idx', group: 'company', kind: 'enum', multi: true, label: 'Indexmitglied', en: 'Index', source: 'master',
      desc: 'Mitgliedschaft in S&P 500, Nasdaq-100 oder Dow Jones laut Indexanbieter.', keywords: ['s&p', 'nasdaq-100', 'dow', 'index'] }),

    // ---------------- GRÖSSE & MARKT ----------------
    n('marketCap', { col: 'mcap', group: 'size', unit: 'usd', label: 'Marktkapitalisierung', short: 'Market Cap', en: 'Market Cap', source: 'fundamentals', scale: 'log',
      desc: 'Kurs × ausstehende Aktien laut letztem SEC-Bericht.', keywords: ['market cap', 'größe', 'small cap', 'large cap', 'mcap'],
      presets: [['Mega > 200 Mrd.', 'gt', 2e11], ['Large > 10 Mrd.', 'gt', 1e10], ['Mid 2–10 Mrd.', 'between', 2e9, 1e10], ['Small < 2 Mrd.', 'lt', 2e9], ['Micro < 300 Mio.', 'lt', 3e8]] }),
    n('enterpriseValue', { col: 'ev', group: 'size', unit: 'usd', label: 'Unternehmenswert (EV)', short: 'EV', en: 'Enterprise Value', source: 'fundamentals', scale: 'log', pro: true, formula: 'ev',
      desc: 'Marktkapitalisierung plus Finanzschulden minus Kasse. Nur wo die Verschuldung berichtet ist.', keywords: ['ev', 'enterprise'] }),
    n('price', { col: 'price', group: 'size', unit: 'usd', label: 'Kurs', en: 'Price', source: 'price', scale: 'log',
      desc: 'Letzter Tagesschlusskurs in US-Dollar.', keywords: ['preis', 'price', 'kurs'], presets: [['> 5 $', 'gt', 5], ['> 20 $', 'gt', 20], ['< 10 $', 'lt', 10]] }),
    n('avgVolume', { col: 'avgVol', group: 'size', unit: 'count', label: 'Ø Handelsvolumen (20 T.)', short: 'Ø Volumen', en: 'Average Volume', source: 'price', scale: 'log',
      desc: 'Durchschnittlich gehandelte Stückzahl der letzten 20 Handelstage.', keywords: ['volume', 'volumen', 'liquidität'], presets: [['> 500 Tsd.', 'gt', 5e5], ['> 1 Mio.', 'gt', 1e6]] }),
    n('dollarVolume', { col: 'dollarVol', group: 'size', unit: 'usd', label: 'Ø Handelsumsatz (20 T.)', short: 'Dollar-Volumen', en: 'Dollar Volume', source: 'price', scale: 'log',
      desc: 'Durchschnittlicher Tagesumsatz in US-Dollar – ein Maß für Liquidität.', keywords: ['dollar volume', 'liquidität', 'umsatz'], presets: [['> 10 Mio. $', 'gt', 1e7], ['> 100 Mio. $', 'gt', 1e8]] }),
    n('beta', { col: 'beta', group: 'size', unit: 'num', label: 'Beta (1 Jahr)', en: 'Beta', source: 'price', domain: [-1, 4, 0.05],
      desc: 'Wie stark die Aktie im letzten Jahr mit dem Gesamtmarkt geschwankt ist. 1 = wie der Markt.', keywords: ['beta', 'risiko'], presets: [['< 1', 'lt', 1], ['> 1,5', 'gt', 1.5]] }),

    // ---------------- WACHSTUM ----------------
    n('revenueGrowth', { col: 'revGrowth', group: 'growth', unit: 'pct', label: 'Umsatzwachstum (TTM)', short: 'Umsatz­wachstum', en: 'Revenue Growth', source: 'fundamentals', timeframe: 'TTM', domain: [-0.5, 1, 0.01], better: 1,
      desc: 'Umsatz der letzten zwölf Monate gegenüber dem Vorjahreszeitraum, laut SEC-Berichten.', keywords: ['revenue', 'umsatz', 'sales', 'growth'], presets: [['> 10 %', 'gt', 0.1], ['> 20 %', 'gt', 0.2], ['> 50 %', 'gt', 0.5]] }),
    n('revenueCagr3', { col: 'revCagr3', group: 'growth', unit: 'pct', label: 'Umsatzwachstum p. a. (3 J.)', short: 'Umsatz CAGR 3J', en: 'Revenue CAGR', source: 'fundamentals', timeframe: '3Y', domain: [-0.3, 0.8, 0.01], better: 1,
      desc: 'Durchschnittliches jährliches Umsatzwachstum über drei Geschäftsjahre (CAGR).', keywords: ['revenue cagr', 'umsatz', 'cagr'], presets: [['> 10 %', 'gt', 0.1], ['> 20 %', 'gt', 0.2]] }),
    n('revenueCagr10', { col: 'revCagr10', group: 'growth', unit: 'pct', label: 'Umsatzwachstum p. a. (10 J.)', short: 'Umsatz CAGR 10J', en: 'Revenue CAGR 10Y', source: 'fundamentals', timeframe: '10Y', domain: [-0.2, 0.5, 0.01], pro: true, better: 1,
      desc: 'Durchschnittliches jährliches Umsatzwachstum über zehn Geschäftsjahre.', keywords: ['revenue cagr', 'langfristig'] }),
    n('epsGrowth', { col: 'epsGrowth', group: 'growth', unit: 'pct', label: 'EPS-Wachstum (Geschäftsjahr)', short: 'EPS-Wachstum', en: 'EPS Growth', source: 'fundamentals', timeframe: 'FY', domain: [-0.5, 1.5, 0.01], better: 1, formula: 'epsGrowth',
      desc: 'Verwässerter Gewinn je Aktie im letzten Geschäftsjahr gegenüber dem Vorjahr. Nur bei positivem Vorjahreswert.', keywords: ['eps', 'gewinn je aktie', 'earnings'], presets: [['> 15 %', 'gt', 0.15], ['> 25 %', 'gt', 0.25]] }),
    n('epsCagr3', { col: 'epsCagr3', group: 'growth', unit: 'pct', label: 'EPS-Wachstum p. a. (3 J.)', short: 'EPS CAGR 3J', en: 'EPS CAGR', source: 'fundamentals', timeframe: '3Y', domain: [-0.3, 1, 0.01], better: 1, formula: 'epsCagr3',
      desc: 'Jährliches Wachstum des verwässerten Gewinns je Aktie über drei Geschäftsjahre.', keywords: ['eps cagr', 'earnings'] }),
    n('netIncomeGrowth', { col: 'niGrowthTtm', group: 'growth', unit: 'pct', label: 'Gewinnwachstum (TTM)', short: 'Gewinn­wachstum', en: 'Net Income Growth', source: 'fundamentals', timeframe: 'TTM', domain: [-1, 2, 0.01], pro: true, better: 1, formula: 'niGrowthTtm',
      desc: 'Jahresüberschuss der letzten zwölf Monate gegenüber dem Vorjahreszeitraum.', keywords: ['net income', 'gewinn'] }),
    n('ebitdaGrowth', { group: 'growth', unit: 'pct', label: 'EBITDA-Wachstum', en: 'EBITDA Growth', source: 'fundamentals', available: false, reason: 'Die EBITDA-Historie ist noch nicht als Zeitreihe aufbereitet.', keywords: ['ebitda'] }),
    n('fcfGrowth', { col: 'fcfGrowth', group: 'growth', unit: 'pct', label: 'Free-Cashflow-Wachstum', short: 'FCF-Wachstum', en: 'Free Cash Flow Growth', source: 'fundamentals', timeframe: 'FY', domain: [-1, 2, 0.01], better: 1, formula: 'fcfGrowth',
      desc: 'Free Cashflow im letzten Geschäftsjahr gegenüber dem Vorjahr. Nur bei positivem Vorjahreswert.', keywords: ['fcf', 'free cash flow', 'cashflow'] }),
    n('marginExpansion', { col: 'marginExp3y', group: 'growth', unit: 'pp', label: 'Margenausweitung (3 J.)', short: 'Margen­ausweitung', en: 'Margin Expansion', source: 'fundamentals', timeframe: '3Y', domain: [-30, 30, 0.5], pro: true, better: 1,
      desc: 'Veränderung der operativen Marge über drei Geschäftsjahre in Prozentpunkten.', keywords: ['marge', 'margin expansion'] }),
    n('forwardRevenueGrowth', { group: 'growth', unit: 'pct', label: 'Erwartetes Umsatzwachstum', en: 'Forward Revenue Growth', source: 'estimates', available: false, reason: NO_ESTIMATES, keywords: ['forward revenue', 'erwartet', 'revenue'] }),
    n('forwardEpsGrowth', { group: 'growth', unit: 'pct', label: 'Erwartetes EPS-Wachstum', en: 'Forward EPS Growth', source: 'estimates', available: false, reason: NO_ESTIMATES, keywords: ['forward eps', 'erwartet'] }),

    // ---------------- QUALITÄT ----------------
    n('grossMargin', { col: 'grossMargin', group: 'quality', unit: 'pct', label: 'Bruttomarge', en: 'Gross Margin', source: 'fundamentals', timeframe: 'FY', domain: [0, 1, 0.01], better: 1,
      desc: 'Anteil des Umsatzes, der nach den direkten Herstellkosten bleibt.', keywords: ['gross margin', 'brutto', 'marge'], presets: [['> 40 %', 'gt', 0.4], ['> 60 %', 'gt', 0.6]] }),
    n('operatingMargin', { col: 'opMargin', group: 'quality', unit: 'pct', label: 'Operative Marge', en: 'Operating Margin', source: 'fundamentals', timeframe: 'FY', domain: [-0.5, 0.6, 0.01], better: 1,
      desc: 'Operatives Ergebnis im Verhältnis zum Umsatz.', keywords: ['operating margin', 'ebit', 'marge'], presets: [['> 0 %', 'gt', 0], ['> 15 %', 'gt', 0.15]] }),
    n('netMargin', { col: 'netMargin', group: 'quality', unit: 'pct', label: 'Nettomarge', en: 'Net Margin', source: 'fundamentals', timeframe: 'FY', domain: [-0.5, 0.5, 0.01], better: 1,
      desc: 'Jahresüberschuss im Verhältnis zum Umsatz.', keywords: ['net margin', 'netto', 'marge', 'profitabel'], presets: [['Profitabel', 'gt', 0], ['> 10 %', 'gt', 0.1]] }),
    n('fcfMargin', { col: 'fcfMargin', group: 'quality', unit: 'pct', label: 'Free-Cashflow-Marge', short: 'FCF-Marge', en: 'FCF Margin', source: 'fundamentals', timeframe: 'FY', domain: [-0.5, 0.5, 0.01], better: 1,
      desc: 'Free Cashflow im Verhältnis zum Umsatz.', keywords: ['fcf margin', 'cashflow', 'marge'], presets: [['> 0 %', 'gt', 0], ['> 15 %', 'gt', 0.15]] }),
    n('roe', { col: 'roe', group: 'quality', unit: 'pct', label: 'Eigenkapitalrendite (ROE)', short: 'ROE', en: 'ROE', source: 'fundamentals', timeframe: 'FY', domain: [-0.5, 0.6, 0.01], better: 1,
      desc: 'Jahresüberschuss im Verhältnis zum Eigenkapital.', keywords: ['roe', 'eigenkapitalrendite', 'return on equity'], presets: [['> 15 %', 'gt', 0.15], ['> 20 %', 'gt', 0.2]] }),
    n('roa', { col: 'roa', group: 'quality', unit: 'pct', label: 'Gesamtkapitalrendite (ROA)', short: 'ROA', en: 'ROA', source: 'fundamentals', timeframe: 'FY', domain: [-0.3, 0.3, 0.01], better: 1, formula: 'roa',
      desc: 'Jahresüberschuss im Verhältnis zur Bilanzsumme.', keywords: ['roa', 'return on assets'] }),
    n('roic', { col: 'roic', group: 'quality', unit: 'pct', label: 'Kapitalrendite (ROIC)', short: 'ROIC', en: 'ROIC', source: 'fundamentals', timeframe: 'FY', domain: [-0.3, 0.6, 0.01], better: 1, formula: 'roic',
      desc: 'Operatives Ergebnis nach Steuern im Verhältnis zum eingesetzten Kapital. Nur wo Schulden berichtet sind.', keywords: ['roic', 'return on invested capital', 'kapitalrendite'], presets: [['> 10 %', 'gt', 0.1], ['> 20 %', 'gt', 0.2]] }),
    n('cashConversion', { col: 'cashConversion', group: 'quality', unit: 'x', label: 'Cash Conversion', en: 'Cash Conversion', source: 'fundamentals', timeframe: 'FY', domain: [0, 3, 0.05], pro: true, better: 1, formula: 'cashConversion',
      desc: 'Operativer Cashflow je Dollar Gewinn. Über 1 heißt: der Gewinn kommt als Geld an.', keywords: ['cash conversion', 'cashflow'], presets: [['> 1', 'gt', 1]] }),
    n('interestCoverage', { group: 'quality', unit: 'x', label: 'Zinsdeckung', en: 'Interest Coverage', source: 'fundamentals', available: false, reason: 'Der Zinsaufwand wird aus den SEC-Daten noch nicht normalisiert.', keywords: ['interest coverage', 'zins'] }),

    // ---------------- BILANZ ----------------
    n('debtToEquity', { col: 'debtToEquity', group: 'balance', unit: 'x', label: 'Verschuldungsgrad (D/E)', short: 'Debt/Equity', en: 'Debt / Equity', source: 'fundamentals', domain: [0, 3, 0.05], better: -1, formula: 'debtToEquity',
      desc: 'Finanzschulden im Verhältnis zum Eigenkapital.', keywords: ['debt', 'schulden', 'verschuldung', 'd/e'], presets: [['< 0,5', 'lt', 0.5], ['< 1', 'lt', 1]] }),
    n('netDebtEbitda', { col: 'netDebtEbitda', group: 'balance', unit: 'x', label: 'Nettoverschuldung / EBITDA', short: 'Net Debt/EBITDA', en: 'Net Debt / EBITDA', source: 'fundamentals', domain: [-3, 6, 0.1], better: -1, formula: 'netDebtEbitda',
      desc: 'In wie vielen Jahren das operative Ergebnis die Nettoschulden tilgen könnte.', keywords: ['net debt', 'ebitda', 'schulden'], presets: [['< 2', 'lt', 2], ['Netto-Cash (< 0)', 'lt', 0]] }),
    n('currentRatio', { group: 'balance', unit: 'x', label: 'Liquiditätsgrad (Current Ratio)', en: 'Current Ratio', source: 'fundamentals', available: false, reason: 'Kurzfristige Vermögenswerte und Verbindlichkeiten sind noch nicht normalisiert.', keywords: ['current ratio', 'liquidität'] }),
    n('cash', { col: 'cash', group: 'balance', unit: 'usd', label: 'Kasse', en: 'Cash', source: 'fundamentals', scale: 'log',
      desc: 'Zahlungsmittel laut letzter Bilanz.', keywords: ['cash', 'kasse', 'liquide mittel'] }),
    n('netCash', { col: 'netCash', group: 'balance', unit: 'usd', label: 'Netto-Cash', en: 'Net Cash', source: 'fundamentals', scale: 'signedlog', better: 1,
      desc: 'Kasse minus Finanzschulden. Positiv heißt: mehr Geld als Schulden.', keywords: ['net cash', 'netto'], presets: [['Netto-Cash > 0', 'gt', 0]] }),
    n('revenue', { col: 'revenue', group: 'size', unit: 'usd', label: 'Umsatz (TTM)', short: 'Umsatz', en: 'Revenue', source: 'fundamentals', timeframe: 'TTM', scale: 'log', pro: true,
      desc: 'Umsatz der letzten zwölf Monate laut SEC-Berichten.', keywords: ['revenue', 'umsatz', 'sales'] }),
    n('freeCashFlow', { col: 'fcf', group: 'quality', unit: 'usd', label: 'Free Cashflow (TTM)', short: 'Free Cashflow', en: 'Free Cash Flow', source: 'fundamentals', timeframe: 'TTM', scale: 'signedlog', pro: true, better: 1,
      desc: 'Operativer Cashflow minus Investitionen der letzten zwölf Monate.', keywords: ['fcf', 'free cash flow', 'cashflow'], presets: [['Positiv', 'gt', 0]] }),
    n('eps', { col: 'eps', group: 'quality', unit: 'usd', label: 'Gewinn je Aktie (TTM, verwässert)', short: 'EPS (verw.)', en: 'EPS', source: 'fundamentals', timeframe: 'TTM', domain: [-5, 20, 0.05], pro: true, better: 1,
      desc: 'Verwässerter Gewinn je Aktie der letzten zwölf Monate: Summe der vier gemeldeten Quartale, von der SEC-Pipeline geprüft. Fehlt ein gemeldetes Quartal (häufig Q4), bleibt das Feld leer – es wird nie durch das Geschäftsjahr ersetzt.', keywords: ['eps', 'gewinn je aktie', 'earnings', 'ttm'], presets: [['Positiv', 'gt', 0]] }),
    n('epsFy', { col: 'epsFy', group: 'quality', unit: 'usd', label: 'Gewinn je Aktie (Geschäftsjahr, verwässert)', short: 'EPS GJ (verw.)', en: 'EPS (FY)', source: 'fundamentals', timeframe: 'FY', domain: [-5, 20, 0.05], pro: true, better: 1,
      desc: 'Verwässerter Gewinn je Aktie im letzten Geschäftsjahr (Gesamt-EPS). Eigenes Feld, kein Ersatz für den Zwölfmonatswert.', keywords: ['eps', 'gewinn je aktie', 'geschäftsjahr', 'fy'], presets: [['Positiv', 'gt', 0]] }),
    n('totalDebt', { col: 'totalDebt', group: 'balance', unit: 'usd', label: 'Finanzschulden', en: 'Total Debt', source: 'fundamentals', scale: 'log', better: -1,
      desc: 'Kurz- und langfristige Finanzschulden laut letzter Bilanz.', keywords: ['debt', 'schulden'] }),

    // ---------------- BEWERTUNG ----------------
    n('pe', { col: 'pe', group: 'valuation', unit: 'x', label: 'KGV (TTM)', short: 'KGV', en: 'P/E', source: 'fundamentals', timeframe: 'TTM', domain: [0, 100, 0.5], better: -1,
      desc: 'Kurs geteilt durch den verwässerten Gewinn je Aktie der letzten zwölf Monate (vier gemeldete Quartale). Nur bei Gewinn; ohne geprüftes Zwölfmonats-EPS leer.', keywords: ['pe', 'p/e', 'kgv', 'price earnings', 'ttm'], presets: [['< 15', 'lt', 15], ['< 25', 'lt', 25], ['15–30', 'between', 15, 30]] }),
    n('peFy', { col: 'peFy', group: 'valuation', unit: 'x', label: 'KGV (Geschäftsjahr)', short: 'KGV GJ', en: 'P/E (FY)', source: 'fundamentals', timeframe: 'FY', domain: [0, 100, 0.5], better: -1,
      desc: 'Kurs geteilt durch den verwässerten Gewinn je Aktie des letzten Geschäftsjahres. Nur bei Gewinn.', keywords: ['pe', 'p/e', 'kgv', 'geschäftsjahr', 'fy'], presets: [['< 15', 'lt', 15], ['< 25', 'lt', 25], ['15–30', 'between', 15, 30]] }),
    n('forwardPe', { group: 'valuation', unit: 'x', label: 'Erwartetes KGV', en: 'Forward P/E', source: 'estimates', available: false, reason: NO_ESTIMATES, keywords: ['forward pe', 'forward p/e', 'kgv'] }),
    n('peg', { col: 'peg', group: 'valuation', unit: 'x', label: 'PEG (Geschäftsjahr, historisch)', short: 'PEG', en: 'PEG', source: 'fundamentals', timeframe: 'FY', domain: [0, 5, 0.05], pro: true, better: -1, formula: 'peg',
      desc: 'KGV des letzten Geschäftsjahres geteilt durch das EPS-Wachstum der letzten drei Geschäftsjahre. Beide auf Geschäftsjahresbasis, historisch, keine Schätzung.', keywords: ['peg'], presets: [['< 1', 'lt', 1], ['< 2', 'lt', 2]] }),
    n('ps', { col: 'ps', group: 'valuation', unit: 'x', label: 'Kurs-Umsatz-Verhältnis (KUV)', short: 'KUV', en: 'Price / Sales', source: 'fundamentals', timeframe: 'TTM', domain: [0, 30, 0.1], better: -1,
      desc: 'Marktkapitalisierung im Verhältnis zum Umsatz der letzten zwölf Monate.', keywords: ['ps', 'p/s', 'kuv', 'price sales'], presets: [['< 2', 'lt', 2], ['< 5', 'lt', 5], ['< 10', 'lt', 10]] }),
    n('pb', { col: 'pb', group: 'valuation', unit: 'x', label: 'Kurs-Buchwert-Verhältnis (KBV)', short: 'KBV', en: 'Price / Book', source: 'fundamentals', domain: [0, 15, 0.1], better: -1,
      desc: 'Marktkapitalisierung im Verhältnis zum Eigenkapital.', keywords: ['pb', 'p/b', 'kbv', 'book'], presets: [['< 1', 'lt', 1], ['< 3', 'lt', 3]] }),
    n('evSales', { col: 'evSales', group: 'valuation', unit: 'x', label: 'EV / Umsatz', short: 'EV/Sales', en: 'EV / Sales', source: 'fundamentals', domain: [0, 30, 0.1], pro: true, better: -1, formula: 'evSales',
      desc: 'Unternehmenswert im Verhältnis zum Umsatz der letzten zwölf Monate.', keywords: ['ev sales', 'ev/sales'] }),
    n('evEbitda', { col: 'evEbitda', group: 'valuation', unit: 'x', label: 'EV / EBITDA', short: 'EV/EBITDA', en: 'EV / EBITDA', source: 'fundamentals', domain: [0, 50, 0.5], better: -1, formula: 'evEbitda',
      desc: 'Unternehmenswert im Verhältnis zum operativen Ergebnis vor Abschreibungen.', keywords: ['ev ebitda', 'ev/ebitda', 'ebitda'], presets: [['< 10', 'lt', 10], ['< 15', 'lt', 15]] }),
    n('pFcf', { col: 'pFcf', group: 'valuation', unit: 'x', label: 'Kurs / Free Cashflow', short: 'P/FCF', en: 'Price / FCF', source: 'fundamentals', timeframe: 'TTM', domain: [0, 100, 0.5], better: -1, formula: 'pFcf',
      desc: 'Marktkapitalisierung im Verhältnis zum Free Cashflow der letzten zwölf Monate.', keywords: ['p/fcf', 'price fcf', 'cashflow'], presets: [['< 15', 'lt', 15], ['< 25', 'lt', 25]] }),
    n('fcfYield', { col: 'fcfYield', group: 'valuation', unit: 'pct', label: 'Free-Cashflow-Rendite', short: 'FCF-Rendite', en: 'FCF Yield', source: 'fundamentals', timeframe: 'TTM', domain: [-0.1, 0.15, 0.005], better: 1,
      desc: 'Free Cashflow der letzten zwölf Monate im Verhältnis zur Marktkapitalisierung.', keywords: ['fcf yield', 'rendite', 'cashflow'], presets: [['> 3 %', 'gt', 0.03], ['> 5 %', 'gt', 0.05]] }),

    // ---------------- MOMENTUM ----------------
    n('perf1d', { col: 'chg1d', group: 'momentum', unit: 'pct', label: 'Performance 1 Tag', short: 'Perf. 1 Tag', en: 'Performance 1D', source: 'price', timeframe: '1D', domain: [-0.1, 0.1, 0.005], better: 1,
      desc: 'Kursveränderung am letzten Handelstag.', keywords: ['1d', 'heute', 'performance', 'tag'] }),
    n('perf1w', { col: 'perf1w', group: 'momentum', unit: 'pct', label: 'Performance 1 Woche', short: 'Perf. 1 Woche', en: 'Performance 1W', source: 'price', timeframe: '1W', domain: [-0.2, 0.2, 0.005], better: 1, formula: 'perf1w',
      desc: 'Kursveränderung über die letzten fünf Handelstage.', keywords: ['1w', 'woche', 'performance'] }),
    n('perf1m', { col: 'perf1m', group: 'momentum', unit: 'pct', label: 'Performance 1 Monat', short: 'Perf. 1 Monat', en: 'Performance 1M', source: 'price', timeframe: '1M', domain: [-0.3, 0.5, 0.01], better: 1,
      desc: 'Kursveränderung über einen Monat.', keywords: ['1m', 'monat', 'performance'] }),
    n('perf3m', { col: 'perf3m', group: 'momentum', unit: 'pct', label: 'Performance 3 Monate', short: 'Perf. 3 Monate', en: 'Performance 3M', source: 'price', timeframe: '3M', domain: [-0.5, 1, 0.01], better: 1,
      desc: 'Kursveränderung über drei Monate.', keywords: ['3m', 'performance'] }),
    n('perf6m', { col: 'perf6m', group: 'momentum', unit: 'pct', label: 'Performance 6 Monate', short: 'Perf. 6 Monate', en: 'Performance 6M', source: 'price', timeframe: '6M', domain: [-0.6, 1.5, 0.01], better: 1,
      desc: 'Kursveränderung über sechs Monate.', keywords: ['6m', 'performance', 'halbjahr'], presets: [['> 0 %', 'gt', 0], ['> 25 %', 'gt', 0.25], ['> 50 %', 'gt', 0.5]] }),
    n('perfYtd', { col: 'perfYtd', group: 'momentum', unit: 'pct', label: 'Performance seit Jahresbeginn', short: 'Perf. YTD', en: 'Performance YTD', source: 'price', timeframe: 'YTD', domain: [-0.6, 1.5, 0.01], better: 1, formula: 'perfYtd',
      desc: 'Kursveränderung seit dem letzten Schlusskurs des Vorjahres.', keywords: ['ytd', 'jahr', 'performance'] }),
    n('perf1y', { col: 'perf1y', group: 'momentum', unit: 'pct', label: 'Performance 1 Jahr', short: 'Perf. 1 Jahr', en: 'Performance 1Y', source: 'price', timeframe: '1Y', domain: [-0.7, 2, 0.01], better: 1,
      desc: 'Kursveränderung über zwölf Monate.', keywords: ['1y', '12m', 'jahr', 'performance'], presets: [['> 0 %', 'gt', 0], ['> 50 %', 'gt', 0.5]] }),
    n('relativeStrength', { col: 'rs6m', group: 'momentum', unit: 'pct', label: 'Relative Stärke (6 M.)', short: 'Rel. Stärke', en: 'Relative Strength', source: 'price', timeframe: '6M', domain: [-0.6, 1.5, 0.01], pro: true, better: 1,
      desc: 'Mehr- oder Minderrendite gegenüber dem Gesamtmarkt über sechs Monate.', keywords: ['relative strength', 'rs', 'relative stärke', 'outperformance'] }),
    n('relativeStrengthPct', { col: 'rsPct', group: 'momentum', unit: 'score', label: 'Relative Stärke (Perzentil)', short: 'RS-Perzentil', en: 'Relative Strength Percentile', source: 'price', domain: [0, 100, 1], pro: true, better: 1,
      desc: 'Rang der relativen Stärke im Universum: 90 heißt stärker als 90 % aller Aktien.', keywords: ['percentile', 'perzentil', 'rs rating', 'relative strength'], presets: [['Top 10 %', 'gte', 90], ['Top 20 %', 'gte', 80]] }),
    n('momentumPct', { col: 'momPct', group: 'momentum', unit: 'score', label: 'Momentum (Perzentil)', short: 'Momentum-Perzentil', en: 'Momentum Percentile', source: 'price', domain: [0, 100, 1], pro: true, better: 1,
      desc: 'Rang des Kursmomentums im Universum (Discover-Momentum-Score).', keywords: ['percentile', 'perzentil', 'momentum'] }),

    // ---------------- TECHNIK ----------------
    n('priceVsSma20', { col: 'distSma20', group: 'technical', unit: 'pct', label: 'Kurs vs. SMA20', en: 'Price vs SMA20', source: 'technical', domain: [-0.3, 0.3, 0.005], tech: 'sma', period: 20,
      desc: 'Abstand des Kurses zum gleitenden 20-Tage-Durchschnitt.', keywords: ['sma20', 'sma 20', 'gleitender durchschnitt', 'moving average'], presets: [['Über SMA20', 'gt', 0], ['Unter SMA20', 'lt', 0]] }),
    n('priceVsSma50', { col: 'distSma50', group: 'technical', unit: 'pct', label: 'Kurs vs. SMA50', en: 'Price vs SMA50', source: 'technical', domain: [-0.4, 0.4, 0.005], tech: 'sma', period: 50,
      desc: 'Abstand des Kurses zum gleitenden 50-Tage-Durchschnitt.', keywords: ['sma50', 'sma 50', 'gleitender durchschnitt'], presets: [['Über SMA50', 'gt', 0], ['Unter SMA50', 'lt', 0]] }),
    n('priceVsSma100', { col: 'distSma100', group: 'technical', unit: 'pct', label: 'Kurs vs. SMA100', en: 'Price vs SMA100', source: 'technical', domain: [-0.5, 0.5, 0.005], tech: 'sma', period: 100, pro: true,
      desc: 'Abstand des Kurses zum gleitenden 100-Tage-Durchschnitt.', keywords: ['sma100', 'sma 100'], presets: [['Über SMA100', 'gt', 0]] }),
    n('priceVsSma200', { col: 'distSma200', group: 'technical', unit: 'pct', label: 'Kurs vs. SMA200', en: 'Price vs SMA200', source: 'technical', domain: [-0.6, 0.8, 0.005], tech: 'sma', period: 200,
      desc: 'Abstand des Kurses zum gleitenden 200-Tage-Durchschnitt – der gängigste Trendfilter.', keywords: ['sma200', 'sma 200', '200', 'trend', 'gleitender durchschnitt'], presets: [['Über SMA200', 'gt', 0], ['Unter SMA200', 'lt', 0], ['0–10 % darüber', 'between', 0, 0.1]] }),
    n('sma50VsSma200', { col: 'sma50vs200', group: 'technical', unit: 'pct', label: 'SMA50 vs. SMA200', en: 'SMA50 vs SMA200', source: 'technical', domain: [-0.4, 0.4, 0.005], tech: 'cross', formula: 'sma50vs200',
      desc: 'Abstand des 50-Tage- zum 200-Tage-Durchschnitt. Positiv = „Golden Cross“-Zustand.', keywords: ['sma50', 'sma200', '200', 'golden cross', 'death cross'], presets: [['SMA50 über SMA200', 'gt', 0], ['SMA50 unter SMA200', 'lt', 0]] }),
    n('priceVsEma21', { col: 'distEma21', group: 'technical', unit: 'pct', label: 'Kurs vs. EMA21', en: 'Price vs EMA', source: 'technical', domain: [-0.3, 0.3, 0.005], tech: 'ema', period: 21, pro: true, formula: 'distEma21',
      desc: 'Abstand des Kurses zum exponentiellen 21-Tage-Durchschnitt.', keywords: ['ema', 'ema21', 'exponential'], presets: [['Über EMA21', 'gt', 0]] }),
    n('distance52wHigh', { col: 'dist52wH', group: 'technical', unit: 'pct', label: 'Abstand zum 52W-Hoch', short: '52W-Hoch', en: 'Distance from 52W High', source: 'technical', domain: [-0.8, 0, 0.005], tech: 'high', better: 1,
      desc: 'Wie weit der Kurs unter dem höchsten Tageskurs (Tageshoch) der letzten 52 Wochen liegt.', keywords: ['52w', '52 wochen', 'hoch', 'high', 'jahreshoch'], presets: [['Näher als 5 %', 'gt', -0.05], ['Näher als 10 %', 'gt', -0.1], ['Mehr als 30 % darunter', 'lt', -0.3]] }),
    n('distance52wLow', { col: 'dist52wL', group: 'technical', unit: 'pct', label: 'Abstand zum 52W-Tief', short: '52W-Tief', en: 'Distance from 52W Low', source: 'technical', domain: [0, 3, 0.01], tech: 'low',
      desc: 'Wie weit der Kurs über dem tiefsten Schlusskurs der letzten 52 Wochen liegt.', keywords: ['52w', 'tief', 'low', 'jahrestief'], presets: [['Näher als 10 %', 'lt', 0.1]] }),
    n('newHigh52w', { col: 'newHigh', group: 'technical', kind: 'bool', label: 'Neues 52W-Hoch', en: 'New 52W High', source: 'technical',
      desc: 'Der letzte Schlusskurs ist der höchste der letzten 52 Wochen.', keywords: ['52w', 'neues hoch', 'new high', 'jahreshoch'] }),
    n('rsi', { col: 'rsi14', group: 'technical', unit: 'num', label: 'RSI (14)', en: 'RSI', source: 'technical', domain: [0, 100, 1], tech: 'rsi', formula: 'rsi14',
      desc: 'Relative-Stärke-Index über 14 Tage. Über 70 gilt als überkauft, unter 30 als überverkauft.', keywords: ['rsi', 'überkauft', 'überverkauft', 'oszillator'], presets: [['< 70', 'lt', 70], ['< 30 (überverkauft)', 'lt', 30], ['40–70', 'between', 40, 70]] }),
    n('macd', { col: 'macdHist', group: 'technical', unit: 'pct', label: 'MACD-Histogramm', short: 'MACD', en: 'MACD', source: 'technical', domain: [-0.05, 0.05, 0.001], pro: true, formula: 'macdHist',
      desc: 'MACD (12/26) minus Signallinie (9), in Prozent des Kurses. Positiv = aufwärts gerichtetes Momentum.', keywords: ['macd', 'signal'], presets: [['MACD über Signal', 'gt', 0]] }),
    n('atr', { group: 'technical', unit: 'pct', label: 'ATR', en: 'ATR', source: 'technical', available: false, reason: 'Für die ATR werden Tageshoch und -tief benötigt; ausgeliefert werden nur Schlusskurse.', keywords: ['atr', 'average true range'] }),
    n('bollinger', { col: 'bollB', group: 'technical', unit: 'num', label: 'Bollinger %B', en: 'Bollinger Bands', source: 'technical', domain: [-0.5, 1.5, 0.01], pro: true, formula: 'bollB',
      desc: 'Lage des Kurses in den Bollinger-Bändern (20/2): 0 = unteres, 1 = oberes Band.', keywords: ['bollinger', 'bands', 'bänder'], presets: [['Über oberem Band', 'gt', 1], ['Unter unterem Band', 'lt', 0]] }),
    n('volatility', { col: 'vol252', group: 'technical', unit: 'pct', label: 'Volatilität (1 Jahr)', short: 'Volatilität', en: 'Volatility', source: 'technical', domain: [0, 1.5, 0.01], better: -1,
      desc: 'Annualisierte Schwankungsbreite der Tagesrenditen über ein Jahr.', keywords: ['volatility', 'volatilität', 'schwankung', 'risiko'], presets: [['< 30 %', 'lt', 0.3], ['< 50 %', 'lt', 0.5]] }),
    n('relativeVolume', { col: 'relVol', group: 'technical', unit: 'x', label: 'Relatives Volumen', en: 'Relative Volume', source: 'technical', domain: [0, 3, 0.05],
      desc: 'Ø Volumen der letzten 20 Tage im Verhältnis zu den letzten 60 Tagen.', keywords: ['relative volume', 'rvol', 'volumen'], presets: [['> 1,2', 'gt', 1.2], ['> 1,5', 'gt', 1.5]] }),
    n('maxDrawdown', { col: 'maxDd', group: 'technical', unit: 'pct', label: 'Max. Drawdown (1 Jahr)', short: 'Max. Drawdown', en: 'Max Drawdown', source: 'technical', domain: [-0.9, 0, 0.01], pro: true, better: 1,
      desc: 'Größter Verlust vom Hoch zum Tief innerhalb eines Jahres.', keywords: ['drawdown', 'verlust', 'risiko'] }),
    // Chartbild (Technical Intelligence, meist Wochenchart). Beschreibt die aktuelle
    // Lage und das Hauptszenario - keine Prognose, keine Handlungsempfehlung.
    n('tiOutlook', { col: 'tiOut', group: 'technical', kind: 'enum', label: 'Chartbild-Ausblick', short: 'Ausblick', en: 'Chart Outlook', source: 'technicalIntelligence', timeframe: '1W',
      desc: 'Richtung des Hauptszenarios im Chartbild (meist Wochenchart, für wenige Titel Tageschart): aufwärts, abwärts, seitwärts oder gemischt. Ein Szenario mit Invalidierung, keine Prognose und keine Wahrscheinlichkeit.', keywords: ['chartbild', 'ausblick', 'outlook', 'szenario', 'technical intelligence'] }),
    n('tiStructure', { col: 'tiStr', group: 'technical', kind: 'enum', label: 'Kursstruktur', en: 'Price Structure', source: 'technicalIntelligence', timeframe: '1W',
      desc: 'Trendphase aus der Abfolge von Hochs und Tiefs im Chart (meist Wochenchart), z. B. „Rücksetzer im Aufwärtstrend“. Beschreibt den Ist-Zustand.', keywords: ['struktur', 'trend', 'dow', 'rücksetzer', 'erholung', 'chartbild'] }),
    n('tiElliottApplicable', { col: 'tiEw', group: 'technical', kind: 'enum', label: 'Elliott-Strukturklarheit', short: 'Elliott-Klarheit', en: 'Elliott Structure Clarity', source: 'technicalIntelligence', timeframe: '1W', pro: true,
      desc: 'Experimentell: Wie eindeutig sich der Kursverlauf als Elliott-Wellenstruktur lesen lässt. Für die meisten Titel gibt es keine belastbare Zählung („Niedrig“). Nicht von Experten validiert, fließt nicht in den Ausblick ein, keine Prognose.', keywords: ['elliott', 'wellen', 'wave', 'experimentell', 'chartbild'] }),

    // ---------------- ANALYSTEN & ESTIMATES ----------------
    n('revenueEstimates', { group: 'analysts', unit: 'usd', label: 'Umsatzschätzungen', en: 'Revenue Estimates', source: 'estimates', available: false, reason: NO_ESTIMATES, keywords: ['revenue', 'estimates', 'schätzung'] }),
    n('epsEstimates', { group: 'analysts', unit: 'usd', label: 'EPS-Schätzungen', en: 'EPS Estimates', source: 'estimates', available: false, reason: NO_ESTIMATES, keywords: ['eps', 'estimates'] }),
    n('epsRevision30', { group: 'analysts', unit: 'pct', label: 'EPS-Revision 30 Tage', en: 'EPS Revision 30D', source: 'estimates', available: false, reason: NO_ESTIMATES, keywords: ['revision', 'eps'] }),
    n('epsRevision90', { group: 'analysts', unit: 'pct', label: 'EPS-Revision 90 Tage', en: 'EPS Revision 90D', source: 'estimates', available: false, reason: NO_ESTIMATES, keywords: ['revision', 'eps'] }),
    n('analystConsensus', { group: 'analysts', kind: 'enum', label: 'Analystenkonsens', en: 'Analyst Consensus', source: 'estimates', available: false, reason: NO_ESTIMATES, keywords: ['konsens', 'rating', 'analyst'] }),
    n('priceTargetUpside', { group: 'analysts', unit: 'pct', label: 'Kursziel-Potenzial', en: 'Price Target Upside', source: 'estimates', available: false, reason: NO_ESTIMATES, keywords: ['kursziel', 'target', 'upside'] }),
    n('estimateDispersion', { group: 'analysts', unit: 'pct', label: 'Streuung der Schätzungen', en: 'Estimate Dispersion', source: 'estimates', available: false, reason: NO_ESTIMATES, keywords: ['dispersion', 'streuung'] }),

    // ---------------- VISION UNIVERSE ----------------
    n('quantScore', { group: 'vu', unit: 'score', label: 'Quant Score', en: 'Quant Score', source: 'factor', available: false, reason: WITHHELD, keywords: ['quant', 'score'] }),
    n('qualityFactor', { col: 'fQuality', group: 'vu', unit: 'score', label: 'Qualitätsfaktor', en: 'Quality Factor', source: 'factor', domain: [0, 100, 1], better: 1,
      desc: 'Faktorevidenz Qualität aus Quant V2 (0–100, im Branchenvergleich). Einzelfaktor, kein Gesamturteil.', keywords: ['quality', 'qualität', 'faktor', 'quant'], presets: [['≥ 70', 'gte', 70], ['≥ 80', 'gte', 80]] }),
    n('growthFactor', { col: 'fGrowth', group: 'vu', unit: 'score', label: 'Wachstumsfaktor', en: 'Growth Factor', source: 'factor', domain: [0, 100, 1], better: 1,
      desc: 'Faktorevidenz Wachstum aus Quant V2 (0–100).', keywords: ['growth', 'wachstum', 'faktor', 'quant'], presets: [['≥ 70', 'gte', 70]] }),
    n('momentumFactor', { col: 'fMomentum', group: 'vu', unit: 'score', label: 'Momentumfaktor', en: 'Momentum Factor', source: 'factor', domain: [0, 100, 1], better: 1,
      desc: 'Faktorevidenz Momentum aus Quant V2 (0–100).', keywords: ['momentum', 'faktor', 'quant'], presets: [['≥ 70', 'gte', 70]] }),
    n('valueFactor', { col: 'fValue', group: 'vu', unit: 'score', label: 'Bewertungsfaktor', en: 'Value Factor', source: 'factor', domain: [0, 100, 1], better: 1,
      desc: 'Faktorevidenz Bewertung aus Quant V2 (0–100). Hoch = günstiger im Vergleich.', keywords: ['value', 'bewertung', 'faktor', 'quant'], presets: [['≥ 70', 'gte', 70]] }),
    n('profitabilityFactor', { col: 'fProfitability', group: 'vu', unit: 'score', label: 'Profitabilitätsfaktor', en: 'Profitability Factor', source: 'factor', domain: [0, 100, 1], better: 1,
      desc: 'Faktorevidenz Profitabilität aus Quant V2 (0–100).', keywords: ['profitability', 'profitabilität', 'faktor', 'quant'], presets: [['≥ 70', 'gte', 70]] }),
    n('revisionsFactor', { col: 'fRevisions', group: 'vu', unit: 'score', label: 'Revisionsfaktor', en: 'Revisions Factor', source: 'factor', domain: [0, 100, 1], better: 1,
      desc: 'Faktorevidenz Schätzungsrevisionen aus Quant V2.', keywords: ['revisions', 'revision', 'faktor'] }),
    n('riskFactor', { col: 'fRisk', group: 'vu', unit: 'score', label: 'Risikofaktor', en: 'Risk Factor', source: 'factor', domain: [0, 100, 1], better: 1,
      desc: 'Faktorevidenz Risiko aus Quant V2 (0–100). Hoch = geringeres Risiko im Vergleich.', keywords: ['risk', 'risiko', 'faktor', 'quant'], presets: [['≥ 60', 'gte', 60]] }),
    n('scoreMomentum', { group: 'vu', unit: 'score', label: 'Score-Momentum', en: 'Score Momentum', source: 'factor', available: false, reason: NO_METHOD, keywords: ['score momentum'] }),
    n('opportunityScore', { group: 'vu', unit: 'score', label: 'Opportunity Score', en: 'Opportunity Score', source: 'factor', available: false, reason: NO_METHOD, keywords: ['opportunity', 'chance'] }),
    n('regimeFit', { group: 'vu', unit: 'score', label: 'Market Regime Fit', en: 'Market Regime Fit', source: 'factor', available: false, reason: NO_METHOD, keywords: ['regime', 'markt'] })
  ];

  // Leitfrage (Filter-Detail) und Kurzbeschreibung (Bibliothek) in Alltagssprache.
  var COPY = {
    country: ['Wo ist die Aktie gelistet?', 'Land der Primärbörse'], region: ['In welcher Region wird gehandelt?', 'Region der Primärbörse'],
    exchange: ['An welcher Börse wird gehandelt?', 'NASDAQ, NYSE, AMEX …'], sector: ['In welchem Sektor ist das Unternehmen tätig?', 'Technologie, Gesundheit, Finanzen …'],
    industry: ['In welcher Branche genau?', 'SIC-Hauptgruppe der SEC'], ipoYear: ['Seit wann ist die Aktie an der Börse?', 'Jahr des ersten Handelstags'],
    companyType: ['Um welche Wertpapierart handelt es sich?', 'Stammaktie, REIT, ADR …'], index: ['Ist die Aktie in einem großen Index?', 'S&P 500, Nasdaq-100, Dow Jones'],
    marketCap: ['Wie groß ist ein Unternehmen an der Börse?', 'Von Micro bis Mega Cap'], enterpriseValue: ['Was kostet das Unternehmen inklusive Schulden?', 'Marktwert + Schulden − Kasse'],
    price: ['Wie hoch ist der Aktienkurs?', 'Letzter Schlusskurs'], avgVolume: ['Wie viele Aktien werden täglich gehandelt?', 'Liquidität in Stück'],
    dollarVolume: ['Wie viel Geld wird täglich umgesetzt?', 'Liquidität in Dollar'], beta: ['Wie stark schwankt die Aktie mit dem Markt?', 'Marktsensitivität'],
    revenue: ['Wie viel Umsatz macht das Unternehmen?', 'Letzte zwölf Monate'],
    revenueGrowth: ['Wie stark wächst der Umsatz eines Unternehmens?', 'Letzte zwölf Monate ggü. Vorjahr'], revenueCagr3: ['Wie stark ist der Umsatz über drei Jahre gewachsen?', 'Jährliche Wachstumsrate (CAGR)'],
    revenueCagr10: ['Wie beständig wächst der Umsatz langfristig?', 'CAGR über zehn Jahre'], epsGrowth: ['Wächst der Gewinn je Aktie?', 'Letztes Geschäftsjahr ggü. Vorjahr'],
    epsCagr3: ['Wie stark ist der Gewinn je Aktie über drei Jahre gewachsen?', 'Jährliche Wachstumsrate'], netIncomeGrowth: ['Wächst der Gewinn?', 'Jahresüberschuss, letzte zwölf Monate'],
    fcfGrowth: ['Wächst der freie Cashflow?', 'Letztes Geschäftsjahr ggü. Vorjahr'], marginExpansion: ['Werden die Margen besser?', 'Operative Marge, Veränderung 3 Jahre'],
    grossMargin: ['Wie viel bleibt nach den direkten Kosten übrig?', 'Preissetzungsmacht'], operatingMargin: ['Wie profitabel ist das Kerngeschäft?', 'Operatives Ergebnis je Umsatz'],
    netMargin: ['Wie viel Gewinn bleibt vom Umsatz?', 'Jahresüberschuss je Umsatz'], fcfMargin: ['Wie viel freies Geld erwirtschaftet der Umsatz?', 'Free Cashflow je Umsatz'],
    freeCashFlow: ['Wie viel freies Geld verdient das Unternehmen?', 'Letzte zwölf Monate'], eps: ['Wie viel Gewinn entfällt auf eine Aktie?', 'Verwässert, letzte zwölf Monate'],
    roe: ['Wie gut verzinst sich das Eigenkapital?', 'Return on Equity'], roa: ['Wie effizient arbeitet das gesamte Vermögen?', 'Return on Assets'],
    roic: ['Wie gut verzinst sich das eingesetzte Kapital?', 'Return on Invested Capital'], cashConversion: ['Kommt der Gewinn als Geld an?', 'Operativer Cashflow je Gewinn'],
    debtToEquity: ['Wie hoch ist die Verschuldung?', 'Schulden im Verhältnis zum Eigenkapital'], netDebtEbitda: ['Wie schnell wären die Schulden getilgt?', 'Jahre operativen Ergebnisses'],
    cash: ['Wie viel Geld liegt in der Kasse?', 'Zahlungsmittel'], netCash: ['Mehr Geld als Schulden?', 'Kasse minus Finanzschulden'], totalDebt: ['Wie viele Schulden hat das Unternehmen?', 'Kurz- und langfristig'],
    pe: ['Wie teuer ist der Gewinn?', 'Kurs-Gewinn-Verhältnis'], peg: ['Ist das KGV durch Wachstum gedeckt?', 'KGV je Prozent EPS-Wachstum'], ps: ['Wie teuer ist der Umsatz?', 'Kurs-Umsatz-Verhältnis'],
    pb: ['Wie teuer ist das Eigenkapital?', 'Kurs-Buchwert-Verhältnis'], evSales: ['Wie teuer ist der Umsatz inklusive Schulden?', 'EV / Umsatz'],
    evEbitda: ['Wie teuer ist das operative Ergebnis?', 'EV / EBITDA'], pFcf: ['Wie teuer ist der freie Cashflow?', 'Kurs / Free Cashflow'], fcfYield: ['Welche Cashflow-Rendite bietet der Kurs?', 'Free Cashflow / Marktwert'],
    perf1d: ['Wie hat sich der Kurs heute entwickelt?', 'Letzter Handelstag'], perf1w: ['Wie war die letzte Woche?', 'Fünf Handelstage'], perf1m: ['Wie war der letzte Monat?', 'Kursveränderung'],
    perf3m: ['Wie waren die letzten drei Monate?', 'Kursveränderung'], perf6m: ['Wie waren die letzten sechs Monate?', 'Mittelfristiges Momentum'], perfYtd: ['Wie läuft das Jahr bisher?', 'Seit Jahresbeginn'],
    perf1y: ['Wie war das letzte Jahr?', 'Zwölf Monate'], relativeStrength: ['Schlägt die Aktie den Markt?', 'Mehrrendite ggü. Markt, 6 Monate'],
    relativeStrengthPct: ['Wie stark ist die Aktie im Vergleich zu allen anderen?', 'Rang 0–100 im Universum'], momentumPct: ['Wie stark ist das Momentum im Vergleich?', 'Rang 0–100 im Universum'],
    priceVsSma20: ['Wie steht der Kurs zum kurzfristigen Trend?', 'Aktueller Kurs vs. 20-Tage-Durchschnitt'], priceVsSma50: ['Wie steht der Kurs zum mittelfristigen Trend?', 'Aktueller Kurs vs. 50-Tage-Durchschnitt'],
    priceVsSma100: ['Wie steht der Kurs zum 100-Tage-Trend?', 'Aktueller Kurs vs. 100-Tage-Durchschnitt'], priceVsSma200: ['Wie steht der aktuelle Kurs zum langfristigen Trend?', 'Aktueller Kurs vs. SMA 200'],
    sma50VsSma200: ['Liegt der mittelfristige über dem langfristigen Trend?', 'Golden / Death Cross'], priceVsEma21: ['Wie steht der Kurs zum exponentiellen Durchschnitt?', 'Exponential Moving Average (21)'],
    distance52wHigh: ['Wie nah ist die Aktie am Jahreshoch?', 'Abstand zum 52-Wochen-Hoch'], distance52wLow: ['Wie weit ist die Aktie vom Jahrestief entfernt?', 'Abstand zum 52-Wochen-Tief'],
    newHigh52w: ['Steht die Aktie auf einem neuen Jahreshoch?', 'Höchster Schluss seit 52 Wochen'], rsi: ['Ist die Aktie überkauft oder überverkauft?', 'Relative-Stärke-Index (14)'],
    macd: ['Dreht das Momentum?', 'Trendfolge und Momentum'], bollinger: ['Wo steht der Kurs in seinem Schwankungsband?', 'Volatilität und Ausbrüche'],
    volatility: ['Wie stark schwankt die Aktie?', 'Historische Schwankung'], relativeVolume: ['Wird gerade mehr gehandelt als üblich?', 'Volumen 20 vs. 60 Tage'],
    maxDrawdown: ['Wie tief ist die Aktie im letzten Jahr gefallen?', 'Größter Verlust vom Hoch'],
    qualityFactor: ['Wie stark ist die Qualität im Branchenvergleich?', 'Quant-V2-Faktorevidenz'], growthFactor: ['Wie stark ist das Wachstum im Branchenvergleich?', 'Quant-V2-Faktorevidenz'],
    momentumFactor: ['Wie stark ist das Momentum im Branchenvergleich?', 'Quant-V2-Faktorevidenz'], valueFactor: ['Wie günstig ist die Bewertung im Vergleich?', 'Quant-V2-Faktorevidenz'],
    profitabilityFactor: ['Wie profitabel im Branchenvergleich?', 'Quant-V2-Faktorevidenz'], revisionsFactor: ['Werden Schätzungen angehoben?', 'Quant-V2-Faktorevidenz'],
    riskFactor: ['Wie gering ist das Risiko im Vergleich?', 'Quant-V2-Faktorevidenz']
  };

  var BY_ID = {};
  FIELDS.forEach(function (f) {
    if (COPY[f.id]) { f.question = COPY[f.id][0]; f.sub = COPY[f.id][1]; }
    if (!f.sub) f.sub = f.available ? (f.desc || '') : 'Daten folgen';
    if (f.available === undefined) f.available = true;
    if (!f.short) f.short = f.label;
    f.pro = !!(f.pro || (GROUPS.filter(function (g) { return g.id === f.group; })[0] || {}).pro);
    BY_ID[f.id] = f;
  });

  // ---------------------------------------------------------------- Enums
  var ENUM_LABELS = {
    country: { US: 'USA' },
    region: { NA: 'Nordamerika' },
    companyType: { EQUITY_COMMON: 'Stammaktie', REIT: 'REIT', SPAC: 'SPAC', TRUST: 'Trust', ADR: 'ADR' },
    index: { SP500: 'S&P 500', SPX: 'S&P 500', NDX: 'Nasdaq-100', DJIA: 'Dow Jones' },
    // Wortlaut wie im Chartbild (quant/engines/technical/ti/explain.js)
    tiOutlook: { BULLISH: 'Aufwärts', BEARISH: 'Abwärts', NEUTRAL: 'Seitwärts', MIXED: 'Gemischt' },
    tiStructure: { UPTREND_ADVANCING: 'Aufwärtstrend intakt', CORRECTION_IN_UPTREND: 'Rücksetzer im Aufwärtstrend', DOWNTREND_ADVANCING: 'Abwärtstrend intakt',
      RALLY_IN_DOWNTREND: 'Erholung im Abwärtstrend', SIDEWAYS_RANGE: 'Seitwärtsphase', NO_CLEAR_TREND: 'Kein klarer Trend' },
    tiElliottApplicable: { HIGH: 'Hoch', MODERATE: 'Mittel', LOW: 'Niedrig – keine belastbare Zählung' }
  };
  var REGION_OF = { US: 'NA', CA: 'NA' };

  // ------------------------------------------------------------ Operatoren
  var OPERATORS = {
    gt: { label: 'größer als', sym: '>' },
    gte: { label: 'mindestens', sym: '≥' },
    lt: { label: 'kleiner als', sym: '<' },
    lte: { label: 'höchstens', sym: '≤' },
    between: { label: 'zwischen', sym: '–' },
    eq: { label: 'gleich', sym: '=' },
    in: { label: 'ist eines von', sym: '∈' },
    is: { label: 'ist', sym: '=' }
  };
  function operatorsFor(field) {
    if (field.kind === 'enum') return ['in'];
    if (field.kind === 'bool') return ['is'];
    return ['gt', 'lt', 'between', 'eq', 'gte', 'lte'];
  }

  // ------------------------------------------------------------ Formatierung
  var NBSP = ' ';
  function de(v, digits) { return v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
  function compactUsd(v) {
    var a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e12) return s + de(a / 1e12, a >= 1e13 ? 1 : 2) + NBSP + 'Bio.' + NBSP + '$';
    if (a >= 1e9) return s + de(a / 1e9, a >= 1e11 ? 0 : 1) + NBSP + 'Mrd.' + NBSP + '$';
    if (a >= 1e6) return s + de(a / 1e6, a >= 1e8 ? 0 : 1) + NBSP + 'Mio.' + NBSP + '$';
    if (a >= 1e3) return s + de(a / 1e3, 0) + NBSP + 'Tsd.' + NBSP + '$';
    return s + de(a, a < 10 ? 2 : 0) + NBSP + '$';
  }
  function compactCount(v) {
    if (v >= 1e9) return de(v / 1e9, 1) + NBSP + 'Mrd.';
    if (v >= 1e6) return de(v / 1e6, 1) + NBSP + 'Mio.';
    if (v >= 1e3) return de(v / 1e3, 0) + NBSP + 'Tsd.';
    return de(v, 0);
  }
  function pct(v, signed) {
    var p = v * 100, a = Math.abs(p), d = a >= 10 || a === 0 || Number.isInteger(a) ? 0 : 1;
    var s = de(a, d) + NBSP + '%';
    if (p < 0 && Math.round(a * Math.pow(10, d)) !== 0) return '−' + s;
    return (signed && p > 0 ? '+' : '') + s;
  }
  /** Rohwert -> Anzeige. signed: Vorzeichen bei positiven Veraenderungen. */
  function format(field, v, opts) {
    opts = opts || {};
    if (v === null || v === undefined || (typeof v === 'number' && !isFinite(v))) return '–';
    if (typeof field === 'string') field = BY_ID[field] || { unit: 'num' };
    if (field.kind === 'bool') return v ? 'Ja' : 'Nein';
    if (field.kind === 'enum') return enumLabel(field, v);
    switch (field.unit) {
      case 'pct': return pct(v, opts.signed !== undefined ? opts.signed : isSigned(field));
      case 'pp': return (v > 0 ? '+' : v < 0 ? '−' : '') + de(Math.abs(v), 1) + NBSP + 'Pp.';
      case 'usd': return field.id === 'price' ? de(v, v < 1 ? 3 : 2) + NBSP + '$' : field.id === 'eps' ? (v < 0 ? '−' : '') + de(Math.abs(v), 2) + NBSP + '$' : compactUsd(v);
      case 'x': return de(v, Math.abs(v) >= 100 ? 0 : 1) + (field.id === 'cashConversion' || field.id === 'relativeVolume' ? '×' : '');
      case 'score': return de(v, 0);
      case 'count': return compactCount(v);
      case 'year': return String(Math.round(v));
      default: return de(v, Number.isInteger(v) || Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
    }
  }
  function isSigned(field) {
    return ['growth', 'momentum', 'technical'].indexOf(field.group) >= 0 && field.unit === 'pct' && field.id !== 'volatility';
  }
  function enumLabel(field, v, dict) {
    var id = typeof field === 'string' ? field : field.id;
    var map = ENUM_LABELS[id];
    if (map && map[v]) return map[v];
    var D = dict || (global.VUScreenerFields && global.VUScreenerFields._dict) || null;
    if (D) {
      if (id === 'sector' && D.sectors && D.sectors[v]) return D.sectors[v];
      if (id === 'industry' && D.majorGroups && D.majorGroups[v]) return D.majorGroups[v];
    }
    return String(v);
  }

  /** Anzeige <-> Rohwert fuer Eingabefelder (Prozente als Prozentzahl). */
  function toInput(field, v) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    if (field.unit === 'pct') return String(Number((v * 100).toPrecision(6)));
    if (field.unit === 'usd' && field.id !== 'price' && field.id !== 'eps' && field.id !== 'epsFy') {
      var a = Math.abs(v);
      if (a >= 1e9) return String(Number((v / 1e9).toPrecision(6)));
      if (a >= 1e6) return String(Number((v / 1e6).toPrecision(6)));
    }
    return String(Number(v.toPrecision(6)));
  }
  function inputUnit(field, v) {
    if (field.unit === 'pct') return '%';
    if (field.unit === 'pp') return 'Pp.';
    if (field.unit === 'usd' && field.id !== 'price' && field.id !== 'eps' && field.id !== 'epsFy') { var a = Math.abs(v || 0); return a >= 1e9 ? 'Mrd. $' : a >= 1e6 ? 'Mio. $' : '$'; }
    if (field.unit === 'usd') return '$';
    return '';
  }
  function fromInput(field, text, unitHint) {
    var s = String(text).trim().replace(/\s/g, '').replace(/−/g, '-');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var v = Number(s);
    if (!isFinite(v) || s === '') return null;
    if (field.unit === 'pct') return v / 100;
    if (unitHint === 'Mrd. $') return v * 1e9;
    if (unitHint === 'Mio. $') return v * 1e6;
    return v;
  }

  /** Kurze, lesbare Beschreibung eines Filters: "Market Cap < 1 Mrd. $" */
  function describeFilter(filter, dict) {
    var f = BY_ID[filter.field];
    if (!f) return filter.field;
    var name = f.short || f.label;
    if (f.kind === 'enum') {
      var vals = (filter.value || []).map(function (v) { return enumLabel(f, v, dict); });
      if (vals.length <= 2) return vals.join(', ') || name;
      return name + ': ' + vals.slice(0, 2).join(', ') + ' +' + (vals.length - 2);
    }
    if (f.kind === 'bool') return filter.value ? f.label : 'Kein ' + f.label;
    if (f.tech === 'sma' || f.tech === 'ema' || f.tech === 'cross') {
      var base = f.tech === 'cross' ? 'SMA50' : 'Kurs', ref = f.tech === 'cross' ? 'SMA200' : (f.tech === 'ema' ? 'EMA' : 'SMA') + f.period;
      if ((filter.op === 'gt' || filter.op === 'gte') && filter.value === 0) return base + ' über ' + ref;
      if ((filter.op === 'lt' || filter.op === 'lte') && filter.value === 0) return base + ' unter ' + ref;
    }
    var fmt = function (v) { return format(f, v, { signed: false }); };
    if (filter.op === 'between') return name + ' ' + fmt(filter.value) + ' – ' + fmt(filter.value2);
    return name + ' ' + OPERATORS[filter.op].sym + ' ' + fmt(filter.value);
  }

  // ---------------------------------------------------------------- Suche
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%&/ ]/g, ' '); }
  /**
   * Durchsucht Label, englischen Namen, ID und Schlagworte. Ergebnis nach
   * Treffergüte sortiert; nicht verfuegbare Kriterien stehen hinten.
   */
  function search(query, opts) {
    opts = opts || {};
    var q = norm(query).trim();
    if (!q) return [];
    var terms = q.split(/\s+/);
    var out = [];
    FIELDS.forEach(function (f, i) {
      if (opts.mode === 'simple' && f.pro) return;
      var hay = [norm(f.label), norm(f.short), norm(f.en), norm(f.id), norm((f.keywords || []).join(' '))];
      var all = hay.join(' | ');
      if (!terms.every(function (t) { return all.indexOf(t) >= 0; })) return;
      var score = 0;
      if (hay[0].indexOf(q) === 0 || hay[2].indexOf(q) === 0) score += 50;
      if (hay[0].indexOf(q) >= 0 || hay[2].indexOf(q) >= 0 || hay[1].indexOf(q) >= 0) score += 25;
      if (hay[3] === q.replace(/ /g, '')) score += 60;
      if (!f.available) score -= 40;
      out.push({ field: f, score: score, i: i });
    });
    out.sort(function (a, b) { return b.score - a.score || a.i - b.i; });
    return out.map(function (x) { return x.field; });
  }

  function list(opts) {
    opts = opts || {};
    return FIELDS.filter(function (f) { return opts.mode !== 'simple' || !f.pro; });
  }
  function groups(opts) {
    opts = opts || {};
    return GROUPS.filter(function (g) { return opts.mode !== 'simple' || !g.pro; });
  }

  var API = {
    VERSION: 'vu-screener-fields-1.0.0',
    GROUPS: GROUPS, FIELDS: FIELDS, OPERATORS: OPERATORS, ENUM_LABELS: ENUM_LABELS, REGION_OF: REGION_OF,
    field: function (id) { return BY_ID[id] || null; },
    group: function (id) { return GROUPS.filter(function (g) { return g.id === id; })[0] || null; },
    list: list, groups: groups, search: search, operatorsFor: operatorsFor,
    format: format, enumLabel: enumLabel, describeFilter: describeFilter,
    toInput: toInput, fromInput: fromInput, inputUnit: inputUnit,
    setDictionary: function (dict) { API._dict = dict; }, _dict: null
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.VUScreenerFields = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
