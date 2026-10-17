import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
const require = createRequire(import.meta.url);
const S = require('../engines/marketstack-secondary.js');
const P = require('../engines/etf-provider.js');
const H = require('../engines/etf-holdings.js');
const X = require('../engines/xray.js');
const source = (field, asOf = '2026-10-07') => ({ source: 'marketstack', sourceUrl: 'https://evidence.example/marketstack.json', sha256: 'a'.repeat(64), asOf, field });
const keys = generateKeyPairSync('ed25519');
const stable = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const identity = () => ({ verified: true, isin: 'IE00B4L5Y983', providerSymbol: 'EUNL', exchangeMic: 'XETR', currency: 'EUR', canonicalETFId: 'existing-fund', shareClassId: 'existing-class', provenance: { ...source('isin'), source: 'ESMA_FIRDS' } });
const options = () => ({ today: '2026-10-08', mode: 'PRIVATE_RESEARCH', expectedIdentity: identity(), trustedProducerKeys: { fixture: keys.publicKey.export({ type: 'spki', format: 'pem' }) } });
function attest(component, kind) {
  const body = { ...component, identity: component.identity || identity() }; delete body.attestation;
  const payload = { schemaVersion: 'vu-marketstack-secondary-attestation-1', producer: 'VU_MARKETSTACK_CANONICAL_PRODUCER', keyId: 'fixture', kind,
    identity: body.identity, asOf: '2026-10-07', rawSha256: 'a'.repeat(64), componentSha256: createHash('sha256').update(stable(body)).digest('hex') };
  if (kind === 'HOLDINGS') Object.assign(payload, { completeness: component.status, normalization: 'NONE', originalWeightUnit: 'fraction', originalWeightFractions: component.rows.map(row => row.weight), providerTotal: component.providerTotal });
  return { ...body, attestation: { payload, signature: sign(null, Buffer.from(stable(payload)), keys.privateKey).toString('base64') } };
}
const input = extra => {
  const data = { identity: identity(), metadata: { fields: { ter: 0.002, domicile: 'IE', ucits: true }, provenance: { ter: source('ter'), domicile: source('domicile'), ucits: source('ucits') } }, ...extra };
  if (data.metadata) data.metadata = attest(data.metadata, 'METADATA');
  if (data.prices) data.prices = attest(data.prices, 'PRICES');
  if (data.holdings) data.holdings = attest(data.holdings, 'HOLDINGS');
  return data;
};
const holdings = extra => ({ status: 'FULL', sufficientComplete: true, xrayReady: true, paginationComplete: true, providerTotal: 2, weightUnit: 'fraction', asOf: '2026-10-07', provenance: source('holdings'),
  rows: [{ holdingName: 'Apple', holdingIsin: 'US0378331005', assetType: 'EQUITY', weight: 0.6, country: 'US', sector: 'TECH' }, { holdingName: 'SAP', holdingIsin: 'DE0007164600', assetType: 'EQUITY', weight: 0.4, country: 'DE', sector: 'TECH' }], ...extra });
const prices = extra => ({ canonical: true, quality: 'CERTIFIED', priceSeriesType: 'SPLIT_ADJUSTED', adjustmentStatus: 'ADJUSTMENT_CERTIFIED', freshness: 'CURRENT', asOf: '2026-10-07', provenance: source('canonicalPrices'), points: [['2026-10-06', 100], ['2026-10-07', 101]], ...extra });

test('missing secondary source is byte-equivalent and returns original registry/base objects', () => {
  const base = { fields: { ter: 0.003 }, provenance: { ter: { provider: 'SEC_NPORT' } }, providers: ['SEC_NPORT'], prices: null };
  const before = JSON.stringify(base);
  assert.equal(S.fuse(base, null, options()), base);
  const registry = P.registry([P.createTiingoAdapter({ rows: [{ symbol: 'EUNL', name: 'Existing ETF' }] })]);
  assert.equal(S.wrapRegistry(registry, []), registry);
  const wrapper = S.wrapRegistry(registry, [input()], { ...options(), getIdentity: () => null });
  assert.equal(JSON.stringify(wrapper.metadata('EUNL')), JSON.stringify(registry.metadata('EUNL')));
  assert.equal(JSON.stringify(base), before);
});

