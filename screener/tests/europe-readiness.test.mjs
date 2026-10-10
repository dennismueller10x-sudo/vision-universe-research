import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const Europe = require('../europe-readiness.js');
const CoreEurope = require('../../core/europe-market-data.js');
const Identity = require('../../core/identity.js');
const Adapters = require('../engine/adapters.js');
const Engine = require('../engine/engine.js');
const Fields = require('../engine/fields.js');
const Query = require('../engine/query.js');
const id = Identity.securityIdForTicker('SAP.XETR');
const rights = () => ({ display: true, commercial: true, evidenceRef: 'reviewed-display-path', dataPaths: ['IDENTITY', 'RAW_EOD', 'CANONICAL_EOD', 'TECHNICAL'] });

function fixture({ listing = {}, security = {}, publicRights = rights(), audience = 'research' } = {}) {
  const base = { region: 'EUROPE', securityId: id, companyId: 'LEI:529900T8BM49AURSDO55', name: 'SAP SE',
    acceptance: 'ACCEPTED', identity: { status: 'VERIFIED' }, primaryListingId: 'SAP:XETR', indexes: ['DAX'], ...security,
    listings: [{ listingId: 'SAP:XETR', ticker: 'SAP', providerSymbol: 'SAP.XETRA', country: 'DE', mic: 'XETR', currency: 'EUR',
      latest: { status: 'LAST_VALID_SESSION', date: '2026-10-07', volume: 0 },
      history: { valid: true, observations: 252 }, priceQuality: { status: 'VALIDATED', evidenceRef: 'price-quality', volumeValid: true },
      adjustment: { status: 'ADJUSTMENT_UNKNOWN' },
      technical: { securityId: id, listingId: 'SAP:XETR', currency: 'EUR', asOf: '2026-10-07', status: 'TECHNICAL_PARTIAL', engineProjection: true, methodology: 'existing-engine-fixture',
        metrics: { high52w: 220, sma20: 200, sma50: 190, sma200: 170, momentum: 0, volatility: 0, drawdown: 0, relativeStrength: 50, breakout: 0 } },
      ...listing }] };
  let calls = 0, usCalls = 0;
  const underlying = CoreEurope.create({ catalog: { securities: [base] }, audience, rights: publicRights,
    usClient: { getLatestPrice() { usCalls++; throw Error('US_MUST_NOT_BE_CALLED'); } },
    loadSeries: async request => ({ securityId: request.securityId, listingId: request.listingId, basis: request.basis, currency: 'EUR',
      points: [['2026-10-06', 200], ['2026-10-07', 202]], provenance: { evidenceRef: 'current-canonical-series' },
      adjustment: { status: 'ADJUSTMENT_CERTIFIED', evidenceRef: 'split-evidence', method: 'VU_CANONICAL_SPLIT_FACTORS' } }) });
  const contract = { ...underlying };
  // Exercise the backwards-compatible strict path independently of new admission.
  delete contract.getBaseScreenerRow;
  for (const method of ['getReadiness', 'getScreenerRow', 'getTechnicalData', 'getPriceSeries']) contract[method] = async (...args) => {
    calls++; return underlying[method](...args);
  };
  return { contract, catalog: { securities: [base] }, counts: () => ({ calls, usCalls }) };
}
const researchOptions = f => ({ enabled: true, audience: 'research', privateResearch: true, contract: f.contract, securityIds: [id] });

test('Europe consumer is opt-in; public closed rights prevent even calls into a research contract', async () => {
  const f = fixture();
  for (const options of [{}, { enabled: true }, { enabled: true, rights: { ...rights(), evidenceRef: '' } }]) {
    const adapter = Europe.create({ contract: f.contract, securityIds: [id], ...options }); await adapter.load();
    assert.equal(adapter.dataset().size, 0); assert.equal(adapter.rows().length, 0);
    assert.equal(adapter.readiness()[0].SCREENER, 'BLOCKED'); assert.equal(adapter.info().publicDeliveryAllowed, false);
  }
  assert.equal(f.counts().calls, 0);
});

