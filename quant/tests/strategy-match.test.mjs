import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const Catalog = require("../engines/catalog.js");
const StrategyMatch = require("../engines/strategy-match.js");
const FactorEvidence = require("../engines/factor-evidence.js");
const Screener = require("../api/screener-workspace.js");
const Rules = require("../engines/rule-contract.js");
const contract = require("../methodology/strategy-profiles-v1.json");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCREENING = join(ROOT, "quant/data/product/factor-evidence-v1/screening.json.gz");

/* ------------------------------------------------------- the two namespaces */

/* Quant V1 is LEGACY_IMMUTABLE. These exact ids carry stored strategies,
   saved screener links and signal predicate hashes; renaming or repointing
   one would silently reinterpret every rule ever written against it. */
const V1_FIELD_IDS = ["quantScore", "qualityScore", "momentumScore", "valueScore", "growthScore", "riskScore"];

test("the Quant V1 fields still exist under their own ids and their own methodology", () => {
  V1_FIELD_IDS.forEach((id) => {
    const field = Catalog.field(id);
    assert.ok(field, "V1 field '" + id + "' disappeared");
    assert.equal(field.namespace, "quantV1", id + " left the V1 namespace");
    assert.equal(field.methodologyVersion, "quant-v1.0.0");
    assert.equal(field.immutable, true, id + " must be marked immutable");
  });
  assert.equal(Catalog.namespace("quantV1").status, "LEGACY_IMMUTABLE");
});

test("Quant V2 evidence lives in its own namespace and never lands on a V1 field", () => {
  const v2 = Catalog.namespaceFieldIds("quantV2.factorEvidence");
  assert.equal(v2.length, FactorEvidence.FACTOR_ORDER.length + 1, "seven factors plus their coverage count");
  FactorEvidence.FACTOR_ORDER.forEach((id) => {
    assert.ok(v2.includes("quantV2.factorEvidence." + id), "missing V2 field for " + id);
  });
  /* The two namespaces must not share a single field id. */
  const v1 = new Set(Catalog.namespaceFieldIds("quantV1"));
  v2.forEach((id) => assert.ok(!v1.has(id), "field '" + id + "' is claimed by both methodologies"));
});

test("no Quant V2 composite or rank field exists, and that is the gate", () => {
  ["composite", "score", "quantScore", "rank", "percentile"].forEach((suffix) => {
    assert.equal(Catalog.field("quantV2.factorEvidence." + suffix), null,
      "a rule could be written against quantV2.factorEvidence." + suffix);
  });
  assert.equal(Catalog.namespace("quantV2.factorEvidence").compositeAllowed, false);
});

test("every V2 field resolves by its own token without colliding with a V1 token", () => {
  FactorEvidence.FACTOR_ORDER.forEach((id) => {
    const resolved = Catalog.fieldByToken("QUANT_V2_" + id.toUpperCase());
    assert.equal(resolved.id, "quantV2.factorEvidence." + id);
  });
  assert.equal(Catalog.fieldByToken("QUANT_V1_QUALITY").id, "qualityScore");
  assert.equal(Catalog.fieldByToken("QUANT_V1_MOMENTUM").id, "momentumScore");
});

/* ---------------------------------------------------------- the profiles */

test("the shipped profile contract is valid and keeps ranking and history closed", () => {
  const result = StrategyMatch.validateContract(contract);
  assert.deepEqual(result.errors, []);
  assert.ok(result.valid);
  assert.equal(contract.publication.rankingAllowed, false);
  assert.equal(contract.publication.historicalEvidenceAllowed, false);
  assert.equal(contract.thresholdPolicy.fittedToOutcomes, false);
  assert.deepEqual(contract.allowedNamespaces, ["quantV2.factorEvidence"]);
});

test("a profile that reaches into Quant V1 is refused, not silently mixed", () => {
  const mixed = JSON.parse(JSON.stringify(contract));
  mixed.profiles[0].conditions[0].field = "qualityScore";
  const result = StrategyMatch.validateContract(mixed);
  assert.ok(!result.valid);
  assert.match(result.errors.join(" "), /namespace 'quantV1'/);
});

test("condition weights must sum to one, and an unknown field is refused", () => {
  const drifted = JSON.parse(JSON.stringify(contract));
  drifted.profiles[0].conditions[0].weight = 0.5;
  assert.ok(!StrategyMatch.validateContract(drifted).valid);

  const unknown = JSON.parse(JSON.stringify(contract));
  unknown.profiles[0].conditions[0].field = "notAField";
  assert.match(StrategyMatch.validateContract(unknown).errors.join(" "), /unknown field/);
});

