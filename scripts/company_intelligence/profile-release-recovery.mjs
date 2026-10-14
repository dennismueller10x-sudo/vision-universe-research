/* Explicit main-only recovery of an already approved full-eligible scope.
   A closed gate stays closed until fresh acceptance; an already open gate (serving the
   verified legacy 46) is never closed, and the full scope only goes live after a
   full-asset readback. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {approval} from './production-approval.mjs';
import {prefixFor} from './public-delivery.mjs';
import {activationKey,goodState,goodView,downloadGood} from './refresh-storage.mjs';
import {universeConfig,universeApproved} from './universe-approval.mjs';
import {setProductionGate} from './production-release.mjs';
import {assertLegacyScope} from './frozen-refreeze.mjs';
import {refreshConfig} from './refresh-approval.mjs';
import {download} from './download-public.mjs';

/* Two audited baselines. (1) Gate DISABLED: the full scope can only appear through
   the final gate opening, which hash-reads the whole GOOD (setProductionGate).
   (2) Gate AVAILABLE (open, serving the verified legacy 46 while activation is
   ROLLBACK_46): switching the activation pointer is itself the exposure, so the
   same full-asset readback moves BEFORE that write (finishProfileRecovery) and the
   served legacy 46 GOOD must be intact (`legacy`), which is also what a failed
   recovery returns to. An open gate is never closed or reopened by recovery. */
export function assertRecoveryBaseline({activation,gate,receipt,full,frozen,legacy},env=process.env){
 assert.equal(env.GITHUB_REF,'refs/heads/main','RECOVERY_MAIN_ONLY');
 assert.equal(env.GITHUB_REPOSITORY,'dennismueller10x-sudo/vision-universe-research','RECOVERY_REPOSITORY_REQUIRED');
 assert(activation?.schema===1&&activation.approvalId===universeConfig.approvalId&&activation.state==='ROLLBACK_46','PRIOR_FULL_SCOPE_ROLLBACK_REQUIRED');
 assert(gate?.schema===1&&gate.approvalId===approval.approvalId&&gate.generation===approval.consumerGeneration&&['DISABLED','AVAILABLE'].includes(gate.state),'PUBLIC_GATE_STATE_UNSUPPORTED');
 if(gate.state==='AVAILABLE')assertLegacyScope(legacy,'OPEN_GATE_REQUIRES_VERIFIED_LEGACY_46');
 assert(receipt?.status==='R2_CANDIDATE_ACCEPTED'&&receipt.rollback?.freshReadback===true,'PRIOR_FULL_ACCEPTANCE_REQUIRED');
 assert(universeApproved(full?.manifest),'PRIOR_VERIFIED_FULL_GOOD_REQUIRED');
 assert(Object.keys(full.manifest.eligibility).length>45,'PRIOR_FULL_ELIGIBLE_SCOPE_REQUIRED');
 // The receipt proved one rollback generation; a certified re-freeze descends from it (lineage).
 const proven=receipt.rollback.generation,descends=frozen?.generation===proven||(frozen?.refreeze?.schema===1&&frozen.refreeze.sourceGeneration===frozen.generation&&Array.isArray(frozen.refreeze.lineage)&&frozen.refreeze.lineage[0]===proven);
 assert(frozen?.manifest?.tickers?.length===46&&Object.keys(frozen.inventory||{}).length===45&&descends,'IMMUTABLE_ROLLBACK_REQUIRED');
}
export async function prepareProfileRecovery(driver,temporary){
 const gateKey=prefixFor(approval.namespace)+'gate.json',activationBytes=await driver.get(activationKey()),gateBytes=await driver.get(gateKey);
 const receipt=JSON.parse(await driver.get(prefixFor(universeConfig.consumerNamespace)+'release-acceptance.json'));
 const full=await goodState(driver,universeConfig.consumerNamespace),frozen=await goodState(driver,universeConfig.rollbackNamespace),legacy=await goodState(driver,refreshConfig.consumerNamespace);
 assertRecoveryBaseline({activation:JSON.parse(activationBytes),gate:JSON.parse(gateBytes),receipt,full,frozen,legacy});
 const restored=await downloadGood(driver,{namespace:universeConfig.rollbackNamespace,output:join(temporary,'fresh-existing-rollback')});
 assert.equal(restored.generation,frozen.generation,'ROLLBACK_FRESH_READBACK_REQUIRED');
 return {activationBytes,gateBytes,gateKey};
}
async function exactRestore(driver,key,bytes,code){
 await driver.put(key,bytes);
 assert(Buffer.from(await driver.get(key)).equals(bytes),code);
}
export async function finishProfileRecovery(driver,context,report){
 assert(report.status==='SUCCESS'&&!report.verification&&report.freshRestoreVerified&&report.candidateQA?.status==='PASS'&&report.contentAcceptance?.status==='PASS','RECOVERY_FRESH_ACCEPTANCE_REQUIRED');
 const good=await goodState(driver,universeConfig.consumerNamespace);
 assert(universeApproved(good?.manifest)&&good.generation===report.consumerGeneration&&good.manifest.refreshValidation.checkpointSha256===report.privatePreservation.sha256,'RECOVERY_GOOD_MISMATCH');
 assert(Buffer.from(await driver.get(activationKey())).equals(context.activationBytes),'RECOVERY_ACTIVATION_CHANGED');
 assert(Buffer.from(await driver.get(context.gateKey)).equals(context.gateBytes),'RECOVERY_GATE_CHANGED');
 const gateOpen=JSON.parse(context.gateBytes).state==='AVAILABLE';
 if(gateOpen){
  // The open gate exposes the scope the moment activation flips: hash-read every
  // consumer asset first, exactly as setProductionGate does when it opens a closed gate.
  const output=mkdtempSync(join(tmpdir(),'ci-recovery-readback-'));
  try{await download(goodView(driver,good.payloadNamespace,good),{namespace:good.payloadNamespace,output});}
  finally{rmSync(output,{recursive:true,force:true});}
  assert.deepEqual(await goodState(driver,universeConfig.consumerNamespace),good,'RECOVERY_GOOD_CHANGED_DURING_READBACK');
 }
 const bytes=Buffer.from(JSON.stringify({schema:1,state:'AVAILABLE',approvalId:universeConfig.approvalId,generation:good.generation,changedAt:new Date().toISOString(),recoveryRunId:report.runId}));
 try{
  await driver.put(activationKey(),bytes);
  assert(Buffer.from(await driver.get(activationKey())).equals(bytes),'RECOVERY_ACTIVATION_READBACK_FAILED');
  if(gateOpen)assert(Buffer.from(await driver.get(context.gateKey)).equals(context.gateBytes),'RECOVERY_GATE_CHANGED');
  else await setProductionGate(driver,'AVAILABLE');
 }catch(error){
  // Closed-gate baseline returns to a closed gate; an open gate is restored byte for byte, never closed.
  if(gateOpen)await exactRestore(driver,context.gateKey,context.gateBytes,'RECOVERY_GATE_RESTORE_READBACK_FAILED');
  else await setProductionGate(driver,'DISABLED');
  await exactRestore(driver,activationKey(),context.activationBytes,'RECOVERY_ROLLBACK_READBACK_FAILED');
  throw error;
 }
 return {status:'RECOVERED_EXISTING_FULL_SCOPE',generation:good.generation,publicAcceptanceRequired:true};
}
