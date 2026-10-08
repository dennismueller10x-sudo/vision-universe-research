import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { compileUcitsEvidence, readIngestionEvidence, compileUcitsFromDirectories } from '../../../scripts/marketstack/ucits-build-evidence.mjs';
const isin = 'IE00B5BMR087', symbol = 'SXR8.DE', mic = 'XETR', now = '2026-10-08T23:00:00Z';
const selected = { etfs: [{ providerTicker: symbol, mic, isin, nativeTicker: 'SXR8', name: 'Sample UCITS ETF' }] };
const officialReference = { rows: [{ 'Instrument Type': 'ETF', 'Instrument Status': 'Active', 'MIC Code': mic, ISIN: isin, Mnemonic: 'SXR8', Currency: 'EUR' }] };
const metadata = overrides => ({ operation: { kind: 'metadata', symbol, mic, expectedIsin: isin }, result: { ok: true, ingestionIdentityMatched: true, retrievedAt: now,
  observations: [{ normalized: { providerTicker: symbol, providerExchange: mic, isin, currency: 'EUR' }, raw: { symbol, exchange: mic, isin, name: 'Sample UCITS ETF', ...overrides } }] } });
const rawBar = (date, extra = {}) => ({ raw: { symbol, exchange: mic, currency: 'EUR', date }, normalized: { providerTicker: symbol, providerExchange: mic, currency: 'EUR', tradingDate: date, open: 10, high: 12, low: 9, close: 11, volume: 10, ...extra } });
const history = { operation: { kind: 'history', listing: { providerTicker: symbol, mic }, from: '2021-10-08', to: '2026-10-08' }, result: { ok: true, complete: true, data: [rawBar('2026-10-06'), rawBar('2026-10-07')] } };
const latest = { operation: { kind: 'latestBatch', mic, symbols: [symbol] }, result: { ok: true, complete: true, data: [rawBar('2026-10-08')] } };
const fullHoldings = { operation: { kind: 'holdings', symbol, market: 'EUROPE' }, result: { ok: true, complete: true, pagination: { total: 2 }, raw: [{ retained: true }],
  data: { attributes: [{ ticker: symbol, date_report_period: '2026-07-01', end_report_period: '2026-09-30' }], holdings: [{ weightPercent: 60, weightRaw: '60', assetCategory: 'EC', isin: 'US0378331005', raw: { arbitrary: 'all rows preserved' } }, { weightPercent: 40, weightRaw: '40', assetCategory: 'EC', isin: 'DE0007164600' }], reportDates: ['2026-07-01'], reportedPeriodEnds: ['2026-09-30'], reportedTotal: 2 } } };
const calendars = { XETR: { verified: true, mic, source: 'TEST_EXCHANGE_SESSION_EVIDENCE', expectedLastCompletedSession: '2026-10-08' } };
const compile = (foundationEntries = [], extra = {}) => compileUcitsEvidence({ selected, officialReference, foundationEntries, now, calendars, ...extra });

test('global ETF directory caps are reported separately from European and certified UCITS coverage', () => {
  const result = compile([], { discoveryEntries: [{ operation: { kind: 'etfs' }, result: { complete: false, data: [{ ticker: 'VOO' }, { ticker: '000001.SZ' }] } }] });
  const summary = result.marketstack_ucits_universe.summary;
  assert.equal(summary.europeanEtfCandidates, 1);
  assert.equal(summary.globalDirectoryUnclassifiedCandidates, 2);
  assert.equal(summary.globalDirectoryComplete, false);
  assert.equal(summary.confirmedUcitsListings, 0);
  assert.equal(summary.acceptedPrivateIdentity, 0);
  assert.equal(summary.holdingsNotProbed, 1);
  assert.equal(summary.holdingsProbed, 0);
  assert.deepEqual(summary.probedHoldingsStatus, {});
  assert.equal(result.marketstack_ucits_holdings_status.rows[0].status, null);
  assert.equal(result.marketstack_ucits_holdings_status.rows[0].probeState, 'NOT_PROBED');
  assert.deepEqual(summary.holdingsStatus, { UNKNOWN: 1 });
  assert.equal(result.marketstack_ucits_universe.publicationAllowed, false);
});

test('exact official ETF ISIN/listing plus unique provider metadata admits private identity without fabricated fund', () => {
  const result = compile([metadata(), history, latest]);
  const listing = result.marketstack_ucits_universe.listings[0];
  assert.equal(listing.admission, 'ACCEPTED_PRIVATE_IDENTITY');
  assert.equal(listing.identity.shareClassId, isin);
  assert.equal(listing.identity.fundId, null);
  assert.equal(listing.ucits, null);
  assert.equal(listing.ucitsNameCue, 'OBSERVED_NAME_CUE');
  assert.equal(listing.price.freshness, 'CURRENT');
  assert.equal(listing.price.latest.close, 11);
  assert.equal(listing.price.history.horizons.max.status, 'UNKNOWN');
  assert.equal(result.marketstack_ucits_universe.summary.confirmedFunds, 0);
  assert.equal(result.marketstack_vorsorge_readiness.rows[0].readiness.vorsorgeFacadeReady, false);
  assert.equal(result.marketstack_vorsorge_readiness.rows[0].readiness.publicationReady, false);
});