test('real Core contract provides native currency, zero values and blocked benchmark without US requests', async () => {
  const f = fixture(), adapter = Europe.create(researchOptions(f)); await adapter.load();
  const row = adapter.rows()[0];
  assert.equal(row.securityId, id); assert.equal(row.currency, 'EUR'); assert.equal(row.price, 202);
  assert.equal(row.volume, 0); assert.equal(row.momentum, 0); assert.equal(row.volatility, 0); assert.equal(row.drawdown, 0);
  assert.equal(row.historyLength, 252); assert.equal(row.RS, 'RS_BLOCKED'); assert.equal(row.relativeStrength, null);
  assert.equal(row.TECHNICAL, 'TECHNICAL_PARTIAL'); assert.equal(f.counts().usCalls, 0);
  assert.equal(adapter.dataset().value('currency', 0), 'EUR');
  assert.equal(adapter.dataset().value('sma50', 0), 190);
  assert.equal(adapter.dataset().value('marketCap', 0), null);
  assert.equal(adapter.dataset().value('perf6m', 0), null, 'generic momentum is not relabeled as six-month performance');
});

test('explicit metadata filters support country, MIC, index, currency, freshness, volume, history and validated engine metrics', async () => {
  const adapter = Europe.create(researchOptions(fixture())); await adapter.load();
  const filters = [
    ['country', 'DE'], ['exchange', 'XETR'], ['index', 'DAX'], ['currency', 'EUR'], ['freshness', 'LAST_VALID_SESSION']
  ].map(([field, value]) => ({ field, op: 'in', value: [value] })).concat([
    { field: 'volume', op: 'eq', value: 0 }, { field: 'historyLength', op: 'gte', value: 250 },
    { field: 'sma50', op: 'between', value: 180, value2: 200 }, { field: 'high52w', op: 'gt', value: 210 }
  ]);
  adapter.setScopeFilters(filters); assert.equal(adapter.dataset().size, 1);
  adapter.setScopeFilters([{ field: 'relativeStrength', op: 'gte', value: 0 }]); assert.equal(adapter.dataset().size, 0);
  assert.throws(() => Europe.filterRows(adapter.rows(), [{ field: 'invented', op: 'gt', value: 0 }]));
});

test('Europe adapter uses existing engines; US default adapter and filter registry remain unchanged', async () => {
  const before = JSON.stringify(Fields.FIELDS), defaultAdapter = Adapters.create({});
  assert.equal(defaultAdapter.id, 'static-json');
  const f = fixture(), adapter = Adapters.create({ scope: 'EUROPE', europe: researchOptions(f) });
  await adapter.load();
  const query = Query.validate({ v: 1, groups: [{ op: 'AND', filters: [
    { field: 'country', op: 'in', value: ['DE'] }, { field: 'price', op: 'gt', value: 200 }
  ] }] });
  const result = await adapter.screen(query);
  assert.equal(result.total, 1); assert.equal(result.rows[0].securityId, id);
  assert.equal(adapter.dataset().meta.rankingsPublished, false); assert.equal(adapter.dataset().meta.factorPublication.compositeAllowed, false);
  assert.equal(JSON.stringify(Fields.FIELDS), before);
  const match = Engine.match(adapter.dataset(), Query.empty(), 0); assert.equal(match.score, null);
});

test('public identity/price rights allow base Screener but independently withhold Technical values', async () => {
  const r = { ...rights(), dataPaths: ['IDENTITY', 'RAW_EOD'] }, f = fixture({ audience: 'public', publicRights: r });
  const adapter = Europe.create({ enabled: true, contract: f.contract, securityIds: [id], rights: r }); await adapter.load();
  assert.equal(adapter.rows()[0].price, 202); assert.equal(adapter.rows()[0].sma50, null);
  assert.equal(adapter.rows()[0].TECHNICAL, 'TECHNICAL_BLOCKED'); assert.equal(adapter.info().publicDeliveryAllowed, true);
  assert.equal(f.counts().calls, 2, 'Technical contract not called without its rights scope');
});

