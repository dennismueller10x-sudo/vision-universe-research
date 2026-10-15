/* Gate-Entscheidung vor der Live-Verifikation eines Company-Intelligence-Refresh (Workflow company-intelligence-refresh.yml,
   Schritt deploy_live).

   WARUM (Refresh-Lauf 38652800358, 14.10.2026 23:14 UTC): Ist das Produktions-Gate geschlossen, liefert stageProduction kein
   company-intelligence-delivery.json aus. Ein Refresh kann dann nicht live veroeffentlicht werden; das Warten darauf endete
   deterministisch in PRODUCTION_PUBLICATION_SLO_FAILED und loeste Rollback und Abschaltung erneut aus.
   (Der zweite Fehler desselben Tages, ein Cache-Mischstand bei offenem Gate, ist Sache von refresh-live-verify.mjs, #703.)

   REGEL: nur ein sauber gelesenes, gueltiges Gate mit state DISABLED oder STAGED ergibt GATE_CLOSED. AVAILABLE und jeder unklare
   Zustand (Lesefehler, fehlend, ungueltig, fehlende Zugangsdaten) ergeben VERIFY: der bisherige strenge Pfad laeuft unveraendert.

   CLI: `closed` gibt den Plan als JSON aus und endet mit Exit 0 nur bei GATE_CLOSED, sonst 1 (auch bei Absturz: dann VERIFY). */
import {pathToFileURL} from 'node:url';
import {readGateState} from './production-observation.mjs';

export const CLOSED_GATE_STATES=Object.freeze(['DISABLED','STAGED']);

export async function publicationPlan(gate){
 const g=await readGateState(gate).catch(()=>({gateState:null,gateReason:'GATE_READ_FAILED'}));
 return {mode:CLOSED_GATE_STATES.includes(g.gateState)?'GATE_CLOSED':'VERIFY',gateState:g.gateState,gateReason:g.gateReason};
}

/* Gate aus R2 lesen (gleicher Schluessel wie production-release.mjs). Fehler fuehren zu VERIFY. */
export async function readPlanFromEnv(){
 try{
  const {createS3DriverFromEnv}=await import('../market/storage/s3-driver.mjs');
  const {approval}=await import('./production-approval.mjs');
  const {prefixFor}=await import('./public-delivery.mjs');
  const driver=createS3DriverFromEnv();
  return await publicationPlan({read:()=>driver.get(prefixFor(approval.namespace)+'gate.json'),approvalId:approval.approvalId,generation:approval.consumerGeneration});
 }catch{return {mode:'VERIFY',gateState:null,gateReason:'GATE_READ_FAILED'};}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv[2]==='closed'){
  const plan=await readPlanFromEnv();
  console.log(JSON.stringify(plan));
  process.exitCode=plan.mode==='GATE_CLOSED'?0:1;
 }else{console.error('usage: refresh-publication.mjs closed');process.exitCode=2;}
}
