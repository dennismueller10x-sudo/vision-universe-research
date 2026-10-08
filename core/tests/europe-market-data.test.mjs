import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Europe = require('../europe-market-data.js');
const Core = require('../client.js');

const ref = { region: 'EUROPE', securityId: 'ref_SAP_XETR' };
function catalog() {
  return { securities: [{
    region: 'EUROPE', securityId: ref.securityId, companyId: 'LEI:SAP', instrumentId: 'vu_abcdef123456',
    name: 'SAP SE', ticker: 'SAP', isin: 'DE0007164600', aliases: ['SAP.DE'], indexes: ['DAX'],
    acceptance: 'ACCEPTED', identity: { status: 'VERIFIED' }, primaryListingId: 'SAP:XETR',
    logo: { status: 'LOGO_MISSING' },
    listings: [{ listingId: 'SAP:XETR', ticker: 'SAP', providerSymbol: 'SAP.XETRA', country: 'DE',
      countryName: 'Germany', exchange: 'Xetra', mic: 'XETR', currency: 'EUR',
      latest: { status: 'LAST_VALID_SESSION', date: '2026-10-06', volume: 0 }, history: { valid: true, observations: 250 },
      priceQuality: { status: 'VALIDATED', evidenceRef: 'quality.json', volumeValid: true },
      adjustment: { status: 'ADJUSTMENT_UNKNOWN' },
      technical: { securityId: ref.securityId, listingId: 'SAP:XETR', currency: 'EUR', status: 'TECHNICAL_PARTIAL', engineProjection: true, metrics: { sma50: 200, momentum: 0, relativeStrength: 10 } }
    }, { listingId: 'SAP:XFRA', ticker: 'SAP', providerSymbol: 'SAP.F', country: 'DE', mic: 'XFRA', currency: 'EUR' }]
  }] };
}
function series(overrides = {}) {
  return { securityId: ref.securityId, listingId: 'SAP:XETR', basis: 'RAW_UNADJUSTED', currency: 'EUR',
    points: [['2026-10-05', 200], ['2026-10-06', 202]], provenance: { evidenceRef: 'series.sha256', provider: 'marketstack' }, ...overrides };
}
function client(options = {}) {
  return Europe.create({ usClient: {}, catalog: catalog(), audience: 'research', now: '2026-10-08T10:00:00Z', loadSeries: async () => series(), ...options });
}
const rights = { display: true, commercial: true, evidenceRef: 'contract-display-review',
  dataPaths: ['IDENTITY', 'RAW_EOD', 'CANONICAL_EOD', 'TECHNICAL', 'QUANT', 'STRATEGY', 'SNAPSHOT', 'FUNDAMENTALS', 'CORPORATE_ACTIONS'] };

test('US delegates the exact reference/options/result through the actual existing core client', async () => {
  const paths = [];
  const usClient = Core.create({ load: async path => {
    paths.push(path);
    if (path.includes('instruments')) return { instruments: [{ symbol: 'AAPL', active: true, companyName: 'Apple', instrumentId: 'vu_abc123' }] };
    return { points: [['2026-10-05', 250], ['2026-10-06', 252]], priceSeriesType: 'SPLIT_ADJUSTED', currency: 'USD' };
  } });
  const euro = Europe.create({ usClient, catalog: catalog() });
  for (const [method, args] of [['getSecurity', ['AAPL']], ['getPriceSeries', ['AAPL', { range: 'MAX' }]],
    ['getLatestPrice', ['AAPL']]]) assert.deepEqual(await euro[method](...args), await usClient[method](...args));
  assert.ok(paths.every(path => path.startsWith('/quant/data/')));
  const result = { state: 'US_UNCHANGED' }, requested = { region: 'US', ticker: 'SAP' }, options = { range: '5Y' };
  const spy = client({ usClient: { getPriceSeries(r, o) { assert.equal(r, requested); assert.equal(o, options); return result; } } });
  assert.equal(await spy.getPriceSeries(requested, options), result);
});

test('public gate stays closed without explicit evidence for the concrete data path', async () => {
  let loads = 0;
  const c = client({ audience: 'public', rights: { commercial: true, display: true }, loadSeries: async () => { loads++; return series(); } });
  assert.equal((await c.getSecurity(ref)).reason, 'DISPLAY_RIGHTS_UNCONFIRMED');
  assert.equal((await c.search('SAP')).reason, 'DISPLAY_RIGHTS_UNCONFIRMED');
  assert.equal((await c.getPriceSeries(ref)).reason, 'DISPLAY_RIGHTS_UNCONFIRMED');
  assert.equal(loads, 0);
  const identityOnly = client({ audience: 'public', rights: { ...rights, dataPaths: ['IDENTITY'] } });
  assert.equal((await identityOnly.getSecurity(ref)).state, 'AVAILABLE');
  assert.equal((await identityOnly.getPriceSeries(ref)).reason, 'DISPLAY_RIGHTS_UNCONFIRMED');
  assert.throws(() => client({ audience: 'typo' }), /INVALID_AUDIENCE/);
});

