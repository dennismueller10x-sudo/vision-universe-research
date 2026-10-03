import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,cpSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {replayCommittedClassification,unchangedSnapshotShardBytes} from '../../scripts/universe/company-master-snapshot-replay.mjs';
import {productizationFixture} from './fixtures/tiingo2-productize-fixture.mjs';
import {prepareProductizationShadow,reconcileShadowIssuerMappings} from '../../scripts/market/tiingo2-productize.mjs';
const require=createRequire(import.meta.url),Master=require('../engines/company-master.js');
function sample(ticker){const shard=ticker.slice(0,2);return JSON.parse(readFileSync(new URL('../data/universe/instruments/'+shard+'.json',import.meta.url))).instruments.find(row=>row.symbol===ticker);}
function classified(prior){const incoming=Master.toInstrument({ticker:prior.symbol,exchange:prior.exchange,name:prior.companyName,assetType:prior.assetTypeRaw,currency:prior.currency,startDate:prior.firstTradeDate,endDate:prior.lastTradeDate},{today:'2026-10-02'});for(const field of ['active','productEligibility','productEligibilityReason','securityClass','masterMemberId'])incoming[field]=prior[field];incoming.classificationAgrees=incoming.securityType===prior.securityType;return incoming;}
for(const ticker of ['PFBC','AAPGV'])test(ticker+' offline snapshot replay preserves reviewed canonical classification and exposes a staged proposal',()=>{const previous=sample(ticker),incoming=classified(previous);assert.notEqual(incoming.securityType,previous.securityType);const replay=replayCommittedClassification(previous,incoming,{sourceKind:'COMMITTED_GATE_UNIVERSES'});assert.equal(replay.instrument.securityType,previous.securityType);assert.equal(replay.proposal.decision,'STAGED_CLASSIFICATION_REVIEW');assert.equal(replay.proposal.instrumentId,previous.instrumentId);assert.ok(replay.proposal.changes.some(row=>row.field==='securityType'&&row.proposed===incoming.securityType));assert.equal(incoming.securityType,classified(previous).securityType);});
test('fresh provider discovery retains the corrected Preferred Bank common classification',()=>{const previous=sample('PFBC'),incoming=classified(previous),result=replayCommittedClassification(previous,incoming,{sourceKind:'TIINGO_PROVIDER_DIRECTORY'});assert.equal(result.instrument.securityType,'COMMON_STOCK');assert.equal(result.proposal,null);});
test('changed listing or policy inputs cannot replay stale classification',()=>{const previous=sample('PFBC'),incoming=classified(previous);for(const field of ['companyName','exchange','assetTypeRaw','firstTradeDate','lastTradeDate','currency','active','securityClass','productEligibility','masterMemberId']){const changed={...incoming,[field]:field==='active'?false:'changed'};assert.equal(replayCommittedClassification(previous,changed,{sourceKind:'COMMITTED_GATE_UNIVERSES'}).instrument,changed,field);}assert.equal(replayCommittedClassification(null,incoming,{sourceKind:'COMMITTED_GATE_UNIVERSES'}).instrument,incoming);});

