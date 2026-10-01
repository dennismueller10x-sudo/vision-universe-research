import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseT7InstrumentMaster, classifyGermanDirectory, compareGermanIndexCoverage, summarizeGermanyUniverse, collectGermanDirectoryPages, buildGermanyIdentityFoundation, validateGermanEquityMarketData } from '../../scripts/market/audit-marketstack-germany.mjs';

// Exact selected official columns/rows from the dated public Xetra T7 reference.
const fixture = readFileSync(new URL('./fixtures/marketstack-germany-t7.csv', import.meta.url), 'utf8');
const master = () => parseT7InstrumentMaster(fixture, { sourceURL: 'https://www.cashmarket.deutsche-boerse.com/' });
const directory = () => ({ mic: 'XETR', complete: true, reportedTotal: 3,
  rows: [{ symbol: 'SAP.DE', has_eod: true }, { symbol: 'HEN3.DE', has_eod: true }, { symbol: 'EUNL.DE', has_eod: true }] });
const audit = (d = directory(), refs = master().rows) => classifyGermanDirectory(d, refs, { listingCountry: 'DE', providerSuffixes: ['.DE'] });

test('resumed nested venue pages prove offset coverage rather than last-page success', () => {
  const page = (offset, rows, total = 3) => ({ endpoint: 'exchanges/XETR/tickers', ok: true, params: { offset },
    data: { pagination: { offset, total }, data: { tickers: rows } } });
  const entries = [page(0, [{ symbol: 'SAP.DE' }]), page(2, [{ symbol: 'EUNL.DE' }])];
  let result = collectGermanDirectoryPages(entries, ['XETR', 'XFRA']);
  assert.equal(result[0].complete, false); assert.deepEqual(result[0].source.gaps, [{ from: 1, to: 2 }]);
  assert.equal(result[1].reportedTotal, null); assert.equal(result[1].complete, false);
  entries.push(page(1, [{ symbol: 'HEN3.DE' }]));
  result = collectGermanDirectoryPages(entries, ['XETR']); assert.equal(result[0].complete, true);
  entries.push(page(0, [{ symbol: 'SAP.DE' }], 4));
  result = collectGermanDirectoryPages(entries, ['XETR']); assert.equal(result[0].complete, false); assert.equal(result[0].source.inconsistentTotals, true);
});

test('cached page payload overrides an inherited aggregate cursor/pagination', () => {
  const entry = { endpoint: 'exchanges/XETR/tickers', ok: true, seeded: true, params: { offset: 0 },
    nextOffset: 8959, pagination: { offset: 8000, count: 959, total: 8959 },
    data: { pagination: { offset: 0, count: 3, total: 3 }, data: { tickers: directory().rows } } };
  const result = collectGermanDirectoryPages([entry], ['XETR'])[0];
  assert.equal(result.complete, true); assert.equal(result.rows.length, 3); assert.equal(result.source.batches[0].legacyCursorIgnored, true);
  entry.data.pagination.count = 2;
  assert.equal(collectGermanDirectoryPages([entry], ['XETR'])[0].complete, false);
});

test('real T7 columns preserve type/currency without inventing common shares or German domicile', () => {
  const ref = master(); assert.equal(ref.updatedAt, '2026-10-01'); assert.equal(ref.rows.length, 3);
  const result = audit(); assert.equal(result.directoryComplete, true);
  assert.equal(result.counts.classifiedEquityListingCandidates, 2); assert.equal(result.counts.classifiedETFListingCandidates, 1);
  const henkel = result.listings.find(r => r.providerSymbol === 'HEN3.DE');
  assert.equal(henkel.preferredNameHint, true); assert.equal(henkel.listingType, 'UNKNOWN');
  assert.equal(henkel.issuerCountry, null); assert.equal(result.counts.germanIssuerEquities, null);
  assert.equal(result.counts.independentlyVerifiedCommonEquities, null);
  assert.equal(result.listings.find(r => r.providerSymbol === 'SAP.DE').referenceIdentity.tradingCurrency, 'EUR');
  assert.ok(result.listings.every(r => r.consumerEligibility === 'NOT_GRANTED' && r.productionActivated === false));
});