test("a profile is one canonical rule predicate, so the same object can screen", () => {
  const profile = contract.profiles.find((p) => p.profileId === "quality-momentum");
  const predicate = StrategyMatch.predicateOf(profile);
  assert.deepEqual(Rules.validate(predicate).errors, []);
  assert.equal(predicate.filters.length, profile.conditions.length);
  /* Identity is stable: the same profile always hashes the same way. */
  assert.equal(Rules.predicateHash(predicate), Rules.predicateHash(StrategyMatch.predicateOf(profile)));
});

/* ---------------------------------------------------------- the matching */

const row = (values) => Object.assign({ ticker: "TST" },
  Object.fromEntries(FactorEvidence.FACTOR_ORDER.map((id, index) => ["quantV2.factorEvidence." + id, values[index]])));

test("a match counts met conditions and names what is missing", () => {
  /* quality 80, growth 60, momentum 80, value 30, profitability 80, revisions null, risk 60 */
  const result = StrategyMatch.evaluate(contract, row([80, 60, 80, 30, 80, null, 60]));
  const qualityMomentum = result.profiles.find((p) => p.profileId === "quality-momentum");
  assert.equal(qualityMomentum.state, "AVAILABLE");
  assert.equal(qualityMomentum.match, 100, "all three conditions are met");
  assert.equal(StrategyMatch.missingConditions(qualityMomentum).length, 0);

  const garp = result.profiles.find((p) => p.profileId === "garp");
  const missing = StrategyMatch.missingConditions(garp);
  assert.ok(missing.some((c) => c.id === "value"), "a value of 30 cannot satisfy the GARP price condition");
  assert.ok(garp.match < 100);
});

test("an unmeasurable condition leaves the denominator instead of counting as a failure", () => {
  const result = StrategyMatch.evaluate(contract, row([80, 60, 80, 30, 80, null, 60]));
  const revisionLeader = result.profiles.find((p) => p.profileId === "earnings-revision-leader");
  const revisions = revisionLeader.conditions.find((c) => c.id === "revisions");
  assert.equal(revisions.state, "NOT_MEASURABLE");
  /* Revisions carries half this profile's weight, so what is left is below
     the minimum and the profile falls closed rather than reporting a match
     built from the remainder. */
  assert.equal(revisionLeader.state, "UNAVAILABLE");
  assert.equal(revisionLeader.reason, "INSUFFICIENT_MEASURABLE_WEIGHT");
  assert.equal(revisionLeader.match, null);
});

test("a title with no evidence at all produces no match anywhere", () => {
  const empty = StrategyMatch.evaluate(contract, row([null, null, null, null, null, null, null]));
  assert.equal(empty.state, "UNAVAILABLE");
  empty.profiles.forEach((profile) => {
    assert.equal(profile.state, "UNAVAILABLE");
    assert.equal(profile.match, null);
  });
});

test("no ranking is published, and no profile claims historical evidence", () => {
  const result = StrategyMatch.evaluate(contract, row([80, 60, 80, 30, 80, null, 60]));
  assert.equal(result.ranking.state, "WITHHELD");
  result.profiles.forEach((profile) => {
    assert.equal(profile.historicalEvidence.state, "UNAVAILABLE");
    assert.equal(profile.historicalEvidence.reason, "BACKTEST_NOT_CERTIFIED");
    assert.equal(profile.percentile, undefined);
    assert.equal(profile.rank, undefined);
  });
});

test("every profile is also a screener query, from the same rule", () => {
  contract.profiles.forEach((profile) => {
    const query = StrategyMatch.screenQuery(profile);
    /* Same predicate in both directions: explaining and selecting cannot
       drift apart, because they are the same object. */
    assert.equal(Rules.predicateHash(Rules.fromQuery(query)),
      Rules.predicateHash(StrategyMatch.predicateOf(profile)), profile.profileId);
    assert.equal(query.filters.length, profile.conditions.length);
    /* The screener accepts it, and it stays inside the V2 methodology. */
    assert.equal(Screener.methodologyOf(query).id, "quantV2Evidence", profile.profileId);
    assert.equal(Screener.methodologyOf(Screener.decode(Screener.encode(query))).id, "quantV2Evidence");
    /* Sorted by the profile's own heaviest condition — presentation order. */
    const heaviest = profile.conditions.slice().sort((a, b) => b.weight - a.weight)[0];
    assert.equal(query.sort[0].field, heaviest.field, profile.profileId);
  });
});

