import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Q=require('../api/europe-readiness.js');
const NOW='2026-10-08T18:00:00Z';
const binding={securityId:'fixture-Europe-class',listingId:'fixture-XETR-listing',mic:'XETR',currency:'EUR'};
const mapping={companyId:'fixture-company',issuerId:'fixture-issuer',securityId:binding.securityId,listingId:binding.listingId,mic:'XETR',listingCurrency:'EUR',isin:'DE0007164600',shareClassId:'fixture-common'};
const official=()=>({kind:'ESEF',verified:true,url:'https://example.org/fixture-official',sha256:'a'.repeat(64),retrievedAt:'2026-10-08T12:00:00Z'});
function payload(status='VALIDATED'){
 const identity={version:Q.PRODUCER_VERSION,status:'VERIFIED',listingIdentityVerified:true,mapping:{...mapping},provenance:[official()]};
 return {identity,
  prices:{version:'marketstack-europe-quality-1',...binding,valid:true,freshness:'CURRENT',asOf:'2026-10-08',adjustmentStatus:'ADJUSTMENT_CERTIFIED',seriesSha256:'b'.repeat(64),independentEvidence:{verified:true,independent:true,sourceId:'fixture-actions',sha256:'c'.repeat(64)},calendarProof:{verified:true,mic:'XETR',sourceId:'fixture-calendar',sha256:'d'.repeat(64),expectedLastCompletedSession:'2026-10-08'}},
  technical:{version:'marketstack-europe-quality-1',...binding,status:'TECHNICAL_READY',asOf:'2026-10-08',priceSeriesSha256:'b'.repeat(64),engineProjection:{verified:true,sourceId:'unchanged-feature-engine',parametersHash:'fixture-parameters'},benchmark:{verified:true,region:'EUROPE',securityId:'fixture-eu-benchmark',sourceId:'fixture-benchmark-source',seriesSha256:'e'.repeat(64)}},
  fundamentals:{version:Q.PRODUCER_VERSION,sourcePolicy:'ESEF_OFFICIAL_FILINGS_PRIMARY_SEC_ACTUAL_FILER_ONLY',identity,status,asOf:'2026-10-08',validFilingCount:1,acceptedFilings:[{source:official(),periodEnd:'2025-12-31',availableAt:'2026-03-31',isin:mapping.isin,shareClassId:mapping.shareClassId}],engineInputsValid:status==='VALIDATED',fundamentalsCurrent:true,sharesBasisValid:true,currencyBasisValid:true,missingEngineInputs:status==='VALIDATED'?[]:['roic']},
  fundamentalProducerCertificate:{producer:'scripts/marketstack/europe-fundamentals.mjs#evaluateFundamentals',version:Q.PRODUCER_VERSION,engine:'fundamental-inputs-1.0.0',profile:'GENERIC',...binding,sourceHashes:['a'.repeat(64)]}};
}
async function envelope(p=payload()){
 if(p.fundamentalProducerCertificate)p.fundamentalProducerCertificate.evaluatedFundamentalsSha256=await Q.payloadSha256(p.fundamentals);
 return {schema:Q.PROOF_SCHEMA,producer:Q.PRODUCER,producerVersion:Q.PRODUCER_VERSION,binding:{...binding},generatedAt:'2026-10-08T17:00:00Z',payload:p,payloadSha256:await Q.payloadSha256(p)};
}
// Trusted resolver stand-in authenticates immutable fixture envelopes only.
// It is a test authority, never a self-reported production proof flag.
function authority(envelopes){const trusted=new Set(envelopes.map(x=>x.payloadSha256));return async e=>({verified:trusted.has(e.payloadSha256),producer:Q.PRODUCER,producerVersion:Q.PRODUCER_VERSION,payloadSha256:e.payloadSha256,sourceId:'fixture-authenticated-producer',...e.binding});}
const evaluate=async(e,verifyEvidence=authority([e]))=>Q.evaluate(e,{verifyEvidence,now:NOW});