test('search resolves aliases, ISIN and metadata once per security, preserving primary listing', async () => {
  const c = client();
  for (const q of ['SAP', 'SAP SE', 'SAP.DE', 'SAP.F', 'DE0007164600', 'Germany', 'Xetra', 'XFRA']) {
    const result = await c.search(q);
    assert.equal(result.data.results.length, 1, q);
    assert.equal(result.data.results[0].listingId, 'SAP:XETR');
  }
  assert.equal((await c.getSecurity({ ...ref, listingId: 'SAP:XFRA' })).data.listingId, 'SAP:XFRA');
  assert.equal((await c.getSecurity({ ...ref, securityId: 'other', listingId: 'SAP:XFRA' })).reason, 'CANONICAL_ID_NOT_ACCEPTED');
  assert.equal((await c.search('does not exist')).data.results.length, 0);
});

test('raw chart works independently of quant and never silently requests adjusted provider fields', async () => {
  let calls = 0;
  const c = client({ loadSeries: async request => { calls++; assert.equal(request.basis, 'RAW_UNADJUSTED'); return series(); } });
  const chart = await c.getPriceSeries(ref);
  assert.equal(chart.state, 'AVAILABLE');
  assert.equal(chart.data.adjustmentStatus, 'ADJUSTMENT_UNKNOWN');
  assert.equal(chart.data.basis, 'RAW_UNADJUSTED');
  chart.data.points[0][1] = 1;
  assert.equal((await c.getPriceSeries(ref)).data.points[0][1], 200);
  assert.equal((await c.getLatestPrice(ref)).data.close, 202);
  assert.equal((await c.getLatestPrice(ref)).data.changePercent, null);
  assert.equal((await c.getPriceSeries(ref, { basis: 'PROVIDER_ADJUSTED' })).reason, 'ADJUSTMENT_BASIS_NOT_CERTIFIED');
  assert.equal((await c.getPriceSeries(ref, { basis: 'CANONICAL_SPLIT_ADJUSTED' })).reason, 'ADJUSTMENT_BASIS_NOT_CERTIFIED');
  assert.equal(calls, 1);
  const state = (await c.getReadiness(ref)).data;
  assert.equal(state.CHART, 'CHART_LIMITED');
  assert.equal(state.QUANT, 'QUANT_BLOCKED');
  assert.equal(state.BACKTEST, 'RESEARCH_ONLY');
  assert.equal(state.dataTier, 2);
  assert.equal(state.publicTier, 0);
});

test('canonical series rejects duplicate dates, invalid prices, identity and currency drift without repairs', async () => {
  for (const overrides of [
    { points: [['2026-10-06', 200], ['2026-10-06', 201]] },
    { points: [['2026-10-06', 0]] }, { points: [['2026-10-06', -1]] },
    { points: [['2026-02-30', 200]] }, { points: [['2026-10-06', '200']] },
    { securityId: 'ref_AAPL' }, { listingId: 'SAP:XFRA' }, { currency: 'USD' }, { provenance: {} }
  ]) assert.equal((await client({ loadSeries: async () => series(overrides) }).getPriceSeries(ref)).state, 'UNAVAILABLE');
});

test('loader failures can recover; cache distinguishes canonical range/basis and retains provenance', async () => {
  let calls = 0;
  const c = client({ loadSeries: async () => { if (++calls === 1) throw Error('not ready'); return series({ sessionContinuity: 'VALIDATED' }); } });
  assert.equal((await c.getPriceSeries(ref)).reason, 'SOURCE_MISSING');
  assert.equal((await c.getLatestPrice(ref)).data.changePercent, 1);
  assert.equal((await c.getPriceSeries(ref)).data.provenance.provider, 'marketstack');
  await c.getPriceSeries(ref, { range: '3Y' });
  assert.equal(calls, 3);
});

