/* Explicit main-only recovery of an already approved full-eligible scope.
   Keep the public gate closed throughout fresh private/consumer acceptance. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {approval} from './production-approval.mjs';
import {prefixFor} from './public-delivery.mjs';
import {activationKey,goodState,downloadGood} from './refresh-storage.mjs';
import {universeConfig,universeApproved} from './universe-approval.mjs';
import {setProductionGate} from './production-release.mjs';

export function assertRecoveryBaseline({activation,gate,receipt,full,frozen},env=process.env){
 assert.equal(env.GITHUB_REF,'refs/heads/main','RECOVERY_MAIN_ONLY');
 assert.equal(env.GITHUB_REPOSITORY,'dennismueller10x-sudo/vision-universe-research','RECOVERY_REPOSITORY_REQUIRED');
 assert(activation?.schema===1&&activation.approvalId===universeConfig.approvalId&&activation.state==='ROLLBACK_46','PRIOR_FULL_SCOPE_ROLLBACK_REQUIRED');
 assert(gate?.schema===1&&gate.approvalId===approval.approvalId&&gate.generation===approval.consumerGeneration&&gate.state==='DISABLED','PUBLIC_GATE_MUST_REMAIN_CLOSED');
 assert(receipt?.status==='R2_CANDIDATE_ACCEPTED'&&receipt.rollback?.freshReadback===true,'PRIOR_FULL_ACCEPTANCE_REQUIRED');
 assert(universeApproved(full?.manifest),'PRIOR_VERIFIED_FULL_GOOD_REQUIRED');
 assert(Object.keys(full.manifest.eligibility).length>45,'PRIOR_FULL_ELIGIBLE_SCOPE_REQUIRED');
 assert(frozen?.manifest?.tickers?.length===46&&Object.keys(frozen.inventory||{}).length===45&&frozen.generation===receipt.rollback.generation,'IMMUTABLE_ROLLBACK_REQUIRED');
}
export async function prepareProfileRecovery(driver,temporary){
 const gateKey=prefixFor(approval.namespace)+'gate.json',activationBytes=await driver.get(activationKey()),gateBytes=await driver.get(gateKey);
 const receipt=JSON.parse(await driver.get(prefixFor(universeConfig.consumerNamespace)+'release-acceptance.json'));
 const full=await goodState(driver,universeConfig.consumerNamespace),frozen=await goodState(driver,universeConfig.rollbackNamespace);
 assertRecoveryBaseline({activation:JSON.parse(activationBytes),gate:JSON.parse(gateBytes),receipt,full,frozen});
 const restored=await downloadGood(driver,{namespace:universeConfig.rollbackNamespace,output:join(temporary,'fresh-existing-rollback')});
 assert.equal(restored.generation,frozen.generation,'ROLLBACK_FRESH_READBACK_REQUIRED');
 return {activationBytes,gateBytes,gateKey};
}
export async function finishProfileRecovery(driver,context,report){
 assert(report.status==='SUCCESS'&&!report.verification&&report.freshRestoreVerified&&report.candidateQA?.status==='PASS'&&report.contentAcceptance?.status==='PASS','RECOVERY_FRESH_ACCEPTANCE_REQUIRED');
 const good=await goodState(driver,universeConfig.consumerNamespace);
 assert(universeApproved(good?.manifest)&&good.generation===report.consumerGeneration&&good.manifest.refreshValidation.checkpointSha256===report.privatePreservation.sha256,'RECOVERY_GOOD_MISMATCH');
 assert(Buffer.from(await driver.get(activationKey())).equals(context.activationBytes),'RECOVERY_ACTIVATION_CHANGED');
 assert(Buffer.from(await driver.get(context.gateKey)).equals(context.gateBytes),'RECOVERY_GATE_CHANGED');
 const bytes=Buffer.from(JSON.stringify({schema:1,state:'AVAILABLE',approvalId:universeConfig.approvalId,generation:good.generation,changedAt:new Date().toISOString(),recoveryRunId:report.runId}));
 try{
  await driver.put(activationKey(),bytes);
  assert(Buffer.from(await driver.get(activationKey())).equals(bytes),'RECOVERY_ACTIVATION_READBACK_FAILED');
  await setProductionGate(driver,'AVAILABLE');
 }catch(error){
  await setProductionGate(driver,'DISABLED');
  await driver.put(activationKey(),context.activationBytes);
  assert(Buffer.from(await driver.get(activationKey())).equals(context.activationBytes),'RECOVERY_ROLLBACK_READBACK_FAILED');
  throw error;
 }
 return {status:'RECOVERED_EXISTING_FULL_SCOPE',generation:good.generation,publicAcceptanceRequired:true};
}
