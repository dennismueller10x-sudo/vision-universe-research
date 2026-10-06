/** Incremental Tiingo identity and listing observation. No production writes.
 * CIK identifies an issuer, never a share class. Names are review evidence only.
 * An absent discovery row never proves a delisting.
 */
import { createHash } from "node:crypto";

export const IDENTITY_VERSION = "tiingo2-identity-1.0.0";
const text = (value) => String(value ?? "").trim();
const upper = (value) => text(value).toUpperCase();
const ticker = (row) => upper(row.ticker || row.symbol || row.providerSymbol);
const exchange = (row) => upper(row.exchange);
const date = (value) => {
  const day = text(value).slice(0, 10);
  const timestamp = Date.parse(day);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(timestamp)
    && new Date(timestamp).toISOString().slice(0, 10) === day ? day : null;
};
const firstTrade = (row) => date(row.startDate || row.firstTradeDate);
const lastTrade = (row) => date(row.endDate || row.lastTradeDate);
const cik = (row) => /^\d{1,10}$/.test(text(row.cik)) ? text(row.cik).padStart(10, "0") : null;
const securityIds = ["figi", "isin", "cusip"];
const classOf = (row) => upper(row.shareClass || row.share_class);
const key = (row) => `${exchange(row)}|${ticker(row)}`;
const copy = (value) => structuredClone(value);
const sortRows = (rows) => [...rows].sort((a, b) =>
  key(a).localeCompare(key(b), "en") || JSON.stringify(a).localeCompare(JSON.stringify(b), "en"));
const digest = (value) => createHash("sha256").update(value).digest("hex").slice(0, 20);

function conflicts(a, b) {
  const reasons = securityIds.filter((field) => upper(a[field]) && upper(b[field]) && upper(a[field]) !== upper(b[field]))
    .map((field) => `${field.toUpperCase()}_CONFLICT`);
  if (cik(a) && cik(b) && cik(a) !== cik(b)) reasons.push("CIK_CONFLICT");
  if (classOf(a) && classOf(b) && classOf(a) !== classOf(b)) reasons.push("SHARE_CLASS_CONFLICT");
  return reasons;
}

export function listingStatus(row, { asOf, staleDays = 10 } = {}) {
  const status = upper(row.listingStatus || row.listing_status || row.active_status || row.activeStatus);
  if (["MERGED", "RENAMED", "DELISTED", "INACTIVE"].includes(status)) return status;
  if (row.active === false || row.isActive === false) return "INACTIVE";
  const end = lastTrade(row), today = date(asOf);
  // supported_tickers endDate is last observed price, not a delisting event.
  if (end && today && (Date.parse(today) - Date.parse(end)) / 86400000 > staleDays) return "INACTIVE";
  if (row.active === true || row.isActive === true || status === "ACTIVE" || (end && today && end <= today)) return "ACTIVE";
  return "UNKNOWN";
}

function retainedIdentity(row) {
  const fields = ["company_id", "companyId", "issuerId", "securityId", "instrumentId", "masterMemberId", "listingId", "listing_id", "cik", "generation", "firstSeen", "legacyIds"];
  return Object.fromEntries(fields.filter((field) => row[field] !== undefined).map((field) => [field, copy(row[field])]));
}

function actionMatches(action, old, fresh, asOf) {
  return upper(action.type || action.eventType) === "SYMBOL_CHANGE"
    && action.confirmed === true && upper(action.source || action.provider) === "TIINGO"
    && ticker({ ticker: action.oldTicker }) === ticker(old)
    && ticker({ ticker: action.newTicker }) === ticker(fresh)
    && date(action.effectiveDate) && date(action.effectiveDate) <= date(asOf)
    && (!action.instrumentId || action.instrumentId === old.instrumentId)
    && (!action.oldExchange || upper(action.oldExchange) === exchange(old))
    && (!action.newExchange || upper(action.newExchange) === exchange(fresh));
}

/** Resolve listings without inventing a company/security identity.
 * Returns decisions and rename/alias proposals; caller must pass publication QA.
 * Raw members may be supplied, but canonical instruments preserve all ID fields.
 */