test('offline rebuild of concrete materialized canonical additions preserves exact bytes and verified SEC provenance; changed raw listing fails closed',()=>productizationFixture(options=>{
 execFileSync(process.execPath,[join(options.root,'scripts/universe/build-company-master.mjs'),'--out',join(options.root,'quant/data/universe'),'--work-dir',join(options.workDir,'initial-baseline'),'--today','2026-10-02'],{encoding:'utf8'});
 const prepared=prepareProductizationShadow({...options,today:'2026-10-02',runId:'repro',expectedAdditions:1});
 reconcileShadowIssuerMappings({shadowRoot:prepared.shadowRoot,securities:prepared.securities,byTicker:{IPO:{cik:'0001234567'}}});
 for(const path of ['quant/data/market/scale/universe-FULL_UNIVERSE.json','quant/data/market/security-master/eligibility.json','quant/data/market/security-master/company-names.json','quant/data/universe'])cpSync(join(prepared.shadowRoot,path),join(options.root,path),{recursive:true});
 const output=join(options.workDir,'offline-rebuild');cpSync(join(options.root,'quant/data/universe'),output,{recursive:true});
 const execute=()=>execFileSync(process.execPath,[join(options.root,'scripts/universe/build-company-master.mjs'),'--out',output,'--work-dir',join(options.workDir,'offline-working'),'--today','2026-10-02'],{encoding:'utf8'});
 execute();for(const file of readdirSync(join(output,'instruments')))assert.deepEqual(readFileSync(join(output,'instruments',file)),readFileSync(join(options.root,'quant/data/universe/instruments',file)),file);
 const row=JSON.parse(readFileSync(join(output,'instruments/IP.json'))).instruments[0];assert.equal(row.cik,'0001234567');assert.equal(row.cikSource,'EXISTING_SEC_CANONICAL_PRODUCER');assert.equal(row.lastTradeDate,'2026-10-01');
 const rawPath=join(options.root,'quant/data/market/scale/universe-FULL_UNIVERSE.json'),raw=JSON.parse(readFileSync(rawPath));raw.securities.find(r=>r.ticker==='IPO').startDate='2026-09-02';writeFileSync(rawPath,JSON.stringify(raw));
 assert.throws(execute,error=>error.status===3&&error.stderr.includes('andere Mitgliederliste'));
 assert.deepEqual(readFileSync(join(output,'instruments/IP.json')),readFileSync(join(options.root,'quant/data/universe/instruments/IP.json')));
}));
test('offline byte preservation requires full equal shard contents while retaining append order and never suppressing a changed row',()=>{
 const rows=[{instrumentId:'a',symbol:'Z'},{instrumentId:'b',symbol:'A'}],prior=JSON.stringify({shard:'AA',engine:'version',count:2,instruments:rows},null,2)+'\n',next={shard:'AA',engine:'version',count:2,instruments:[...rows].reverse()};
 assert.equal(unchangedSnapshotShardBytes(prior,next,{sourceKind:'COMMITTED_GATE_UNIVERSES'}),prior);
 assert.equal(unchangedSnapshotShardBytes(prior,{...next,instruments:[next.instruments[0],{...next.instruments[1],symbol:'CHANGED'}]},{sourceKind:'COMMITTED_GATE_UNIVERSES'}),null);
 assert.equal(unchangedSnapshotShardBytes(prior,next,{sourceKind:'TIINGO_PROVIDER_DIRECTORY'}),null);
 assert.equal(unchangedSnapshotShardBytes(prior,{...next,instruments:[rows[0],rows[0]]},{sourceKind:'COMMITTED_GATE_UNIVERSES'}),null);
});
test('an unchanged incremental snapshot stages newly inferred issuer mapping honestly and never hides a conflicting known CIK',()=>{
 const previous={...sample('PFBC'),productEligibilityReason:'TIINGO2_VERIFIED_INCREMENTAL_ADDITION',cik:null,issuerId:null,cikSource:null,issuerIdSource:null},incoming={...previous,cik:'0001234567',issuerId:'iss_cik_0001234567',cikSource:'sec:current',issuerIdSource:'sec:current'};
 const options={sourceKind:'COMMITTED_GATE_UNIVERSES',sourceRow:{selection:'tiingo2:accepted',active:true,endDate:null}};
 const result=replayCommittedClassification(previous,incoming,options);assert.equal(result.instrument.cik,null);assert.equal(result.instrument.issuerId,null);assert.equal(result.proposal.decision,'STAGED_ISSUER_MAPPING_REVIEW');assert.equal(result.proposal.changes[0].proposed,'0001234567');
 const known={...previous,cik:'0007654321',issuerId:'iss_cik_0007654321'};assert.equal(replayCommittedClassification(known,incoming,options).instrument.cik,'0001234567');assert.equal(replayCommittedClassification(previous,incoming,{...options,sourceKind:'TIINGO_PROVIDER_DIRECTORY'}).instrument.cik,'0001234567');
});
