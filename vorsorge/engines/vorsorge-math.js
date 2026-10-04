/* =========================================================================
   VISION UNIVERSE VORSORGE — vorsorge-math.js   (vorsorge-math-1.0.0)

   Die eine Rechenstelle der Produktsaeule Vorsorge. Alles, was ein Ziel,
   eine Sparrate, Kosten oder eine Entnahme berechnet, laeuft hier durch -
   kein Bildschirm rechnet selbst.

   KONVENTIONEN (verbindlich, in der Oberflaeche erklaert)

   - Monatliche Verzinsung. Ein Jahreszins R wird geometrisch in einen
     Monatszins umgerechnet: m = (1 + R)^(1/12) - 1.
   - Kosten (TER, Depot, Produkt) wirken als laufender Abzug vom
     Vermoegen: Nettojahresrendite = (1 + R) * (1 - Kosten) - 1.
   - Sparraten werden am Monatsende eingezahlt (nachschuessig).
     Startvermoegen und Einmalanlage liegen ab Tag 0 im Depot.
   - Inflation diskontiert nominale Endwerte auf heutige Kaufkraft.
   - Keine Zufallszahl ohne Saat: goalProbability() nutzt einen fest
     geseedeten Generator, damit dieselbe Eingabe dasselbe Ergebnis gibt.
   - Keine Prognose. Jede Funktion rechnet eine Annahme durch; die
     Oberflaeche zeigt immer mehrere Szenarien.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var VERSION = "vorsorge-math-1.0.0";

  function num(x, fallback) {
    var v = Number(x);
    return Number.isFinite(v) ? v : (fallback === undefined ? 0 : fallback);
  }
  function pos(x) { return Math.max(0, num(x)); }

  /** Nettojahresrendite nach laufenden Kosten. */
  function netAnnualReturn(annualReturn, annualCost) {
    return (1 + num(annualReturn)) * (1 - num(annualCost)) - 1;
  }
  /** Jahreszins -> Monatszins (geometrisch). Rendite <= -100 % wird abgefangen. */
  function monthlyRate(annual) {
    var a = num(annual);
    if (a <= -1) return -1;
    return Math.pow(1 + a, 1 / 12) - 1;
  }

  /**
   * Endvermoegen.
   * @param {object} p  start, monthly, lumpSum, years, annualReturn, annualCost
   * @returns {object}  { nominal, invested, gain, months }
   */
  function futureValue(p) {
    p = p || {};
    var n = Math.round(pos(p.years) * 12);
    var start = pos(p.start) + pos(p.lumpSum);
    var pmt = pos(p.monthly);
    var m = monthlyRate(netAnnualReturn(p.annualReturn, p.annualCost));
    var g = Math.pow(1 + m, n);
    var fv = Math.abs(m) < 1e-12 ? start + pmt * n : start * g + pmt * (g - 1) / m;
    var invested = start + pmt * n;
    return { nominal: fv, invested: invested, gain: fv - invested, months: n, monthlyRate: m };
  }

  /** Kaufkraft eines Betrags in `years` Jahren, ausgedrueckt in heutigen Euro. */
  function inflationAdjustedValue(value, years, inflation) {
    return num(value) / Math.pow(1 + num(inflation), pos(years));
  }
  /** Nominaler Betrag, den man in `years` Jahren fuer heutige Kaufkraft braucht. */
  function inflate(value, years, inflation) {
    return num(value) * Math.pow(1 + num(inflation), pos(years));
  }

  function realFutureValue(p) {
    var fv = futureValue(p);
    var real = inflationAdjustedValue(fv.nominal, p.years, p.inflation);
    return { nominal: fv.nominal, real: real, invested: fv.invested, purchasingPowerLoss: fv.nominal - real };
  }

  /**
   * Benoetigte monatliche Sparrate fuer ein nominales Ziel.
   * 0, wenn das Startvermoegen allein reicht. null, wenn keine Laufzeit.
   */
  function requiredSavingsRate(p) {
    p = p || {};
    var n = Math.round(pos(p.years) * 12);
    if (n <= 0) return null;
    var target = pos(p.target);
    var start = pos(p.start) + pos(p.lumpSum);
    var m = monthlyRate(netAnnualReturn(p.annualReturn, p.annualCost));
    var g = Math.pow(1 + m, n);
    var missing = target - start * g;
    if (missing <= 0) return 0;
    return Math.abs(m) < 1e-12 ? missing / n : missing * m / (g - 1);
  }

  /** Barwert einer monatlichen Rente ueber `years` Jahre (Kapitalbedarf). */
  function requiredCapital(p) {
    p = p || {};
    var n = Math.round(pos(p.years) * 12);
    var pay = pos(p.monthlyIncome);
    var m = monthlyRate(p.annualReturn);
    if (n <= 0) return 0;
    if (Math.abs(m) < 1e-12) return pay * n;
    return pay * (1 - Math.pow(1 + m, -n)) / m;
  }

  /** Gleichbleibende monatliche Entnahme, die ein Kapital in `years` Jahren aufbraucht. */
  function retirementIncome(p) {
    p = p || {};
    var n = Math.round(pos(p.years) * 12);
    var c = pos(p.capital);
    var m = monthlyRate(p.annualReturn);
    if (n <= 0) return 0;
    if (Math.abs(m) < 1e-12) return c / n;
    return c * m / (1 - Math.pow(1 + m, -n));
  }

  /**
   * Entnahmeplan Monat fuer Monat. Entnahme waechst optional mit der Inflation.
   * @returns {object} { path:[{year, capital}], depletedAfterMonths|null, remaining }
   */
  function withdrawalScenario(p) {
    p = p || {};
    var c = pos(p.capital), w = pos(p.monthlyWithdrawal);
    var m = monthlyRate(p.annualReturn);
    var infl = num(p.inflation), indexed = p.indexToInflation !== false;
    var maxMonths = Math.round(pos(p.years || 40) * 12);
    var path = [{ year: 0, capital: c }];
    var depleted = null;
    for (var i = 1; i <= maxMonths; i++) {
      var wi = indexed ? w * Math.pow(1 + infl, Math.floor((i - 1) / 12)) : w;
      c = c * (1 + m) - wi;
      if (c <= 0) { c = 0; if (depleted === null) depleted = i; }
      if (i % 12 === 0) path.push({ year: i / 12, capital: c });
      if (c === 0) { if (i % 12 !== 0) path.push({ year: Math.ceil(i / 12), capital: 0 }); break; }
    }
    return { path: path, depletedAfterMonths: depleted, remaining: c };
  }

  /**
   * Kostenwirkung zweier Kostenquoten bei sonst gleichen Annahmen.
   * costsAbsolute: Vermoegensdifferenz gegenueber einem kostenfreien Pfad.
   * directFees:    tatsaechlich abgezogene Kosten (Summe der Monatsabzuege).
   * lostCompounding: costsAbsolute - directFees (entgangener Zinseszins).
   */
  function feeImpact(p) {
    p = p || {};
    function run(cost) {
      var n = Math.round(pos(p.years) * 12);
      var mGross = monthlyRate(p.annualReturn);
      var mCost = 1 - Math.pow(1 - num(cost), 1 / 12);
      var v = pos(p.start) + pos(p.lumpSum), fees = 0;
      for (var i = 0; i < n; i++) {
        v = v * (1 + mGross);
        var f = v * mCost;
        fees += f; v -= f;
        v += pos(p.monthly);
      }
      return { value: v, directFees: fees };
    }
    var free = run(0);
    function side(cost) {
      var r = run(cost);
      var costsAbs = free.value - r.value;
      return {
        annualCost: num(cost), endValue: r.value, directFees: r.directFees,
        costsAbsolute: costsAbs, costsRelative: free.value > 0 ? costsAbs / free.value : 0,
        lostCompounding: costsAbs - r.directFees
      };
    }
    var a = side(p.costA), b = side(p.costB);
    return { withoutCosts: free.value, a: a, b: b, difference: a.endValue - b.endValue };
  }

  /* --------------------------------------------- Zielwahrscheinlichkeit
     Deterministische Monte-Carlo-Simulation mit fester Saat. Jahresrenditen
     lognormal mit Erwartungswert annualReturn und Schwankung volatility.
     Ergebnis ist ausdruecklich eine Modellrechnung, keine Wahrscheinlichkeit
     im Sinne einer Vorhersage. */
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gaussian(rand) {
    var u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function goalProbability(p) {
    p = p || {};
    var years = Math.round(pos(p.years));
    var target = pos(p.target);
    var vol = pos(p.volatility);
    var paths = Math.max(100, Math.min(20000, Math.round(num(p.paths, 2000))));
    if (years <= 0) return { probability: (pos(p.start) >= target ? 1 : 0), paths: 0, percentiles: null, seed: 0 };
    var mu = netAnnualReturn(p.annualReturn, p.annualCost);
    // lognormal: E[1+r] = 1+mu; sigma_ln aus vol
    var sLn = Math.sqrt(Math.log(1 + (vol * vol) / Math.pow(1 + mu, 2)));
    var mLn = Math.log(1 + mu) - sLn * sLn / 2;
    var rand = mulberry32(num(p.seed, 20270101));
    var yearlyContribution = pos(p.monthly) * 12;
    var results = [], hits = 0;
    for (var k = 0; k < paths; k++) {
      var v = pos(p.start) + pos(p.lumpSum);
      for (var y = 0; y < years; y++) {
        var g = Math.exp(mLn + sLn * gaussian(rand));
        // Sparraten des Jahres verzinsen sich im Mittel ein halbes Jahr
        v = v * g + yearlyContribution * Math.sqrt(g);
      }
      results.push(v);
      if (v >= target) hits++;
    }
    results.sort(function (a, b) { return a - b; });
    function q(x) { return results[Math.min(results.length - 1, Math.floor(x * results.length))]; }
    return { probability: hits / paths, paths: paths, seed: num(p.seed, 20270101),
      percentiles: { p10: q(0.1), p50: q(0.5), p90: q(0.9) } };
  }

  /* ------------------------------------------------------- Szenarien */
  var DEFAULT_SCENARIOS = [
    { id: "konservativ", label: "Konservativ", annualReturn: 0.03 },
    { id: "basis", label: "Basis", annualReturn: 0.05 },
    { id: "optimistisch", label: "Optimistisch", annualReturn: 0.07 }
  ];

  /**
   * Vorsorgeplan: alle Kennzahlen fuer mehrere Renditeannahmen.
   * Eingaben in heutigen Euro; Wunscheinkommen ebenfalls in heutiger Kaufkraft.
   */
  function plan(input, scenarios) {
    var p = normalizePlanInput(input);
    var years = Math.max(0, p.targetAge - p.age);
    var list = (scenarios && scenarios.length ? scenarios : DEFAULT_SCENARIOS).map(function (s) {
      var r = s.annualReturn;
      var fv = futureValue({ start: p.start, lumpSum: p.lumpSum, monthly: p.monthly, years: years, annualReturn: r, annualCost: p.cost });
      var real = inflationAdjustedValue(fv.nominal, years, p.inflation);
      // Entnahme: reale Rendite in der Auszahlphase = (1+r_net)/(1+i)-1
      var netR = netAnnualReturn(r, p.cost);
      var realPayout = (1 + netR) / (1 + p.inflation) - 1;
      var income = retirementIncome({ capital: real, years: p.payoutYears, annualReturn: realPayout });
      var gapMonthly = Math.max(0, p.desiredIncome - p.existingIncome);
      var needCapital = requiredCapital({ monthlyIncome: gapMonthly, years: p.payoutYears, annualReturn: realPayout });
      var attainment = needCapital > 0 ? real / needCapital : (gapMonthly === 0 ? 1 : 0);
      var neededNominal = inflate(needCapital, years, p.inflation);
      var reqRate = requiredSavingsRate({ target: neededNominal, start: p.start, lumpSum: p.lumpSum, years: years, annualReturn: r, annualCost: p.cost });
      return {
        id: s.id, label: s.label, annualReturn: r,
        nominal: fv.nominal, real: real, invested: fv.invested, gain: fv.gain,
        purchasingPowerLoss: fv.nominal - real,
        monthlyIncomeReal: income,
        requiredCapitalReal: needCapital,
        goalAttainment: attainment,
        gapMonthlyReal: Math.max(0, gapMonthly - income),
        requiredMonthly: reqRate
      };
    });
    return { version: VERSION, input: p, years: years, scenarios: list };
  }

  function normalizePlanInput(i) {
    i = i || {};
    var age = Math.round(num(i.age, 35));
    var targetAge = Math.round(num(i.targetAge, 67));
    return {
      age: age, targetAge: Math.max(age, targetAge),
      start: pos(i.start), lumpSum: pos(i.lumpSum), monthly: pos(i.monthly),
      cost: Math.min(0.2, pos(i.cost)), inflation: num(i.inflation, 0.02),
      desiredIncome: pos(i.desiredIncome), existingIncome: pos(i.existingIncome),
      payoutYears: Math.max(1, Math.round(num(i.payoutYears, 25)))
    };
  }

  /**
   * Vorsorgeluecke: Wunscheinkommen minus erwartete Einkuenfte (heutige Euro),
   * daraus Kapitalbedarf und Sparrate - fuer Start heute, in 5 und in 10 Jahren.
   */
  function retirementGap(input) {
    var p = normalizePlanInput(input);
    var r = num(input && input.annualReturn, 0.05);
    var years = Math.max(0, p.targetAge - p.age);
    var gapMonthly = Math.max(0, p.desiredIncome - p.existingIncome);
    var netR = netAnnualReturn(r, p.cost);
    var realPayout = (1 + netR) / (1 + p.inflation) - 1;
    var capitalReal = requiredCapital({ monthlyIncome: gapMonthly, years: p.payoutYears, annualReturn: realPayout });
    var capitalNominal = inflate(capitalReal, years, p.inflation);
    var starts = [0, 5, 10].map(function (delay) {
      var y = years - delay;
      if (y <= 0) return { delayYears: delay, years: 0, monthly: null, possible: false, totalPaid: null };
      // Startvermoegen waechst in der Wartezeit ohne Sparrate weiter
      var startGrown = futureValue({ start: p.start + p.lumpSum, years: delay, annualReturn: r, annualCost: p.cost }).nominal;
      var monthly = requiredSavingsRate({ target: capitalNominal, start: startGrown, years: y, annualReturn: r, annualCost: p.cost });
      return { delayYears: delay, years: y, monthly: monthly, possible: true, totalPaid: monthly * y * 12 };
    });
    return {
      version: VERSION, gapMonthlyReal: gapMonthly,
      gapMonthlyNominalAtRetirement: inflate(gapMonthly, years, p.inflation),
      requiredCapitalReal: capitalReal, requiredCapitalNominal: capitalNominal,
      annualReturn: r, years: years, starts: starts,
      delayCost: starts[1].possible && starts[0].monthly !== null ? starts[1].monthly - starts[0].monthly : null
    };
  }

  /**
   * Welche Stellschraube wirkt am staerksten? Jede Stellschraube wird um einen
   * vergleichbaren, realistischen Schritt bewegt; gemessen wird die Aenderung
   * der Zielerreichung im Basisszenario.
   */
  function leverAnalysis(input, baseReturn) {
    var r = num(baseReturn, 0.05);
    var sc = [{ id: "basis", label: "Basis", annualReturn: r }];
    var base = plan(input, sc).scenarios[0].goalAttainment;
    var p = normalizePlanInput(input);
    var levers = [
      { id: "sparrate", label: "Sparrate +50 €", change: { monthly: p.monthly + 50 } },
      { id: "laenger", label: "2 Jahre länger sparen", change: { targetAge: p.targetAge + 2 } },
      { id: "kosten", label: "Kosten −0,5 %-Punkte", change: { cost: Math.max(0, p.cost - 0.005) } },
      { id: "einmal", label: "Einmalanlage +5.000 €", change: { lumpSum: p.lumpSum + 5000 } }
    ].map(function (l) {
      var next = plan(Object.assign({}, p, l.change), sc).scenarios[0].goalAttainment;
      return { id: l.id, label: l.label, delta: next - base, attainment: next };
    });
    levers.sort(function (a, b) { return b.delta - a.delta; });
    return { base: base, levers: levers };
  }

  var api = {
    VERSION: VERSION, DEFAULT_SCENARIOS: DEFAULT_SCENARIOS,
    netAnnualReturn: netAnnualReturn, monthlyRate: monthlyRate,
    futureValue: futureValue, realFutureValue: realFutureValue,
    inflationAdjustedValue: inflationAdjustedValue, inflate: inflate,
    requiredSavingsRate: requiredSavingsRate, requiredCapital: requiredCapital,
    retirementIncome: retirementIncome, withdrawalScenario: withdrawalScenario,
    feeImpact: feeImpact, goalProbability: goalProbability,
    plan: plan, retirementGap: retirementGap, leverAnalysis: leverAnalysis,
    normalizePlanInput: normalizePlanInput
  };
  if (isNode) module.exports = api;
  else { global.VUVorsorge = global.VUVorsorge || {}; global.VUVorsorge.Math = api; }
})(typeof window !== "undefined" ? window : globalThis);