test('screener keeps missing metrics null, genuine zero remains zero, unknown benchmark blocks RS', async () => {
  const row = (await client().getScreenerRow(ref)).data;
  assert.equal(row.sma50, 200);
  assert.equal(row.sma200, null);
  assert.equal(row.momentum, 0);
  assert.equal(row.volume, 0);
  assert.equal(row.relativeStrength, null);
  assert.equal(row.RS, 'RS_BLOCKED');
  assert.equal((await client().getTechnicalData(ref)).data.benchmark, null);
  const invalid=catalog();invalid.securities[0].listings[0].priceQuality.volumeValid=false;
  assert.equal((await client({catalog:invalid}).getScreenerRow(ref)).data.volume,null);
});

test('full quant and strict strategy gates require official identity, adjustment, actions and Europe benchmark', () => {
  const s = catalog().securities[0], l = s.listings[0];
  l.technical.status = 'TECHNICAL_READY';
  s.fundamentals = { version: 'marketstack-europe-fundamentals-1.0.0', status: 'VALIDATED',
    sourcePolicy: 'ESEF_OFFICIAL_FILINGS_PRIMARY_SEC_ACTUAL_FILER_ONLY',
    identity: { status: 'VERIFIED', mapping: { companyId: s.companyId, securityId: s.securityId,
      listingId: l.listingId, mic: l.mic, listingCurrency: l.currency, isin: s.isin, shareClassId: 'ISIN:DE0007164600' },
      provenance: [{ source: 'official-reference' }] }, acceptedFilings: [{ source: { kind: 'ESEF' } }],
    engineInputsValid: true, fundamentalsCurrent: true, currencyBasisValid: true, sharesBasisValid: true };
  l.adjustment = { status: 'ADJUSTMENT_CERTIFIED', evidenceRef: 'adjustment.json' };
  l.corporateActions = { status: 'VALIDATED', evidenceRef: 'actions.json', events: [] };
  l.benchmark = { region: 'EUROPE', status: 'VALIDATED', securityId: 'ref_EXSA_XETR', evidenceRef: 'benchmark.json' };
  l.history.strategyHistoryValid = true;
  l.history.backtestHistoryValid = true;
  let state = Europe.readiness(s, l, rights);
  assert.equal(state.QUANT, 'QUANT_FULL');
  assert.equal(state.SUPERTRADER, 'READY');
  assert.equal(state.BACKTEST, 'BACKTEST_READY');
  assert.equal(state.dataTier, 5);
  assert.equal(state.publicTier, 5);
  assert.equal(state.rankingEligible, false);
  s.fundamentals.identity.mapping.listingId = 'SAP:XFRA';
  assert.equal(Europe.readiness(s, l, rights).QUANT, 'QUANT_TECHNICAL_ONLY');
  s.fundamentals.identity.mapping.listingId = l.listingId;
  s.fundamentals.engineInputsValid = false;
  assert.equal(Europe.readiness(s, l, rights).QUANT, 'QUANT_TECHNICAL_ONLY');
  s.fundamentals.engineInputsValid = true;
  l.benchmark.region = 'US';
  assert.equal(Europe.readiness(s, l, rights).SUPERTRADER, 'BLOCKED');
  l.benchmark.region = 'EUROPE';
  s.fundamentals.sourcePolicy = 'MARKETSTACK';
  assert.equal(Europe.readiness(s, l, rights).QUANT, 'QUANT_TECHNICAL_ONLY');
});

test('adjusted chart certification requires canonical split-factor pipeline evidence, not provider adj_close', async () => {
  const data = catalog();
  data.securities[0].listings[0].adjustment = { status: 'ADJUSTMENT_CERTIFIED', evidenceRef: 'review.json' };
  const adjusted = { basis: 'CANONICAL_SPLIT_ADJUSTED', adjustment: { status: 'ADJUSTMENT_CERTIFIED', evidenceRef: 'series-review', method: 'PROVIDER_ADJ_CLOSE' } };
  const c = client({ catalog: data, loadSeries: async () => series(adjusted) });
  assert.equal((await c.getPriceSeries(ref)).reason, 'ADJUSTMENT_BASIS_NOT_CERTIFIED');
  adjusted.adjustment.method = 'VU_CANONICAL_SPLIT_FACTORS';
  assert.equal((await client({ catalog: data, loadSeries: async () => series(adjusted) }).getPriceSeries(ref)).state, 'AVAILABLE');
});

