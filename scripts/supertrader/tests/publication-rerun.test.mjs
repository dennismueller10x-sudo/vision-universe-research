import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildRerunPublicArtifacts,buildRerunMarkdown,publishRerunPayload,RERUN_PUBLIC_NAMES,CERTIFICATION_FINAL_QUESTIONS,CERTIFICATION_QUESTION_VERSION} from '../research/certification/publish-rerun.mjs';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const ids=['cross_sectional_momentum','52_week_high_effect','LOW_VOLATILITY','TURTLE_S2_EQUITY_DAILY','WEINSTEIN_STAGE_DAILY','KULLAMAGI_DAILY_ADAPTATION'];
const blocked=['gross_profitability_novy_marx','piotroski_value_fscore','greenblatt_magic_formula','value_plus_momentum'];
const pairs=ids.flatMap((a,i)=>ids.slice(i+1).map(b=>({methodA:a,methodB:b,redundancy:'UNAVAILABLE'})));
function fixture(){
 const eligibility={methods:[...ids.map(id=>({id,eligibility:'PARTIAL',fully_certified:false})),...blocked.map(id=>({id,eligibility:'BLOCKED',fully_certified:false,source_fidelity_confidence:'LOW'}))],unimplemented_candidates:[{id:'industry_momentum',eligibility_status:'BLOCKED_DATA'},{id:'residual_momentum',eligibility_status:'BLOCKED_RULE_VARIANT_UNSELECTED'}]};
 const baseline={baseline589InputSha256:hash('baseline-payload'),baseline589ManifestSha256:hash('baseline-manifest')};
 const freeze={eligibility,inputReceipts:[{role:'BASELINE_589_CONSOLIDATED_PRIVATE_PAYLOAD',sha256:baseline.baseline589InputSha256},{role:'BASELINE_589_PRIVATE_INPUT_MANIFEST',sha256:baseline.baseline589ManifestSha256}]};
 const historical={controlFingerprint:'control-binding',protocol:{baseline:'ORIGINAL'},dataFingerprint:'source-binding',freeze:{version:'original'},certificationFreeze:freeze,overlap:pairs,results:ids.map((id,i)=>({id,run:{reconciliation:{pass:true}},dataQuality:{pitListings:false},ranking:{score:null,components:{dataQuality:null},confidence:'LOW',tier:i===0?'D':'C',signalClassification:i===0?'NEGATIVE':'NEUTRAL',portfolioClassification:'BELOW',riskClassification:'DEEPER'},qualification:{fullyQualified:false,tierCeiling:'C'},rubricInputCertificationAmendment:{weightsChanged:false,thresholdsChanged:false}}))};
 const control={freeze:historical.freeze,certificationFreeze:freeze,protocol:historical.protocol,controlFingerprint:historical.controlFingerprint,condition:'SAME_NEW_CANONICAL_SOURCE_ORIGINAL_EXECUTION_BEFORE_TERMINAL_OVERLAY',fullRawRunsPreserved:true,noClaimMatchingOld589SourceSnapshot:true,dataFingerprint:historical.dataFingerprint,results:ids.map(id=>({id,condition:'SAME_NEW_CANONICAL_SOURCE_ORIGINAL_EXECUTION_BEFORE_TERMINAL_OVERLAY',controlOnly:true,sourceDataFingerprint:historical.dataFingerprint,controlFingerprint:historical.controlFingerprint,reconciliation:{pass:true}}))};
 const bindings=Object.fromEntries(['historicalInputSha256','controlInputSha256','currentInputSha256','eligibilityFileSha256'].map(k=>[k,hash(k)]));Object.assign(bindings,baseline);bindings.certificationFreezeHash=hash(JSON.stringify(freeze));
 const current={freeze,eligibility,eligibilityFileHash:bindings.eligibilityFileSha256,status:'CURRENT_SCANNED_REVIEW_PENDING',closedAt:'closed',historicalCalculation:'NOT_RUN_CURRENT_ONLY',currentScans:eligibility.methods.map(m=>({id:m.id,eligibility:m.eligibility,fullyCertified:false,status:'BLOCKED_DATA',numberMatches:null,candidates:[]})),consensus:{qualifiedEligible:[],qualifiedEligibleMethodIds:[],strongMethods:[],eligibleStrongMethods:[],partialDiagnostic:[],partialDiagnosticMethodIds:[]},forwardLedger:{status:'PREPARED_NOT_LIVE',records:[],methods:eligibility.methods.map(m=>({id:m.id,baselineIsPostFreezeSignal:false,records:[]}))}};
 const review={status:'PASSED',finalized:true,reviewScope:'FULL_SIX_METHODS',fullSixMethodReviewComplete:true,fullFifteenPairReviewComplete:true,controlReviewComplete:true,currentRunReviewed:true,sensitivityRawArithmeticComplete:true,...bindings};
 const delta=()=>({portfolio:'UNCHANGED',signal:'INCREASED',risk:'DECREASED'});
 const finalReview={questionVersion:CERTIFICATION_QUESTION_VERSION,status:'PASSED',finalized:true,publicationAuthorized:true,numericReviewSha256:hash(JSON.stringify(review)),redTeamReviewSha256:hash(JSON.stringify(review)),finalAnswers:Array.from({length:20},(_,i)=>({questionId:i+1,status:'RESEARCH_ONLY',methodIds:[],publicAnswer:'PRIVATE_VALUE ticker PRIVATE_STOCK'})),comparisons:ids.map(id=>({id,sourceSnapshotDelta:delta(),certificationOverlayDelta:delta(),combinedDelta:delta()})),regimeAssessments:ids.map(id=>({id,regimes:[]})),overlapAssessments:pairs,researchPriorityMethodIds:[],forwardResearchMethodIds:[]};
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
test('fully data-blocked current runtime preserves immutable PARTIAL admission without false diagnostics',()=>{
 const f=fixture();f.current.status='CURRENT_BLOCKED_DATA';f.current.currentScans.forEach(r=>r.eligibility='BLOCKED');
 const rows=buildRerunPublicArtifacts(f)['SUPERTRADER-CURRENT-CANDIDATES-RERUN.json'].methods;
 assert.equal(rows[0].eligibility,'BLOCKED');assert.equal(rows[0].immutable_source_eligibility,'PARTIAL');assert.equal(rows[0].match_count,null);
 f.current.currentScans[0].numberMatches=0;assert.throws(()=>buildRerunPublicArtifacts(f));
});
test('baseline receipts and exact original control metadata cannot be substituted',()=>{
 for(const mutate of [f=>f.bindings.baseline589InputSha256=hash('tamper'),f=>f.redTeamReview.baseline589ManifestSha256=hash('tamper'),f=>f.control.protocol={baseline:'OTHER'},f=>f.control.freeze={version:'other'},f=>f.control.condition='OTHER',f=>f.control.results[0].condition='OTHER']){const f=fixture();mutate(f);assert.throws(()=>buildRerunPublicArtifacts(f));}
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

test('report answers latest certification questions in exact order and begins requested executive fields',()=>{
 const f=fixture(),doc=buildRerunMarkdown(f);
 assert.equal(CERTIFICATION_FINAL_QUESTIONS.length,20);
 assert.equal(CERTIFICATION_FINAL_QUESTIONS[0],'Welche vorher blockierten Methoden sind jetzt messbar?');
 assert.equal(CERTIFICATION_FINAL_QUESTIONS[19],'Was ist der nächste konkrete Produkt-/Research-Schritt?');
 let previous=-1;for(const [i,q] of CERTIFICATION_FINAL_QUESTIONS.entries()){const pos=doc.indexOf(`### ${i+1}. ${q}`);assert.ok(pos>previous);previous=pos;}
 assert.ok(doc.indexOf('Previously measured methods: 6')<doc.indexOf('## Beobachtete Richtungen'));
 assert.match(doc,/standalone Piotroski/);assert.match(doc,/Dispatch inaktiv/);assert.match(doc,/außerhalb der sechs/);
 const stale=fixture();stale.finalReview.questionVersion='OLD_TOURNAMENT';assert.throws(()=>buildRerunPublicArtifacts(stale));
 const reordered=fixture();reordered.finalReview.finalAnswers.reverse();assert.throws(()=>buildRerunPublicArtifacts(reordered));
});
test('review-approved relative leader IDs remain separate from qualified winners and require correct family',()=>{
 const f=fixture();f.finalReview.reviewedRelativeLeaders={systematicMethodIds:[ids[0]],legendaryMethodIds:[ids[3]],signalMethodIds:[ids[0]],portfolioMethodIds:[],riskMethodIds:[],currentMethodIds:[],consensusMethodIds:[]};
 const out=buildRerunPublicArtifacts(f),e=out[RERUN_PUBLIC_NAMES[0]].executive_summary;
 assert.deepEqual(e.reviewer_approved_relative_leaders.systematicMethodIds,[ids[0]]);assert.equal(e.relative_leaders_are_fully_qualified_winners,false);assert.equal(e.fully_qualified_winner_status,'NONE_QUALIFIED');
 f.finalReview.reviewedRelativeLeaders.systematicMethodIds=[ids[3]];assert.throws(()=>buildRerunPublicArtifacts(f));
});

test('numeric and redteam reviews must complete all eighteen exact raw sensitivity arithmetic replays',()=>{
 for(const name of ['numericReview','redTeamReview']) for(const flag of [false,undefined]){const f=fixture();f[name].sensitivityRawArithmeticComplete=flag;assert.throws(()=>buildRerunPublicArtifacts(f));}
 const f=fixture(),out=buildRerunPublicArtifacts(f),proof=out[RERUN_PUBLIC_NAMES[0]].sensitivity_raw_arithmetic;
 assert.equal(proof.reviewed_replay_count,18);assert.equal(proof.complete,true);assert.equal(proof.parameters_tuned_after_performance,false);
 assert.match(buildRerunMarkdown(f,out),/achtzehn exakten eingefrorenen Sensitivitäts-Replays/);
});