test("a profile query selects the titles that meet every one of its conditions", () => {
  const payload = JSON.parse(gunzipSync(readFileSync(SCREENING)));
  const rows = Object.entries(payload.rows)
    .map(([ticker, values]) => FactorEvidence.screeningRow(ticker, values, payload.fields));
  const profile = contract.profiles.find((p) => p.profileId === "quality-momentum");
  const predicate = StrategyMatch.predicateOf(profile);
  const selected = rows.filter((row) => Rules.matches(row, predicate));
  assert.ok(selected.length > 0, "the shipped universe should contain some Quality Momentum titles");

  /* A selected title must score 100 % on that profile, and an unselected
     one must not — otherwise the rule and the match disagree. */
  selected.slice(0, 20).forEach((row) => {
    const result = StrategyMatch.evaluateProfile(contract, profile, row);
    assert.equal(result.match, 100, row.ticker + " was selected but does not fully match");
  });
  const rejected = rows.filter((row) => !Rules.matches(row, predicate)).slice(0, 20);
  rejected.forEach((row) => {
    const result = StrategyMatch.evaluateProfile(contract, profile, row);
    if (result.state === "AVAILABLE") assert.notEqual(result.match, 100, row.ticker + " fully matches but was not selected");
  });
});

/* ---------------------------------------------------------- the screener */

test("the screener offers the two methodologies separately", () => {
  const ids = Screener.methodologies.map((m) => m.id);
  assert.deepEqual(ids, ["legacy", "quantV2Evidence"]);
  const evidence = Screener.methodology("quantV2Evidence");
  assert.equal(evidence.namespace, "quantV2.factorEvidence");
  assert.equal(evidence.methodologyVersion, "vu-factor-evidence-1.0.0");
  evidence.fields.forEach((field) => assert.equal(field.namespace, "quantV2.factorEvidence"));
  Screener.methodology("legacy").fields.forEach((field) => {
    assert.notEqual(field.namespace, "quantV2.factorEvidence");
  });
});

test("a query mixing the two methodologies is refused", () => {
  assert.throws(() => Screener.build([
    { field: "momentum6m", operator: "gte", value: 0, scale: "raw" },
    { field: "quantV2.factorEvidence.quality", operator: "gte", value: 70, scale: "raw" }
  ]), /INVALID_SCREEN_RULES/);
});

test("a query stays inside one methodology and says which one", () => {
  const legacy = Screener.build([{ field: "momentum6m", operator: "gte", value: 0, scale: "raw" }]);
  assert.equal(Screener.methodologyOf(legacy).id, "legacy");
  const evidence = Screener.build([{ field: "quantV2.factorEvidence.momentum", operator: "gte", value: 70, scale: "raw" }]);
  assert.equal(Screener.methodologyOf(evidence).id, "quantV2Evidence");
  /* A link saved before the split still opens, unchanged. */
  assert.equal(Screener.methodologyOf(Screener.decode(Screener.encode(legacy))).id, "legacy");
});

/* -------------------------------------------------------- the artifact */

test("the screening table publishes canonical field ids and no composite", () => {
  const payload = JSON.parse(gunzipSync(readFileSync(SCREENING)));
  assert.ok(FactorEvidence.validScreening(payload));
  assert.equal(payload.namespace, "quantV2.factorEvidence");
  payload.fields.forEach((id) => {
    assert.ok(Catalog.field(id), "column '" + id + "' is not a catalog field");
    assert.equal(Catalog.field(id).namespace, "quantV2.factorEvidence");
  });
  assert.ok(!payload.fields.some((id) => /composite|rank|quantScore/i.test(id)));
  assert.ok(Object.keys(payload.rows).length > 5000);

  const [ticker, values] = Object.entries(payload.rows)[0];
  const built = FactorEvidence.screeningRow(ticker, values, payload.fields);
  assert.equal(built.ticker, ticker);
  payload.fields.forEach((id) => assert.ok(id in built, "row is missing column " + id));
  /* Revisions is closed for every single title, so its column is all null. */
  const revisionsIndex = payload.fields.indexOf("quantV2.factorEvidence.revisions");
  assert.ok(Object.values(payload.rows).every((entry) => entry[revisionsIndex] === null));
});

test("every shipped profile evaluates against a real published row", () => {
  const payload = JSON.parse(gunzipSync(readFileSync(SCREENING)));
  const [ticker, values] = Object.entries(payload.rows).find(([, entry]) => entry[entry.length - 1] >= 5);
  const result = StrategyMatch.evaluate(contract, FactorEvidence.screeningRow(ticker, values, payload.fields));
  assert.equal(result.profiles.length, contract.profiles.length);
  assert.equal(result.state, "AVAILABLE", ticker + " has five factors and should match something");
  result.profiles.forEach((profile) => {
    assert.ok(StrategyMatch.PROFILE_STATES.includes(profile.state));
    if (profile.state === "AVAILABLE") assert.ok(profile.match >= 0 && profile.match <= 100);
    else assert.ok(StrategyMatch.UNAVAILABLE_REASONS.includes(profile.reason));
  });
});
