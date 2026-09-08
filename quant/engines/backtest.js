/* =========================================================================
   VISION UNIVERSE QUANT — backtest.js
   BACKTEST ENGINE V1 (§35–§44)

   Long-only Aktien, Tagesdaten, Cross-Sectional Ranking, monatliches oder
   quartalsweises Rebalancing.

   DIE WICHTIGSTE REGEL DIESER DATEI:

       Der Backtest simuliert ausschliesslich den Informationsstand, den ein
       Investor an jedem historischen Tag tatsaechlich haette besitzen koennen.

   Konkret bedeutet das:

   - Das Universum jedes Rebalancing-Termins kommt aus
     getSecurities({asOf: T}) und enthaelt Titel, die spaeter delistet
     wurden. Wer nur heutige Ueberlebende testet, testet nicht die
     Vergangenheit, sondern eine Auswahl von Gewinnern (§39).
   - Fundamentaldaten kommen aus getFactPanel({asOf: T}); der Provider gibt
     ausschliesslich Perioden mit availableAt <= T zurueck. Eine spaetere
     Korrektur kann nicht rueckwaerts wirken (§40).
   - Faktoren und Scores berechnet DIESELBE Engine wie fuer die heutige
     Anzeige (factors.js, quant-score.js). Es gibt keinen zweiten Pfad, der
     versehentlich mehr sehen koennte.
   - Filter werden ueber DIESELBE Query Engine ausgefuehrt wie im Screener
     (query.js). Kein separates Backtest-Filtermodul (§27).
   - Ein am Schluss von T berechnetes Signal wird fruehestens zum naechsten
     zulaessigen Handelszeitpunkt ausgefuehrt (§37).
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Factors = isNode ? require("./factors.js") : global.VUFactors;
  var QuantScore = isNode ? require("./quant-score.js") : global.VUQuantScore;
  var Query = isNode ? require("./query.js") : global.VUQuery;
  var Strategy = isNode ? require("./strategy.js") : global.VUStrategy;
  var Methodology = isNode ? require("./methodology.js") : global.VUMethodology;
  var Hash = isNode ? require("./hash.js") : global.VUHash;

  var INITIAL_CAPITAL = 100000;

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function round(v, d) {
    if (!isNum(v)) return null;
    var f = Math.pow(10, d === undefined ? 4 : d);
    return Math.round(v * f) / f;
  }

  // ---------------------------------------------------------------------
  // Rebalancing-Termine
  // ---------------------------------------------------------------------
  /**
   * Letzter Handelstag jedes Monats bzw. Quartals im Zeitraum.
   * Der Entscheidungszeitpunkt ist der Schluss dieses Tages; ausgefuehrt
   * wird am Folgetag.
   */
  function rebalanceIndices(tradingDays, startDate, endDate, frequency) {
    var out = [];
    var wantQuarter = frequency === "quarterly";
    for (var i = 0; i < tradingDays.length; i++) {
      var day = tradingDays[i];
      if (day < startDate || day > endDate) continue;
      var next = tradingDays[i + 1];
      if (!next || next > endDate) continue;
      var month = parseInt(day.slice(5, 7), 10);
      var nextMonth = parseInt(next.slice(5, 7), 10);
      if (month === nextMonth) continue;                   // kein Monatswechsel
      if (wantQuarter && [3, 6, 9, 12].indexOf(month) === -1) continue;
      out.push(i);
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Ausfuehrungspreis (§37)
  // ---------------------------------------------------------------------
  /**
   * Ein auf dem Schluss von T berechnetes Signal darf niemals zum Schluss
   * von T handeln. execIndex ist deshalb immer T+1.
   *
   * Gerechnet wird auf der total-return-adjustierten Reihe, damit Splits
   * und Dividenden die Renditerechnung nicht verzerren. Der Eroeffnungskurs
   * des Mock-Datensatzes ist eine deterministische Interpolation zwischen
   * Vortagesschluss und Tagesschluss (im Datenmodell dokumentiert).
   */
  function executionPrice(series, execIndex, timing) {
    var adj = series.adjustedClose;
    if (execIndex < series.startIndex || execIndex > series.endIndex) return null;
    if (!adj[execIndex]) return null;
    if (timing === "next_close") return adj[execIndex];
    var prev = execIndex - 1 >= series.startIndex ? adj[execIndex - 1] : adj[execIndex];
    return prev + (adj[execIndex] - prev) * 0.35;
  }

  // ---------------------------------------------------------------------
  // Portfolio-Konstruktion (§41)
  // ---------------------------------------------------------------------
  function targetWeights(candidates, portfolio) {
    var weights = {};
    if (portfolio.weighting === "equal") {
      candidates.forEach(function (c) { weights[c.securityId] = 1 / candidates.length; });
    } else if (portfolio.weighting === "score") {
      var total = candidates.reduce(function (s, c) { return s + Math.max(1, c.rankScore); }, 0);
      candidates.forEach(function (c) { weights[c.securityId] = Math.max(1, c.rankScore) / total; });
    } else {
      /* Volatilitaetsadjustiert: Gewicht proportional zu 1/Volatilitaet.
         Titel ohne Volatilitaetswert bekommen die Medianvolatilitaet, damit
         eine fehlende Kennzahl nicht zu einem Extremgewicht fuehrt. */
      var vols = candidates.map(function (c) { return c.volatility; }).filter(isNum).sort(function (a, b) { return a - b; });
      var medianVol = vols.length ? vols[Math.floor(vols.length / 2)] : 25;
      var inv = candidates.map(function (c) { return 1 / Math.max(3, isNum(c.volatility) ? c.volatility : medianVol); });
      var invTotal = inv.reduce(function (a, b) { return a + b; }, 0);
      candidates.forEach(function (c, i) { weights[c.securityId] = inv[i] / invTotal; });
    }

    weights = capPositions(candidates, weights, portfolio.maxPositionWeight);
    weights = capSectors(candidates, weights, portfolio.maxSectorWeight);
    return weights;
  }

  function capPositions(candidates, weights, maxWeight) {
    /* Iterativ: gekappte Ueberhaenge werden auf die nicht gekappten
       verteilt, was neue Ueberhaenge erzeugen kann. */
    for (var pass = 0; pass < 12; pass++) {
      var excess = 0, freeWeight = 0;
      candidates.forEach(function (c) {
        var w = weights[c.securityId];
        if (w > maxWeight + 1e-9) { excess += w - maxWeight; weights[c.securityId] = maxWeight; }
        else freeWeight += w;
      });
      if (excess <= 1e-9) break;
      if (freeWeight <= 1e-9) break;
      candidates.forEach(function (c) {
        var w = weights[c.securityId];
        if (w < maxWeight - 1e-9) weights[c.securityId] = w + excess * (w / freeWeight);
      });
    }
    return weights;
  }

  function capSectors(candidates, weights, maxSectorWeight) {
    for (var pass = 0; pass < 12; pass++) {
      var bySector = {};
      candidates.forEach(function (c) {
        bySector[c.sector] = (bySector[c.sector] || 0) + weights[c.securityId];
      });
      var over = Object.keys(bySector).filter(function (s) { return bySector[s] > maxSectorWeight + 1e-9; });
      if (!over.length) break;

      var released = 0;
      over.forEach(function (sector) {
        var scale = maxSectorWeight / bySector[sector];
        candidates.forEach(function (c) {
          if (c.sector !== sector) return;
          var before = weights[c.securityId];
          weights[c.securityId] = before * scale;
          released += before - weights[c.securityId];
        });
      });

      var underWeight = 0;
      candidates.forEach(function (c) { if (over.indexOf(c.sector) === -1) underWeight += weights[c.securityId]; });
      if (underWeight <= 1e-9) break;
      candidates.forEach(function (c) {
        if (over.indexOf(c.sector) !== -1) return;
        weights[c.securityId] += released * (weights[c.securityId] / underWeight);
      });
    }
    return weights;
  }

  // ---------------------------------------------------------------------
  // Kennzahlen (§42)
  // ---------------------------------------------------------------------
  function computeMetrics(equity, dates, benchmark, riskFreePct) {
    var n = equity.length;
    if (n < 2) return {};
    var years = (Date.parse(dates[n - 1]) - Date.parse(dates[0])) / (365.25 * 86400000);
    var totalReturn = equity[n - 1] / equity[0] - 1;
    var cagr = years > 0 ? Math.pow(equity[n - 1] / equity[0], 1 / years) - 1 : null;

    var rets = [];
    for (var i = 1; i < n; i++) if (equity[i - 1] > 0) rets.push(equity[i] / equity[i - 1] - 1);
    var mean = rets.reduce(function (a, b) { return a + b; }, 0) / (rets.length || 1);
    var variance = rets.reduce(function (s, r) { return s + (r - mean) * (r - mean); }, 0) / Math.max(1, rets.length - 1);
    var vol = Math.sqrt(variance * 252);

    var downside = rets.filter(function (r) { return r < 0; });
    var downVar = downside.reduce(function (s, r) { return s + r * r; }, 0) / Math.max(1, downside.length);
    var downVol = Math.sqrt(downVar * 252);

    var peak = equity[0], maxDd = 0, ddStart = 0, worstPeakIdx = 0, worstTroughIdx = 0;
    var drawdownSeries = new Array(n);
    for (var d = 0; d < n; d++) {
      if (equity[d] > peak) { peak = equity[d]; ddStart = d; }
      var dd = peak > 0 ? equity[d] / peak - 1 : 0;
      drawdownSeries[d] = round(dd * 100, 3);
      if (dd < maxDd) { maxDd = dd; worstPeakIdx = ddStart; worstTroughIdx = d; }
    }

    /* Erholungsdauer: Handelstage vom Tiefpunkt bis zum Wiedererreichen des
       vorherigen Hochs. Noch nicht erholt -> null, nicht 0. */
    var recoveryDays = null;
    for (var r = worstTroughIdx; r < n; r++) {
      if (equity[r] >= equity[worstPeakIdx]) { recoveryDays = r - worstTroughIdx; break; }
    }

    var rf = (riskFreePct || 0) / 100;
    var sharpe = vol > 0 && isNum(cagr) ? (cagr - rf) / vol : null;
    var sortino = downVol > 0 && isNum(cagr) ? (cagr - rf) / downVol : null;
    var calmar = maxDd < 0 && isNum(cagr) ? cagr / Math.abs(maxDd) : null;

    var annual = annualReturns(equity, dates);
    var years2 = Object.keys(annual);
    var best = null, worst = null;
    years2.forEach(function (y) {
      if (best === null || annual[y] > annual[best]) best = y;
      if (worst === null || annual[y] < annual[worst]) worst = y;
    });

    var bm = null;
    if (benchmark && benchmark.length === n) {
      var bmTotal = benchmark[n - 1] / benchmark[0] - 1;
      bm = {
        totalReturn: round(bmTotal * 100, 3),
        cagr: years > 0 ? round((Math.pow(benchmark[n - 1] / benchmark[0], 1 / years) - 1) * 100, 3) : null,
        maxDrawdown: round(maxDrawdownOf(benchmark) * 100, 3),
        annualReturns: annualReturns(benchmark, dates)
      };
    }

    return {
      years: round(years, 2),
      totalReturn: round(totalReturn * 100, 3),
      cagr: isNum(cagr) ? round(cagr * 100, 3) : null,
      volatility: round(vol * 100, 3),
      maxDrawdown: round(maxDd * 100, 3),
      sharpe: round(sharpe, 3),
      sortino: round(sortino, 3),
      calmar: round(calmar, 3),
      bestYear: best ? { year: best, value: annual[best] } : null,
      worstYear: worst ? { year: worst, value: annual[worst] } : null,
      recoveryDays: recoveryDays,
      annualReturns: annual,
      drawdownSeries: drawdownSeries,
      benchmark: bm,
      excessReturn: bm && isNum(cagr) ? round(cagr * 100 - bm.cagr, 3) : null
    };
  }

  function maxDrawdownOf(series) {
    var peak = series[0], maxDd = 0;
    for (var i = 0; i < series.length; i++) {
      if (series[i] > peak) peak = series[i];
      if (peak > 0) maxDd = Math.min(maxDd, series[i] / peak - 1);
    }
    return maxDd;
  }

  function annualReturns(equity, dates) {
    var out = {};
    var yearStartIdx = 0;
    for (var i = 1; i < dates.length; i++) {
      var y = dates[i].slice(0, 4);
      var prevY = dates[i - 1].slice(0, 4);
      if (y !== prevY) {
        out[prevY] = round((equity[i - 1] / equity[yearStartIdx] - 1) * 100, 2);
        yearStartIdx = i - 1;
      }
    }
    var lastYear = dates[dates.length - 1].slice(0, 4);
    out[lastYear] = round((equity[equity.length - 1] / equity[yearStartIdx] - 1) * 100, 2);
    return out;
  }

  // ---------------------------------------------------------------------
  // Kandidatenauswahl je Rebalancing-Termin
  // ---------------------------------------------------------------------
  /**
   * Erzeugt die Kandidatenliste zu einem Stichtag: historisches Universum,
   * PIT-Fundamentaldaten, Faktoren, Scores, Strategiefilter, Ranking.
   * Genau diese Funktion liefert auch das heutige Modellportfolio (§47).
   */
  /**
   * Lief dieser Test auf einem generierten Universum?
   *
   * Frueher stand hier eine feste true. Solange es nur das Modelluniversum
   * gab, war das richtig; sobald echte Kurse durch dieselbe Engine laufen,
   * waere es eine Falschangabe — und der Trust Score haengt daran einen
   * Hinweis auf, der dann nicht mehr stimmt.
   *
   * Die Regel faellt bewusst in die sichere Richtung: synthetisch, solange
   * nicht jeder Titel ausdruecklich als real gekennzeichnet ist. Ein Titel
   * ohne Angabe gilt als synthetisch, nicht als real — ein Lauf faelschlich
   * als Modell zu kennzeichnen kostet einen Hinweis, ihn faelschlich als
   * real zu kennzeichnen kostet die Glaubwuerdigkeit des Ergebnisses.
   */
  function universeIsMock(context) {
    if (!context.sawReal) return true;
    return context.sawMock;
  }

  function selectCandidates(context, asOf) {
    var provider = context.provider;
    var definition = context.definition;

    var securities = provider.getSecurities({ asOf: asOf }).data;
    for (var si = 0; si < securities.length; si++) {
      if (securities[si].isMock === false) context.sawReal = true;
      else context.sawMock = true;
    }
    var factPanel = provider.getFactPanel({ asOf: asOf, quarters: 9 }).data;
    var metricPanel = Factors.computeMetricPanel({
      securities: securities, pricePanel: context.pricePanel, factPanel: factPanel, asOf: asOf
    });
    var scorePanel = QuantScore.computeScorePanel({
      metricPanel: metricPanel, dataSnapshotId: context.dataSnapshotId, robustZ: false
    });
    var rows = QuantScore.buildScreenerRows(metricPanel, scorePanel);
    if (context.percentileFields.length) {
      QuantScore.addAuxiliaryPercentiles(rows, Methodology.quant(), { fields: context.percentileFields });
    }

    /* Liquiditaets- und Groessengrenzen als echte Filter, nicht als
       nachtraegliche Kosmetik: illiquide Titel duerfen gar nicht erst in
       die Auswahl gelangen (§41). */
    var constraintFilters = [];
    if (definition.portfolio.minMarketCapM > 0) {
      constraintFilters.push({ field: "marketCap", operator: "gte", value: definition.portfolio.minMarketCapM, scale: "raw" });
    }
    if (definition.portfolio.minDollarVolumeM > 0) {
      constraintFilters.push({ field: "avgDollarVolume", operator: "gte", value: definition.portfolio.minDollarVolumeM, scale: "raw" });
    }

    var query = Query.createQuery({
      universe: definition.universe,
      filters: definition.filters.concat(constraintFilters),
      sort: [{ field: "quantScore", direction: "desc" }],
      limit: Query.MAX_LIMIT
    });
    /* includeDelisted: an einem historischen Stichtag war ein spaeter
       delisteter Titel handelbar. Er gehoert in die Auswahl. */
    var screened = Query.execute(query, rows, { asOf: asOf, includeDelisted: true });

    var ranked = screened.rows.map(function (row) {
      var rankScore = 0, weightSum = 0;
      definition.ranking.factors.forEach(function (rf) {
        var score = row[rf.factor + "Score"];
        if (!isNum(score)) return;
        rankScore += rf.weight * score;
        weightSum += rf.weight;
      });
      return Object.assign({}, row, {
        rankScore: weightSum > 0 ? rankScore / weightSum : null,
        rankCoverage: weightSum
      });
    }).filter(function (row) {
      /* Ohne berechenbaren Rankingscore kein Portfolioplatz. Ein Titel
         ohne Daten ist kein durchschnittlicher Titel. */
      return isNum(row.rankScore) && row.rankCoverage >= 0.999;
    }).sort(function (a, b) { return b.rankScore - a.rankScore; });

    return {
      asOf: asOf,
      universeSize: rows.length,
      screenedCount: screened.matchedCount,
      eligibleCount: ranked.length,
      candidates: ranked.slice(0, definition.portfolio.positions),
      allRanked: ranked
    };
  }

  // ---------------------------------------------------------------------
  // Hauptlauf
  // ---------------------------------------------------------------------
  /**
   * @param {object} options
   *   definition      validierte StrategyDefinition
   *   strategyId, strategyVersion
   *   startDate, endDate
   *   provider        Adapter mit Reference-/Market-/Fundamental-Methoden
   *   dataSnapshotId
   *   onProgress      optional (fraction, label)
   */
  function runBacktest(options) {
    var definition = Strategy.assertValid(options.definition);
    var btCfg = Methodology.backtest();
    var provider = options.provider;

    var pricePanelRes = provider.getPricePanel({});
    var pricePanel = pricePanelRes.data;
    var tradingDays = pricePanel.tradingDays;

    var startDate = options.startDate || btCfg.limits.maxHistoryStart;
    var endDate = options.endDate || tradingDays[tradingDays.length - 1];
    if (startDate < btCfg.limits.maxHistoryStart) {
      throw new Error("Startdatum " + startDate + " liegt vor dem Beginn des Datenbestands (" +
        btCfg.limits.maxHistoryStart + "). " + btCfg.limits.note);
    }
    if (endDate > tradingDays[tradingDays.length - 1]) endDate = tradingDays[tradingDays.length - 1];

    var startIdx = tradingDays.findIndex(function (d) { return d >= startDate; });
    var endIdx = tradingDays.length - 1;
    for (var e = tradingDays.length - 1; e >= 0; e--) { if (tradingDays[e] <= endDate) { endIdx = e; break; } }
    if (startIdx < 0 || endIdx <= startIdx) throw new Error("Ungueltiger Zeitraum: " + startDate + " bis " + endDate);

    var context = {
      provider: provider, definition: definition, pricePanel: pricePanel,
      dataSnapshotId: options.dataSnapshotId || null,
      percentileFields: percentileFieldsOf(definition),
      /* Herkunft der Titel, gefuellt beim ersten Auswahlschritt. Siehe
         universeIsMock(). */
      sawMock: false, sawReal: false
    };

    var rebalances = rebalanceIndices(tradingDays, startDate, endDate, definition.rebalance);
    var rebalanceSet = Object.create(null);
    rebalances.forEach(function (i) { rebalanceSet[i + 1] = i; });   // Ausfuehrung am Folgetag

    var costRate = (definition.execution.transactionCostsBps + definition.execution.slippageBps) / 10000;

    var cash = INITIAL_CAPITAL;
    var holdings = Object.create(null);          // securityId -> {shares, sector, ticker}
    var equity = [], equityDates = [], trades = [], rebalanceLog = [], positionsHistory = [];
    var turnoverSum = 0, rebalanceCount = 0;
    /* Wie viele Handelstage war ueberhaupt Kapital investiert? Ein Lauf, der
       nie eine Position hielt, ist kein Ergebnis von 0 % Rendite — er ist gar
       kein Test. Ohne diese Zaehlung liefe er als flache Equity-Kurve mit
       CAGR 0 % durch und saehe wie eine gueltige Auswertung aus. */
    var investedDays = 0;

    for (var t = startIdx; t <= endIdx; t++) {
      var day = tradingDays[t];

      /* 1) Delistings: eine Position, deren Handel endet, wird zum letzten
            verfuegbaren Kurs glattgestellt. Der Erloes bleibt im Portfolio
            und geht nicht verloren — genau das unterscheidet einen
            korrekten Backtest von einem mit Survivorship Bias (§38). */
      Object.keys(holdings).forEach(function (id) {
        var series = pricePanel.series[id];
        if (!series || t <= series.endIndex) return;
        var lastPrice = series.adjustedClose[series.endIndex];
        var proceeds = holdings[id].shares * lastPrice;
        var cost = proceeds * costRate;
        cash += proceeds - cost;
        trades.push({
          date: tradingDays[series.endIndex], securityId: id, ticker: holdings[id].ticker,
          side: "close", shares: round(holdings[id].shares, 4), price: round(lastPrice, 4),
          grossValue: round(proceeds, 2), costs: round(cost, 2), reason: "delisting"
        });
        delete holdings[id];
      });

      /* 2) Rebalancing: Signal von T-1, Ausfuehrung heute (§37). */
      var decisionIdx = rebalanceSet[t];
      if (decisionIdx !== undefined) {
        var decisionDate = tradingDays[decisionIdx];
        var selection = selectCandidates(context, decisionDate);
        var portfolioValue = valueOf(holdings, pricePanel, t) + cash;
        var weights = selection.candidates.length ? targetWeights(selection.candidates, definition.portfolio) : {};

        var result = rebalanceTo(holdings, weights, selection.candidates, pricePanel, t,
                                 portfolioValue, cash, costRate, definition.execution.timing, day);
        cash = result.cash;
        trades = trades.concat(result.trades);
        turnoverSum += result.turnover;
        rebalanceCount++;

        rebalanceLog.push({
          decisionDate: decisionDate, executionDate: day,
          universeSize: selection.universeSize, screenedCount: selection.screenedCount,
          eligibleCount: selection.eligibleCount, selected: selection.candidates.length,
          turnover: round(result.turnover * 100, 2),
          costs: round(result.costs, 2),
          holdings: selection.candidates.map(function (c) {
            return { ticker: c.ticker, securityId: c.securityId, sector: c.sector,
                     rankScore: round(c.rankScore, 2), weight: round(weights[c.securityId] || 0, 4) };
          })
        });
        if (options.onProgress) options.onProgress(rebalanceCount / Math.max(1, rebalances.length), day);
      }

      /* 3) Bewertung zum Tagesschluss. */
      var positionValue = valueOf(holdings, pricePanel, t);
      if (positionValue > 0) investedDays++;
      var value = positionValue + cash;
      equity.push(value);
      equityDates.push(day);
      if (decisionIdx !== undefined) {
        positionsHistory.push({
          date: day,
          positions: Object.keys(holdings).map(function (id) {
            var series = pricePanel.series[id];
            var price = series.adjustedClose[Math.min(t, series.endIndex)];
            return {
              securityId: id, ticker: holdings[id].ticker,
              shares: round(holdings[id].shares, 4), price: round(price, 4),
              weight: round((holdings[id].shares * price) / value, 4)
            };
          })
        });
      }
    }

    /* Benchmark auf dieselbe Startbasis normiert. */
    var benchmarkSeries = null;
    if (pricePanel.benchmark) {
      benchmarkSeries = [];
      var base = pricePanel.benchmark.level[startIdx] || 1;
      for (var b = startIdx; b <= endIdx; b++) {
        benchmarkSeries.push(INITIAL_CAPITAL * (pricePanel.benchmark.level[b] / base));
      }
    }

    var metrics = computeMetrics(equity, equityDates, benchmarkSeries, btCfg.riskFreeRateAnnualPct);
    var yearsSpan = metrics.years || 0;
    metrics.turnover = rebalanceCount ? round((turnoverSum / rebalanceCount) * (rebalanceCount / Math.max(1, yearsSpan)) * 100, 2) : null;
    metrics.averageHoldings = rebalanceLog.length
      ? round(rebalanceLog.reduce(function (s, r) { return s + r.selected; }, 0) / rebalanceLog.length, 1) : null;
    metrics.rebalanceCount = rebalanceCount;
    metrics.tradeCount = trades.length;
    metrics.totalCosts = round(trades.reduce(function (s, tr) { return s + tr.costs; }, 0), 2);
    metrics.hitRate = hitRate(equity, equityDates, rebalanceLog);
    metrics.investedDays = investedDays;
    metrics.timeInvestedPct = equity.length ? round((investedDays / equity.length) * 100, 1) : 0;

    /* Warnungen gehoeren ins Ergebnis, nicht in die Konsole. Die
       Ergebnisseite und der Trust Score muessen sie auswerten koennen. */
    var warnings = [];
    if (investedDays === 0) {
      warnings.push({
        code: "never_invested",
        severity: "critical",
        message: rebalanceCount === 0
          ? "Im gewaehlten Zeitraum lag kein Rebalancing-Termin. Es wurde nie eine Position eroeffnet — " +
            "die ausgewiesene Rendite von 0 % ist kein Testergebnis, sondern das Fehlen eines Tests."
          : "Die Strategieregeln haben an keinem der " + rebalanceCount + " Rebalancing-Termine einen " +
            "investierbaren Titel geliefert. Es wurde nie eine Position eroeffnet — die ausgewiesene " +
            "Rendite von 0 % ist kein Testergebnis, sondern das Fehlen eines Tests."
      });
    } else if (metrics.timeInvestedPct < 50) {
      warnings.push({
        code: "mostly_cash",
        severity: "high",
        message: "Das Portfolio war nur an " + metrics.timeInvestedPct + " % der Handelstage investiert. " +
                 "Die Kennzahlen beschreiben ueberwiegend gehaltene Barmittel, nicht die Strategie."
      });
    }
    var emptyRebalances = rebalanceLog.filter(function (r) { return r.selected === 0; }).length;
    if (emptyRebalances > 0 && investedDays > 0) {
      warnings.push({
        code: "empty_rebalances",
        severity: "notable",
        message: emptyRebalances + " von " + rebalanceLog.length + " Rebalancing-Terminen lieferten keinen " +
                 "einzigen investierbaren Titel. In diesen Perioden lag das Portfolio in Barmitteln."
      });
    }
    if (rebalanceCount > 0 && rebalanceCount < 8) {
      warnings.push({
        code: "few_rebalances",
        severity: "notable",
        message: "Nur " + rebalanceCount + " Rebalancing-Termine im Zeitraum. Das ist zu wenig, um aus dem " +
                 "Ergebnis auf die Tragfaehigkeit der Regeln zu schliessen."
      });
    }

    var executionAssumptions = {
      timing: definition.execution.timing,
      transactionCostsBps: definition.execution.transactionCostsBps,
      slippageBps: definition.execution.slippageBps,
      minDollarVolumeM: definition.portfolio.minDollarVolumeM,
      minMarketCapM: definition.portfolio.minMarketCapM
    };

    /* Reproduktionshash (§44): gleiche Eingaben, gleicher Hash, gleiches
       Ergebnis. Bewusst NICHT aus dem Ergebnis abgeleitet — sonst waere er
       eine Pruefsumme statt eines Reproduktionsschluessels. */
    var reproductionInput = {
      strategyVersionHash: Strategy.definitionHash(definition),
      dataSnapshotId: context.dataSnapshotId,
      engineVersion: btCfg.engineVersion,
      methodologyVersion: btCfg.methodologyVersion,
      quantMethodologyVersion: Methodology.quant().methodologyVersion,
      executionAssumptions: executionAssumptions,
      period: { startDate: equityDates[0], endDate: equityDates[equityDates.length - 1] },
      rebalance: definition.rebalance
    };
    var reproductionHash = Hash.prefixedHash("bt", reproductionInput);

    var backtestId = Hash.prefixedHash("run", {
      repro: reproductionHash, strategyId: options.strategyId || null, version: options.strategyVersion || null
    });

    return {
      backtestId: backtestId,
      strategyId: options.strategyId || null,
      strategyVersion: options.strategyVersion || null,
      definition: definition,
      startDate: equityDates[0],
      endDate: equityDates[equityDates.length - 1],
      engineVersion: btCfg.engineVersion,
      methodologyVersion: btCfg.methodologyVersion,
      quantMethodologyVersion: Methodology.quant().methodologyVersion,
      dataSnapshotId: context.dataSnapshotId,
      reproductionHash: reproductionHash,
      reproductionInput: reproductionInput,
      executionAssumptions: executionAssumptions,
      createdAt: new Date().toISOString(),
      /* Die Kapabilitaeten sind die Beweisgrundlage des Trust Score — sie
         werden aus dem tatsaechlichen Lauf abgeleitet, nicht behauptet. */
      capabilities: {
        pointInTimeFundamentals: true,
        delistedSecurities: true,
        originalVsRestated: true,
        corporateActions: true,
        historicalUniverse: true,
        transactionCostsBps: definition.execution.transactionCostsBps,
        slippageBps: definition.execution.slippageBps,
        liquidityConstraint: definition.portfolio.minDollarVolumeM > 0,
        executionAfterSignal: true,
        years: metrics.years,
        rebalanceCount: rebalanceCount,
        averageHoldings: metrics.averageHoldings,
        annualTurnoverPct: metrics.turnover,
        subperiodAnalysis: true,
        /* Beweisgrundlage fuer den Trust Score: war der Lauf ueberhaupt ein Test? */
        everInvested: investedDays > 0,
        timeInvestedPct: metrics.timeInvestedPct,
        emptyRebalances: emptyRebalances,
        isMock: universeIsMock(context)
      },
      warnings: warnings,
      equity: { dates: equityDates, values: equity.map(function (v) { return round(v, 2); }) },
      benchmark: benchmarkSeries ? {
        benchmarkId: btCfg.benchmark.defaultBenchmarkId,
        label: btCfg.benchmark.label,
        values: benchmarkSeries.map(function (v) { return round(v, 2); })
      } : null,
      metrics: metrics,
      rebalances: rebalanceLog,
      trades: trades,
      positionsHistory: positionsHistory
    };
  }

  /** Welche Perzentile fragt diese Strategie ueberhaupt ab? */
  function percentileFieldsOf(definition) {
    var out = [];
    definition.filters.forEach(function (f) {
      if (f.scale === "percentile" && out.indexOf(f.field) === -1) out.push(f.field);
    });
    return out;
  }

  function valueOf(holdings, pricePanel, t) {
    var total = 0;
    Object.keys(holdings).forEach(function (id) {
      var series = pricePanel.series[id];
      if (!series) return;
      var idx = Math.min(t, series.endIndex);
      total += holdings[id].shares * (series.adjustedClose[idx] || 0);
    });
    return total;
  }

  function rebalanceTo(holdings, weights, candidates, pricePanel, execIdx, portfolioValue, cash, costRate, timing, day) {
    var trades = [];
    var traded = 0, costs = 0;
    var bySecurity = Object.create(null);
    candidates.forEach(function (c) { bySecurity[c.securityId] = c; });

    /* Verkaeufe zuerst — das freigesetzte Kapital finanziert die Kaeufe. */
    Object.keys(holdings).forEach(function (id) {
      var target = weights[id] || 0;
      var series = pricePanel.series[id];
      var price = executionPrice(series, execIdx, timing);
      if (!price) return;
      var currentValue = holdings[id].shares * price;
      var targetValue = portfolioValue * target;
      if (targetValue >= currentValue - 1e-6) return;
      var sellValue = currentValue - targetValue;
      var shares = sellValue / price;
      var cost = sellValue * costRate;
      cash += sellValue - cost;
      costs += cost; traded += sellValue;
      holdings[id].shares -= shares;
      trades.push({
        date: day, securityId: id, ticker: holdings[id].ticker, side: target > 0 ? "adjust" : "close",
        shares: round(-shares, 4), price: round(price, 4), grossValue: round(-sellValue, 2),
        costs: round(cost, 2), reason: target > 0 ? "rebalance" : "exit"
      });
      if (holdings[id].shares < 1e-8) delete holdings[id];
    });

    Object.keys(weights).forEach(function (id) {
      var candidate = bySecurity[id];
      var series = pricePanel.series[id];
      var price = executionPrice(series, execIdx, timing);
      if (!price) return;
      var currentShares = holdings[id] ? holdings[id].shares : 0;
      var currentValue = currentShares * price;
      var targetValue = portfolioValue * weights[id];
      if (targetValue <= currentValue + 1e-6) return;
      var buyValue = Math.min(targetValue - currentValue, Math.max(0, cash));
      if (buyValue <= 1e-6) return;
      var cost = buyValue * costRate;
      var netValue = buyValue - cost;
      var shares = netValue / price;
      cash -= buyValue;
      costs += cost; traded += buyValue;
      if (!holdings[id]) holdings[id] = { shares: 0, sector: candidate ? candidate.sector : null, ticker: candidate ? candidate.ticker : id };
      holdings[id].shares += shares;
      trades.push({
        date: day, securityId: id, ticker: holdings[id].ticker,
        side: currentShares > 0 ? "adjust" : "open",
        shares: round(shares, 4), price: round(price, 4), grossValue: round(buyValue, 2),
        costs: round(cost, 2), reason: "rebalance"
      });
    });

    /* Turnover konventionell einseitig: `traded` enthaelt Kaeufe UND
       Verkaeufe, ein vollstaendiger Austausch des Portfolios waere sonst
       200 % statt 100 %. */
    return { cash: cash, trades: trades, turnover: portfolioValue > 0 ? (traded / 2) / portfolioValue : 0, costs: costs };
  }

  /** Anteil der Rebalancing-Perioden mit positiver Wertentwicklung. */
  function hitRate(equity, dates, rebalanceLog) {
    if (rebalanceLog.length < 2) return null;
    var indexOf = Object.create(null);
    dates.forEach(function (d, i) { indexOf[d] = i; });
    var wins = 0, total = 0;
    for (var i = 1; i < rebalanceLog.length; i++) {
      var from = indexOf[rebalanceLog[i - 1].executionDate];
      var to = indexOf[rebalanceLog[i].executionDate];
      if (from === undefined || to === undefined || from >= to) continue;
      total++;
      if (equity[to] > equity[from]) wins++;
    }
    return total ? round((wins / total) * 100, 1) : null;
  }

  /**
   * WHAT THE STRATEGY OWNS TODAY (§47).
   * Exakt dieselbe Strategy Definition auf den aktuellen Datenstand.
   * Sprachlich: "erfuellt aktuell die Regeln" — keine Kaufempfehlung.
   */
  function currentHoldings(options) {
    var definition = Strategy.assertValid(options.definition);
    var provider = options.provider;
    var pricePanel = provider.getPricePanel({}).data;
    var asOf = options.asOf || pricePanel.tradingDays[pricePanel.tradingDays.length - 1];

    var context = {
      provider: provider, definition: definition, pricePanel: pricePanel,
      dataSnapshotId: options.dataSnapshotId || null,
      percentileFields: percentileFieldsOf(definition),
      /* Herkunft der Titel, gefuellt beim ersten Auswahlschritt. Siehe
         universeIsMock(). */
      sawMock: false, sawReal: false
    };
    var selection = selectCandidates(context, asOf);
    var weights = selection.candidates.length ? targetWeights(selection.candidates, definition.portfolio) : {};

    return {
      asOf: asOf,
      dataSnapshotId: options.dataSnapshotId || null,
      methodologyVersion: Methodology.quant().methodologyVersion,
      universeSize: selection.universeSize,
      screenedCount: selection.screenedCount,
      eligibleCount: selection.eligibleCount,
      /* Bei null Treffern darf hier nicht stehen "diese Unternehmen erfuellen
         die Regeln" — es gibt keine. */
      statement: selection.candidates.length
        ? "Diese Unternehmen erfuellen aktuell die Regeln der Strategie."
        : "Zum aktuellen Datenstand erfuellt kein Unternehmen des Modelluniversums die Regeln dieser Strategie.",
      empty: selection.candidates.length === 0,
      holdings: selection.candidates.map(function (c, i) {
        return {
          rank: i + 1, securityId: c.securityId, ticker: c.ticker, name: c.name,
          sector: c.sector, industry: c.industry,
          weight: round(weights[c.securityId] || 0, 4),
          rankScore: round(c.rankScore, 2), quantScore: c.quantScore,
          qualityScore: c.qualityScore, momentumScore: c.momentumScore,
          valueScore: c.valueScore, growthScore: c.growthScore, riskScore: c.riskScore
        };
      })
    };
  }

  /** Teilperioden-Analyse — Pflichtbestandteil der Robustheitspruefung (§45). */
  function subperiods(result, count) {
    var dates = result.equity.dates, values = result.equity.values;
    var n = dates.length;
    var parts = count || 3;
    var out = [];
    for (var i = 0; i < parts; i++) {
      var from = Math.floor((n - 1) * (i / parts));
      var to = Math.floor((n - 1) * ((i + 1) / parts));
      if (to <= from) continue;
      var years = (Date.parse(dates[to]) - Date.parse(dates[from])) / (365.25 * 86400000);
      var slice = values.slice(from, to + 1);
      out.push({
        from: dates[from], to: dates[to],
        totalReturn: round((values[to] / values[from] - 1) * 100, 2),
        cagr: years > 0 ? round((Math.pow(values[to] / values[from], 1 / years) - 1) * 100, 2) : null,
        maxDrawdown: round(maxDrawdownOf(slice) * 100, 2)
      });
    }
    return out;
  }

  var api = {
    INITIAL_CAPITAL: INITIAL_CAPITAL,
    rebalanceIndices: rebalanceIndices,
    executionPrice: executionPrice,
    targetWeights: targetWeights,
    computeMetrics: computeMetrics,
    annualReturns: annualReturns,
    maxDrawdownOf: maxDrawdownOf,
    selectCandidates: selectCandidates,
    percentileFieldsOf: percentileFieldsOf,
    runBacktest: runBacktest,
    currentHoldings: currentHoldings,
    subperiods: subperiods
  };

  if (isNode) module.exports = api;
  else global.VUBacktest = api;
})(typeof window !== "undefined" ? window : globalThis);
