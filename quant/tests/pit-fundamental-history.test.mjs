import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const PIT = require("../engines/pit-fundamental-history.js");
const Inputs = require("../engines/fundamental-inputs.js");
const V = { view: PIT.VIEW };

/* Columns of the AS_REPORTED_AT_TIME block the consumer bundle writes:
   [fy, end, v, known, accn] - one row per version of a fiscal year's value,
   dated the day it became known. The fixture is built so that the day a
   value became known and the fiscal-year end disagree on purpose - that
   disagreement is the whole subject of this module. */
const annual = {
  revenue: [
    [2020, "2020-12-31", 100, "2021-02-20", "a1"],
    [2021, "2021-12-31", 150, "2022-02-20", "a2"],
    [2022, "2022-12-31", 200, "2023-02-20", "a3"],
    [2023, "2023-12-31", 260, "2024-02-20", "a4"]
  ],
  net_income: [
    [2022, "2022-12-31", -10, "2023-02-20", "a3"],
    [2023, "2023-12-31", 30, "2024-02-20", "a4"]
  ],
  gross_profit: [[2023, "2023-12-31", 130, "2024-02-20", "a4"]],
  total_assets: [[2023, "2023-12-31", 500, "2024-02-20", "a4"]],
  stockholders_equity: [[2023, "2023-12-31", 300, "2024-02-20", "a4"]],
  cash_and_equivalents: [[2023, "2023-12-31", 200, "2024-02-20", "a4"]],
  capital_expenditures: [[2023, "2023-12-31", -40, "2024-02-20", "a4"]],
  free_cash_flow: [[2023, "2023-12-31", 52, "2024-02-20", "a4"]],
  shares_outstanding: [
    [2020, "2020-12-31", 100, "2021-02-20", "a1"],
    [2023, "2023-12-31", 130, "2024-02-20", "a4"]
  ]
};
const bundle = { pit: { view: PIT.VIEW, annual } };

test("a filing is invisible before the day it was filed, not before its fiscal year ended", () => {
  /* The 2023 fiscal year ended on 2023-12-31 and was filed on 2024-02-20.
     On 2024-01-15 the year is over and the document does not exist. */
  const during = PIT.visibleAnnual(bundle, "revenue", "2024-01-15", V);
  assert.equal(during.length, 3);
  assert.equal(during[0][0], 2022, "the newest visible fiscal year must be 2022");

  const after = PIT.visibleAnnual(bundle, "revenue", "2024-02-20", V);
  assert.equal(after.length, 4);
  assert.equal(after[0][0], 2023);

  /* And a date before anything was filed sees nothing at all. */
  assert.deepEqual(PIT.visibleAnnual(bundle, "revenue", "2020-06-30", V), []);
  assert.equal(PIT.featuresAt(bundle, "2020-06-30", V), null);
});

test("a restatement does not reach back into an earlier observation", () => {
  const restated = structuredClone(bundle);
  restated.pit.annual.revenue.push([2021, "2021-12-31", 999, "2025-06-01", "a9"]);

  /* In 2023 the correction has not been filed: 2021 still reads 150. */
  const before = PIT.visibleAnnual(restated, "revenue", "2023-06-01", V).find((row) => row[0] === 2021);
  assert.equal(before[2], 150);

  /* After it was filed, the newest filing for that year wins. */
  const afterwards = PIT.visibleAnnual(restated, "revenue", "2025-07-01", V).find((row) => row[0] === 2021);
  assert.equal(afterwards[2], 999);

  /* And the original bundle's features at the earlier date are untouched
     by the existence of a later correction. */
  assert.deepEqual(PIT.featuresAt(restated, "2023-06-01", V), PIT.featuresAt(bundle, "2023-06-01", V));
});

