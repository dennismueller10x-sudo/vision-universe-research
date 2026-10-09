import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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

test('existing Screener factory selects Europe explicitly; US adapter and filter registry remain unchanged', async () => {
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
