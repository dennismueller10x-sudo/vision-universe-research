import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildReviewClusters, buildReviewResolutionPlan, buildCanonicalEuropeGraph,
  readPinnedBaseline, writePrivateReviewArtifacts, REVIEW_CLUSTERS } from '../../../scripts/marketstack/europe-review-resolution.mjs';
import { buildPrioritizedRefreshPlan, diagnoseCurrentAdmission } from '../../../scripts/marketstack/europe-review-resolution.mjs';
import { validateEurope21EvidenceSummary } from '../../../scripts/marketstack/europe-build-evidence.mjs';

const isin = 'DE0005545503', lei = '5299003VKVDCUPSS5X23', sha = 'a'.repeat(64);
const candidate = (overrides = {}) => ({ listingKey: 'marketstack:XETR:AAA.DE', providerSymbol: 'AAA.DE', mic: 'XETR',
  isin, companyKey: 'LEI:' + lei, issuerCountry: 'DE', status: 'REVIEW', reasons: ['PRIMARY_LISTING_UNRESOLVED'],
  active: null, kind: null, shareClassDetail: 'UNKNOWN', primaryMic: null, canonicalTicker: 'AAA.DE.XETR',
  identityEvidence: [{ verified: true, isin, lei, issuerName: 'Exact Issuer AG', issuerCountry: 'DE', mic: 'XETR',
    active: true, officialInstrumentType: 'CS', typeSource: 'XETRA_REFERENCE', provenance: { xetra: { sha256: sha } } }], ...overrides });
const universe = rows => ({ generatedAt: '2026-10-08T17:09:00Z', publicationAllowed: false, mode: 'PRIVATE_RESEARCH', candidates: rows });

test('all20 labels are emitted and primary counts conserve every review key independently of input order', () => {
  const a = candidate(), b = candidate({ listingKey: 'marketstack:XLON:BBB.L', mic: 'XLON', providerSymbol: 'BBB.L', isin: null,
    companyKey: null, identityEvidence: [], issuerCountry: null });
  const input = { baselineUniverse: universe([a, b]), freshness: { rows: [{ listingKey: a.listingKey, status: 'STALE' }] } };
  const result = buildReviewClusters(input), reversed = buildReviewClusters({ ...input, baselineUniverse: universe([b, a]) });
  assert.equal(result.clusters.length, 20); assert.deepEqual(result.clusters.map(c => c.cluster), REVIEW_CLUSTERS);
  assert.equal(result.counts.primaryTotal, 2); assert.ok(result.counts.multiLabelTotal > 2);
  assert.deepEqual(result, reversed); assert.equal(result.counts.knownReviewCompanies, 1);
  assert.equal(result.rows.find(r => r.listingKey === a.listingKey).primaryCluster, 'STALE_EOD');
});

test('sameMIC aliases are duplicate risk, not multiple listings or companies', () => {
  const rows = [candidate(), candidate({ listingKey: 'marketstack:XETR:AAA', providerSymbol: 'AAA' })];
  const result = buildReviewClusters({ baselineUniverse: universe(rows) });
  assert.equal(result.counts.knownReviewCompanies, 1); assert.equal(result.counts.knownReviewSecurities, 1);
  assert.ok(result.rows.every(r => r.labels.includes('ALIAS_UNRESOLVED') && r.labels.includes('DUPLICATE_RISK')));
  assert.ok(result.rows.every(r => !r.labels.includes('MULTIPLE_LISTINGS')));
});

test('same exactISIN on differentMICs is multiplelisting evidence, not MICmismatch', () => {
  const result = buildReviewClusters({ baselineUniverse: universe([candidate(), candidate({
    listingKey: 'marketstack:XFRA:AAA', providerSymbol: 'AAA', mic: 'XFRA', isPrimary: false, primaryMic: 'XETR'
  })]) });
  assert.ok(result.rows.every(r => r.labels.includes('MULTIPLE_LISTINGS')));
  assert.ok(result.rows.every(r => !r.labels.includes('MIC_MISMATCH')));
  assert.ok(result.rows.find(r => r.mic === 'XFRA').labels.includes('SECONDARY_LISTING'));
});

