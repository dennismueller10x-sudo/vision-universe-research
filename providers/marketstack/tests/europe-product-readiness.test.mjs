import test from 'node:test';
import assert from 'node:assert/strict';
import { auditEuropeCanonicalGraph, projectEuropeProductPublication } from '../../../scripts/marketstack/europe-product-readiness.mjs';

const companyKey = 'LEI:5299003VKVDCUPSS5X23';
function graph() {
  const securities = ['DE0005545503', 'DE0007236101'].map((isin, i) => ({ companyKey, isin, securityKey: 'ISIN:' + isin,
    securityId: ['ref_CLASS_A_XETR', 'ref_CLASS_B_XETR'][i], shareClassDetail: 'UNKNOWN',
    primaryListing: 'marketstack:XETR:CLASS' + i, listings: ['marketstack:XETR:CLASS' + i], aliases: ['CLASS' + i] }));
  const listings = securities.map((s, i) => ({ ...s, listingKey: s.primaryListing, status: 'ACCEPTED', mic: 'XETR',
    providerSymbol: 'CLASS' + i + '.DE', active: true, isPrimary: true, currency: 'EUR',
    verifiedAliases: ['CLASS' + i], identityEvidence: [{ verified: true, source: 'SYNTHETIC_OFFICIAL_REFERENCE' }] }));
  return { companies: [{ companyKey, issuerCountry: 'DE', names: ['Synthetic Issuer AG'], securities: securities.map(s => s.securityKey) }], securities, listings };
}
function observation() {
  const identity = { state: 'AVAILABLE', data: { securityId: 'ref_TEST_XETR', listingId: 'marketstack:XETR:TEST', currency: 'EUR', companyId: companyKey, isin: 'DE0005545503', mic: 'XETR' } };
  const chart = { ...identity.data, state: 'AVAILABLE', chartStatus: 'CHART_LIMITED', basis: 'RAW_UNADJUSTED' };
  const technical = { ...identity.data, state: 'AVAILABLE', status: 'TECHNICAL_PARTIAL', priceBasis: 'RAW_UNADJUSTED',
    methodology: 'EXISTING_ENGINE:default:synthetic', RS: 'RS_BLOCKED', metrics: { sma20: 20, momentum: 0, relativeStrength: null } };
  return { identity, readiness: { IDENTITY: 'VERIFIED', DISCOVER: 'BLOCKED', SCREENER: 'BLOCKED', TECHNICAL: 'TECHNICAL_PARTIAL',
    QUANT: 'QUANT_BLOCKED', SUPERTRADER: 'BLOCKED', BACKTEST: 'RESEARCH_ONLY' }, searchesPassed: true, watchlistPassed: true, chart, technical };
}
const rights = { display: true, commercial: true, evidenceRef: 'synthetic-external-rights-proof',
  confirmation: { status: 'VERIFIED', evidenceRef: 'synthetic-external-rights-proof', sourceType: 'PROVIDER_WRITTEN_CONFIRMATION' },
  dataPaths: ['IDENTITY', 'RAW_EOD', 'TECHNICAL'] };

test('canonical graph preserves one company, two share classes, secondary listing and prior stable IDs', () => {
  const universe = graph(), previousUniverse = structuredClone(universe);
  const s = universe.securities[0], second = { ...universe.listings[0], listingKey: 'marketstack:XPAR:CLASS0', mic: 'XPAR', isPrimary: false };
  s.listings.push(second.listingKey); universe.listings.push(second);
  const original = JSON.stringify(universe), result = auditEuropeCanonicalGraph(universe, { previousUniverse });
  assert.equal(JSON.stringify(universe), original);
  assert.equal(result.status, 'CANONICAL_GRAPH_VERIFIED');
  assert.deepEqual(result.summary, { companies: 1, securities: 2, listings: 3, identityReady: 2, findings: 0, unknownShareClassDetail: 2 });
  assert.equal(result.rows[0].listings.filter(l => !l.isPrimary).length, 1);
  assert.equal(result.rows[0].shareClassDetail, 'UNKNOWN'); assert.equal(result.rows[0].lei, companyKey.slice(4));
  assert.equal(result.coreMaterializationVerified, false, 'producer graph alone is not Core consumer materialization proof');
});

