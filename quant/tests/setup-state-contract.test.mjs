import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import methodology from "../methodology/setup-state-v1.json" with { type: "json" };

const require = createRequire(import.meta.url);
const Setup = require("../engines/setup-state-contract.js");
const Hash = require("../engines/hash.js");
const base = {
  identity: { instrumentId: "vu_d57074b4128184", securityId: "ref_NVDA", ticker: "NVDA" },
  observedAt: "2026-09-21T22:30:00.000Z", asOf: "2026-09-21", dataCutoff: "2026-09-20",
  technicalRef: { snapshotId: "snap_0123456789abcdef", scenarioId: "sc_0123456789abcdef", setupId: "ts_0123456789abcdef" },
  evidenceRefs: ["snap_0123456789abcdef"],
  provenance: { dataMode: "real", isMock: false, source: "existing-technical-materialization", dataVersion: "dv_0123456789abcdef", methodologyVersions: { technical: "technical-v1.0.0", setupState: "setup-state-v1.0.0" }, parametersHash: "0123456789abcdef" }
};

test("methodology fixes the exact lifecycle and is approved for the point-in-time tier only", () => {
  assert.equal(methodology.status, "ACTIVE_POINT_IN_TIME_ONLY");
  assert.equal(methodology.publication.enabled, true);
  assert.equal(methodology.publication.scope, "POINT_IN_TIME_STATES_ONLY");
  assert.deepEqual(methodology.states, Setup.STATES);
  assert.equal(methodology.requirements.orderedSnapshots, 2);
  assert.equal(methodology.semanticBoundaries.elliottRole, "EVIDENCE_ONLY");
  /* The four gate flags, machine-readable so no consumer has to infer the
     state from prose. */
  assert.equal(methodology.gateStatus.SETUP_MAPPING_V1_APPROVED, "PASS");
  assert.equal(methodology.gateStatus.SNAPSHOT_STATES_ACTIVE, "PASS");
  assert.equal(methodology.gateStatus.PATH_DEPENDENT_STATES_ACTIVE, false);
  assert.equal(methodology.gateStatus.PATH_DEPENDENT_STATES_GATE, "PENDING_HISTORY");
  /* This older contract predates the two tiers; it still refuses to carry
     an available lifecycle of its own, and the Setup Engine is what
     publishes one now. The two are not in conflict - they answer different
     questions - but the flag must not quietly drift to true. */
  assert.equal(Setup.AVAILABLE_OBSERVATIONS_ALLOWED, false);
});

test("one real current snapshot fails closed without inventing a lifecycle", () => {
  const result = Setup.fromCurrentSnapshot(base);
  assert.equal(result.availability.state, "UNAVAILABLE");
  assert.equal(result.availability.reason, "SETUP_STATE_HISTORY_NOT_MATERIALIZED");
  assert.equal(result.setupState, null);
  assert.equal(result.backtestCertification, "NOT_CERTIFIED");
  assert.equal(Setup.validate(result).valid, true);
});

test("identity and content hashes are deterministic and ignore delivery presentation", () => {
  const a = Setup.unavailable(base);
  const b = Setup.unavailable({ ...base, sort: "score", delivery: "watchlist", limit: 10 });
  assert.equal(a.setupStateId, b.setupStateId);
  assert.equal(a.contentHash, b.contentHash);
  assert.deepEqual(base.identity, { instrumentId: "vu_d57074b4128184", securityId: "ref_NVDA", ticker: "NVDA" });
});