test('history range and current exchange session gate prices; stale charts remain limited', () => {
  const narrow = { ...history, operation: { ...history.operation, from: '2026-10-07', to: '2026-10-08' } };
  const limited = compile([metadata(), narrow, latest]).marketstack_ucits_universe.listings[0].price;
  assert.equal(limited.history.observations, 1);
  assert.equal(limited.historyQuality.counts.quarantined, 1);
  assert.equal(limited.chart, 'CHART_LIMITED');
  const future = { ...latest, result: { ...latest.result, data: [rawBar('2026-10-09')] } };
  const futureResult = compile([metadata(), history, future]);
  const futurePrice = futureResult.marketstack_ucits_universe.listings[0].price;
  assert.equal(futurePrice.valid, false);
  assert.equal(futureResult.marketstack_ucits_summary.summary.acceptedLatestPriceCoverage, 0);
  assert.ok(futurePrice.latestQuality.quarantine[0].reasons.includes('FUTURE_EOD_DATE'));
  const preClose = compile([metadata(), latest], { calendars: { XETR: { ...calendars.XETR, expectedLastCompletedSession: '2026-10-07' } } }).marketstack_ucits_universe.listings[0].price;
  assert.equal(preClose.valid, false);
  assert.ok(preClose.latestQuality.quarantine[0].reasons.includes('UNCOMPLETED_SESSION_EOD'));
  const stale = compile([metadata(), history]).marketstack_ucits_universe.listings[0].price;
  assert.equal(stale.freshness, 'STALE');
  assert.equal(stale.chart, 'CHART_LIMITED');
});

test('wrong metadata ISIN, unavailable official evidence or currency contradiction stays review', () => {
  const wrong = metadata(); wrong.result.observations[0].normalized.isin = 'IE00B4L5Y983';
  assert.equal(compile([wrong]).marketstack_ucits_universe.summary.acceptedPrivateIdentity, 0);
  assert.equal(compile([metadata()], { officialReference: { rows: [] } }).marketstack_ucits_universe.summary.acceptedPrivateIdentity, 0);
  const wrongCurrency = metadata(); wrongCurrency.result.observations[0].normalized.currency = 'USD';
  assert.equal(compile([wrongCurrency]).marketstack_ucits_universe.listings[0].identity.identityStatus, 'REVIEW');
});

