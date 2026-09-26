import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Inputs = require("../engines/fundamental-inputs.js");

/* A consumer document in the shape the SEC layer publishes: compact rows in
   ROW_COLUMNS order (fy, fp, end, value, filed, accession, derived). */
const row = (fy, end, value, filed) => [fy, "FY", end, value, filed, "acc-" + fy, 0];
const quarter = (end, value, filed) => [null, "Q", end, value, filed, "acc-" + end, 0];
const ttm = (end, value, filed, extra = {}) => ({ fp: "TTM", end, v: value, filed, unit: "USD", kind: "TTM", ...extra });

function doc(overrides = {}) {
  const years = [
    [2022, "2022-12-31", "2023-02-15"],
    [2023, "2023-12-31", "2024-02-15"],
    [2024, "2024-12-31", "2025-02-15"],
    [2025, "2025-12-31", "2026-02-15"]
  ];
  const series = (values) => years.map(([fy, end, filed], index) => row(fy, end, values[index], filed));
  return {
    schema: "vu-consumer-fundamentals-1.0.0",
    cik: "0000000001",
    annual: {
      revenue: series([900, 1000, 1200, 1500]),
      operating_income: series([180, 200, 250, 300]),
      income_tax_expense: series([36, 40, 50, 60]),
      pretax_income: series([160, 180, 230, 280]),
      total_debt: series([500, 500, 500, 500]),
      stockholders_equity: series([700, 800, 900, 1000]),
      cash_and_equivalents: series([100, 100, 100, 100]),
      total_assets: series([1900, 2000, 2100, 2200]),
      free_cash_flow: series([80, 90, 110, 130]),
      eps_diluted: series([0.9, 1.0, 1.2, 1.5])
    },
    quarterly: {
      revenue: ["2024-06-30", "2024-09-30", "2024-12-31", "2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"]
        .map((end, index) => quarter(end, 300 + index * 10, "2026-02-15"))
    },
    ttm: {
      revenue: ttm("2025-12-31", 1500, "2026-02-15"),
      operating_income: ttm("2025-12-31", 300, "2026-02-15"),
      income_tax_expense: ttm("2025-12-31", 60, "2026-02-15"),
      pretax_income: ttm("2025-12-31", 280, "2026-02-15"),
      total_debt: { fp: "FY", end: "2025-12-31", v: 500, filed: "2026-02-15", unit: "USD", kind: "INSTANT" },
      cash_and_equivalents: { fp: "FY", end: "2025-12-31", v: 100, filed: "2026-02-15", unit: "USD", kind: "INSTANT" },
      net_income: ttm("2025-12-31", 220, "2026-02-15"),
      shares_outstanding: { fp: "FY", end: "2025-12-31", v: 100, filed: "2026-02-15", unit: "shares", kind: "INSTANT" }
    },
    ...overrides
  };
}

const CUTOFF = "2026-09-18";

test("a document that is not the consumer contract produces nothing", () => {
  assert.equal(Inputs.compute({ schema: "something-else" }, CUTOFF, 1000), null);
  assert.equal(Inputs.compute(null, CUTOFF, 1000), null);
});

test("nothing is visible before its filing date", () => {
  const early = Inputs.compute(doc(), "2025-06-01", null);
  /* Only the 2022, 2023 and 2024 filings had been made by then. */
  assert.equal(early.annualYears, 3);
  assert.equal(early.fundamentalsAsOf, "2024-12-31", "the TTM block filed in 2026 must be invisible");
});

test("the effective tax rate comes from the reported charge, and never from an assumption", () => {
  assert.equal(Inputs.effectiveTaxRate(60, 280), 60 / 280);
  assert.equal(Inputs.effectiveTaxRate(-10, 280), null, "a tax benefit is real and makes the rate undefined");
  assert.equal(Inputs.effectiveTaxRate(60, -280), null, "a loss year has no meaningful effective rate");
  assert.equal(Inputs.effectiveTaxRate(400, 280), null, "a rate above 100 % is not clamped into plausibility");
  assert.equal(Inputs.effectiveTaxRate(60, 0), null);
});

test("ROIC is after-tax operating income over debt plus equity less cash", () => {
  const rate = 60 / 280;
  assert.equal(Inputs.roic(300, rate, 500, 1000, 100), (300 * (1 - rate)) / 1400);
  assert.equal(Inputs.roic(300, rate, 100, 100, 500), null, "negative invested capital has no meaningful return");
  assert.equal(Inputs.roic(300, null, 500, 1000, 100), null, "no rate, no value — not a default rate");
});

