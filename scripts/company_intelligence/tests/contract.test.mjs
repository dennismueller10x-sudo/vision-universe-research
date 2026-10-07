import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url), { load, SCHEMA, safeLink } = require('../../../company-intelligence/api/contract.js');
const cid = 'iss_cik_0000320193', iid = 'vu_b8ae31d1562481';
function data() { return { schema: SCHEMA, state: 'AVAILABLE', companyId: cid, listings: [{ symbol: 'AAPL', instrumentId: iid }], generatedAt: '2026-10-01T12:00:00Z', news: [], events: [], earnings: [], filings: [], calls: [], timeline: [] }; }
function fetcher(payload = data(), index = {}) {
  return async path => ({ ok: true, json: async () => path.endsWith('index.json') ? { schema: SCHEMA, state: 'PREVIEW', companies: { [cid]: 'snapshots/' + 'a'.repeat(24) + '/' + cid + '.json' }, tickers: { AAPL: [{ companyId: cid, instrumentId: iid, exchange: 'NASDAQ' }] }, ...index } : payload });
}
const options = { enabled: true, now: '2026-10-01T18:00:00Z' };
test('transient failures recover independently at index, lookup and issuer without changing generation checks', async()=>{
 const generation='b'.repeat(24);
 for(const stage of ['index.json','lookup/AA.json',cid+'.json']){
  const calls=[],failed=new Set();
  const fetch=async path=>{
   calls.push(path);
   if(path.endsWith(stage)&&!failed.has(path)){failed.add(path);return {ok:false,status:503};}
   return {ok:true,status:200,json:async()=>path.endsWith('index.json')?{schema:SCHEMA,state:'AVAILABLE',generation,lookupShards:['AA']}:path.includes('/lookup/')?{schema:SCHEMA,generation,tickers:{AAPL:[{companyId:cid,instrumentId:iid}]},companies:{[cid]:'snapshots/'+generation+'/'+cid+'.json'}}:data()};
  };
  const result=await load('AAPL',{...options,expectedGeneration:generation,fetch});
  assert.equal(result.state,'AVAILABLE');assert.equal(result.preview,false);assert.equal(calls.length,4);assert.equal(calls.filter(p=>p.endsWith(stage)).length,2);
 }
});
test('permanent transient failure stops after three attempts; non-transient HTTP errors are never retried', async()=>{
 for(const status of [503,403,404]){
  let calls=0;const result=await load('AAPL',{...options,fetch:async()=>{calls++;return {ok:false,status};}});
  assert.equal(result.reason,'INDEX_UNAVAILABLE');assert.equal(calls,status===503?3:1);
 }
});
test('network recovery is bounded and abort interrupts backoff without another request',async()=>{
 let calls=0;const inner=fetcher();
 const result=await load('AAPL',{...options,fetch:async path=>{calls++;if(calls===1)throw new TypeError('Network failure');return inner(path);}});
 assert.equal(result.state,'AVAILABLE');assert.equal(calls,3);
 const controller=new AbortController();calls=0;
 const pending=load('AAPL',{...options,signal:controller.signal,fetch:async()=>{calls++;setTimeout(()=>controller.abort(),20);return {ok:false,status:503};}});
 assert.equal((await pending).reason,'REQUEST_ABORTED');assert.equal(calls,1);
});
test('a successful HTTP response with wrong generation or malformed JSON is not retried',async()=>{
 let calls=0;
 const wrong=await load('AAPL',{...options,expectedGeneration:'b'.repeat(24),fetch:async()=>{calls++;return {ok:true,status:200,json:async()=>({schema:SCHEMA,state:'AVAILABLE',generation:'a'.repeat(24)})};}});
 assert.equal(wrong.reason,'PRODUCTION_GENERATION_MISMATCH');assert.equal(calls,1);
 calls=0;const malformed=await load('AAPL',{...options,fetch:async()=>{calls++;return {ok:true,status:200,json:async()=>{throw new SyntaxError('Malformed JSON');}};}});
 assert.equal(malformed.reason,'FETCH_FAILED');assert.equal(calls,1);
});
test('disabled feature makes no request', async () => { let requests = 0; const r = await load('AAPL', { fetch: async () => requests++ }); assert.equal(r.reason, 'FEATURE_DISABLED'); assert.equal(requests, 0); });
test('available preview and stale flags', async () => { const r = await load('aapl', { ...options, fetch: fetcher() }); assert.equal(r.state, 'AVAILABLE'); assert.equal(r.preview, true); assert.equal(r.stale, false); const old = await load('AAPL', { ...options, now: '2026-10-04T00:00:00Z', fetch: fetcher() }); assert.equal(old.stale, true); });
test('failed responses aborts malformed payloads and invalid ticker', async () => { assert.equal((await load('../AAPL', options)).reason, 'INVALID_TICKER'); assert.equal((await load('AAPL', { ...options, fetch: async () => ({ ok: false }) })).reason, 'INDEX_UNAVAILABLE'); assert.equal((await load('AAPL', { ...options, fetch: async () => { throw new Error('oops'); } })).reason, 'FETCH_FAILED'); assert.equal((await load('AAPL', { ...options, fetch: async () => { throw Object.assign(new Error(), { name: 'AbortError' }); } })).reason, 'REQUEST_ABORTED'); });
test('unknown and ambiguous ticker never select first listing', async () => { assert.equal((await load('XYZ', { ...options, fetch: fetcher() })).reason, 'UNKNOWN_TICKER'); const i = { tickers: { AAPL: [{ companyId: cid, instrumentId: iid }, { companyId: 'iss_cik_0000000001', instrumentId: 'vu_12345678901234' }] } }; assert.equal((await load('AAPL', { ...options, fetch: fetcher(data(), i) })).reason, 'AMBIGUOUS_TICKER'); });
test('identity and path traversal failures', async () => { assert.equal((await load('AAPL', { ...options, fetch: fetcher({ ...data(), companyId: 'iss_cik_0000000001' }) })).reason, 'IDENTITY_MISMATCH'); assert.equal((await load('AAPL', { ...options, fetch: fetcher(data(), { companies: { [cid]: '../../secrets.json' } }) })).reason, 'INVALID_DATA_PATH'); assert.equal((await load('AAPL', { ...options, fetch: fetcher({ ...data(), news: [{ companyId: 'iss_cik_0000000001' }] }) })).reason, 'SECTION_IDENTITY_MISMATCH'); });
test('estimated date cannot appear confirmed', async () => { const d = data(); d.events = [{ companyId: cid, eventType: 'EARNINGS_ESTIMATED', confirmationStatus: 'CONFIRMED', dateStart: '2026-11-01', dateEnd: '2026-11-07' }]; assert.equal((await load('AAPL', { ...options, fetch: fetcher(d) })).reason, 'INVALID_CALENDAR_CONFIDENCE'); d.events[0] = { ...d.events[0], confirmationStatus: 'ESTIMATED', dateStart: '2026-02-30' }; assert.equal((await load('AAPL', { ...options, fetch: fetcher(d) })).reason, 'INVALID_CALENDAR_CONFIDENCE'); });
test('future/invalid generation dates and enormous sections are rejected', async () => { for (const generatedAt of ['invalid', '2026-12-01T00:00:00Z', '2026-10-01']) assert.equal((await load('AAPL', { ...options, fetch: fetcher({ ...data(), generatedAt }) })).reason, 'INVALID_TIMESTAMP'); assert.equal((await load('AAPL', { ...options, fetch: fetcher({ ...data(), news: Array(201).fill({ companyId: cid }) }) })).reason, 'INVALID_SECTIONS'); });
test('external HTML is never rendered as markup and unsafe URLs rejected', () => { for (const u of ['javascript:alert(1)', 'data:text/html,hello', 'https://u:p@example.com/']) assert.equal(safeLink(u), null); assert.equal(safeLink('https://example.com/a'), 'https://example.com/a'); const js = readFileSync(new URL('../../../company-intelligence/preview.js', import.meta.url), 'utf8'); assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(js)); });