test('scoped fresh official Xetra ETF plus observed directory .DE alias resolves only missing provider ISIN', () => {
  const reference = { ...officialReference, source: { httpStatus: 200, url: 'https://www.cashmarket.deutsche-boerse.com/resource/xetra.csv',
    sha256: 'a'.repeat(64), retrievedAt: '2026-10-08T14:00:00Z' }, sourceEvidence: { rawHashesVerified: true } };
  const directory = { operation: { kind: 'directory', mic }, sourceEvidence: { rawHashesVerified: true }, result: { data: [
    { raw: { symbol, stock_exchange: { mic }, isin: '', item_type: 'etf' }, normalized: { providerTicker: symbol, providerExchange: mic, name: 'Sample UCITS ETF', assetType: 'etf', isin: '' } }
  ] } };
  const empty = metadata({ isin: '', item_type: 'etf' }); empty.result.ingestionIdentityMatched = false;
  Object.assign(empty.result.observations[0].normalized, { isin: '', currency: null, assetType: 'etf' });
  const run = (entry = empty, dir = directory, ref = reference) => compile([entry, latest], { officialReference: ref, discoveryEntries: [dir] });
  const accepted = run().marketstack_ucits_universe.listings[0];
  assert.equal(accepted.admission, 'ACCEPTED_PRIVATE_IDENTITY');
  assert.equal(accepted.identity.isin, isin);
  assert.equal(accepted.identity.currency, 'EUR');
  assert.equal(accepted.identity.identityProvenance.policy, 'OFFICIAL_XETRA_ETF_OBSERVED_DOT_DE_ALIAS');
  assert.equal(accepted.identity.identityProvenance.providerReportedIsin, null);
  assert.equal(accepted.identity.identityProvenance.providerReportedCurrency, null);
  assert.equal(accepted.price.valid, true);
  assert.equal(empty.result.observations[0].raw.isin, '');
  assert.equal(empty.result.observations[0].normalized.currency, null);
  assert.equal(accepted.ucits, null);
  for (const patch of [{ isin: 'IE00B4L5Y983' }, { isin: 0 }, { isin: false }, { exchange: 'XNAS' }, { item_type: 'stock' }]) {
    const bad = structuredClone(empty); Object.assign(bad.result.observations[0].raw, patch);
    assert.equal(run(bad).marketstack_ucits_universe.summary.acceptedPrivateIdentity, 0);
  }
  const unverifiedDirectory = structuredClone(directory); unverifiedDirectory.sourceEvidence.rawHashesVerified = false;
  assert.equal(run(empty, unverifiedDirectory).marketstack_ucits_universe.summary.acceptedPrivateIdentity, 0);
  const staleReference = structuredClone(reference); staleReference.source.retrievedAt = '2025-10-08T14:00:00Z';
  assert.equal(run(empty, directory, staleReference).marketstack_ucits_universe.summary.acceptedPrivateIdentity, 0);
  const uncued = structuredClone(directory);
  uncued.result.data[0].raw = { symbol, stock_exchange: { mic }, isin: '', name: 'Official share class ABC' };
  Object.assign(uncued.result.data[0].normalized, { name: 'Official share class ABC', assetType: null });
  uncued.result.data.push({ raw: { symbol: 'UNRELATED.DE', stock_exchange: { mic }, name: 'Other ABC' }, normalized: { providerTicker: 'UNRELATED.DE', providerExchange: mic, name: 'Other ABC' } });
  const preserved = run(empty, uncued);
  assert.equal(preserved.marketstack_ucits_universe.summary.acceptedPrivateIdentity, 1);
  assert.equal(preserved.marketstack_ucits_universe.summary.europeanEtfCandidates, 1);
  for (const declarations of [{ isin: 'IE00B4L5Y983' }, { exchange: 'XNAS' }, { currency: 'USD' }, { item_type: 'warrant' }, { type: 'certificate' }, { asset_type: 'bond' }]) {
    const wrong = structuredClone(uncued); Object.assign(wrong.result.data[0].raw, declarations);
    assert.equal(run(empty, wrong).marketstack_ucits_universe.summary.acceptedPrivateIdentity, 0);
    wrong.result.data.push(structuredClone(directory.result.data[0]));
    assert.equal(run(empty, wrong).marketstack_ucits_universe.summary.acceptedPrivateIdentity, 0);
  }
  const ambiguousReference = structuredClone(reference); ambiguousReference.rows.push({ ...ambiguousReference.rows[0], ISIN: 'IE00B4L5Y983' });
  assert.equal(run(empty, directory, ambiguousReference).marketstack_ucits_universe.summary.acceptedPrivateIdentity, 0);
  const conflictSelections = { etfs: [...selected.etfs, { ...selected.etfs[0], isin: 'IE00B4L5Y983' }] };
  const conflicting = compile([empty], { officialReference: reference, discoveryEntries: [directory], selected: conflictSelections });
  assert.equal(conflicting.marketstack_ucits_universe.summary.acceptedPrivateIdentity, 0);
  assert.equal(conflicting.marketstack_ucits_universe.listings[0].identityConflicts[0].reason, 'CONFLICTING_LISTING_ISIN');
  const nativeHoldings = structuredClone(fullHoldings);
  nativeHoldings.operation = { kind: 'holdings', symbol: 'SXR8', nativeTicker: 'SXR8', listingRef: { providerTicker: symbol, mic, isin } };
  nativeHoldings.result.data.attributes[0] = { ...nativeHoldings.result.data.attributes[0], ticker: 'SXR8', isin };
  const physical = structuredClone(empty); physical.result.observations[0].raw.replication = 'physical';
  const nativeCompile = () => compile([physical, nativeHoldings], { officialReference: reference, discoveryEntries: [directory] }).marketstack_ucits_holdings_status.rows[0];
  delete nativeHoldings.operation.nativeTicker;
  assert.equal(nativeCompile().status, 'FULL');
  assert.equal(nativeCompile().xrayReady, true);
  nativeHoldings.result.data.attributes.push({ ...nativeHoldings.result.data.attributes[0], isin: '' });
  assert.equal(nativeCompile().status, 'PARTIAL');
  assert.equal(nativeCompile().xrayReady, false);
  assert.equal(nativeCompile().binding, 'NATIVE_TICKER_ONLY_SHARE_CLASS_UNKNOWN');
  nativeHoldings.operation.nativeTicker = 'WRONG';
  assert.equal(nativeCompile().probeState, 'NOT_PROBED');
  delete nativeHoldings.operation.nativeTicker;
  const nativeInfo = { operation: { kind: 'tickerInfo', symbol: 'SXR8', mic }, result: { ok: true, observations: [
    { raw: { symbol: 'SXR8', isin, currency: 'EUR', aum: 100, aum_currency: 'EUR' }, normalized: { providerTicker: 'SXR8', isin, currency: 'EUR' } }
  ] } };
  const nativeMeta = () => compile([empty, nativeInfo], { officialReference: reference, discoveryEntries: [directory] }).marketstack_ucits_metadata_status.rows[0];
  assert.equal(nativeMeta().fields.aum, 100);
  nativeInfo.operation.nativeTicker = 'WRONG'; assert.equal(nativeMeta().fields.aum, null); delete nativeInfo.operation.nativeTicker;
  nativeInfo.operation.listingRef = { providerTicker: symbol, mic, isin: 'IE00B4L5Y983' };
  assert.equal(nativeMeta().fields.aum, null); delete nativeInfo.operation.listingRef;
  const nullBar = date => {
    const bar = rawBar(date, { currency: null }); bar.raw.currency = null; bar.raw.price_currency = null; return bar;
  };
  const nullLatest = { ...latest, result: { ...latest.result, data: [nullBar('2026-10-08')] } };
  const nullHistory = { ...history, result: { ...history.result, data: [nullBar('2026-10-06'), nullBar('2026-10-07')] } };
  const canonical = compile([empty, nullHistory, nullLatest], { officialReference: reference, discoveryEntries: [directory] }).marketstack_ucits_universe.listings[0];
  assert.equal(canonical.price.valid, true);
  assert.equal(canonical.price.latest.currency, 'EUR');
  assert.equal(canonical.price.latest.currencyBasis, 'CANONICAL_REFERENCE_CURRENCY');
  assert.equal(canonical.price.currencyEvidence.field, 'Currency');
  assert.equal(canonical.price.currencyEvidence.source.sha256, reference.source.sha256);
  assert.equal(canonical.price.currencyEvidence.sameListing.isin, isin);
  assert.equal(canonical.price.historyQuality.canonicalReferenceCurrencyRows.length, 2);
  assert.equal(canonical.price.latestQuality.canonicalReferenceCurrencyRows.length, 1);
  assert.equal(nullLatest.result.data[0].raw.price_currency, null);
  assert.equal(nullLatest.result.data[0].normalized.currency, null);
  for (const currency of ['USD', '', false, 0]) {
    const badLatest = structuredClone(nullLatest); badLatest.result.data[0].raw.price_currency = currency;
    const rejectedPrice = compile([empty, badLatest], { officialReference: reference, discoveryEntries: [directory] }).marketstack_ucits_universe.listings[0].price;
    assert.equal(rejectedPrice.valid, false);
    assert.equal(rejectedPrice.latestQuality.counts.quarantined, 1);
    const badMetadata = structuredClone(empty); badMetadata.result.observations[0].raw.currency = currency;
    assert.equal(run(badMetadata).marketstack_ucits_universe.summary.acceptedPrivateIdentity, 0);
  }
  const unproven = compile([metadata(), nullLatest]).marketstack_ucits_universe.listings[0].price;
  assert.equal(unproven.valid, false);
  assert.equal(unproven.currencyEvidence, null);
  assert.ok(unproven.latestQuality.quarantine[0].reasons.includes('MISSING_PROVIDER_CURRENCY_WITHOUT_VERIFIED_REFERENCE'));
});

