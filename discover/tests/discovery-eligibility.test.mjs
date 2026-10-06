import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Eligibility = require("../engines/discovery-eligibility.js");

function stock(overrides = {}) {
  return Object.assign({
    dataQuality: "PASS",
    dataQualityReason: "clean",
    rawValues: { returns: { "1M": 0.04, "3M": 0.12, "6M": 0.2, "12M": 0.35 } },
    metrics: { return1M: 0.04, return3M: 0.12, return6M: 0.2,
      return12M: 0.35, volatility252d: 0.28 }
  }, overrides);
}

test("clean trading titles remain eligible", () => {
  assert.equal(Eligibility.assess(stock()).eligible, true);
});

test("large-move warning is quarantined from consumer discovery", () => {
  const result = Eligibility.assess(stock({
    dataQuality: "WARNING", dataQualityReason: "large_move",
    rawValues: { returns: { "1M": 1.4, "3M": 26.9, "6M": 30, "12M": 35 } },
    metrics: { return1M: 1.4, return3M: 26.9, return6M: 30, return12M: 35,
      volatility252d: 4 }
  }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "DATA_QUALITY_REVIEW");
  assert.match(result.message, /bleibt suchbar/);
});

test("warning alone is not enough when returns remain inside canonical bounds", () => {
  const result = Eligibility.assess(stock({
    dataQuality: "WARNING", dataQualityReason: "large_move_matching_split_ratio"
  }));
  assert.equal(result.eligible, true);
});

test("short-history warning alone does not remove a young stock", () => {
  const result = Eligibility.assess(stock({
    dataQuality: "WARNING", dataQualityReason: "insufficient_history_for_factors"
  }));
  assert.equal(result.eligible, true);
});

test("failed and unavailable source quality never enter discovery", () => {
  for (const quality of ["FAIL", "UNAVAILABLE"]) {
    assert.equal(Eligibility.assess(stock({ dataQuality: quality })).eligible, false, quality);
  }
});

test("missing and frozen price histories remain excluded", () => {
  assert.equal(Eligibility.assess(stock({ metrics: {} })).reason, "NO_RETURNS");
  assert.equal(Eligibility.assess(stock({ metrics: {
    return1M: 0, return3M: 0, return6M: 0, return12M: 0, volatility252d: 0
  } })).reason, "STALE_SERIES");
});