test("the ROIC components compute from a complete document", () => {
  const model = Inputs.compute(doc(), CUTOFF, 10000);
  const rate = 60 / 280;
  assert.ok(Math.abs(model.raws.effectiveTaxRateTtm - rate) < 1e-12);
  assert.ok(Math.abs(model.raws.roicTtm - (300 * (1 - rate)) / 1400) < 1e-12);
  assert.ok(Number.isFinite(model.raws.roicMedian3y), "three paired fiscal years give a median");
});

test("without tax inputs there is no ROIC, and the rest of the factor survives", () => {
  const withoutTax = doc();
  delete withoutTax.ttm.income_tax_expense;
  delete withoutTax.ttm.pretax_income;
  delete withoutTax.annual.income_tax_expense;
  delete withoutTax.annual.pretax_income;
  const model = Inputs.compute(withoutTax, CUTOFF, 10000);
  assert.equal(model.raws.roicTtm, undefined);
  assert.equal(model.raws.roicMedian3y, undefined);
  assert.ok(Number.isFinite(model.raws.operatingMarginTtm), "the margin does not depend on the tax charge");
});

test("EBITDA yield exists only when the SEC layer actually derived an EBITDA", () => {
  const without = Inputs.compute(doc(), CUTOFF, 10000);
  assert.equal(without.raws.ebitdaYield, undefined, "no EBITDA in the document means no yield, not the operating income");

  const withEbitda = doc();
  withEbitda.ttm.ebitda = ttm("2025-12-31", 380, "2026-02-15", { derived: true, inputs: ["operating_income", "depreciation_and_amortization"] });
  withEbitda.ttm.net_debt = { fp: "LATEST", end: "2025-12-31", v: 400, filed: "2026-02-15", unit: "USD", kind: "INSTANT" };
  const model = Inputs.compute(withEbitda, CUTOFF, 10000);
  assert.ok(Math.abs(model.raws.ebitdaYield - 380 / 10400) < 1e-12, "enterprise value is market cap plus net debt");
});

test("a derived value without a filing date is dated by its own inputs", () => {
  const derived = doc();
  derived.annual.operating_cash_flow = derived.annual.operating_income;
  derived.annual.capital_expenditures = derived.annual.free_cash_flow;
  derived.ttm.free_cash_flow = { fp: "TTM", end: "2025-12-31", v: 130, unit: "USD", kind: "TTM", derived: true, inputs: ["operating_cash_flow", "capital_expenditures"] };
  const model = Inputs.compute(derived, CUTOFF, 10000);
  assert.ok(Number.isFinite(model.raws.fcfYield), "a derived TTM whose inputs are filed is usable");

  /* Before those inputs were filed it must stay invisible. */
  const early = Inputs.compute(derived, "2024-06-01", 10000);
  assert.equal(early.raws.fcfYield, undefined);
});

test("a balance-sheet instant from years earlier is dropped, not mixed into a current ratio", () => {
  const stale = doc();
  stale.ttm.total_debt = { fp: "Q2", end: "2021-06-30", v: 500, filed: "2021-08-01", unit: "USD", kind: "INSTANT" };
  stale.ttm.net_debt = { fp: "LATEST", end: "2021-06-30", v: 400, filed: "2021-08-01", unit: "USD", kind: "INSTANT" };
  const model = Inputs.compute(stale, CUTOFF, 10000);
  assert.equal(model.raws.netDebtToAssets, undefined, "a 2021 debt figure is not this year's leverage");
  assert.equal(model.raws.salesYield, undefined, "and it must not silently become an enterprise value");
  assert.ok(Number.isFinite(model.raws.earningsYield), "the price-based figures are unaffected");
});

test("margins pair operating income and revenue on the same closing date", () => {
  const shifted = doc();
  /* The operating income series reports one year on a different closing
     date. That year has no revenue to divide by, so it yields no margin. */
  shifted.annual.operating_income[2] = row(2024, "2024-11-30", 250, "2025-02-15");
  const model = Inputs.compute(shifted, CUTOFF, 10000);
  /* Three paired years is below the minimum of four, so both stay absent
     rather than being computed across a mismatched period. */
  assert.equal(model.raws.operatingMarginStability, undefined);
  assert.equal(model.raws.operatingMarginExpansion3y, undefined);

  /* The counter-check: with all four years paired, both exist. */
  const whole = Inputs.compute(doc(), CUTOFF, 10000);
  assert.ok(Number.isFinite(whole.raws.operatingMarginStability));
  assert.ok(Math.abs(whole.raws.operatingMarginExpansion3y - (300 / 1500 - 180 / 900)) < 1e-12);
});

