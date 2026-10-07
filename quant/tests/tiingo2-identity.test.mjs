import test from "node:test";
import assert from "node:assert/strict";
import { listingStatus, resolveListingIdentities, trackNewListings } from "../../scripts/market/tiingo2-identity.mjs";

const asOf = "2026-10-02";
const old = (symbol, extra = {}) => ({ symbol, exchange: "NASDAQ", instrumentId: "vu_12345678901234", masterMemberId: `ref_${symbol}`, legacyIds: [`ref_${symbol}`], companyId: "company-1", securityId: `ref_${symbol}`, listingId: "listing-1", cik: "12345", active: true, startDate: "2010-01-01", ...extra });
const fresh = (ticker, extra = {}) => ({ ticker, exchange: "NASDAQ", startDate: "2010-01-01", endDate: asOf, ...extra });
const resolve = (current, incoming, actions = []) => resolveListingIdentities({ current, fresh: incoming, actions, asOf });

test("fresh metadata keeps existing stable IDs and leaves the baseline untouched", () => {
  const baseline = old("DNA");
  const before = structuredClone(baseline);
  const result = resolve([baseline], [fresh("DNA")]);
  assert.equal(result.decisions[0].state, "EXISTING");
  assert.equal(result.decisions[0].identity.companyId, "company-1");
  assert.equal(result.decisions[0].identity.instrumentId, baseline.instrumentId);
  assert.deepEqual(baseline, before);
});

test("a missing provider listing remains retained without declaring a delisting", () => {
  const result = resolve([old("OLD")], []);
  assert.equal(result.retained.length, 1);
  assert.equal(result.retained[0].active, true);
  assert.equal(result.retained[0].refreshListingStatus, "UNKNOWN");
  assert.equal(result.retained[0].refreshObservation, "PRESENT_IN_VU_BUT_NOT_FRESH");
});

test("a confirmed rename preserves company/security/listing identity and proposes historical aliases", () => {
  const result = resolve([old("OLD", { isin: "US123" })], [fresh("NEW", { isin: "US123" })]);
  const change = result.symbolChanges[0];
  assert.equal(result.decisions[0].state, "SYMBOL_CHANGED");
  assert.equal(change.identity.companyId, "company-1");
  assert.equal(change.identity.listingId, "listing-1");
  assert.equal(change.identity.masterMemberId, "ref_OLD");
  assert.deepEqual(change.legacyIds, ["ref_OLD"]);
  assert.deepEqual(change.symbolAliases, ["OLD"]);
  assert.deepEqual(change.historicalPriceSymbols, ["OLD", "NEW"]);
  assert.deepEqual(change.aliasShardKeys, ["OL", "NE"]);
  assert.ok(change.publicationRequiredChecks.includes("OLD_URL_RESOLUTION"));
});

test("Tiingo symbol-change action confirms a rename, unconfirmed or future actions do not", () => {
  const action = { type: "symbol_change", source: "tiingo", oldTicker: "OLD", newTicker: "NEW", effectiveDate: "2026-09-30", confirmed: true };
  assert.equal(resolve([old("OLD")], [fresh("NEW")], [action]).decisions[0].state, "SYMBOL_CHANGED");
  assert.equal(resolve([old("OLD")], [fresh("NEW")], [{ ...action, confirmed: false }]).decisions[0].state, "NEW_SECURITY");
  assert.equal(resolve([old("OLD")], [fresh("NEW")], [{ ...action, effectiveDate: "2026-10-03" }]).decisions[0].state, "NEW_SECURITY");
});

test("same CIK never collapses GOOG/GOOGL or BRK share classes", () => {
  const result = resolve([old("GOOG", { shareClass: "C" })], [fresh("GOOGL", { cik: "12345", shareClass: "A" })]);
  assert.equal(result.decisions[0].state, "NEW_SECURITY");
  assert.deepEqual(result.decisions[0].reasons, ["EXISTING_ISSUER_DISTINCT_SECURITY"]);
  assert.equal(result.symbolChanges.length, 0);
  const berkshire = resolve([old("BRK.A", { exchange: "NYSE", shareClass: "A" })], [fresh("BRK.B", { exchange: "NYSE", cik: "12345", shareClass: "B" })]);
  assert.equal(berkshire.decisions[0].state, "NEW_SECURITY");
});

test("issuer and security identifier conflicts require manual review instead of stealing an ID", () => {
  for (const extra of [{ cik: "999" }, { isin: "US_DIFFERENT" }, { shareClass: "B" }]) {
    const result = resolve([old("DNA", { isin: "US_ORIGINAL", shareClass: "A" })], [fresh("DNA", extra)]);
    assert.equal(result.decisions[0].state, "MANUAL_REVIEW");
    assert.ok(result.decisions[0].reasons.includes("SYMBOL_COLLISION"));
    assert.equal(result.retained.length, 1);
  }
});

test("active historic same-ticker listing periods cannot steal the current security identity", () => {
  const result = resolve([old("DNA", { startDate: "2021-09-17" })], [fresh("DNA", { startDate: "2000-01-03" })]);
  assert.equal(result.decisions[0].state, "MANUAL_REVIEW");
  assert.ok(result.decisions[0].reasons.includes("LISTING_PERIOD_CONFLICT"));
  assert.equal(result.decisions[0].startDate, "2000-01-03");
  assert.equal(result.decisions[0].listingKey, "NASDAQ|DNA|2000-01-03");
  const canonical = old("DNA", { instrumentId: "vu_current", startDate: "2021-09-17" });
  const historic = old("DNA", { instrumentId: "vu_historic", startDate: "2000-01-03" });
  const selected = resolve([historic, canonical], [fresh("DNA", { startDate: "2021-09-17" })]);
  assert.equal(selected.decisions[0].identity.instrumentId, "vu_current");
});