test("growth is measured only over years that were both visible", () => {
  /* On 2024-03-01 four years are visible, so a 3-year CAGR exists:
     260/100 over three years. */
  const now = PIT.featuresAt(bundle, "2024-03-01", V);
  assert.ok(Math.abs(now.revenueCagr3y - (Math.pow(2.6, 1 / 3) - 1)) < 1e-12);
  assert.ok(Math.abs(now.revenueGrowthYoy - (260 / 200 - 1)) < 1e-12);

  /* On 2023-06-01 only three years are visible, so a 3-year CAGR needs a
     fourth and is empty rather than computed from what is there. */
  const earlier = PIT.featuresAt(bundle, "2023-06-01", V);
  assert.equal(earlier.revenueCagr3y, null);
  assert.equal(earlier.visibleFiscalYears, 3);
});

test("a ratio with an impossible base stays empty instead of taking a sign", () => {
  const negative = structuredClone(bundle);
  negative.pit.annual.revenue = negative.pit.annual.revenue.map((row) => (row[0] === 2020 ? [...row.slice(0, 2), -50, ...row.slice(3)] : row));
  assert.equal(PIT.featuresAt(negative, "2024-03-01", V).revenueCagr3y, null);

  const zeroAssets = structuredClone(bundle);
  zeroAssets.pit.annual.total_assets = [[2023, "2023-12-31", 0, "2024-02-20", "a4"]];
  assert.equal(PIT.featuresAt(zeroAssets, "2024-03-01", V).equityToAssets, null);
  assert.equal(PIT.featuresAt(zeroAssets, "2024-03-01", V).cashToAssets, null);
});

test("the ten pre-registered features compute from what the bundle really carries", () => {
  const f = PIT.featuresAt(bundle, "2024-03-01", V);
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
  const loss = PIT.featuresAt(bundle, "2023-06-01", V);
  assert.equal(loss.profitableLastYear, false);
});

