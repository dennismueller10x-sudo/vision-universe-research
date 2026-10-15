/**
 * Mechanical calibration completion for one V3 freeze, applying ONLY the pre-registered definitions in
 * calibration/protocol.json (calibrationVerdictDefinitions, overallVerdictDefinitions, paperEffectComparability).
 * Input is the public per-method summaries of the calibration jobs; output is a public, hash-bound receipt.
 * No performance numbers are read or written.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {publicReferenceSummary} from './reference-return-arithmetic.mjs';
import {verifyFreezeV3} from './freeze-v3.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const demand=(ok,code)=>{if(!ok)throw new Error(code);};
const COST_MODES=['SOURCE_GROSS','SAME_TOURNAMENT_NET'];

export function buildCompletion({freezeBytes,summaries,parsedReference=null,registry,protocolBytes}){
 const freeze=JSON.parse(freezeBytes);verifyFreezeV3(freeze);
 const byMethod=new Map(summaries.map(s=>[s.methodId,s]));
 const numericReviews=[],screens=[];let passes=0,hardFailure=null;
 for(const spec of registry.referenceScreens){
  if(spec.status==='BLOCKED_DATA'){screens.push({id:spec.id,status:'BLOCKED_DATA',verdict:null,reason:'FUNDAMENTAL_OR_EVENT_DATA_CONTRACT_NOT_MET'});continue;}
  const s=byMethod.get(spec.id);
  if(!s){screens.push({id:spec.id,status:'BLOCKED_RULE',verdict:null,reason:'NO_PUBLIC_MEASUREMENT_SUMMARY'});hardFailure??='MISSING_SUMMARY:'+spec.id;continue;}
  demand(s.freezeId===freeze.freezeId,'SUMMARY_FREEZE_MISMATCH');
  const modes=new Map(s.results.map(r=>[r.costMode,r]));
  let ok=COST_MODES.every(m=>modes.has(m));
  for(const m of COST_MODES){
   const r=modes.get(m);if(!r){continue;}
   const reconciled=r.reconciliation&&Object.values(r.reconciliation).every(x=>x.pass===true)&&Object.keys(r.reconciliation).length>0;
   const reviewed=r.numericReview?.status==='PASS';
   if(!(r.status!=='FAILED_CLOSED'&&reconciled&&reviewed))ok=false;
   numericReviews.push({methodId:spec.id,costMode:m,status:reconciled&&reviewed?'PASS':'FAIL',reviewSha256:r.numericReview?.reviewSha256??'0'.repeat(64),reconciled});
  }
  if(!ok){screens.push({id:spec.id,status:'COMPLETED',verdict:'FAIL',reason:'CRITICAL_INFRASTRUCTURE_CHECK_FAILED'});hardFailure??='REVIEW_FAILED:'+spec.id;continue;}
  const control=spec.kind==='CONTROL';
  const direction=modes.get('SOURCE_GROSS').sourceSpreadDirection;
  if(control){screens.push({id:spec.id,status:'COMPLETED',verdict:'PASS',scope:'EW_CONTROL_DECLARED_CONTROL_SCOPE_ONLY',reason:'ALL_MATERIAL_CONSTRUCTION_INVARIANTS_REPRODUCED_AND_REVIEWED'});passes++;}
  else screens.push({id:spec.id,status:'COMPLETED',verdict:'PARTIAL',reason:'STOCK_CONSTRUCTION_MECHANICS_REVIEWED_ORIGINAL_STUDY_EFFECT_NOT_ASSESSED',originalPaperEffect:'NOT_ASSESSED_MISSING_CRSP_OR_FTSE_ORIGINAL_PANEL',paperEffectComparability:'NONCOMPARABLE_NOT_INFRASTRUCTURE_FAIL',sourceSpreadDirection:direction,sourceSpreadValidMonths:modes.get('SOURCE_GROSS').sourceSpreadValidMonths});
 }
 const reference=parsedReference?.reports?.map(publicReferenceSummary)??null;
 const referenceOk=Boolean(reference&&reference.length&&reference.every(r=>r.status==='COMPUTED'||r.status==='PARTIAL'));
 let overall='NOT_CERTIFIED';
 if(!hardFailure&&passes>=1&&referenceOk)overall='PARTIALLY_CERTIFIED';
 return{
  schema:'supertrader-calibration-v3-completion-1.0.0',
  status:hardFailure?'CALIBRATION_INCOMPLETE':'CALIBRATION_COMPLETE_NUMERIC_REVIEW_PASSED',
  hardFailure,freezeId:freeze.freezeId,freezeFileSha256:sha(freezeBytes),protocolSha256:sha(protocolBytes),
  ruleBasis:'calibration/protocol.json calibrationVerdictDefinitions + overallVerdictDefinitions + paperEffectComparability (pre-registered)',
  overallVerdict:overall,overallReason:overall==='PARTIALLY_CERTIFIED'?'ONE_EW_CONTROL_PASS_PLUS_REFERENCE_ARITHMETIC_EVIDENCE_REMAINING_SCREENS_PARTIAL_OR_BLOCKED; NOT_AN_ORIGINAL_PAPER_OR_POPULATION_CERTIFICATE':'NO_QUALIFYING_STOCK_CONSTRUCTION_PASS_OR_INCOMPLETE',
  referenceScreens:screens,numericReviews,referenceArithmeticEvidence:reference,
  reviewIndependence:'SEPARATE_CODE_PATH_SAME_AUTHOR; ADVERSARIAL_REVIEW_SEPARATE',performanceNumbersPublished:false
 };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2),arg=f=>{const i=a.indexOf(f);return i>=0?a[i+1]:null;};
 try{
  const dir=arg('--summaries'),files=fs.readdirSync(dir).filter(f=>/^CALIBRATION-V3-.*-RESULT-\d+\.json$/.test(f)).sort();
  const summaries=files.map(f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')));
  const parsed=arg('--reference-parsed')?JSON.parse(fs.readFileSync(arg('--reference-parsed'),'utf8')):null;
  const c=buildCompletion({freezeBytes:fs.readFileSync(arg('--freeze')),summaries,parsedReference:parsed,registry:JSON.parse(fs.readFileSync(path.join(HERE,'BACKTEST-CALIBRATION-METHODS.json'),'utf8')),protocolBytes:fs.readFileSync(path.join(HERE,'protocol.json'))});
  fs.writeFileSync(arg('--out'),JSON.stringify(c,null,2)+'\n',{flag:'wx'});
  process.stdout.write(JSON.stringify({status:c.status,overallVerdict:c.overallVerdict,screens:c.referenceScreens.map(s=>[s.id,s.status,s.verdict]),completionSha256:sha(fs.readFileSync(arg('--out')))})+'\n');
  if(c.status!=='CALIBRATION_COMPLETE_NUMERIC_REVIEW_PASSED')process.exitCode=2;
 }catch(e){process.stderr.write(JSON.stringify({status:'COMPLETION_FAILED_CLOSED',code:/^[A-Z0-9_:]+$/.test(e.message)?e.message:'COMPLETION_FAILURE'})+'\n');process.exitCode=1;}
}