test('tickerInfo supplements existing qualified identity with provenance; unbound native or conflicting metadata is observed only', () => {
  const info = { operation: { kind: 'tickerInfo', symbol, mic }, result: { ok: true, observations: [
    { raw: { symbol, aum: 100, aum_currency: 'EUR', expense_ratio: 0.2, expense_ratio_unit: 'percent' }, normalized: { providerTicker: symbol } }
  ] } };
  const meta = compile([metadata(), info]).marketstack_ucits_metadata_status.rows[0];
  assert.equal(meta.fields.aum, 100);
  assert.equal(meta.expenseRatioObservation.value, 0.2);
  assert.equal(meta.fields.ter, null);
  assert.equal(meta.provenance.aum.binding, 'OBSERVED_QUALIFIED_PROVIDER_ALIAS');
  for (const declarations of [{ symbol: 'WRONG' }, { isin: 'IE00B4L5Y983' }, { isin: 0 }, { isin: false }, { exchange: 'XNAS' }, { currency: 'USD' }, { currency: false }, { currency: 0 }, { currency: '' }, { fund_currency: 'USD' }, { item_type: 'stock' }]) {
    const wrong = structuredClone(info); Object.assign(wrong.result.observations[0].raw, declarations);
    const result = compile([metadata(), wrong]).marketstack_ucits_metadata_status.rows[0];
    assert.equal(result.fields.aum, null);
    assert.equal(result.supplementalObservedMetadata[0].observed[0].fields.aum, 100);
  }
  const native = structuredClone(info); native.operation = { kind: 'tickerInfo', symbol: 'SXR8', mic };
  native.result.observations[0].raw.symbol = 'SXR8'; native.result.observations[0].normalized.providerTicker = 'SXR8';
  assert.equal(compile([metadata(), native]).marketstack_ucits_metadata_status.rows[0].fields.aum, null);
});

test('literal 0NS Xetra USD reference resolves identity without estimating price; provider EUR contradicts USD', () => {
  const usdIsin = 'LU2451511526', usdSymbol = '0NS.DE';
  const usdSelected = { etfs: [{ providerTicker: usdSymbol, nativeTicker: '0NS', mic, isin: usdIsin }] };
  const reference = { rows: [{ 'Instrument Type': 'ETF', 'Instrument Status': 'Active', 'MIC Code': mic, ISIN: usdIsin, Mnemonic: '0NS', Currency: 'USD' }],
    source: { httpStatus: 200, url: 'https://www.cashmarket.deutsche-boerse.com/resource/xetra.csv', sha256: 'b'.repeat(64), retrievedAt: '2026-10-08T14:00:00Z' }, sourceEvidence: { rawHashesVerified: true } };
  const directory = { operation: { kind: 'directory', mic }, sourceEvidence: { rawHashesVerified: true }, result: { data: [
    { raw: { symbol: usdSymbol, stock_exchange: { mic }, isin: '', name: 'Reference class' }, normalized: { providerTicker: usdSymbol, providerExchange: mic, isin: '', currency: null, name: 'Reference class' } }
  ] } };
  const meta = { operation: { kind: 'metadata', symbol: usdSymbol, mic, expectedIsin: usdIsin }, result: { ok: true, ingestionIdentityMatched: false, observations: [
    { raw: { symbol: usdSymbol, stock_exchange: { mic }, isin: '', item_type: 'etf', currency: null }, normalized: { providerTicker: usdSymbol, providerExchange: mic, isin: '', assetType: 'etf', currency: null } }
  ] } };
  const run = (entries = [meta], extra = {}) => compile(entries, { selected: usdSelected, officialReference: reference, discoveryEntries: [directory], ...extra });
  const identified = run().marketstack_ucits_universe.listings[0];
  assert.equal(identified.admission, 'ACCEPTED_PRIVATE_IDENTITY'); assert.equal(identified.identity.currency, 'USD');
  assert.equal(identified.identity.currencyProvenance.field, 'Currency'); assert.equal(identified.identity.currencyProvenance.rawFieldValue, 'USD');
  assert.equal(identified.identity.currencyProvenance.fxApplied, false); assert.equal(identified.price.valid, false); assert.equal(identified.price.latest, null);
  const usdBar = rawBar('2026-10-08', { providerTicker: usdSymbol, currency: null }); Object.assign(usdBar.raw, { symbol: usdSymbol, currency: null, price_currency: null });
  const usdLatest = { operation: { kind: 'latestBatch', mic, symbols: [usdSymbol] }, result: { ok: true, complete: true, data: [usdBar] } };
  const price = run([meta, usdLatest]).marketstack_ucits_universe.listings[0].price;
  assert.equal(price.valid, true); assert.equal(price.latest.currency, 'USD'); assert.equal(price.latest.currencyBasis, 'CANONICAL_REFERENCE_CURRENCY');
  assert.equal(usdBar.raw.price_currency, null); assert.equal(usdBar.normalized.currency, null);
  const eurMetadata = structuredClone(meta); eurMetadata.result.observations[0].raw.currency = 'EUR';
  assert.equal(run([eurMetadata]).marketstack_ucits_universe.summary.acceptedPrivateIdentity, 0);
  const eurLatest = structuredClone(usdLatest); eurLatest.result.data[0].raw.price_currency = 'EUR';
  const wrongPrice = run([meta, eurLatest]).marketstack_ucits_universe.listings[0].price;
  assert.equal(wrongPrice.valid, false); assert.ok(wrongPrice.latestQuality.quarantine[0].reasons.includes('CURRENCY_INCONSISTENT'));
  assert.equal(eurLatest.result.data[0].raw.price_currency, 'EUR');
  const unauthorizedReference = structuredClone(reference); unauthorizedReference.rows[0] = { ...reference.rows[0], ISIN: isin, Mnemonic: 'SXR8' };
  const wrongIsin = { etfs: [{ providerTicker: symbol, nativeTicker: 'SXR8', mic, isin }] };
  assert.equal(compile([metadata({ isin: '', item_type: 'etf' })], { selected: wrongIsin, officialReference: unauthorizedReference, discoveryEntries: [directory] }).marketstack_ucits_universe.summary.acceptedPrivateIdentity, 0);
});