test('invalid or stale canonical prices never enter Europe scope', async () => {
  const stale = fixture({ listing: { latest: { status: 'STALE', date: '2026-01-01' } } });
  const adapter = Europe.create(researchOptions(stale)); await adapter.load();
  assert.equal(adapter.rows().length, 0); assert.equal(adapter.readiness()[0].SCREENER, 'BLOCKED');
  assert.equal(stale.counts().calls, 1);
});

test('ready Technical requires European benchmark; incomplete metrics downgrade without zero filling', async () => {
  const benchmark = { region: 'EUROPE', status: 'VALIDATED', securityId: 'ref_EUROPE_BENCHMARK', evidenceRef: 'benchmark-reviewed' };
  const technical = { securityId: id, listingId: 'SAP:XETR', currency: 'EUR', asOf: '2026-10-07', status: 'TECHNICAL_READY', engineProjection: true, methodology: 'existing-engine', metrics: {
    high52w: 220, sma20: 200, sma50: 190, sma200: 170, momentum: 0, volatility: 0, drawdown: 0, relativeStrength: 0.1, breakout: 0 } };
  const ready = Europe.create(researchOptions(fixture({ listing: { benchmark, technical,
    adjustment: { status: 'ADJUSTMENT_CERTIFIED', evidenceRef: 'validated-splits' } } })));
  await ready.load(); assert.equal(ready.rows()[0].TECHNICAL, 'TECHNICAL_READY'); assert.equal(ready.rows()[0].RS, 'RS_READY');
  const partial = Europe.create(researchOptions(fixture({ listing: { benchmark, technical: { ...technical, metrics: { sma50: 190 } },
    adjustment: { status: 'ADJUSTMENT_CERTIFIED', evidenceRef: 'validated-splits' } } })));
  await partial.load(); assert.equal(partial.rows()[0].TECHNICAL, 'TECHNICAL_PARTIAL'); assert.equal(partial.rows()[0].momentum, null);
  assert.equal(partial.rows()[0].relativeStrength, null);
});

test('series and research use canonical IDs, and revoked public rights close cached delivery', async () => {
  const r = rights(), f = fixture({ audience: 'public', publicRights: r });
  const adapter = Europe.create({ enabled: true, contract: f.contract, securityIds: [id], rights: r }); await adapter.load();
  assert.deepEqual(await adapter.series(id), [['2026-10-06', 200], ['2026-10-07', 202]]);
  assert.equal(await adapter.series('SAP'), null); assert.equal((await adapter.research(id)).securityId, id);
  r.display = false;
  assert.deepEqual(adapter.rows(), []); assert.equal(adapter.dataset().size, 0);
  assert.equal(await adapter.series(id), null); assert.equal(await adapter.research(id), null);
});

test('roster uses canonical IDs, deduplicates once, and requires a Europe canonical contract', async () => {
  const f = fixture();
  assert.throws(() => Europe.create({ contract: f.contract, securityIds: ['SAP'] }), /CANONICAL_EUROPE_ROSTER/);
  assert.throws(() => Europe.create({ contract: { ...f.contract, universeId: 'US_REAL' }, securityIds: [id] }), /CONTRACT_REQUIRED/);
  const adapter = Europe.create({ ...researchOptions(f), securityIds: [id, id] }); await adapter.load();
  assert.equal(adapter.rows().length, 1); assert.equal(adapter.readiness().length, 1);
});

