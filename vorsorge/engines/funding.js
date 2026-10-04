/* =========================================================================
   VISION UNIVERSE VORSORGE — funding.js   (vorsorge-funding-1.0.0)

   Regelwerk-Engine fuer staatliche Foerderung. Kein Betrag steht im Code:
   jede Zahl kommt aus einer versionierten Regeldatei unter
   vorsorge/data/funding-rules/ (validFrom, validUntil, ruleSource,
   ruleVersion, incomeRules, childRules, contributionRules, maximumFunding).

   Die Engine waehlt die Regel, die an einem Stichtag gilt, und rechnet sie
   durch. Jede Ausgabe nennt Regelversion, Rechtsstand und Quelle - die
   Oberflaeche zeigt sie mit an.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var VERSION = "vorsorge-funding-1.0.0";

  function n(x) { var v = Number(x); return Number.isFinite(v) ? v : 0; }
  function pos(x) { return Math.max(0, n(x)); }

  /* Pruefsumme ueber die rechnerisch relevanten Teile einer Regeldatei.
     Aendert jemand einen Betrag ohne neue Version, faellt es hier auf. */
  var HASHED = ["validFrom", "validUntil", "contributionRules", "incomeRules", "childRules", "bonusRules", "maximumFunding", "taxRules", "productRules", "payoutRules"];
  function stable(v) {
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}";
    return JSON.stringify(v === undefined ? null : v);
  }
  function ruleHash(rules) {
    var str = stable(HASHED.map(function (k) { return [k, rules[k]]; }));
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < str.length; i++) { h1 ^= str.charCodeAt(i); h1 = Math.imul(h1, 16777619); h2 = Math.imul(h2 ^ str.charCodeAt(i), 2246822519); }
    return "fnv-" + ("0000000" + (h1 >>> 0).toString(16)).slice(-8) + ("0000000" + (h2 >>> 0).toString(16)).slice(-8);
  }

  /** Pflichtfelder einer Regeldatei. Fehlt eines, wird die Datei abgelehnt. */
  function validateRules(rules) {
    var errors = [];
    if (!rules || typeof rules !== "object") return ["NO_RULES"];
    ["schemaVersion", "ruleId", "ruleVersion", "validFrom", "ruleSource", "maximumFunding", "legalStatus", "country", "jurisdiction", "status", "verification"].forEach(function (k) {
      if (!(k in rules)) errors.push("MISSING_" + k);
    });
    if (rules.validFrom && !/^\d{4}-\d{2}-\d{2}$/.test(rules.validFrom)) errors.push("INVALID_validFrom");
    if (rules.validUntil && rules.validUntil < rules.validFrom) errors.push("INVALID_RANGE");
    if (!Array.isArray(rules.ruleSource) || !rules.ruleSource.length) errors.push("NO_SOURCE");
    if (rules.verification && rules.verification.primaryVerified === true && !rules.primarySource) errors.push("PRIMARY_VERIFIED_WITHOUT_PRIMARY_SOURCE");
    if (rules.ruleHash && rules.ruleHash !== ruleHash(rules)) errors.push("RULE_HASH_MISMATCH");
    return errors;
  }

  /** Regel, die am Stichtag gilt (juengste validFrom <= date <= validUntil). */
  function selectRule(ruleSets, ruleId, date) {
    var d = date || new Date().toISOString().slice(0, 10);
    var matches = (ruleSets || []).filter(function (r) {
      return r && r.ruleId === ruleId && validateRules(r).length === 0 && r.validFrom <= d && (!r.validUntil || d <= r.validUntil);
    });
    matches.sort(function (a, b) { return a.validFrom < b.validFrom ? 1 : -1; });
    return matches[0] || null;
  }

  function meta(rules) {
    return { ruleId: rules.ruleId, ruleVersion: rules.ruleVersion, legalStatus: rules.legalStatus, status: rules.status || null,
      verification: rules.verification || null, primarySource: rules.primarySource || null, ruleHash: rules.ruleHash || null, validFrom: rules.validFrom, validUntil: rules.validUntil || null,
      sources: rules.ruleSource };
  }

  function tiered(amount, tiers) {
    var total = 0;
    (tiers || []).forEach(function (t) {
      var part = Math.max(0, Math.min(amount, t.to) - t.from);
      total += part * t.rate;
    });
    return total;
  }

  /**
   * Gefoerdertes Altersvorsorgedepot.
   * input: ownContribution (Jahr), children [{ age, hasChildBenefit, contribution }],
   *        age (bei Vertragsbeginn), firstContract (bool)
   */
  function altersvorsorgedepot(rules, input) {
    input = input || {};
    var own = pos(input.ownContribution);
    var cr = rules.contributionRules || {};
    var out = { version: VERSION, rule: meta(rules), ownContribution: own, eligible: own >= n(cr.minimumAnnualOwnContribution) };
    if (!out.eligible) {
      out.basicAllowance = 0; out.childAllowance = 0; out.careerStarterBonus = 0; out.total = 0;
      out.reason = "Eigenbeitrag unter dem Mindestbeitrag von " + n(cr.minimumAnnualOwnContribution) + " € pro Jahr.";
      return out;
    }
    var subsidized = Math.min(own, n(cr.maximumSubsidizedOwnContribution) || own);
    var ba = rules.incomeRules.basicAllowance;
    out.subsidizedContribution = subsidized;
    out.basicAllowance = Math.min(n(ba.maximum) || Infinity, tiered(subsidized, ba.tiers));
    if (input.indirectSpouse && rules.incomeRules.indirectSpouseMaximum) out.basicAllowance = Math.min(out.basicAllowance, n(rules.incomeRules.indirectSpouseMaximum));
    var cRule = (rules.childRules || {}).perChild || null;
    out.children = (input.children || []).map(function (c) {
      if (!cRule) return { allowance: 0, reason: "Keine Kinderregel." };
      if (cRule.requiresChildBenefit && c.hasChildBenefit === false) return { allowance: 0, reason: "Kein Kindergeldanspruch." };
      var contrib = c.contribution === undefined ? own : pos(c.contribution);
      if (cRule.contributionBase) contrib = Math.min(contrib, n(cRule.contributionBase));
      return { allowance: Math.min(n(cRule.maximum), contrib * n(cRule.rate)) };
    });
    out.childAllowance = out.children.reduce(function (a, c) { return a + c.allowance; }, 0);
    var bonus = (rules.bonusRules || {}).careerStarter;
    out.careerStarterBonus = bonus && input.firstContract && n(input.age) > 0 && n(input.age) < n(bonus.maxAgeExclusive) ? n(bonus.amount) : 0;
    out.total = out.basicAllowance + out.childAllowance + out.careerStarterBonus;
    out.fundingRate = own > 0 ? (out.basicAllowance + out.childAllowance) / own : 0;
    return out;
  }

  /**
   * Riester (Bestandslogik).
   * input: ownContribution, previousYearIncome, children [{ bornYear }], marginalTaxRate, age, firstContract
   */
  function riester(rules, input) {
    input = input || {};
    var own = pos(input.ownContribution);
    var cr = rules.contributionRules;
    var kids = (input.children || []).map(function (c) {
      return { bornYear: c.bornYear, allowance: n(c.bornYear) >= 2008 ? n(rules.childRules.bornFrom2008) : n(rules.childRules.bornBefore2008) };
    });
    var basic = n(rules.incomeRules.basicAllowance.fixed);
    var childSum = kids.reduce(function (a, k) { return a + k.allowance; }, 0);
    var bonus = rules.bonusRules && rules.bonusRules.careerStarter;
    var starter = bonus && input.firstContract && n(input.age) > 0 && n(input.age) < n(bonus.maxAgeExclusive) ? n(bonus.amount) : 0;
    var fullAllowances = basic + childSum;
    var required = Math.min(n(cr.minimumOwnContributionCap), n(cr.minimumOwnContributionRate) * pos(input.previousYearIncome)) - fullAllowances;
    required = Math.max(n(cr.baseContribution), required);
    var ratio = required > 0 ? Math.min(1, own / required) : 1;
    var allowances = fullAllowances * ratio;
    var tax = null;
    if (input.marginalTaxRate !== undefined && input.marginalTaxRate !== null) {
      var deductible = Math.min(n(rules.taxRules.specialExpensesDeductionCap), own + allowances);
      tax = Math.max(0, deductible * n(input.marginalTaxRate) - allowances);
    }
    return { version: VERSION, rule: meta(rules), ownContribution: own, minimumOwnContribution: required,
      allowanceRatio: ratio, basicAllowance: basic * ratio, childAllowance: childSum * ratio, children: kids,
      careerStarterBonus: starter, additionalTaxBenefit: tax,
      total: allowances + starter + (tax || 0),
      reducedBecause: ratio < 1 ? "Mindesteigenbeitrag von " + Math.round(required) + " € nicht erreicht – Zulagen werden anteilig gekürzt." : null };
  }

  /**
   * Fruehstart: staatlicher Monatsbeitrag ab fromAge bis untilAgeExclusive.
   * Liefert die Jahre und Summen fuer ein Kind eines bestimmten Alters.
   */
  function fruehstart(rules, input) {
    input = input || {};
    var cr = rules.childRules;
    var age = pos(input.childAge);
    var refYear = Math.round(n(input.referenceYear) || 2027);
    var birthYear = input.birthYear ? Math.round(n(input.birthYear)) : refYear - Math.round(age);
    if (cr.eligibleBirthYearFrom && birthYear < n(cr.eligibleBirthYearFrom)) {
      return { version: VERSION, rule: meta(rules), monthly: n(cr.stateContributionMonthly), years: 0, startAge: null, endAge: n(cr.untilAgeExclusive), total: 0, birthYear: birthYear,
        eligible: false, reason: "Nach dem Gesetzentwurf erhalten nur Kinder ab Geburtsjahrgang " + cr.eligibleBirthYearFrom + " eine staatliche Einzahlung." };
    }
    var startAge = Math.max(age, n(cr.fromAge));
    var years = Math.max(0, n(cr.untilAgeExclusive) - startAge);
    return { version: VERSION, rule: meta(rules), monthly: n(cr.stateContributionMonthly), years: years, eligible: years > 0, birthYear: birthYear,
      startAge: startAge, endAge: n(cr.untilAgeExclusive), total: years * 12 * n(cr.stateContributionMonthly) };
  }

  /**
   * Vermoegen eines Kindes zu Zielaltern: staatlicher Beitrag (Jahre laut
   * Regel) + Elternbeitrag, verzinst mit der Annahme.
   */
  function childWealthPath(rules, input, M) {
    input = input || {};
    var age = Math.round(pos(input.childAge));
    var r = (1 + n(input.annualReturn)) * (1 - n(input.annualCost)) - 1;
    var m = Math.pow(1 + r, 1 / 12) - 1;
    var cr = rules ? rules.childRules : null;
    if (cr && cr.eligibleBirthYearFrom) {
      var by = input.birthYear ? Math.round(n(input.birthYear)) : Math.round(n(input.referenceYear) || 2027) - age;
      if (by < n(cr.eligibleBirthYearFrom)) cr = null;
    }
    var targets = (input.targetAges || [18, 30, 50, 67]).filter(function (t) { return t > age; });
    var v = pos(input.start), state = 0, parent = 0, path = {}, maxT = Math.max.apply(null, targets.concat([age]));
    for (var a = age; a < maxT; a++) {
      for (var mo = 0; mo < 12; mo++) {
        var s = cr && a >= n(cr.fromAge) && a < n(cr.untilAgeExclusive) ? n(cr.stateContributionMonthly) : 0;
        var p = a < n(input.parentUntilAge || 18) ? pos(input.parentMonthly) : 0;
        v = v * (1 + m) + s + p; state += s; parent += p;
      }
      if (targets.indexOf(a + 1) !== -1) path[a + 1] = { value: v, state: state, parent: parent };
    }
    return { version: VERSION, rule: rules ? meta(rules) : null, path: path, targets: targets };
  }

  var api = { VERSION: VERSION, ruleHash: ruleHash, validateRules: validateRules, selectRule: selectRule, tiered: tiered,
    altersvorsorgedepot: altersvorsorgedepot, riester: riester, fruehstart: fruehstart, childWealthPath: childWealthPath };
  if (isNode) module.exports = api;
  else { global.VUVorsorge = global.VUVorsorge || {}; global.VUVorsorge.Funding = api; }
})(typeof window !== "undefined" ? window : globalThis);