test('missing metadata remains null; expense ratio observation never becomes TER', () => {
  const result = compile([metadata({ expense_ratio: 0.2, expense_ratio_unit: 'percent' })]);
  const meta = result.marketstack_ucits_metadata_status.rows[0];
  assert.equal(meta.fields.aum, null);
  assert.equal(meta.fields.nav, null);
  assert.equal(meta.fields.ter, null);
  assert.equal(meta.fields.terFraction, null);
  assert.equal(meta.expenseRatioObservation.value, 0.2);
  assert.equal(result.marketstack_ucits_universe.summary.terCoverage, 0);
  assert.equal(meta.fields.ucits, null);
});

test('holdings full requires structure evidence; raw weights rows dates preserved; 504 coverage UNKNOWN', () => {
  const full = compile([metadata({ replication: 'physical' }), fullHoldings]);
  assert.equal(full.marketstack_ucits_holdings_status.rows[0].status, 'FULL');
  assert.equal(full.marketstack_ucits_holdings_status.rows[0].holdingsCount, 2);
  assert.equal(full.marketstack_ucits_holdings_status.rows[0].normalizedRows[0].weightOriginal, '60');
  assert.deepEqual(full.marketstack_ucits_holdings_status.rows[0].raw[0], { retained: true });
  assert.equal(full.marketstack_ucits_holdings_status.rows[0].asOf, '2026-09-30');
  assert.equal(compile([metadata(), fullHoldings]).marketstack_ucits_holdings_status.rows[0].status, 'PARTIAL');
  const gateway = { operation: fullHoldings.operation, result: { ok: false, status: 504, reason: 'httpError', complete: false, data: { holdings: [] } } };
  const failed = compile([metadata(), gateway]).marketstack_ucits_holdings_status.rows[0];
  assert.equal(failed.status, 'GATEWAY_ERROR');
  assert.equal(failed.underlyingCoverage, 'UNKNOWN');
  assert.equal(failed.attempts.length, 1);
  assert.equal(failed.probeState, 'PROBED_THIS_RUN');
  assert.equal(failed.xrayReady, false);
});

test('native holdings keep every row as provider-observed evidence but require exact share-class binding for XRay', () => {
  const native = structuredClone(fullHoldings);
  native.operation = { kind: 'holdings', symbol: 'SXR8', nativeTicker: 'SXR8', listingRef: { providerTicker: symbol, mic, isin } };
  native.result.data.attributes[0].ticker = 'SXR8';
  const row = compile([metadata({ replication: 'physical' }), native]).marketstack_ucits_holdings_status.rows[0];
  assert.equal(row.providerObservedStatus, 'FULL');
  assert.equal(row.status, 'PARTIAL');
  assert.equal(row.binding, 'NATIVE_TICKER_ONLY_SHARE_CLASS_UNKNOWN');
  assert.equal(row.holdingsCount, 2);
  assert.equal(row.sumWeights, 1);
  assert.equal(row.normalizedRows[0].weightOriginal, '60');
  assert.equal(row.underlyingCoverage, 'UNKNOWN');
  assert.equal(row.xrayReady, false);
  const summary = compile([metadata({ replication: 'physical' }), fullHoldings, native]).marketstack_ucits_summary;
  assert.deepEqual(summary.summary.holdingsQueriesByNamespace, { QUALIFIED_LISTING: 1, NATIVE_MNEMONIC: 1 });
  assert.equal(summary.holdingsQueryInventory[0].querySymbol, symbol);
  assert.equal(summary.holdingsQueryInventory[1].querySymbol, 'SXR8');
  assert.equal(summary.holdingsQueryInventory[1].canonicalProviderTicker, symbol);
  assert.equal(summary.holdingsQueryInventory[1].providerHoldingsCount, 2);
  assert.equal(summary.holdingsQueryInventory[1].underlyingCoverage, 'UNKNOWN');
});