test('reference venue and exact mnemonic prevent ticker/crossvenue collisions', () => {
  assert.throws(() => parseT7InstrumentMaster(fixture.replace('SAP;XETR', 'SAP;XFRA')), /venue conflicts/);
  const d = directory(); d.rows = [{ symbol: 'SAP.XFRA' }, { symbol: 'SAP.DE', mic: 'XFRA' }, { symbol: 'SAP1.DE' }];
  const result = audit(d);
  assert.deepEqual(result.listings.map(r => r.status), ['SYMBOL_SUFFIX_UNVERIFIED', 'PROVIDER_VENUE_CONFLICT', 'REFERENCE_UNRESOLVED']);
  assert.equal(result.listings[1].referenceIdentity, null);
  assert.throws(() => classifyGermanDirectory(d, master().rows), /Verified German/);
});

test('reference ambiguity never selects one currency or corporate identity', () => {
  const refs = master().rows; refs.push({ ...refs[0], tradingCurrency: 'USD' });
  const row = audit(directory(), refs).listings.find(r => r.providerSymbol === 'SAP.DE');
  assert.equal(row.status, 'AMBIGUOUS_REFERENCE'); assert.equal(row.referenceIdentity, null);
});

test('returned provider ISIN or listing currency contradictions fail before reference classification', () => {
  const d = directory(); d.rows[0].isin = 'DE0006048432'; d.rows[1].currency = 'USD';
  const result = audit(d);
  assert.equal(result.listings[0].status, 'PROVIDER_REFERENCE_IDENTITY_CONFLICT');
  assert.equal(result.listings[1].status, 'PROVIDER_REFERENCE_IDENTITY_CONFLICT');
  assert.equal(result.counts.classifiedEquityListingCandidates, 0);
  assert.equal(result.listings[0].referenceIdentity, null); assert.equal(result.listings[1].assetType, 'UNKNOWN');
});

test('bonds/warrants/funds remain distinct exclusions and missing references remain unknown', () => {
  const refs = master().rows.map((r, i) => ({ ...r, assetType: ['BOND', 'WARRANT', 'FUND'][i] }));
  const result = audit(directory(), refs);
  assert.ok(result.listings.every(r => r.status === 'EXCLUDED_NON_EQUITY_ETF'));
  const empty = audit(directory(), []); assert.ok(empty.listings.every(r => r.status === 'REFERENCE_UNRESOLVED' && r.assetType === 'UNKNOWN'));
});

test('complete directory requires observed unique total; conflicting duplicates are visible', () => {
  const d = directory(); d.rows.push({ symbol: 'SAP.DE', has_eod: false });
  const result = audit(d); assert.equal(result.counts.duplicateProviderRows, 1);
  const sap = result.listings.find(r => r.providerSymbol === 'SAP.DE');
  assert.equal(sap.metadataConflict, true); assert.equal(sap.eodDirectoryFlag, null);
  d.reportedTotal = 4; assert.equal(audit(d).directoryComplete, false);
  d.rows.push({ symbol: null }); assert.equal(audit(d).counts.invalidProviderRows, 1);
});

test('T7 input rejects truncation, malformed provenance and dates', () => {
  assert.throws(() => parseT7InstrumentMaster(fixture.replace('01.10.2026', '31.02.2026')), /Invalid T7 reference date/);
  assert.throws(() => parseT7InstrumentMaster(fixture.replace('Currency;', 'PriceUnit;')), /Missing T7 column/);
  assert.throws(() => parseT7InstrumentMaster(fixture + '"broken'), /Unterminated/);
});