test('public mode remains blocked even with unscoped caller rights booleans', () => {
  const opts = { ...options(), mode: undefined };
  assert.equal(S.prepareRecord(input(), opts).record, null);
  for (const missing of ['commercialConfirmed', 'displayConfirmed', 'dataPathConfirmed']) {
    const rights = { commercialConfirmed: true, displayConfirmed: true, dataPathConfirmed: true, [missing]: false };
    assert.equal(S.prepareRecord(input(), { ...opts, rights }).record, null);
  }
  assert.equal(S.prepareRecord(input(), { ...opts, rights: { commercialConfirmed: true, displayConfirmed: true, dataPathConfirmed: true } }).record, null);
});

test('exact official share-class/listing binding prevents ticker-only, country or fund-name joins', () => {
  for (const change of [{ verified: false }, { isin: 'IE00B5BMR087' }, { providerSymbol: 'IWDA' }, { exchangeMic: 'XLON' }, { canonicalETFId: 'another-fund' }, { shareClassId: 'another-class' }, { provenance: null }]) {
    assert.equal(S.prepareRecord(input({ identity: { ...identity(), ...change } }), options()).record, null);
  }
  assert.equal(S.prepareRecord(input({ identity: { ...identity(), isin: 'IE00B4L5Y984' } }), { ...options(), expectedIdentity: { ...identity(), isin: 'IE00B4L5Y984' } }).record, null);
});

test('fills missing fields only, never overwrites SEC NPORT, FIRDS, GLEIF, Xetra or existing prices', () => {
  const base = { fields: { ter: 0.003, isin: identity().isin, domicile: 'LU', ucits: false }, provenance: { ter: { source: 'SEC_NPORT' }, isin: { source: 'ESMA_FIRDS' }, domicile: { source: 'GLEIF' }, ucits: { source: 'XETRA_REFERENCE' } },
    providers: ['SEC_NPORT', 'ESMA_FIRDS', 'GLEIF', 'XETRA_REFERENCE'], prices: { provider: 'tiingo', points: [['2026-10-07', 5]] }, holdings: { source: 'SEC_NPORT', holdings: [] } };
  const before = JSON.stringify(base);
  const result = S.fuse(base, input({ prices: prices(), holdings: holdings() }), options());
  assert.deepEqual(result.fields, base.fields);
  assert.deepEqual(result.provenance, base.provenance);
  assert.equal(result.prices, base.prices);
  assert.equal(result.holdings, base.holdings);
  assert.equal(result.secondaryEvidence.conflicts.length, 3);
  assert.ok(result.secondaryEvidence.conflicts.every(item => item.reason === 'PRIMARY_PRESERVED'));
  assert.equal(JSON.stringify(base), before);
});

test('only observed valid sourced metadata enters mapping contract; missing is not zero', () => {
  const result = S.fuse({ fields: { ter: null }, provenance: {}, providers: [] }, input(), options());
  assert.equal(result.fields.ter, 0.002);
  assert.equal(result.fields.domicile, 'IE');
  assert.equal(result.fields.ucits, true);
  assert.equal(result.fields.fundSize, undefined);
  assert.equal(result.provenance.ter.sha256, 'a'.repeat(64));
  assert.equal(result.secondaryEvidence.normalizationTo100, false);
  assert.deepEqual(P.validateMapped({ isin: identity().isin, ...result.fields }), []);
});

