/* Entscheidung des Fail-closed-Handlers im Pages-Job company-intelligence-live (pages-release.yml,
   Schritt "Fail-closed persistent consumer gate and emergency Pages rollback").

   WARUM (15.10.2026 20:14-20:18Z): Nach PRODUCTION_GATE_CHANGED_AFTER_PACKAGE (deployment-mode.mjs) war das Gate bereits von einem
   anderen Schreiber geschlossen (Refresh-Rollback + disable). Der Handler fuehrte trotzdem erneut `refresh-run.mjs rollback` aus:
   Doppel-Rollback, der zweite Aufruf schrieb LEGACY_FALLBACK und zerstoerte den Legacy-GOOD-Zeiger. (refresh-storage.mjs macht
   rollbackGood inzwischen selbst idempotent, PR #726; diese Entscheidung verhindert den unnoetigen Zweitaufruf schon im Workflow.)

   REGEL: ROLLBACK nur, wenn dieser Job die produktive Generation selbst veroeffentlicht hat (approved erfolgreich, enabled == 'true')
   UND das Gate jetzt nachweislich noch AVAILABLE ist (sauber aus R2 gelesen, gleiche Freigabe und Generation).
   Alles andere ist DISABLE_ONLY: Gate nicht mehr AVAILABLE (DISABLED/STAGED), Generation/Freigabe nicht die eigene, Freigabe-Schritt
   gescheitert (z. B. PRODUCTION_GATE_CHANGED_AFTER_PACKAGE), nichts veroeffentlicht, Gate unlesbar oder jeder Absturz.
   In beiden Faellen laufen danach wie bisher `production-release.mjs disable` (idempotent) und der OFF-Dispatch.

   CLI: gibt die Entscheidung als JSON aus und endet mit Exit 0 nur bei ROLLBACK, sonst 1 (auch bei Absturz: dann DISABLE_ONLY).
   Eingaben nur ueber Umgebungsvariablen APPROVED_OUTCOME und APPROVED_ENABLED (ADR-005). */
import {pathToFileURL} from 'node:url';
import {readGateState} from './production-observation.mjs';

/** Rein. gate: Ergebnis von readGateState ({gateState, gateReason}); gateState nur bei gueltigem, zur Freigabe passendem Gate gesetzt. */
export function pagesRollbackDecision({approvedOutcome,approvedEnabled,gate}){
 if(approvedOutcome!=='success')return {decision:'DISABLE_ONLY',reason:'APPROVAL_STEP_NOT_SUCCESSFUL'}; // u. a. PRODUCTION_GATE_CHANGED_AFTER_PACKAGE
 if(approvedEnabled!=='true')return {decision:'DISABLE_ONLY',reason:'NOTHING_PUBLISHED_BY_THIS_JOB'};
 const state=gate?.gateState??null;
 if(state==='AVAILABLE')return {decision:'ROLLBACK',reason:'OWN_GENERATION_PUBLISHED_AND_GATE_AVAILABLE'};
 if(state==='DISABLED'||state==='STAGED')return {decision:'DISABLE_ONLY',reason:'GATE_ALREADY_'+state};
 return {decision:'DISABLE_ONLY',reason:'GATE_STATE_UNKNOWN_'+String(gate?.gateReason||'UNREADABLE')};
}

export async function decisionFromEnv(env=process.env,readGate=null){
 try{
  const gate=readGate?await readGate():await (async()=>{
   const {createS3DriverFromEnv}=await import('../market/storage/s3-driver.mjs');
   const {approval}=await import('./production-approval.mjs');
   const {prefixFor}=await import('./public-delivery.mjs');
   const driver=createS3DriverFromEnv();
   return readGateState({read:()=>driver.get(prefixFor(approval.namespace)+'gate.json'),approvalId:approval.approvalId,generation:approval.consumerGeneration});
  })();
  return pagesRollbackDecision({approvedOutcome:env.APPROVED_OUTCOME,approvedEnabled:env.APPROVED_ENABLED,gate});
 }catch{return {decision:'DISABLE_ONLY',reason:'DECISION_FAILED'};}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const d=await decisionFromEnv();
 console.log(JSON.stringify(d));
 process.exitCode=d.decision==='ROLLBACK'?0:1;
}