test('valid official securities with absent mnemonics remain counted without a symbol join', () => {
  const ref = parseT7InstrumentMaster(fixture.replace('SAP;XETR', ';XETR'));
  assert.equal(ref.rows.length, 3); assert.equal(ref.rows[0].mnemonic, null);
  assert.equal(audit(directory(), ref.rows).listings[0].status, 'REFERENCE_UNRESOLVED');
});

test('crossvenue security deduplication never manufactures domestic/company/common totals', () => {
  const a = audit(); const b = { ...audit(), mic: 'XFRA', listings: audit().listings.map(r => ({ ...r, mic: 'XFRA' })) };
  const result = summarizeGermanyUniverse([a, b], { requestedVenues: ['XETR', 'XFRA', 'XBER'] });
  assert.equal(result.counts.classifiedEquityListingCandidates, 4); assert.equal(result.counts.distinctEquityISINs, 2);
  assert.equal(result.counts.equityISINsOnMultipleVenues, 2); assert.equal(result.allRequestedDirectoriesObserved, false);
  assert.equal(result.counts.germanIssuerEquities, null); assert.equal(result.counts.independentlyVerifiedCommonEquities, null);
  a.listings.push({ ...a.listings[0], providerSymbol: 'SAP.XETR' });
  const aliases = summarizeGermanyUniverse([a, b]);
  assert.equal(aliases.counts.classifiedEquityListingCandidates, 5);
  assert.equal(aliases.counts.distinctEquityListingIdentities, 4);
  assert.equal(aliases.counts.equityProviderAliasSurplus, 1);
  assert.equal(aliases.counts.classifiedProviderAliasSurplusByAssetType.EQUITY, 1);
  assert.throws(() => summarizeGermanyUniverse([a, a]), /One audit per venue/);
});

const foundationSource = [{ mic: 'XETR', source_url: 'https://www.cashmarket.deutsche-boerse.com/reference.csv', retrieved_at: '2026-10-01T14:00:00Z' }];
test('metadata-only canonical foundation preserves accepted IDs and gives no price or equity-engine coverage', () => {
  const prior = { mic: 'XETR', ticker: 'SAP', isin: 'DE0007164600', assetType: 'EQUITY', tradingCurrency: 'EUR',
    listingId: 'vu_123456', securityId: 'accepted_security', companyId: 'accepted_company', listingType: 'UNKNOWN' };
  const result = buildGermanyIdentityFoundation([audit()], foundationSource, [prior]);
  assert.equal(result.counts.listings, 3); assert.equal(result.counts.existingIDsRetained, 1);
  const sap = result.layer.listings.find(r => r.ticker === 'SAP');
  assert.equal(sap.listingId, prior.listingId); assert.equal(sap.securityId, prior.securityId); assert.equal(sap.companyId, prior.companyId);
  const etf = result.layer.listings.find(r => r.assetType === 'ETF');
  assert.equal(etf.companyId, null); assert.equal(etf.companyName, null); assert.ok(etf.fundId.startsWith('fund_'));
  assert.equal(result.layer.listings.find(r => r.ticker === 'HEN3').listingType, 'PREFERRED_HINT');
  for (const r of result.layer.listings) {
    assert.equal(r.coverage.price_eod, 'NONE'); assert.equal(r.coverage.price_history, 'NONE');
    assert.equal(r.coverage.technical, 'NONE'); assert.equal(r.coverage.fundamentals, 'NONE'); assert.equal(r.price, undefined);
    assert.equal(r.country, null); assert.equal(r.productionActivated, false);
  }
});

test('public foundation provenance carries URLs/hashes rather than private filesystem paths', () => {
  const sources = foundationSource.map(s => ({ ...s, inputPath: '/workspace/private/reference.csv', localArtifact: '/private/cache.json' }));
  const result = buildGermanyIdentityFoundation([audit()], sources);
  const json = JSON.stringify(result.layer);
  assert.ok(!json.includes('/workspace/private')); assert.ok(!json.includes('/private/cache'));
  assert.ok(json.includes('https://www.cashmarket.deutsche-boerse.com/reference.csv'));
});