test('TER cannot be fabricated from expense ratio or ongoing charges and units must be fraction', () => {
  const bad = input({ metadata: { fields: { ter: 0.2 }, provenance: { ter: source('expense_ratio') } } });
  assert.equal(S.prepareRecord(bad, options()).record.fields.ter, undefined);
  const wrongSemantic = input({ metadata: { fields: { ter: 0.002 }, provenance: { ter: source('expense_ratio') } } });
  assert.ok(S.prepareRecord(wrongSemantic, options()).reasons.includes('TER_SEMANTICS_UNVERIFIED'));
});

test('identity contradiction, bad dates, missing raw hash or credential URL block fields', () => {
  const bad = input({ metadata: { fields: { isin: 'IE00B5BMR087', ter: 0.002, domicile: 'DE', ucits: true }, provenance: { isin: source('isin'), ter: source('ter', '2026-10-07garbage'), domicile: { ...source('domicile'), sha256: null }, ucits: { ...source('ucits'), sourceUrl: 'https://example.com/?access_key=SECRET' } } } });
  const prepared = S.prepareRecord(bad, options());
  assert.equal(prepared.record, null);
  assert.ok(prepared.reasons.includes('METADATA_ISIN_CONFLICT'));
  assert.equal(JSON.stringify(prepared).includes('SECRET'), false);
  delete bad.metadata.fields.isin;
  assert.deepEqual(S.prepareRecord(bad, options()).record.fields, {});
});

test('AUM and NAV need currency and NAV needs observation date', () => {
  const metadata = { fields: { fundSize: 1e9, nav: 10 }, provenance: { fundSize: source('aum'), nav: source('nav') } };
  assert.deepEqual(S.prepareRecord(input({ metadata }), options()).record.fields, {});
  metadata.fields.fundSizeCurrency = 'EUR'; metadata.provenance.fundSizeCurrency = source('aum_currency');
  metadata.fields.navDate = '2026-10-07'; metadata.provenance.navDate = source('nav_date');
  metadata.navCurrency = 'EUR'; metadata.navCurrencyProvenance = source('nav_currency');
  const prepared = S.prepareRecord(input({ metadata }), options()).record;
  assert.equal(prepared.fields.fundSize, 1e9);
  assert.equal(prepared.fields.nav, 10);
  assert.equal(prepared.provenance.nav.currency, 'EUR');
});

test('only already canonical certified adjusted price series accepted, without altering points', () => {
  const pointInput = prices();
  const accepted = S.prepareRecord(input({ prices: pointInput }), options()).record;
  assert.deepEqual(accepted.prices.points, pointInput.points);
  for (const change of [{ canonical: false }, { adjustmentStatus: 'ADJUSTMENT_UNKNOWN' }, { freshness: 'STALE' }, { priceSeriesType: 'RAW_UNADJUSTED' }, { asOf: '2026-10-06' }, { points: [['2026-10-07', 10], ['2026-10-07', 11]] }, { points: [['2026-10-07', 0]] }]) {
    assert.equal(S.prepareRecord(input({ prices: prices(change) }), options()).record.prices, null);
  }
});

test('full holdings use existing Holdings and XRay contracts, preserving original sum', () => {
  const prepared = S.prepareRecord(input({ holdings: holdings() }), options()).record;
  assert.equal(prepared.holdings.schemaVersion, H.SCHEMA);
  assert.equal(prepared.holdings.holdingsCount, 2);
  assert.deepEqual(X.validateHoldingsFile(prepared.xrayHoldings), []);
  assert.equal(X.overlap(prepared.xrayHoldings, prepared.xrayHoldings).weightedOverlap, 1);
  assert.equal(prepared.holdings.fundId, 'existing-fund');
  assert.equal(prepared.holdings.shareClassId, 'existing-class');
});