test('authenticated exact producer full readiness does not produce scores, rankings or strategy data',async()=>{
 const e=await envelope(),before=structuredClone(e),r=await evaluate(e);
 assert.equal(r.status,'QUANT_FULL');assert.equal(r.score,null);assert.equal(r.rank,null);assert.equal(r.rankingEligible,false);assert.equal(r.strategyDataProduced,false);assert.equal(r.usPopulationModified,false);assert.deepEqual(e,before);
});
test('arbitrary readiness booleans and unverified producer flags cannot promote FULL',async()=>{
 const e=await envelope();assert.equal((await Q.evaluate(e,{now:NOW})).status,'QUANT_BLOCKED');
 assert.equal((await evaluate(e,async()=>({verified:true}))).status,'QUANT_BLOCKED');
 const naked={binding,payload:{status:'QUANT_FULL',identity:{verified:true},prices:{valid:true},fundamentals:{engineInputsValid:true}}};
 assert.equal((await evaluate(naked,async()=>({verified:true}))).status,'QUANT_BLOCKED');
 const p=payload();delete p.fundamentalProducerCertificate;assert.equal((await evaluate(await envelope(p))).status,'QUANT_TECHNICAL_ONLY');
});
test('official partial and missing fundamentals form separate readiness states',async()=>{
 assert.equal((await evaluate(await envelope(payload('PARTIAL')))).status,'QUANT_PARTIAL');
 const p=payload();p.fundamentals={};delete p.fundamentalProducerCertificate;assert.equal((await evaluate(await envelope(p))).status,'QUANT_TECHNICAL_ONLY');
});
test('proof payload, producer version and financial certificate tampering fail closed',async()=>{
 const e=await envelope();e.payload.prices.valid=false;assert.equal((await evaluate(e)).reasons[0],'PROOF_DIGEST_MISMATCH');
 const wrong=await envelope();wrong.producerVersion='future';assert.equal((await evaluate(wrong)).status,'QUANT_BLOCKED');
 const c=await envelope();c.payload.fundamentalProducerCertificate.evaluatedFundamentalsSha256='f'.repeat(64);c.payloadSha256=await Q.payloadSha256(c.payload);assert.equal((await evaluate(c)).reasons[0],'FUNDAMENTALS_CERTIFICATE_DIGEST_MISMATCH');
});
test('cross-security listing MIC currency calendar and series joins cannot open price/technical readiness',async()=>{
 for(const [part,key,value]of [['prices','securityId','OTHER'],['technical','listingId','OTHER'],['prices','mic','XPAR'],['technical','currency','USD'],['technical','priceSeriesSha256','f'.repeat(64)]]){
  const p=payload();p[part][key]=value;assert.equal((await evaluate(await envelope(p))).status,'QUANT_BLOCKED',part+key);
 }
 const p=payload();p.prices.calendarProof.mic='XNAS';assert.equal((await evaluate(await envelope(p))).status,'QUANT_BLOCKED');
 const b=payload();b.technical.benchmark.region='US';assert.equal((await evaluate(await envelope(b))).status,'QUANT_BLOCKED');
});
test('cross-company official fundamentals and provider financial data cannot produce full readiness',async()=>{
 const p=payload();p.fundamentals.identity=structuredClone(p.identity);p.fundamentals.identity.mapping.companyId='OTHER';assert.equal((await evaluate(await envelope(p))).status,'QUANT_TECHNICAL_ONLY');
 const b=payload();b.fundamentals.acceptedFilings[0].source.kind='MARKETSTACK';assert.equal((await evaluate(await envelope(b))).status,'QUANT_TECHNICAL_ONLY');
 const c=payload();c.fundamentalProducerCertificate.profile='BANK';assert.equal((await evaluate(await envelope(c))).status,'QUANT_TECHNICAL_ONLY');
});
test('population remains separate, deterministic and collision protected',async()=>{
 const e=await envelope();const r=await Q.buildPopulation([e],{verifyEvidence:authority([e]),now:NOW});assert.equal(r.population,'EUROPE_READINESS');assert.equal(r.counts.QUANT_FULL,1);assert.equal(r.rankingEligible,false);
 await assert.rejects(Q.buildPopulation([e,e],{verifyEvidence:authority([e]),now:NOW}),/DUPLICATE/);
 await assert.rejects(Q.buildPopulation([e],{protectedIds:[binding.securityId]}),/PROTECTED/);
 assert.equal((await Q.evaluate(e,{verifyEvidence:authority([e]),now:NOW,protectedIds:[binding.listingId]})).status,'QUANT_BLOCKED');
 const extra=await envelope();extra.binding.population='US_RANKING';extra.binding.region='US';const safe=await evaluate(extra);assert.equal(safe.population,'EUROPE_READINESS');assert.equal(safe.region,'EUROPE');
});
test('optional adapter preserves US receiver, arguments and return object while Europe ranks stay absent',async()=>{
 const calls=[],usValue={unchanged:true},usClient={getQuantData(...args){calls.push({receiver:this,args});return usValue;},getRanking(...args){calls.push({receiver:this,args});return usValue;}};
 const e=await envelope();let loads=0;
 const client=Q.create({usClient,now:NOW,verifyEvidence:authority([e]),loadEvidence:async b=>{loads++;assert.deepEqual(b,binding);return e;}});
 assert.equal(client.getQuantData('AAPL',{existing:'option'}),usValue);assert.equal(client.getRanking('US_REAL'),usValue);assert.equal(loads,0);assert.equal(calls[0].receiver,usClient);assert.deepEqual(calls[0].args,['AAPL',{existing:'option'}]);
 const eu=await client.getQuantData({region:'EUROPE',...binding});assert.equal(eu.data.status,'QUANT_FULL');assert.equal(loads,1);
 assert.equal(client.getRanking({region:'EUROPE'}).state,'UNAVAILABLE');assert.equal(calls.length,2);
});
test('future timestamps, unavailable evidence loader and invalid European bindings fail closed',async()=>{
 const e=await envelope();e.generatedAt='2099-01-01T00:00:00Z';assert.equal((await evaluate(e)).status,'QUANT_BLOCKED');
 const client=Q.create({usClient:{getQuantData:()=>null}});assert.equal((await client.getQuantData({region:'EUROPE',...binding})).state,'UNAVAILABLE');
 const b=await envelope();b.binding.mic='XNAS';assert.equal((await evaluate(b)).status,'QUANT_BLOCKED');
});
test('asynchronous authentication pins payload, expected binding and verifier copy before caller mutation',async()=>{
 const e=await envelope(payload('PARTIAL')),expected={...binding},originalDigest=e.payloadSha256;
 const r=await Q.evaluate(e,{now:NOW,expectedBinding:expected,verifyEvidence:async verifierCopy=>{
  e.payload.fundamentals.status='VALIDATED';e.payload.fundamentals.engineInputsValid=true;e.payload.fundamentals.missingEngineInputs=[];
  e.payload.fundamentalProducerCertificate.evaluatedFundamentalsSha256=await Q.payloadSha256(e.payload.fundamentals);
  expected.securityId='MUTATED';verifierCopy.payload.prices.valid=false;
  return {verified:true,producer:Q.PRODUCER,producerVersion:Q.PRODUCER_VERSION,payloadSha256:originalDigest,sourceId:'fixture-authenticated-producer',...binding};
 }});
 assert.notEqual(await Q.payloadSha256(e.payload),originalDigest);assert.equal(r.status,'QUANT_PARTIAL');assert.equal(r.securityId,binding.securityId);
 const invalid=payload();invalid.prices.valid=false;const blocked=await envelope(invalid);
 assert.equal((await Q.evaluate(blocked,{now:NOW,verifyEvidence:async pin=>{
  blocked.payload.prices.valid=true;return {verified:true,producer:Q.PRODUCER,producerVersion:Q.PRODUCER_VERSION,payloadSha256:pin.payloadSha256,sourceId:'fixture-authority',...binding};
 }})).status,'QUANT_BLOCKED');
});
test('adapter pins verifier loader protected IDs and reference at creation/call boundaries',async()=>{
 const e=await envelope(),protectedIds=[binding.securityId],options={usClient:{getQuantData:()=>null},protectedIds,now:NOW,loadEvidence:async()=>e,verifyEvidence:authority([e])};
 const client=Q.create(options);options.protectedIds=[];protectedIds.length=0;options.loadEvidence=async()=>null;options.verifyEvidence=async()=>({verified:true});
 const ref={region:'EUROPE',...binding},pending=client.getQuantData(ref);ref.securityId='MUTATED';
 const r=await pending;assert.equal(r.state,'AVAILABLE');assert.equal(r.data.securityId,binding.securityId);assert.equal(r.data.status,'QUANT_BLOCKED');assert.equal(r.data.reasons[0],'INVALID_OR_PROTECTED_EUROPE_IDENTITY');
});