test('same ISIN groups share classes without fund name collapse and directory name cues remain review', () => {
  const result = compile([metadata()], { selected: { etfs: [...selected.etfs, { ...selected.etfs[0], providerTicker: 'SXR8.XETR' }] }, discoveryEntries: [
    { operation: { kind: 'directory', mic: 'XLON' }, result: { data: [{ raw: { symbol: 'NAME', name: 'Sample UCITS ETF', exchange: 'XLON' }, normalized: { providerTicker: 'NAME', providerExchange: 'XLON', name: 'Sample UCITS ETF' } }] } }
  ] });
  assert.equal(result.marketstack_ucits_universe.identities.counts.shareClasses, 1);
  assert.equal(result.marketstack_ucits_universe.identities.counts.funds, 0);
  assert.equal(result.marketstack_ucits_universe.summary.review, 2);
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'vu-ucits-compile-')), discovery = join(root, 'discovery');
  mkdirSync(join(discovery, 'raw'), { recursive: true }); mkdirSync(join(discovery, 'normalized'));
  const write = (path, value) => writeFileSync(path, JSON.stringify(value));
  const raw = JSON.stringify({ data: [{ ticker: 'VOO' }] }), sha256 = createHash('sha256').update(raw).digest('hex');
  writeFileSync(join(discovery, 'raw/000001.json'), raw);
  write(join(discovery, 'raw-manifest.json'), [{ id: '000001', sha256, endpoint: '/etflist', status: 200, apiVersion: 'v2', host: 'api.marketstack.com' }]);
  const operation = { kind: 'etfs' }, resultPath = 'normalized/000000.json';
  write(join(discovery, resultPath), { ordinal: 0, operation, responseIds: ['000001'], result: { complete: false, data: [{ ticker: 'VOO' }] } });
  write(join(discovery, 'summary.json'), { results: [{ ordinal: 0, operation, resultPath }] });
  const selectedPath = join(root, 'selected.json'), officialReferencePath = join(root, 'official.json');
  write(selectedPath, selected); write(officialReferencePath, officialReference);
  return { root, discovery, selectedPath, officialReferencePath };
}

test('private loader verifies raw bytes and retains exact source paths/hash references', async () => {
  const dir = fixture();
  const entries = await readIngestionEvidence(dir.discovery, () => true);
  assert.equal(entries[0].sourceEvidence.rawHashesVerified, true);
  assert.equal(entries[0].sourceEvidence.rawResponses[0].path, join(dir.discovery, 'raw/000001.json'));
  writeFileSync(join(dir.discovery, 'raw/000001.json'), '{}');
  await assert.rejects(() => readIngestionEvidence(dir.discovery, () => true), /RAW_RESPONSE_HASH_MISMATCH/);
});

test('official alias proof checks actual CSV hash and normalized instrument fields', async () => {
  const dir = fixture(), sourcePath = join(dir.root, 'xetra.csv');
  const raw = 'Market:;XETR\nInstrument Type;Instrument Status;MIC Code;ISIN;Mnemonic;Currency\nETF;Active;XETR;' + isin + ';SXR8;EUR\n';
  writeFileSync(sourcePath, raw);
  const reference = { ...officialReference, source: { path: sourcePath, sha256: createHash('sha256').update(raw).digest('hex') } };
  writeFileSync(dir.officialReferencePath, JSON.stringify(reference));
  const result = await compileUcitsFromDirectories({ discoveryDir: dir.discovery, selectedPath: dir.selectedPath, officialReferencePath: dir.officialReferencePath, outDir: join(dir.root, 'out'), now });
  assert.equal(JSON.parse(readFileSync(result.files[0])).sourceInputs.officialReference.rawHashesVerified, true);
  assert.equal(result.summary.selectedOfficialEtfCandidates, 1);
  // A mutable normalized subset cannot hide a second native/MIC identity that
  // exists in the authentic complete CSV.
  const ambiguousRaw = raw + 'ETF;Active;XETR;IE00B4L5Y983;SXR8;EUR\n';
  writeFileSync(sourcePath, ambiguousRaw); reference.source.sha256 = createHash('sha256').update(ambiguousRaw).digest('hex');
  writeFileSync(dir.officialReferencePath, JSON.stringify(reference));
  const ambiguous = await compileUcitsFromDirectories({ discoveryDir: dir.discovery, selectedPath: dir.selectedPath, officialReferencePath: dir.officialReferencePath, outDir: join(dir.root, 'out'), now });
  assert.equal(ambiguous.summary.selectedOfficialEtfCandidates, 0);
  reference.rows[0] = { ...reference.rows[0], Currency: 'USD' }; writeFileSync(dir.officialReferencePath, JSON.stringify(reference));
  await assert.rejects(() => compileUcitsFromDirectories({ discoveryDir: dir.discovery, selectedPath: dir.selectedPath, officialReferencePath: dir.officialReferencePath, outDir: join(dir.root, 'out'), now }), /OFFICIAL_REFERENCE_NORMALIZATION_MISMATCH/);
  writeFileSync(sourcePath, raw + 'changed');
  await assert.rejects(() => compileUcitsFromDirectories({ discoveryDir: dir.discovery, selectedPath: dir.selectedPath, officialReferencePath: dir.officialReferencePath, outDir: join(dir.root, 'out'), now }), /OFFICIAL_REFERENCE_RAW_HASH_MISMATCH/);
});

test('compiler writes all five private artifacts only outside repository, no live call', async () => {
  const dir = fixture(), outDir = join(dir.root, 'out');
  const result = await compileUcitsFromDirectories({ discoveryDir: dir.discovery, selectedPath: dir.selectedPath, officialReferencePath: dir.officialReferencePath, outDir, now });
  assert.equal(result.files.length, 5);
  for (const file of result.files) {
    const artifact = JSON.parse(readFileSync(file));
    assert.equal(artifact.publicationAllowed, false);
    assert.equal(artifact.productionWrites, 0);
  }
  await assert.rejects(() => compileUcitsFromDirectories({ discoveryDir: dir.discovery, selectedPath: dir.selectedPath, officialReferencePath: dir.officialReferencePath,
    outDir: new URL('../../../', import.meta.url).pathname, now }), /PRIVATE_OUTSIDE_REPOSITORY_REQUIRED/);
});