test('partial, unknown, stale, derivative, repeated or ambiguous holdings never feed XRay', () => {
  for (const change of [{ status: 'PARTIAL' }, { status: 'GATEWAY_ERROR' }, { status: 'LIKELY_FULL' }, { paginationComplete: false }, { providerTotal: 3 }, { asOf: '2026-01-01' }, { asOf: '2026-10-07garbage' },
    { rows: [{ ...holdings().rows[0], weight: 0.2 }] }, { rows: [{ ...holdings().rows[0], weight: 0.5 }, { ...holdings().rows[0], weight: 0.5 }] },
    { rows: [{ ...holdings().rows[0], assetType: 'SWAP' }, holdings().rows[1]] }, { rows: [{ ...holdings().rows[0], holdingIsin: null }, holdings().rows[1]] }]) {
    const original = holdings(change), before = JSON.stringify(original);
    const prepared = S.prepareRecord(input({ holdings: original }), options());
    assert.equal(prepared.record.holdings, null);
    assert.equal(prepared.record.xrayHoldings, null);
    assert.equal(JSON.stringify(original), before);
  }
  assert.ok(S.prepareRecord(input({ holdings: holdings({ status: 'GATEWAY_ERROR' }) }), options()).reasons.includes('HOLDINGS_GATEWAY_COVERAGE_UNKNOWN'));
});

test('registry wrapper is an actual existing-contract hook with no global provider table change', () => {
  const before = JSON.stringify(P.PROVIDERS);
  const primary = P.registry([]);
  const wrapper = S.wrapRegistry(primary, [input({ holdings: holdings(), prices: prices() })], { ...options(), getIdentity: symbol => symbol === 'EUNL' ? identity() : null });
  assert.equal(wrapper.metadata('EUNL').fields.ter, 0.002);
  assert.equal(wrapper.prices('EUNL').provider, 'marketstack');
  assert.equal(wrapper.holdings('EUNL').source, 'marketstack');
  assert.equal(wrapper.xrayHoldings('EUNL').source, 'marketstack');
  assert.deepEqual(wrapper.metadata('MISSING'), primary.metadata('MISSING'));
  assert.equal(JSON.stringify(P.PROVIDERS), before);
  const collision = S.wrapRegistry(primary, [input(), input()], { ...options(), getIdentity: () => identity() });
  assert.deepEqual(collision.metadata('EUNL'), primary.metadata('EUNL'));
  const withPrimaryHoldings = S.wrapRegistry({ ...primary, holdings: () => ({ source: 'SEC_NPORT', holdings: [] }) }, [input({ holdings: holdings() })], { ...options(), getIdentity: () => identity() });
  assert.equal(withPrimaryHoldings.holdings('EUNL').source, 'SEC_NPORT');
  assert.equal(withPrimaryHoldings.xrayHoldings('EUNL'), null);
});

test('browser UMD registers facade but cannot authenticate private producer signatures', () => {
  const context = vm.createContext({ console });
  for (const file of ['etf-analytics.js', 'etf-fundamentals.js', 'etf-holdings.js', 'etf-provider.js', 'xray.js', 'marketstack-secondary.js']) {
    vm.runInContext(readFileSync(new URL('../engines/' + file, import.meta.url), 'utf8'), context);
  }
  assert.equal(context.VUVorsorge.MarketstackSecondary.VERSION, S.VERSION);
  const prepared = context.VUVorsorge.MarketstackSecondary.prepareRecord(input({ holdings: holdings() }), options());
  assert.deepEqual(Object.keys(prepared.record.fields), []);
  assert.equal(prepared.record.xrayHoldings, null);
  assert.ok(prepared.reasons.includes('METADATA_PRODUCER_ATTESTATION_REQUIRED'));
});

