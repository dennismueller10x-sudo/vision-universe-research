/* =========================================================================
   VISION UNIVERSE QUANT — factors.js
   FAKTORBERECHNUNG (§15, §36)

   Berechnet je Security und Stichtag die Rohkennzahlen aller Faktoren aus
   Kursreihen und Point-in-Time-Fundamentaldaten.

   POINT-IN-TIME IST HIER NICHT OPTIONAL. Die Funktion erhaelt ausschliesslich
   ein Fact Panel, das der Provider bereits auf availableAt <= asOf gefiltert
   hat. Es gibt keinen Parameter, der diese Filterung abschaltet — genau
   dieselbe Funktion berechnet die heutige Anzeige und jeden historischen
   Rebalancing-Termin eines Backtests. Zwei getrennte Pfade waeren die
   wahrscheinlichste Quelle fuer Look-Ahead Bias.

   Fehlende Werte bleiben null. Eine Kennzahl, deren Nenner <= 0 ist
   (EV/EBITDA bei negativem EBITDA, Kurs/FCF bei negativem FCF), ist nicht
   "sehr guenstig", sondern nicht definiert.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Norm = isNode ? require("./normalization.js") : global.VUNormalization;

  var TAX_RATE = 0.21;                 // Normalisierter Steuersatz fuer NOPAT
  var TRADING_DAYS_YEAR = 252;
  var WINDOWS = { m3: 63, m6: 126, m12: 252, m1: 21, dma50: 50, dma200: 200, liquidity: 60 };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function div(a, b) { return (isNum(a) && isNum(b) && b !== 0) ? a / b : null; }
  function pct(v) { return isNum(v) ? v * 100 : null; }
  function round(v, d) {
    if (!isNum(v)) return null;
    var f = Math.pow(10, d === undefined ? 4 : d);
    return Math.round(v * f) / f;
  }

  // ---------------------------------------------------------------------
  // Kursbasierte Kennzahlen
  // ---------------------------------------------------------------------
  function priceMetrics(series, t, benchmarkLevel, volumeAt, securityId) {
    if (!series || t < series.startIndex || t > series.endIndex) return null;
    var adj = series.adjustedClose;
    var close = series.close;
    if (!adj[t]) return null;

    function retOver(days) {
      var from = t - days;
      if (from < series.startIndex || !adj[from]) return null;
      return adj[t] / adj[from] - 1;
    }

    /* 12-1-Momentum laesst den letzten Monat bewusst aus: kurzfristige
       Umkehreffekte sollen das mittelfristige Momentum nicht verwaessern. */
    var m12_1 = null;
    if (t - WINDOWS.m12 >= series.startIndex && adj[t - WINDOWS.m12] && adj[t - WINDOWS.m1]) {
      m12_1 = adj[t - WINDOWS.m1] / adj[t - WINDOWS.m12] - 1;
    }

    /* Ein einziger Durchlauf ueber das letzte Jahr statt vier: 52-Wochen-
       Hoch, Renditemomente, Downside-Varianz, Beta-Kovarianz und Drawdown
       teilen dasselbe Fenster. Bei 250 Rebalancing-Terminen x 480 Titeln
       macht das den Unterschied zwischen einem laufenden und einem
       unbenutzbaren Backtest — die Semantik bleibt unveraendert. */
    var from12 = Math.max(series.startIndex, t - WINDOWS.m12);
    var high52 = 0;
    var n = 0, sum = 0, sumSq = 0;
    var downSumSq = 0, downN = 0;
    var bmN = 0, bmSum = 0, bmSumSq = 0, crossSum = 0;
    var peak = 0, maxDd = 0;

    for (var i = from12; i <= t; i++) {
      if (close[i] > high52) high52 = close[i];
      if (adj[i] > peak) peak = adj[i];
      if (peak > 0 && adj[i] > 0) {
        var dd = adj[i] / peak - 1;
        if (dd < maxDd) maxDd = dd;
      }
      if (i === from12) continue;
      if (!adj[i - 1] || !adj[i]) continue;
      var r = adj[i] / adj[i - 1] - 1;
      n++; sum += r; sumSq += r * r;
      if (r < 0) { downSumSq += r * r; downN++; }
      if (benchmarkLevel && benchmarkLevel[i - 1]) {
        var br = benchmarkLevel[i] / benchmarkLevel[i - 1] - 1;
        bmN++; bmSum += br; bmSumSq += br * br; crossSum += r * br;
      }
    }

    var distance52 = high52 > 0 ? (high52 - close[t]) / high52 : null;

    function dma(days) {
      var start = t - days + 1;
      if (start < series.startIndex) return null;
      var acc = 0, count = 0;
      for (var j = start; j <= t; j++) { if (close[j] > 0) { acc += close[j]; count++; } }
      return count === days ? acc / count : null;
    }
    var d50 = dma(WINDOWS.dma50);
    var d200 = dma(WINDOWS.dma200);

    var vol = null, downVol = null, beta = null;
    if (n > 60) {
      var mean = sum / n;
      var variance = (sumSq - n * mean * mean) / (n - 1);
      vol = Math.sqrt(Math.max(0, variance) * TRADING_DAYS_YEAR);
      downVol = downN > 5 ? Math.sqrt(downSumSq / downN) * Math.sqrt(TRADING_DAYS_YEAR) : null;
      if (bmN === n && bmN > 60) {
        var bMean = bmSum / bmN;
        var bVar = bmSumSq - bmN * bMean * bMean;
        beta = bVar > 0 ? (crossSum - n * mean * bMean) / bVar : null;
      }
    }

    /* Liquiditaet als Dollar-Volumen, nicht als Stueckzahl: 10 Mio. Stueck
       eines 2-Dollar-Titels sind etwas anderes als 10 Mio. Stueck eines
       200-Dollar-Titels. */
    var dollarVolume = null;
    if (volumeAt) {
      var vSum = 0, vN = 0;
      for (var v = Math.max(series.startIndex, t - WINDOWS.liquidity + 1); v <= t; v++) {
        if (!close[v]) continue;
        vSum += close[v] * volumeAt(securityId, v);
        vN++;
      }
      dollarVolume = vN > 0 ? (vSum / vN) / 1e6 : null;
    }

    return {
      price: round(close[t], 4),
      momentum3m: round(pct(retOver(WINDOWS.m3)), 3),
      momentum6m: round(pct(retOver(WINDOWS.m6)), 3),
      momentum12m: round(pct(retOver(WINDOWS.m12)), 3),
      momentum12m1m: round(pct(m12_1), 3),
      distanceTo52wHigh: round(pct(distance52), 3),
      priceTo50dma: round(pct(div(close[t] - d50, d50)), 3),
      priceTo200dma: round(pct(div(close[t] - d200, d200)), 3),
      volatility: round(pct(vol), 3),
      downsideVolatility: round(pct(downVol), 3),
      maxDrawdown: round(pct(-maxDd), 3),
      beta: round(beta, 3),
      avgDollarVolume: round(dollarVolume, 3)
    };
  }

  // ---------------------------------------------------------------------
  // Fundamentale Kennzahlen (TTM aus zum Stichtag bekannten Perioden)
  // ---------------------------------------------------------------------
  function sumTTM(periods, metric) {
    if (periods.length < 4) return null;
    var sum = 0;
    for (var i = 0; i < 4; i++) {
      var v = periods[i].values[metric];
      if (!isNum(v)) return null;
      sum += v;
    }
    return sum;
  }

  function fundamentalMetrics(periods, price) {
    /* periods sind absteigend nach periodEnd sortiert, bereits PIT-gefiltert. */
    if (!periods || periods.length === 0) return emptyFundamentals();

    var latest = periods[0];
    var current = periods.slice(0, 4);
    var prior = periods.slice(4, 8);

    var revenue = sumTTM(current, "revenue");
    var grossProfit = sumTTM(current, "grossProfit");
    var operatingIncome = sumTTM(current, "operatingIncome");
    var netIncome = sumTTM(current, "netIncome");
    var ebitda = sumTTM(current, "ebitda");
    var fcf = sumTTM(current, "freeCashFlow");
    var dividends = sumTTM(current, "dividendPerShare");

    var priorRevenue = sumTTM(prior, "revenue");
    var priorNetIncome = sumTTM(prior, "netIncome");
    var priorFcf = sumTTM(prior, "freeCashFlow");
    var priorOperatingIncome = sumTTM(prior, "operatingIncome");

    var totalAssets = valueOf(latest, "totalAssets");
    var totalEquity = valueOf(latest, "totalEquity");
    var netDebt = valueOf(latest, "netDebt");
    var investedCapital = valueOf(latest, "investedCapital");
    var shares = valueOf(latest, "sharesOutstanding");
    var interestExpense = valueOf(latest, "interestExpense");
    var accruals = valueOf(latest, "accruals");
    var priorShares = prior.length ? valueOf(prior[0], "sharesOutstanding") : null;

    var marketCap = (isNum(price) && isNum(shares)) ? price * shares : null;
    var enterpriseValue = (isNum(marketCap) && isNum(netDebt)) ? marketCap + netDebt : null;

    var nopat = isNum(operatingIncome) ? operatingIncome * (1 - TAX_RATE) : null;
    var roic = (isNum(nopat) && isNum(investedCapital) && investedCapital > 0) ? nopat / investedCapital : null;

    var opMargin = div(operatingIncome, revenue);
    var priorOpMargin = div(priorOperatingIncome, priorRevenue);

    return {
      revenue: round(revenue, 2),
      freeCashFlow: round(fcf, 2),
      netIncome: round(netIncome, 2),
      marketCap: round(marketCap, 2),

      roic: round(pct(roic), 3),
      grossProfitability: round(div(grossProfit, totalAssets), 4),
      fcfMargin: round(pct(div(fcf, revenue)), 3),
      operatingMargin: round(pct(opMargin), 3),
      balanceSheetQuality: round(balanceSheetQuality(ebitda, interestExpense, netDebt, accruals), 2),
      leverage: round(leverageRatio(netDebt, ebitda), 3),

      earningsYield: round(pct(div(netIncome, marketCap)), 3),
      fcfYield: round(pct(div(fcf, marketCap)), 3),
      /* Ein negativer Multiplikator ist keine guenstige Bewertung, sondern
         eine undefinierte Kennzahl. */
      evToEbitda: (isNum(ebitda) && ebitda > 0) ? round(div(enterpriseValue, ebitda), 3) : null,
      evToSales: round(div(enterpriseValue, revenue), 3),
      priceToFcf: (isNum(fcf) && fcf > 0) ? round(div(marketCap, fcf), 3) : null,

      revenueGrowth: round(pct(growthOf(revenue, priorRevenue)), 3),
      epsGrowth: round(pct(growthOf(div(netIncome, shares), div(priorNetIncome, priorShares))), 3),
      fcfGrowth: round(pct(growthOf(fcf, priorFcf)), 3),
      marginExpansion: (isNum(opMargin) && isNum(priorOpMargin)) ? round((opMargin - priorOpMargin) * 100, 3) : null,

      dividendYield: round(pct(div(dividends, price)), 3),
      consecutiveDividendGrowthYears: dividendGrowthStreak(periods),

      _asOfPeriodEnd: latest.periodEnd,
      _asOfAvailableAt: latest.availableAt,
      _restatementStatus: latest.restatementStatus,
      _revisionId: latest.revisionId
    };
  }

  function valueOf(period, metric) {
    var v = period && period.values[metric];
    return isNum(v) ? v : null;
  }

  function growthOf(current, prior) {
    if (!isNum(current) || !isNum(prior)) return null;
    /* Wachstum aus einer negativen Basis ist nicht interpretierbar
       (von -10 auf -5 sind keine "+50 % Wachstum"). */
    if (prior <= 0) return null;
    return current / prior - 1;
  }

  function leverageRatio(netDebt, ebitda) {
    if (!isNum(netDebt) || !isNum(ebitda)) return null;
    if (ebitda <= 0) return null;
    return netDebt / ebitda;
  }

  /* Bilanzqualitaet als zusammengesetzter Rohwert 0..100 aus Zinsdeckung,
     Verschuldungsgrad und Accrual-Anteil. Er wird anschliessend wie jede
     andere Rohkennzahl normalisiert. */
  function balanceSheetQuality(ebitda, interestExpense, netDebt, accruals) {
    var parts = [], weights = [];
    if (isNum(ebitda) && isNum(interestExpense)) {
      var coverage = interestExpense > 0 ? ebitda / interestExpense : 30;
      parts.push(Norm.clamp(coverage, 0, 30) / 30 * 100); weights.push(0.4);
    }
    var lev = leverageRatio(netDebt, ebitda);
    if (isNum(lev)) { parts.push((1 - Norm.clamp(lev, 0, 5) / 5) * 100); weights.push(0.3); }
    else if (isNum(netDebt) && netDebt <= 0) { parts.push(100); weights.push(0.3); }
    if (isNum(accruals)) { parts.push((1 - Norm.clamp(accruals + 0.10, 0, 0.30) / 0.30) * 100); weights.push(0.3); }
    if (!parts.length) return null;
    var wSum = weights.reduce(function (a, b) { return a + b; }, 0);
    var sum = 0;
    for (var i = 0; i < parts.length; i++) sum += parts[i] * weights[i];
    return sum / wSum;
  }

  /** Aufeinanderfolgende Geschaeftsjahre mit steigender Jahresdividende. */
  function dividendGrowthStreak(periods) {
    var byYear = Object.create(null);
    periods.forEach(function (p) {
      var v = p.values.dividendPerShare;
      if (!isNum(v)) return;
      byYear[p.fiscalYear] = (byYear[p.fiscalYear] || 0) + v;
    });
    var years = Object.keys(byYear).map(Number).sort(function (a, b) { return b - a; });
    /* Nur vollstaendig bekannte Jahre zaehlen — das laufende Jahr ist
       unvollstaendig und wuerde eine Serie faelschlich beenden. */
    if (years.length < 3) return null;
    var streak = 0;
    for (var i = 1; i < years.length - 1; i++) {
      if (byYear[years[i]] > byYear[years[i + 1]] && byYear[years[i + 1]] > 0) streak++;
      else break;
    }
    return streak;
  }

  function emptyFundamentals() {
    return {
      revenue: null, freeCashFlow: null, netIncome: null, marketCap: null,
      roic: null, grossProfitability: null, fcfMargin: null, operatingMargin: null,
      balanceSheetQuality: null, leverage: null,
      earningsYield: null, fcfYield: null, evToEbitda: null, evToSales: null, priceToFcf: null,
      revenueGrowth: null, epsGrowth: null, fcfGrowth: null, marginExpansion: null,
      dividendYield: null, consecutiveDividendGrowthYears: null,
      _asOfPeriodEnd: null, _asOfAvailableAt: null, _restatementStatus: null, _revisionId: null
    };
  }

  // ---------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------
  /**
   * Rohkennzahlen fuer alle Securities zu einem Stichtag.
   *
   * @param {object} input
   *   securities   Security[] (bereits auf den Stichtag gefiltert)
   *   pricePanel   { tradingDays, dayIndex, series, benchmark, volumeAt }
   *   factPanel    { asOf, periods: {securityId: FundamentalPeriod[]} }
   *   asOf         YYYY-MM-DD
   */
  function computeMetricPanel(input) {
    var securities = input.securities;
    var panel = input.pricePanel;
    var facts = input.factPanel.periods;
    var asOf = input.asOf;

    var t = panel.dayIndex[asOf];
    if (t === undefined) {
      var days = panel.tradingDays, lo = 0, hi = days.length - 1;
      t = -1;
      while (lo <= hi) { var mid = (lo + hi) >> 1; if (days[mid] <= asOf) { t = mid; lo = mid + 1; } else hi = mid - 1; }
    }
    if (t < 0) throw new Error("No trading day at or before " + asOf);

    var benchmarkLevel = panel.benchmark ? panel.benchmark.level : null;
    var rows = [];

    for (var i = 0; i < securities.length; i++) {
      var s = securities[i];
      var pm = priceMetrics(panel.series[s.securityId], t, benchmarkLevel, panel.volumeAt, s.securityId);
      if (!pm) continue;
      var fm = fundamentalMetrics(facts[s.securityId] || [], pm.price);

      var row = {
        securityId: s.securityId, ticker: s.ticker, name: s.name,
        sector: s.sector, industry: s.industry, country: s.country,
        assetType: s.assetType, status: s.status, isMock: s.isMock,
        fixtureId: s.fixtureId || null, asOf: panel.tradingDays[t]
      };
      Object.keys(pm).forEach(function (k) { row[k] = pm[k]; });
      Object.keys(fm).forEach(function (k) { row[k] = fm[k]; });
      rows.push(row);
    }

    /* Relative Staerke ist per Definition ein Querschnittsmass und kann
       erst berechnet werden, wenn alle Titel vorliegen. */
    var m12 = rows.map(function (r) { return r.momentum12m; });
    var medianM12 = Norm.median(m12);
    rows.forEach(function (r) {
      r.relativeStrength = (isNum(r.momentum12m) && isNum(medianM12))
        ? round(r.momentum12m - medianM12, 3) : null;
    });

    return { asOf: panel.tradingDays[t], tradingDayIndex: t, rows: rows, universeMedianMomentum12m: medianM12 };
  }

  var api = {
    TAX_RATE: TAX_RATE,
    WINDOWS: WINDOWS,
    priceMetrics: priceMetrics,
    fundamentalMetrics: fundamentalMetrics,
    computeMetricPanel: computeMetricPanel,
    dividendGrowthStreak: dividendGrowthStreak,
    balanceSheetQuality: balanceSheetQuality
  };

  if (isNode) module.exports = api;
  else global.VUFactors = api;
})(typeof window !== "undefined" ? window : globalThis);