test("unknown fields, lifecycle invention and tampering are rejected", () => {
  const valid = Setup.unavailable(base);
  const unknown = structuredClone(valid); unknown.delivery = "alert";
  assert.equal(Setup.validate(unknown).valid, false);
  const invented = structuredClone(valid); invented.setupState = "CONFIRMED";
  assert.equal(Setup.validate(invented).valid, false);
  const tampered = structuredClone(valid); tampered.technicalRef.setupId = "ts_changed";
  assert.ok(Setup.validate(tampered).errors.includes("contentHash mismatch"));
  const malformed = Setup.unavailable(base); malformed.technicalRef.snapshotId = "snap_wrong";
  assert.ok(Setup.validate(malformed).errors.includes("invalid technicalRef"));
  const hiddenMeaning = Setup.unavailable(base); hiddenMeaning.whyNow = { text: "hidden claim" };
  assert.ok(Setup.validate(hiddenMeaning).errors.includes("unavailable meaning must be null"));
  const hiddenRule = Setup.unavailable(base); hiddenRule.ruleRefs = [{ ruleId: "hidden", ruleVersion: "1.0.0", predicateHash: "rule_0123456789abcdef" }];
  assert.ok(Setup.validate(hiddenRule).errors.includes("unavailable rule binding must be empty"));
});

test("an available label without full meaning, rule and evidence fields is rejected", () => {
  const incomplete = Setup.unavailable(base);
  incomplete.availability = { state: "AVAILABLE", reason: null };
  incomplete.setupState = "ACTIVE";
  assert.equal(Setup.validate(incomplete).valid, false);
  assert.ok(Setup.validate(incomplete).errors.includes("invalid available context"));
  assert.ok(Setup.validate(incomplete).errors.includes("invalid ruleRefs"));
});

test("even a fully shaped and correctly sealed AVAILABLE lifecycle is rejected while methodology is inactive", () => {
  const fabricated = Setup.unavailable(base);
  Object.assign(fabricated, {
    availability: { state: "AVAILABLE", reason: null }, setupState: "ACTIVE", previousSetupState: "CONFIRMED",
    transitionObservedAt: base.observedAt, direction: "BULLISH", timeHorizon: "SWING",
    whyNow: { text: "fabricated" }, entryCondition: { text: "fabricated" }, confirmation: { text: "fabricated" },
    invalidation: { text: "fabricated" }, risk: { text: "fabricated" }, exitCondition: { text: "fabricated" },
    ruleRefs: [{ ruleId: "fabricated", ruleVersion: "1.0.0", predicateHash: "rule_0123456789abcdef" }], strategyRef: "fabricated"
  });
  const core = Object.fromEntries(Object.entries(fabricated).filter(([key]) => key !== "setupStateId" && key !== "contentHash"));
  fabricated.contentHash = Hash.hashValue(core);
  fabricated.setupStateId = Hash.prefixedHash("setup", { identity: fabricated.identity, observedAt: fabricated.observedAt, asOf: fabricated.asOf, dataCutoff: fabricated.dataCutoff, contractVersion: fabricated.contractVersion, contentHash: fabricated.contentHash });
  const result = Setup.validate(fabricated);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("setup-state methodology is not active"));
  assert.equal(result.errors.includes("contentHash mismatch"), false);
});

test("technicalRef matches the durable canonical Technical snapshot identifiers", () => {
  const technical = JSON.parse(readFileSync(new URL("../data/technical/instruments/NVDA.json", import.meta.url), "utf8"));
  const technicalRef = { snapshotId: technical.snapshotId, scenarioId: technical.bundle.scenarios.primary.scenarioId, setupId: technical.bundle.tradeSetup.setupId };
  const result = Setup.unavailable({ ...base, technicalRef });
  assert.equal(Setup.validate(result).valid, true);
});

test("mock, future and mismatched temporal provenance fail closed", () => {
  assert.throws(() => Setup.unavailable({ ...base, provenance: { ...base.provenance, isMock: true, dataMode: "mock" } }), /invalid provenance/);
  assert.throws(() => Setup.unavailable({ ...base, asOf: "2026-09-22" }), /future asOf/);
  assert.throws(() => Setup.unavailable({ ...base, dataCutoff: "2026-09-22" }), /dataCutoff after asOf/);
  assert.throws(() => Setup.unavailable({ ...base, identity: { ...base.identity, securityId: "NVDA" } }), /invalid identity/);
});