test('stale technical projection is withheld independently from a usable fresh price', async () => {
  const f = fixture({ listing: { technical: { securityId: id, listingId: 'SAP:XETR', currency: 'EUR',
    asOf: '2026-01-01', status: 'TECHNICAL_PARTIAL', engineProjection: true, methodology: 'existing-engine', metrics: { sma50: 200 } } } });
  const adapter = Europe.create(researchOptions(f)); await adapter.load();
  assert.equal(adapter.rows()[0].price, 202); assert.equal(adapter.rows()[0].sma50, null);
  assert.equal(adapter.rows()[0].TECHNICAL, 'TECHNICAL_BLOCKED');
});

test('browser UMD load uses existing modules and keeps closed public scope empty', async () => {
  const f = fixture(), context = { VUScreenerEngine: Engine, VUScreenerFields: Fields, VUCore: { Identity } };
  runInNewContext(readFileSync(new URL('../europe-readiness.js', import.meta.url), 'utf8'), context);
  const adapter = context.VUScreenerEuropeReadiness.create({ enabled: true, contract: f.contract, securityIds: [id] });
  await adapter.load(); assert.equal(adapter.dataset().size, 0); assert.equal(f.counts().calls, 0);
});

test('canonical-only public rights cannot display raw prices returned by a research Core contract', async () => {
  const r = { ...rights(), dataPaths: ['IDENTITY', 'CANONICAL_EOD', 'TECHNICAL'] }, f = fixture();
  const adapter = Europe.create({ enabled: true, contract: f.contract, securityIds: [id], rights: r });
  await adapter.load(); assert.equal(adapter.rows().length, 0); assert.equal(adapter.dataset().size, 0);
  assert.equal(adapter.readiness()[0].reason, 'PRICE_BASIS_RIGHTS_UNCONFIRMED');
  assert.equal(await adapter.series(id), null);
  const changingRights = rights(), cached = Europe.create({ enabled: true, contract: f.contract, securityIds: [id], rights: changingRights });
  await cached.load(); assert.equal(cached.dataset().size, 1);
  changingRights.dataPaths = ['IDENTITY', 'CANONICAL_EOD', 'TECHNICAL'];
  assert.equal(cached.dataset().size, 0); assert.equal(await cached.series(id), null);
});

test('unvalidated volume remains missing and cannot satisfy a zero-volume filter', async () => {
  const f = fixture({ listing: { priceQuality: { status: 'VALIDATED', evidenceRef: 'quality', volumeValid: false } } });
  const adapter = Europe.create(researchOptions(f)); await adapter.load();
  assert.equal(adapter.rows()[0].volume, null);
  adapter.setScopeFilters([{ field: 'volume', op: 'eq', value: 0 }]); assert.equal(adapter.dataset().size, 0);
});

function admittedFixture({ state = {}, raw = {}, technical = null } = {}) {
  let usCalls = 0, strictCalls = 0, technicalCalls = 0;
  const readiness = { IDENTITY: 'VERIFIED', UNIVERSE_IDENTITY_READY: true, DISCOVER_ELIGIBLE: true,
    BASE_SCREENER: 'READY', SCREENER: 'BLOCKED', CHART: 'CHART_LIMITED', CHART_READY: false, CHART_LIMITED: true,
    sessionLag: 0, TECHNICAL_READY: false, TECHNICAL_PARTIAL: false, TECHNICAL: 'TECHNICAL_BLOCKED', RS: 'RS_BLOCKED', ...state };
  const row = { region: 'EUROPE', securityId: id, listingId: 'SAP:XETR', companyId: 'LEI:529900T8BM49AURSDO55',
    ticker: 'SAP', providerSymbol: 'SAP.XETRA', name: 'SAP SE', country: 'DE', mic: 'XETR', currency: 'EUR',
    price: 202, priceBasis: 'RAW_UNADJUSTED', freshness: 'CURRENT_LAST_SESSION', sessionLag: 0,
    latestDate: '2026-10-09', chartStatus: 'CHART_LIMITED', volume: null, volumeValid: false,
    historyLength: 28, indexes: ['DAX'], provenance: { evidenceRef: 'source-bound-close-chart' }, ...raw };
  function ref(r) { if (r?.region !== 'EUROPE') { usCalls++; throw Error('US_FORBIDDEN'); } assert.equal(r.securityId, id); }
  const contract = { universeId: 'EUROPE', async getReadiness(r) { ref(r); return { state: 'AVAILABLE', data: readiness }; },
    async getBaseScreenerRow(r) { ref(r); return { state: 'AVAILABLE', asOf: '2026-10-09', data: row }; },
    async getScreenerRow() { strictCalls++; throw Error('STRICT_ROW_MUST_NOT_BE_CALLED'); },
    async getTechnicalData(r) { ref(r); technicalCalls++; return technical ? { state: 'AVAILABLE', asOf: '2026-10-09', data: technical } : { state: 'UNAVAILABLE' }; },
    async getPriceSeries(r) { ref(r); return { state: 'UNAVAILABLE' }; } };
  return { contract, counts: () => ({ usCalls, strictCalls, technicalCalls }) };
}

