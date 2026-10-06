import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const PIT = require("../engines/pit-fundamental-history.js");

/* Columns as the consumer bundle writes them: [fy, fp, end, v, filed, accn, derived].
   The fixture is built so that filing date and fiscal-year end disagree on
   purpose - that disagreement is the whole subject of this module. */
const bundle = {
  annual: {
    revenue: [
      [2020, "FY", "2020-12-31", 100, "2021-02-20", "a1", 0],
      [2021, "FY", "2021-12-31", 150, "2022-02-20", "a2", 0],
      [2022, "FY", "2022-12-31", 200, "2023-02-20", "a3", 0],
      [2023, "FY", "2023-12-31", 260, "2024-02-20", "a4", 0]
    ],
    net_income: [
      [2022, "FY", "2022-12-31", -10, "2023-02-20", "a3", 0],
      [2023, "FY", "2023-12-31", 30, "2024-02-20", "a4", 0]
    ],
    gross_profit: [[2023, "FY", "2023-12-31", 130, "2024-02-20", "a4", 0]],
    total_assets: [[2023, "FY", "2023-12-31", 500, "2024-02-20", "a4", 0]],
    stockholders_equity: [[2023, "FY", "2023-12-31", 300, "2024-02-20", "a4", 0]],
    cash_and_equivalents: [[2023, "FY", "2023-12-31", 200, "2024-02-20", "a4", 0]],
    capital_expenditures: [[2023, "FY", "2023-12-31", -40, "2024-02-20", "a4", 0]],
    free_cash_flow: [[2023, "FY", "2023-12-31", 52, "2024-02-20", "a4", 1]],
    shares_outstanding: [
      [2020, "FY", "2020-12-31", 100, "2021-02-20", "a1", 0],
      [2023, "FY", "2023-12-31", 130, "2024-02-20", "a4", 0]
    ]
  }
};

test("a filing is invisible before the day it was filed, not before its fiscal year ended", () => {
  /* The 2023 fiscal year ended on 2023-12-31 and was filed on 2024-02-20.
     On 2024-01-15 the year is over and the document does not exist. */
  const during = PIT.visibleAnnual(bundle, "revenue", "2024-01-15");
  assert.equal(during.length, 3);
  assert.equal(during[0][0], 2022, "the newest visible fiscal year must be 2022");

  const after = PIT.visibleAnnual(bundle, "revenue", "2024-02-20");
  assert.equal(after.length, 4);
  assert.equal(after[0][0], 2023);

  /* And a date before anything was filed sees nothing at all. */
  assert.deepEqual(PIT.visibleAnnual(bundle, "revenue", "2020-06-30"), []);
  assert.equal(PIT.featuresAt(bundle, "2020-06-30"), null);
});

test("a restatement does not reach back into an earlier observation", () => {
  const restated = structuredClone(bundle);
  restated.annual.revenue.push([2021, "FY", "2021-12-31", 999, "2025-06-01", "a9", 0]);

  /* In 2023 the correction has not been filed: 2021 still reads 150. */
  const before = PIT.visibleAnnual(restated, "revenue", "2023-06-01").find((row) => row[0] === 2021);
  assert.equal(before[3], 150);

  /* After it was filed, the newest filing for that year wins. */
  const afterwards = PIT.visibleAnnual(restated, "revenue", "2025-07-01").find((row) => row[0] === 2021);
  assert.equal(afterwards[3], 999);

  /* And the original bundle's features at the earlier date are untouched
     by the existence of a later correction. */
  assert.deepEqual(PIT.featuresAt(restated, "2023-06-01"), PIT.featuresAt(bundle, "2023-06-01"));
});

test("growth is measured only over years that were both visible", () => {
  /* On 2024-03-01 four years are visible, so a 3-year CAGR exists:
     260/100 over three years. */
  const now = PIT.featuresAt(bundle, "2024-03-01");
  assert.ok(Math.abs(now.revenueCagr3y - (Math.pow(2.6, 1 / 3) - 1)) < 1e-12);
  assert.ok(Math.abs(now.revenueGrowthYoy - (260 / 200 - 1)) < 1e-12);

  /* On 2023-06-01 only three years are visible, so a 3-year CAGR needs a
     fourth and is empty rather than computed from what is there. */
  const earlier = PIT.featuresAt(bundle, "2023-06-01");
  assert.equal(earlier.revenueCagr3y, null);
  assert.equal(earlier.visibleFiscalYears, 3);
});

test("a ratio with an impossible base stays empty instead of taking a sign", () => {
  const negative = structuredClone(bundle);
  negative.annual.revenue = negative.annual.revenue.map((row) => (row[0] === 2020 ? [...row.slice(0, 3), -50, ...row.slice(4)] : row));
  assert.equal(PIT.featuresAt(negative, "2024-03-01").revenueCagr3y, null);

  const zeroAssets = structuredClone(bundle);
  zeroAssets.annual.total_assets = [[2023, "FY", "2023-12-31", 0, "2024-02-20", "a4", 0]];
  assert.equal(PIT.featuresAt(zeroAssets, "2024-03-01").equityToAssets, null);
  assert.equal(PIT.featuresAt(zeroAssets, "2024-03-01").cashToAssets, null);
});

test("the ten pre-registered features compute from what the bundle really carries", () => {
  const f = PIT.featuresAt(bundle, "2024-03-01");
  assert.equal(f.grossMargin, 130 / 260);
  assert.equal(f.netMargin, 30 / 260);
  assert.equal(f.fcfMargin, 52 / 260);
  assert.equal(f.equityToAssets, 300 / 500);
  assert.equal(f.cashToAssets, 200 / 500);
  assert.equal(f.profitableLastYear, true);
  /* Capex is exported as a negative outflow; intensity is its magnitude. */
  assert.equal(f.capexIntensity, 40 / 260);
  assert.equal(f.shareCountChange3y, 130 / 100 - 1);

  /* The year before, the newest visible net income was a loss. */
  const loss = PIT.featuresAt(bundle, "2023-06-01");
  assert.equal(loss.profitableLastYear, false);
});

test("the real consumer artifacts are read the same way, and coverage starts where filings start", () => {
  const dir = new URL("../data/sec/consumer/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.startsWith("CIK")).slice(0, 60);
  let withFilings = 0, visibleEarly = 0, visibleLate = 0;
  for (const file of files) {
    const payload = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    const first = PIT.firstFiled(payload);
    if (!first) continue;
    withFilings += 1;
    if (PIT.featuresAt(payload, "2014-01-01")) visibleEarly += 1;
    if (PIT.featuresAt(payload, "2024-01-01")) visibleLate += 1;
    /* Nothing may be visible before this issuer's own first filing. */
    const dayBefore = new Date(Date.parse(first) - 86400000).toISOString().slice(0, 10);
    assert.equal(PIT.featuresAt(payload, dayBefore), null, file + " sees a filing before its first one");
  }
  assert.ok(withFilings > 20, "need real bundles to read");
  assert.ok(visibleLate > visibleEarly, "coverage must grow with time, not shrink");
});