test('foundation rejects missing source, conflicted provider metadata and preexisting identity collisions', () => {
  assert.equal(buildGermanyIdentityFoundation([audit()], []).counts.blocked, 3);
  const a = audit(); a.listings[0].metadataConflict = true;
  assert.equal(buildGermanyIdentityFoundation([a], foundationSource).counts.listings, 2);
  const prior = { ticker: 'SAP', mic: 'XETR', isin: 'DE0006048432', assetType: 'EQUITY', tradingCurrency: 'EUR' };
  const result = buildGermanyIdentityFoundation([audit()], foundationSource, [prior]);
  assert.equal(result.counts.blocked, 2); assert.ok(!result.layer.listings.some(r => r.ticker === 'SAP'));
});

test('same existing ticker/MIC with a different currency is blocked before new identity generation', () => {
  const prior = { ticker: 'SAP', mic: 'XETR', isin: 'DE0007164600', assetType: 'EQUITY', tradingCurrency: 'USD',
    listingId: 'vu_abcdef', securityId: 'accepted_security' };
  const result = buildGermanyIdentityFoundation([audit()], foundationSource, [prior]);
  assert.equal(result.counts.blocked, 1); assert.ok(!result.layer.listings.some(r => r.ticker === 'SAP'));
  assert.equal(result.decisions.find(d => d.providerSymbol === 'SAP.DE').reason, 'EXISTING_LISTING_CURRENCY_CONFLICT');
});

test('same security/venue/currency aliases share one canonical foundation listing', () => {
  const a = audit(); a.listings.push({ ...a.listings[0], providerSymbol: 'SAP.XETR' });
  const result = buildGermanyIdentityFoundation([a], foundationSource);
  assert.equal(result.counts.listings, 3);
  const sap = result.layer.listings.find(r => r.ticker === 'SAP');
  assert.deepEqual(sap.providerAliases.sort(), ['SAP.DE', 'SAP.XETR']);
});

const snapshot = () => ({ sourceSystem: 'DEUTSCHE_BOERSE_PUBLIC_INDEX_CONSTITUENTS', sourceURL: 'https://live.deutsche-boerse.com/',
  indices: [{ index: 'DAX', officialPage: 'https://live.deutsche-boerse.com/indices/dax/constituents', retrievedAt: '2026-10-01T14:00:00Z',
    recordsTotal: 2, components: [{ isin: 'DE0007164600', mic: 'XETR', name: 'SAP' }, { isin: 'DE0007164600', mic: 'XFRA', name: 'SAP elsewhere' }] }] });

test('index coverage uses exact ISIN+venue and never synthesizes historical PIT', () => {
  const result = compareGermanIndexCoverage(snapshot(), [audit()]); const index = result.indices[0];
  assert.equal(index.completeSnapshot, true); assert.equal(index.exactISINVenueMatches, 1);
  assert.equal(index.fullIndexDirectoryCoverage, false); assert.equal(index.compositionEffectiveAt, null);
  assert.equal(result.historicalMembershipAvailability, 'UNKNOWN');
  assert.equal(index.components[1].directoryStatus, 'UNMATCHED_PARTIAL_DIRECTORY');
  assert.deepEqual(index.components[1].providerSymbols, []);
});

test('partial index snapshots and duplicate/missing ISIN identities cannot claim full coverage', () => {
  const snap = snapshot(); snap.indices[0].recordsTotal = 40;
  assert.equal(compareGermanIndexCoverage(snap, [audit()]).indices[0].fullIndexDirectoryCoverage, null);
  snap.indices[0].components[1] = { ...snap.indices[0].components[0] };
  assert.throws(() => compareGermanIndexCoverage(snap, [audit()]), /Duplicate index/);
  snap.indices[0].components[1] = { isin: null, mic: 'XETR' };
  assert.throws(() => compareGermanIndexCoverage(snap, [audit()]), /Explicit constituent ISIN/);
});