test('HTTP200 provider business404 remains an unavailable exact probe with UNKNOWN broader coverage', async () => {
  const dir = fixture(), operation = { kind: 'holdings', symbol, market: 'EUROPE' };
  const raw = JSON.stringify({ code: 404, message: 'error', details: 'No data is available for this ticker at the moment.' });
  writeFileSync(join(dir.discovery, 'raw/000001.json'), raw);
  writeFileSync(join(dir.discovery, 'raw-manifest.json'), JSON.stringify([{ id: '000001', sha256: createHash('sha256').update(raw).digest('hex'), endpoint: '/etfholdings',
    params: { ticker: symbol }, status: 200, apiVersion: 'v2', host: 'api.marketstack.com' }]));
  writeFileSync(join(dir.discovery, 'normalized/000000.json'), JSON.stringify({ ordinal: 0, operation, responseIds: ['000001'], result: { ok: true, complete: true } }));
  writeFileSync(join(dir.discovery, 'summary.json'), JSON.stringify({ results: [{ ordinal: 0, operation, resultPath: 'normalized/000000.json' }] }));
  const entries = await readIngestionEvidence(dir.discovery, () => true);
  assert.equal(entries[0].result.ok, false);
  assert.equal(entries[0].result.status, 200);
  assert.equal(entries[0].result.reason, 'dataUnavailable');
  const result = compile([metadata(), ...entries]), row = result.marketstack_ucits_holdings_status.rows[0];
  assert.equal(row.status, 'UNAVAILABLE');
  assert.equal(row.probeState, 'PROBED_THIS_RUN');
  assert.equal(row.underlyingCoverage, 'UNKNOWN');
  assert.equal(row.holdingsCount, 0);
  assert.equal(row.xrayReady, false);
  assert.equal(row.attempts[0].reason, 'dataUnavailable');
  assert.equal(result.marketstack_ucits_universe.summary.holdingsProbed, 1);
  assert.equal(result.marketstack_ucits_universe.summary.holdingsNotProbed, 0);
});