test('canonical watchlist add/save/reload/remove survives a new instance and protects legacy stores', () => {
  const memory = new Map([['vu.quant.watchlist.v1', '["AAPL"]'], ['vu2.watchlist.selection.v1', 'legacy']]);
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const opts = { storage, catalog: catalog(), protectedIds: ['ref_AAPL'] };
  const first = Europe.createWatchlist(opts);
  first.add(ref.securityId);
  first.add(ref.securityId);
  assert.deepEqual(first.save(), [ref.securityId]);
  const second = Europe.createWatchlist(opts);
  assert.deepEqual(second.reload(), [ref.securityId]);
  second.remove(ref.securityId);
  second.save();
  assert.deepEqual(first.reload(), []);
  assert.equal(memory.get('vu.quant.watchlist.v1'), '["AAPL"]');
  assert.equal(memory.get('vu2.watchlist.selection.v1'), 'legacy');
  assert.throws(() => first.add('SAP'), /CANONICAL_ID_NOT_ACCEPTED/);
  memory.set(first.key, '{');
  assert.throws(() => first.reload(), /INVALID_SAVED_EUROPE_WATCHLIST/);
});

test('catalog refuses US IDs and identity collisions, and snapshots preserve uncertainty', async () => {
  assert.throws(() => client({ protectedIds: [ref.securityId] }), /INVALID_EUROPE_CATALOG_IDENTITY/);
  const dup = catalog(); dup.securities.push(structuredClone(dup.securities[0]));
  assert.throws(() => client({ catalog: dup }), /INVALID_EUROPE_CATALOG_IDENTITY/);
  const data = catalog(); data.securities[0].listings[0].snapshot = {
    status: 'SNAPSHOT_DELAY_UNKNOWN', price: 203, asOf: '2026-10-07T10:00:00Z', provenance: { evidenceRef: 'snapshot.json' },
    securityId: ref.securityId, listingId: 'SAP:XETR', currency: 'EUR'
  };
  const observed = await client({ catalog: data, now: '2026-10-08T10:00:00Z' }).getIntraday(ref);
  assert.equal(observed.data.guaranteedRealtime, false);
  assert.equal(observed.data.delayMinutes, null);
  assert.equal(observed.data.status, 'SNAPSHOT_DELAY_UNKNOWN');
});

test('logo absence never blocks listing acceptance; existing central resolver supplies assets', async () => {
  assert.equal((await client().getLogo(ref)).data.fallback, true);
  const data = catalog(); data.securities[0].logo = { status: 'LOGO_VALID', key: 'SAP' };
  const c = client({ catalog: data, logoResolver: async key => { assert.equal(key, 'SAP'); return '/discover/logos/files/SAP.png'; } });
  assert.equal((await c.getLogo(ref)).data.asset, '/discover/logos/files/SAP.png');
  assert.equal((await c.getReadiness(ref)).data.SEARCH, 'READY');
});

test('foundation mapping preserves accepted IDs and leaves price/rights unknown until independent evidence', async () => {
  const listingKey = 'marketstack:XETR:SAP';
  const foundation = {
    candidates: [{ status: 'REVIEW', securityId: 'ref_FAKE_XETR' }],
    securities: [{ securityId: ref.securityId, companyKey: 'LEI:SAP', canonicalTicker: 'SAP.XETR',
      primaryListing: listingKey, listings: [listingKey], aliases: ['SAP', 'SAP.XETR'] }],
    listings: [{ status: 'ACCEPTED', listingKey, securityId: ref.securityId, companyKey: 'LEI:SAP',
      instrumentId: 'vu_abcdef123456', name: 'SAP SE', symbol: 'SAP', providerSymbol: 'SAP', mic: 'XETR',
      exchangeCountry: 'DE', currency: 'EUR', identityEvidence: [{ verified: true, source: 'official-reference' }] }]
  };
  const data = Europe.fromFoundation(foundation);
  assert.equal(data.securities.length, 1);
  assert.equal(data.securities[0].securityId, ref.securityId);
  const c = client({ catalog: data });
  assert.equal((await c.search('SAP')).data.results.length, 1);
  assert.equal((await c.getReadiness(ref)).data.CHART, 'CHART_BLOCKED');
  assert.equal((await c.getReadiness(ref)).data.publicTier, 0);
  foundation.listings[0].status = 'REVIEW';
  assert.deepEqual(Europe.fromFoundation(foundation).securities, []);
});

test('freshness cannot transfer from catalog to a stale loaded series', async () => {
  const stale = client({ loadSeries: async () => series({ points: [['2026-10-02', 198]] }) });
  assert.equal((await stale.getLatestPrice(ref)).reason, 'CANONICAL_SERIES_LATEST_DATE_MISMATCH');
  const data = catalog(); delete data.securities[0].listings[0].latest.date;
  assert.equal((await client({ catalog: data }).getPriceSeries(ref)).reason, 'CHART_BLOCKED');
});