test('checksum-invalid identities are missing; expectedISIN or equalnames never fabricate identity', () => {
  const r = candidate({ isin: 'DE0005545504', expectedIsin: isin, companyKey: 'LEI:5299003VKVDCUPSS5X24', identityEvidence: [] });
  const result = buildReviewClusters({ baselineUniverse: universe([r]) });
  assert.equal(result.counts.knownReviewCompanies, 0); assert.equal(result.counts.knownReviewSecurities, 0);
  assert.ok(result.rows[0].labels.includes('MISSING_ISIN')); assert.ok(result.rows[0].labels.includes('MISSING_LEI'));
  assert.equal(result.rows[0].primaryCluster, 'MISSING_ISIN'); assert.equal(result.rows[0].expectedIsin, isin);
});

test('official exactCS distinguishes policy missing from asset-type uncertainty without overriding conflict', () => {
  const a = candidate(), b = candidate({ listingKey: 'marketstack:XETR:BBB.DE', reasons: ['CONFLICTING_INSTRUMENT_TYPE'] });
  const result = buildReviewClusters({ baselineUniverse: universe([a, b]) });
  assert.ok(!result.rows[0].labels.includes('ASSET_TYPE_UNCLEAR')); assert.ok(!result.rows[0].labels.includes('INACTIVE_STATUS_UNCLEAR'));
  assert.ok(result.rows[1].labels.includes('ASSET_TYPE_UNCLEAR'));
});

test('unknownhistory is null, not short or zero; quarantined OHLC adds exact secondary root', () => {
  const a = candidate(), b = candidate({ listingKey: 'marketstack:XETR:BBB.DE' });
  const result = buildReviewClusters({ baselineUniverse: universe([a, b]), priceQuality: { rows: [{ listingKey: b.listingKey,
    history: { observations: 20 }, quality: { quarantine: [{ reasons: ['IMPOSSIBLE_OHLC'] }] } }] } });
  assert.equal(result.rows[0].historyObservations, null); assert.ok(!result.rows[0].labels.includes('SHORT_HISTORY'));
  assert.ok(result.rows[1].labels.includes('SHORT_HISTORY')); assert.ok(result.rows[1].labels.includes('INVALID_OHLC'));
});

test('duplicate candidates and foreign or identity-conflicting overlays fail closed', () => {
  const a = candidate(); assert.throws(() => buildReviewClusters({ baselineUniverse: universe([a, a]) }), /DUPLICATE/);
  assert.throws(() => buildReviewClusters({ baselineUniverse: universe([a]), freshness: { rows: [{ listingKey: 'other' }] } }), /FOREIGN/);
  assert.throws(() => buildReviewClusters({ baselineUniverse: universe([a]), freshness: { rows: [{ listingKey: a.listingKey, mic: 'XNYS' }] } }), /IDENTITY/);
});

test('index prioritization is exact priorISIN query evidence; no promotion from immutable old snapshot', () => {
  const baselineUniverse = universe([candidate()]), clusters = buildReviewClusters({ baselineUniverse });
  const plan = buildReviewResolutionPlan({ baselineUniverse, clusters, indexCoverage: { rows: [{ index: 'DAX',
    status: 'EXACT_ISIN_OFFICIAL_ROSTER_JOIN', missingIsins: [isin] }] } });
  assert.equal(plan.rows[0].priority, 1); assert.equal(plan.rows[0].automaticAcceptanceAllowed, false);
  assert.deepEqual(plan.counts, { start: 1, accepted: 0, stillReview: 1, rejected: 0 });
  const foreign = structuredClone(clusters); foreign.rows[0].listingKey = 'foreign';
  assert.throws(() => buildReviewResolutionPlan({ baselineUniverse, clusters: foreign }), /KEY_OR_IDENTITY/);
});

