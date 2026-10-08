import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { replayEuropeProductContract, loadPrivateReplayInputs, writePrivateProductReplay } from '../../../scripts/marketstack/europe-product-contract-replay.mjs';
const require = createRequire(import.meta.url);
const { securityIdForTicker } = require('../../../core/identity.js');
const now = '2026-10-08T16:00:00Z';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const securityId = securityIdForTicker('TEST.XPAR'), companyKey = 'LEI:SYNTHETIC_TEST_ISSUER';
  const listingKey = 'marketstack:XPAR:TEST', alternate = 'marketstack:XETR:TEST';
  const listings = [listingKey, alternate].map((key, i) => ({ status: 'ACCEPTED', listingKey: key, securityId, companyKey,
    instrumentId: 'vu_abcdef123456', name: 'Synthetic Test Equity SE', symbol: 'TEST', providerSymbol: i ? 'TEST.XETRA' : 'TEST.PA',
    mic: i ? 'XETR' : 'XPAR', exchangeCountry: i ? 'DE' : 'FR', currency: 'EUR',
    identityEvidence: [{ verified: true, source: 'SYNTHETIC_OFFICIAL_IDENTITY_FIXTURE' }] }));
  const universe = { mode: 'PRIVATE_RESEARCH', publicationAllowed: false, candidates: [{ status: 'REVIEW', securityId: 'ref_UNACCEPTED' }],
    securities: [{ securityId, companyKey, isin: 'FR0000120271', securityKey: 'ISIN:FR0000120271', canonicalTicker: 'TEST.XPAR',
      primaryListing: listingKey, listings: [listingKey, alternate], aliases: ['TEST.PA', 'TEST.XETRA'] }], listings };
  const projection = { mode: 'PRIVATE_RESEARCH', publicationAllowed: false, generatedAt: now,
    listingEvidence: Object.fromEntries(listings.map(l => [l.listingKey, {
      latest: { status: 'CURRENT', date: '2026-10-08', volume: 100 }, history: { valid: true, observations: 2 },
      priceQuality: { status: 'VALIDATED', evidenceRef: 'synthetic-quality-proof', volumeValid: true },
      adjustment: { status: 'ADJUSTMENT_UNKNOWN' }
    }])), series: listings.map(l => ({ securityId, listingId: l.listingKey, currency: 'EUR', basis: 'RAW_UNADJUSTED',
      points: [['2026-10-07', 40], ['2026-10-08', 41]], provenance: { evidenceRef: 'synthetic-series-proof' }, sessionContinuity: 'UNKNOWN' })) };
  return { universe, projection, now, securityId, listingKey };
}

test('actual Core replay searches every accepted identity, persists canonical watchlist and covers primary plus secondary raw histories', async () => {
  const input = fixture(), original = JSON.stringify(input), report = await replayEuropeProductContract(input);
  assert.equal(JSON.stringify(input), original, 'input artifacts are unchanged');
  assert.equal(report.status, 'PRIVATE_CONTRACT_REPLAY_PASSED');
  assert.equal(report.summary.identityAvailable, 1); assert.equal(report.summary.searchableSecurities, 1);
  assert.equal(report.summary.duplicateSearchResults, 0);
  for (const field of ['ticker', 'name', 'isin', 'alias']) assert.ok(report.securities[0].searches.some(s => s.field === field && s.passed));
  for (const field of ['watchlistAdd', 'watchlistSave', 'watchlistReload', 'watchlistRemove']) assert.equal(report.summary[field], 1);
  assert.equal(report.summary.chartAttempts, 2); assert.equal(report.summary.chartAvailable, 2); assert.equal(report.summary.chartLimited, 2);
  assert.equal(report.summary.primaryChartAvailable, 1); assert.equal(report.summary.multiObservationCharts, 2);
  assert.equal(report.charts.filter(c => c.isPrimary).length, 1); assert.ok(report.charts.every(c => c.currency === 'EUR' && c.basis === 'RAW_UNADJUSTED'));
  assert.equal(report.publicLoaderCalls, 0); assert.equal(report.usCalls, 0); assert.equal(report.providerRequests, 0); assert.equal(report.providerCredits, 0);
  assert.equal(report.summary.publicBlockedIdentities, 1); assert.equal(report.summary.publicBlockedCharts, 2);
  assert.equal(report.securities[0].readiness.publicTier, 0); assert.equal(report.securities[0].readiness.QUANT, 'QUANT_BLOCKED');
});

