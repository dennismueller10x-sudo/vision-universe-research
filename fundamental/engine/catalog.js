/* Fundamental 2.0 – Kennzahlenkatalog, Reihen, Branchenvergleich und Ranglisten (UMD, ohne Abhaengigkeiten).
 *
 * Quellen (alle bestehend, nichts wird geschaetzt oder aufgefuellt):
 *  1. SEC-Historie je Emittent: /fundamental/data/history/<shardKey>.json.gz – Auslieferungsansicht der SEC-Verbraucherdateien
 *     (scripts/fundamental/build-history.mjs): Geschaeftsjahre, eigenstaendige Quartale, letzte zwoelf Monate, Meldung je Wert.
 *  2. Ersatz ohne Historie: der Block `fundamentals` der Discover-Aktiendatei (Jahresreihen weniger Kennzahlen + letztes Jahr).
 *  3. Querschnitt aller US-Aktien: /screener/data/universe-US_REAL.json (Erzeuger scripts/screener/build-universe.mjs) –
 *     Branche (SIC), Bewertung, Renditen; dieselben Werte wie im Screener.
 * Abgeleitete Kennzahlen folgen den Formeln in FORMULA (Renditen wie im Screener). Ein Wert fehlt, wenn eine Eingabe fehlt.
 * Bewertungskennzahlen: aktueller Wert zum Schlusskurs; der Verlauf zum Geschaeftsjahresende nur aus geprueften Stichtagswerten
 * (historicalValuation: splitbereinigter Kurs, Aktienzahl und Gewinn je Aktie mit Split-Beleg und Gegenprobe). */
