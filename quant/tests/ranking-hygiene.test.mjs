import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Hygiene = require("../engines/ranking-hygiene.js");

function row(ticker, values, dataQuality = "PASS") { return { ticker, values, dataQuality }; }

test("plausibility bounds are inclusive and preserve valid extreme values", () => {
  assert.deepEqual(Hygiene.inspectRow(row("EDGE", { returns: { "12M": 10 } })), []);
  assert.equal(Hygiene.inspectRow(row("OVER", { returns: { "12M": 10.0001 } }))[0].reason,
    "IMPLAUSIBLE_VALUE");
});

test("FAIL and UNAVAILABLE rows are quarantined while WARNING is inspected by value", () => {
  assert.equal(Hygiene.inspectRow(row("FAIL", {}, "FAIL"))[0].reason, "DATA_QUALITY_FAIL");
  assert.equal(Hygiene.inspectRow(row("NA", {}, "UNAVAILABLE"))[0].reason, "DATA_QUALITY_UNAVAILABLE");
  assert.deepEqual(Hygiene.inspectRow(row("WARN", { returns: { "12M": 0.2 } }, "WARNING")), []);
});

test("nested market metrics and every configured bound are evaluated", () => {
  for (const [metric, bound] of Object.entries(Hygiene.BOUNDS)) {
    const values = {};
    const parts = metric.split(".");
    if (parts.length === 2) values[parts[0]] = { [parts[1]]: bound + 1 };
    else values[metric] = bound + 1;
    assert.ok(Hygiene.inspectRow(row(metric, values)).some((issue) => issue.metric === metric), metric);
  }
});

test("quarantine runs before top-K and clean rows backfill the result", () => {
  const raw = [
    row("BROKEN", { returns: { "12M": 2969999 } }),
    row("A", { returns: { "12M": 0.8 } }),
    row("B", { returns: { "12M": 0.7 } }),
    row("C", { returns: { "12M": 0.6 } })
  ];
  const before = structuredClone(raw);
  const ranked = Hygiene.rankRows(raw, {
    metric: "returns.12M", pick: (values) => values.returns?.["12M"], direction: "desc", limit: 2
  });
  assert.deepEqual(ranked.top.map((entry) => entry.ticker), ["A", "B"]);
  assert.equal(ranked.evaluated, 3);
  assert.equal(ranked.quarantinedCount, 1);
  assert.equal(ranked.quarantined[0].ticker, "BROKEN");
  assert.deepEqual(raw, before, "raw factor rows must never be rewritten by ranking hygiene");
});

test("one broken series is excluded across investor rankings", () => {
  const rows = [
    row("BROKEN", { returns: { "12M": 50 }, volatility60d: 0.1, distanceTo52wHigh: -0.01 }),
    row("CLEAN", { returns: { "12M": 0.5 }, volatility60d: 0.2, distanceTo52wHigh: -0.02 })
  ];
  const volatility = Hygiene.rankRows(rows, { metric: "volatility60d", direction: "asc", limit: 10 });
  const high = Hygiene.rankRows(rows, { metric: "distanceTo52wHigh", direction: "desc", limit: 10 });
  assert.deepEqual(volatility.top.map((entry) => entry.ticker), ["CLEAN"]);
  assert.deepEqual(high.top.map((entry) => entry.ticker), ["CLEAN"]);
  assert.equal(volatility.quarantined[0].reasons[0].metric, "returns.12M");
});

test("missing and nonfinite requested metrics are not evaluable, not quarantined", () => {
  const ranked = Hygiene.rankRows([
    row("MISSING", {}), row("NAN", { volatility60d: Number.NaN }), row("OK", { volatility60d: 0.2 })
  ], { metric: "volatility60d", direction: "asc", limit: 10 });
  assert.deepEqual(ranked.notEvaluable.sort(), ["MISSING", "NAN"]);
  assert.equal(ranked.quarantinedCount, 0);
  assert.deepEqual(ranked.top, [{ ticker: "OK", value: 0.2 }]);
});

test("unknown metrics get ranking semantics but no invented plausibility bound", () => {
  const ranked = Hygiene.rankRows([row("X", { unknown: 1e12 })], {
    metric: "unknown", direction: "desc", limit: 1
  });
  assert.equal(ranked.evaluated, 1);
  assert.equal(ranked.quarantinedCount, 0);
});