test("a compound growth rate across a sign change is absent, not a number", () => {
  const swing = doc();
  swing.annual.free_cash_flow[0] = row(2022, "2022-12-31", -80, "2023-02-15");
  const model = Inputs.compute(swing, CUTOFF, null);
  assert.equal(model.raws.fcfCagr3y, null);
  assert.ok(Number.isFinite(model.raws.revenueCagr3y), "the counter-check needs a series that does not cross zero");
});

/* ---------------------------------------------------------------------------
   DIE BERICHTSPERIODE HING AM UMSATZ

   Gemessen ueber alle 5.036 Titel mit Consumer-Export: 741 fuehren eine
   vollstaendige Bilanz und hatten trotzdem keine Berichtsperiode, in 741 von
   741 Faellen allein deshalb, weil kein `revenue`-Tag gemeldet wird - 101
   Banken (6022), 57 (6021), 50 REITs, dazu 93 Pharma- und 30 Biotech-Titel
   vor der ersten Zulassung.
   --------------------------------------------------------------------------- */

/* Ein Abschluss ohne Umsatzzeile: so berichtet eine Bank. */
function bankDoc(overrides = {}) {
  const years = [
    [2022, "2022-12-31", "2023-02-15"],
    [2023, "2023-12-31", "2024-02-15"],
    [2024, "2024-12-31", "2025-02-15"],
    [2025, "2025-12-31", "2026-02-15"]
  ];
  const series = (values) => years.map(([fy, end, filed], index) => row(fy, end, values[index], filed));
  return {
    schema: "vu-consumer-fundamentals-1.0.0",
    cik: "0000000002",
    annual: {
      net_income: series([100, 120, 150, 200]),
      operating_cash_flow: series([130, 150, 180, 240]),
      total_assets: series([9000, 9500, 10000, 11000]),
      stockholders_equity: series([1000, 1100, 1200, 1400]),
      pretax_income: series([125, 150, 188, 250]),
      income_tax_expense: series([25, 30, 38, 50]),
      dividends_paid: series([40, 45, 50, 60]),
      eps_diluted: series([1.0, 1.2, 1.5, 2.0]),
      free_cash_flow: series([120, 140, 170, 230]),
      cash_and_equivalents: series([500, 500, 500, 500])
    },
    quarterly: {},
    ttm: {
      net_income: ttm("2026-06-30", 210, "2026-07-30"),
      operating_cash_flow: ttm("2026-06-30", 250, "2026-07-30"),
      pretax_income: ttm("2026-06-30", 262, "2026-07-30"),
      income_tax_expense: ttm("2026-06-30", 52, "2026-07-30"),
      shares_outstanding: { fp: "Q2", end: "2026-06-30", v: 100, filed: "2026-07-30", unit: "shares", kind: "INSTANT" }
    },
    ...overrides
  };
}

test("ein Abschluss ohne Umsatzzeile hat trotzdem eine Berichtsperiode", () => {
  const model = Inputs.compute(bankDoc(), CUTOFF, null);
  assert.equal(model.referenceEnd, "2026-06-30", "die juengste berichtete Periode, hier das Ergebnisfenster");
  assert.equal(model.fundamentalsAsOf, "2026-06-30", "vorher stand hier null, weil nur der Umsatz zaehlte");
  assert.equal(model.annualYears, 4, "vier Geschaeftsjahre - vorher 0, weil die Umsatzreihe leer ist");
  assert.ok(model.shares, "und der Anteilsbestand vom selben Stichtag bleibt nutzbar");
});