test('priority refresh deduplicates native aliases to one classMIC and enforces caller caps', () => {
  const a = candidate({ observations: [{ normalized: { providerTicker: 'AAA.DE', mic: 'XETR' } }] });
  const b = candidate({ listingKey: 'marketstack:XETR:AAA.XETR', providerSymbol: 'AAA.XETR' });
  const baselineUniverse = universe([a, b]), clusters = buildReviewClusters({ baselineUniverse });
  const resolution = buildReviewResolutionPlan({ baselineUniverse, clusters });
  const plan = buildPrioritizedRefreshPlan({ baselineUniverse, resolution, maxGermany: 1, maxEurope: 0 });
  assert.equal(plan.candidates.length, 1); assert.equal(plan.metadataOperations[0].symbol, 'AAA.DE');
  assert.equal(plan.candidates[0].issuerCountry, 'DE'); assert.equal(plan.candidates[0].scopedMetadataObserved, true);
  assert.deepEqual(plan.freshIdentityTargets, [isin]); assert.equal(plan.publicationAllowed, false);
  assert.throws(() => buildPrioritizedRefreshPlan({ baselineUniverse, resolution, maxGermany: Infinity }), /BOUNDED/);
  const rejected = candidate({ status: 'REJECTED', kind: 'ETF', reasons: ['EXCLUDED_INSTRUMENT_TYPE'] });
  assert.equal(buildPrioritizedRefreshPlan({ baselineUniverse: universe([rejected]), resolution: { rows: [] } }).candidates.length, 0);
});

test('foreign home listing never inherits regulatory liquidity from Xetra reference', () => {
  const r = candidate({ mic: 'XSWX', listingKey: 'marketstack:XSWX:AAA.SW', providerSymbol: 'AAA.SW',
    identityEvidence: [{ ...candidate().identityEvidence[0], mic: 'XSWX', officialReferenceMic: 'XETR', regulatoryLiquid: true }] });
  const result = buildReviewClusters({ baselineUniverse: universe([r]) });
  assert.ok(result.rows[0].labels.includes('LIQUIDITY_UNKNOWN'));
  const local = candidate({ identityEvidence: [{ ...candidate().identityEvidence[0], regulatoryLiquid: true }] });
  assert.ok(!buildReviewClusters({ baselineUniverse: universe([local]) }).rows[0].labels.includes('LIQUIDITY_UNKNOWN'));
});

test('canonical graph retains priorIDs and separate sameissuer shareclasses', () => {
  const a = candidate({ status: 'ACCEPTED', securityId: 'ref_AAA_DE_XETR', isPrimary: true, primaryMic: 'XETR' });
  const b = candidate({ listingKey: 'marketstack:XETR:BBB.DE', providerSymbol: 'BBB.DE', isin: 'DE0007164600', status: 'ACCEPTED',
    canonicalTicker: 'BBB.DE.XETR', securityId: 'ref_BBB_DE_XETR', isPrimary: true, primaryMic: 'XETR',
    identityEvidence: [{ ...a.identityEvidence[0], isin: 'DE0007164600' }] });
  const graph = buildCanonicalEuropeGraph({ baselineUniverse: universe([a, b]), admittedUniverse: universe([]) });
  assert.deepEqual(graph.counts, { companies: 1, securities: 2, listings: 2, quarantined: 0 });
  assert.deepEqual(graph.companies[0].securities, ['ISIN:DE0005545503', 'ISIN:DE0007164600']);
  assert.deepEqual(graph.companies[0].securityIds, ['ref_AAA_DE_XETR', 'ref_BBB_DE_XETR']);
  assert.ok(graph.listings.every(l => l.priorIdentityRetained && l.currentPriceReadiness === 'CURRENT_EVIDENCE_REQUIRED'));
  assert.ok(graph.securities.every(s => s.shareClassDetail === 'UNKNOWN'));
});

test('hard current class conflict quarantines oldlisting rather than reusing itsID for a newclass', () => {
  const a = candidate({ status: 'ACCEPTED', securityId: 'ref_AAA_DE_XETR' });
  const current = candidate({ isin: 'DE0007164600', status: 'REVIEW' });
  const graph = buildCanonicalEuropeGraph({ baselineUniverse: universe([a]), admittedUniverse: universe([current]) });
  assert.equal(graph.listings.length, 0); assert.equal(graph.quarantine[0].reason, 'CURRENT_CLASS_OR_ISSUER_CONFLICT_WITH_PRIOR_ID');
});

