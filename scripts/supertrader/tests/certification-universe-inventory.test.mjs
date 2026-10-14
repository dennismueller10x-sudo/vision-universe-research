import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {certifyHistoricalIdentity,listingAtDate,certifyUniversePanel} from '../research/certification/universe-certification.mjs';
import {collectDataInventory,sealInventory} from '../research/certification/data-inventory.mjs';
import {decryptSealed} from '../validation/lib.mjs';
const window={warmupFrom:'2015-01-01',from:'2018-01-02',to:'2026-09-30'};
const old={id:'tiingo:NASDAQ:ABC:2016-01-01',ticker:'ABC',exchange:'NASDAQ',startDate:'2016-01-01',listEnd:'2019-12-31',reusedLater:true};
const next={id:'tiingo:NASDAQ:ABC:2021-01-01',ticker:'ABC',exchange:'NASDAQ',startDate:'2021-01-01',active:true};
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function link(overrides={}){
 const assertions={listingId:old.id,securityId:'ref_ABC',ticker:'ABC',cik:'0000000001',issuerId:'iss_cik_0000000001',relationship:'ISSUER_SECURITY',admissionConfirmed:true,validFrom:'2016-01-01',validTo:'2019-12-31',knownFrom:'2016-01-01',instrumentType:'COMMON_STOCK',historicalClassConfirmed:true,issuerStructure:'SINGLE_CLASS',classRosterComplete:true,classRosterScope:'ALL_ISSUER_COMMON_EQUITY_CLASSES',classListingIds:[old.id],...overrides};
 return {type:'HISTORICAL_ISSUER_SECURITY_LINK',historical:true,assertions,officialSource:{url:'https://www.sec.gov/Archives/edgar/data/1/source.htm',locator:'reviewed historical security cover-page link',sha256:'a'.repeat(64)},review:{status:'PASS',reviewer:'independent-fixture-review',reviewedAt:'2026-10-12',assertionHash:hash(assertions)}};
}
function fixture(extra={}){
 const calls=[],objects=new Map();
 const p='v1/tiingo-delisted/daily/US/';
 const docs={universe:{securities:[{ticker:'ABC',active:true,startDate:'2021-01-01'}]},eligibility:{decisions:[{ticker:'ABC',instrument_type:'EQUITY_COMMON'}]},companies:{asOf:'2026-10-12',rows:[{ticker:'ABC',cik:'0000000002',companyName:'New Company'}]},consumerIndex:{byTicker:{ABC:{cik:'0000000002'}}}};
 const listingRows=[{ticker:'ABC',exchange:'NASDAQ',assetType:'Stock',priceCurrency:'USD',startDate:'2016-01-01',endDate:'2019-12-31'},{ticker:'ABC',exchange:'NASDAQ',assetType:'Stock',priceCurrency:'USD',startDate:'2021-01-01',endDate:''},...extra.rows||[]];
 const json=(key,value)=>objects.set(key,key.endsWith('.gz')?zlib.gzipSync(Buffer.from(JSON.stringify(value))):Buffer.from(JSON.stringify(value)));
 json(p+'_validation/manifest.json.gz',{entries:{[old.id]:{status:'OK',included:true,cls:'EQUITY_COMMON',name:'Old Company'}}});
 json(p+'_validation/sec-pit-r13.json.gz',{[old.id]:{cik:'0000000001',how:'NAME_MATCH',eps:[[ '2018-12-31',1,'2019-02-01',false]],rev:[],shares:[['2018-12-31',123,'2019-02-01','dei'],['2019-03-31',124,'2019-05-01','wadso']]}});
 json(p+'_validation/sec-delist-r13.json.gz',{[old.id]:{cik:'0000000001',listEnd:'2019-12-31',cls:'ACQUISITION',evidence:[['DEFM14A','2019-12-01']]}});
 json('v1/sec/fundamentals/_manifest.json',{objectCount:1});json('v1/sec/fundamentals/_index.json.gz',extra.secIndex||{objects:{'0000000001':{key:'v1/sec/fundamentals/facts/0000000001.json.gz',annualTimelines:2}}});
 json('v1/sec/fundamentals/facts/0000000001.json.gz',{cik:'0000000001',profile:{tickers:['ABC']},factbook:{timelines:[]}});
 const driver={kind:'fixture',async get(k){calls.push({op:'GET',key:k});return objects.get(k)||null;},async put(){throw Error('WRITE_FORBIDDEN');},async list(){throw Error('LIST_FORBIDDEN');}};
 return {options:{documents:docs,listingRows,driver,protocol:{window},observedAt:'2026-10-12T12:00:00Z'},calls,objects,p};
}
test('provider counts and observed date intervals never establish a PIT market denominator',()=>{
 const x=certifyUniversePanel({listings:[old,next],providerRows:Array(100),window,asOf:'2026-10-12'});
 assert.equal(x.state,'OBSERVED_ONLY');assert.equal(x.marketDenominator,null);assert.equal(x.coveragePercentage,null);assert.equal(x.counts.observedListingGenerations,2);assert.equal(x.counts.providerListingRecords,100);
 assert.equal(listingAtDate(old,'2018-01-02').admissible,false);
});
test('current profiles and later ticker generation cannot certify historical issuer mapping',()=>{
 const current={...link(),sourceSnapshotScope:'CURRENT_ONLY'};
 assert.equal(certifyHistoricalIdentity(old,[current],'2018-01-02').status,'UNVERIFIED');
 assert.equal(certifyHistoricalIdentity(next,[link()],'2022-01-03').status,'UNVERIFIED');
 assert.equal(certifyHistoricalIdentity(old,[link({securityId:'ref_OTHER'})],'2018-01-02').status,'UNVERIFIED');
});
test('a reviewed original historical link respects formation availability and class roster',()=>{
 const x=certifyHistoricalIdentity(old,[link()],'2018-01-02');assert.equal(x.status,'VERIFIED');assert.equal(x.issuerStructure,'SINGLE_CLASS');assert.equal(x.instrumentType,'COMMON_STOCK');assert.equal(x.availabilityResolution,'UTC_DAY_END_CONSERVATIVE_BOUND');assert.equal(x.originalKnownFromDate,'2016-01-01');
 assert.equal(listingAtDate(old,'2016-01-01',x).admissible,false);assert.equal(listingAtDate(old,'2018-01-02',x).admissible,true);
 assert.equal(certifyHistoricalIdentity(old,[link({classListingIds:[old.id,'another-class']})],'2018-01-02').issuerStructure,'UNKNOWN');
 assert.equal(certifyHistoricalIdentity(old,[link({historicalClassConfirmed:false})],'2018-01-02').instrumentType,'UNKNOWN');
 assert.equal(certifyHistoricalIdentity(old,[link(),link({cik:'0000000002',issuerId:'iss_cik_0000000002'})],'2018-01-02').reason,'CONFLICTING_HISTORICAL_ISSUER_LINKS');
});
test('PIT_COMPLETE requires exact unique ordered dates from a separate reviewed official formation calendar',()=>{
 const narrow={from:'2018-01-02',to:'2018-01-03'},source={url:'https://www.nyse.com/official-calendar',locator:'reviewed session membership',sha256:'d'.repeat(64)};
 const assertions={scope:'US_EXCHANGE_COMMON_ADR_REIT',from:narrow.from,to:narrow.to,formationDates:['2018-01-02'],completeFormationCalendar:true,listingIdsByDate:{'2018-01-02':[old.id],'2018-01-03':[old.id]}};
 const pop={status:'REVIEWED_COMPLETE_OFFICIAL_POPULATION',assertions,officialSource:source,review:{status:'PASS',reviewer:'fixture',reviewedAt:'2026-10-12',assertionHash:hash(assertions)}};
 const c={from:narrow.from,to:narrow.to,dates:['2018-01-02','2018-01-03']},calendar={status:'REVIEWED_OFFICIAL_FORMATION_CALENDAR',assertions:c,officialSource:source,review:{status:'PASS',reviewer:'calendar-fixture',reviewedAt:'2026-10-12',assertionHash:hash(c)}};
 const opts={listings:[old],identityEvidence:[link()],populationEvidence:pop,window:narrow,asOf:'2026-10-12'};
 assert.equal(certifyUniversePanel(opts).populationEvidence.reason,'INDEPENDENT_FORMATION_CALENDAR_MISSING');
 assert.equal(certifyUniversePanel({...opts,expectedFormationCalendar:calendar}).populationEvidence.reason,'OFFICIAL_FORMATION_CALENDAR_MISMATCH');
 assertions.formationDates=[...c.dates];pop.review.assertionHash=hash(assertions);assert.equal(certifyUniversePanel({...opts,expectedFormationCalendar:calendar}).state,'PIT_COMPLETE');
 c.dates=['2018-01-02','2018-01-02'];calendar.review.assertionHash=hash(c);assert.equal(certifyUniversePanel({...opts,expectedFormationCalendar:calendar}).state,'PIT_PARTIAL');
});
test('exact UTC evidence stays exact while invalid or rolled-over publication times cannot admit a source',()=>{
 const e=link({knownFrom:'2016-01-01T19:03:04Z'});e.review.reviewedAt='2026-10-12T12:00:00Z';const c=certifyHistoricalIdentity(old,[e],'2018-01-02');assert.equal(c.status,'VERIFIED');assert.equal(c.knownFrom,'2016-01-01T19:03:04Z');assert.equal(c.originalKnownFromDate,'2016-01-01');assert.equal(c.availabilityResolution,'UTC_EXACT');
 assert.equal(certifyHistoricalIdentity(old,[link({knownFrom:'2016-01-01T24:00:00Z'})],'2018-01-02').status,'UNVERIFIED');
 assert.equal(certifyHistoricalIdentity(old,[link({classRosterScope:'CURRENT_US_LISTINGS_ONLY'})],'2018-01-02').issuerStructure,'UNKNOWN');
});
test('active provider last-data dates are retained as source endpoints, not inferred delistings',async()=>{
 const f=fixture();f.options.listingRows[1].endDate='2026-10-09';const x=await collectDataInventory(f.options),r=x.privateInput.observedListings.find(r=>r.listing.id===next.id);
 assert.equal(r.listing.active,true);assert.equal(r.listing.endDate,null);assert.equal(r.listing.observedSourceEndDate,'2026-10-09');assert.equal(x.privateInput.certification.counts.closedObservedListings,1);
});
test('unreviewed or scope-incomplete population claims never become PIT_COMPLETE',()=>{
 const x=certifyUniversePanel({listings:[old],identityEvidence:[link()],populationEvidence:{status:'REVIEWED_COMPLETE_OFFICIAL_POPULATION',formationDates:['2018-01-02']},window,asOf:'2026-10-12'});
 assert.equal(x.state,'PIT_PARTIAL');assert.equal(x.marketDenominator,null);
});
test('compact inventory preserves legacy shares, CIK conflicts and delisting hints without promotion',async()=>{
 const f=fixture(),x=await collectDataInventory(f.options),a=x.privateInput.observedListings.find(r=>r.listing.id===old.id);
 assert.equal(x.publicStatus.universeState,'OBSERVED_ONLY');assert.equal(a.cikObservations.legacyPitCik,'0000000001');assert.equal(a.cikObservations.currentCompanyCik,'0000000002');assert.equal(a.cikObservations.currentJoinAppliedHistorically,false);assert.equal(a.historicalIssuerIdentity.status,'UNVERIFIED');
 assert.deepEqual(a.legacySecInputs.shares,[['2018-12-31',123,'2019-02-01','dei'],['2019-03-31',124,'2019-05-01','wadso']]);assert.equal(a.observedDelistingHint.certification,'CLASS_HINT_ONLY_PROCEEDS_NOT_OBSERVED');
 assert.equal(x.canonicalData,null);assert.equal(JSON.stringify(x.privateInput).includes('"close"'),false);assert.equal(x.publicStatus.performanceCalculated,false);
 assert.equal(x.publicStatus.counts.writeCalls,0);assert.equal(f.calls.every(c=>c.op==='GET'),true);assert.equal(x.publicStatus.counts.readOnlyGetCalls,f.calls.length);
});
test('unsupported source ticker is rejected before listing construction without alias invention',async()=>{
 const f=fixture({rows:[{ticker:'-P-HIZ',exchange:'NASDAQ',assetType:'Stock',priceCurrency:'USD',startDate:'2016-01-01',endDate:'2018-01-01'}]}),x=await collectDataInventory(f.options);
 assert.equal(x.publicStatus.counts.sourceRowsRejected,1);assert.equal(x.privateInput.observedListings.length,2);assert.equal(f.calls.some(c=>c.key.includes('HIZ')),false);
});
test('source records absent from observed listing table are preserved separately rather than dropped or alias joined',async()=>{
 const f=fixture(),foreign='tiingo:NASDAQ:OLD_SOURCE:2010-01-01';f.objects.set(f.p+'_validation/sec-pit-r13.json.gz',zlib.gzipSync(Buffer.from(JSON.stringify({[foreign]:{cik:'0000000003',shares:[['2013-12-31',17,'2014-02-01','dei']]}}))));f.objects.set(f.p+'_validation/sec-delist-r13.json.gz',zlib.gzipSync(Buffer.from(JSON.stringify({[foreign]:{cls:'UNKNOWN',evidence:[]}}))));const x=await collectDataInventory(f.options);
 assert.deepEqual(x.privateInput.unmatchedLegacySecInputs[foreign].shares,[['2013-12-31',17,'2014-02-01','dei']]);assert.equal(x.privateInput.unmatchedDelistingHints[foreign].cls,'UNKNOWN');assert.equal(x.privateInput.observedListings.some(r=>r.listing.id===foreign),false);assert.equal(x.privateInput.certification.state,'OBSERVED_ONLY');
});
test('optional SEC fact reads are bounded and foreign object keys are never followed',async()=>{
 const f=fixture({secIndex:{objects:{'0000000001':{key:'v1/sec/fundamentals/facts/0000000001.json.gz'},'0000000002':{key:'outside/private.json.gz'}}}}),x=await collectDataInventory({...f.options,factDocLimit:2});
 assert.equal(x.privateInput.secFactDocuments[0].status,'AVAILABLE');assert.equal(x.privateInput.secFactDocuments[1].status,'SOURCE_KEY_REJECTED');assert.equal(f.calls.some(c=>c.key==='outside/private.json.gz'),false);
});
test('owner/session seals round-trip complete compact inputs; public output contains only enums and counts',async()=>{
 const f=fixture(),x=await collectDataInventory(f.options),keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}}),out=fs.mkdtempSync(path.join(os.tmpdir(),'cert-inventory-'));
 try{sealInventory(x,out,{ownerKey:keys.publicKey,sessionKey:keys.publicKey});for(const a of ['owner','session']){const recovered=JSON.parse(decryptSealed(keys.privateKey,fs.readFileSync(path.join(out,`data-certification-inputs.${a}.sealed.json`),'utf8')));assert.deepEqual(recovered,x.privateInput);}const pub=fs.readFileSync(path.join(out,'data-certification-status.json'),'utf8');assert.equal(pub.includes('ABC'),false);assert.equal(pub.includes('0000000001'),false);assert.equal(pub.includes('123'),false);assert.equal(pub.includes('sourceKey'),false);}finally{fs.rmSync(out,{recursive:true,force:true});}
});
test('optional canonical probe reuses the exact source snapshot and preserves every object across encrypted parts',async()=>{
 const f=fixture(),securities=Array.from({length:3},(_,i)=>({id:'fixture:'+i,listing:{id:'fixture:'+i},bars:[{date:'2018-01-02',open:100+i,high:101+i,low:99+i,close:100+i,volume:1000,dividend:0,splitFactor:1,comment:'x'.repeat(200)}],fundamentals:[]}));let called=false;
 const canonicalLoader=async o=>{called=true;assert.deepEqual(o.rawDataDeps.listingRows,f.options.listingRows);assert.deepEqual(o.rawDataDeps.universe,f.options.documents.universe);return {state:'AVAILABLE',window,coverage:{inputSegments:5,usableSegments:3,rejected:{INSUFFICIENT_BARS:1,PRIVATE_ID_SHOULD_NOT_LEAK:1},rejectionDetails:{CORPORATE_ACTION_CONTRADICTED:{SPLIT_FACTOR_OUT_OF_RANGE:1,PRIVATE_DETAIL:1}}},securities,benchmark:{bars:[]},calendar:['2018-01-02'],fingerprint:'c'.repeat(64),limitations:[]};};
 const x=await collectDataInventory({...f.options,canonical:true,canonicalLoader});assert.equal(called,true);assert.equal(x.publicStatus.canonicalStatus,'AVAILABLE');assert.deepEqual(x.publicStatus.canonicalRejections,{reasons:{INSUFFICIENT_BARS:1},unknownReasonCount:1,details:{CORPORATE_ACTION_CONTRADICTED:{SPLIT_FACTOR_OUT_OF_RANGE:1}},unknownDetailCount:1});
 const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}}),out=fs.mkdtempSync(path.join(os.tmpdir(),'cert-canonical-'));
 try{sealInventory(x,out,{ownerKey:keys.publicKey,sessionKey:keys.publicKey,canonicalChunkBytes:128});const manifestBytes=decryptSealed(keys.privateKey,fs.readFileSync(path.join(out,'canonical-dataset-manifest.session.sealed.json'),'utf8')),manifest=JSON.parse(manifestBytes),safe=x.publicStatus.canonicalArtifactReceipt;assert.equal(manifest.barHistoryTruncated,false);assert.equal(manifest.securities,3);assert.equal(manifest.parts.length,3);assert.equal(safe.manifest.sha256,crypto.createHash('sha256').update(manifestBytes).digest('hex'));assert.equal(safe.parts.length,3);const recovered=manifest.parts.flatMap(p=>{const b=decryptSealed(keys.privateKey,fs.readFileSync(path.join(out,`${p.stem}.session.sealed.json`),'utf8'));assert.equal(crypto.createHash('sha256').update(b).digest('hex'),p.sha256);assert.equal(safe.parts.find(x=>x.stem===p.stem).sealedFiles.length,2);return JSON.parse(b).securities;});assert.deepEqual(recovered,securities);assert.equal(JSON.stringify(safe).includes('PRIVATE_ID'),false);}finally{fs.rmSync(out,{recursive:true,force:true});}
});
test('canonical price provenance binds exact physical R2 read receipts, never a fabricated provider label',async()=>{
 const f=fixture(),raw=Buffer.from('exact fixture object bytes'),key='v1/tiingo/daily/US/ABC.json.'+(typeof zlib.zstdCompressSync==='function'?'zst':'gz');f.objects.set(key,raw);
 const canonicalLoader=async o=>{const k=o.rawDataDeps.mainStore.seriesKey('ABC');assert.equal(k,key);await o.rawDataDeps.mainStore.driver.get(k);return {state:'AVAILABLE',window,coverage:{inputSegments:1,usableSegments:1,canonicalContractHash:'b'.repeat(64)},securities:[{id:next.id,ticker:'ABC',listing:{id:next.id,startDate:next.startDate,endDate:null,active:true,reusedLater:false,instrumentType:'EQUITY_COMMON'},bars:[],fundamentals:[]}],benchmark:null,calendar:[],fingerprint:'c'.repeat(64)};};
 const x=await collectDataInventory({...f.options,canonical:true,canonicalLoader}),s=x.canonicalData.securities[0];assert.equal(s.priceSource.sourceKey,key);assert.equal(s.priceSource.sha256,crypto.createHash('sha256').update(raw).digest('hex'));assert.equal(s.priceSource.dataFingerprint,'c'.repeat(64));assert.equal(s.priceSource.canonicalContractHash,'b'.repeat(64));assert.equal(s.priceSource.publicationTimeCertification,'NOT_ESTABLISHED_BY_OBJECT_RETRIEVAL');assert.equal(x.privateInput.readReceipts.some(r=>r.sourceKey===key),true);
});
