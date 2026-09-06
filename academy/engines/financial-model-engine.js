/* =========================================================================
   VISION UNIVERSE ACADEMY — Financial Model Engine (financial-model-engine.js)

   Reine Berechnungsschicht, ohne DOM-/Browser-Abhaengigkeit (Node und
   Browser lauffaehig), analog zu macro/calc.js. Kennt keine UI, keine
   redaktionellen Texte, keine Farben.

   Deckt die "Follow the Money"-Experience ab (Revenue -> Gross Profit ->
   Operating Income -> Net Income -> Operating Cash Flow -> Free Cash Flow)
   und ist bewusst so geschnitten, dass spaetere Experiences (ROIC, DCF,
   Reverse DCF, Earnings Quality) dieselbe Engine erweitern koennen, statt
   eine neue zu erfinden.

   Vereinfachungen (bewusst, siehe Methodology in data.json):
   - Kein Fremdkapital/Zinsaufwand, keine Financing-Cashflows.
   - Days-Annahmen (Receivable/Inventory/Payable) gelten fuer Year 0 und
     Year 1 gleichermassen, damit die Working-Capital-Veraenderung isoliert
     den Wachstumseffekt zeigt statt eine zusaetzliche freie Variable zu sein.
   - Ein einzelner Steuersatz auf operatives Ergebnis (keine Verlustvortraege,
     keine latenten Steuern).
   ========================================================================= */
(function (global) {
  "use strict";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---- Standardannahmen (Ausgangszustand des Demo-Unternehmens) ----------
  var DEFAULT_ASSUMPTIONS = {
    baseRevenue: 1000,       // Year 0 Umsatz, fixer Ankerwert des Demo-Modells
    revenueGrowth: 0.18,     // Year 0 -> Year 1
    grossMargin: 0.46,
    opexPctRevenue: 0.27,    // SG&A/R&D, OHNE D&A
    daPctRevenue: 0.04,      // Depreciation & Amortization
    sbcPctRevenue: 0.035,    // Stock-Based Compensation (non-cash)
    capexPctRevenue: 0.07,
    daysReceivable: 58,
    daysInventory: 50,
    daysPayable: 42,
    taxRate: 0.25
  };

  // Sinnvolle Wertebereiche fuer Slider/Inputs. Verhindert nicht jede
  // unrealistische Kombination, aber grenzt den Explorationsraum ein
  // (Research-Regel: "unrealistische Kombinationen verhindern oder
  // kennzeichnen").
  var ASSUMPTION_RANGES = {
    revenueGrowth: { min: -0.20, max: 0.60, step: 0.01 },
    grossMargin: { min: 0.10, max: 0.85, step: 0.01 },
    opexPctRevenue: { min: 0.05, max: 0.60, step: 0.01 },
    daPctRevenue: { min: 0.00, max: 0.15, step: 0.005 },
    sbcPctRevenue: { min: 0.00, max: 0.15, step: 0.005 },
    capexPctRevenue: { min: 0.00, max: 0.30, step: 0.005 },
    daysReceivable: { min: 0, max: 150, step: 1 },
    daysInventory: { min: 0, max: 150, step: 1 },
    daysPayable: { min: 0, max: 150, step: 1 },
    taxRate: { min: 0, max: 0.45, step: 0.01 }
  };

  function normalizeAssumptions(overrides) {
    var out = {};
    var key;
    for (key in DEFAULT_ASSUMPTIONS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_ASSUMPTIONS, key)) continue;
      var v = overrides && isNum(overrides[key]) ? overrides[key] : DEFAULT_ASSUMPTIONS[key];
      var range = ASSUMPTION_RANGES[key];
      out[key] = range ? clamp(v, range.min, range.max) : v;
    }
    return out;
  }

  // ---- Income Statement fuer einen einzelnen Umsatz-Level ----------------
  function computeIncomeStatement(revenue, a) {
    var grossProfit = revenue * a.grossMargin;
    var cogs = revenue - grossProfit;
    var opex = revenue * a.opexPctRevenue;
    var da = revenue * a.daPctRevenue;
    var operatingIncome = grossProfit - opex - da;
    var taxes = Math.max(0, operatingIncome) * a.taxRate;
    var netIncome = operatingIncome - taxes;
    return {
      revenue: revenue, cogs: cogs, grossProfit: grossProfit,
      opex: opex, da: da, operatingIncome: operatingIncome,
      taxes: taxes, netIncome: netIncome
    };
  }

  // ---- Working Capital (Balance-Sheet-Naeherung aus Days-Annahmen) ------
  function computeWorkingCapital(revenue, cogs, a) {
    var ar = revenue * a.daysReceivable / 365;
    var inventory = cogs * a.daysInventory / 365;
    var ap = cogs * a.daysPayable / 365;
    return { ar: ar, inventory: inventory, ap: ap, net: ar + inventory - ap };
  }

  // ---- Gesamtmodell: Year 0 (Baseline) -> Year 1 (mit Annahmen) ----------
  function computeModel(overrides) {
    var a = normalizeAssumptions(overrides);

    var revenue0 = a.baseRevenue;
    var revenue1 = revenue0 * (1 + a.revenueGrowth);

    var is0 = computeIncomeStatement(revenue0, a);
    var is1 = computeIncomeStatement(revenue1, a);

    var wc0 = computeWorkingCapital(revenue0, is0.cogs, a);
    var wc1 = computeWorkingCapital(revenue1, is1.cogs, a);
    var deltaWC = wc1.net - wc0.net; // Anstieg = Cash-Verbrauch

    var sbc = revenue1 * a.sbcPctRevenue;
    var capex = revenue1 * a.capexPctRevenue;

    var cfo = is1.netIncome + is1.da + sbc - deltaWC;
    var fcf = cfo - capex;

    var metrics = {
      grossMarginPct: revenue1 > 0 ? is1.grossProfit / revenue1 : null,
      operatingMarginPct: revenue1 > 0 ? is1.operatingIncome / revenue1 : null,
      netMarginPct: revenue1 > 0 ? is1.netIncome / revenue1 : null,
      fcfMarginPct: revenue1 > 0 ? fcf / revenue1 : null,
      cashConversion: is1.netIncome !== 0 ? cfo / is1.netIncome : null,
      workingCapitalDragPctRevenue: revenue1 > 0 ? deltaWC / revenue1 : null
    };

    return {
      assumptions: a,
      year0: { incomeStatement: is0, workingCapital: wc0 },
      year1: { incomeStatement: is1, workingCapital: wc1 },
      bridge: {
        netIncome: is1.netIncome,
        da: is1.da,
        sbc: sbc,
        deltaWC: deltaWC,
        cfo: cfo,
        capex: capex,
        fcf: fcf
      },
      metrics: metrics
    };
  }

  var api = {
    DEFAULT_ASSUMPTIONS: DEFAULT_ASSUMPTIONS,
    ASSUMPTION_RANGES: ASSUMPTION_RANGES,
    isNum: isNum,
    clamp: clamp,
    normalizeAssumptions: normalizeAssumptions,
    computeIncomeStatement: computeIncomeStatement,
    computeWorkingCapital: computeWorkingCapital,
    computeModel: computeModel
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.FinancialModelEngine = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