test('new exactclass primary andsecondary share one Core ID regardless listing sort order', () => {
  const primary = candidate({ listingKey: 'marketstack:XPAR:PRIMARY.PA', providerSymbol: 'PRIMARY.PA', mic: 'XPAR',
    canonicalTicker: 'PRIMARY.PA.XPAR', status: 'ACCEPTED', isPrimary: true, primaryMic: 'XPAR' });
  const secondary = candidate({ listingKey: 'marketstack:XAMS:SECOND.AS', providerSymbol: 'SECOND.AS', mic: 'XAMS',
    canonicalTicker: 'SECOND.AS.XAMS', status: 'ACCEPTED', isPrimary: false, primaryMic: 'XPAR' });
  const graph = buildCanonicalEuropeGraph({ baselineUniverse: universe([]), admittedUniverse: universe([secondary, primary]) });
  assert.equal(graph.counts.securities, 1); assert.equal(graph.counts.listings, 2);
  assert.equal(graph.securities[0].securityId, 'ref_PRIMARY_PA_XPAR');
  assert.ok(graph.listings.every(l => l.securityId === 'ref_PRIMARY_PA_XPAR'));
  assert.equal(graph.securities[0].primaryListing, primary.listingKey);
  const unclear = buildCanonicalEuropeGraph({ baselineUniverse: universe([]), admittedUniverse: universe([secondary]) });
  assert.equal(unclear.counts.listings, 0); assert.match(unclear.quarantine[0].reasons.join(), /PRIMARY_LISTING_UNRESOLVED/);
});

function currentAdmissionFixture() {
  const now = '2026-10-09T16:00:00Z', capture = '2026-10-09T15:00:00Z';
  const source = { sha256: sha, retrievedAt: capture, httpStatus: 200 };
  const c = candidate({ status: 'ACCEPTED', identityEvidence: [{ ...candidate().identityEvidence[0], source,
    provenance: { xetra: source } }], observations: [{ normalized: { providerTicker: 'AAA.DE', mic: 'XETR', isin },
    rawSha256: sha, provenance: { normalizedSha256: sha, responses: [{ ...source, status: 200, endpoint: '/tickers/AAA.DE' }] } }] });
  return { now, candidate: c, qualityRow: { latest: { date: '2026-10-08', close: 100 }, latestQuality: { quarantine: [] }, conflicts: [],
    provenance: { latest: { normalizedSha256: sha, responses: [{ ...source, status: 200, endpoint: '/eod/latest', params: { exchange: 'XETR', symbols: 'AAA.DE' } }] } } },
    freshnessRow: { listingKey: c.listingKey, mic: c.mic, status: 'LAST_VALID_SESSION', calendarVerified: true, evaluatedAt: now } };
}
test('new admission requires current metadata/EOD/official observations in addition to foundation status', () => {
  const input = currentAdmissionFixture(); assert.equal(diagnoseCurrentAdmission(input).eligible, true);
  const old = structuredClone(input); old.candidate.identityEvidence[0].source.retrievedAt = '2026-10-08T15:00:00Z';
  assert.ok(diagnoseCurrentAdmission(old).reasons.includes('CURRENT_OFFICIAL_CLASS_AND_GLEIF_REQUIRED'));
  const noFoundation = structuredClone(input); noFoundation.candidate.status = 'REVIEW';
  assert.equal(diagnoseCurrentAdmission(noFoundation).eligible, false);
});
test('wrongMIC, stale/future sources, unverified calendar and quarantined latest block new admission', () => {
  for (const mutate of [
    x => x.qualityRow.provenance.latest.responses[0].params.exchange = 'XNYS',
    x => x.freshnessRow.status = 'STALE',
    x => x.freshnessRow.calendarVerified = false,
    x => x.candidate.observations[0].provenance.responses[0].retrievedAt = '2026-10-10T15:00:00Z',
    x => x.qualityRow.latestQuality.quarantine.push({ reasons: ['IMPOSSIBLE_OHLC'] })
  ]) { const input = currentAdmissionFixture(); mutate(input); assert.equal(diagnoseCurrentAdmission(input).eligible, false); }
});
test('new v21 RAW context is pinned independently with exact fixed budget and no ETFscope', () => {
  const expected = { phase: 'phase1', planHash: sha, baselineMain: 'b'.repeat(40) };
  const summary = { version: 'marketstack-europe21-ingestion-1', phase: 'phase1', runPlanHash: sha, baselineMain: expected.baselineMain,
    oldRunCreditsIncluded: false, additionalCreditPolicy: { targetCredits: 10000, hardCap: 18000, maxCredits: 6000,
      allocations: { phase1: 6000, phase2: 8000, phase3: 4000 } }, productionWrites: 0, publication: 'BLOCKED_RIGHTS_UNVERIFIED',
    budget: { maxCredits: 6000, targetCredits: 10000, hardCap: 18000, runId: 'europe21-phase1', requests: 1, estimatedCredits: 1,
      reservations: [{ attempt: 1, cost: 1 }] }, results: [] };
  assert.equal(validateEurope21EvidenceSummary(summary, expected), true);
  assert.throws(() => validateEurope21EvidenceSummary(summary), /PINNED/);
  for (const mutate of [x => x.runPlanHash = 'c'.repeat(64), x => x.budget.estimatedCredits = 2,
    x => x.oldRunCreditsIncluded = true, x => x.additionalCreditPolicy.hardCap = 25000,
    x => x.results.push({ operation: { kind: 'metadata', assetKind: 'ETF' } })]) {
    const changed = structuredClone(summary); mutate(changed); assert.throws(() => validateEurope21EvidenceSummary(changed, expected));
  }
});