test('invalid or stale real series remains unavailable without synthesis while valid other listing survives', async () => {
  for (const change of [s => { s.points.pop(); }, s => { s.currency = 'USD'; }, s => { s.points[1][1] = -1; }, s => { s.points[1][0] = '2029-01-01'; }]) {
    const input = fixture(); change(input.projection.series[0]);
    const report = await replayEuropeProductContract(input);
    assert.equal(report.status, 'PRIVATE_CONTRACT_REPLAY_PARTIAL'); assert.equal(report.summary.chartAvailable, 1); assert.equal(report.summary.chartUnavailable, 1);
    assert.equal(report.charts[0].observations, 0); assert.ok(report.charts[0].reason); assert.equal(report.charts[1].observations, 2);
  }
});

test('absent history creates no chart attempt and a single EOD remains explicitly a single observation', async () => {
  const input = fixture(), secondary = input.universe.listings[1].listingKey;
  input.projection.listingEvidence[secondary].history = { valid: false, observations: 0 };
  input.projection.series.pop(); input.projection.series[0].points.shift();
  input.projection.listingEvidence[input.listingKey].history.observations = 1;
  const report = await replayEuropeProductContract(input);
  assert.equal(report.summary.chartAttempts, 1); assert.equal(report.summary.singleObservationCharts, 1);
  assert.equal(report.summary.multiObservationCharts, 0); assert.equal(report.canonicalLoaderCalls, 1);
  assert.equal(report.charts[0].historyCoverage, 'SINGLE_EOD_OBSERVATION');
  assert.equal(report.charts[0].rangeCompleteness, 'NOT_INFERRED_FROM_RANGE_LABEL');
});

test('actual Core getLogo and raw technical projection replay preserve scoped evidence with null RS and no public tier', async () => {
  const input = fixture(), companyKey = input.universe.securities[0].companyKey;
  const asset = { path: '/discover/logos/files/TEST.png', sha256: 'c'.repeat(64) };
  input.projection.companyEvidence = { [companyKey]: { logo: { status: 'LOGO_VALID', key: 'TEST', companyId: companyKey, asset } } };
  input.projection.listingEvidence[input.listingKey].technical = {
    securityId: input.securityId, listingId: input.listingKey, currency: 'EUR', engineProjection: true,
    status: 'TECHNICAL_PARTIAL', methodology: 'EXISTING_ENGINE:SYNTHETIC_TEST_ONLY', metrics: { sma20: 40, momentum: 0, relativeStrength: null }
  };
  const report = await replayEuropeProductContract({ ...input, logoResolver: async key => key === 'TEST' ? asset : null });
  assert.equal(report.summary.logoValid, 1); assert.equal(report.summary.logoAssetUnavailable, 0);
  assert.equal(report.securities[0].logo.assetSha256, asset.sha256); assert.equal(report.summary.rawTechnicalPartial, 1);
  assert.equal(report.charts[0].technical.priceBasis, 'RAW_UNADJUSTED'); assert.equal(report.charts[0].technical.RS, 'RS_BLOCKED');
  assert.equal(report.charts[0].technical.metrics.momentum, 0); assert.equal(report.charts[0].technical.metrics.relativeStrength, null);
  assert.equal(report.securities[0].readiness.publicTier, 0); assert.equal(report.securities[0].readiness.QUANT, 'QUANT_BLOCKED');
});

