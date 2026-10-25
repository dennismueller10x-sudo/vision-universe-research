import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const History = require("../engines/backtest-history.js");
const ChartRanges = require("../engines/chart-ranges.js");

test("1Y/3Y/5Y/10Y/MAX history windows use the chart's calendar contracts", () => {
  const chart = Object.fromEntries(ChartRanges.RANGES.filter((r) => ["1Y", "3Y", "5Y", "10Y", "MAX"].includes(r.id)).map((r) => [r.id, r]));
  for (const id of ["1Y", "3Y", "5Y", "10Y"]) assert.equal(History.PERIODS[id].days, chart[id].days, id);
  assert.equal(History.PERIODS.MAX.kind, "ALL_ELIGIBLE_HISTORY");
});

test("eligible start is the latest dependency start after each dependency warm-up", () => {
  const result = History.resolve([
    { id: "prices", dates: ["1999-01-01", "1999-01-08", "1999-01-15", "1999-01-22"], warmupBars: 2, status: "AVAILABLE" },
    { id: "pitFactors", dates: ["1999-01-15", "1999-01-22", "1999-01-29"], warmupBars: 1, status: "AVAILABLE" },
    { id: "benchmark", dates: ["1999-01-01", "1999-01-08", "1999-01-15", "1999-01-22", "1999-01-29"], trailingBars: 1, status: "AVAILABLE" }
  ], { asOf: "1999-01-29" });
  assert.equal(result.state, "AVAILABLE");
  assert.equal(result.earliestAvailableDataDate, "1999-01-01");
  assert.equal(result.earliestEligibleBacktestDate, "1999-01-22");
  assert.equal(result.latestEligibleBacktestDate, "1999-01-22");
  assert.equal(result.coverageStatus, "PASS");
  assert.deepEqual(result.limitingDataDependencies.sort(), ["benchmark", "pitFactors", "prices"]);
});

test("MAX is the full eligible range; fixed ranges report when available data is shorter", () => {
  const eligibility = History.resolve([{ id: "prices", dates: ["2018-01-01", "2019-01-01", "2020-01-01", "2021-01-01", "2022-01-01", "2023-01-01", "2024-01-01", "2025-01-01", "2026-01-01"], warmupBars: 1 }]);
  assert.deepEqual(History.windowFor("MAX", eligibility), {
    state: "AVAILABLE", period: "MAX", requestedWindowDays: null, startDate: "2019-01-01", endDate: "2026-01-01", complete: true
  });
  assert.equal(History.windowFor("10Y", eligibility).complete, false);
  assert.equal(History.windowFor("5Y", eligibility).complete, true);
});

test("missing or unordered required dependencies fail closed", () => {
  const missing = History.resolve([{ id: "PIT", dates: [], status: "MISSING" }]);
  assert.equal(missing.state, "BLOCKED");
  assert.equal(missing.coverageStatus, "BLOCKED");
  assert.ok(missing.exclusionReasons.some((r) => r.includes("NO_DATED_OBSERVATIONS")));
  const unordered = History.resolve([{ id: "prices", dates: ["2020-01-02", "2020-01-01"] }]);
  assert.equal(unordered.state, "BLOCKED");
  assert.ok(unordered.exclusionReasons.some((r) => r.includes("OBSERVATIONS_NOT_STRICTLY_ORDERED")));
});

test('as-of first limits known observations, then reserves required forward bars',()=>{
 const dates=['1999-01-01','1999-01-08','1999-01-15','1999-01-22','1999-01-29','1999-02-05'];
 const result=History.resolve([{id:'prices',dates,warmupBars:1,trailingBars:2}],{asOf:'1999-01-22'});
 assert.equal(result.state,'AVAILABLE');assert.equal(result.earliestEligibleBacktestDate,'1999-01-08');assert.equal(result.latestEligibleBacktestDate,'1999-01-08');
 const tooEarly=History.resolve([{id:'prices',dates,warmupBars:1,trailingBars:2}],{asOf:'1999-01-08'});assert.equal(tooEarly.state,'BLOCKED');assert.equal(tooEarly.latestEligibleBacktestDate,null);
 const prefix=History.resolve([{id:'prices',dates:dates.slice(0,4),warmupBars:1,trailingBars:2}],{asOf:'1999-01-22'});assert.equal(prefix.latestEligibleBacktestDate,result.latestEligibleBacktestDate);
});
