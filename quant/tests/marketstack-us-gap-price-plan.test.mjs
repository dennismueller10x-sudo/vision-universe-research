import test from 'node:test';
import assert from 'node:assert/strict';
import { planUSGapPrices } from '../../scripts/market/plan-marketstack-us-gap-prices.mjs';
const row = (id, extra = {}) => ({ securityId: id, providerSymbol: id, expectedMics: ['XNYS'], baselineInstrumentType: 'EQUITY_COMMON',
  instrumentClassification: { investigativeType: 'EQUITY_COMMON' }, consumer: true, activeStatus: { baseline: 'ACTIVE' },
  candidates: [], symbolAliases: [], ...extra });
const report = rows => ({ rows, protectedBaselineSource: { sha256: 'fixed' }, matchedDirectoryBaselineUnchanged: 6738 });

test('diagnostics require observed symbols, exclude name-derived guesses and contradictory identities', () => {
  const a = row('A', { candidates: [{ symbol: 'A', mic: 'XNAS', identityStatus: 'UNVERIFIED_LISTING_CANDIDATE' },
    { symbol: 'OTHER', mic: 'XNYS' }, { symbol: 'A', mic: 'XASE', identityStatus: 'REJECTED_ISSUER_IDENTIFIER_CONFLICT' }] });
  const r = planUSGapPrices(report([a]), report([]));
  assert.equal(r.estimatedCredits, 1); assert.equal(r.tasks[0].params.symbols, 'A'); assert.equal(r.tasks[0].params.exchange, 'XNAS');
  assert.equal(r.exclusions[0].reason, 'CONFLICTING_IDENTITY_EVIDENCE');
  assert.equal(r.tasks[0].targets[0].targets[0].consumerUseApproved, false);
});

test('preferred series aliases are diagnostic only, and duplicated listing requests are charged once', () => {
  const preferred = row('BAC-P-N', { baselineInstrumentType: 'PREFERRED', symbolAliases: [{ symbol: 'BAC-PN', basis: 'SERIES_PRESERVED' }],
    candidates: [{ symbol: 'BAC-PN', mic: 'XNYS' }] });
  const already = row('OTHER_ID', { providerSymbol: 'BAC-PN' });
  const r = planUSGapPrices(report([preferred]), report([already]));
  assert.equal(r.estimatedCredits, 1); assert.equal(r.uniqueBaselineSecuritiesRepresented, 2);
  assert.equal(r.tasks[0].targets[0].targets.length, 2); assert.equal(r.tasks[0].retries, 0);
  assert.equal(r.unchangedOriginalQualityRejections, 1);
});

test('hard budget bounds all candidates and persists deferred work without declaring coverage', () => {
  const r = planUSGapPrices(report([row('Z', { candidates: [{ symbol: 'Z', mic: 'XNAS' }] }), row('A', { candidates: [{ symbol: 'A', mic: 'XNAS' }] })]),
    report([]), { maxCredits: 1 });
  assert.equal(r.estimatedCredits, 1); assert.equal(r.deferredProviderListings, 1);
  assert.equal(r.tasks[0].params.symbols, 'A'); assert.equal(r.deferred[0].symbol, 'Z');
  assert.throws(() => planUSGapPrices(report([]), report([]), { maxCredits: 2001 }), /2000/);
  assert.throws(() => planUSGapPrices(report([]), { rows: [], protectedBaselineSource: { sha256: 'other' } }), /Matching/);
});

test('batch pagination and accounting reflect actual unique symbols per MIC', () => {
  const rows = Array.from({ length: 205 }, (_, i) => row('A' + i, { expectedMics: [i < 201 ? 'XNAS' : 'XNYS'] }));
  const r = planUSGapPrices(report([]), report(rows));
  assert.equal(r.estimatedCredits, 205); assert.equal(r.estimatedRequests, 4);
  assert.deepEqual(r.tasks.map(t => t.conservativeEstimatedCredits), [100, 100, 1, 4]);
  assert.ok(r.tasks.every(t => t.maxPages === 1 && t.params.limit === 1000 && t.endpoint === '/eod/latest'));
});

test('official class removal skips redundant stale retry without dropping original flag', () => {
  const r = planUSGapPrices(report([]), report([row('OLD', { activeStatus: { baseline: 'ACTIVE', officialSecurityClassDelistingFiled: true, officialBaselineListingRemovalFiled: true },
    latestQuality: { originalStatus: 'STALE_LATEST_ACTIVE' } })]));
  assert.equal(r.estimatedCredits, 0); assert.equal(r.unchangedOriginalQualityRejections, 1);
  assert.equal(r.exclusions[0].reason, 'STALE_FLAG_EXPLAINED_BY_OFFICIAL_CLASS_REMOVAL_FILED_HISTORY_RETAINED');
});

test('class removal filing from another venue cannot suppress baseline quote recheck', () => {
  const r = planUSGapPrices(report([]), report([row('OLD', { activeStatus: { baseline: 'ACTIVE', officialSecurityClassDelistingFiled: true,
    officialBaselineListingRemovalFiled: false }, latestQuality: { originalStatus: 'STALE_LATEST_ACTIVE' } })]));
  assert.equal(r.estimatedCredits, 1); assert.equal(r.excludedCandidates, 0);
});
