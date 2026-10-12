import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildRerunPublicArtifacts,buildRerunMarkdown,publishRerunPayload,RERUN_PUBLIC_NAMES} from '../research/certification/publish-rerun.mjs';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const ids=['cross_sectional_momentum','52_week_high_effect','LOW_VOLATILITY','TURTLE_S2_EQUITY_DAILY','WEINSTEIN_STAGE_DAILY','KULLAMAGI_DAILY_ADAPTATION'];
const blocked=['gross_profitability_novy_marx','piotroski_value_fscore','greenblatt_magic_formula','value_plus_momentum'];
const pairs=ids.flatMap((a,i)=>ids.slice(i+1).map(b=>({methodA:a,methodB:b,redundancy:'UNAVAILABLE'})));
function fixture(){
 const eligibility={methods:[...ids.map(id=>({id,eligibility:'PARTIAL',fully_certified:false})),...blocked.map(id=>({id,eligibility:'BLOCKED',fully_certified:false,source_fidelity_confidence:'LOW'}))],unimplemented_candidates:[{id:'industry_momentum',eligibility_status:'BLOCKED_DATA'},{id:'residual_momentum',eligibility_status:'BLOCKED_RULE_VARIANT_UNSELECTED'}]};
 const freeze={eligibility};
 const historical={dataFingerprint:'source-binding',freeze:{version:'original'},certificationFreeze:freeze,overlap:pairs,results:ids.map((id,i)=>({id,run:{reconciliation:{pass:true}},dataQuality:{pitListings:false},ranking:{score:null,components:{dataQuality:null},confidence:'LOW',tier:i===0?'D':'C',signalClassification:i===0?'NEGATIVE':'NEUTRAL',portfolioClassification:'BELOW',riskClassification:'DEEPER'},qualification:{fullyQualified:false,tierCeiling:'C'},rubricInputCertificationAmendment:{weightsChanged:false,thresholdsChanged:false}}))};
 const control={dataFingerprint:historical.dataFingerprint,results:ids.map(id=>({id,reconciliation:{pass:true}}))};
 const bindings=Object.fromEntries(['historicalInputSha256','controlInputSha256','currentInputSha256','eligibilityFileSha256'].map(k=>[k,hash(k)]));bindings.certificationFreezeHash=hash(JSON.stringify(freeze));
 const current={freeze,eligibility,eligibilityFileHash:bindings.eligibilityFileSha256,status:'CURRENT_BLOCKED_DATA',closedAt:'closed',historicalCalculation:'NOT_RUN_CURRENT_ONLY',currentScans:eligibility.methods.map(m=>({id:m.id,eligibility:m.eligibility,fullyCertified:false,status:'BLOCKED_DATA',numberMatches:null,candidates:[]})),consensus:{qualifiedEligible:[],qualifiedEligibleMethodIds:[],strongMethods:[],eligibleStrongMethods:[],partialDiagnostic:[],partialDiagnosticMethodIds:[]},forwardLedger:{status:'PREPARED_NOT_LIVE',records:[],methods:eligibility.methods.map(m=>({id:m.id,baselineIsPostFreezeSignal:false,records:[]}))}};
 const review={status:'PASSED',finalized:true,reviewScope:'FULL_SIX_METHODS',fullSixMethodReviewComplete:true,fullFifteenPairReviewComplete:true,controlReviewComplete:true,currentRunReviewed:true,...bindings};
 const delta=()=>({portfolio:'UNCHANGED',signal:'INCREASED',risk:'DECREASED'});
 const finalReview={status:'PASSED',finalized:true,publicationAuthorized:true,numericReviewSha256:hash(JSON.stringify(review)),redTeamReviewSha256:hash(JSON.stringify(review)),finalAnswers:Array.from({length:20},(_,i)=>({questionId:i+1,status:'RESEARCH_ONLY',methodIds:[],publicAnswer:'PRIVATE_VALUE ticker PRIVATE_STOCK'})),comparisons:ids.map(id=>({id,sourceSnapshotDelta:delta(),certificationOverlayDelta:delta(),combinedDelta:delta()})),regimeAssessments:ids.map(id=>({id,regimes:[]})),overlapAssessments:pairs,researchPriorityMethodIds:[],forwardResearchMethodIds:[]};
 return {historical,control,current,numericReview:structuredClone(review),redTeamReview:structuredClone(review),finalReview,bindings,metadata:{eligibility,originalFreeze:historical.freeze,baselineTiering:{counts:{dossier_tier_D_educational:24,dossier_tier_D_legacy_unmeasured:3}},universe:{candidates:[]}},verifyFreeze:()=>true};
}
test('projections preserve genuine D versus ceiling C and discard private free text',()=>{
 const f=fixture(),out=buildRerunPublicArtifacts(f),main=out[RERUN_PUBLIC_NAMES[0]];
 assert.equal(Object.keys(out).length,10);assert.equal(main.counts.measured_tier_C,5);assert.equal(main.counts.measured_tier_D,1);
 assert.equal(main.methods[0].raw_fixed_rubric_tier,'D');assert.equal(main.methods[0].qualified_ceiling,'C');assert.equal(main.methods[0].actual_total_score,null);
 assert.equal(main.comparisons[0].old_589_to_same_new_source_original_execution.signal,'INCREASED');
 assert.equal(main.comparisons[0].same_new_source_original_execution_to_v2.risk,'DECREASED');
 assert.doesNotMatch(JSON.stringify(out)+buildRerunMarkdown(f,out),/PRIVATE_STOCK|PRIVATE_VALUE/);
});
test('incomplete or differently bound actual control and review cannot pass',()=>{
 for(const mutate of [f=>f.control.results.pop(),f=>f.control.dataFingerprint='different',f=>f.numericReview.controlReviewComplete=false,f=>f.redTeamReview.currentInputSha256=hash('other'),f=>f.control.results[0].reconciliation.pass=false]){const f=fixture();mutate(f);assert.throws(()=>buildRerunPublicArtifacts(f));}
});
test('partial and blocked admission, null score, current receipts and real forward limits fail closed',()=>{
 for(const mutate of [f=>f.current.currentScans[0].eligibility='ELIGIBLE',f=>f.historical.results[0].ranking.score=0,f=>f.current.eligibilityFileHash=hash('other'),f=>f.current.currentScans[6].numberMatches=0,f=>f.current.forwardLedger.methods[0].baselineIsPostFreezeSignal=true]){const f=fixture();mutate(f);assert.throws(()=>buildRerunPublicArtifacts(f));}
});
test('dry run writes nothing and publication requires owner envelope',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'publication-rerun-'));
 try{const f=fixture();assert.equal(publishRerunPayload({...f,outRoot:directory}).artifact_count,10);assert.deepEqual(fs.readdirSync(directory),[]);assert.throws(()=>publishRerunPayload({...f,outRoot:directory,publish:true}));assert.deepEqual(fs.readdirSync(directory),[]);}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('CLI errors do not echo paths, values or argument strings',()=>{
 const publisher=fileURLToPath(new URL('../research/certification/publish-rerun.mjs',import.meta.url));
 const r=spawnSync(process.execPath,[publisher,'--PRIVATE_SECRET_ARGUMENT'],{encoding:'utf8'});
 assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr,'RERUN_PUBLICATION_FAILED\n');
});