test('unverified accepted claims are not promoted and are explicitly counted as excluded', async () => {
  const input = fixture(); input.universe.listings[0].identityEvidence = [];
  const report = await replayEuropeProductContract(input);
  assert.equal(report.summary.acceptedSecurities, 0); assert.equal(report.summary.catalogExcludedSecurities, 1);
  assert.deepEqual(report.catalogExcludedSecurityIds, [input.securityId]); assert.equal(report.status, 'PRIVATE_CONTRACT_REPLAY_PARTIAL');
  assert.equal(report.canonicalLoaderCalls, 0);
});

test('missing company name is explicitly untested rather than counted as full search readiness', async () => {
  const input = fixture(); delete input.universe.listings[0].name;
  const report = await replayEuropeProductContract(input);
  assert.equal(report.summary.identityAvailable, 1); assert.equal(report.summary.searchableSecurities, 0);
  assert.equal(report.summary.missingSearchFields, 1); assert.deepEqual(report.securities[0].missingSearchFields, ['name']);
  assert.equal(report.status, 'PRIVATE_CONTRACT_REPLAY_PARTIAL');
});

test('research mode, explicit evaluation time, raw basis and unambiguous series are mandatory', async () => {
  const discovery = fixture(); discovery.universe.mode = 'PRIVATE_DISCOVERY';
  assert.equal((await replayEuropeProductContract(discovery)).summary.acceptedSecurities, 1);
  const publicInput = fixture(); publicInput.universe.publicationAllowed = true;
  await assert.rejects(replayEuropeProductContract(publicInput), /PRIVATE_RESEARCH_ARTIFACTS_REQUIRED/);
  await assert.rejects(replayEuropeProductContract({ ...fixture(), now: null }), /EXPLICIT_EVALUATION_TIME_REQUIRED/);
  const adjusted = fixture(); adjusted.projection.series[0].basis = 'PROVIDER_ADJUSTED';
  await assert.rejects(replayEuropeProductContract(adjusted), /RAW_REPLAY_BASIS_REQUIRED/);
  const duplicate = fixture(); duplicate.projection.series.push(duplicate.projection.series[0]);
  await assert.rejects(replayEuropeProductContract(duplicate), /DUPLICATE_CANONICAL_SERIES/);
});

test('private replay verifies compiler hashes and refuses repository output, altered input and symlinks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vu-private-product-replay-'));
  try {
    const input = fixture(), files = [];
    for (const [name, doc] of [['marketstack_europe_equity_universe.json', input.universe], ['marketstack_europe_core_projection.json', input.projection]]) {
      const bytes = JSON.stringify(doc); writeFileSync(join(root, name), bytes); files.push({ name, bytes: Buffer.byteLength(bytes), sha256: sha(bytes) });
    }
    writeFileSync(join(root, 'evidence-output-manifest.json'), JSON.stringify({ publicationAllowed: false, files }));
    const loaded = loadPrivateReplayInputs(root); assert.equal(loaded.inputManifest.files.length, 2);
    const report = await replayEuropeProductContract({ ...loaded, now });
    const saved = writePrivateProductReplay(report, root); assert.equal(JSON.parse(readFileSync(saved.path)).publicationAllowed, false);
    assert.equal(statSync(saved.path).mode & 0o777, 0o600);
    assert.throws(() => writePrivateProductReplay({ ...report, publicationAllowed: true }, root), /PRIVATE_RESEARCH_REPORT_REQUIRED/);
    assert.throws(() => writePrivateProductReplay(report, process.cwd()), /PRIVATE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED/);
    writeFileSync(join(root, files[0].name), '{}'); assert.throws(() => loadPrivateReplayInputs(root), /HASH_MISMATCH/);
    const alias = join(root, 'alias'); symlinkSync(root, alias); assert.throws(() => loadPrivateReplayInputs(alias), /SYMLINK_REFUSED/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
