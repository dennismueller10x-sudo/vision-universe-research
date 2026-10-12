import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRecoveryBaseline,finishProfileRecovery} from '../profile-release-recovery.mjs';
import {universeConfig} from '../universe-approval.mjs';
import {approval} from '../production-approval.mjs';
const env={GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'dennismueller10x-sudo/vision-universe-research'};
function baseline(){
 const generation='a'.repeat(24),eligibility={},assets={'index.json':{bytes:2,sha256:'b'.repeat(64)}},tickers=[];
 for(let i=0;i<46;i++){
  const cid='iss_cik_'+String(i+1).padStart(10,'0'),ticker='T'+i;tickers.push(ticker);
  eligibility[cid]={status:'ELIGIBLE_PARTIAL',tickers:[ticker],modules:{profile:true,aktuelles:false,financials:false,whatChanged:false,nextEvent:false,calls:false,documents:false}};
  assets[`snapshots/${generation}/${cid}.json`]={bytes:2,sha256:'b'.repeat(64)};
 }
 return {activation:{schema:1,state:'ROLLBACK_46',approvalId:universeConfig.approvalId},
  gate:{schema:1,state:'DISABLED',generation:approval.consumerGeneration,approvalId:approval.approvalId},
  receipt:{status:'R2_CANDIDATE_ACCEPTED',rollback:{freshReadback:true,generation:'c'.repeat(24)}},
  frozen:{generation:'c'.repeat(24),manifest:{tickers:Array(46)},inventory:Object.fromEntries(Array.from({length:45},(_,i)=>['F'+i,{}]))},
  full:{manifest:{schema:1,generation,generatedAt:'2026-10-12T10:00:00Z',scope:'PER_ISSUER_ELIGIBILITY',eligibilityVersion:universeConfig.eligibilityVersion,sourceUsagePolicy:universeConfig.sourceUsagePolicy,tickers,eligibility,assets,
   productionApproval:universeConfig.approvalId,releaseState:'APPROVED_CONTROLLED_PRODUCTION',refreshValidation:{status:'PASS',structural:'PASS',privateCompanies:5122,checkpointSha256:'d'.repeat(64)}}}};
}
test('explicit recovery requires prior approved full scope and a proven immutable rollback while public gate is closed',()=>{
 assert.doesNotThrow(()=>assertRecoveryBaseline(baseline(),env));
 for(const alter of [v=>v.gate.state='AVAILABLE',v=>v.activation.state='AVAILABLE',v=>v.receipt.status='UNREVIEWED',v=>v.receipt.rollback.freshReadback=false,v=>v.frozen.inventory={},v=>v.full.manifest.sourceUsagePolicy='PUBLISHER_BODIES',v=>v.full.manifest.refreshValidation.privateCompanies=45]){
  const v=baseline();alter(v);assert.throws(()=>assertRecoveryBaseline(v,env));
 }
 assert.throws(()=>assertRecoveryBaseline(baseline(),{...env,GITHUB_REF:'refs/heads/preview'}),/RECOVERY_MAIN_ONLY/);
});
test('an unsuccessful or merely isolated candidate never opens either recovery gate',async()=>{
 let writes=0;const driver={put:async()=>writes++};
 for(const report of [{status:'PIPELINE_FAILURE'},{status:'SUCCESS',verification:true,freshRestoreVerified:true,candidateQA:{status:'PASS'},contentAcceptance:{status:'PASS'}},{status:'SUCCESS',verification:false,freshRestoreVerified:false}]){
  await assert.rejects(finishProfileRecovery(driver,{},report),/RECOVERY_FRESH_ACCEPTANCE_REQUIRED/);
 }
 assert.equal(writes,0);
});
test('fresh success cannot recover a different or missing GOOD generation',async()=>{
 let writes=0;const driver={get:async()=>null,put:async()=>writes++};
 await assert.rejects(finishProfileRecovery(driver,{}, {status:'SUCCESS',verification:false,freshRestoreVerified:true,candidateQA:{status:'PASS'},contentAcceptance:{status:'PASS'}}),/RECOVERY_GOOD_MISMATCH/);
 assert.equal(writes,0);
});