test('Discover-only CHART_LIMITED base rows remain filterable with all missing metrics null', async () => {
  const f = admittedFixture({ raw: { sma50: 999 } }), adapter = Europe.create(researchOptions(f)); await adapter.load();
  const row = adapter.rows()[0]; assert.equal(row.chartStatus, 'CHART_LIMITED'); assert.equal(row.price, 202);
  assert.equal(row.TECHNICAL, 'TECHNICAL_BLOCKED'); assert.equal(row.volume, null);
  for (const metric of Europe.METRICS) assert.equal(row[metric], null, 'visibility/base-row numbers cannot certify ' + metric);
  adapter.setScopeFilters([{ field: 'chartStatus', op: 'in', value: ['CHART_LIMITED'] }, { field: 'country', op: 'in', value: ['DE'] }]);
  assert.equal(adapter.dataset().size, 1); assert.equal(adapter.dataset().value('chartStatus', 0), 'CHART_LIMITED');
  adapter.setScopeFilters([{ field: 'sma50', op: 'gte', value: 0 }]); assert.equal(adapter.dataset().size, 0);
  adapter.setScopeFilters([{ field: 'volume', op: 'eq', value: 0 }]); assert.equal(adapter.dataset().size, 0);
  assert.deepEqual(f.counts(), { usCalls: 0, strictCalls: 0, technicalCalls: 0 });
});

test('base admission requires explicit coherent Core flags; stale and mismatched rows remain blocked', async () => {
  for (const change of [{ state: { DISCOVER_ELIGIBLE: false } }, { state: { UNIVERSE_IDENTITY_READY: false } },
    { state: { BASE_SCREENER: 'BLOCKED' } }, { state: { CHART_LIMITED: false } },
    { raw: { chartStatus: 'CHART_READY' } }, { raw: { freshness: 'STALE', sessionLag: 4 } },
    { raw: { latestDate: '2026-10-08' } }, { raw: { securityId: 'ref_OTHER' } }, { raw: { currency: '' } }]) {
    const adapter = Europe.create(researchOptions(admittedFixture(change))); await adapter.load();
    assert.equal(adapter.rows().length, 0); assert.equal(adapter.readiness()[0].SCREENER, 'BLOCKED');
  }
  const delayed = Europe.create(researchOptions(admittedFixture({ state: { sessionLag: 2 }, raw: { sessionLag: 2, freshness: 'DELAYED' } })));
  await delayed.load(); assert.equal(delayed.rows().length, 1); assert.equal(delayed.rows()[0].sessionLag, 2);
});

