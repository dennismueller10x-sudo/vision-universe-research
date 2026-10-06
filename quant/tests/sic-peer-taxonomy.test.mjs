import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const Contract = require("../engines/sic-peer-taxonomy.js");
const projection = JSON.parse(readFileSync(new URL("../data/product/sic-peer-taxonomy-v1.json", import.meta.url), "utf8"));

test("official SIC division ranges are deterministic and not mislabeled as GICS", () => {
  assert.equal(Contract.divisionForSic("3571").id, "D");
  assert.equal(Contract.divisionForSic(6021).id, "H");
  assert.equal(Contract.divisionForSic("7372").id, "I");
  assert.equal(Contract.divisionForSic("9999"), null);
  assert.equal(projection.methodologyBinding.sector, "sic_division");
  assert.match(projection.methodologyBinding.note, /not GICS/i);
});

test("methodology minima select SIC4, division, universe, then fail closed", () => {
  assert.deepEqual(Contract.resolvePeerLevel({ sic4_industry: 20, sic_division: 40, universe: 200 }), { level: "sic4_industry", confidence: "HIGH", confidencePenaltyRequired: false });
  assert.equal(Contract.resolvePeerLevel({ sic4_industry: 19, sic_division: 40, universe: 200 }).level, "sic_division");
  assert.deepEqual(Contract.resolvePeerLevel({ sic4_industry: 19, sic_division: 39, universe: 200 }), { level: "universe", confidence: "LOW", confidencePenaltyRequired: true });
  assert.equal(Contract.resolvePeerLevel({ sic4_industry: 19, sic_division: 39, universe: 199 }).level, null);
});

test("committed projection preserves source truth and is current-only", () => {
  assert.deepEqual(Contract.validate(projection), { ok: true, errors: [] });
  assert.equal(projection.snapshotMode, "CURRENT_ONLY");
  assert.equal(projection.historicalClassificationAvailable, false);
  assert.equal(projection.backtestEligible, false);
  assert.equal(projection.scorePublicationAllowed, false);
  assert.ok(projection.rows.length > 1000);
  assert.ok(projection.source.fundamentalsObservedAt);
  assert.equal(projection.source.classificationEffectiveAt, null);
  assert.equal(projection.classificationTime.effectiveAt, null);
  assert.ok(projection.rows.every((packed) => {
    const row = Contract.decodeRow(projection, packed);
    return (row.sicRaw === null || typeof row.sicRaw === "string") && row.sourceShard && row.marketAsOf;
  }));
  assert.equal(projection.counts.projectedSecurities + projection.counts.identityRejected, projection.counts.factorSecurities);
  assert.equal(projection.rejections.length, projection.counts.identityRejected);
  assert.equal(projection.counts.classifiedSecurities + projection.counts.classificationMissing, projection.counts.projectedSecurities);
  assert.equal(projection.identityConflicts.duplicateMasterMembers.length, projection.counts.duplicateMasterMembers);
});

test("projection populations are issuer counts and metric use remains gated", () => {
  const apple = projection.rows.map((row) => Contract.decodeRow(projection, row)).find((row) => row.ticker === "AAPL");
  assert.equal(apple.sic4, "3571");
  assert.equal(apple.sicDivision, "D");
  assert.equal(projection.fallbackPolicy.populationCountsAreUpperBounds, true);
  assert.equal(projection.fallbackPolicy.metricSpecificValidIssuerCountsRequired, true);
  assert.ok(projection.counts.distinctIssuers <= projection.counts.projectedSecurities);
});

test("canonical identity join ignores ticker mutation and ticker duplication", () => {
  const issuerId = "iss_cik_0000320193";
  const instruments = new Map([["ref_AAPL", {
    masterMemberId: "ref_AAPL", issuerId, cik: "0000320193", symbol: "AAPL"
  }]]);
  const fundamentals = new Map([[issuerId, {
    file: "193.json", issuer: { cik: "0000320193", sic: "3571", tickers: ["DUPLICATE"] }
  }]]);
  const mutated = Contract.canonicalMatch({ securityId: "ref_AAPL", ticker: "MUTATED" }, instruments, fundamentals);
  assert.equal(mutated.ok, true);
  assert.equal(mutated.issuerId, issuerId);
  assert.equal(mutated.sic4, "3571");
  const duplicateTickerDifferentIdentity = Contract.canonicalMatch({ securityId: "ref_OTHER", ticker: "AAPL" }, instruments, fundamentals);
  assert.deepEqual(duplicateTickerDifferentIdentity, { ok: false, reason: "MASTER_MEMBER_MISSING" });
  assert.equal(projection.identityJoin.tickerUsedForJoin, false);
});

