import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSearchIndex, compactSearchListing, SEARCH_PAGE_MAX_BYTES } from '../../scripts/universe/build-global-market.mjs';
const Directory=createRequire(import.meta.url)('../engines/instrument-directory.js');
const row=(number, extra={})=>({listingId:'vu_'+number.toString(16).padStart(8,'0'),ticker:'EQ'+number,companyName:'Listing '+number,mic:'XETR',exchange:'XETRA',assetType:'EQUITY',listingType:'UNKNOWN',tradingCurrency:'EUR',listingCountry:'DE',listingRegion:'EUROPE',country:null,region:null,active:true,...extra});
function directory(rows,index=buildSearchIndex(rows)) {
 const paths=[],payloads=new Map([...index.files].map(([path,value])=>['/global/'+path,value]));
 payloads.set('/global/manifest.json',{schemaVersion:'global-market-1.0.0',searchShards:index.shards,instrumentShards:['EQ','SA']});
 payloads.set('/global/instruments/SA.json',{instruments:rows.filter(r=>r.ticker.startsWith('SA'))});
 return {paths,payloads,dir:Directory.create({extensionBase:'/global/',loadJSON:async path=>{paths.push(path);if(!payloads.has(path))throw Error('Unexpected path:'+path);return payloads.get(path);}})};
}
test('compact search records preserve delivered capabilities without leaking prices or provenance',async()=>{
 const source=row(1,{price:{value:12,asOf:'2026-09-30'},coverage:{price_history:'PARTIAL'},historyPath:'history/vu_00000001.json',source:{largePrivateResponse:true},quality:{privateDiagnostics:true}});
 const compact=compactSearchListing(source);
 assert.equal(compact.country,null);assert.equal(compact.region,null);assert.equal(compact.price,undefined);assert.equal(compact.source,undefined);assert.equal(compact.quality,undefined);assert.equal(compact.historyPath,undefined);
 const {dir}=directory([source]);const hit=(await dir.search('EQ1',{extensionOnly:true})).entries[0];
 assert.equal(dir.capabilities(hit).HAS_PRICE_HISTORY,true);assert.equal(dir.capabilities(hit).HAS_PRICE_SNAPSHOT,true);assert.equal(dir.capabilities(hit).HAS_LIVE,false);assert.equal(dir.capabilities(hit).HAS_FUNDAMENTALS,false);
});
test('heavy geography search loads bounded compact pages and explicitly reports more candidates',async()=>{
 const rows=Array.from({length:2500},(_,i)=>row(i));const index=buildSearchIndex(rows),{dir,paths}=directory(rows,index);
 assert.equal(index.files.get('search/EU.json').schemaVersion,'global-search-pages-1.0.0');
 for(const [path,payload]of index.files)if(/\/\d{4}\.json$/.test(path))assert(Buffer.byteLength(JSON.stringify(payload)+'\n')<=SEARCH_PAGE_MAX_BYTES,path);
 const result=await dir.search('Europe',{extensionOnly:true,listingRegion:'EUROPE',limit:14});
 assert.equal(result.entries.length,14);assert.equal(result.truncated,true);
 assert.equal(paths.filter(path=>/search\/EU\/\d{4}\.json$/.test(path)).length,1);assert(!paths.some(path=>path.endsWith('listings.json')||path.includes('/history/')||path.includes('/instruments/')));
 const count=paths.length;await dir.search('Europe',{extensionOnly:true,listingRegion:'EUROPE',limit:14});assert.equal(paths.length,count);
});
test('specific ticker, ISIN, accented name and venue metadata are found beyond the first heavy page',async()=>{
 const special=row(9999,{ticker:'SAP',companyName:'Nestlé SAP Example',isin:'DE0007164600'});
 const rows=Array.from({length:2000},(_,i)=>row(i,{ticker:'SA'+String(i).padStart(5,'0'),companyName:'Nestle '+i,isin:'DE'+String(i).padStart(10,'0')})).concat(special);
 const {dir,paths}=directory(rows);
 for(const query of ['SAP','DE0007164600','Nestlé SAP']){
  const result=await dir.search(query,{extensionOnly:true,limit:14});assert(result.entries.some(r=>r.listingId===special.listingId),query);
 }
 const instrument=await dir.getInstrument({symbol:'SAP',listingId:special.listingId,universeId:'GLOBAL_MARKET'});assert.equal(instrument.instrument.listingId,special.listingId);
 assert(paths.includes('/global/instruments/SA.json'),'Exact identity must retain full canonical instrument path');
});
test('paged extension rejects path traversal and impossible geography without requesting pages',async()=>{
 const {dir,paths,payloads}=directory([row(1)]);payloads.set('/global/search/EU.json',{schemaVersion:'global-search-pages-1.0.0',pages:[{path:'../private.json',firstTerm:'EUROPE',lastTerm:'EUROPE',listingCountries:['DE'],listingRegions:['EUROPE']},{path:'EU/0000.json',firstTerm:'EUROPE',lastTerm:'EUROPE',listingCountries:['FR'],listingRegions:['EUROPE']}]});
 const result=await dir.search('Europe',{extensionOnly:true,listingCountry:'DE',limit:14});assert.equal(result.entries.length,0);assert(!paths.some(path=>path.includes('private')||/\/\d{4}\.json$/.test(path)));
});
test('page ordering is deterministic and small legacy-style extension shards remain readable',async()=>{
 const rows=Array.from({length:400},(_,i)=>row(i)),forward=buildSearchIndex(rows),reverse=buildSearchIndex([...rows].reverse());
 assert.deepEqual(forward.files.get('search/EU.json'),reverse.files.get('search/EU.json'));
 const {dir}=directory([row(1)]);assert.equal((await dir.search('EQ1',{extensionOnly:true})).entries[0].s,'EQ1');
});

test('exact ticker page precedes hundreds of broad company-name token matches',async()=>{
 const exact=row(9999,{ticker:'CO',companyName:'CO Inc'});
 const rows=Array.from({length:350},(_,i)=>row(i,{ticker:'AAA'+String(i).padStart(4,'0'),companyName:'CO Group'})).concat(exact);
 const {dir,paths}=directory(rows),result=await dir.search('CO',{extensionOnly:true,limit:14});
 assert.equal(result.entries[0].s,'CO');assert.equal(result.entries[0].listingId,exact.listingId);
 assert(paths.filter(path=>/search\/CO\/\d{4}\.json$/.test(path)).length<=2,'Exact lookup must retain bounded page requests');
});

test('an unverified preferred hint displays generic equity rather than verified common stock',async()=>{
 const {dir}=directory([row(1,{listingType:'PREFERRED_HINT'})]);const entry=(await dir.search('EQ1',{extensionOnly:true})).entries[0];assert.equal(entry.t,'EQUITY');assert.notEqual(entry.t,'COMMON_STOCK');
});
