/* =========================================================================
   VISION UNIVERSE VORSORGE — rechner.js   (vorsorge-rechner-1.0.0)

   Rechenkern des gefuehrten Altersvorsorge-Rechners (#/rechner).
   Keine Betraege im Code: Zulagen kommen aus der Regeldatei
   (funding.js#altersvorsorgedepot), der Grenzsteuersatz aus
   data/steuer-annahmen.json (gekennzeichnete Annahme), Renditen aus dem Plan.

   Eingabe: { birthYear, band, children:[{birthYear}], monthly }
   Ausgabe: Zulagen, moeglicher Steuervorteil, Gesamt je Jahr und
            Vermoegen im Zielalter in drei Szenarien.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var VERSION = "vorsorge-rechner-1.0.0";
  var Fd = isNode ? require("./funding.js") : global.VUVorsorge.Funding;
  var M = isNode ? require("./vorsorge-math.js") : global.VUVorsorge.Math;

  var KINDERGELD_UNTIL_AGE = 18; // vereinfachend: Kindergeld bis zur Volljaehrigkeit (Ausbildungsverlaengerung nicht modelliert)

  function n(x) { var v = Number(x); return Number.isFinite(v) ? v : 0; }

  /** Grenzsteuersatz der gewaehlten Einkommensspanne (Annahme-Datei). */
  function marginalRate(assumptions, bandId) {
    var b = ((assumptions && assumptions.bands) || []).filter(function (x) { return x.id === bandId; })[0];
    return b ? n(b.marginalRate) : null;
  }

  /**
   * Steuervorteil: Sonderausgabenabzug bis zum Deckel zuzueglich Zulage,
   * abzueglich der gezahlten Zulage (sie darf nicht doppelt wirken).
   * Nie negativ - dann bleibt es bei der Zulage (Guenstigerpruefung).
   */
  function taxBenefit(rules, ownContribution, allowances, rate) {
    var cap = n(rules.taxRules && rules.taxRules.specialExpensesDeductionCap);
    var deductible = Math.min(n(ownContribution), cap) + n(allowances);
    var gross = deductible * n(rate);
    return { deductible: deductible, rate: n(rate), benefit: Math.max(0, gross - n(allowances)) };
  }

  /** Kinder, die am Stichtag noch Kindergeld erhalten koennen (Geburtsjahr -> Alter). */
  function eligibleChildren(children, referenceYear) {
    return (children || []).map(function (c) {
      var age = n(referenceYear) - n(c.birthYear);
      return { birthYear: c.birthYear, age: age, hasChildBenefit: age >= 0 && age < KINDERGELD_UNTIL_AGE };
    });
  }

  /**
   * input: { birthYear, band, children:[{birthYear}], monthly, firstContract }
   * ctx:   { rules (Altersvorsorgedepot), assumptions, plan (VS.state.plan), referenceYear, targetAge }
   */
  function calculate(input, ctx) {
    input = input || {}; ctx = ctx || {};
    var ref = Math.round(n(ctx.referenceYear) || 2027);
    var age = Math.max(0, ref - Math.round(n(input.birthYear)));
    var targetAge = Math.round(n(ctx.targetAge) || 67);
    var years = Math.max(1, targetAge - age);
    var monthly = Math.max(0, n(input.monthly));
    var own = monthly * 12;
    var kids = eligibleChildren(input.children, ref);
    var fund = Fd.altersvorsorgedepot(ctx.rules, {
      ownContribution: own, age: age, firstContract: input.firstContract !== false,
      children: kids.map(function (k) { return { hasChildBenefit: k.hasChildBenefit }; })
    });
    var rate = marginalRate(ctx.assumptions, input.band);
    var allowance = n(fund.basicAllowance) + n(fund.childAllowance);
    var tax = rate === null ? null : taxBenefit(ctx.rules, own, allowance, rate);
    var plan = ctx.plan || {};
    var returns = plan.returns || { konservativ: 0.03, basis: 0.05, optimistisch: 0.07 };
    var scenarios = [["konservativ", "Konservativ"], ["basis", "Basis"], ["optimistisch", "Optimistisch"]].map(function (s) {
      var fv = M.futureValue({ start: n(fund.careerStarterBonus), monthly: (own + allowance) / 12, years: years, annualReturn: n(returns[s[0]]), annualCost: n(plan.cost) });
      return { id: s[0], label: s[1], annualReturn: n(returns[s[0]]), nominal: fv.nominal, real: M.inflationAdjustedValue(fv.nominal, years, n(plan.inflation)), invested: fv.invested };
    });
    var base = scenarios[1];
    var curve = [];
    for (var y = 0; y <= years; y++) {
      curve.push(M.futureValue({ start: n(fund.careerStarterBonus), monthly: (own + allowance) / 12, years: y, annualReturn: n(returns.basis), annualCost: n(plan.cost) }).nominal);
    }
    return {
      version: VERSION, rule: fund.rule, age: age, targetAge: targetAge, years: years, monthly: monthly, ownContribution: own,
      eligible: fund.eligible, reason: fund.reason || null, children: kids,
      basicAllowance: n(fund.basicAllowance), childAllowance: n(fund.childAllowance), careerStarterBonus: n(fund.careerStarterBonus),
      allowance: allowance, allowanceMonthly: allowance / 12, fundingRate: n(fund.fundingRate),
      tax: tax, taxBenefit: tax ? tax.benefit : null,
      totalPerYear: allowance + (tax ? tax.benefit : 0),
      subsidizedLimitMonthly: n(ctx.rules.contributionRules.maximumSubsidizedOwnContribution) / 12,
      scenarios: scenarios, wealth: base.nominal, wealthRange: [scenarios[0].nominal, scenarios[2].nominal], curve: curve
    };
  }

  var api = { VERSION: VERSION, marginalRate: marginalRate, taxBenefit: taxBenefit, eligibleChildren: eligibleChildren, calculate: calculate };
  if (isNode) module.exports = api;
  else { global.VUVorsorge = global.VUVorsorge || {}; global.VUVorsorge.Rechner = api; }
})(typeof window !== "undefined" ? window : globalThis);