test('actual partial technical response values are separately bound and never filled from base prices', async () => {
  const technical = { securityId: id, listingId: 'SAP:XETR', currency: 'EUR', status: 'TECHNICAL_PARTIAL',
    methodology: 'existing-engine', priceBasis: 'RAW_UNADJUSTED', metrics: { sma50: 190, momentum: 0 },
    metricReadiness: { sma50: 'AVAILABLE', momentum: 'BLOCKED' } };
  const options = { state: { TECHNICAL_PARTIAL: true, TECHNICAL: 'TECHNICAL_PARTIAL' }, technical };
  const adapter = Europe.create(researchOptions(admittedFixture(options))); await adapter.load();
  assert.equal(adapter.rows()[0].sma50, 190); assert.equal(adapter.rows()[0].momentum, null);
  assert.equal(adapter.rows()[0].high52w, null); assert.equal(adapter.rows()[0].TECHNICAL, 'TECHNICAL_PARTIAL');
  for (const bad of [{ currency: 'USD' }, { currency: undefined }, { listingId: 'WRONG' }, { priceBasis: 'CANONICAL_SPLIT_ADJUSTED' }]) {
    const blocked = Europe.create(researchOptions(admittedFixture({ ...options, technical: { ...technical, ...bad } })));
    await blocked.load(); assert.equal(blocked.rows()[0].price, 202); assert.equal(blocked.rows()[0].sma50, null);
  }
});

test('technical filters cannot infer withheld values after technical rights are revoked', async () => {
  const r = rights(), f = fixture(), adapter = Europe.create({ enabled: true, contract: f.contract, securityIds: [id], rights: r });
  await adapter.load(); adapter.setScopeFilters([{ field: 'sma50', op: 'gte', value: 0 }]); assert.equal(adapter.rows().length, 1);
  r.dataPaths = ['IDENTITY', 'RAW_EOD']; assert.equal(adapter.rows().length, 0); assert.equal(adapter.dataset().size, 0);
});

test('real additive Core contract admits Close-only rows while strict analytics stay unavailable', async () => {
  const now = '2026-10-10T07:00:00Z', sha = 'a'.repeat(64), points = [];
  for (let date = new Date('2026-09-01T00:00:00Z'); date <= new Date('2026-10-09T00:00:00Z'); date.setUTCDate(date.getUTCDate() + 1))
    if (![0, 6].includes(date.getUTCDay())) points.push([date.toISOString().slice(0, 10), 100 + points.length]);
  const s = { region: 'EUROPE', securityId: id, companyId: 'LEI:529900T8BM49AURSDO55', isin: 'DE0007164600',
    primaryListingId: 'SAP:XETR', acceptance: 'DISCOVER_ONLY', identity: { status: 'VERIFIED' }, name: 'SAP SE', ticker: 'SAP' };
  const l = { listingId: s.primaryListingId, mic: 'XETR', providerSymbol: 'SAP.XETRA', ticker: 'SAP', currency: 'EUR', country: 'DE',
    latest: { date: '2026-10-09', status: 'LAST_VALID_SESSION' }, adjustment: { status: 'ADJUSTMENT_UNKNOWN' } };
  const bound = { securityId: id, companyId: s.companyId, listingId: l.listingId, mic: l.mic, providerSymbol: l.providerSymbol, currency: 'EUR', isin: s.isin };
  l.identityAdmission = { ...bound, version: 'europe-discover-identity-2.0.0', status: 'UNIVERSE_IDENTITY_READY', assetType: 'EQUITY',
    issuerCountry: 'DE', issuerBinding: 'VERIFIED_LEGAL_ISSUER', securityKey: 'ISIN:' + s.isin, active: true,
    localListingPlausible: true, duplicateResolved: true, evidenceRefs: [{ sha256: sha, verified: true }] };
  l.discoverChart = { ...bound, version: 'europe-discover-close-chart-1', chartStatus: 'CHART_LIMITED', evidenceRef: { sha256: sha, verified: true },
    pointsSha256: createHash('sha256').update(JSON.stringify(points)).digest('hex'), sourceInputSha256: sha, immutableExclusionsSha256: sha,
    evaluatedAt: now, segments: [points], observationCount: points.length, firstDate: points[0][0], lastDate: points.at(-1)[0], sessionLag: 0,
    calendarSource: { sha256: sha }, calendarSourceSha256: sha, calendarProof: { evaluatedAt: now, verified: true, mic: 'XETR', sourceSha256: sha, coverageFrom: '2026-09-01', coverageTo: '2026-10-13', expectedLastCompletedSession: '2026-10-09', nextScheduledSession: { date: '2026-10-12', close: '2026-10-12T15:30:00Z' } }, priceBasis: 'RAW_UNADJUSTED', quoteUnit: 'EUR',
    quoteBasis: { ...bound, kind: 'OFFICIAL_LISTING_QUOTE_REFERENCE', sourceSha256: sha, quoteUnit: 'EUR' }, reasonCodes: [], criticalIssues: [] };
  s.listings = [l]; let usCalls = 0;
  const contract = CoreEurope.create({ catalog: { securities: [s] }, audience: 'research', now,
    usClient: { getLatestPrice() { usCalls++; throw Error('US_FORBIDDEN'); } },
    loadSeries: async req => ({ securityId: id, listingId: l.listingId, currency: 'EUR', basis: req.basis, points, provenance: { evidenceRef: sha } }) });
  const adapter = Europe.create({ enabled: true, audience: 'research', privateResearch: true, contract, securityIds: [id] }); await adapter.load();
  assert.equal(adapter.rows().length, 1, JSON.stringify(adapter.readiness())); assert.equal(adapter.rows()[0].chartStatus, 'CHART_LIMITED'); assert.equal(adapter.rows()[0].volume, null);
  assert.equal(adapter.rows()[0].sma50, null); assert.equal(adapter.rows()[0].TECHNICAL, 'TECHNICAL_BLOCKED'); assert.equal(usCalls, 0);
  assert.equal(await adapter.series(id), null, 'Close-only rows cannot activate QuickResearch SMA overlays');
  assert.deepEqual(await adapter.sparkSeries(id), points);
  assert.equal((await contract.getScreenerRow({ region: 'EUROPE', securityId: id })).state, 'UNAVAILABLE');
  assert.equal((await contract.getQuantData({ region: 'EUROPE', securityId: id })).data.score, null);
});