test("der juengste Stichtag zaehlt, nicht der des Umsatzes", () => {
  /* Der gemessene Fall BCE: eine Umsatzreihe, die 2017 endet, neben Reihen,
     die 2025 laufen. Nahm die Referenz den Umsatz, sah ein Anteilsbestand
     von 2023 dagegen "neu" aus und ergab einen Boersenwert aus zwei
     Jahrzehnten. */
  const gemischt = bankDoc();
  gemischt.annual.revenue = [row(2013, "2013-03-31", 500, "2013-06-01")];
  delete gemischt.ttm.net_income;
  delete gemischt.ttm.operating_cash_flow;
  delete gemischt.ttm.pretax_income;
  gemischt.ttm.shares_outstanding = { fp: "FY", end: "2015-12-31", v: 100, filed: "2016-02-15", unit: "shares", kind: "INSTANT" };
  const model = Inputs.compute(gemischt, CUTOFF, null);
  assert.equal(model.referenceEnd, "2025-12-31", "nicht 2013-03-31");
  assert.equal(model.shares, null, "ein Anteilsbestand von 2015 ist kein heutiger Boersenwert");
});

test("die Branchenkennzahlen entstehen aus denselben Abschluessen", () => {
  const model = Inputs.compute(bankDoc(), CUTOFF, 4000);
  const durchschnittlicheBilanz = (11000 + 10000) / 2;
  assert.ok(Math.abs(model.raws.roaTtm - 210 / durchschnittlicheBilanz) < 1e-12);
  assert.ok(Math.abs(model.raws.roeTtm - 210 / 1400) < 1e-12, "Eigenkapital ist der Bestand des letzten Abschlusses");
  assert.ok(Math.abs(model.raws.pretaxRoaTtm - 262 / durchschnittlicheBilanz) < 1e-12);
  assert.ok(Math.abs(model.raws.cashReturnOnAssets - 250 / durchschnittlicheBilanz) < 1e-12);
  assert.ok(Math.abs(model.raws.equityToAssets - 1400 / 11000) < 1e-12);
  /* Median der drei letzten Jahresrenditen, auf dem Stichtag gepaart. */
  const jahre = [150 / 10000, 200 / 11000, 120 / 9500].sort((a, b) => a - b);
  assert.ok(Math.abs(model.raws.roaMedian3y - jahre[1]) < 1e-12);
  assert.ok(Number.isFinite(model.raws.roaStability5y), "vier gepaarte Jahre reichen fuer die Streuung");
  assert.equal(model.raws.positiveEarningsYears, 4);
  assert.ok(Math.abs(model.raws.dividendCoverageByOcf - 250 / 60) < 1e-12);
  assert.ok(Math.abs(model.raws.bookToMarket - 1400 / 4000) < 1e-12);
  assert.ok(Math.abs(model.raws.earningsYield - 210 / 4000) < 1e-12);
  assert.ok(Math.abs(model.raws.pretaxEarningsYield - 262 / 4000) < 1e-12);
  assert.ok(Math.abs(model.raws.cashFlowYield - 250 / 4000) < 1e-12);
  assert.ok(Math.abs(model.raws.dividendYield - 60 / 4000) < 1e-12);

  /* Und die generischen Groessen bleiben genau dort leer, wo die Bank sie
     nicht meldet - nichts tritt an ihre Stelle. */
  assert.equal(model.raws.grossProfitabilityTtm, undefined);
  assert.equal(model.raws.operatingMarginTtm, undefined);
  assert.equal(model.raws.operatingMarginStability, undefined);
  assert.equal(model.raws.salesYield, undefined);
  assert.equal(model.raws.netMarginTtm, undefined, "ohne Umsatz keine Marge");
  assert.equal(model.raws.ocfMarginTtm, undefined);
  assert.equal(model.raws.revenueCagr3y, null);
});

test("eine Ausschuettung wird nicht aus einem Vorzeichen gemacht", () => {
  const negativ = bankDoc();
  negativ.annual.dividends_paid = negativ.annual.dividends_paid.map((entry) =>
    row(entry[0], entry[2], -Math.abs(entry[3]), entry[4]));
  const model = Inputs.compute(negativ, CUTOFF, 4000);
  assert.equal(model.raws.dividendCoverageByOcf, undefined, "ein negativer Betrag wird nicht in einen Betrag umgedeutet");
  assert.equal(model.raws.dividendYield, undefined);

  /* Und eine Ausschuettung, deren Geschaeftsjahr Jahre vor der berichteten
     Periode endet, ist keine laufende Ausschuettung. */
  const alt = bankDoc();
  alt.annual.dividends_paid = [row(2021, "2021-12-31", 40, "2022-02-15")];
  const veraltet = Inputs.compute(alt, CUTOFF, 4000);
  assert.equal(veraltet.raws.dividendYield, undefined);
  assert.equal(veraltet.raws.dividendCoverageByOcf, undefined);
});