export function resolveListingIdentities({ fresh = [], current = [], actions = [], asOf } = {}) {
  if (!date(asOf)) throw new Error("IDENTITY_AS_OF_REQUIRED");
  const baseline = sortRows(current), incoming = sortRows(fresh), decisions = [], symbolChanges = [];
  const freshKeys = new Set(incoming.map(key));
  const byKey = new Map(), byCik = new Map(), byName = new Map(), bySecurityIdentifier = new Map(), byOldTicker = new Map();
  const add = (index, value, row) => { if (value) index.set(value, [...(index.get(value) || []), row]); };
  for (const old of baseline) {
    add(byKey, key(old), old); add(byCik, cik(old), old);
    add(byName, upper(old.name || old.companyName), old); add(byOldTicker, ticker(old), old);
    for (const field of securityIds) if (upper(old[field])) add(bySecurityIdentifier, `${field}:${upper(old[field])}`, old);
  }
  const observations = new Map();
  for (const row of incoming) add(observations, `${key(row)}|${firstTrade(row) || "unknown"}`, row);
  const seen = new Set(), observedListings = new Set();
  const make = (row, state, reasons, previous = null, extra = {}) => ({
    ticker: ticker(row), exchange: exchange(row), startDate: firstTrade(row), endDate: lastTrade(row),
    listingKey: `${key(row)}|${firstTrade(row) || "unknown"}`, state, reasons,
    identity: previous ? retainedIdentity(previous) : null,
    listingStatus: listingStatus(row, { asOf }), ...extra
  });
  for (const row of incoming) {
    const observationKey = `${key(row)}|${firstTrade(row) || "unknown"}`;
    const observationConflicts = [...new Set((observations.get(observationKey) || []).flatMap((other) => [
      ...conflicts(other, row),
      ...(upper(other.assetType) && upper(row.assetType) && upper(other.assetType) !== upper(row.assetType) ? ["ASSET_TYPE_CONFLICT"] : [])
    ]))];
    if (observationConflicts.length) {
      decisions.push(make(row, "MANUAL_REVIEW", ["PROVIDER_LISTING_COLLISION", ...observationConflicts])); continue;
    }
    if (observedListings.has(observationKey)) {
      decisions.push(make(row, "DUPLICATE", ["DUPLICATE_PROVIDER_LISTING"])); continue;
    }
    observedListings.add(observationKey);
    const same = byKey.get(key(row)) || [];
    const generationCompatible = same.filter((old) => !(["INACTIVE", "DELISTED", "MERGED", "RENAMED"].includes(listingStatus(old, { asOf })) && lastTrade(old)
      && firstTrade(row) && firstTrade(row) > lastTrade(old) && firstTrade(row) !== firstTrade(old)));
    const periodConflict = (old) => firstTrade(old) && firstTrade(row) && firstTrade(old) !== firstTrade(row);
    const matches = generationCompatible.filter((old) => !conflicts(old, row).length && !periodConflict(old));
    if (matches.length === 1) {
      if (seen.has(matches[0])) decisions.push(make(row, "DUPLICATE", ["DUPLICATE_PROVIDER_LISTING"], matches[0]));
      else { decisions.push(make(row, "EXISTING", ["EXACT_PROVIDER_LISTING"], matches[0])); seen.add(matches[0]); }
      continue;
    }
    if (generationCompatible.length) {
      decisions.push(make(row, "MANUAL_REVIEW", [matches.length > 1 ? "AMBIGUOUS_LISTING_GENERATION" : "SYMBOL_COLLISION", ...new Set(generationCompatible.flatMap((old) => [...conflicts(old, row), ...(periodConflict(old) ? ["LISTING_PERIOD_CONFLICT"] : [])]))]));
      continue;
    }
    if (same.length) { decisions.push(make(row, "NEW_SECURITY", ["REUSED_TICKER"], null, { previousIdentityIds: same.map(retainedIdentity) })); continue; }
    const actionCandidates = actions.filter((action) => upper(action.newTicker) === ticker(row))
      .flatMap((action) => byOldTicker.get(upper(action.oldTicker)) || []);
    const identifierCandidates = securityIds.flatMap((field) => upper(row[field])
      ? bySecurityIdentifier.get(`${field}:${upper(row[field])}`) || [] : []);
    const renameMatches = [...new Set([...actionCandidates, ...identifierCandidates])].filter((old) => ticker(old) !== ticker(row) && !conflicts(old, row).length && (
      actions.some((action) => actionMatches(action, old, row, asOf))
      || (exchange(old) === exchange(row) && !freshKeys.has(key(old))
        && securityIds.some((field) => upper(row[field]) && upper(row[field]) === upper(old[field])))
    ));
    if (renameMatches.length === 1 && !seen.has(renameMatches[0])) {
      const old = renameMatches[0];
      const oldStillActive = incoming.some((item) => key(item) === key(old) && listingStatus(item, { asOf }) !== "INACTIVE");
      if (oldStillActive) { decisions.push(make(row, "MANUAL_REVIEW", ["SIMULTANEOUS_LISTINGS_REQUIRE_REVIEW"], old)); continue; }
      const action = actions.find((item) => actionMatches(item, old, row, asOf));
      const change = {
        oldTicker: ticker(old), newTicker: ticker(row), oldExchange: exchange(old), newExchange: exchange(row),
        state: "CONFIRMED_RENAME", identity: retainedIdentity(old),
        effectiveDate: action ? date(action.effectiveDate) : null,
        observedAt: date(asOf), evidence: action ? "CONFIRMED_TIINGO_ACTION" : "MATCHING_SECURITY_IDENTIFIER",
        legacyIds: [...new Set([...(old.legacyIds || []), old.securityId, old.masterMemberId].filter(Boolean))],
        symbolAliases: [...new Set([...(old.symbolAliases || []), ticker(old)])],
        historicalPriceSymbols: [...new Set([...(old.historicalPriceSymbols || []), ticker(old), ticker(row)])],
        aliasShardKeys: [...new Set([ticker(old), ticker(row)].map((value) => value.replace(/[^A-Z0-9]/g, "_").slice(0, 2).padEnd(2, "_")))],
        publicationRequiredChecks: ["ALIAS_INDEX_RESOLUTION", "HISTORY_CONTINUITY", "WATCHLIST_ID_PRESERVATION", "OLD_URL_RESOLUTION"]
      };
      symbolChanges.push(change); seen.add(old);
      decisions.push(make(row, "SYMBOL_CHANGED", [change.evidence], old, { aliasProposal: change }));
      continue;
    }
    if (renameMatches.length) { decisions.push(make(row, "MANUAL_REVIEW", ["AMBIGUOUS_SECURITY_IDENTITY"])); continue; }
    const issuerCandidates = byCik.get(cik(row)) || [];
    const nameCandidates = byName.get(upper(row.name || row.companyName)) || [];
    decisions.push(make(row, "NEW_SECURITY", [issuerCandidates.length ? "EXISTING_ISSUER_DISTINCT_SECURITY" : "IDENTITY_EVIDENCE_INCOMPLETE"], null, {
      issuerId: cik(row) ? `iss_cik_${cik(row)}` : null,
      possibleRenameTickers: nameCandidates.filter((old) => !freshKeys.has(key(old))).map(ticker),
      reviewRequired: nameCandidates.some((old) => !freshKeys.has(key(old)))
    }));
  }
  const retained = baseline.filter((old) => !seen.has(old)).map((old) => ({
    ...copy(old), refreshObservation: freshKeys.has(key(old)) ? "REVIEW" : "PRESENT_IN_VU_BUT_NOT_FRESH",
    refreshListingStatus: freshKeys.has(key(old)) ? listingStatus(old, { asOf }) : "UNKNOWN"
  }));
  return { version: IDENTITY_VERSION, asOf: date(asOf), decisions, symbolChanges, retained,
    counts: { current: current.length, observed: fresh.length, symbolChanges: symbolChanges.length, retainedWithoutDeletion: retained.length } };
}