test('direct constituent metadata requires returned ISIN, venue and requested symbol identity', () => {
  const snap = snapshot(); snap.indices[0].components = [snap.indices[0].components[0]]; snap.indices[0].recordsTotal = 1;
  const options = { referenceRows: master().rows, providerSuffixes: { XETR: ['.DE'] }, identityProbes: [
    { endpoint: 'tickers/SAP.DE', ok: false, status: 404, checkedAt: '2026-10-01T15:00:00Z', providerErrorCode: 'not_found_error' },
    { endpoint: 'tickers/OLD.DE', ok: true, data: { symbol: 'OTHER.DE', isin: 'DE0007164600', stock_exchange: { mic: 'XETR' } } },
    { endpoint: 'tickers/ALIAS.DE', ok: true, data: { symbol: 'ALIAS.DE', isin: 'DE0007164600', stock_exchange: { mic: 'XETR' } } } ] };
  const result = compareGermanIndexCoverage(snap, [audit(directory(), [])], options).indices[0];
  assert.equal(result.exactISINVenueMatches, 0); assert.equal(result.directMetadataIdentityMatches, 1);
  assert.equal(result.exactDirectoryOrMetadataIdentityMatches, 1); assert.equal(result.fullIndexDirectoryCoverage, false);
  assert.deepEqual(result.components[0].directIdentityProbes.map(p => p.status),
    ['REQUESTED_SYMBOL_NOT_FOUND', 'RETURNED_IDENTITY_MISMATCH', 'EXACT_ISIN_VENUE_METADATA_MATCH']);
  assert.equal(result.components[0].historyValidation, 'NOT_ESTABLISHED_BY_MEMBERSHIP');
  options.identityProbes.pop();
  options.identityProbes.push({ endpoint: 'tickers/SAP.DE', ok: true, data: { symbol: 'SAP.DE', isin: 'DE0007164600', stock_exchange: { mic: 'XFRA' } } });
  const failed = compareGermanIndexCoverage(snap, [audit(directory(), [])], options).indices[0];
  assert.equal(failed.directMetadataIdentityMatches, 0); assert.equal(failed.components[0].directIdentityStatus, 'TESTED_WITHOUT_EXACT_MATCH');
  assert.equal(failed.components[0].directIdentityProbes.at(-1).status, 'RETURNED_IDENTITY_MISMATCH');
});

const metadataEntry = (symbol, isin, overrides = {}) => ({ endpoint: 'tickers/' + symbol, label: 'germany-full-equity-metadata-validation',
  ok: true, checkedAt: '2026-10-01T16:00:00Z', data: { symbol, isin, item_type: 'equity', stock_exchange: { mic: 'XETR' }, ...overrides } });
const candle = (symbol, overrides = {}) => ({ symbol, exchange: 'XETR', date: '2026-09-29T00:00:00Z', open: 10, high: 12, low: 9, close: 11, volume: 100, ...overrides });
const weeklyEntry = rows => ({ endpoint: 'eod', label: 'germany-full-equity-latest-week', ok: true, checkedAt: '2026-10-01T16:00:00Z',
  params: { symbols: 'SAP.DE,HEN3.DE', date_from: '2026-09-21', date_to: '2026-09-30' }, data: { data: rows } });