test('rights for canonical adjusted data never authorize raw EOD display', async () => {
  const c = client({ audience: 'public', rights: { ...rights, dataPaths: ['IDENTITY', 'CANONICAL_EOD'] } });
  assert.equal((await c.getPriceSeries(ref)).reason, 'DISPLAY_RIGHTS_UNCONFIRMED');
  assert.equal((await c.getReadiness(ref)).data.publicTier, 1);
  assert.equal((await c.getScreenerRow(ref)).reason, 'DISPLAY_RIGHTS_UNCONFIRMED');
});

test('snapshot rejects bad prices, future/invalid timestamps and cross-listing/currency identity', async () => {
  for (const extra of [{ price: 0 }, { price: -1 }, { price: null }, { asOf: 'not a time' }, { asOf: '2026-02-30T10:00:00Z' },
    { asOf: '2026-10-09T00:00:00Z' }, { currency: 'USD' }, { listingId: 'SAP:XFRA' }, { securityId: 'ref_AAPL' }]) {
    const data = catalog(); data.securities[0].listings[0].snapshot = {
      status: 'SNAPSHOT_CURRENT', price: 203, asOf: '2026-10-07T10:00:00Z',
      provenance: { evidenceRef: 'snapshot.json' }, securityId: ref.securityId, listingId: 'SAP:XETR', currency: 'EUR', ...extra
    };
    assert.equal((await client({ catalog: data, now: '2026-10-08T10:00:00Z' }).getIntraday(ref)).reason, 'SNAPSHOT_NOT_AVAILABLE');
  }
});

test('caller policy mutation cannot reopen an existing closed public contract or weaken watchlist protection', async () => {
  const options={usClient:{},catalog:catalog(),audience:'public',rights:{display:false,commercial:false,dataPaths:[]}};
  const c=Europe.create(options);
  options.audience='research';
  Object.assign(options.rights,rights);
  options.rights.dataPaths.push('RAW_EOD');
  assert.equal((await c.getSecurity(ref)).reason,'DISPLAY_RIGHTS_UNCONFIRMED');
  assert.equal((await c.getPriceSeries(ref)).reason,'DISPLAY_RIGHTS_UNCONFIRMED');
  assert.equal(options.audience,'research');
  const memory=new Map(),storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
  const policy={storage,catalog:catalog(),protectedIds:['ref_AAPL']},watch=Europe.createWatchlist(policy);
  policy.protectedIds.length=0;
  memory.set(watch.key,JSON.stringify({version:Europe.CONTRACT_VERSION,region:'EUROPE',securityIds:['ref_AAPL']}));
  assert.throws(()=>watch.reload(),/INVALID_EUROPE_WATCHLIST/);
});

test('foreign technical/quality certificates cannot qualify another canonical security', async () => {
  const data=catalog(),row=data.securities[0],listing=row.listings[0];
  listing.technical.securityId='ref_FOREIGN_XETR';
  assert.equal((await client({catalog:data}).getReadiness(ref)).data.TECHNICAL,'TECHNICAL_BLOCKED');
  assert.equal((await client({catalog:data}).getTechnicalData(ref)).reason,'TECHNICAL_INPUTS_NOT_VALIDATED');
  assert.equal((await client({catalog:data}).getScreenerRow(ref)).data.sma50,null);
  listing.priceQuality.currency='USD';
  assert.equal((await client({catalog:data}).getPriceSeries(ref)).reason,'CHART_BLOCKED');
});

test('future catalog dates and future series bars cannot be published as current', async () => {
  const data=catalog();data.securities[0].listings[0].latest.date='2029-01-01';
  assert.equal((await client({catalog:data}).getPriceSeries(ref)).reason,'CHART_BLOCKED');
  assert.equal((await client({loadSeries:async()=>series({points:[['2029-01-01',200]]})}).getPriceSeries(ref)).reason,'INVALID_CANONICAL_SERIES');
});

test('existing news, stock page and Discover index methods retain exact US forwarding', async () => {
  const value={legacy:true},news={ticker:'AAPL'},ticker='AAPL',args={scope:'US_REAL'},calls=[];
  const c=client({usClient:{getNews(arg){calls.push(arg);return value;},stockPage(arg){calls.push(arg);return value;},discoverIndex(arg){calls.push(arg);return value;}}});
  assert.equal(await c.getNews(news),value);
  assert.equal(await c.stockPage(ticker),value);
  assert.equal(await c.discoverIndex(args),value);
  assert.deepEqual(calls,[news,ticker,args]);
});