test('newCore IDs are scoped and protectedUS ID collisions quarantine', () => {
  const a = candidate({ status: 'ACCEPTED', isPrimary: true });
  const graph = buildCanonicalEuropeGraph({ baselineUniverse: universe([]), admittedUniverse: universe([a]), protectedSecurityIds: ['ref_AAA_DE_XETR'] });
  assert.equal(graph.listings.length, 0); assert.match(graph.quarantine[0].reasons.join(), /COLLISION/);
});

test('private writer refuses existingoutput symlinks and pinned reader refuses manifest symlinks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vu-europe-review-'));
  try {
    const target = join(dir, 'safe.txt'); writeFileSync(target, 'unchanged');
    symlinkSync(target, join(dir, 'europe_review_clusters.json'));
    assert.throws(() => writePrivateReviewArtifacts({ baseline: { baselineUniverse: universe([]) }, out: dir }), /REGULAR_FILE/);
    assert.equal(readFileSync(target, 'utf8'), 'unchanged');
    symlinkSync(target, join(dir, 'evidence-output-manifest.json'));
    assert.throws(() => readPinnedBaseline(dir, createHash('sha256').update('unchanged').digest('hex')), /REGULAR_FILE/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('authenticated overlay protects old quarantined history in charts while adding only new real sessions', async () => {
  const { applyEurope21HistoryOverlays } = await import('../../../scripts/marketstack/europe-review-resolution.mjs');
  const key = 'marketstack:XETR:AAA.DE', id = 'ref_AAA_DE_XETR';
  const c = candidate({ status: 'ACCEPTED', securityId: id, currency: 'EUR', verifiedAliases: ['AAA.DE'] });
  const bar = (date, close) => ({ raw: { symbol: 'AAA.DE', exchange: 'XETR', date, open: close, high: close + 1, low: close - 1, close, volume: 100, price_currency: 'EUR' },
    normalized: { providerTicker: 'AAA.DE', providerExchange: 'XETR', tradingDate: date, currency: 'EUR', open: close, high: close + 1, low: close - 1, close, volume: 100 },
    provenance: { normalizedSha256: sha, rawSha256: sha } });
  const old = { operation: { kind: 'history', mic: 'XETR' }, observations: [bar('2026-10-06', 10), bar('2026-10-07', 11)], provenance: { normalizedSha256: sha } };
  const latest = { operation: { kind: 'history', listing: { mic: 'XETR' } }, observations: [bar('2026-10-08', 12), bar('2026-10-09', 13)], provenance: { normalizedSha256: 'b'.repeat(64) } };
  for (const b of latest.observations) b.provenance.normalizedSha256 = latest.provenance.normalizedSha256;
  const sibling = { operation: { kind: 'history', listing: { mic: 'XETR' } }, observations: [bar('2026-10-08', 12)], provenance: { normalizedSha256: 'c'.repeat(64) } };
  sibling.observations[0].provenance.normalizedSha256 = sibling.provenance.normalizedSha256; sibling.observations[0].raw.adj_close = -1;
  const row = { listingKey: key, isin, mic: 'XETR', quality: {}, latestQuality: { volumeVerified: true }, provenance: { history: old.provenance }, conflicts: [], history: {}, priceCurrencyBasis: 'PROVIDER_REPORTED' };
  const projection = { listingEvidence: { [key]: { latest: { date: '2026-10-09' }, history: {}, priceQuality: { evidenceRef: 'private-proof' }, adjustment: {}, provenance: {} } },
    series: [{ securityId: id, listingId: key, points: [], provenance: {} }] };
  const outputs = { marketstack_europe_equity_universe: { listings: [c] }, marketstack_europe_price_quality: { rows: [row] }, marketstack_europe_core_projection: projection,
    marketstack_europe_product_readiness: { rows: [{ listingKey: key, readiness: {} }] }, marketstack_europe_adjustment_status: { rows: [{ listingKey: key }] } };
  const baseline = { priceQuality: { rows: [{ identityStatus: 'ACCEPTED', listingKey: key, isin, mic: 'XETR', provenance: { history: old.provenance },
    quality: { quarantine: [{ date: '2026-10-07', reasons: ['OUTSIDE_LISTING_IDENTITY_INTERVAL'] }] } }] } };
  const calendar = { verified: true, mic: 'XETR', source: 'fixture-calendar', expectedLastCompletedSession: '2026-10-09', expectedSessions: ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'] };
  applyEurope21HistoryOverlays({ outputs, baseline, evidence: [{ operations: [old, latest, sibling] }], current: [{ operations: [latest, sibling] }], calendars: { XETR: calendar }, now: '2026-10-09T16:00:00Z' });
  assert.deepEqual(projection.series[0].points, [['2026-10-06', 10], ['2026-10-08', 12], ['2026-10-09', 13]]);
  assert.ok(row.quality.quarantine.some(q => q.date === '2026-10-07'));
  assert.equal(outputs.europe_history_overlay_receipts.releasedQuarantineRows, 0);
  assert.equal(projection.listingEvidence[key].technical.asOf, '2026-10-09');
  assert.equal(projection.listingEvidence[key].technical.status, 'TECHNICAL_PARTIAL');
  assert.equal(projection.listingEvidence[key].technical.metrics.sma20, null);
  assert.equal(projection.listingEvidence[key].technical.metrics.relativeStrength, null);
  assert.equal(old.observations.length, 2);
  assert.equal(outputs.europe_history_overlay_receipts.rows[0].coherentCrossOperationRows[0].sourceRows.length, 2);
  assert.equal(outputs.marketstack_europe_adjustment_status.rows[0].rawAdjustedDiagnostic.classification.status, 'ADJUSTMENT_INVALID');
  assert.equal(sibling.observations[0].raw.adj_close, -1);
  row.conflicts = ['LATEST_HISTORY_BAR_CONFLICT'];
  applyEurope21HistoryOverlays({ outputs, baseline, evidence: [{ operations: [old, latest, sibling] }], current: [{ operations: [latest, sibling] }], calendars: { XETR: calendar }, now: '2026-10-09T16:00:00Z' });
  assert.equal(projection.series.length, 0);
  assert.equal(projection.listingEvidence[key].history.valid, false);
  assert.equal(projection.listingEvidence[key].history.chartStatus, 'CHART_BLOCKED');
  assert.equal(projection.listingEvidence[key].technical, null);
});

test('only individually valid coherent observations across distinct operations coalesce, retaining every source receipt', async () => {
  const { coalesceCoherentNewSessionObservations } = await import('../../../scripts/marketstack/europe-review-resolution.mjs');
  const now = '2026-10-09T16:00:00Z', listing = { mic: 'XETR', providerTicker: 'AAA.DE', currency: 'EUR' }, calendar = { verified: true, mic: 'XETR', source: 'schedule', expectedLastCompletedSession: '2026-10-09', expectedSessions: ['2026-10-08', '2026-10-09'] };
  const row = (source, edit = {}) => ({ raw: { symbol: 'AAA.DE', exchange: 'XETR', date: '2026-10-08', open: 10, high: 11, low: 9, close: 10, volume: 100, price_currency: 'EUR', ...edit },
    normalized: { providerTicker: 'AAA.DE', providerExchange: 'XETR', tradingDate: '2026-10-08', currency: 'EUR', open: 10, high: 11, low: 9, close: 10, volume: 100 }, provenance: { normalizedSha256: source, rawSha256: source } });
  const a = row(sha), b = row('b'.repeat(64));
  const run = observations => coalesceCoherentNewSessionObservations({ observations, cachedBars: [], protectedQuarantineDates: [], listing, calendar, now });
  assert.equal(run([a, b]).additions.length, 1); assert.equal(run([a, b]).coalesced[0].sourceRows.length, 2);
  assert.deepEqual(run([b, a]), run([a, b]));
  assert.equal(run([a, { ...b, provenance: a.provenance }]).additions.length, 2);
  assert.equal(run([a, row('b'.repeat(64), { price_currency: false })]).additions.length, 2);
  const zero = row('b'.repeat(64), { close: 0 }); zero.normalized.close = 0;
  assert.equal(run([a, zero]).additions.length, 2);
  assert.equal(run([a, { ...b, normalized: { ...b.normalized, close: 10.5 }, raw: { ...b.raw, close: 10.5 } }]).additions.length, 2);
  const protectedResult = coalesceCoherentNewSessionObservations({ observations: [a, b], cachedBars: [], protectedQuarantineDates: ['2026-10-08'], listing, calendar, now });
  assert.equal(protectedResult.additions.length, 2); assert.equal(protectedResult.coalesced.length, 0);
  const outsideRange = coalesceCoherentNewSessionObservations({ observations: [a, b], cachedBars: [], protectedQuarantineDates: [], listing, calendar, now,
    sourceRequestRanges: { [b.provenance.normalizedSha256]: { from: '2026-10-09', to: '2026-10-09' } } });
  assert.equal(outsideRange.additions.length, 2); assert.equal(outsideRange.coalesced.length, 0);
});


test('Germany cohort counts reconcile only verified issuer-country rows and keep foreign Xetra companies separate', async () => {
  const { projectGermanyUniverse } = await import('../../../scripts/marketstack/europe-review-resolution.mjs');
  const de = candidate({ status: 'ACCEPTED', securityId: 'ref_AAA_DE_XETR' }), review = candidate({ listingKey: 'marketstack:XETR:BBB.DE' });
  const foreign = candidate({ listingKey: 'marketstack:XETR:CCC.DE', status: 'ACCEPTED', issuerCountry: 'NL', isin: 'NL0000235190', securityId: 'ref_CCC_DE_XETR', companyKey: 'LEI:MINO79WLOO247M1IL051' });
  const source = { ...universe([de, review, foreign]), listings: [de, foreign], companies: [{ companyKey: de.companyKey, issuerCountry: 'DE' }, { companyKey: foreign.companyKey, issuerCountry: 'NL' }],
    securities: [{ isin: de.isin }, { isin: foreign.isin }], summary: { candidates: 3, accepted: 2 }, germany: { summary: { accepted: 999 } } };
  const result = projectGermanyUniverse(source);
  assert.deepEqual(result.summary, { candidates: 2, accepted: 1, review: 1, rejected: 0, companies: 1, securities: 1, listings: 1 });
  assert.equal(result.germany, undefined); assert.equal(source.summary.accepted, 2);
  assert.equal(result.listings[0], de); assert.equal(result.generatedAt, source.generatedAt);
});


test('CAC40 publisher label retains canonical CAC 40 exact roster target and separates mapped from accepted', async () => {
  const { projectEurope21IndexCoverage } = await import('../../../scripts/marketstack/europe-review-resolution.mjs');
  const c = candidate({ observations: [{ source: 'authenticated-metadata' }] });
  const rows = projectEurope21IndexCoverage({ universe: universe([c]), productRows: [{ isin, identityStatus: 'REVIEW', readiness: {} }], now: '2026-10-09T16:08:00Z',
    indexReferences: [{ index: 'CAC40', referenceVerified: true, sourceContentVerified: true, rosterExtractionVerified: true, asOf: '2026-10-08', source: { sha256: sha }, rows: [{ isin }] }] });
  const cac = rows.find(r => r.index === 'CAC 40'); assert.equal(cac.target, 1); assert.equal(cac.mapped, 1); assert.equal(cac.accepted, 0);
  assert.equal(cac.missing, 0); assert.equal(cac.missingAccepted, 1); assert.equal(cac.asOf, '2026-10-08');
  assert.equal(rows.find(r => r.index === 'EURO STOXX 50').target, null); assert.equal(rows.find(r => r.index === 'Nordics').target, null);
});