test('identity rights revoked during an awaited series request close delivery even when RAW rights remain', async () => {
  const r = rights(), f = fixture(), original = f.contract.getPriceSeries;
  f.contract.getPriceSeries = async (...args) => { const result = await original(...args); r.dataPaths = ['RAW_EOD']; return result; };
  const adapter = Europe.create({ enabled: true, contract: f.contract, securityIds: [id], rights: r }); await adapter.load();
  assert.equal(await adapter.series(id), null); assert.equal(adapter.rows().length, 0);
});

test('existing continuous Screener renderer never receives a flattened multi-segment quarantine gap', async () => {
  const f = fixture(), original = f.contract.getPriceSeries;
  f.contract.getPriceSeries = async (...args) => { const response = await original(...args); response.data.segments = response.data.points.map(point => [point]); return response; };
  const adapter = Europe.create(researchOptions(f)); await adapter.load();
  assert.equal(adapter.rows().length, 1); assert.equal(await adapter.series(id), null); assert.equal(await adapter.sparkSeries(id), null);
  f.contract.getPriceSeries = async (...args) => { const response = await original(...args); response.data.segments = [response.data.points]; return response; };
  assert.deepEqual(await adapter.series(id), [['2026-10-06', 200], ['2026-10-07', 202]]);
});

test('new base path requires explicit one-segment proof; missing gap metadata cannot become a sparkline', async () => {
  for (const segments of [undefined, null]) {
    const f = admittedFixture();
    f.contract.getPriceSeries = async () => ({ state: 'AVAILABLE', data: { securityId: id, listingId: 'SAP:XETR', currency: 'EUR',
      basis: 'RAW_UNADJUSTED', points: [['2026-10-09', 202]], segments } });
    const adapter = Europe.create(researchOptions(f)); await adapter.load();
    assert.equal(adapter.rows().length, 1); assert.equal(await adapter.sparkSeries(id), null);
  }
});
