import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),Service=require('../api/product-services.js'),Policy=require('../engines/display-policy.js'),Query=require('../engines/query.js');
const root=new URL('../../',import.meta.url);
function api(mutate=()=>{},reads=[]){return Service.create({loadJSON:async p=>{reads.push(p);const d=JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));mutate(p,d);return d;},displayPolicy:Policy,queryEngine:Query});}
test('canonical search resolves stable identities beyond the five-row panel without financial reads',async()=>{
 const reads=[],service=api(()=>{},reads),r=await service.searchInstruments('TSLA');assert.equal(r.state,'AVAILABLE');const hit=r.entries.find(e=>e.ticker==='TSLA');assert.match(hit.securityId,/^vu_/);assert.equal(hit.masterMemberId,'ref_TSLA');assert.ok(reads.every(p=>p.startsWith('/quant/data/universe/')));assert.ok(reads.length<15);
 const stock=await service.getStockIntelligence('TSLA');assert.equal(stock.securityId,hit.securityId);assert.equal(stock.identityState,'AVAILABLE');assert.equal(stock.state,'UNAVAILABLE');assert.equal(stock.reason,'PARTIAL_PRODUCT_DATA');assert.equal(stock.availability.history.state,'AVAILABLE');assert.equal(stock.availability.fundamentals.state,'AVAILABLE');assert.equal(stock.availability.marketFactors.state,'AVAILABLE');assert.ok('liveSnapshot' in stock.availability);assert.equal('realtime' in stock.availability,false);assert.deepEqual(stock.availability.quant,{state:'UNAVAILABLE',reason:'BROAD_RANKING_NOT_CERTIFIED'});const universe=await service.getUniverse();assert.equal(universe.stocks.length,5);assert.equal(universe.productCapabilityState,'AVAILABLE');assert.ok(universe.productUniverseSize>6000);assert.equal(universe.productUniverseSize,universe.capabilityCounts.productUniverse);assert.equal(universe.scope,'FEATURED_FULL_INTELLIGENCE_SET');
});
test('missing issuer/CIK does not remove an eligible security from search or identity page',async()=>{
 const service=api((p,d)=>{if(p.includes('/instruments/'))for(const i of d.instruments){i.cik=null;i.issuerId=null;}}),r=await service.searchInstruments('TSLA');assert.ok(r.entries.some(e=>e.ticker==='TSLA'));const stock=await service.getStockIntelligence('TSLA');assert.equal(stock.identityState,'AVAILABLE');assert.equal(stock.issuerId,null);
});
test('excluded, unknown and corrupted identities never appear in search or stock identity',async()=>{
 for(const mutate of [i=>i.productEligibility='EXCLUDED',i=>i.productEligibility='UNKNOWN',i=>i.legacyIds=[],i=>i.instrumentId='sec_TSLA']){
 const service=api((p,d)=>{if(p.includes('/instruments/'))d.instruments.filter(i=>i.symbol==='TSLA').forEach(mutate);});assert.ok(!(await service.searchInstruments('TSLA')).entries.some(e=>e.ticker==='TSLA'));assert.equal((await service.getStockIntelligence('TSLA')).reason,'INVALID_IDENTITY');}
});
test('directory failure differs from a successful empty search; no mock fallback',async()=>{
 const service=api(p=>{if(p.includes('/search/sym/'))throw Error('offline');});assert.equal((await service.searchInstruments('TSLA')).state,'SOURCE_MISSING');const empty=await api().searchInstruments('ZZZZZZZZZZZZZZ');assert.equal(empty.state,'AVAILABLE');assert.deepEqual(empty.entries,[]);
});
test('search deduplicates canonical member identities and enforces bounded results',async()=>{
 const result=await api().searchInstruments('COHR',{limit:12});assert.equal(result.entries.filter(x=>x.ticker==='COHR').length,1);assert.equal(new Set(result.entries.map(x=>x.masterMemberId)).size,result.entries.length);const bounded=await api().searchInstruments('AA',{limit:1});assert.ok(bounded.entries.length<=1);
});
test('search UI ignores stale asynchronous results and displays loading, empty and error states',async()=>{
 const source=await readFile(new URL('vu2/experience.js',root),'utf8');const code=source.slice(source.indexOf('function openSearch(){'),source.indexOf("document.addEventListener('keydown'"));
 const nodes=[];function el(tag,props={},children=[]){const n={tag,...props,children:[...children],value:'',listeners:{},append(...x){this.children.push(...x);},addEventListener(k,f){this.listeners[k]=f;},focus(){}};nodes.push(n);return n;}
 const pending=[],dialog={open:false,children:[],append(...x){this.children.push(...x);},showModal(){this.open=true;},close(){this.open=false;},querySelector(){return nodes.find(n=>n.tag==='input');}};
 const context={el,dialog,groups:[],S:{clear:n=>n.children=[]},link:(label,url)=>({label,url}),href:(v,t)=>v+'/'+t,api:{searchInstruments:q=>new Promise(resolve=>pending.push({q,resolve}))}};vm.runInNewContext(code+';openSearch();',context);
 const input=nodes.find(n=>n.tag==='input'),status=nodes.find(n=>n.role==='status'),results=nodes.find(n=>n.class==='search-results links');
 input.value='TSLA';const first=input.listeners.input();assert.match(status.textContent,/gesucht/);input.value='MSFT';const second=input.listeners.input();pending[1].resolve({state:'AVAILABLE',entries:[{ticker:'MSFT',name:'Microsoft'}]});await second;pending[0].resolve({state:'AVAILABLE',entries:[{ticker:'TSLA',name:'Tesla'}]});await first;assert.equal(results.children[0].label,'MSFT · Microsoft');
 input.value='none';const third=input.listeners.input();pending[2].resolve({state:'AVAILABLE',entries:[]});await third;assert.match(status.textContent,/Keine passenden/);
 input.value='failed';const fourth=input.listeners.input();pending[3].resolve({state:'SOURCE_MISSING',entries:[]});await fourth;assert.match(status.textContent,/derzeit nicht verfügbar/);
});

test('identity-only stock does not request the unrelated five-company financial panel',async()=>{
 const reads=[],service=api(p=>{if(p.endsWith('quant-factor-inputs.json'))throw Error('panel offline');},reads);
 const stock=await service.getStockIntelligence('TSLA');assert.equal(stock.identityState,'AVAILABLE');assert.equal(stock.ticker,'TSLA');assert.equal(stock.reason,'PARTIAL_PRODUCT_DATA');assert.ok(!reads.some(p=>p.endsWith('quant-factor-inputs.json')));assert.ok(reads.some(p=>p.endsWith('capabilities-v1.json')));
});
test('config and connected-panel failures preserve independent canonical identity with typed availability',async()=>{
 for(const failed of ['/quant/config/development-preview.json','/quant/config/feature-gates.json','/quant/data/sec/quant-factor-inputs.json']){
  const ticker=failed.endsWith('quant-factor-inputs.json')?'NVDA':'TSLA',service=api(p=>{if(p===failed)throw Error('offline');});
  const stock=await service.getStockIntelligence(ticker);assert.equal(stock.identityState,'AVAILABLE',failed);assert.equal(stock.ticker,ticker);assert.match(stock.securityId,/^vu_/);assert.equal(stock.state,'UNAVAILABLE');assert.equal(stock.reason,'SOURCE_MISSING');
  for(const status of Object.values(stock.availability)){assert.equal(status.state,'UNAVAILABLE');assert.equal(status.reason,'SOURCE_MISSING');}
  assert.equal(stock.price,undefined);assert.equal(stock.chart,undefined);
 }
});