test('cross-company bindings, duplicate ISINs, changed prior IDs and missing Core listings block canonical acceptance', () => {
  const cases = [
    [u => { u.listings[0].companyKey = 'LEI:FOREIGN'; }, 'LISTING_IDENTITY_BINDING_INVALID'],
    [u => { u.securities[1].isin = u.securities[0].isin; }, 'DUPLICATE_SECURITY_ISIN'],
    [u => { u.securities[0].securityId = 'ref_CHANGED'; }, 'PREVIOUS_CANONICAL_ID_CHANGED'],
    [u => { u.listings[0].active = null; }, 'LISTING_FACTS_INCOMPLETE'],
    [u => { u.listings[0].identityEvidence[0].lei = 'FOREIGN'; }, 'OFFICIAL_IDENTITY_DIMENSIONS_CONFLICT'],
    [u => { u.listings[0].isPrimary = false; }, 'PRIMARY_SECONDARY_BINDING_INVALID']
  ];
  for (const [mutate, code] of cases) {
    const u = graph(), previousUniverse = structuredClone(u); mutate(u);
    assert.ok(auditEuropeCanonicalGraph(u, { previousUniverse }).findings.some(f => f.code === code), code);
  }
  assert.ok(auditEuropeCanonicalGraph(graph(), { catalog: { securities: [] } }).findings.some(f => f.code === 'CORE_GRAPH_MATERIALIZATION_MISMATCH'));
  assert.ok(auditEuropeCanonicalGraph(graph(), { protectedIds: ['ref_CLASS_A_XETR'] }).findings.some(f => f.code === 'PROTECTED_US_ID_COLLISION'));
});

test('partial raw chart and actual unchanged technical metrics are privately usable while RS and higher tiers remain blocked', () => {
  const input = observation(), original = JSON.stringify(input), result = projectEuropeProductPublication(input);
  assert.equal(JSON.stringify(input), original);
  for (const product of ['IDENTITY', 'SEARCH', 'WATCHLIST', 'CHART', 'TECHNICAL']) {
    assert.equal(result.products[product].publicationStatus, 'READY_PRIVATE');
    assert.equal(result.products[product].publicStatus, 'BLOCKED_RIGHTS');
  }
  assert.equal(result.products.CHART.dataStatus, 'CHART_LIMITED');
  assert.equal(result.products.TECHNICAL.dataStatus, 'TECHNICAL_PARTIAL');
  assert.equal(result.RS, 'RS_BLOCKED'); assert.equal(result.validTechnicalMetrics, 2, 'zero is a valid projected metric; missing RS is null');
  for (const product of ['DISCOVER', 'SCREENER', 'QUANT', 'SUPERTRADER', 'BACKTEST']) assert.equal(result.products[product].publicationStatus, 'BLOCKED_DATA');
  assert.equal(result.rankingEligible, false);
});

test('global technical readiness is insufficient without an actual dimension-bound consumer projection', () => {
  for (const mutate of [i => { i.technical = null; }, i => { i.technical.securityId = 'ref_FOREIGN'; }, i => { i.technical.currency = 'USD'; }, i => { i.technical.metrics = { sma20: null }; }]) {
    const input = observation(); input.readiness.TECHNICAL = 'TECHNICAL_PARTIAL'; mutate(input);
    assert.equal(projectEuropeProductPublication(input).products.TECHNICAL.publicationStatus, 'BLOCKED_DATA');
  }
  const input = observation(); input.technical.methodology = 'NEW_FORMULA';
  assert.equal(projectEuropeProductPublication(input).products.TECHNICAL.publicationStatus, 'BLOCKED_METHOD');
  const invalidChart = observation(); invalidChart.chart.currency = 'USD';
  assert.equal(projectEuropeProductPublication(invalidChart).products.CHART.publicationStatus, 'BLOCKED_DATA');
});

