import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { replayEuropeProductContract } from '../../../scripts/marketstack/europe-product-contract-replay.mjs';
import { buildEuropeProductReports, writePrivateEuropeProductReports, replayPrivateEuropeScreener } from '../../../scripts/marketstack/europe-product-reports.mjs';
function fixture() {
  const companyKey = 'LEI:5299003VKVDCUPSS5X23', securityId = 'ref_SYNTHETIC_XPAR', listingKey = 'marketstack:XPAR:SYNTHETIC';
  const now = '2026-10-09T16:00:00Z';
  const universe = { mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    companies: [{ companyKey, issuerCountry: 'FR', securities: ['ISIN:FR0000120271'] }],
    securities: [{ securityId, securityKey: 'ISIN:FR0000120271', companyKey, isin: 'FR0000120271',
      primaryListing: listingKey, listings: [listingKey], aliases: ['SYNTHETIC.PA'] }],
    listings: [{ listingKey, companyKey, securityId, status: 'ACCEPTED', name: 'Synthetic Product Test SA', symbol: 'SYNTHETIC',
      providerSymbol: 'SYNTHETIC.PA', mic: 'XPAR', exchangeCountry: 'FR', currency: 'EUR', active: true, isPrimary: true,
      identityEvidence: [{ verified: true, source: 'SYNTHETIC_IDENTITY_FIXTURE' }] }] };
  const projection = { mode: 'PRIVATE_RESEARCH', publicationAllowed: false, generatedAt: now,
    listingEvidence: { [listingKey]: { latest: { status: 'CURRENT', date: '2026-10-09', volume: 0 },
      history: { valid: true, observations: 2 }, priceQuality: { status: 'VALIDATED', evidenceRef: 'synthetic-price-validator', volumeValid: true },
      adjustment: { status: 'ADJUSTMENT_PARTIAL', evidenceRef: 'synthetic-uncertified-adjustment' },
      technical: { securityId, listingId: listingKey, currency: 'EUR', engineProjection: true, asOf: '2026-10-09',
        status: 'TECHNICAL_PARTIAL', methodology: 'EXISTING_ENGINE:SYNTHETIC_FIXTURE_ONLY', metrics: { sma20: 40, momentum: 0, relativeStrength: null } } } },
    series: [{ securityId, listingId: listingKey, currency: 'EUR', basis: 'RAW_UNADJUSTED',
      points: [['2026-10-08', 40], ['2026-10-09', 41]], provenance: { evidenceRef: 'synthetic-raw-series' } }] };
  return { universe, projection, now, sourceInputs: { sha256: 'a'.repeat(64), files: [] }, securityId, listingKey };
}

test('named reports follow actual Core consumers and keep research partials separate from strict strategy certificates', async () => {
  const input = fixture(), original = JSON.stringify(input), replay = await replayEuropeProductContract(input);
  const reports = buildEuropeProductReports({ ...input, replay });
  assert.equal(JSON.stringify(input), original);
  assert.equal(Object.keys(reports).length, 6);
  assert.equal(reports['europe_chart_readiness.json'].rows[0].status, 'CHART_LIMITED');
  assert.equal(reports['europe_adjustment_readiness.json'].rows[0].status, 'ADJUSTMENT_PARTIAL');
  assert.equal(reports['europe_technical_readiness.json'].rows[0].status, 'TECHNICAL_PARTIAL');
  assert.equal(reports['europe_technical_readiness.json'].rows[0].metrics.momentum, 0);
  assert.equal(reports['europe_technical_readiness.json'].rows[0].metrics.relativeStrength, null);
  assert.equal(reports['europe_quant_readiness.json'].rows[0].status, 'QUANT_BLOCKED');
  assert.equal(reports['europe_supertrader_readiness.json'].rows[0].status, 'SUPERTRADER_BLOCKED');
  assert.equal(reports['europe_supertrader_readiness.json'].rows[0].validationEvidence, 'STRICT_VALIDATOR_OBJECTS_UNAVAILABLE');
  assert.equal(reports['europe_product_readiness.json'].summary.privateProducts.TECHNICAL, 1);
  assert.equal(reports['europe_product_readiness.json'].summary.publicProducts, 0);
  assert.ok(Object.values(reports).every(report => report.publicationAllowed === false && report.providerRequests === 0));
});

test('named report source scope and IDs fail closed and foreign strict validator objects cannot be grafted', async () => {
  const input = fixture(), replay = await replayEuropeProductContract(input);
  assert.throws(() => buildEuropeProductReports({ ...input, replay, sourceInputs: null }), /SOURCE_BOUND_PRIVATE/);
  assert.throws(() => buildEuropeProductReports({ ...input, replay: { ...replay, usCalls: 1 } }), /SOURCE_BOUND_PRIVATE/);
  assert.throws(() => buildEuropeProductReports({ ...input, replay: { ...replay, securities: [] } }), /ID_SET_MISMATCH/);
  input.projection.strategyInputs = { [input.listingKey]: { identity: { securityId: 'ref_FOREIGN', listingId: input.listingKey } } };
  assert.throws(() => buildEuropeProductReports({ ...input, replay }), /STRATEGY_INPUT_BINDING_MISMATCH/);
});

test('actual unchanged Screener adapter consumes native prices and null RS while default public never calls the private Core', async () => {
  const report = await replayPrivateEuropeScreener(fixture());
  assert.equal(report.summary.rows, 1); assert.equal(report.rows[0].currency, 'EUR');
  assert.equal(report.rows[0].relativeStrength, null); assert.equal(report.rows[0].momentum, 0);
  assert.equal(report.rows[0].volume, 0, 'validated zero remains meaningful');
  assert.equal(report.screen.total, 1); assert.equal(report.usCalls, 0); assert.equal(report.publicCalls, 0);
  assert.equal(report.publicDeliveryAllowed, false);
  const delayed = fixture(); delayed.projection.listingEvidence[delayed.listingKey].latest.status = 'DELAYED';
  const blocked = await replayPrivateEuropeScreener(delayed);
  assert.equal(blocked.summary.rows, 0); assert.equal(blocked.canonicalLoads, 0); assert.equal(blocked.summary.blocked, 1);
});

test('private named outputs retain source references and refuse dangling symlinks and repository destinations', async () => {
  const input = fixture(), replay = await replayEuropeProductContract(input), reports = buildEuropeProductReports({ ...input, replay });
  const root = mkdtempSync(join(tmpdir(), 'vu-europe-product-reports-'));
  try {
    const files = writePrivateEuropeProductReports(reports, root); assert.equal(files.length, 6);
    assert.equal(JSON.parse(readFileSync(files[0].path)).sourceInputs.sha256, input.sourceInputs.sha256);
    assert.throws(() => writePrivateEuropeProductReports(reports, process.cwd()), /OUTSIDE_REPOSITORY/);
    rmSync(files[0].path); const target = join(root, 'untouched'); symlinkSync(target, files[0].path);
    assert.throws(() => writePrivateEuropeProductReports(reports, root), /REGULAR_FILE_REQUIRED/); assert.equal(existsSync(target), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