(function (global) {
  'use strict';
  var VERSION = 'fundamental-catalog-2.0.0';
  var HISTORY_BASE = '/fundamental/data/history/';
  var UNIVERSE_PATH = '/screener/data/universe-US_REAL.json';
  var ANALYST_PATH = '/dashboard/data/analyst_ratings.json';
  var SERIES_BASE = '/quant/data/market/discover-series/';

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function div(a, b) { return isNum(a) && isNum(b) && b !== 0 ? a / b : null; }

  /* ------------------------------------------------------------------ Kategorien */
  var CATS = [
    { id: 'wachstum', label: 'Wachstum', icon: 'growth' },
    { id: 'guv', label: 'Gewinn & Verlust', icon: 'income' },
    { id: 'profit', label: 'Profitabilität', icon: 'margin' },
    { id: 'cashflow', label: 'Cashflow', icon: 'cash' },
    { id: 'bilanz', label: 'Bilanz', icon: 'balance' },
    { id: 'aktie', label: 'Aktie & Dividende', icon: 'share' },
    { id: 'bewertung', label: 'Bewertung', icon: 'valuation' }
  ];

  /* ------------------------------------------------------------------ Katalog
   * kind: money | ratio (Anteil, Anzeige in %) | growth (Veraenderung in %) | multiple (×) | perShare | shares
   * base: Kennzahl der SEC-Quelle. calc(get): abgeleitet aus Werten DESSELBEN Zeitraums (get(id) -> Wert oder null).
   * flow: Zeitraumgroesse (summierbar) – sonst Stichtag. q: auch quartalsweise sinnvoll. u: Spalte im Screener-Universum.
   * snap: nur aktueller Wert (Bewertung). */
  var M = [
    // Wachstum (Veraenderung zum Vorjahreszeitraum: Jahr ggue. Vorjahr, Quartal ggue. Vorjahresquartal)
    { id: 'revenue_growth', label: 'Umsatzwachstum', cat: 'wachstum', kind: 'growth', of: 'revenue', q: true, u: 'revGrowth', uBasis: 'TTM', desc: 'Veränderung des Umsatzes zum Vorjahreszeitraum.' },
    { id: 'gross_profit_growth', label: 'Bruttogewinn-Wachstum', cat: 'wachstum', kind: 'growth', of: 'gross_profit', q: true, desc: 'Veränderung des Bruttogewinns zum Vorjahreszeitraum.' },
    { id: 'operating_income_growth', label: 'Wachstum operatives Ergebnis', cat: 'wachstum', kind: 'growth', of: 'operating_income', q: true, desc: 'Veränderung des operativen Ergebnisses zum Vorjahreszeitraum.' },
    { id: 'net_income_growth', label: 'Gewinnwachstum', cat: 'wachstum', kind: 'growth', of: 'net_income', q: true, desc: 'Veränderung des Nettogewinns zum Vorjahreszeitraum.' },
    { id: 'eps_growth', label: 'Wachstum Gewinn je Aktie', cat: 'wachstum', kind: 'growth', of: 'eps_diluted', q: true, u: 'epsGrowth', uBasis: 'FY', perShareGrowth: true, desc: 'Veränderung des verwässerten Gewinns je Aktie zum Vorjahreszeitraum.' },
    { id: 'fcf_growth', label: 'Free-Cashflow-Wachstum', cat: 'wachstum', kind: 'growth', of: 'free_cash_flow', q: true, u: 'fcfGrowth', uBasis: 'FY', desc: 'Veränderung des Free Cashflows zum Vorjahreszeitraum.' },
    // Gewinn & Verlust
    { id: 'revenue', label: 'Umsatz', cat: 'guv', kind: 'money', base: 'revenue', flow: true, q: true, u: 'revenue', uBasis: 'TTM', desc: 'Erlöse aus dem Verkauf von Waren und Dienstleistungen.' },
    { id: 'gross_profit', label: 'Bruttogewinn', cat: 'guv', kind: 'money', base: 'gross_profit', flow: true, q: true, desc: 'Umsatz abzüglich der direkten Herstellungskosten.' },
    { id: 'research_and_development', label: 'Forschung & Entwicklung', cat: 'guv', kind: 'money', base: 'research_and_development', flow: true, desc: 'Aufwand für Forschung und Entwicklung.' },
    { id: 'operating_income', label: 'Operatives Ergebnis', cat: 'guv', kind: 'money', base: 'operating_income', flow: true, q: true, desc: 'Ergebnis aus dem laufenden Geschäft vor Zinsen und Steuern (EBIT).' },
    { id: 'ebitda', label: 'EBITDA', cat: 'guv', kind: 'money', base: 'ebitda', flow: true, q: true, desc: 'Operatives Ergebnis vor Abschreibungen.' },
    { id: 'depreciation_and_amortization', label: 'Abschreibungen', cat: 'guv', kind: 'money', base: 'depreciation_and_amortization', flow: true, q: true, desc: 'Abschreibungen auf Sachanlagen und immaterielle Werte.' },
    { id: 'pretax_income', label: 'Ergebnis vor Steuern', cat: 'guv', kind: 'money', base: 'pretax_income', flow: true, q: true, desc: 'Ergebnis vor Ertragsteuern.' },
    { id: 'income_tax_expense', label: 'Ertragsteuern', cat: 'guv', kind: 'money', base: 'income_tax_expense', flow: true, q: true, desc: 'Steueraufwand auf das Ergebnis.' },
    { id: 'net_income', label: 'Nettogewinn', cat: 'guv', kind: 'money', base: 'net_income', flow: true, q: true, desc: 'Gewinn nach allen Kosten, Zinsen und Steuern.' },
    { id: 'eps_diluted', label: 'Gewinn je Aktie (verwässert)', cat: 'guv', kind: 'perShare', base: 'eps_diluted', flow: true, q: true, u: 'eps', uBasis: 'TTM', perShareSeries: true, desc: 'Nettogewinn je Aktie, einschließlich möglicher neuer Aktien aus Optionen.' },
    { id: 'stock_based_compensation', label: 'Aktienbasierte Vergütung', cat: 'guv', kind: 'money', base: 'stock_based_compensation', flow: true, desc: 'Vergütung in Aktien und Optionen (nicht zahlungswirksam).' },
    // Profitabilitaet
    { id: 'gross_margin', label: 'Bruttomarge', cat: 'profit', kind: 'ratio', q: true, u: 'grossMargin', uBasis: 'FY', deps: ['gross_profit', 'revenue'], calc: function (g) { return margin(g('gross_profit'), g('revenue')); }, formula: 'Bruttogewinn ÷ Umsatz', desc: 'Anteil des Umsatzes, der nach den direkten Kosten bleibt.' },
    { id: 'operating_margin', label: 'Operative Marge', cat: 'profit', kind: 'ratio', q: true, u: 'opMargin', uBasis: 'FY', deps: ['operating_income', 'revenue'], calc: function (g) { return margin(g('operating_income'), g('revenue')); }, formula: 'Operatives Ergebnis ÷ Umsatz', desc: 'Anteil des Umsatzes, der als operatives Ergebnis bleibt.' },
    { id: 'ebitda_margin', label: 'EBITDA-Marge', cat: 'profit', kind: 'ratio', q: true, deps: ['ebitda', 'revenue'], calc: function (g) { return margin(g('ebitda'), g('revenue')); }, formula: 'EBITDA ÷ Umsatz', desc: 'EBITDA im Verhältnis zum Umsatz.' },
    { id: 'net_margin', label: 'Nettomarge', cat: 'profit', kind: 'ratio', q: true, u: 'netMargin', uBasis: 'FY', deps: ['net_income', 'revenue'], calc: function (g) { return margin(g('net_income'), g('revenue')); }, formula: 'Nettogewinn ÷ Umsatz', desc: 'Anteil des Umsatzes, der als Gewinn bleibt.' },
    { id: 'fcf_margin', label: 'Free-Cashflow-Marge', cat: 'profit', kind: 'ratio', q: true, u: 'fcfMargin', uBasis: 'FY', deps: ['free_cash_flow', 'revenue'], calc: function (g) { return margin(g('free_cash_flow'), g('revenue')); }, formula: 'Free Cashflow ÷ Umsatz', desc: 'Anteil des Umsatzes, der als freier Cashflow übrig bleibt.' },
    { id: 'roe', label: 'Eigenkapitalrendite (ROE)', cat: 'profit', kind: 'ratio', u: 'roe', uBasis: 'FY', deps: ['net_income', 'stockholders_equity'], calc: function (g) { var e = g('stockholders_equity'); return e > 0 ? div(g('net_income'), e) : null; }, formula: 'Nettogewinn ÷ Eigenkapital (Geschäftsjahresende); nur bei positivem Eigenkapital', desc: 'Gewinn im Verhältnis zum Eigenkapital der Aktionäre.' },
    { id: 'roa', label: 'Gesamtkapitalrendite (ROA)', cat: 'profit', kind: 'ratio', u: 'roa', uBasis: 'FY', deps: ['net_income', 'total_assets'], calc: function (g) { var a = g('total_assets'); return a > 0 ? div(g('net_income'), a) : null; }, formula: 'Nettogewinn ÷ Bilanzsumme', desc: 'Gewinn im Verhältnis zum gesamten Vermögen.' },
    { id: 'roic', label: 'Kapitalrendite (ROIC)', cat: 'profit', kind: 'ratio', u: 'roic', uBasis: 'FY', deps: ['operating_income', 'stockholders_equity', 'total_debt', 'cash_and_equivalents'], calc: roic, formula: 'Operatives Ergebnis × (1 − Steuerquote) ÷ (Eigenkapital + Finanzschulden − Kasse); Steuerquote = Steuern ÷ Ergebnis vor Steuern, begrenzt auf 0–50 %, ohne Angabe 21 % (US-Satz) – wie im Screener', desc: 'Rendite auf das im Geschäft gebundene Kapital.' },
    { id: 'tax_rate', label: 'Steuerquote', cat: 'profit', kind: 'ratio', q: true, deps: ['income_tax_expense', 'pretax_income'], calc: function (g) { var p = g('pretax_income'); return p > 0 ? div(g('income_tax_expense'), p) : null; }, formula: 'Ertragsteuern ÷ Ergebnis vor Steuern (nur bei positivem Ergebnis)', desc: 'Anteil des Vorsteuerergebnisses, der als Steuer anfällt.' },
    { id: 'rd_ratio', label: 'F&E-Quote', cat: 'profit', kind: 'ratio', deps: ['research_and_development', 'revenue'], calc: function (g) { return margin(g('research_and_development'), g('revenue')); }, formula: 'Forschung & Entwicklung ÷ Umsatz', desc: 'Forschungsaufwand im Verhältnis zum Umsatz.' },
    { id: 'sbc_ratio', label: 'Aktienvergütung zum Umsatz', cat: 'profit', kind: 'ratio', deps: ['stock_based_compensation', 'revenue'], calc: function (g) { return margin(g('stock_based_compensation'), g('revenue')); }, formula: 'Aktienbasierte Vergütung ÷ Umsatz', desc: 'Wie viel des Umsatzes als Aktienvergütung ausgegeben wird.' },
    // Cashflow
    { id: 'operating_cash_flow', label: 'Operativer Cashflow', cat: 'cashflow', kind: 'money', base: 'operating_cash_flow', flow: true, q: true, desc: 'Geldzufluss aus dem laufenden Geschäft.' },
    { id: 'capital_expenditures', label: 'Investitionen (Capex)', cat: 'cashflow', kind: 'money', base: 'capital_expenditures', flow: true, q: true, desc: 'Ausgaben für Sachanlagen und Ausrüstung.' },
    { id: 'free_cash_flow', label: 'Free Cashflow', cat: 'cashflow', kind: 'money', base: 'free_cash_flow', flow: true, q: true, u: 'fcf', uBasis: 'TTM', desc: 'Operativer Cashflow abzüglich Investitionen – das frei verfügbare Geld.' },
    { id: 'fcf_per_share', label: 'Free Cashflow je Aktie', cat: 'cashflow', kind: 'perShare', perShareSeries: true, deps: ['free_cash_flow', 'diluted_weighted_average_shares'], calc: function (g) { var s = g('diluted_weighted_average_shares'); return s > 0 ? div(g('free_cash_flow'), s) : null; }, formula: 'Free Cashflow ÷ verwässerte Aktienanzahl (Durchschnitt)', desc: 'Freier Cashflow je Aktie.' },
    { id: 'cash_conversion', label: 'Cash Conversion', cat: 'cashflow', kind: 'multiple', u: 'cashConversion', uBasis: 'FY', deps: ['operating_cash_flow', 'net_income'], calc: function (g) { var n = g('net_income'); return n > 0 ? div(g('operating_cash_flow'), n) : null; }, formula: 'Operativer Cashflow ÷ Nettogewinn (nur bei Gewinn)', desc: 'Wie viel Geld aus jedem Dollar Gewinn tatsächlich zufließt.' },
    { id: 'capex_ratio', label: 'Investitionsquote', cat: 'cashflow', kind: 'ratio', q: true, deps: ['capital_expenditures', 'revenue'], calc: function (g) { return margin(g('capital_expenditures'), g('revenue')); }, formula: 'Investitionen ÷ Umsatz', desc: 'Investitionen im Verhältnis zum Umsatz.' },
    // Bilanz
    { id: 'total_assets', label: 'Bilanzsumme', cat: 'bilanz', kind: 'money', base: 'total_assets', desc: 'Gesamtes Vermögen des Unternehmens zum Stichtag.' },
    { id: 'stockholders_equity', label: 'Eigenkapital', cat: 'bilanz', kind: 'money', base: 'stockholders_equity', desc: 'Vermögen abzüglich aller Schulden – der Anteil der Aktionäre.' },
    { id: 'cash_and_equivalents', label: 'Liquide Mittel', cat: 'bilanz', kind: 'money', base: 'cash_and_equivalents', q: true, u: 'cash', uBasis: 'FY', desc: 'Kasse und kurzfristig verfügbare Mittel.' },
    { id: 'total_debt', label: 'Finanzschulden', cat: 'bilanz', kind: 'money', base: 'total_debt', q: true, u: 'totalDebt', uBasis: 'FY', desc: 'Kurz- und langfristige Finanzverbindlichkeiten.' },
    { id: 'long_term_debt', label: 'Langfristige Schulden', cat: 'bilanz', kind: 'money', base: 'long_term_debt', desc: 'Finanzschulden mit Laufzeit über einem Jahr.' },
    { id: 'net_debt', label: 'Nettoverschuldung', cat: 'bilanz', kind: 'money', base: 'net_debt', absChange: true, desc: 'Finanzschulden abzüglich Kasse; negativ = Nettokasse.' },
    { id: 'equity_ratio', label: 'Eigenkapitalquote', cat: 'bilanz', kind: 'ratio', deps: ['stockholders_equity', 'total_assets'], calc: function (g) { var a = g('total_assets'); return a > 0 ? div(g('stockholders_equity'), a) : null; }, formula: 'Eigenkapital ÷ Bilanzsumme', desc: 'Anteil des Vermögens, der mit eigenem Kapital finanziert ist.' },
    { id: 'debt_to_equity', label: 'Verschuldungsgrad', cat: 'bilanz', kind: 'multiple', u: 'debtToEquity', uBasis: 'FY', deps: ['total_debt', 'stockholders_equity'], calc: function (g) { var e = g('stockholders_equity'); return e > 0 ? div(g('total_debt'), e) : null; }, formula: 'Finanzschulden ÷ Eigenkapital (nur bei positivem Eigenkapital)', desc: 'Schulden im Verhältnis zum Eigenkapital.' },
    { id: 'net_debt_ebitda', label: 'Nettoverschuldung / EBITDA', cat: 'bilanz', kind: 'multiple', u: 'netDebtEbitda', uBasis: 'FY', deps: ['total_debt', 'cash_and_equivalents', 'ebitda'], calc: function (g) { var e = g('ebitda'), d = g('total_debt'), c = g('cash_and_equivalents'); return e > 0 && isNum(d) && isNum(c) ? (d - c) / e : null; }, formula: '(Finanzschulden − Kasse) ÷ EBITDA (nur bei positivem EBITDA)', desc: 'In wie vielen Jahren das EBITDA die Nettoschulden decken würde.' },
    { id: 'book_value_per_share', label: 'Buchwert je Aktie', cat: 'bilanz', kind: 'perShare', perShareSeries: true, deps: ['stockholders_equity', 'shares_outstanding'], calc: function (g) { var s = g('shares_outstanding'); return s > 0 ? div(g('stockholders_equity'), s) : null; }, formula: 'Eigenkapital ÷ ausstehende Aktien', desc: 'Eigenkapital je Aktie.' },
    // Aktie & Dividende
    { id: 'shares_outstanding', label: 'Ausstehende Aktien', cat: 'aktie', kind: 'shares', base: 'shares_outstanding', q: true, shareSeries: true, desc: 'Zahl der ausgegebenen Aktien zum Stichtag.' },
    { id: 'diluted_weighted_average_shares', label: 'Aktienanzahl (verwässert)', cat: 'aktie', kind: 'shares', base: 'diluted_weighted_average_shares', shareSeries: true, desc: 'Durchschnittliche Aktienanzahl einschließlich Optionen.' },
    { id: 'share_change', label: 'Veränderung der Aktienanzahl', cat: 'aktie', kind: 'growth', of: 'diluted_weighted_average_shares', perShareGrowth: true, desc: 'Positiv = Verwässerung (mehr Aktien), negativ = Rückkäufe überwiegen.' },
    { id: 'dividends_paid', label: 'Gezahlte Dividenden', cat: 'aktie', kind: 'money', base: 'dividends_paid', flow: true, desc: 'An die Aktionäre ausgezahlte Dividenden.' },
    { id: 'dividends_per_share', label: 'Dividende je Aktie (gezahlt)', cat: 'aktie', kind: 'perShare', perShareSeries: true, deps: ['dividends_paid', 'diluted_weighted_average_shares'], calc: function (g) { var s = g('diluted_weighted_average_shares'), d = g('dividends_paid'); return s > 0 && d > 0 ? d / s : null; }, formula: 'Gezahlte Dividenden ÷ verwässerte Aktienanzahl (Durchschnitt) – berechnet, nicht die beschlossene Dividende', desc: 'Ausgezahlte Dividenden je Aktie.' },
    { id: 'payout_ratio', label: 'Ausschüttungsquote', cat: 'aktie', kind: 'ratio', deps: ['dividends_paid', 'net_income'], calc: function (g) { var n = g('net_income'), d = g('dividends_paid'); return n > 0 && d > 0 ? d / n : null; }, formula: 'Gezahlte Dividenden ÷ Nettogewinn (nur bei Gewinn)', desc: 'Anteil des Gewinns, der als Dividende ausgezahlt wird.' },
    { id: 'dividend_yield', label: 'Dividendenrendite', cat: 'aktie', kind: 'ratio', snap: 'dividendYield', hist: true, desc: 'Dividende der letzten zwölf Monate im Verhältnis zum Kurs. Im Verlauf: gezahlte Dividenden des Geschäftsjahres ÷ Börsenwert zum GJ-Ende.' },
    // Bewertung: aktueller Wert zum Schlusskurs; Verlauf zum Geschaeftsjahresende, wo die Pruefung es traegt (historicalValuation)
    { id: 'market_cap', label: 'Marktkapitalisierung', cat: 'bewertung', kind: 'money', snap: 'mcap', u: 'mcap', hist: true, desc: 'Kurs × ausstehende Aktien.' },
    { id: 'enterprise_value', label: 'Unternehmenswert (EV)', cat: 'bewertung', kind: 'money', snap: 'ev', u: 'ev', hist: true, desc: 'Marktkapitalisierung plus Finanzschulden minus Kasse.' },
    { id: 'pe', label: 'KGV', cat: 'bewertung', kind: 'multiple', snap: 'pe', u: 'pe', hist: true, desc: 'Kurs-Gewinn-Verhältnis: Kurs ÷ Gewinn je Aktie der letzten zwölf Monate.' },
    { id: 'ps', label: 'KUV', cat: 'bewertung', kind: 'multiple', snap: 'ps', u: 'ps', hist: true, desc: 'Kurs-Umsatz-Verhältnis: Börsenwert ÷ Umsatz der letzten zwölf Monate.' },
    { id: 'pb', label: 'KBV', cat: 'bewertung', kind: 'multiple', snap: 'pb', u: 'pb', hist: true, desc: 'Kurs-Buchwert-Verhältnis: Börsenwert ÷ Eigenkapital.' },
    { id: 'ev_sales', label: 'EV / Umsatz', cat: 'bewertung', kind: 'multiple', snap: 'evSales', u: 'evSales', hist: true, desc: 'Unternehmenswert ÷ Umsatz der letzten zwölf Monate.' },
    { id: 'ev_ebitda', label: 'EV / EBITDA', cat: 'bewertung', kind: 'multiple', snap: 'evEbitda', u: 'evEbitda', hist: true, desc: 'Unternehmenswert ÷ EBITDA.' },
    { id: 'peg', label: 'PEG', cat: 'bewertung', kind: 'multiple', snap: 'peg', u: 'peg', desc: 'KGV ÷ jährliches Wachstum des Gewinns je Aktie über 3 Jahre (historisch, keine Schätzung).' },
    { id: 'fcf_yield', label: 'Free-Cashflow-Rendite', cat: 'bewertung', kind: 'ratio', snap: 'fcfYield', u: 'fcfYield', hist: true, desc: 'Free Cashflow der letzten zwölf Monate ÷ Börsenwert.' }
  ];
  /* Bewusst nicht im Katalog: Gewinnrendite (= 1 ÷ KGV) und Kurs / Free Cashflow (= 1 ÷ Free-Cashflow-Rendite) –
   * Kehrwerte mit derselben Aussage. */
  var BY_ID = {}; M.forEach(function (d) { BY_ID[d.id] = d; });
  var FORMULA = {}; M.forEach(function (d) { if (d.formula) FORMULA[d.id] = d.formula; });

  /* Ein Anteil am Umsatz braucht positiven Umsatz; ueber 150 % ist er nicht plausibel (Banken, abweichende Umsatzzeile). */
  function margin(x, rev) { if (!(rev > 0) || !isNum(x)) return null; var m = x / rev; return Math.abs(m) <= 1.5 ? m : null; }
  function roic(g) {
    var op = g('operating_income'), eq = g('stockholders_equity'), debt = g('total_debt'), cash = g('cash_and_equivalents');
    if (!isNum(op) || !isNum(eq) || !isNum(debt) || !isNum(cash)) return null;
    var inv = eq + debt - cash; if (!(inv > 0)) return null;
    var pre = g('pretax_income'), tax = g('income_tax_expense');
    var rate = pre > 0 && isNum(tax) ? Math.min(Math.max(tax / pre, 0), 0.5) : 0.21;
    return op * (1 - rate) / inv;
  }

  /* ------------------------------------------------------------------ Buch je Unternehmen
   * Einheitliche Form aus SEC-Historie oder Discover-Block:
   * { source, currency, base: {metric: {annual:[{fy,end,v,filed,accn,derived}], quarterly:[{fy,q,end,v,...}], ttm:{v,end,through,kind}}} } */
  function unitCurrency(u) { var m = /^([A-Z]{3})/.exec(u || ''); return m ? m[1] : null; }
  function fromHistory(h, stock) {
    if (!h || h.schema !== 'vu-fundamental-history-1.0.0' || !h.annual) return null;
    var f = stock && stock.fundamentals;
    if (f && f.cik && h.cik !== f.cik) return null; // andere Identitaet als die Discover-Datei: nicht verwenden
    var filing = function (i) { var x = h.filings[i]; return x ? { accn: x[0], filed: x[1] } : {}; };
    var base = {};
    Object.keys(h.units || {}).forEach(function (m) {
      var a = (h.annual[m] || []).map(function (r) { var fl = filing(r[3]); return { fy: r[0], end: r[1], v: r[2], filed: fl.filed, accn: fl.accn, derived: r[4] === 1 }; });
      var q = ((h.quarterly || {})[m] || []).map(function (r) { var fl = filing(r[4]); return { fy: r[0], q: r[1], end: r[2], v: r[3], filed: fl.filed, accn: fl.accn, derived: r[5] === 1 }; });
      var t = (h.ttm || {})[m];
      base[m] = { annual: a, quarterly: q, ttm: t ? { v: t[0], end: t[1], through: t[2], kind: t[3] } : null, unit: h.units[m] };
    });
    return finishBook({ source: 'history', asOf: h.asOf, cik: h.cik, calendar: h.calendar || null, base: base, unitOf: h.units });
  }
  var JOURNEY = { revenue: 'revenue', net_income: 'net_income', free_cash_flow: 'free_cash_flow', operating_cash_flow: 'operating_cash_flow', eps_diluted: 'eps_diluted', cash_and_equivalents: 'cash', long_term_debt: 'debt', diluted_weighted_average_shares: 'shares' };
  function fromDiscover(stock) {
    var f = stock && stock.fundamentals;
    if (!f || f.available === false) return null;
    var tracks = (f.journey && f.journey.tracks) || {};
    if (Array.isArray(tracks)) { var o = {}; tracks.forEach(function (p) { if (Array.isArray(p)) o[p[0]] = p[1]; }); tracks = o; }
    var latest = f.latest || {}, annual = latest.annual || {}, ttm = latest.ttm || {}, units = f.units || {}, base = {};
    Object.keys(units).forEach(function (m) {
      var tr = tracks[JOURNEY[m]], a = [];
      if (Array.isArray(tr)) a = tr.filter(function (p) { return p && isNum(p.fy) && isNum(p.v); }).map(function (p) { return { fy: p.fy, end: p.end || null, v: p.v, filed: p.filed || null, accn: p.accn || null }; });
      else if (annual[m] && isNum(annual[m].v) && isNum(latest.fiscalYear || f.latestFiscalYear)) a = [{ fy: latest.fiscalYear || f.latestFiscalYear, end: annual[m].end || null, v: annual[m].v, filed: annual[m].filed || null, accn: annual[m].accn || null }];
      var t = ttm[m];
      base[m] = { annual: a, quarterly: [], ttm: t && isNum(t.v) ? { v: t.v, end: t.end || null, through: t.through || null, kind: t.kind || 'TTM' } : null, unit: units[m] };
    });
    return finishBook({ source: 'discover', asOf: f.asOf || null, cik: f.cik || null, calendar: null, base: base, unitOf: units });
  }
  function finishBook(b) {
    var years = {}, quarters = {};
    Object.keys(b.base).forEach(function (m) {
      b.base[m].annual.sort(function (x, y) { return x.fy - y.fy; }).forEach(function (r) { years[r.fy] = true; });
      b.base[m].quarterly.sort(function (x, y) { return qi(x) - qi(y); });
    });
    b.mismatch = quarterMismatch(b);
    Object.keys(b.base).forEach(function (m) { b.base[m].quarterly.forEach(function (r) { quarters[qi(r)] = { fy: r.fy, q: r.q, end: r.end }; }); });
    b.years = Object.keys(years).map(Number).sort(function (x, y) { return x - y; });
    b.quarters = Object.keys(quarters).map(Number).sort(function (x, y) { return x - y; }).map(function (k) { return quarters[k]; });
    b.currency = unitCurrency(b.unitOf.revenue) || unitCurrency(b.unitOf.net_income) || unitCurrency(b.unitOf.total_assets) || 'USD';
    b.splits = splitJumps(b);
    return b;
  }
  function qi(r) { return r.fy * 4 + (r.q - 1); }
  /* Jahr gegen Quartale: Ergeben die vier eigenstaendigen Quartale eines Geschaeftsjahres den Jahreswert nicht (±1 %),
   * passen Quartals- und Jahresmeldung nicht zusammen (anderes Konzept, nachtraeglich angepasster Jahreswert, Fehlmeldung).
   * Diese Quartale werden nicht gezeigt; der Jahreswert bleibt. Gewinn je Aktie summiert sich nicht (Aktienzahl je Quartal). */
  var QUARTER_SUM = ['revenue', 'gross_profit', 'operating_income', 'net_income', 'operating_cash_flow', 'capital_expenditures', 'depreciation_and_amortization', 'pretax_income', 'income_tax_expense', 'free_cash_flow', 'ebitda'];
  var QUARTER_TOL = 0.01;
  function quarterMismatch(b) {
    var out = {};
    QUARTER_SUM.forEach(function (m) {
      var s = b.base[m]; if (!s || !s.quarterly.length) return;
      var bad = {};
      s.annual.forEach(function (a) {
        var q = s.quarterly.filter(function (r) { return r.fy === a.fy; });
        if (q.length !== 4 || !isNum(a.v) || a.v === 0) return;
        var sum = q.reduce(function (x, r) { return x + r.v; }, 0);
        if (Math.abs(sum - a.v) / Math.abs(a.v) > QUARTER_TOL) bad[a.fy] = true;
      });
      if (Object.keys(bad).length) { out[m] = Object.keys(bad).map(Number); s.quarterly = s.quarterly.filter(function (r) { return !bad[r.fy]; }); }
    });
    return out;
  }

  /* Sprung der Aktienanzahl zwischen zwei Geschaeftsjahren (Faktor >= 1,8 oder <= 0,55): Split oder Kapitalmassnahme ohne
   * rueckwirkende Bereinigung. Werte je Aktie und Aktienanzahl sind ueber diesen Sprung nicht vergleichbar (wie Discover). */
  function splitJumps(b) {
    var s = b.base.diluted_weighted_average_shares || b.base.shares_outstanding;
    if (!s) return [];
    var out = [], rows = s.annual;
    for (var i = 1; i < rows.length; i++) {
      var p = rows[i - 1], r = rows[i];
      if (r.fy !== p.fy + 1 || !(p.v > 0) || !(r.v > 0)) continue;
      var f = r.v / p.v;
      if (f >= 1.8 || f <= 0.55) out.push({ from: p.fy, to: r.fy, factor: f });
    }
    return out;
  }
  function splitBetween(b, fyA, fyB) { return b.splits.some(function (s) { return s.from >= fyA && s.to <= fyB; }); }

  /* ------------------------------------------------------------------ Reihen */
  function baseRow(b, metric, period, key) {
    var s = b.base[metric]; if (!s) return null;
    var list = period === 'quarterly' ? s.quarterly : s.annual;
    for (var i = 0; i < list.length; i++) if ((period === 'quarterly' ? qi(list[i]) : list[i].fy) === key) return list[i];
    return null;
  }
  function getter(b, period, key) { return function (m) { var r = baseRow(b, m, period, key); return r ? r.v : null; }; }
  function axis(b, period) { return period === 'quarterly' ? b.quarters.map(qi) : b.years.slice(); }
  function keyInfo(b, period, key) {
    if (period === 'quarterly') { var fy = Math.floor(key / 4), q = key % 4 + 1, x = b.quarters.filter(function (r) { return qi(r) === key; })[0]; return { key: key, fy: fy, q: q, label: 'Q' + q + ' ' + fy, short: 'Q' + q + " '" + String(fy).slice(2), end: x ? x.end : null }; }
    var e = null; Object.keys(b.base).some(function (m) { var r = baseRow(b, m, 'annual', key); if (r && r.end) { e = r.end; return true; } return false; });
    return { key: key, fy: key, label: 'GJ ' + key, short: String(key), end: e };
  }
  /** Reihe einer Kennzahl ueber die ganze Achse; fehlende Werte bleiben Luecken {v:null}. */
  function seriesOf(b, def, period) {
    period = period === 'quarterly' ? 'quarterly' : 'annual';
    if (b && def.snap && def.hist && period === 'annual' && b.valuation && b.valuation.series[def.id]) return b.valuation.series[def.id];
    if (!b || def.snap) return [];
    if (period === 'quarterly' && !def.q) return [];
    var keys = axis(b, period), prevKey = function (k) { return period === 'quarterly' ? k - 4 : k - 1; };
    var rows = keys.map(function (k) {
      var info = keyInfo(b, period, k), r = null;
      if (def.base) {
        var x = baseRow(b, def.base, period, k);
        r = x ? { v: x.v, filed: x.filed, accn: x.accn, derived: x.derived, end: x.end || info.end } : period === 'quarterly' && (b.mismatch[def.base] || []).indexOf(Math.floor(k / 4)) >= 0 ? { v: null, reason: 'QUARTER_MISMATCH' } : null;
      }
      else if (def.of) {
        var now = baseRow(b, def.of, period, k), pr = baseRow(b, def.of, period, prevKey(k));
        if (now && pr && pr.v > 0 && isNum(now.v)) {
          var py = period === 'quarterly' ? Math.floor(prevKey(k) / 4) : prevKey(k), cy = period === 'quarterly' ? Math.floor(k / 4) : k;
          if (def.perShareGrowth && splitBetween(b, py, cy)) r = { v: null, reason: 'SPLIT' };
          else r = { v: now.v / pr.v - 1, end: now.end, filed: now.filed, accn: now.accn };
        } else if (now && pr) r = { v: null, reason: 'NOT_POSITIVE' };
      } else if (def.calc) {
        var g = getter(b, period, k), v = def.calc(g);
        if (isNum(v)) { var src = baseRow(b, def.deps[0], period, k); r = { v: v, end: src ? src.end : info.end, filed: src ? src.filed : null, accn: src ? src.accn : null }; }
      }
      return Object.assign(info, r && isNum(r.v) ? r : { v: null, gap: true, reason: r && r.reason || null });
    });
    // Nur die Spanne mit Werten; Luecken dazwischen bleiben sichtbar.
    var first = -1, last = -1;
    rows.forEach(function (r, i) { if (isNum(r.v) || r.reason) { if (first < 0) first = i; last = i; } });
    if (!rows.some(function (r) { return isNum(r.v); })) return [];
    return first < 0 ? [] : rows.slice(first, last + 1);
  }
  function have(rows) { return rows.filter(function (r) { return isNum(r.v); }); }

  /* Letzte zwoelf Monate aus eigenstaendigen Quartalen: Summe von vier direkt aufeinanderfolgenden Quartalen. */
  function rolling(b, metric) {
    var s = b.base[metric]; if (!s || !s.quarterly.length) return [];
    var q = s.quarterly, out = [];
    for (var i = 3; i < q.length; i++) {
      var w = q.slice(i - 3, i + 1), ok = true;
      for (var k = 1; k < 4; k++) if (qi(w[k]) !== qi(w[k - 1]) + 1) ok = false;
      if (ok) out.push({ key: qi(q[i]), end: q[i].end, v: w.reduce(function (a, r) { return a + r.v; }, 0) });
    }
    return out;
  }
  function close(a, b) { return isNum(a) && isNum(b) && Math.abs(a - b) <= Math.max(1, Math.abs(b)) * 0.005; }

  /** Aktueller Wert einer Kennzahl mit Basis und Veraenderung.
   * Zeitraumgroessen: letzte zwoelf Monate (LTM), Veraenderung zu den zwoelf Monaten davor, wenn die Quartale das tragen;
   * sonst letztes Geschaeftsjahr ggue. Vorjahr. Stichtagsgroessen: letztes Geschaeftsjahr (Bilanz) bzw. letzter Stichtag.
   * Bewertung: aktueller Kurs (snap). */
  function current(b, def, ctx) {
    ctx = ctx || {};
    if (def.snap) { var sv = snapValue(def, ctx); return sv; }
    var rows = seriesOf(b, def, 'annual'), h = have(rows), last = h[h.length - 1] || null, prev = null;
    if (last) { var pr = rows.filter(function (r) { return r.key === last.key - 1; })[0]; prev = pr && isNum(pr.v) ? pr : null; }
    var out = { v: last ? last.v : null, basis: 'FY', label: last ? 'GJ ' + last.fy : null, end: last ? last.end : null, prev: prev ? prev.v : null, prevLabel: prev ? 'GJ ' + prev.fy : null, fy: last ? last.fy : null };
    if (def.perShareSeries && prev && last && splitBetween(b, prev.fy, last.fy)) { out.prev = null; out.prevLabel = null; out.split = true; }
    // LTM fuer Zeitraumgroessen und daraus abgeleitete Margen
    var ltm = ltmOf(b, def);
    if (ltm && isNum(ltm.v)) { out.v = ltm.v; out.basis = 'TTM'; out.label = 'LTM'; out.end = ltm.end; out.prev = isNum(ltm.prev) ? ltm.prev : null; out.prevLabel = isNum(ltm.prev) ? 'Vorjahreszeitraum' : null; out.through = ltm.through; }
    out.change = changeOf(def, out.prev, out.v);
    return out;
  }
  function ltmPair(b, metric) {
    var s = b.base[metric]; if (!s) return null;
    var t = s.ttm, roll = rolling(b, metric), lastR = roll[roll.length - 1], prevR = lastR ? roll.filter(function (r) { return r.key === lastR.key - 4; })[0] : null;
    if (t && t.kind === 'TTM' && isNum(t.v)) return { v: t.v, end: t.end, through: t.through, prev: lastR && prevR && close(lastR.v, t.v) ? prevR.v : null };
    return null;
  }
  /* Werte je Aktie ueber acht Quartale nur vergleichen, wenn die Aktienanzahl darin nicht springt (Split). */
  function quarterSharesStable(b) {
    var s = b.base.shares_outstanding, v = s ? s.quarterly.map(function (r) { return r.v; }).filter(function (x) { return x > 0; }) : [];
    if (v.length < 2) return false;
    return Math.max.apply(null, v) / Math.min.apply(null, v) < 1.8;
  }
  function ltmOf(b, def) {
    if (def.base && def.flow) { var lp = ltmPair(b, def.base); if (lp && def.perShareSeries && !quarterSharesStable(b)) lp.prev = null; return lp; }
    if (def.of) { // Wachstum: LTM ggue. Vorjahreszeitraum
      var p = ltmPair(b, def.of);
      if (p && isNum(p.prev) && p.prev > 0 && !def.perShareGrowth) return { v: p.v / p.prev - 1, end: p.end, through: p.through, prev: null };
      return null;
    }
    if (def.calc && def.q && def.kind === 'ratio' && def.deps.every(function (m) { var s = b.base[m]; return s && s.ttm && s.ttm.kind === 'TTM'; })) {
      var pairs = {}; def.deps.forEach(function (m) { pairs[m] = ltmPair(b, m); });
      var v = def.calc(function (m) { return pairs[m] ? pairs[m].v : null; });
      var pv = def.deps.every(function (m) { return pairs[m] && isNum(pairs[m].prev); }) ? def.calc(function (m) { return pairs[m].prev; }) : null;
      return isNum(v) ? { v: v, end: pairs[def.deps[0]].end, through: pairs[def.deps[0]].through, prev: pv } : null;
    }
    return null;
  }
  function changeOf(def, prev, v) {
    if (!isNum(prev) || !isNum(v)) return null;
    var dir = v > prev ? 'up' : v < prev ? 'down' : 'flat';
    if (def.kind === 'ratio' || def.kind === 'growth') return { dir: dir, pp: v - prev };
    if (def.kind === 'multiple') return { dir: dir, abs: v - prev };
    if (def.absChange) return { dir: dir, absMoney: v - prev };
    var flip = prev !== 0 && v !== 0 && (prev > 0) !== (v > 0);
    return { dir: dir, pct: prev !== 0 && !flip ? (v - prev) / Math.abs(prev) : null, signFlip: flip };
  }
  function snapValue(def, ctx) {
    var s = ctx.snap || {}, v = s[def.snap];
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.priceDate || '');
    return { v: isNum(v) ? v : null, basis: 'MARKET', label: d ? 'Schlusskurs vom ' + d[3] + '.' + d[2] + '.' + d[1] : 'aktueller Kurs', change: null, reason: isNum(v) ? null : (s.reasons && s.reasons[def.snap]) || null };
  }
  /** Bewertungsgrundlage: Discover-Bewertung (KGV, KUV, FCF-Rendite, Boersenwert) und Screener-Universum (KBV, EV ...). */
  function snapshot(stock, urow) {
    var f = stock && stock.fundamentals, v = f && f.valuation, gz = stock && stock.geschaeftszahlen, out = { reasons: {} };
    var pick = function (o) { return o && isNum(o.value) ? o.value : null; };
    if (v && v.available) { out.pe = pick(v.pe); out.ps = pick(v.ps); out.fcfYield = pick(v.fcfYield); out.mcap = pick(v.marketCap); out.price = isNum(v.price) ? v.price : null; out.peBasis = v.pe && v.pe.basis || null; out.peMedian = v.context && v.context.peMedian; out.psMedian = v.context && v.context.psMedian; }
    if (v && !isNum(out.pe)) out.reasons.pe = v.peReason || (f.latest && f.latest.ttm && f.latest.ttm.net_income && f.latest.ttm.net_income.v < 0 ? 'LOSS' : 'SOURCE_MISSING');
    if (urow) ['pb', 'ev', 'evSales', 'evEbitda', 'pFcf', 'peg'].forEach(function (k) { out[k] = isNum(urow[k]) ? urow[k] : null; });
    if (urow && !isNum(out.mcap) && isNum(urow.mcap)) out.mcap = urow.mcap;
    out.earningsYield = isNum(out.pe) && out.pe > 0 ? 1 / out.pe : null;
    out.dividendYield = gz && gz.dividendenRenditeStatus === 'CALCULATED' && isNum(gz.dividendenRendite) ? gz.dividendenRendite : null;
    if (gz && !isNum(out.dividendYield)) out.reasons.dividendYield = 'NO_DIVIDEND';
    if (!urow) ['pb', 'ev', 'evSales', 'evEbitda', 'pFcf', 'peg'].forEach(function (k) { out.reasons[k] = 'UNIVERSE_MISSING'; });
    out.priceDate = stock && typeof stock.asOf === 'string' ? stock.asOf.slice(0, 10) : null;
    return out;
  }


  /* ------------------------------------------------------------------ Historisches KGV (zum Geschaeftsjahresende)
   * Kurs: Wochenreihe discover-series-long, splitbereinigt auf den juengsten Stand (ADR-002: Bereinigung aus dem
   * splitFactor des Anbieters, return-series.js#splitFactors). Dieselbe Datei traegt den Beleg aller Split-Tage
   * (corporate-action-evidence.js, Quelle PROVIDER_SPLIT_FACTOR).
   * Gewinn je Aktie: wie gemeldet. Eine Meldung bildet alle Splits ab, die vor ihrem Meldedatum wirksam waren (Pflicht zur
   * rueckwirkenden Darstellung); herausgerechnet werden daher nur Splits NACH dem Meldedatum des Werts.
   * Veroeffentlicht wird ein Jahr nur, wenn
   *   1. Gegenprobe: Nettogewinn ÷ ebenso bereinigte verwaesserte Aktienzahl weicht hoechstens 10 % ab,
   *   2. die bereinigte Aktienzahl zu den Nachbarjahren nicht in Split-Groesse springt (Faktor ≥ 1,8 oder ≤ 0,55) –
   *      sonst waeren Gewinn je Aktie und Aktienzahl gemeinsam unbereinigt und die Gegenprobe wertlos,
   *   3. ein Wochenschluss hoechstens 10 Tage vor dem Geschaeftsjahresende vorliegt,
   *   4. der bereinigte Gewinn je Aktie positiv ist.
   * Sonst bleibt das Jahr leer, mit Grund. */
  var PE_TOLERANCE = 0.10, PE_PRICE_DAYS = 10, SHARE_TOLERANCE = 0.10;
  function splitsAfter(splits, date) { return splits.reduce(function (a, s) { return s[0] > date ? a * s[1] : a; }, 1); }
  function daysBetween(a, b) { return (Date.parse(b) - Date.parse(a)) / 864e5; }
  function splitEvidence(long) {
    var ca = long && long.corporateActions;
    if (!long || long.schemaVersion !== 'discover-series-long-1.0.0' || long.priceSeriesType !== 'SPLIT_ADJUSTED' || long.dataMode !== 'real' || !Array.isArray(long.points)
      || !ca || ca.source !== 'PROVIDER_SPLIT_FACTOR' || !Array.isArray(ca.splits)) return null;
    var splits = ca.splits.filter(function (x) { return Array.isArray(x) && /^\d{4}-\d{2}-\d{2}$/.test(x[0]) && x[1] > 0; });
    return splits.length === ca.splits.length ? splits : null;
  }
  function annualRow(b, m, fy) { var s = b.base[m]; if (!s) return null; for (var i = 0; i < s.annual.length; i++) if (s.annual[i].fy === fy) return s.annual[i]; return null; }
  function closeAt(long, end) {
    var pt = null; for (var i = long.points.length - 1; i >= 0; i--) { if (long.points[i][0] <= end) { pt = long.points[i]; break; } }
    return pt && daysBetween(pt[0], end) <= PE_PRICE_DAYS && pt[1] > 0 ? pt : null;
  }
  function historicalPe(b, long) {
    var out = { state: 'UNAVAILABLE', rows: [], reason: null, splits: [] };
    if (!b || !b.base.eps_diluted || !b.base.eps_diluted.annual.length) { out.reason = 'NO_EPS'; return out; }
    var splits = splitEvidence(long);
    if (!splits) { out.reason = 'NO_SPLIT_EVIDENCE'; return out; }
    out.splits = splits;
    var adjShares = function (fy) { var r = annualRow(b, 'diluted_weighted_average_shares', fy); return r && r.v > 0 && r.filed ? r.v * splitsAfter(splits, r.filed) : null; };
    var jump = function (a, c) { if (!isNum(a) || !isNum(c)) return false; var f = c / a; return f >= 1.8 || f <= 0.55; };
    out.rows = b.base.eps_diluted.annual.map(function (e) {
      var r = { fy: e.fy, key: e.fy, label: 'GJ ' + e.fy, short: String(e.fy), end: e.end, epsReported: e.v, filed: e.filed, accn: e.accn, v: null, reason: null };
      if (!e.filed || !e.end) { r.reason = 'NO_CHECK'; return r; }
      r.factor = splitsAfter(splits, e.filed); r.eps = e.v / r.factor;
      var ni = annualRow(b, 'net_income', e.fy), sh = adjShares(e.fy);
      if (!ni || !isNum(sh)) { r.reason = 'NO_CHECK'; return r; }
      r.check = ni.v / sh;
      if (!(Math.abs(r.check) > 0) || Math.abs(r.eps / r.check - 1) > PE_TOLERANCE) { r.reason = 'CHECK_FAILED'; return r; }
      if (jump(adjShares(e.fy - 1), sh) || jump(sh, adjShares(e.fy + 1))) { r.reason = 'SHARE_BASIS_JUMP'; return r; }
      var pt = closeAt(long, e.end);
      if (!pt) { r.reason = 'NO_PRICE'; return r; }
      r.price = pt[1]; r.priceDate = pt[0];
      if (!(r.eps > 0)) { r.reason = 'LOSS_FY'; return r; }
      r.v = r.price / r.eps; return r;
    });
    out.state = out.rows.some(function (r) { return isNum(r.v); }) ? 'AVAILABLE' : 'UNAVAILABLE';
    if (out.state !== 'AVAILABLE') out.reason = 'NO_VERIFIED_YEAR';
    return out;
  }

  /* ------------------------------------------------------------------ Historische Bewertung zum Geschaeftsjahresende
   * Alles zum selben Stichtag: Wochenschluss hoechstens 10 Tage vor dem GJ-Ende (wie beim KGV), Aktienzahl, Eigenkapital,
   * Finanzschulden und Kasse aus der Bilanz dieses Geschaeftsjahres, Umsatz, EBITDA und Free Cashflow des Geschaeftsjahres.
   * Boersenwert = Kurs × ausstehende Aktien. Die Aktienzahl ist wie gemeldet und wird – wie der Gewinn je Aktie – nur um
   * Splits NACH ihrem Meldedatum bereinigt (Split-Beleg des Kursanbieters). Gegenprobe je Jahr: bereinigte ausstehende
   * Aktien und bereinigte verwaesserte Durchschnittszahl weichen hoechstens 10 % voneinander ab (faengt Teilmengen wie
   * eine einzelne Aktiengattung ab); zu den Nachbarjahren kein Sprung in Split-Groesse.
   * Unternehmenswert = Boersenwert + Finanzschulden − Zahlungsmittel (Definition wie im Screener; Wertpapiere zaehlen
   * nicht zur Kasse). Fehlt eine Eingabe, bleibt der Wert leer – nie aus heutigem Kurs und alten Zahlen. Nur USD-Berichte. */
  var HIST_VAL = {
    pe: { from: 'pe' },
    market_cap: { calc: function (x) { return x.mcap; } },
    enterprise_value: { calc: function (x) { return x.ev; }, needs: 'ev' },
    ps: { calc: function (x) { return x.revenue > 0 ? x.mcap / x.revenue : null; }, miss: function (x) { return isNum(x.revenue) ? 'NOT_POSITIVE_BASE' : 'NO_BASE'; } },
    pb: { calc: function (x) { return x.equity > 0 ? x.mcap / x.equity : null; }, miss: function (x) { return isNum(x.equity) ? 'NEGATIVE_EQUITY' : 'NO_BASE'; } },
    ev_sales: { needs: 'ev', calc: function (x) { return x.ev > 0 && x.revenue > 0 ? x.ev / x.revenue : null; }, miss: function (x) { return !(x.ev > 0) ? 'NEGATIVE_EV' : isNum(x.revenue) ? 'NOT_POSITIVE_BASE' : 'NO_BASE'; } },
    ev_ebitda: { needs: 'ev', calc: function (x) { return x.ev > 0 && x.ebitda > 0 ? x.ev / x.ebitda : null; }, miss: function (x) { return !(x.ev > 0) ? 'NEGATIVE_EV' : isNum(x.ebitda) ? 'NOT_POSITIVE_BASE' : 'NO_BASE'; } },
    fcf_yield: { calc: function (x) { return isNum(x.fcf) ? x.fcf / x.mcap : null; }, miss: function () { return 'NO_BASE'; } },
    dividend_yield: { calc: function (x) { return x.dividends > 0 ? x.dividends / x.mcap : null; }, miss: function (x) { return isNum(x.dividends) ? 'NO_DIVIDEND' : 'NO_DIVIDEND_REPORTED'; } }
  };
  function historicalValuation(b, long) {
    var out = { state: 'UNAVAILABLE', reason: null, years: [], series: {}, full: {}, missing: {}, splits: [] };
    if (!b) { out.reason = 'NO_DATA'; return out; }
    if (b.currency !== 'USD') { out.reason = 'NON_USD_REPORTING'; return out; }
    var splits = splitEvidence(long);
    if (!splits) { out.reason = 'NO_SPLIT_EVIDENCE'; return out; }
    out.splits = splits;
    var adj = function (m, fy) { var r = annualRow(b, m, fy); return r && r.v > 0 && r.filed ? r.v * splitsAfter(splits, r.filed) : null; };
    var jump = function (a, c) { if (!isNum(a) || !isNum(c)) return false; var f = c / a; return f >= 1.8 || f <= 0.55; };
    var pe = historicalPe(b, long), peBy = {}; pe.rows.forEach(function (r) { peBy[r.fy] = r; });
    out.years = b.years.map(function (fy) {
      var info = keyInfo(b, 'annual', fy), so = annualRow(b, 'shares_outstanding', fy);
      var x = { fy: fy, end: info.end, reason: null, shares: null, price: null, mcap: null, ev: null };
      var val = function (m) { var r = annualRow(b, m, fy); return r ? r.v : null; };
      x.revenue = val('revenue'); x.equity = val('stockholders_equity'); x.ebitda = val('ebitda'); x.fcf = val('free_cash_flow'); x.dividends = val('dividends_paid');
      x.debt = val('total_debt'); x.cash = val('cash_and_equivalents');
      x.src = annualRow(b, 'revenue', fy) || so || null;
      if (!info.end) { x.reason = 'NO_CHECK'; return x; }
      var pt = closeAt(long, info.end);
      if (pt) { x.price = pt[1]; x.priceDate = pt[0]; }
      var s = adj('shares_outstanding', fy), d = adj('diluted_weighted_average_shares', fy);
      if (!isNum(s)) x.reason = 'NO_SHARES';
      else if (!isNum(d)) x.reason = 'NO_CHECK';
      else if (Math.abs(s / d - 1) > SHARE_TOLERANCE) x.reason = 'SHARE_CHECK_FAILED';
      else if (jump(adj('shares_outstanding', fy - 1), s) || jump(s, adj('shares_outstanding', fy + 1))) x.reason = 'SHARE_BASIS_JUMP';
      else if (!pt) x.reason = 'NO_PRICE';
      if (isNum(s)) { x.shares = s; x.sharesReported = so.v; x.sharesFactor = splitsAfter(splits, so.filed); }
      if (x.reason) return x;
      x.mcap = x.price * s;
      x.ev = isNum(x.debt) && isNum(x.cash) ? x.mcap + x.debt - x.cash : null;
      return x;
    });
    Object.keys(HIST_VAL).forEach(function (id) {
      var h = HIST_VAL[id];
      out.series[id] = out.years.map(function (x) {
        var r = { key: x.fy, fy: x.fy, label: 'GJ ' + x.fy, short: String(x.fy), end: x.end, v: null, reason: null, price: x.price, priceDate: x.priceDate, mcap: x.mcap, ev: x.ev,
          filed: x.src ? x.src.filed : null, accn: x.src ? x.src.accn : null };
        if (h.from === 'pe') { var p = peBy[x.fy]; if (!p) { r.reason = 'NO_EPS'; return r; } r.v = p.v; r.reason = p.reason; r.price = p.price; r.priceDate = p.priceDate; r.eps = p.eps; r.epsReported = p.epsReported; r.factor = p.factor; r.filed = p.filed; r.accn = p.accn; return r; }
        if (x.reason) { r.reason = x.reason; return r; }
        if (h.needs === 'ev' && !isNum(x.ev)) { r.reason = 'NO_DEBT_DATA'; return r; }
        var v = h.calc(x);
        if (isNum(v)) r.v = v; else r.reason = h.miss ? h.miss(x) : 'NO_BASE';
        return r;
      });
      // Nur die Spanne mit Werten (wie seriesOf); Luecken dazwischen bleiben mit Grund sichtbar.
      var rows = out.series[id], first = -1, last = -1, why = {};
      out.full[id] = rows;
      rows.forEach(function (r, i) { if (isNum(r.v)) { if (first < 0) first = i; last = i; } else if (r.reason) why[r.reason] = (why[r.reason] || 0) + 1; });
      // Haeufigster Grund, falls kein Jahr besteht (fuer die Anzeige "kein gepruefter Verlauf: <Grund>")
      if (first < 0) out.missing[id] = Object.keys(why).sort(function (a, b) { return why[b] - why[a]; })[0] || 'NO_DATA';
      out.series[id] = first < 0 ? [] : rows.slice(first, last + 1);
    });
    out.state = Object.keys(out.series).some(function (k) { return out.series[k].some(function (r) { return isNum(r.v); }); }) ? 'AVAILABLE' : 'UNAVAILABLE';
    if (out.state !== 'AVAILABLE') out.reason = 'NO_VERIFIED_YEAR';
    return out;
  }
  /* Haengt die gepruefte Bewertung ans Buch: seriesOf liefert sie dann fuer die Bewertungskennzahlen (Jahreswerte). */
  function attachValuation(b, long) { if (b) b.valuation = historicalValuation(b, long); return b ? b.valuation : null; }

  /** Veraenderung eines Werts zum Vorzeitraum (lag 1 = Vorjahr bzw. Vorquartal, 4 = Vorjahresquartal); ueber einen Split
   * ohne Rueckrechnung keine Veraenderung bei Werten je Aktie und Aktienzahlen. */
  function stepChange(b, def, rows, key, lag, period) {
    var now = null, prev = null;
    rows.forEach(function (r) { if (r.key === key) now = r; if (r.key === key - lag) prev = r; });
    if (!now || !prev || !isNum(now.v) || !isNum(prev.v)) return null;
    if ((def.perShareSeries || def.shareSeries) && !def.hist && b) {
      var fy = function (k) { return period === 'quarterly' ? Math.floor(k / 4) : k; };
      if (fy(prev.key) !== fy(now.key) && splitBetween(b, fy(prev.key), fy(now.key))) return { reason: 'SPLIT' };
    }
    return changeOf(def, prev.v, now.v);
  }
  /* Branchenmedian je Geschaeftsjahr (Release, scripts/fundamental/build-history.mjs#industryMedians). */
  var INDUSTRY_METRICS = ['revenue_growth', 'net_income_growth', 'gross_margin', 'operating_margin', 'ebitda_margin', 'net_margin', 'fcf_margin',
    'roe', 'roa', 'roic', 'tax_rate', 'rd_ratio', 'capex_ratio', 'equity_ratio', 'debt_to_equity', 'net_debt_ebitda', 'payout_ratio',
    'pe', 'ps', 'pb', 'ev_sales', 'ev_ebitda', 'fcf_yield', 'dividend_yield'];
  var INDUSTRY_SCHEMA = 'vu-fundamental-industry-1.0.0';
  function industryPath(key) { return /^(sic-\d{2}|sec-[a-z]{2,16})$/.test(key || '') ? HISTORY_BASE + 'industry/' + key + '.json' : null; }
  /** Medianreihe einer Kennzahl aus der Branchendatei: {fy: {v, n}} oder null. */
  function industrySeries(doc, id) {
    if (!doc || doc.schema !== INDUSTRY_SCHEMA || !doc.metrics || !Array.isArray(doc.metrics[id])) return null;
    var out = {}; doc.metrics[id].forEach(function (r) { if (Array.isArray(r) && isNum(r[0]) && isNum(r[1]) && isNum(r[2])) out[r[0]] = { v: r[1], n: r[2] }; });
    return Object.keys(out).length ? out : null;
  }

  /** Durchschnittliche jaehrliche Rate ueber genau n Geschaeftsjahre (positive Endpunkte, kein Split dazwischen bei Werten je Aktie). */
  function cagr(b, def, n) {
    var rows = have(seriesOf(b, def, 'annual')), end = rows[rows.length - 1];
    if (!end) return { years: n, rate: null, reason: 'NO_DATA' };
    var start = rows.filter(function (r) { return r.fy === end.fy - n; })[0];
    if (!start) return { years: n, rate: null, reason: 'TOO_SHORT' };
    if (!(start.v > 0) || !(end.v > 0)) return { years: n, rate: null, reason: 'NOT_POSITIVE', from: start.fy, to: end.fy };
    if ((def.perShareSeries || def.shareSeries) && splitBetween(b, start.fy, end.fy)) return { years: n, rate: null, reason: 'SPLIT', from: start.fy, to: end.fy };
    return { years: n, rate: Math.pow(end.v / start.v, 1 / n) - 1, from: start.fy, to: end.fy, fromV: start.v, toV: end.v };
  }

  /** Katalog fuer ein Unternehmen: jede Kennzahl mit aktuellem Wert, Reihe (fuer Mini-Diagramm) und Verfuegbarkeit. */
  function catalogFor(b, ctx) {
    return M.map(function (def) {
      var cur = b || def.snap ? current(b, def, ctx) : { v: null };
      var rows = b ? seriesOf(b, def, 'annual') : [];
      var qrows = b && def.q ? seriesOf(b, def, 'quarterly') : [];
      return { def: def, cur: cur, rows: rows, quarterly: have(qrows).length > 1, available: isNum(cur.v) || have(rows).length > 0 };
    });
  }

  /** Zaehlung fuer die Kopfzeile: definiert im Katalog, mit Wert fuer dieses Unternehmen, mit Verlauf. */
  function catalogCounts(list) {
    return { defined: M.length, available: list.filter(function (x) { return x.available; }).length,
      withHistory: list.filter(function (x) { return have(x.rows).length > 1; }).length, missing: list.filter(function (x) { return !x.available; }).length };
  }

  /* ------------------------------------------------------------------ Querschnitt (Screener-Universum) */
  function universe(u) {
    if (!u || u.schema !== 'vu-screener-universe-1.0.0' || !u.cols || !Array.isArray(u.cols.s)) return null;
    var c = u.cols, n = c.s.length, idx = {};
    for (var i = 0; i < n; i++) idx[c.s[i]] = i;
    /* Meldet ein Unternehmen nicht in US-Dollar (vq NON_USD_REPORTING), stehen seine Betraege unumgerechnet in den Spalten:
     * im Querschnitt nicht mit Dollarwerten vergleichbar und daher hier leer (Quoten und Renditen bleiben). */
    var row = function (i) {
      var o = { i: i }; u.columns.forEach(function (k) { o[k] = c[k] ? c[k][i] : null; });
      if (o.vq === 'NON_USD_REPORTING') { FX_COLS.forEach(function (k) { o[k] = null; }); o.fx = true; }
      return o;
    };
    var groups = (u.dict && u.dict.majorGroups) || {}, sectors = (u.dict && u.dict.sectors) || {};
    return {
      raw: u, n: n, asOf: u.asOf || null, fundamentalsAsOf: u.fundamentalsAsOf || null,
      get: function (t) { return idx[t] == null ? null : row(idx[t]); },
      rows: function (filter) { var out = []; for (var i = 0; i < n; i++) { if (!filter || filter(c, i)) out.push(row(i)); } return out; },
      col: function (k) { return c[k] || []; },
      industryLabel: function (sic2) { return sic2 && groups[sic2] ? groups[sic2] : sic2 ? 'SIC ' + sic2 : null; },
      sectorLabel: function (sec) { return sec && sectors[sec] ? sectors[sec] : null; },
      groups: groups, sectors: sectors
    };
  }
  var FX_COLS = ['revenue', 'fcf', 'cash', 'totalDebt', 'netCash', 'eps'];
  function median(vals) {
    var v = vals.filter(isNum).sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  }
  /** Vergleichsgruppe: gleiche Branche (SIC-Hauptgruppe) oder gleicher Sektor.
   * mode 'groesste': die groessten nach Boersenwert (sonst Umsatz); mode 'aehnlich': die naechsten nach Boersenwert
   * (logarithmischer Abstand), damit ein kleiner Wert nicht nur mit Branchenriesen verglichen wird. */
  var PEER_MODES = { groesste: 'die größten nach Börsenwert', aehnlich: 'die nach Börsenwert ähnlichsten' };
  function peerGroup(U, ticker, by, n, mode) {
    var self = U.get(ticker); if (!self) return null;
    var key = by === 'sector' ? 'sec' : 'sic2', val = self[key]; if (!val) return null;
    n = n || 6; mode = mode === 'aehnlich' && isNum(self.mcap) ? 'aehnlich' : 'groesste';
    var members = U.rows(function (cc, i) { return cc[key][i] === val; });
    var size = function (r) { return isNum(r.mcap) ? r.mcap : -1; };
    var sorted = members.filter(function (r) { return isNum(r.mcap) || isNum(r.revenue); }).sort(function (a, b) { return size(b) - size(a) || (b.revenue || 0) - (a.revenue || 0); });
    var top;
    if (mode === 'aehnlich') {
      top = sorted.filter(function (r) { return isNum(r.mcap) && r.mcap > 0 && r.s !== ticker; })
        .map(function (r) { return { r: r, d: Math.abs(Math.log(r.mcap / self.mcap)) }; }).sort(function (a, b) { return a.d - b.d; }).slice(0, n - 1).map(function (x) { return x.r; })
        .concat([self]).sort(function (a, b) { return size(b) - size(a); });
    } else {
      top = sorted.slice(0, n);
      if (!top.some(function (r) { return r.s === ticker; })) top = top.slice(0, n - 1).concat([self]);
    }
    return { by: by, key: val, mode: mode, rule: (by === 'sector' ? 'gleicher Sektor' : 'gleiche SEC-Branche (SIC ' + val + ')') + ', ' + PEER_MODES[mode],
      label: by === 'sector' ? U.sectorLabel(val) : U.industryLabel(val), members: members, peers: top, self: self, file: by === 'sector' ? 'sec-' + val : 'sic-' + val };
  }
  /** Lage eines Werts in der Gruppe: Median, Rang (hoechster = 1), Anzahl. */
  function position(members, col, v) {
    var vals = members.map(function (r) { return r[col]; }).filter(isNum);
    if (!vals.length) return null;
    return { median: median(vals), count: vals.length, rank: isNum(v) ? vals.filter(function (x) { return x > v; }).length + 1 : null, pct: isNum(v) ? vals.filter(function (x) { return x < v; }).length / vals.length : null };
  }
  /* Lage ohne Wertung: Anteil der Gruppe mit niedrigerem Wert. "Hoeher" ist bei Bewertung und Verschuldung kein "besser". */
  function positionText(p) {
    if (!p || !isNum(p.pct) || p.count < 2) return null;
    if (p.rank === 1) return 'höchster Wert der Gruppe';
    if (p.pct === 0) return 'niedrigster Wert der Gruppe';
    return 'höher als ' + Math.round(p.pct * 100) + ' % der Gruppe';
  }

  /* ------------------------------------------------------------------ Ranglisten der Startseite
   * Offene Regeln statt stiller Korrektur: Groessenuntergrenze und Plausibilitaetsgrenzen stehen an jeder Liste. */
  var RANKINGS = [
    { id: 'bewertung', title: 'Interessante Bewertungen', sub: 'Niedrigstes KGV', col: 'pe', dir: 'asc', kind: 'multiple', rule: 'KGV zwischen 5 und 60, Nettomarge positiv, Free-Cashflow-Rendite bis 25 %', filter: function (r) { return r.pe >= 5 && r.pe <= 60 && r.netMargin > 0 && (r.fcfYield == null || r.fcfYield <= 0.25); }, also: ['netMargin', 'revCagr3'] },
    { id: 'profitabel', title: 'Profitable Unternehmen', sub: 'Höchste Kapitalrendite (ROIC)', col: 'roic', dir: 'desc', kind: 'ratio', rule: 'ROIC bis 200 % (darüber ist die Kapitalbasis zu klein für einen aussagekräftigen Wert), Nettomarge positiv', filter: function (r) { return r.roic <= 2 && r.netMargin > 0 && r.netMargin <= 1; }, also: ['netMargin', 'pe'] },
    { id: 'wachstum', title: 'Wachstumsführer', sub: 'Umsatz pro Jahr über 3 Jahre', col: 'revCagr3', dir: 'desc', kind: 'growth', rule: 'Umsatz mindestens 250 Mio. $, Wachstum bis 300 % pro Jahr', filter: function (r) { return r.revCagr3 <= 3 && r.revenue >= 2.5e8; }, also: ['revGrowth', 'netMargin'] },
    { id: 'cashflow', title: 'Cashflow-Stärke', sub: 'Höchste Free-Cashflow-Rendite', col: 'fcfYield', dir: 'desc', kind: 'ratio', rule: 'Free-Cashflow-Rendite bis 25 %, Free-Cashflow-Marge bis 100 %, KGV ab 5 (falls vorhanden)', filter: function (r) { return r.fcfYield > 0 && r.fcfYield <= 0.25 && (r.fcfMargin == null || r.fcfMargin <= 1) && (r.pe == null || r.pe >= 5); }, also: ['fcfMargin', 'pe'] },
    { id: 'margen', title: 'Höchste Margen', sub: 'Nettomarge', col: 'netMargin', dir: 'desc', kind: 'ratio', rule: 'Nettomarge bis 100 % des Umsatzes, Umsatz mindestens 250 Mio. $', filter: function (r) { return r.netMargin <= 1 && r.revenue >= 2.5e8; }, also: ['opMargin', 'roic'] },
    { id: 'bilanz', title: 'Solide Bilanzen', sub: 'Größte Nettokasse', col: 'netCash', dir: 'desc', kind: 'money', rule: 'Nettokasse = Kasse − Finanzschulden, nur positive Werte', filter: function (r) { return r.netCash > 0; }, also: ['debtToEquity', 'mcap'] }
  ];
  var SIZES = [{ id: '2', label: 'ab 2 Mrd. $', min: 2e9 }, { id: '10', label: 'ab 10 Mrd. $', min: 1e10 }, { id: '100', label: 'ab 100 Mrd. $', min: 1e11 }];
  function ranking(U, id, sizeId, n) {
    var def = RANKINGS.filter(function (r) { return r.id === id; })[0]; if (!def || !U) return null;
    var size = SIZES.filter(function (s) { return s.id === sizeId; })[0] || SIZES[0];
    var rows = U.rows(function (c, i) { return isNum(c[def.col][i]) && isNum(c.mcap[i]) && c.mcap[i] >= size.min; }).filter(function (r) { return isNum(r[def.col]); }).filter(def.filter);
    rows.sort(function (a, b) { return def.dir === 'asc' ? a[def.col] - b[def.col] : b[def.col] - a[def.col]; });
    return { def: def, size: size, total: rows.length, rows: rows.slice(0, n || 25) };
  }
  /** Branchen (SIC-Hauptgruppen) mit mindestens `min` Unternehmen mit Boersenwert, nach Gesamtwert. */
  function industries(U, min) {
    if (!U) return [];
    var g = {}, c = U.raw.cols;
    // Mitglieder wie in peerGroup: mit Boersenwert oder Umsatz; mindestens `min` mit Boersenwert
    for (var i = 0; i < U.n; i++) { var k = c.sic2[i]; if (!k || !(isNum(c.mcap[i]) || isNum(c.revenue[i]))) continue; (g[k] = g[k] || []).push(i); }
    return Object.keys(g).filter(function (k) { return g[k].filter(function (i) { return isNum(c.mcap[i]); }).length >= (min || 5); }).map(function (k) {
      var ix = g[k], pick = function (col) { return ix.filter(function (i) { return FX_COLS.indexOf(col) < 0 || c.vq[i] !== 'NON_USD_REPORTING'; }).map(function (i) { return c[col][i]; }).filter(isNum); };
      var top = ix.filter(function (i) { return isNum(c.mcap[i]); }).sort(function (a, b) { return c.mcap[b] - c.mcap[a]; }).slice(0, 3).map(function (i) { return c.s[i]; });
      return { id: k, label: U.industryLabel(k), count: ix.length, mcap: pick('mcap').reduce(function (a, v) { return a + v; }, 0),
        growth: median(pick('revCagr3')), netMargin: median(pick('netMargin').filter(function (v) { return Math.abs(v) <= 1; })), pe: median(pick('pe').filter(function (v) { return v > 0; })), roic: median(pick('roic')), top: top };
    }).sort(function (a, b) { return b.mcap - a.mcap; });
  }

  /* ------------------------------------------------------------------ Analysten (11 Titel, Finnhub + FMP, wie /analysten/) */
  var CONSENSUS = { strong_buy: 'Starker Kauf', buy: 'Kaufen', hold: 'Halten', sell: 'Verkaufen', strong_sell: 'Starker Verkauf' };
  function analysts(doc, ticker) {
    var s = doc && doc.symbols && doc.symbols[ticker];
    if (!s) return null;
    var hist = (s.trend_history || []).filter(function (h) { return h && /^\d{4}-\d{2}/.test(h.period || ''); }).slice().sort(function (a, b) { return a.period < b.period ? -1 : 1; });
    var last = hist[hist.length - 1] || null, pt = s.price_target || null;
    var total = last ? ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'].reduce(function (a, k) { return a + (isNum(last[k]) ? last[k] : 0); }, 0) : 0;
    return { generatedAt: doc.generated_at_utc || null, provider: doc.provider || null, label: CONSENSUS[s.consensus_label] || null, score: isNum(s.consensus_score) ? s.consensus_score : null,
      history: hist, last: last, total: total,
      target: pt && isNum(pt.targetMean) ? { low: pt.targetLow, high: pt.targetHigh, mean: pt.targetMean, median: pt.targetMedian, provider: s.price_target_provider || null } : null };
  }

  /* ------------------------------------------------------------------ Formatierung */
  var SYM = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: 'CHF', CAD: 'C$' };
  function num(v, d) { return v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function money(v, cur) {
    if (!isNum(v)) return '–';
    var a = Math.abs(v), s = v < 0 ? '−' : '', c = ' ' + (SYM[cur || 'USD'] || cur);
    if (a >= 1e12) return s + num(a / 1e12, 2) + ' Bio.' + c;
    if (a >= 1e9) return s + num(a / 1e9, a >= 1e11 ? 0 : 1) + ' Mrd.' + c;
    if (a >= 1e6) return s + num(a / 1e6, a >= 1e8 ? 0 : 1) + ' Mio.' + c;
    if (a >= 1e3) return s + num(a / 1e3, 1) + ' Tsd.' + c;
    return s + num(a, 0) + c;
  }
  var TIMES = { cash_conversion: 1, debt_to_equity: 1, net_debt_ebitda: 1 };
  function fmt(def, v, cur) {
    if (!isNum(v)) return '–';
    switch (def.kind) {
      case 'ratio': return (v < 0 ? '−' : '') + num(Math.abs(v) * 100, Math.abs(v) >= 10 ? 0 : Math.abs(v) < 0.01 ? 2 : 1) + ' %';
      case 'growth': return (v > 0 ? '+' : v < 0 ? '−' : '±') + num(Math.abs(v) * 100, Math.abs(v) >= 10 ? 0 : 1) + ' %';
      case 'multiple': return (v < 0 ? '−' : '') + num(Math.abs(v), Math.abs(v) >= 100 ? 0 : Math.abs(v) < 10 && TIMES[def.id] ? 2 : 1) + (TIMES[def.id] ? '×' : '');
      case 'perShare': return (v < 0 ? '−' : '') + num(Math.abs(v), 2) + ' ' + (SYM[cur || 'USD'] || cur);
      case 'shares': var a = Math.abs(v); return a >= 1e9 ? num(v / 1e9, 2) + ' Mrd.' : a >= 1e6 ? num(v / 1e6, 1) + ' Mio.' : num(v, 0);
      default: return money(v, cur);
    }
  }
  function changeText(def, c, cur) {
    if (!c) return null;
    if (c.absMoney != null) return (c.absMoney >= 0 ? '+' : '') + money(c.absMoney, cur);
    if (c.pp != null) return (c.pp >= 0 ? '+' : '−') + num(Math.abs(c.pp) * 100, 1) + ' Pp.';
    if (c.abs != null) return (c.abs >= 0 ? '+' : '−') + num(Math.abs(c.abs), Math.abs(c.abs) < 1 ? 2 : 1);
    if (c.signFlip) return 'Vorzeichenwechsel';
    if (c.pct == null) return c.dir === 'flat' ? '±0 %' : null;
    return (c.pct >= 0 ? '+' : '−') + num(Math.abs(c.pct) * 100, Math.abs(c.pct) >= 10 ? 0 : 1) + ' %';
  }
  var REASON = { LOSS: 'Verlust in den letzten 12 Monaten', SOURCE_MISSING: 'nicht berechenbar', NON_USD_REPORTING: 'Meldung nicht in US-Dollar', FOREIGN_FILER: 'ausländischer Emittent',
    IMPLAUSIBLE_SHARE_BASIS: 'Aktienanzahl nicht plausibel', NO_CURRENT_SHARE_COUNT: 'keine aktuelle Aktienanzahl', UNIVERSE_MISSING: 'Vergleichsdaten gerade nicht geladen', NO_DIVIDEND: 'keine Dividende',
    SPLIT: 'Aktiensplit ohne Rückrechnung', CHECK_FAILED: 'Gegenprobe nicht bestanden', QUARTER_MISMATCH: 'Quartale ergeben nicht den Jahreswert', SHARE_BASIS_JUMP: 'Aktienbasis springt', NO_PRICE: 'kein Kurs zum GJ-Ende', NO_CHECK: 'keine Gegenprobe möglich', NO_SPLIT_EVIDENCE: 'kein Split-Beleg', NO_EPS: 'kein Gewinn je Aktie', NO_VERIFIED_YEAR: 'kein geprüftes Jahr', NOT_POSITIVE: 'Vorwert ≤ 0', TOO_SHORT: 'zu kurze Reihe', NO_DATA: 'keine Angabe',
    NO_SHARES: 'keine Aktienzahl', SHARE_CHECK_FAILED: 'Aktienzahl-Gegenprobe nicht bestanden', NO_DEBT_DATA: 'Schulden oder Kasse fehlen', NEGATIVE_EV: 'Unternehmenswert ≤ 0',
    NEGATIVE_EQUITY: 'Eigenkapital ≤ 0', LOSS_FY: 'Verlust im Geschäftsjahr', NO_DIVIDEND_REPORTED: 'keine Dividende gemeldet', NOT_POSITIVE_BASE: 'Bezugsgröße ≤ 0', NO_BASE: 'Bezugsgröße fehlt' };
  function reason(code) { return REASON[code] || 'keine Angabe'; }

  /* Monat des Geschaeftsjahresendes ("endet Ende Januar"), aus dem letzten Jahresstichtag. */
  var MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  function fiscalYearEnd(b) {
    var e = b && b.calendar && b.calendar.latestFiscalYearEnd;
    if (!e && b) { var r = (b.base.revenue || b.base.net_income || { annual: [] }).annual; e = r.length ? r[r.length - 1].end : null; }
    var m = /^\d{4}-(\d{2})-(\d{2})$/.exec(e || '');
    if (!m) return null;
    var mo = Number(m[1]) - 1, d = Number(m[2]);
    if (d <= 7) mo = (mo + 11) % 12; // 52/53-Wochen-Jahre enden oft in den ersten Tagen des Folgemonats
    return { month: MONTHS[mo], calendar: mo === 11, weekBased: !!(b.calendar && b.calendar.weekBased) };
  }
  function historyPath(ticker, shardKey) { return HISTORY_BASE + shardKey(ticker) + '.json.gz'; }
  function seriesPath(securityId) { return /^ref_[A-Z0-9_]{1,24}$/.test(securityId || '') ? SERIES_BASE + securityId + '.json' : null; }
  function longSeriesPath(p) { return /^\/quant\/data\/market\/discover-series-long\/ref_[A-Z0-9_]{1,24}\.json$/.test(p || '') ? p : null; }

  var api = { VERSION: VERSION, CATS: CATS, METRICS: M, BY_ID: BY_ID, FORMULA: FORMULA, RANKINGS: RANKINGS, SIZES: SIZES, HISTORY_BASE: HISTORY_BASE, UNIVERSE_PATH: UNIVERSE_PATH, ANALYST_PATH: ANALYST_PATH,
    fromHistory: fromHistory, historicalPe: historicalPe, historicalValuation: historicalValuation, attachValuation: attachValuation, stepChange: stepChange, changeOf: changeOf, positionText: positionText, PEER_MODES: PEER_MODES,
    INDUSTRY_METRICS: INDUSTRY_METRICS, INDUSTRY_SCHEMA: INDUSTRY_SCHEMA, industryPath: industryPath, industrySeries: industrySeries, HIST_VAL: HIST_VAL, SHARE_TOLERANCE: SHARE_TOLERANCE, catalogCounts: catalogCounts, QUARTER_SUM: QUARTER_SUM, QUARTER_TOL: QUARTER_TOL, PE_TOLERANCE: PE_TOLERANCE, fromDiscover: fromDiscover, seriesOf: seriesOf, current: current, cagr: cagr, catalogFor: catalogFor, rolling: rolling, snapshot: snapshot, splitJumps: splitJumps,
    universe: universe, peerGroup: peerGroup, position: position, median: median, ranking: ranking, industries: industries, analysts: analysts,
    money: money, fmt: fmt, changeText: changeText, reason: reason, fiscalYearEnd: fiscalYearEnd, historyPath: historyPath, seriesPath: seriesPath, longSeriesPath: longSeriesPath, isNum: isNum };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.VUFundamental = global.VUFundamental || {};
  global.VUFundamental.Catalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