test("the real LATEST bundles are never read as history", () => {
  const dir = new URL("../data/sec/consumer/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.startsWith("CIK")).slice(0, 60);
  assert.ok(files.length > 20, "need real bundles to read");
  for (const file of files) {
    const payload = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    assert.equal(payload.pit, undefined, file + ": the LATEST bundle carries no pit view (separate store)");
    assert.throws(() => PIT.featuresAt(payload, "2020-01-01", V), { code: "PIT_CONTRACT" }, file);
    assert.throws(() => PIT.pitSlice(payload, ["revenue"]), { code: "PIT_CONTRACT" }, file);
  }
});

test("the real PIT store, once built, starts where filings start", { skip: !existsSync(new URL("../data/sec/consumer-pit/", import.meta.url)) && "consumer-pit store not built yet" }, () => {
  const dir = new URL("../data/sec/consumer-pit/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.startsWith("CIK")).slice(0, 60);
  let withFilings = 0, visibleEarly = 0, visibleLate = 0;
  for (const file of files) {
    const payload = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    assert.equal(payload.view, PIT.VIEW, file);
    const first = PIT.firstFiled(payload, V);
    if (!first) continue;
    withFilings += 1;
    if (PIT.featuresAt(payload, "2014-01-01", V)) visibleEarly += 1;
    if (PIT.featuresAt(payload, "2024-01-01", V)) visibleLate += 1;
    /* Nothing may be visible before this issuer's own first filing. */
    const dayBefore = new Date(Date.parse(first) - 86400000).toISOString().slice(0, 10);
    assert.equal(PIT.featuresAt(payload, dayBefore, V), null, file + " sees a filing before its first one");
  }
  assert.ok(withFilings > 20, "need real PIT documents to read");
  assert.ok(visibleLate > visibleEarly, "coverage must grow with time, not shrink");
});

/* M-B5 contract: historical consumers read AS_REPORTED_AT_TIME(as_of), never LATEST_RESTATED. */
const NEOG = JSON.parse(readFileSync(new URL("./fixtures/pit/NEOG-core.json", import.meta.url), "utf8"));

test("historical consumer rejects LATEST: a declared LATEST view and a missing view both hard-fail", () => {
  assert.throws(() => PIT.featuresAt(bundle, "2024-03-01", { view: "LATEST_RESTATED" }), { code: "PIT_CONTRACT" });
  assert.throws(() => PIT.featuresAt(bundle, "2024-03-01"), { code: "PIT_CONTRACT" }, "no implicit default");
  assert.throws(() => PIT.visibleAnnual(bundle, "revenue", "2024-03-01", {}), { code: "PIT_CONTRACT" });
  /* A LATEST-only bundle (rows in `annual`) is not read as history, even with the right declaration. */
  const latestOnly = { annual: NEOG.annual, views: { annual: "LATEST_RESTATED" } };
  assert.throws(() => PIT.featuresAt(latestOnly, "2020-01-01", V), { code: "PIT_CONTRACT" });
  assert.throws(() => PIT.pitSlice(latestOnly, ["revenue"]), { code: "PIT_CONTRACT" });
  /* Renaming LATEST rows into a pit block without the view tag is not accepted either. */
  assert.throws(() => PIT.featuresAt({ pit: { annual: NEOG.annual } }, "2020-01-01", V), { code: "PIT_CONTRACT" });
});

test("historical consumer loads PIT from a real core bundle", () => {
  const slice = PIT.pitSlice(NEOG, ["revenue", "net_income"]);
  assert.equal(slice.pit.view, "AS_REPORTED_AT_TIME");
  assert.deepEqual(Object.keys(slice.pit.annual).sort(), ["net_income", "revenue"]);
  assert.ok(PIT.featuresAt(slice, "2020-01-01", V));
});

test("restatement (NEOG FY2017 revenue, real SEC): history sees the then-known value, the current consumer the corrected one", () => {
  const fy2017 = (asOf) => PIT.visibleAnnual(NEOG, "revenue", asOf, V).find((row) => row[0] === 2017);
  /* as_of boundary: not visible the day before the 10-K, visible on its day. */
  assert.equal(fy2017("2017-07-27"), undefined);
  assert.equal(fy2017("2017-07-28")[2], 361594000);
  /* Before the correction was filed the original value is what was known. */
  assert.equal(fy2017("2018-10-04")[2], 361594000);
  assert.equal(fy2017("2018-10-05")[2], 358277000);
  /* The LATEST block carries only the corrected value, dated by its newest
     repetition (2019-07-30): read as history it would hide FY2017 for two
     years and then show a value nobody knew in 2017. */
  const latestRow = NEOG.annual.revenue.find((row) => row[0] === 2017);
  assert.equal(latestRow[3], 358277000);
  assert.ok(latestRow[4] > "2018-10-05");
});

test("no future filing: nothing known after as_of is visible", () => {
  for (const asOf of ["2012-01-01", "2016-06-30", "2019-12-31", "2023-03-15"]) {
    for (const metric of Object.keys(NEOG.pit.annual)) {
      for (const row of PIT.visibleAnnual(NEOG, metric, asOf, V)) {
        assert.ok(row[3] <= asOf, `${metric} ${row[0]} known ${row[3]} after ${asOf}`);
      }
    }
  }
});

test("current consumer may load LATEST where allowed, and only with that declaration", () => {
  const doc = { asOf: "2026-10-05", annual: {}, quarterly: {}, ttm: {} };
  assert.throws(() => Inputs.compute(doc, "2026-10-05", 1e9), { code: "VIEW_CONTRACT" });
  assert.throws(() => Inputs.compute(doc, "2021-01-04", 1e9, { view: Inputs.VIEW }), { code: "VIEW_CONTRACT" },
    "a historical cutoff on a LATEST document is the leak M-B5 closes");
  assert.doesNotThrow(() => Inputs.compute(doc, "2026-10-05", 1e9, { view: Inputs.VIEW }));
});