test('weekly prices require exact metadata identity and retain missing ISIN without price admission', () => {
  const result = validateGermanEquityMarketData([audit()], [metadataEntry('SAP.DE', 'DE0007164600'),
    metadataEntry('HEN3.DE', ''), weeklyEntry([candle('SAP.DE'), candle('HEN3.DE')])]);
  assert.equal(result.counts.candidates, 2); assert.equal(result.counts.byCurrentPriceStatus.VALID, 1);
  assert.equal(result.counts.byCurrentPriceStatus.IDENTITY_UNVERIFIED, 1);
  assert.equal(result.counts.byObservedPriceQualityStatus.VALID, 2);
  const sap = result.listings.find(row => row.providerSymbol === 'SAP.DE');
  assert.equal(sap.currencyFilledFromOfficial, 1); assert.equal(sap.tradingCurrency, 'EUR');
  assert.equal(sap.candlesAdmittedForPriceValidation, 1); assert.equal(sap.technicalActivation, false);
  const hen = result.listings.find(row => row.providerSymbol === 'HEN3.DE');
  assert.equal(hen.candlesAdmittedForPriceValidation, 0); assert.equal(hen.latestValidTradingDate, null);
});

test('fresh metadata currency/type/ISIN/venue contradictions quarantine the whole listing', () => {
  for (const overrides of [{ isin: 'US0378331005' }, { currency: 'USD' }, { item_type: 'etf' }, { stock_exchange: { mic: 'XFRA' } }, { symbol: 'OTHER.DE' }]) {
    const result = validateGermanEquityMarketData([audit()], [metadataEntry('SAP.DE', 'DE0007164600', overrides), weeklyEntry([candle('SAP.DE')])]);
    const sap = result.listings.find(row => row.providerSymbol === 'SAP.DE');
    assert.equal(sap.metadataStatus, 'QUARANTINED'); assert.equal(sap.currentPriceStatus, 'QUARANTINED');
    assert.equal(sap.candlesAdmittedForPriceValidation, 0); assert.equal(sap.latestValidTradingDate, null);
  }
});

test('weekly quality rejects impossible/out-of-request prices and conflicting duplicates preserve diagnostics', () => {
  const inputs = [metadataEntry('SAP.DE', 'DE0007164600'), metadataEntry('HEN3.DE', 'DE0006048432')];
  let result = validateGermanEquityMarketData([audit()], [...inputs, weeklyEntry([candle('SAP.DE', { high: 0 }),
    candle('HEN3.DE', { date: '2026-10-02T00:00:00Z' })])]);
  assert.equal(result.counts.byCurrentPriceStatus.QUALITY_REJECTED, 2); assert.equal(result.counts.qualityRejectedCandles, 2);
  result = validateGermanEquityMarketData([audit()], [...inputs, weeklyEntry([candle('SAP.DE'), candle('SAP.DE', { close: 10 })])]);
  const sap = result.listings.find(row => row.providerSymbol === 'SAP.DE');
  assert.equal(sap.currentPriceStatus, 'QUARANTINED'); assert.equal(sap.duplicateCandles, 1);
  assert.ok(sap.quarantineReasons.includes('CONTRADICTORY_DUPLICATE_CANDLE'));
  result = validateGermanEquityMarketData([audit()], [...inputs, weeklyEntry([candle('SAP.DE', { price_currency: 'USD' })])]);
  assert.equal(result.listings.find(row => row.providerSymbol === 'SAP.DE').currentPriceStatus, 'QUARANTINED');
  result = validateGermanEquityMarketData([audit()], [...inputs, weeklyEntry([candle('SAP.DE')])], { maxCalendarAgeDays: 1 });
  assert.equal(result.listings.find(row => row.providerSymbol === 'SAP.DE').currentPriceStatus, 'STALE');
});

test('unrequested or missing candle identities quarantine every requested listing in that batch', () => {
  const result = validateGermanEquityMarketData([audit()], [metadataEntry('SAP.DE', 'DE0007164600'),
    metadataEntry('HEN3.DE', 'DE0006048432'), weeklyEntry([candle('OTHER.DE')])]);
  assert.equal(result.counts.byCurrentPriceStatus.QUARANTINED, 2);
  assert.deepEqual(result.unrequestedReturnedSymbols, ['OTHER.DE']);
});