test('sharded ticker lookup loads only requested prefix and validates generation', async () => {
  const generation = 'b'.repeat(24), calls = [];
  const fetch = async path => { calls.push(path); return { ok: true, json: async () => path.endsWith('index.json') ? { schema: SCHEMA, state: 'PREVIEW', generation, lookupShards: ['AA'] } : path.includes('/lookup/') ? { schema: SCHEMA, generation, tickers: { AAPL: [{ companyId: cid, instrumentId: iid }] }, companies: { [cid]: 'snapshots/' + generation + '/' + cid + '.json' } } : data() }; };
  assert.equal((await load('AAPL', { ...options, fetch })).state, 'AVAILABLE');
  assert.equal(calls.length, 3); assert.ok(calls[1].endsWith('/lookup/AA.json'));
  const mismatch = async path => ({ ok: true, json: async () => path.endsWith('index.json') ? { schema: SCHEMA, state: 'PREVIEW', generation, lookupShards: ['AA'] } : { schema: SCHEMA, generation: 'a'.repeat(24) } });
  assert.equal((await load('AAPL', { ...options, fetch: mismatch })).reason, 'LOOKUP_GENERATION_MISMATCH');
  const stalePath = async path => ({ ok: true, json: async () => path.endsWith('index.json') ? { schema: SCHEMA, state: 'PREVIEW', generation, lookupShards: ['AA'] } : { schema: SCHEMA, generation, tickers: { AAPL: [{ companyId: cid, instrumentId: iid }] }, companies: { [cid]: 'snapshots/' + 'c'.repeat(24) + '/' + cid + '.json' } } });
  assert.equal((await load('AAPL', { ...options, fetch: stalePath })).reason, 'LOOKUP_GENERATION_MISMATCH');
});