test("reused inactive ticker becomes a new security while historical identity survives", () => {
  const result = resolve([old("Q", { active: false, endDate: "2014-01-01" })], [fresh("Q", { startDate: "2026-06-01" })]);
  assert.equal(result.decisions[0].state, "NEW_SECURITY");
  assert.deepEqual(result.decisions[0].reasons, ["REUSED_TICKER"]);
  assert.equal(result.retained[0].instrumentId, "vu_12345678901234");
});

test("explicit delisting/merger evidence identifies reuse even without an active boolean", () => {
  for (const statusField of ["listingStatus", "active_status"]) {
    const result = resolve([old("Q", { active: undefined, [statusField]: "DELISTED", endDate: "2014-01-01" })], [fresh("Q", { startDate: "2026-06-01" })]);
    assert.deepEqual(result.decisions[0].reasons, ["REUSED_TICKER"]);
    assert.equal(result.retained.length, 1);
  }
});

test("provider duplicates and ambiguous durable identifier matches cannot auto-publish", () => {
  const duplicate = resolve([old("DNA")], [fresh("DNA"), fresh("DNA")]);
  assert.equal(duplicate.decisions.filter((row) => row.state === "DUPLICATE").length, 1);
  const ambiguous = resolve([old("OLD", { isin: "US123" }), old("OTHER", { isin: "US123", instrumentId: "vu_22345678901234" })], [fresh("NEW", { isin: "US123" })]);
  assert.equal(ambiguous.decisions[0].state, "MANUAL_REVIEW");
  assert.equal(ambiguous.symbolChanges.length, 0);
  const newDuplicates = resolve([], [fresh("CRCL"), fresh("CRCL")]);
  assert.equal(newDuplicates.decisions.filter((row) => row.state === "DUPLICATE").length, 1);
});

test("contradictory same-period provider rows both require review", () => {
  const result = resolve([old("DNA")], [fresh("DNA", { cik: "12345" }), fresh("DNA", { cik: "54321" })]);
  assert.ok(result.decisions.every((row) => row.state === "MANUAL_REVIEW"));
  assert.ok(result.decisions.every((row) => row.reasons.includes("PROVIDER_LISTING_COLLISION")));
  assert.equal(result.retained.length, 1);
});

test("old and new simultaneous listings cannot be mistaken for a rename", () => {
  const result = resolve([old("OLD", { isin: "US123" })], [fresh("OLD", { isin: "US123" }), fresh("NEW", { isin: "US123" })], [{ type: "symbol_change", source: "tiingo", confirmed: true, oldTicker: "OLD", newTicker: "NEW", effectiveDate: "2026-10-01" }]);
  assert.equal(result.symbolChanges.length, 0);
  assert.ok(result.decisions.some((row) => row.state === "MANUAL_REVIEW"));
});

test("last-price date alone indicates inactivity, never proves merger/delisting", () => {
  assert.equal(listingStatus(fresh("A"), { asOf }), "ACTIVE");
  assert.equal(listingStatus(fresh("A", { endDate: "2026-08-01" }), { asOf }), "INACTIVE");
  assert.equal(listingStatus({ ticker: "A" }, { asOf }), "UNKNOWN");
  assert.equal(listingStatus({ ticker: "A", listingStatus: "DELISTED" }, { asOf }), "DELISTED");
  assert.equal(listingStatus({ ticker: "A", listingStatus: "MERGED" }, { asOf }), "MERGED");
});

test("new-listing registry resumes idempotently and measures inclusion delay without fabricating provider latency", () => {
  const ipo = fresh("CRCL", { startDate: "2026-10-01" });
  const args = { fresh: [ipo], discoveredAt: "2026-10-02T07:00:00Z", runId: "refresh-1" };
  const first = trackNewListings(args);
  assert.deepEqual(trackNewListings({ ...args, previous: first }), first);
  const second = trackNewListings({ fresh: [ipo], previous: first, discoveredAt: "2026-10-03T07:00:00Z", runId: "refresh-2", accepted: [{ ticker: "CRCL", includedAt: "2026-10-03" }] });
  assert.equal(second.records[0].firstDiscoveredAt, args.discoveredAt);
  assert.equal(second.records[0].firstRunId, "refresh-1");
  assert.equal(second.records[0].listingToDiscoveryDays, 1);
  assert.equal(second.records[0].discoveryToInclusionDays, 1);
  assert.equal(second.records[0].providerLatencyDays, null);
  assert.equal(second.records[0].providerLatencyState, "UNAVAILABLE_PROVIDER_TIMESTAMP");
  const listingDateOnly = trackNewListings({ ...args, fresh: [{ ...ipo, providerListingDate: "2026-10-01" }] });
  assert.equal(listingDateOnly.records[0].providerLatencyDays, null);
  const providerEvidence = trackNewListings({ ...args, fresh: [{ ...ipo, providerAddedAt: "2026-10-02" }] });
  assert.equal(providerEvidence.records[0].providerLatencyDays, 1);
  assert.equal(trackNewListings({ fresh: [], previous: second, discoveredAt: "2026-10-04", runId: "refresh-3" }).records.length, 1);
});

test("distinct IPOs and ticker generations survive reordered observations", () => {
  const rows = [fresh("FIG", { startDate: "2026-09-01" }), fresh("CRCL", { startDate: "2026-09-02" }), fresh("Q", { startDate: "2010-01-01" }), fresh("Q", { startDate: "2026-06-01" })];
  const args = { discoveredAt: asOf, runId: "refresh-1" };
  assert.deepEqual(trackNewListings({ ...args, fresh: rows }), trackNewListings({ ...args, fresh: rows.toReversed() }));
  assert.equal(trackNewListings({ ...args, fresh: rows }).records.length, 4);
});
