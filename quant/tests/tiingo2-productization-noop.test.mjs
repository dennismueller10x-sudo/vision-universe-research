import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,existsSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {productizationFixture} from './fixtures/tiingo2-productize-fixture.mjs';
import {assessProductizationReplay,prepareProductizationShadow} from '../../scripts/market/tiingo2-productize.mjs';
import {runProductization} from '../../scripts/market/tiingo2-run-productization.mjs';
import {stageCanonicalPublication} from '../../scripts/market/tiingo2-publication.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),today='2026-10-02';
const canonicalPaths=['quant/data/market/scale/universe-FULL_UNIVERSE.json','quant/data/market/security-master/eligibility.json','quant/data/market/security-master/company-names.json','quant/data/universe'];
function read(file){return JSON.parse(readFileSync(file));}
async function assertNoop(options,{expectedConsumer,asOf='2026-10-03'}={}){
 const privateDir=join(options.root,'.market-cache/no-op-run'),out=join(options.root,'.verification/no-op-run');
 // With both required provider cache and source builder absent, an attempted
 // private-review/provider/builder path would fail. The no-op remains valid.
 rmSync(join(options.sourceCache,'evidence'),{recursive:true,force:true});rmSync(join(options.root,'scripts/universe/build-company-master.mjs'));
 const originalFetch=globalThis.fetch;let requests=0;globalThis.fetch=()=>{requests++;throw Error('NO_OP_MUST_NOT_REQUEST_PROVIDER');};
 let result;try{result=await runProductization({...options,workDir:privateDir,out,asOf,runId:'no-op-regression',releaseOutput:join(privateDir,'release'),allowNetwork:true,onProgress:()=>{throw Error('NO_OP_MUST_NOT_ENTER_BUILDERS');}});}finally{globalThis.fetch=originalFetch;}
 assert.equal(result.publicationState,'NO_CHANGES');assert.equal(result.canonicalMaterialized,0);assert.equal(result.currentProduction,expectedConsumer);assert.equal(result.proposedConsumer,expectedConsumer);assert.equal(result.productionWrites,0);assert.deepEqual(result.rows,[]);assert.equal(requests,0);assert.equal(existsSync(privateDir),false);
 for(const [path,expected] of Object.entries(result.replay.baselineHashes))assert.equal(hash(readFileSync(join(options.root,path))),expected,path);
 const files=readdirSync(out).filter(file=>file.endsWith('.json'));assert.equal(files.length,9);
 for(const file of files){const report=read(join(out,file));assert.equal(report.state||report.publicationState,'NO_CHANGES',file);assert.equal(report.productionWrites,0,file);if(report.ADDED)assert.deepEqual(report.ADDED,[],file);if(report.REMOVED)assert.deepEqual(report.REMOVED,[],file);}
 assert.deepEqual(read(join(out,'tiingo2_final_consumer_universe.json')),{runId:'no-op-regression',current:expectedConsumer,proposed:expectedConsumer,ADDED:[],REMOVED:[],publicationState:'NO_CHANGES',productionWrites:0});
 return result;
}
test('root runner verifies an already applied cached stage and emits all nine no-op reports without private review, provider calls or builders',()=>productizationFixture(async options=>{
 const prepared=prepareProductizationShadow({...options,today,runId:'accepted',expectedAdditions:1});
 cpSync(join(options.workDir,'canonical-stage'),join(options.sourceRun,'canonical'),{recursive:true});
 for(const path of canonicalPaths)cpSync(join(prepared.shadowRoot,path),join(options.root,path),{recursive:true});
 const result=await assertNoop(options,{expectedConsumer:2});assert.equal(result.replay.alreadyPresent,1);assert.equal(result.replay.unchanged[0].instrumentId,prepared.securities[0].instrumentId);
}));
test('root runner accepts an integrity-checked fresh zero-additions canonical stage as NO_CHANGES',()=>productizationFixture(async options=>{
 writeFileSync(join(options.sourceRun,'tiingo2_publication_preview.json'),JSON.stringify({ADDED:[],REMOVED:[]}));
 const staged=stageCanonicalPublication({root:options.root,output:join(options.sourceRun,'canonical'),candidates:[],preview:{ADDED:[],REMOVED:[]},runId:'zero',today});assert.equal(staged.files.length,0);assert.equal(staged.additions.length,0);
 const result=await assertNoop(options,{expectedConsumer:1,asOf:today});assert.equal(result.replay.acceptedScope,0);assert.equal(result.replay.alreadyPresent,0);
}));

for(const securityClass of ['SPAC','REIT','ADR'])test(`applied ${securityClass} policy class replays through the canonical type mapping without rebuilding`,()=>productizationFixture(async options=>{
 const path=join(options.sourceRun,'tiingo2_consumer_policy_report.json'),policy=read(path);policy.rows[0].policy.instrumentType=securityClass;writeFileSync(path,JSON.stringify(policy));
 const prepared=prepareProductizationShadow({...options,today,runId:'accepted-'+securityClass,expectedAdditions:1});
 cpSync(join(options.workDir,'canonical-stage'),join(options.sourceRun,'canonical'),{recursive:true});
 for(const path of canonicalPaths)cpSync(join(prepared.shadowRoot,path),join(options.root,path),{recursive:true});
 const canonicalPath=join(options.root,'quant/data/universe/instruments/IP.json'),canonical=read(canonicalPath),instrument=canonical.instruments[0];
 assert.equal(instrument.securityClass,securityClass);assert.equal(instrument.securityType,securityClass==='ADR'?'ADR':'COMMON_STOCK');
 const before=readFileSync(canonicalPath);const result=await assertNoop(options,{expectedConsumer:2});assert.equal(result.replay.alreadyPresent,1);assert.ok(readFileSync(canonicalPath).equals(before));
 // A compatible broad type must never hide an altered audited class, nor an
 // incompatible type be accepted merely because policy membership survived.
 instrument.securityClass=securityClass==='SPAC'?'REIT':'SPAC';writeFileSync(canonicalPath,JSON.stringify(canonical));
 assert.throws(()=>assessProductizationReplay({...options,asOf:today}),/CACHED_STAGE_CANONICAL_CLASSIFICATION_CONFLICT/);
 instrument.securityClass=securityClass;instrument.securityType='PREFERRED';writeFileSync(canonicalPath,JSON.stringify(canonical));
 assert.throws(()=>assessProductizationReplay({...options,asOf:today}),/CACHED_STAGE_CANONICAL_CLASSIFICATION_CONFLICT/);
 instrument.securityType=securityClass==='ADR'?'ADR':'COMMON_STOCK';writeFileSync(canonicalPath,JSON.stringify(canonical));
 const decisionsPath=join(options.root,'quant/data/market/security-master/eligibility.json'),decisions=read(decisionsPath);decisions.decisions.find(r=>r.ticker==='IPO').instrument_type=securityClass==='SPAC'?'REIT':'SPAC';writeFileSync(decisionsPath,JSON.stringify(decisions));
 assert.throws(()=>assessProductizationReplay({...options,asOf:today}),/CACHED_STAGE_CANONICAL_CLASSIFICATION_CONFLICT/);
}));
