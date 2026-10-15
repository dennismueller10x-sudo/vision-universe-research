import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../../..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=name=>JSON.parse(fs.readFileSync(path.join(HERE,name),'utf8'));
const demand=(condition,code)=>{if(!condition)throw new Error(code);};

export function verifyV3DurableState(){
 const inventory=read('CALIBRATION-V3-RECOVERY-INVENTORY.json');
 const resume=read('CALIBRATION-V3-RESUME-STATE.json');
 const receipt=read('CALIBRATION-V3-PRIVATE-ARTIFACT-RECEIPTS.json');
 const current=read('CALIBRATION-V3-CURRENT-CAPTURE-SAFE-STATUS.json');
 const methods=read('BACKTEST-CALIBRATION-METHODS.json').referenceScreens.map(x=>x.id);
 const methodSpecs=read('BACKTEST-CALIBRATION-METHODS.json').referenceScreens;
 const freeze=read('BACKTEST-CALIBRATION-FREEZE-V3.json');
 demand(inventory.pr643?.head==='cc9ecb5b677035338f034cd0f3c21a24b02c9fa2','PR643_HEAD_MISMATCH');
 demand(inventory.v3Branch?.base===inventory.pr643.head,'V3_BASE_NOT_PR643_HEAD');
 const blocked=new Set(resume.dataBlockedMethods||[]);
 demand(resume.pendingMethods.length+blocked.size===methods.length&&methods.every(id=>resume.pendingMethods.includes(id)!==blocked.has(id)),'PENDING_METHOD_SET_MISMATCH');
 demand(receipt.inputBundles.length===116&&new Set(receipt.inputBundles.map(x=>x.artifactId)).size===116,'PRIVATE_BUNDLE_RECEIPTS_INCOMPLETE');
 demand(current.workflowRunId===receipt.runId&&current.artifactId===receipt.currentResultArtifact.artifactId,'CURRENT_CAPTURE_RECEIPT_MISMATCH');
 demand(current.safeStatus?.status==='CURRENT_SCANNED_REVIEW_PENDING'&&current.safeStatus.eligibleMethods===0&&current.safeStatus.finalReviewPending===true,'CURRENT_CAPTURE_NOT_DIAGNOSTIC_PENDING');
 for(const x of receipt.inputBundles){
  demand(Number.isInteger(x.artifactId)&&x.workflowRunId===receipt.runId,'PRIVATE_ARTIFACT_ID_INVALID');
  demand(/^[a-f0-9]{64}$/.test(x.artifactZipSha256)&&/^[a-f0-9]{64}$/.test(x.encryptedContentSha256),'PRIVATE_ARTIFACT_HASH_INVALID');
  demand(x.recipientScheme==='OWNER_AND_SESSION_ENVELOPES'&&x.recipientId==='NOT_PUBLIC','PRIVATE_RECIPIENT_METADATA_INVALID');
  demand(x.repackManifestSha256===receipt.manifestArtifact.repackManifestSha256,'PRIVATE_MANIFEST_BINDING_MISMATCH');
 }
 const checkpoints=methods.map(id=>read(`CALIBRATION-V3-${id}-CHECKPOINT.json`));
 const fileHash=f=>fs.existsSync(path.join(HERE,f))?sha(fs.readFileSync(path.join(HERE,f))):null;
 const measuredOk=x=>x.status==='MEASURED_REVIEW_PENDING'&&x.verdict===null&&/^V3-[a-f0-9]{16}$/.test(x.freezeId??'')&&x.reviewStatus==='INDEPENDENT_NUMERIC_REVIEW_PENDING'&&/^[a-f0-9]{64}$/.test(x.outputSha256??'')&&fileHash(x.outputPath)===x.outputSha256&&fileHash(x.freezeFile)===x.freezeFileSha256;
 demand(checkpoints.every((x,i)=>blocked.has(methods[i])?(x.status==='DATA_BLOCKED'&&x.verdict==='DATA_BLOCKED'&&methodSpecs[i].status==='BLOCKED_DATA'):((x.status==='NOT_STARTED_INPUTS_REQUIRED'&&x.verdict===null)||measuredOk(x))),'CHECKPOINT_CLAIMS_MEASUREMENT');
 demand(freeze.status==='NOT_FROZEN_MISSING_DURABLE_INPUT_RECEIPTS'&&freeze.frozenAt===null,'CANDIDATE_FREEZE_STATUS_INVALID');
 demand(resume.fullCompletionFromCurrentArtifactsAlone===false,'FALSE_COMPLETION_CLAIM');
 demand(resume.artifactRefs.some(x=>x.path?.endsWith('CALIBRATION-V3-PRIVATE-ARTIFACT-RECEIPTS.json')),'PRIVATE_RECEIPT_NOT_LINKED');
 demand(inventory.durableArtifactManifestSha256===sha(fs.readFileSync(path.join(HERE,'CALIBRATION-V3-PRIVATE-ARTIFACT-RECEIPTS.json'))),'PRIVATE_RECEIPT_MANIFEST_HASH_MISMATCH');
 for(const ref of resume.artifactRefs){
  if(!ref.path)continue;
  const file=path.resolve(ROOT,ref.path);demand(file.startsWith(ROOT+path.sep)&&fs.existsSync(file),'RESUME_PATH_MISSING');
  if(ref.sha256)demand(sha(fs.readFileSync(file))===ref.sha256,'RESUME_FILE_HASH_MISMATCH');
 }
 return {status:'RESUME_METADATA_VERIFIED_NOT_NUMERICALLY_COMPLETE',methods:methods.length,checkpoints:checkpoints.length,dataBlockedMethods:blocked.size,privateInputBundles:receipt.inputBundles.length,privateSourceFiles:receipt.manifestArtifact.sourceFiles,currentCaptureMethods:current.safeStatus.methods,currentCaptureEligible:current.safeStatus.eligibleMethods,completedMethods:resume.completedCalibrationMethods.length,calibrationFreezeFinalized:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.stdout.write(JSON.stringify(verifyV3DurableState())+'\n');}
 catch(error){process.stderr.write(`${error.message}\n`);process.exitCode=1;}
}
