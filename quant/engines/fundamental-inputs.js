/* =========================================================================
   VISION UNIVERSE QUANT 2.0 — FUNDAMENTAL FACTOR INPUTS v1

   Turns one `vu-consumer-fundamentals-1.0.0` document into the raw values
   the Quant V2 fundamental components need, plus the change inputs the
   Change Engine measures on.

   Three rules run through all of it:

   1. Point in time. A value is usable only once its filing date is on or
      before the cutoff. A derived value has no filing of its own, so its
      availability is the latest filing among its named inputs.
   2. Period alignment. A balance-sheet instant more than 400 days older
      than the reported period is not a current figure, and pairing it with
      a current TTM would read like one number when it is two. It is
      dropped, not mixed.
   3. No stand-ins. A missing input makes its value absent. Nothing is
      estimated, and no flat assumption stands in for a reported one — a
      guessed tax rate looks exactly like a reported one inside a ratio.

   Lives in engines/ rather than inside the materializer because a formula
   that decides whether a factor opens has to be testable on its own.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

  var VERSION = "fundamental-inputs-1.0.0";
  var CONSUMER_SCHEMA = "vu-consumer-fundamentals-1.0.0";

  /* Column order of the consumer contract's compact rows. */
  var COL = { fy: 0, fp: 1, end: 2, v: 3, filed: 4 };

  /* A balance-sheet instant older than this against the reported period is
     history, not a current figure. */
  var STALE_INSTANT_DAYS = 400;

  function finite(value) { return typeof value === "number" && Number.isFinite(value); }

  function annualSeries(doc, metric, cutoff) {
    var rows = doc && doc.annual && doc.annual[metric];
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(function (row) {
        return Array.isArray(row) && finite(row[COL.v]) &&
          typeof row[COL.filed] === "string" && row[COL.filed] <= cutoff;
      })
      .map(function (row) { return { fy: row[COL.fy], end: row[COL.end], value: row[COL.v], filed: row[COL.filed] }; })
      .sort(function (a, b) { return a.end < b.end ? -1 : a.end > b.end ? 1 : 0; });
  }

  function quarterSeries(doc, metric, cutoff) {
    var rows = doc && doc.quarterly && doc.quarterly[metric];
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(function (row) {
        return Array.isArray(row) && finite(row[COL.v]) &&
          typeof row[COL.filed] === "string" && row[COL.filed] <= cutoff;
      })
      .map(function (row) { return { end: row[COL.end], value: row[COL.v], filed: row[COL.filed] }; })
      .sort(function (a, b) { return a.end < b.end ? -1 : a.end > b.end ? 1 : 0; });
  }

  /* Newest filing date the document carries for a metric, used to date a
     derived value that has none of its own. */
  function newestFiled(doc, metric) {
    var dates = [];
    ["quarterly", "annual"].forEach(function (block) {
      var rows = doc && doc[block] && doc[block][metric];
      if (Array.isArray(rows)) rows.forEach(function (row) {
        if (typeof row[COL.filed] === "string") dates.push(row[COL.filed]);
      });
    });
    var direct = doc && doc.ttm && doc.ttm[metric] && doc.ttm[metric].filed;
    if (typeof direct === "string") dates.push(direct);
    return dates.length ? dates.slice().sort().pop() : null;
  }

  function ttmValue(doc, metric, cutoff) {
    var entry = doc && doc.ttm && doc.ttm[metric];
    if (!entry || !finite(entry.v)) return null;
    var filed = typeof entry.filed === "string" ? entry.filed : null;
    if (!filed && entry.derived && Array.isArray(entry.inputs)) {
      var inputDates = entry.inputs.map(function (input) { return newestFiled(doc, input); })
        .filter(Boolean);
      filed = inputDates.length === entry.inputs.length ? inputDates.sort().pop() : null;
    }
    if (!filed || filed > cutoff) return null;
    return { value: entry.v, end: entry.end, filed: filed, derived: entry.derived === true };
  }

  function periodAligned(entry, referenceEnd) {
    if (!entry) return null;
    if (typeof entry.end !== "string" || typeof referenceEnd !== "string") return entry;
    var gap = (Date.parse(referenceEnd) - Date.parse(entry.end)) / 86400000;
    if (!Number.isFinite(gap)) return entry;
    return gap > STALE_INSTANT_DAYS ? null : entry;
  }

  /* A compound growth rate across a sign change has no meaning, so it is
     null rather than a number that happens to compute. */
  function cagr(series, years) {
    if (series.length < years + 1) return null;
    var last = series[series.length - 1], first = series[series.length - 1 - years];
    if (!(first.value > 0) || !(last.value > 0)) return null;
    return Math.pow(last.value / first.value, 1 / years) - 1;
  }

  function sumWindow(series, from, count) {
    if (series.length < from + count) return null;
    var end = series.length - from;
    return series.slice(end - count, end).reduce(function (total, entry) { return total + entry.value; }, 0);
  }

  function median(values) {
    var sorted = values.filter(finite).slice().sort(function (a, b) { return a - b; });
    if (!sorted.length) return null;
    var middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  /* Wie viele Geschaeftsjahre das Dokument ueberhaupt abdeckt, gezaehlt
     ueber die Stichtage mehrerer Reihen: eine Reihe kann ein Jahr
     auslassen, das eine andere fuehrt. */
  function fiscalYearCount(seriesList) {
    var ends = new Set();
    seriesList.forEach(function (series) {
      (series || []).forEach(function (entry) { if (entry && entry.end) ends.add(entry.end); });
    });
    return ends.size;
  }

  /* Series keyed by period end, so two figures are only ever divided when
     they come from the same closing date. */
  function byEnd(series) {
    var map = new Map();
    series.forEach(function (entry) { map.set(entry.end, entry.value); });
    return map;
  }

  /**
   * Effective tax rate from the reported tax charge.
   *
   * Only from a positive pre-tax result, and only when the resulting rate
   * is inside [0,1]. A loss year, a tax benefit or a rate above 100 % are
   * all real, and all of them make the canonical after-tax operating
   * result undefined rather than approximate. There is no fallback rate:
   * an assumed one is indistinguishable from a reported one once it is
   * inside a ratio.
   */
  function effectiveTaxRate(taxExpense, pretaxIncome) {
    if (!finite(taxExpense) || !finite(pretaxIncome) || !(pretaxIncome > 0)) return null;
    var rate = taxExpense / pretaxIncome;
    return rate >= 0 && rate <= 1 ? rate : null;
  }

  /**
   * Return on invested capital.
   *
   * NOPAT / invested capital, where invested capital is debt plus equity
   * less cash. Needs every input from the same period; a negative invested
   * capital makes the ratio meaningless and returns null.
   */
  function roic(operatingIncome, taxRate, totalDebt, equity, cash) {
    if (!finite(operatingIncome) || !finite(taxRate)) return null;
    if (!finite(totalDebt) || !finite(equity) || !finite(cash)) return null;
    var invested = totalDebt + equity - cash;
    if (!(invested > 0)) return null;
    return (operatingIncome * (1 - taxRate)) / invested;
  }

  /**
   * compute(doc, cutoff, marketCap) -> {raws, change, shares, availableAt, ...}
   *
   * `marketCap` may be null; the price-dependent block is then simply
   * absent rather than zero.
   */
  function compute(doc, cutoff, marketCap) {
    if (!doc || doc.schema !== CONSUMER_SCHEMA) return null;

    var revenueA = annualSeries(doc, "revenue", cutoff),
      epsA = annualSeries(doc, "eps_diluted", cutoff),
      fcfA = annualSeries(doc, "free_cash_flow", cutoff),
      operatingIncomeA = annualSeries(doc, "operating_income", cutoff),
      assetsA = annualSeries(doc, "total_assets", cutoff),
      equityA = annualSeries(doc, "stockholders_equity", cutoff),
      debtA = annualSeries(doc, "total_debt", cutoff),
      cashA = annualSeries(doc, "cash_and_equivalents", cutoff),
      taxA = annualSeries(doc, "income_tax_expense", cutoff),
      pretaxA = annualSeries(doc, "pretax_income", cutoff),
      netIncomeA = annualSeries(doc, "net_income", cutoff),
      ocfA = annualSeries(doc, "operating_cash_flow", cutoff),
      dividendsA = annualSeries(doc, "dividends_paid", cutoff),
      grossQ = quarterSeries(doc, "gross_profit", cutoff),
      revenueQ = quarterSeries(doc, "revenue", cutoff),
      fcfQ = quarterSeries(doc, "free_cash_flow", cutoff),
      revenueT = ttmValue(doc, "revenue", cutoff),
      netIncomeT = ttmValue(doc, "net_income", cutoff),
      ocfT = ttmValue(doc, "operating_cash_flow", cutoff),
      grossT = ttmValue(doc, "gross_profit", cutoff),
      fcfT = ttmValue(doc, "free_cash_flow", cutoff),
      operatingIncomeT = ttmValue(doc, "operating_income", cutoff),
      ebitdaT = ttmValue(doc, "ebitda", cutoff),
      taxT = ttmValue(doc, "income_tax_expense", cutoff),
      pretaxT = ttmValue(doc, "pretax_income", cutoff);

    /* Everything below is read against the period the TTM block reports.
     *
     * DIE BERICHTSPERIODE HING AM UMSATZ.
     *
     * Gemessen am 26.09.2026 ueber alle 5.036 Titel mit Consumer-Export:
     * 741 fuehren eine vollstaendige Bilanz (Bilanzsumme und Eigenkapital)
     * und trotzdem war `fundamentalsAsOf` leer - in 741 von 741 Faellen
     * allein deshalb, weil der Emittent kein `revenue`-Tag meldet. Das sind
     * nicht nur Banken (101 mal 6022, 57 mal 6021, 50 REITs), sondern auch
     * 93 Pharma- und 30 Biotech-Titel: ein Unternehmen vor der ersten
     * Zulassung hat zwoelf Abschluesse und keinen Umsatz, und die Seite
     * sagte ihm "keine Fundamentaldaten".
     *
     * Die Periode kommt deshalb aus dem, was das Dokument wirklich traegt:
     * die juengste berichtete Periode, nicht die des Umsatzes. Gemessen
     * ueber alle 5.069 Exporte ist das fuer das TTM-Fenster in keinem
     * einzigen Dokument ein Unterschied - der Umsatz datiert dort immer
     * dieselbe Periode wie jedes andere Ergebnisfenster. Im Rueckfall auf
     * die Geschaeftsjahre sind es 80 Dokumente, und dort bis zu 4.748 Tage:
     * eine Umsatzreihe, die 2013 endet, neben einer Reihe, die 2026 endet.
     *
     * Dass die *juengste* Periode zaehlt, ist die vorsichtige Wahl: je
     * spaeter die Referenz, desto mehr veraltete Bestaende fallen heraus.
     * Die umgekehrte Wahl liess bei BCE einen Anteilsbestand von 2023 neben
     * Abschlusszahlen von 2017 passieren, weil er gegen sie "neu" aussah -
     * und daraus entstand ein Boersenwert aus zwei Jahrzehnten.
     *
     * Ergebnisfenster vor Bilanzstichtag, weil Regel 2 einen Bestand gegen
     * die *berichtete Periode* prueft: waere der Bestand selbst die
     * Referenz, verglich er sich mit sich selbst und kein veralteter
     * Bestand fiele je auf. */
    var referenceEnd = null;
    var neueste = function (kandidat) {
      if (typeof kandidat === "string" && (!referenceEnd || kandidat > referenceEnd)) referenceEnd = kandidat;
    };
    [revenueT, netIncomeT, ocfT, pretaxT, operatingIncomeT, grossT, ebitdaT, fcfT].forEach(function (entry) {
      if (entry) neueste(entry.end);
    });
    if (!referenceEnd) {
      [revenueA, netIncomeA, ocfA, pretaxA, epsA, fcfA, assetsA, equityA].forEach(function (series) {
        if (series.length) neueste(series[series.length - 1].end);
      });
    }
    var netDebtT = periodAligned(ttmValue(doc, "net_debt", cutoff), referenceEnd);
    var debtT = periodAligned(ttmValue(doc, "total_debt", cutoff), referenceEnd);
    var cashT = periodAligned(ttmValue(doc, "cash_and_equivalents", cutoff), referenceEnd);

    var latestAssetsEntry = periodAligned(assetsA[assetsA.length - 1], referenceEnd),
      latestAssets = latestAssetsEntry ? latestAssetsEntry.value : null,
      priorAssets = assetsA.length > 1 ? assetsA[assetsA.length - 2].value : null,
      averageAssets = finite(latestAssets) && finite(priorAssets) ? (latestAssets + priorAssets) / 2 : latestAssets,
      latestEquityEntry = periodAligned(equityA[equityA.length - 1], referenceEnd),
      latestEquity = latestEquityEntry ? latestEquityEntry.value : null;

    var raws = {}, filedDates = [];
    [revenueT, netIncomeT, ocfT, grossT, fcfT, netDebtT, operatingIncomeT, ebitdaT, taxT, pretaxT]
      .forEach(function (entry) { if (entry && entry.filed) filedDates.push(entry.filed); });
    [revenueA[revenueA.length - 1], assetsA[assetsA.length - 1], equityA[equityA.length - 1]]
      .forEach(function (entry) { if (entry && entry.filed) filedDates.push(entry.filed); });

    /* ---------------------------------------------------------- Quality */
    if (netIncomeT && ocfT && finite(averageAssets) && averageAssets > 0) {
      raws.accrualRatio = (netIncomeT.value - ocfT.value) / averageAssets;
    }
    if (netDebtT && finite(latestAssets) && latestAssets > 0) raws.netDebtToAssets = netDebtT.value / latestAssets;
    if (finite(latestEquity) && finite(latestAssets) && latestAssets > 0) raws.equityToAssets = latestEquity / latestAssets;
    if (fcfA.length >= 4) {
      raws.positiveFcfYears = fcfA.slice(-5).filter(function (entry) { return entry.value > 0; }).length;
    }

    /* Operating margin per fiscal year, paired on the closing date: two
       figures from different filings are not a margin. */
    var revenueByEnd = byEnd(revenueA);
    var operatingMargins = operatingIncomeA.map(function (entry) {
      var revenue = revenueByEnd.get(entry.end);
      return finite(revenue) && revenue > 0 ? { end: entry.end, value: entry.value / revenue } : null;
    }).filter(Boolean);

    var marginWindow = operatingMargins.slice(-5);
    if (marginWindow.length >= 4) {
      var marginMedian = median(marginWindow.map(function (entry) { return entry.value; }));
      raws.operatingMarginStability = median(marginWindow.map(function (entry) {
        return Math.abs(entry.value - marginMedian);
      }));
    }
    if (operatingMargins.length >= 4) {
      raws.operatingMarginExpansion3y =
        operatingMargins[operatingMargins.length - 1].value - operatingMargins[operatingMargins.length - 4].value;
    }

    /* ----------------------------------------------------------- Growth */
    raws.revenueCagr3y = cagr(revenueA, 3);
    raws.epsCagr3y = cagr(epsA, 3);
    raws.fcfCagr3y = cagr(fcfA, 3);

    var currentTtmRevenue = sumWindow(revenueQ, 0, 4), priorTtmRevenue = sumWindow(revenueQ, 4, 4);
    if (finite(currentTtmRevenue) && finite(priorTtmRevenue) && priorTtmRevenue > 0) {
      raws.revenueGrowthTtmYoy = currentTtmRevenue / priorTtmRevenue - 1;
    }
    var revenueGrowthCurrent = null, revenueGrowthPrior = null;
    if (revenueA.length >= 3) {
      var twoBack = revenueA[revenueA.length - 3], oneBack = revenueA[revenueA.length - 2],
        latest = revenueA[revenueA.length - 1];
      if (oneBack.value > 0 && twoBack.value > 0) {
        revenueGrowthCurrent = latest.value / oneBack.value - 1;
        revenueGrowthPrior = oneBack.value / twoBack.value - 1;
        raws.revenueGrowthAcceleration = revenueGrowthCurrent - revenueGrowthPrior;
      }
    }

    /* ------------------------------------------------------------ Value */
    if (finite(marketCap) && marketCap > 0) {
      if (fcfT) raws.fcfYield = fcfT.value / marketCap;
      if (netIncomeT) raws.earningsYield = netIncomeT.value / marketCap;
      if (finite(latestEquity)) raws.bookToMarket = latestEquity / marketCap;
      var enterpriseValue = netDebtT ? marketCap + netDebtT.value : null;
      if (finite(enterpriseValue) && enterpriseValue > 0) {
        if (revenueT) raws.salesYield = revenueT.value / enterpriseValue;
        if (ebitdaT) raws.ebitdaYield = ebitdaT.value / enterpriseValue;
      }
    }

    /* ---------------------------------------------------- Profitability */
    if (grossT && finite(averageAssets) && averageAssets > 0) raws.grossProfitabilityTtm = grossT.value / averageAssets;
    if (fcfT && revenueT && revenueT.value > 0) raws.fcfMarginTtm = fcfT.value / revenueT.value;
    if (operatingIncomeT && revenueT && revenueT.value > 0 && operatingIncomeT.end === revenueT.end) {
      raws.operatingMarginTtm = operatingIncomeT.value / revenueT.value;
    }
    if (netIncomeT && finite(averageAssets) && averageAssets > 0) raws.roaTtm = netIncomeT.value / averageAssets;

    /* ------------------------------------- Inputs der Branchenvorlagen
     *
     * Eine Bank, ein Versicherer und ein REIT werden nicht mit Rohertrag je
     * Bilanzsumme und Nettoverschuldung gemessen - deshalb sind die
     * generischen Formeln fuer sie NOT_APPLICABLE. Was sie stattdessen
     * brauchen, steht in denselben Abschluessen, die sie schon
     * veroeffentlichen; gemessen ueber die 974 Titel im Branchentor:
     * Bilanzsumme und Eigenkapital 99-100 %, Jahresergebnis 98-100 %,
     * operativer Zahlungsfluss 98-100 %, Vorsteuerergebnis 78-100 %.
     *
     * Die Werte hier sind Rohwerte, keine Vorlage. Welche Vorlage welchen
     * davon benutzt und mit welchem Gewicht, entscheidet der Vertrag.
     * Niemand bekommt eine Kennzahl unter falschem Namen: es gibt kein FFO,
     * weil die Gewinne aus Immobilienverkaeufen in den Exporten nicht
     * vorkommen und ein FFO ohne sie kein FFO ist. */
    if (netIncomeT && finite(latestEquity) && latestEquity > 0) raws.roeTtm = netIncomeT.value / latestEquity;
    if (pretaxT && finite(averageAssets) && averageAssets > 0) raws.pretaxRoaTtm = pretaxT.value / averageAssets;
    if (ocfT && finite(averageAssets) && averageAssets > 0) raws.cashReturnOnAssets = ocfT.value / averageAssets;
    if (netIncomeT && revenueT && revenueT.value > 0 && netIncomeT.end === revenueT.end) {
      raws.netMarginTtm = netIncomeT.value / revenueT.value;
    }
    if (ocfT && revenueT && revenueT.value > 0 && ocfT.end === revenueT.end) {
      raws.ocfMarginTtm = ocfT.value / revenueT.value;
    }

    /* Jahresrendite auf die Bilanzsumme, auf dem Stichtag gepaart. Sie
       traegt zwei Vorlagenkomponenten: den Median als Niveau und die
       Streuung als Verlaesslichkeit. */
    var assetsByEnd = byEnd(assetsA);
    var annualRoa = netIncomeA.map(function (entry) {
      var assets = assetsByEnd.get(entry.end);
      return finite(assets) && assets > 0 ? { end: entry.end, value: entry.value / assets } : null;
    }).filter(Boolean);
    if (annualRoa.length >= 3) raws.roaMedian3y = median(annualRoa.slice(-3).map(function (e) { return e.value; }));
    var roaWindow = annualRoa.slice(-5);
    if (roaWindow.length >= 4) {
      var roaMedian = median(roaWindow.map(function (e) { return e.value; }));
      raws.roaStability5y = median(roaWindow.map(function (e) { return Math.abs(e.value - roaMedian); }));
    }
    /* Jahre mit Gewinn statt Jahre mit positivem freien Zahlungsfluss: fuer
       einen Kreditgeber ist das Verlustjahr das Ereignis, das zaehlt. */
    if (netIncomeA.length >= 4) {
      raws.positiveEarningsYears = netIncomeA.slice(-5).filter(function (e) { return e.value > 0; }).length;
    }

    /* Die Dividende kommt aus der Jahresreihe: `dividends_paid` hat in den
       Exporten kein TTM-Fenster und wird als positiver Betrag gemeldet -
       gemessen an WSBCO 2023-2025 (82,3 / 87,4 / 125,2 Mio USD). Ein
       Abschluss, dessen Stichtag mehr als 400 Tage vor der berichteten
       Periode liegt, ist keine laufende Ausschuettung mehr und faellt unter
       derselben Regel heraus wie ein veralteter Bestand. */
    var dividendEntry = dividendsA.length ? periodAligned(dividendsA[dividendsA.length - 1], referenceEnd) : null;
    var dividend = dividendEntry && dividendEntry.value > 0 ? dividendEntry.value : null;
    if (finite(dividend) && ocfT && ocfT.value > 0) raws.dividendCoverageByOcf = ocfT.value / dividend;

    if (finite(marketCap) && marketCap > 0) {
      if (pretaxT) raws.pretaxEarningsYield = pretaxT.value / marketCap;
      if (ocfT) raws.cashFlowYield = ocfT.value / marketCap;
      if (finite(dividend)) raws.dividendYield = dividend / marketCap;
    }

    var ttmTaxRate = taxT && pretaxT ? effectiveTaxRate(taxT.value, pretaxT.value) : null;
    if (operatingIncomeT && finite(ttmTaxRate) && debtT && cashT && finite(latestEquity)) {
      var ttmRoic = roic(operatingIncomeT.value, ttmTaxRate, debtT.value, latestEquity, cashT.value);
      if (finite(ttmRoic)) {
        raws.roicTtm = ttmRoic;
        raws.effectiveTaxRateTtm = ttmTaxRate;
      }
    }

    /* Annual ROIC, again paired on the closing date across five series. */
    var opByEnd = byEnd(operatingIncomeA), taxByEnd = byEnd(taxA), pretaxByEnd = byEnd(pretaxA),
      debtByEnd = byEnd(debtA), cashByEnd = byEnd(cashA), equityByEnd = byEnd(equityA);
    var annualRoic = [];
    operatingIncomeA.slice(-3).forEach(function (entry) {
      var rate = effectiveTaxRate(taxByEnd.get(entry.end), pretaxByEnd.get(entry.end));
      var value = roic(entry.value, rate, debtByEnd.get(entry.end), equityByEnd.get(entry.end), cashByEnd.get(entry.end));
      if (finite(value)) annualRoic.push(value);
    });
    if (annualRoic.length >= 3) raws.roicMedian3y = median(annualRoic);

    /* ---------------------------------------------------- Change inputs */
    var currentTtmGross = sumWindow(grossQ, 0, 4), priorTtmGross = sumWindow(grossQ, 4, 4),
      currentTtmFcf = sumWindow(fcfQ, 0, 4), priorTtmFcf = sumWindow(fcfQ, 4, 4);
    var change = {
      revenueGrowthAcceleration: finite(raws.revenueGrowthAcceleration) ? raws.revenueGrowthAcceleration : null,
      revenueGrowthCurrent: revenueGrowthCurrent,
      revenueGrowthPrior: revenueGrowthPrior,
      grossMarginTtm: finite(currentTtmGross) && finite(currentTtmRevenue) && currentTtmRevenue > 0 ? currentTtmGross / currentTtmRevenue : null,
      grossMarginPriorTtm: finite(priorTtmGross) && finite(priorTtmRevenue) && priorTtmRevenue > 0 ? priorTtmGross / priorTtmRevenue : null,
      fcfMarginTtm: finite(currentTtmFcf) && finite(currentTtmRevenue) && currentTtmRevenue > 0 ? currentTtmFcf / currentTtmRevenue : null,
      fcfMarginPriorTtm: finite(priorTtmFcf) && finite(priorTtmRevenue) && priorTtmRevenue > 0 ? priorTtmFcf / priorTtmRevenue : null
    };

    return {
      version: VERSION,
      raws: raws,
      change: change,
      shares: periodAligned(ttmValue(doc, "shares_outstanding", cutoff), referenceEnd),
      availableAt: filedDates.length ? filedDates.slice().sort().pop() : null,
      /* Ein Datum, nicht zwei. Fuer die 4.110 Titel mit Umsatz-TTM ist das
         gemessen derselbe Tag wie bisher; die 80 Dokumente, deren
         Umsatzreihe frueher endet als ihre uebrigen Reihen, nennen jetzt
         den juengsten berichteten Stichtag statt des aeltesten - eine Seite
         darf nicht "Stand 2017" sagen, waehrend sie gegen 2025 rechnet. */
      fundamentalsAsOf: referenceEnd,
      referenceEnd: referenceEnd,
      /* Ebenso die Historientiefe: sie speist `historyDepth` in der
         Konfidenz. Ohne Umsatzreihe zaehlt sie die Geschaeftsjahre, fuer
         die das Dokument ueberhaupt eine Kernzahl fuehrt - vorher war das
         fuer eine Bank mit zwoelf Abschluessen die Zahl 0. */
      annualYears: revenueA.length || fiscalYearCount([netIncomeA, ocfA, assetsA, equityA, pretaxA, epsA])
    };
  }

  /* WELCHE ROHWERTE AM BOERSENWERT HAENGEN.
   *
   * Der Materialisierer muss das wissen, um einer fehlenden Bewertung den
   * richtigen Grund zu geben. Erst stand die Frage an der Formelzeile des
   * Vertrags - und die ist Prosa: dort heisst es "market capitalization" und
   * "enterprise value", nicht `marketCap`. Die Pruefung fand deshalb genau
   * die Komponenten, die ich selbst mit dem Wort geschrieben hatte, und
   * verfehlte alle generischen: T, SO, GOOG und GOOGL sagten weiter
   * "Eingabe nicht materialisiert", obwohl der Boersenwert zurueckgehalten
   * wurde.
   *
   * Die Liste steht deshalb dort, wo die Abhaengigkeit wirklich entsteht -
   * im Block, der nur mit einem Boersenwert rechnet -, und ein Test leitet
   * sie aus dem VERHALTEN ab: einmal mit und einmal ohne Boersenwert
   * rechnen und die Schluessel vergleichen. Eine Liste, die von ihrem Code
   * abdriftet, faellt damit auf. */
  var MARKET_CAP_DEPENDENT_RAWS = ["fcfYield", "earningsYield", "bookToMarket", "salesYield",
    "ebitdaYield", "pretaxEarningsYield", "cashFlowYield", "dividendYield"];

  var api = {
    MARKET_CAP_DEPENDENT_RAWS: MARKET_CAP_DEPENDENT_RAWS.slice(),
    VERSION: VERSION,
    CONSUMER_SCHEMA: CONSUMER_SCHEMA,
    COL: Object.assign({}, COL),
    STALE_INSTANT_DAYS: STALE_INSTANT_DAYS,
    annualSeries: annualSeries,
    quarterSeries: quarterSeries,
    newestFiled: newestFiled,
    ttmValue: ttmValue,
    periodAligned: periodAligned,
    cagr: cagr,
    sumWindow: sumWindow,
    median: median,
    effectiveTaxRate: effectiveTaxRate,
    roic: roic,
    compute: compute
  };

  if (isNode) module.exports = api;
  else global.VUFundamentalInputs = api;
})(typeof window !== "undefined" ? window : globalThis);