test('an expired cached public snapshot fails closed rather than presenting old news as current', async()=>{
 const result=await load('AAPL',{...options,now:'2026-10-10T00:00:00Z',fetch:fetcher()});
 assert.equal(result.state,'UNAVAILABLE');assert.equal(result.reason,'SNAPSHOT_EXPIRED');
});

function profile() { return {schema:'company-profile-1.0.0',state:'AVAILABLE',companyId:cid,companyName:'Apple Inc.',description:'Apple Inc. designs and manufactures smartphones, computers and wearable devices.',language:'en',confidence:'HIGH',lastVerifiedAt:'2026-10-01T11:00:00Z',businessActivities:['Apple Inc. designs and manufactures electronic products.'],productsServices:[],customerMarkets:[],majorSegments:[],officialWebsite:'https://www.apple.com/',sources:[{companyId:cid,type:'SEC',url:'https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/annual.htm',form:'10-K',contentHash:'a'.repeat(64)}]}; }
test('prepared company profiles load without additional requests and preserve old profile-free payloads', async()=>{
 let requests=0; const p={...data(),companyProfile:profile()},inner=fetcher(p);
 const loaded=await load('AAPL',{...options,fetch:async url=>{requests++;return inner(url)}});
 assert.equal(loaded.companyProfile.description,p.companyProfile.description);assert.equal(requests,2);
 assert.equal((await load('AAPL',{...options,fetch:fetcher()})).state,'AVAILABLE');
});
test('wrong issuer, private source, malformed facts and wrong SEC CIK invalidate a profile', async()=>{
 for(const mutate of [p=>p.companyId='iss_cik_0000000001',p=>p.sources[0].companyId='iss_cik_0000000001',p=>p.sources[0].url='http://127.0.0.1/file',p=>p.sources[0].url=p.sources[0].url.replace('/320193/','/1/'),p=>p.description='x'.repeat(1201),p=>p.businessActivities=['x'.repeat(701)],p=>p.lastVerifiedAt='2026-10-02T00:00:00Z',p=>p.sources=[]]) {
  const companyProfile=profile();mutate(companyProfile);
  assert.equal((await load('AAPL',{...options,fetch:fetcher({...data(),companyProfile})})).reason,'INVALID_COMPANY_PROFILE');
 }
});

test('issuer data with a different preparation timestamp cannot join the current index',async()=>{
 const result=await load('AAPL',{...options,fetch:fetcher(data(),{generatedAt:'2026-10-01T11:00:00Z'})});
 assert.equal(result.reason,'COMPANY_GENERATION_MISMATCH');
});