test('financial responses and RS require exact accepted source dimensions and independent European benchmark evidence', () => {
  const input = observation(); input.readiness.FUNDAMENTALS = 'VALIDATED';
  input.fundamentals = { state: 'AVAILABLE', data: { identity: { status: 'VERIFIED', provenance: [{ source: 'SYNTHETIC_OFFICIAL_FILING' }],
    mapping: { securityId: input.identity.data.securityId, listingId: input.identity.data.listingId, companyId: companyKey,
      isin: input.identity.data.isin, shareClassId: 'ISIN:' + input.identity.data.isin, mic: 'XETR', listingCurrency: 'EUR' } }, currencyBasisValid: true, sharesBasisValid: true,
    sourcePolicy: 'ESEF_OFFICIAL_FILINGS_PRIMARY_SEC_ACTUAL_FILER_ONLY' } };
  assert.equal(projectEuropeProductPublication(input).products.FUNDAMENTALS.privateStatus, 'READY_PRIVATE');
  for (const field of ['companyId', 'securityId', 'listingId', 'isin', 'shareClassId', 'mic', 'listingCurrency']) {
    const altered = structuredClone(input); altered.fundamentals.data.identity.mapping[field] = 'FOREIGN';
    assert.equal(projectEuropeProductPublication(altered).products.FUNDAMENTALS.privateStatus, 'BLOCKED_DATA', field);
  }
  const currency = structuredClone(input); currency.fundamentals.data.currencyBasisValid = false;
  assert.equal(projectEuropeProductPublication(currency).products.FUNDAMENTALS.privateStatus, 'BLOCKED_DATA');
  input.readiness.RS = 'RS_READY'; input.technical.RS = 'RS_READY'; input.technical.metrics.relativeStrength = 0;
  assert.equal(projectEuropeProductPublication(input).RS, 'RS_BLOCKED');
  input.technical.benchmark = { region: 'EUROPE', status: 'VALIDATED', securityId: 'ref_TEST_BENCHMARK', evidenceRef: 'synthetic-European-benchmark' };
  assert.equal(projectEuropeProductPublication(input).RS, 'RS_READY');
  input.technical.securityId = 'ref_FOREIGN';
  assert.equal(projectEuropeProductPublication(input).RS, 'RS_BLOCKED');
});

test('public rights require concrete path confirmation, raw and canonical remain separate, limited UX proof is explicit', () => {
  const input = observation(); input.rights = { ...rights }; input.uxEvidence = { chartLimitationVisible: true, technicalLimitationsVisible: true, evidenceRef: 'synthetic-UX-proof' };
  assert.equal(projectEuropeProductPublication(input).products.CHART.publicStatus, 'READY_PUBLIC');
  assert.equal(projectEuropeProductPublication(input).products.TECHNICAL.publicStatus, 'BLOCKED_METHOD', 'raw research partials do not relax the existing strict public technical gate');
  const noConfirmation = { ...input, rights: { ...rights, confirmation: null } };
  assert.equal(projectEuropeProductPublication(noConfirmation).products.CHART.publicStatus, 'BLOCKED_RIGHTS');
  const canonicalOnly = { ...input, rights: { ...rights, dataPaths: ['IDENTITY', 'CANONICAL_EOD', 'TECHNICAL'] } };
  assert.equal(projectEuropeProductPublication(canonicalOnly).products.CHART.publicStatus, 'BLOCKED_RIGHTS');
  assert.equal(projectEuropeProductPublication({ ...input, uxEvidence: {} }).products.CHART.publicStatus, 'BLOCKED_METHOD');
  input.technical.priceBasis = 'CANONICAL_SPLIT_ADJUSTED';
  assert.equal(projectEuropeProductPublication(input).products.TECHNICAL.publicStatus, 'BLOCKED_RIGHTS');
});

test('input-ready Quant, SuperTrader and backtest never claim a produced European ranking or strategy', () => {
  const input = observation(); input.readiness.QUANT = 'QUANT_FULL'; input.quant = { state: 'AVAILABLE', data: {
    securityId: input.identity.data.securityId, readiness: 'QUANT_FULL', population: 'EUROPE_SEPARATE_READINESS', score: null, rank: null } };
  input.readiness.SUPERTRADER = 'READY'; input.readiness.BACKTEST = 'BACKTEST_READY';
  const result = projectEuropeProductPublication(input);
  for (const product of ['QUANT', 'SUPERTRADER', 'BACKTEST']) {
    assert.equal(result.products[product].inputReady, true); assert.equal(result.products[product].publicationStatus, 'BLOCKED_METHOD');
  }
  const blockedIdentity = projectEuropeProductPublication({ ...input, identity: { state: 'UNAVAILABLE' } });
  assert.ok(Object.values(blockedIdentity.products).every(p => p.publicationStatus === 'BLOCKED_IDENTITY'));
});