test("canonical issuer with missing SIC remains universe-only with required penalty", () => {
  const issuerId = "iss_cik_0000320193";
  const identity = new Map([["ref_AAPL", { masterMemberId: "ref_AAPL", issuerId, cik: "0000320193" }]]);
  const fundamentals = new Map([[issuerId, { file: "193.json", issuer: { cik: "0000320193", sic: null } }]]);
  const match = Contract.canonicalMatch({ securityId: "ref_AAPL", ticker: "ANY" }, identity, fundamentals);
  assert.equal(match.ok, true);
  assert.equal(match.classificationMissing, true);
  assert.equal(match.sic4, null);
  const rows = projection.rows.map((row) => Contract.decodeRow(projection, row));
  const missing = rows.filter((row) => row.sic4 === null);
  assert.equal(missing.length, projection.counts.classificationMissing);
  assert.ok(missing.length > 0);
  assert.ok(missing.every((row) => row.sicDivision === null && row.peerLevel === "universe" && row.peerConfidence === "LOW" && row.confidencePenaltyRequired === true));
  const belowMinimum = structuredClone(projection);
  belowMinimum.counts.distinctIssuers = 199;
  assert.ok(Contract.validate(belowMinimum).errors.includes("UNKNOWN_CLASSIFICATION_UNIVERSE_MINIMUM"));
});

test("numeric but taxonomy-invalid SIC remains a classified-unknown universe fallback", () => {
  const issuerId = "iss_cik_0000320193";
  const identity = new Map([["ref_AAPL", { masterMemberId: "ref_AAPL", issuerId, cik: "0000320193" }]]);
  const fundamentals = new Map([[issuerId, { file: "193.json", issuer: { cik: "0000320193", sic: "9999" } }]]);
  const match = Contract.canonicalMatch({ securityId: "ref_AAPL", ticker: "ANY" }, identity, fundamentals);
  assert.equal(match.ok, true);
  assert.equal(match.classificationMissing, true);
  assert.equal(match.sic4, null);
  assert.equal(match.division, null);
});

test("issuer population denominators and peer resolution are validated from rows", () => {
  const industry = structuredClone(projection); industry.industryIssuerCounts["3571"] = 999999;
  assert.ok(Contract.validate(industry).errors.includes("INDUSTRY_ISSUER_COUNTS"));
  const division = structuredClone(projection); division.divisions.D.memberIssuers = 999999;
  assert.ok(Contract.validate(division).errors.includes("DIVISION_ISSUER_COUNTS:D"));
  const peer = structuredClone(projection), appleIndex = peer.rows.findIndex((packed) => Contract.decodeRow(peer, packed).ticker === "AAPL");
  peer.rows[appleIndex][peer.rowColumns.indexOf("peerLevel")] = "universe";
  assert.ok(Contract.validate(peer).errors.some((error) => error.startsWith("PEER_RESOLUTION:")));
});

test("market refresh builds and commits the projection after its dependencies", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/market-data-refresh.yml", import.meta.url), "utf8");
  const factor = workflow.indexOf("node scripts/market/build-market-factors.mjs");
  const taxonomy = workflow.indexOf("node scripts/quant/build-sic-peer-taxonomy.mjs");
  const hygiene = workflow.indexOf("node scripts/market/assert-public-data-hygiene.mjs");
  assert.ok(factor >= 0 && taxonomy > factor && hygiene > taxonomy);
  assert.match(workflow, /quant\/data\/product\/sic-peer-taxonomy-v1\.json/);
});

test("contract rejects historical or score claims and taxonomy rebinding", () => {
  const changed = structuredClone(projection);
  changed.historicalClassificationAvailable = true;
  changed.scorePublicationAllowed = true;
  changed.methodologyBinding.sector = "gics_sector";
  changed.identityJoin.tickerUsedForJoin = true;
  const result = Contract.validate(changed);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("HISTORICAL_FAIL_CLOSED"));
  assert.ok(result.errors.includes("SCORE_PUBLICATION_LOCK"));
  assert.ok(result.errors.includes("METHODOLOGY_BINDING"));
  assert.ok(result.errors.includes("CANONICAL_IDENTITY_JOIN"));
});

test("projection generation time is derived from source observations, not wall clock", () => {
  assert.equal(projection.generatedAt, [projection.source.factorsGeneratedAt, projection.source.fundamentalsObservedAt].sort().at(-1));
  const changed = structuredClone(projection);
  changed.generatedAt = "2099-01-01T00:00:00Z";
  assert.ok(Contract.validate(changed).errors.includes("GENERATED_AT_DERIVATION"));
});
