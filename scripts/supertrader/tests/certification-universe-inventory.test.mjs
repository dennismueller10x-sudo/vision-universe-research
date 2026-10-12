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
 const assertions={listingId:old.id,securityId:'ref_ABC',ticker:'ABC',cik:'0000000001',issuerId:'iss_cik_0000000001',relationship:'ISSUER_SECURITY',admissionConfirmed:true,validFrom:'2016-01-01',validTo:'2019-12-31',knownFrom:'2016-01-01',issuerStructure:'SINGLE_CLASS',classRosterComplete:true,classListingIds:[old.id],...overrides};
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
 const x=certifyHistoricalIdentity(old,[link()],'2018-01-02');assert.equal(x.status,'VERIFIED');assert.equal(x.issuerStructure,'SINGLE_CLASS');
 assert.equal(listingAtDate(old,'2016-01-01',x).admissible,false);assert.equal(listingAtDate(old,'2018-01-02',x).admissible,true);
 assert.equal(certifyHistoricalIdentity(old,[link({classListingIds:[old.id,'another-class']})],'2018-01-02').issuerStructure,'UNKNOWN');
 assert.equal(certifyHistoricalIdentity(old,[link(),link({cik:'0000000002',issuerId:'iss_cik_0000000002'})],'2018-01-02').reason,'CONFLICTING_HISTORICAL_ISSUER_LINKS');
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
test('optional SEC fact reads are bounded and foreign object keys are never followed',async()=>{
 const f=fixture({secIndex:{objects:{'0000000001':{key:'v1/sec/fundamentals/facts/0000000001.json.gz'},'0000000002':{key:'outside/private.json.gz'}}}}),x=await collectDataInventory({...f.options,factDocLimit:2});
 assert.equal(x.privateInput.secFactDocuments[0].status,'AVAILABLE');assert.equal(x.privateInput.secFactDocuments[1].status,'SOURCE_KEY_REJECTED');assert.equal(f.calls.some(c=>c.key==='outside/private.json.gz'),false);
});
test('owner/session seals round-trip complete compact inputs; public output contains only enums and counts',async()=>{
 const f=fixture(),x=await collectDataInventory(f.options),keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}}),out=fs.mkdtempSync(path.join(os.tmpdir(),'cert-inventory-'));
 try{sealInventory(x,out,{ownerKey:keys.publicKey,sessionKey:keys.publicKey});for(const a of ['owner','session']){const recovered=JSON.parse(decryptSealed(keys.privateKey,fs.readFileSync(path.join(out,`data-certification-inputs.${a}.sealed.json`),'utf8')));assert.deepEqual(recovered,x.privateInput);}const pub=fs.readFileSync(path.join(out,'data-certification-status.json'),'utf8');assert.equal(pub.includes('ABC'),false);assert.equal(pub.includes('0000000001'),false);assert.equal(pub.includes('123'),false);assert.equal(pub.includes('sourceKey'),false);}finally{fs.rmSync(out,{recursive:true,force:true});}
});