/** Cumulative observation registry. Keep first discovery even on resumptions,
 * missing rows, and later publications. Dates measure observed coverage latency;
 * they cannot attribute latency to the provider without a provider timestamp.
 */
export function trackNewListings({ fresh = [], previous = [], accepted = [], discoveredAt, runId } = {}) {
  if (!date(discoveredAt) || !text(runId)) throw new Error("DISCOVERY_PROVENANCE_REQUIRED");
  const oldRows = Array.isArray(previous) ? previous : previous.records || [];
  const records = new Map(oldRows.map((row) => [row.observationId, copy(row)]));
  const acceptedRows = Array.isArray(accepted) ? accepted : [];
  for (const row of sortRows(fresh)) {
    const symbol = ticker(row), venue = exchange(row), start = firstTrade(row);
    const observationId = `tl_${digest(`tiingo|${venue}|${symbol}|${start || "unknown"}`)}`;
    const old = records.get(observationId);
    const inclusion = acceptedRows.find((item) => ticker(item) === symbol && (!exchange(item) || exchange(item) === venue));
    const includedAt = old?.includedAt || (inclusion ? date(inclusion.includedAt || inclusion.inclusionDate) : null);
    const firstDiscoveredAt = old?.firstDiscoveredAt || discoveredAt;
    // first trading date is not the date when Tiingo first exposed the row.
    const providerObservedAt = date(row.providerListedAt || row.providerAddedAt);
    records.set(observationId, {
      ...(old || {}), observationId, ticker: symbol, exchange: venue, provider: "tiingo",
      providerListingDate: start, providerListedAt: providerObservedAt,
      firstDiscoveredAt, lastDiscoveredAt: discoveredAt,
      firstRunId: old?.firstRunId || runId, lastRunId: runId,
      includedAt, listingStatus: listingStatus(row, { asOf: discoveredAt }),
      listingToDiscoveryDays: start ? Math.max(0, (Date.parse(date(firstDiscoveredAt)) - Date.parse(start)) / 86400000) : null,
      discoveryToInclusionDays: includedAt ? Math.max(0, (Date.parse(includedAt) - Date.parse(date(firstDiscoveredAt))) / 86400000) : null,
      providerLatencyDays: start && providerObservedAt ? Math.max(0, (Date.parse(providerObservedAt) - Date.parse(start)) / 86400000) : null,
      providerLatencyState: providerObservedAt ? "MEASURED" : "UNAVAILABLE_PROVIDER_TIMESTAMP"
    });
  }
  return { version: IDENTITY_VERSION, discoveredAt, runId,
    records: [...records.values()].sort((a, b) => a.observationId.localeCompare(b.observationId, "en")) };
}