test("die Traegermarge braucht denselben Stichtag wie ihr Umsatz", () => {
  const traeger = bankDoc();
  traeger.annual.revenue = [
    row(2024, "2024-12-31", 3000, "2025-02-15"),
    row(2025, "2025-12-31", 3400, "2026-02-15")
  ];
  traeger.ttm.revenue = ttm("2026-06-30", 3600, "2026-07-30");
  const model = Inputs.compute(traeger, CUTOFF, 4000);
  assert.ok(Math.abs(model.raws.netMarginTtm - 210 / 3600) < 1e-12);
  assert.ok(Math.abs(model.raws.ocfMarginTtm - 250 / 3600) < 1e-12);

  /* Zwei Fenster mit verschiedenen Stichtagen sind keine Marge. */
  const versetzt = bankDoc();
  versetzt.ttm.revenue = ttm("2026-03-31", 3600, "2026-07-30");
  const schief = Inputs.compute(versetzt, CUTOFF, 4000);
  assert.equal(schief.raws.netMarginTtm, undefined);
  assert.equal(schief.raws.ocfMarginTtm, undefined);
});

test("change inputs describe growth against the prior year, from the same series", () => {
  const model = Inputs.compute(doc(), CUTOFF, null);
  assert.ok(Math.abs(model.change.revenueGrowthCurrent - (1500 / 1200 - 1)) < 1e-12);
  assert.ok(Math.abs(model.change.revenueGrowthPrior - (1200 / 1000 - 1)) < 1e-12);
  assert.ok(Math.abs(model.raws.revenueCagr3y - (Math.pow(1500 / 900, 1 / 3) - 1)) < 1e-12);
  assert.ok(Math.abs(model.change.revenueGrowthAcceleration -
    (model.change.revenueGrowthCurrent - model.change.revenueGrowthPrior)) < 1e-12);
});

test("welche Rohwerte am Boersenwert haengen, sagt das Verhalten", () => {
  /* Die Liste im Modul ist eine Behauptung. Hier wird sie gegen die Rechnung
     selbst geprueft: einmal ohne und einmal mit Boersenwert, und die
     Differenz der Schluessel IST die Abhaengigkeit. Eine Liste, die von
     ihrem Code abdriftet, faellt damit auf - und genau diese Abdrift hatte
     vier prominente Titel den falschen Grund lesen lassen. */
  const vollstaendig = bankDoc();
  vollstaendig.annual.revenue = [
    row(2024, "2024-12-31", 3000, "2025-02-15"),
    row(2025, "2025-12-31", 3400, "2026-02-15")
  ];
  vollstaendig.ttm.revenue = ttm("2026-06-30", 3600, "2026-07-30");
  vollstaendig.ttm.free_cash_flow = ttm("2026-06-30", 230, "2026-07-30");
  vollstaendig.ttm.ebitda = ttm("2026-06-30", 320, "2026-07-30");
  vollstaendig.ttm.net_debt = { fp: "LATEST", end: "2026-06-30", v: 400, filed: "2026-07-30", unit: "USD", kind: "INSTANT" };

  const ohne = Inputs.compute(vollstaendig, CUTOFF, null);
  const mit = Inputs.compute(vollstaendig, CUTOFF, 4000);
  const nurMitBoersenwert = Object.keys(mit.raws)
    .filter((k) => Number.isFinite(mit.raws[k]) && !Number.isFinite(ohne.raws[k]))
    .sort();

  assert.ok(nurMitBoersenwert.length >= 6, "zu wenige kursabhaengige Groessen im Testdokument: " + nurMitBoersenwert.join(", "));
  for (const id of nurMitBoersenwert) {
    assert.ok(Inputs.MARKET_CAP_DEPENDENT_RAWS.includes(id),
      id + " entsteht nur mit Boersenwert, steht aber nicht in MARKET_CAP_DEPENDENT_RAWS");
  }
  /* Und umgekehrt: keine der gelisteten Groessen entsteht ohne Boersenwert. */
  for (const id of Inputs.MARKET_CAP_DEPENDENT_RAWS) {
    assert.equal(Number.isFinite(ohne.raws[id]), false,
      id + " steht in der Liste, entsteht aber auch ohne Boersenwert");
  }
});