test('hashverified HTML gateway bodies remain private raw evidence and cannot certify holdings', async () => {
  const dir = fixture(), operation = { kind: 'holdings', symbol, market: 'EUROPE' }, raw = '<!DOCTYPE html><title>504 Gateway Timeout</title>';
  writeFileSync(join(dir.discovery, 'raw/000001.json'), raw);
  const manifest = [{ id: '000001', sha256: createHash('sha256').update(raw).digest('hex'), endpoint: '/etfholdings', params: { ticker: symbol }, status: 504, apiVersion: 'v2', host: 'api.marketstack.com' }];
  writeFileSync(join(dir.discovery, 'raw-manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(dir.discovery, 'normalized/000000.json'), JSON.stringify({ ordinal: 0, operation, responseIds: ['000001'], result: { ok: true, complete: true } }));
  writeFileSync(join(dir.discovery, 'summary.json'), JSON.stringify({ results: [{ ordinal: 0, operation, resultPath: 'normalized/000000.json' }] }));
  const loaded = await readIngestionEvidence(dir.discovery, () => true);
  assert.equal(loaded[0].result.ok, false); assert.equal(loaded[0].result.status, 504); assert.equal(loaded[0].result.reason, 'invalidResponse');
  assert.equal(loaded[0].sourceEvidence.rawHashesVerified, true); assert.equal(loaded[0].sourceEvidence.rawResponses[0].rawFormat, 'NON_JSON');
  const row = compile([metadata(), ...loaded]).marketstack_ucits_holdings_status.rows[0];
  assert.equal(row.status, 'GATEWAY_ERROR'); assert.equal(row.xrayReady, false); assert.equal(row.underlyingCoverage, 'UNKNOWN');
  assert.equal(readFileSync(join(dir.discovery, 'raw/000001.json'), 'utf8'), raw);
  manifest[0].status = 200; writeFileSync(join(dir.discovery, 'raw-manifest.json'), JSON.stringify(manifest));
  const malformed200 = await readIngestionEvidence(dir.discovery, () => true);
  assert.equal(malformed200[0].result.ok, false); assert.equal(malformed200[0].result.reason, 'invalidResponse');
});

test('raw versus normalized identity contradictions, failed or unbound holdings never certify', () => {
  const badMeta = metadata({ symbol: 'WRONG', exchange: 'XNAS', isin: 'IE00B4L5Y983', currency: 'USD', ucits: true });
  assert.equal(compile([badMeta]).marketstack_ucits_universe.summary.acceptedPrivateIdentity, 0);
  for (const patch of [{ ok: false, status: 500 }, { symbol: 'WRONG', exchange: 'XNAS', isin: 'IE00B4L5Y983' }, { data: { ...fullHoldings.result.data, attributes: [] } }]) {
    const result = compile([metadata({ replication: 'physical' }), { ...fullHoldings, result: { ...fullHoldings.result, ...patch } }]);
    assert.equal(result.marketstack_ucits_holdings_status.rows[0].status, 'PARTIAL');
    assert.equal(result.marketstack_ucits_holdings_status.rows[0].xrayReady, false);
  }
  const future = compile([metadata({ nav: 10, nav_date: '2099-01-01', inception_date: '2099-01-01' })]).marketstack_ucits_metadata_status.rows[0];
  assert.equal(future.fields.nav, null); assert.equal(future.fields.navDate, null); assert.equal(future.fields.inception, null);
});

test('verified raw connector replay rejects mutable normalized claims and empty evidence cannot certify', async () => {
  const dir = fixture(), normalizedPath = join(dir.discovery, 'normalized/000000.json');
  const normalized = JSON.parse(readFileSync(normalizedPath));
  normalized.result.data = [{ ticker: 'FORGED' }]; writeFileSync(normalizedPath, JSON.stringify(normalized));
  const loaded = await readIngestionEvidence(dir.discovery, () => true);
  assert.deepEqual(loaded[0].result.data, [{ ticker: 'VOO' }]);
  assert.equal(loaded[0].sourceEvidence.normalizedFromVerifiedRaw, true);
  normalized.responseIds = []; writeFileSync(normalizedPath, JSON.stringify(normalized));
  const empty = await readIngestionEvidence(dir.discovery, () => true);
  assert.equal(empty[0].sourceEvidence.rawHashesVerified, false);
  assert.equal(empty[0].result.ok, false);
});

test('tickerInfo raw replay binds the exact query symbol and preserves metadata without a MIC identity claim', async () => {
  const dir = fixture(), operation = { kind: 'tickerInfo', symbol, mic }, raw = JSON.stringify({ data: { symbol, aum: 7 } });
  writeFileSync(join(dir.discovery, 'raw/000001.json'), raw);
  const manifest = [{ id: '000001', sha256: createHash('sha256').update(raw).digest('hex'), endpoint: '/tickerinfo', params: { ticker: symbol }, status: 200, apiVersion: 'v2', host: 'api.marketstack.com' }];
  writeFileSync(join(dir.discovery, 'raw-manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(dir.discovery, 'normalized/000000.json'), JSON.stringify({ ordinal: 0, operation, responseIds: ['000001'], result: { observations: [{ raw: { symbol, aum: 7000 } }] } }));
  writeFileSync(join(dir.discovery, 'summary.json'), JSON.stringify({ results: [{ ordinal: 0, operation, resultPath: 'normalized/000000.json' }] }));
  const entries = await readIngestionEvidence(dir.discovery, () => true);
  assert.equal(entries[0].result.observations[0].raw.aum, 7);
  assert.equal(entries[0].result.observations[0].normalized.providerExchange, null);
  manifest[0].params.ticker = 'WRONG'; writeFileSync(join(dir.discovery, 'raw-manifest.json'), JSON.stringify(manifest));
  await assert.rejects(() => readIngestionEvidence(dir.discovery, () => true), /RAW_TICKER_INFO_QUERY_SCOPE_MISMATCH/);
});

test('input and output symlinks are rejected before licensed evidence is read or written', async () => {
  const dir = fixture(), normalizedPath = join(dir.discovery, 'normalized/000000.json'), target = join(dir.root, 'outside.json');
  writeFileSync(target, readFileSync(normalizedPath)); unlinkSync(normalizedPath); symlinkSync(target, normalizedPath);
  await assert.rejects(() => readIngestionEvidence(dir.discovery, () => true), /INPUT_SYMLINK/);
  unlinkSync(normalizedPath); writeFileSync(normalizedPath, readFileSync(target));
  const outDir = join(dir.root, 'out'); mkdirSync(outDir); const outputTarget = join(outDir, 'marketstack_ucits_universe.json');
  symlinkSync(target, outputTarget); const before = readFileSync(target, 'utf8');
  await assert.rejects(() => compileUcitsFromDirectories({ discoveryDir: dir.discovery, selectedPath: dir.selectedPath, officialReferencePath: dir.officialReferencePath, outDir, now }), /OUTPUT_SYMLINK/);
  assert.equal(readFileSync(target, 'utf8'), before);
});

test('raw query scope and duplicate evidence IDs cannot be relabelled under another operation', async () => {
  const dir = fixture(), manifestPath = join(dir.discovery, 'raw-manifest.json'), normalizedPath = join(dir.discovery, 'normalized/000000.json'), summaryPath = join(dir.discovery, 'summary.json');
  const manifest = JSON.parse(readFileSync(manifestPath));
  writeFileSync(manifestPath, JSON.stringify([manifest[0], manifest[0]]));
  await assert.rejects(() => readIngestionEvidence(dir.discovery, () => true), /DUPLICATE_RAW_MANIFEST_ID/);
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const normalized = JSON.parse(readFileSync(normalizedPath)); normalized.responseIds = ['000001', '000001'];
  writeFileSync(normalizedPath, JSON.stringify(normalized));
  await assert.rejects(() => readIngestionEvidence(dir.discovery, () => true), /DUPLICATE_OPERATION_RESPONSE_ID/);
  normalized.responseIds = ['000001']; normalized.operation = { kind: 'latestBatch', mic, symbols: [symbol] };
  writeFileSync(normalizedPath, JSON.stringify(normalized));
  writeFileSync(summaryPath, JSON.stringify({ results: [{ ordinal: 0, operation: normalized.operation, resultPath: 'normalized/000000.json' }] }));
  manifest[0].endpoint = '/eod/latest'; manifest[0].params = { exchange: 'XLON', symbols: 'OTHER' }; writeFileSync(manifestPath, JSON.stringify(manifest));
  await assert.rejects(() => readIngestionEvidence(dir.discovery, () => true), /RAW_PRICE_QUERY_SCOPE_MISMATCH/);
});
