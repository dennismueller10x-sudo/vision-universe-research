import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Methodology = require("../engines/methodology.js");
const Contract = require("../engines/quant-methodology-contract.js");
const v1 = require("../methodology/quant-v1.json");
const v2 = require("../methodology/quant-v2.json");

test("Quant V2 is the exact seven-factor constitution and passes its contract", () => {
  assert.deepEqual(Contract.validate(v2), { ok: true, errors: [] });
  assert.deepEqual(v2.factorOrder, Contract.FACTORS);
  assert.deepEqual(v2.factorWeights, Contract.WEIGHTS);
});

test("Quant V2 remains fail-closed until every factor and evidence gate is ready", () => {
  assert.equal(v2.status, "SPECIFIED_NOT_ACTIVE");
  assert.equal(v2.effectiveFrom, null);
  assert.equal(v2.publication.allowed, false);
  assert.equal(v2.publication.fullScoreRequiresEveryFactor, true);
  assert.equal(v2.publication.missingFactorWeightRedistribution, false);
  assert.equal(v2.factors.revisions.readiness, "BLOCKED_EXTERNAL");
});

test("Quant V1 remains the active immutable legacy runtime", () => {
  assert.equal(Methodology.quant().methodologyVersion, "quant-v1.0.0");
  assert.equal(Methodology.quantV2().methodologyVersion, "quant-v2.0.0");
  assert.equal(Methodology.quantV2().modelProfileId, "quant-v2.0.0-full-7f");
  assert.equal(v1.methodologyVersion, "quant-v1.0.0");
  assert.equal(v1.factorWeights.quality, 0.30);
  assert.equal(v1.factors.profitability, undefined);
});

test("no component is owned by two V2 factors", () => {
  const ids = Object.values(v2.factors).flatMap((factor) => factor.components.map((component) => component.id));
  assert.equal(new Set(ids).size, ids.length);
});

test("Quant V2 binds peer levels to current SIC taxonomy without historical inference", () => {
  const binding = v2.normalization.classificationBinding;
  assert.deepEqual([binding.industry, binding.sector, binding.universe], ["sic4_industry", "sic_division", "universe"]);
  assert.equal(binding.scope, "CURRENT_ONLY");
  assert.equal(binding.historicalPolicy, "FAIL_CLOSED");
});

test("contract rejects activation, missing revisions and component overlap", () => {
  const changed = structuredClone(v2);
  changed.status = "ACTIVE";
  changed.publication.allowed = true;
  changed.factors.revisions.readiness = "READY";
  changed.factors.risk.components[0].id = changed.factors.momentum.components[0].id;
  const result = Contract.validate(changed);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("ACTIVATION_LOCK"));
  assert.ok(result.errors.includes("PUBLICATION_LOCK"));
  assert.ok(result.errors.includes("REVISIONS_GATE"));
  assert.ok(result.errors.some((error) => error.startsWith("COMPONENT_REUSED:")));
});
