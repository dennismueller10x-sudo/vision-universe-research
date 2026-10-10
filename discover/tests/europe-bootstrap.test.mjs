import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import vm from 'node:vm';
const source=await readFile(new URL('../engines/europe-bootstrap.js',import.meta.url),'utf8');
const digest=value=>createHash('sha256').update(value).digest('hex');
function fixture(fetch,extra={}){const context={module:{exports:{}},crypto:webcrypto,URL,TextDecoder,fetch,...extra};vm.runInNewContext(source,context);return context.module.exports;}
const rights={display:true,commercial:true,evidenceRef:'owner-attestation-fixture',dataPaths:['IDENTITY','RAW_EOD']};
test('public bootstrap permits only canonical local data and the exact rights registry',()=>{
  const api=fixture();assert.equal(api.localURL('/discover/data/europe/catalog.json'),'/discover/data/europe/catalog.json');
  assert.equal(api.localURL('/core/rights/marketstack-display.json'),'/core/rights/marketstack-display.json');
  for(const value of ['https://api.marketstack.com/v2/eod','//example.com/discover/data/europe/x','/discover/data/europe/../../quant/data/x','/discover/data/europe/%2e%2e/x','/discover/data/europe/x?key=secret','/core/rights/other.json'])assert.throws(()=>api.localURL(value));
});
test('public bootstrap requires display and commercial identity/close rights only',()=>{
  const api=fixture();assert.equal(api.validRights(rights),true);
  for(const invalid of [{...rights,display:false},{...rights,commercial:false},{...rights,evidenceRef:''},{...rights,dataPaths:['IDENTITY']},{...rights,dataPaths:[...rights.dataPaths,'QUANT']}])assert.equal(api.validRights(invalid),false);
  assert.throws(()=>api.create({publicationAllowed:false,rights,catalog:{},series:{},rightsEvidence:{url:'/core/rights/marketstack-display.json',sha256:'a'.repeat(64)}}));
  assert.throws(()=>api.create({publicationAllowed:true,rights:{},catalog:{},series:{}}));
});
test('canonical artifact bytes must match the producer SHA before JSON is usable',async()=>{
  const bytes=Buffer.from('{"securities":[]}\n'),requests=[];
  const api=fixture(async(url,options)=>{requests.push({url,options});return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};});
  const actual=await api.read({url:'/discover/data/europe/catalog.json',sha256:digest(bytes)});assert.equal(actual.securities.length,0);assert.equal(requests[0].options.credentials,'same-origin');
  await assert.rejects(api.read({url:'/discover/data/europe/catalog.json',sha256:'0'.repeat(64)}),/HASH_MISMATCH/);
});
test('an unavailable artifact never becomes a fallback chart or public catalog',async()=>{
  const api=fixture(async()=>({ok:false}));await assert.rejects(api.read({url:'/discover/data/europe/catalog.json',sha256:'a'.repeat(64)}),/UNAVAILABLE/);
});
test('missing or malformed hashes are rejected before any fetch',async()=>{
  let requests=0;const api=fixture(async()=>{requests++;throw Error();});
  for(const sha256 of ['', 'a'.repeat(63),'g'.repeat(64)])await assert.rejects(api.read({url:'/discover/data/europe/catalog.json',sha256}),/HASH_REQUIRED/);
  assert.equal(requests,0);
});

test('verified owner registry must match the manifest authorization and normalized display scope',()=>{
  const api=fixture(),registry={schema:'vu-marketstack-display-rights-1',status:'CONFIRMED_BY_OWNER',source:'OWNER_ATTESTATION',permittedUse:'NORMALIZED_PRODUCT_DISPLAY',rawRedistribution:false,...rights};
  assert.equal(api.boundRights(registry,rights),true);
  for(const registryChange of [{status:'UNKNOWN'},{source:'PROVIDER_PLAN_DESCRIPTION'},{evidenceRef:'unbound'},{rawRedistribution:true},{permittedUse:'RAW_DOWNLOAD'},{dataPaths:['IDENTITY']}])assert.equal(api.boundRights({...registry,...registryChange},rights),false);
});

test('published security and series sets match exactly without cross-region records',()=>{
  const api=fixture(),catalog={securities:[{region:'EUROPE',securityId:'eu_one'},{region:'EUROPE',securityId:'eu_two'}]},manifest={securityCount:2,series:{eu_one:{},eu_two:{}}};
  assert.equal(api.validateCatalog(manifest,catalog).length,2);
  for(const change of [{securityCount:3},{series:{eu_one:{}}},{series:{...manifest.series,us_extra:{}}}])assert.throws(()=>api.validateCatalog({...manifest,...change},catalog));
  assert.throws(()=>api.validateCatalog(manifest,{securities:[catalog.securities[0],catalog.securities[0]]}));
  assert.throws(()=>api.validateCatalog(manifest,{securities:[catalog.securities[0],{region:'US',securityId:'eu_two'}]}));
});


test('startup without the exact publication registration never requests an absent Europe manifest',async()=>{
  for(const domains of [[],[{id:'europeDiscoverDisplay',artifact:'/discover/data/europe/manifest.json',producer:'other-producer'}],[{id:'europeDiscoverDisplay',artifact:'/other/manifest.json',producer:'scripts/marketstack/europe-discover-publication.mjs'}],undefined]){
    const requests=[],events=[],state={};
    const api=fixture(async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({domains})};},{VUDiscover:state,document:{dispatchEvent:event=>events.push(event)},location:{hash:''},Event});
    assert.equal(await api.start(),null);assert.deepEqual(requests.map(r=>r.url),['/core/registry/domains.json']);assert.equal(requests[0].options.credentials,'same-origin');assert.equal(events.length,0);assert.equal(state.europePublicLoader,undefined);
  }
  const requests=[],api=fixture(async url=>{requests.push(url);return {ok:false};});assert.equal(await api.start(),null);assert.deepEqual(requests,['/core/registry/domains.json']);
});

test('registered publication starts the existing rights-gated public loader',async()=>{
  const requests=[],events=[],state={},registry={domains:[{id:'europeDiscoverDisplay',artifact:'/discover/data/europe/manifest.json',producer:'scripts/marketstack/europe-discover-publication.mjs'}]};
  const manifest={publicationAllowed:true,rights,catalog:{},calendar:{},series:{},rightsEvidence:{url:'/core/rights/marketstack-display.json'}};
  const api=fixture(async url=>{requests.push(url);return {ok:true,json:async()=>url==='/core/registry/domains.json'?registry:manifest};},{VUDiscover:state,document:{dispatchEvent:event=>events.push(event)},location:{hash:''},Event});
  const loader=await api.start();assert.equal(typeof loader.connect,'function');assert.equal(state.europePublicLoader,loader);assert.deepEqual(requests,['/core/registry/domains.json','/discover/data/europe/manifest.json']);assert.equal(events[0].type,'vu-europe-available');
});
