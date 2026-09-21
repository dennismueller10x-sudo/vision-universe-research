import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { buildProductCapabilities, CAPABILITIES, VERSION } from "../../scripts/vu2/build-product-capabilities.mjs";

const require = createRequire(import.meta.url);
const Contract = require("../engines/product-capabilities.js");
const root = new URL("../../", import.meta.url).pathname;

test("compact projection exactly covers the canonical product universe", () => {
  const payload = buildProductCapabilities({ root, write: false });
  assert.equal(payload.version, VERSION);
  assert.deepEqual(payload.capabilities, CAPABILITIES);
  assert.equal(Object.keys(payload.rows).length, payload.counts.productUniverse);
  assert.ok(Object.keys(payload.rows).length > 6000);
  assert.equal(Contract.validate(payload), true);
});

test("capability bitset preserves measured availability and identity", () => {
  const payload = buildProductCapabilities({ root, write: false });
  const matrix = JSON.parse(readFileSync(new URL("../data/market/capabilities/matrix.json", import.meta.url)));
  for (const ticker of ["AAPL", "TSLA", "ASML", "NVDA"]) {
    const source = matrix.rows.find((row) => row.ticker === ticker && row.inProductUniverse);
    const decoded = Contract.get(payload, ticker, source.securityId);
    assert.equal(decoded.status, "OK");
    for (const capability of CAPABILITIES) assert.equal(decoded.capabilities[capability], source[capability], `${ticker}:${capability}`);
  }
});

test("projection is compact and rejects drifted or mismatched identities", () => {
  const payload = buildProductCapabilities({ root, write: false });
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 500_000);
  assert.equal(Contract.get(payload, "AAPL", "ref_WRONG").status, "NOT_IN_PRODUCT_UNIVERSE");
  const changed = structuredClone(payload); changed.capabilities.reverse();
  assert.equal(Contract.validate(changed), false);
  const badTime = structuredClone(payload); badTime.source.generatedAt = "2020-01-01T00:00:00.000Z";
  assert.equal(Contract.validate(badTime), false);
  const futureTime = structuredClone(payload); futureTime.generatedAt = futureTime.source.generatedAt = "2099-01-01T00:00:00.000Z";
  assert.equal(Contract.validate(futureTime), false);
  const badMask = structuredClone(payload); badMask.rows.A[1] = 2 ** CAPABILITIES.length;
  assert.equal(Contract.validate(badMask), false);
  const duplicateIdentity = structuredClone(payload); duplicateIdentity.rows.AA[0] = duplicateIdentity.rows.A[0];
  assert.equal(Contract.validate(duplicateIdentity), false);
  const driftedCount = structuredClone(payload); driftedCount.counts.factorEligible += 1;
  assert.equal(Contract.validate(driftedCount), false);
  const driftedMeasured = structuredClone(payload); driftedMeasured.measuredCounts.HAS_FACTORS += 1;
  assert.equal(Contract.validate(driftedMeasured), false);
});

test("committed projection is reproducible from the existing capability matrix", () => {
  const expected = buildProductCapabilities({ root, write: false });
  const committed = JSON.parse(readFileSync(new URL("../data/product/capabilities-v1.json", import.meta.url)));
  assert.deepEqual(committed, expected);
  assert.ok(statSync(new URL("../data/product/capabilities-v1.json", import.meta.url)).size < 500_000);
});
