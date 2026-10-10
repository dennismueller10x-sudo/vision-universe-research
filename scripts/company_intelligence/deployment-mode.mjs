/* Bind post-deployment acceptance to the published artifact, not a later gate
   transition. Normal automation dispatches are intentionally not full cohort QA. */
import {approval} from './production-approval.mjs';
export function deploymentMode({packagedEnabled,emergencyOff=false,fullAcceptance=false,gate=null}){
 if(emergencyOff&&packagedEnabled)throw Error('EMERGENCY_ARTIFACT_DID_NOT_CLOSE');
 if(!packagedEnabled){
  if(fullAcceptance&&!emergencyOff)throw Error('CONTROLLED_ACTIVATION_REQUIRES_ACTIVE_ARTIFACT');
  return 'OFF';
 }
 if(!approval.deliveryEnabled||gate?.schema!==1||gate.generation!==approval.consumerGeneration||gate.approvalId!==approval.approvalId||gate.state!=='AVAILABLE')throw Error('PRODUCTION_GATE_CHANGED_AFTER_PACKAGE');
 return fullAcceptance?'FULL':'ROUTINE';
}