test('every component must bind exact ISIN listing fund share class and currency', () => {
  for (const kind of ['metadata', 'prices', 'holdings']) {
    for (const patch of [{ isin: 'IE00B5BMR087' }, { providerSymbol: 'WRONG' }, { canonicalETFId: 'another-fund' }, { shareClassId: 'another-class' }, { exchangeMic: 'XLON' }, { currency: 'USD' }]) {
      const data = input({ prices: prices(), holdings: holdings() });
      // Even an authentically signed producer payload for a different listing is rejected.
      data[kind] = attest({ ...data[kind], identity: { ...identity(), ...patch } }, kind === 'metadata' ? 'METADATA' : kind === 'prices' ? 'PRICES' : 'HOLDINGS');
      const record = S.prepareRecord(data, options()).record;
      assert.equal(kind === 'metadata' ? record.fields.ter : kind === 'prices' ? record.prices : record.xrayHoldings, kind === 'metadata' ? undefined : null);
    }
  }
  for (const kind of ['metadata', 'prices', 'holdings']) {
    for (const field of ['isin', 'providerSymbol', 'providerTicker', 'symbol', 'canonicalETFId', 'fundId', 'shareClassId', 'exchangeMic', 'mic', 'currency']) {
      const data = input({ prices: prices(), holdings: holdings() });
      data[kind] = attest({ ...data[kind], [field]: 'CONTRADICTORY' }, kind === 'metadata' ? 'METADATA' : kind === 'prices' ? 'PRICES' : 'HOLDINGS');
      const record = S.prepareRecord(data, options()).record;
      assert.equal(kind === 'metadata' ? record.fields.ter : kind === 'prices' ? record.prices : record.xrayHoldings, kind === 'metadata' ? undefined : null);
    }
  }
});

test('contradictory primary identity blocks fusion and every registry fallback', () => {
  const base = { fields: { isin: 'IE00B5BMR087' }, canonicalETFId: 'another-primary-fund', prices: null, providers: ['SEC_NPORT'] };
  const data = input({ prices: prices(), holdings: holdings() });
  assert.equal(S.fuse(base, data, options()), base);
  const registry = { metadata: () => base, prices: () => null };
  const wrapped = S.wrapRegistry(registry, [data], { ...options(), getIdentity: () => identity() });
  assert.equal(wrapped.metadata('EUNL'), base);
  assert.equal(wrapped.prices('EUNL'), null);
  assert.equal(wrapped.holdings('EUNL'), null);
  assert.equal(wrapped.xrayHoldings('EUNL'), null);
  for (const wrong of [{ fields: { currency: 'USD' } }, { fields: { symbol: 'WRONG' } }, { holdings: { fundId: 'another-primary-fund' } }]) {
    assert.equal(S.fuse(wrong, data, options()), wrong);
  }
});

test('forged decorative provenance, invalid signatures and rescaled partial rows cannot feed XRay', () => {
  const legit = input({ holdings: holdings() });
  const forged = JSON.parse(JSON.stringify(legit));
  delete forged.holdings.attestation;
  assert.equal(S.prepareRecord(forged, options()).record.xrayHoldings, null);
  const unsignedOptions = { ...options(), trustedProducerKeys: {} };
  assert.equal(S.prepareRecord(legit, unsignedOptions).record.xrayHoldings, null);
  const invalidSignature = JSON.parse(JSON.stringify(legit));
  invalidSignature.holdings.attestation.signature = Buffer.alloc(64).toString('base64');
  assert.equal(S.prepareRecord(invalidSignature, options()).record.xrayHoldings, null);
  const partial = input({ holdings: holdings({ status: 'PARTIAL', rows: [{ ...holdings().rows[0], weight: 0.2 }], providerTotal: 1 }) });
  partial.holdings.rows[0].weight = 1;
  partial.holdings.status = 'FULL'; partial.holdings.sufficientComplete = true; partial.holdings.xrayReady = true;
  assert.equal(S.prepareRecord(partial, options()).record.xrayHoldings, null);
  const signedOriginalMismatch = input({ holdings: holdings() });
  signedOriginalMismatch.holdings.attestation.payload.originalWeightFractions = [0.12, 0.08];
  signedOriginalMismatch.holdings.attestation.signature = sign(null, Buffer.from(stable(signedOriginalMismatch.holdings.attestation.payload)), keys.privateKey).toString('base64');
  assert.equal(S.prepareRecord(signedOriginalMismatch, options()).record.xrayHoldings, null);
});
