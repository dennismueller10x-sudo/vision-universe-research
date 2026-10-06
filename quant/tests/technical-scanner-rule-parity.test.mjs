import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const Scanner = require("../engines/technical/scanner.js");
const Catalog = require("../engines/catalog.js");
const Rules = require("../engines/rule-contract.js");
const Strategy = require("../engines/strategy.js");

const LEGACY = {
  technicalScore: [">=", 60], scorePercentile: [">=", 75], riskReward: [">=", 2],
  trend: ["==", "BULLISH"], structure: ["==", "BULLISH"], momentum: ["==", "POSITIVE"],
  relativeStrength: ["==", "OUTPERFORMING"], rsPercentile: [">=", 70], confidence: [">=", 65],
  setupStatus: ["==", "COMPLETE"], entryStatus: ["==", "ACTIVE"], primaryDirection: ["==", "BULLISH"],
  elliottStatus: ["==", "AMBIGUOUS"], volatilityRegime: ["==", "NORMAL"], volume: ["==", "EXPANSION"],
  distanceTo52wHigh: [">=", -0.1], momentum12M: [">", 0.1]
};

const MATCHING_ROW = {
  instrumentId: "MATCH", opportunityScore: 72, scorePercentile: 88, riskReward: 2.4,
  trend: "BULLISH", structure: "BULLISH", momentum: "POSITIVE", relativeStrength: "OUTPERFORMING",
  rsPercentile: 82, confidence: 71, setupStatus: "COMPLETE", entryStatus: "ACTIVE",
  primaryDirection: "BULLISH", elliott: { status: "AMBIGUOUS" }, volatilityRegime: "NORMAL",
  volume: "EXPANSION", distanceTo52wHigh: -0.04, momentum12M: 0.22
};
const SCAN = { universeId: "US_EQUITIES", universeVersion: "test-v1", rows: [MATCHING_ROW, { instrumentId: "MISSING" }] };

test("every public legacy scanner field has one canonical current-snapshot mapping", () => {
  assert.deepEqual(Object.keys(Scanner.LEGACY_CANONICAL_FIELDS).sort(), Object.keys(Scanner.FIELDS).sort());
  assert.deepEqual(Object.keys(LEGACY).sort(), Object.keys(Scanner.FIELDS).sort());
  for (const canonical of Scanner.CANONICAL_FIELDS) {
    const field = Catalog.field(canonical);
    assert.ok(field, canonical);
    assert.equal(field.availability, "CURRENT_SNAPSHOT_ONLY", canonical);
    assert.equal(field.backtestEligibility, "NOT_CERTIFIED", canonical);
    assert.equal(field.isProbability, false, canonical);
  }
});

test("every scanner field remains fail-closed for historical strategy execution", () => {
  for (const [legacy, [op, value]] of Object.entries(LEGACY)) {
    const predicate = Scanner.predicateFromFilters([{ field: legacy, op, value }], SCAN);
    const eligibility = Strategy.backtestEligibility(Strategy.createDefinition({ filters: predicate.filters }));
    assert.equal(eligibility.eligible, false, legacy);
    assert.equal(eligibility.code, "RULE_METRIC_NOT_BACKTEST_CERTIFIED", legacy);
    assert.deepEqual(eligibility.blockedFields, [Scanner.LEGACY_CANONICAL_FIELDS[legacy]], legacy);
  }
});

test("legacy syntax is only a translation into the canonical Rule Contract", () => {
  const filters = Object.entries(LEGACY).map(([field, [op, value]]) => ({ field, op, value }));
  const predicate = Scanner.predicateFromFilters(filters, SCAN);
  assert.equal(Rules.validate(predicate).valid, true);
  assert.deepEqual(predicate.filters.map((filter) => filter.field), Object.keys(LEGACY).map((field) => Scanner.LEGACY_CANONICAL_FIELDS[field]));
  const legacy = Scanner.applyFilters(SCAN, filters);
  const canonical = Scanner.applyPredicate(SCAN, predicate);
  assert.deepEqual(legacy.rows.map((row) => row.instrumentId), ["MATCH"]);
  assert.deepEqual(legacy.rows, canonical.rows);
  assert.equal(legacy.predicateHash, canonical.predicateHash);
});

test("enum membership translates, missing values never match, and incompatible legacy semantics fail closed", () => {
  const membership = Scanner.predicateFromFilters([{ field: "trend", op: "in", value: ["BULLISH", "NEUTRAL"] }], SCAN);
  assert.equal(Scanner.applyPredicate(SCAN, membership).count, 1);
  assert.equal(Scanner.applyFilters({ universeId: "US_EQUITIES", universeVersion: "test-v1", rows: [{ instrumentId: "NULL", riskReward: null }] }, [{ field: "riskReward", op: "!=", value: 2 }]).count, 0);
  assert.throws(() => Scanner.predicateFromFilters([{ field: "riskReward", op: "in", value: [2] }], SCAN), /nicht kanonisch abbildbar/);
  assert.throws(() => Scanner.predicateFromFilters([{ field: "momentum12M", op: "in", value: [0.2] }], SCAN), /nicht kanonisch abbildbar/);
});

test("rule identity is bound to the exact scanner constituent set and version", () => {
  const filter = [{ field: "trend", op: "==", value: "BULLISH" }];
  const a = { ...SCAN, universeId: "SP500", universeVersion: "2026-09-21" };
  const b = { ...SCAN, universeId: "US_EQUITIES", universeVersion: "2026-09-21" };
  const pa = Scanner.predicateFromFilters(filter, a), pb = Scanner.predicateFromFilters(filter, b);
  assert.notEqual(Rules.predicateHash(pa), Rules.predicateHash(pb));
  assert.throws(() => Scanner.applyPredicate(a, pb), /Rule-Universum/);
  assert.throws(() => Scanner.predicateFromFilters(filter), /Universumskontext/);
});

test("scanner has no parallel legacy value evaluator", () => {
  const source = readFileSync(new URL("../engines/technical/scanner.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /return\s+OPS\[f\.op\]/);
  assert.doesNotMatch(source, /scan\.rows\.filter\(function \(r\)/);
  assert.match(source, /var predicate = predicateFromFilters\(filters \|\| \[\], scan\)/);
  assert.match(source, /applyPredicate\(scan, predicate, limit\)/);
});
