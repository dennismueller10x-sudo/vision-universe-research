/* Entscheidung im Fehlerpfad von company-intelligence-profile-source.yml: NO_ACTION | CLOSE_GATE.
 *
 * WARUM: Der alte Fehlerschritt fuehrte nach JEDEM Fehler des Live-Schritts (gh-Dispatch, Wartezeit auf die Auslieferung,
 * Live-QA, Observe) ohne Pruefung `refresh-run rollback`, `production-release disable` und den OFF-Dispatch aus. Ein Fehler,
 * der die Produktion gar nicht betrifft (Dispatch-Fehler, zu langsame Auslieferung, Provider-/Netzfehler), schloss so ein
 * gesundes, bewusst offenes Gate und rollte ein GOOD zurueck.
 *
 * REGEL: Geschlossen / zurueckgerollt wird nur, wenn (a) dieser Lauf selbst etwas veraendert hat (GOOD-Zeiger geschrieben)
 * UND (b) die Produktion nachweislich nicht mehr dem erwarteten Stand entspricht (falsche Generation ausgeliefert) oder die
 * Live-QA der eigenen Veroeffentlichung rot ist. Fehler vor jeder Mutation (Setup, Quellenabruf, Tests, Browser-Suite gegen
 * die Vorschau) => NO_ACTION. Das Skript liest nur (R2 get, HTTP GET); es schreibt nur Ausgaben (GITHUB_OUTPUT, Summary).
 *
 * Eingaben (env): PUBLISH, RECOVER_FULL_SCOPE, REPORT_ROOT, GITHUB_RUN_ID und die Schritt-Ergebnisse OUTCOME_RUN,
 * OUTCOME_DISPATCH, OUTCOME_SERVED, OUTCOME_LIVEQA, OUTCOME_OBSERVE (steps.<id>.outcome).
 * Aufruf: `node failure-gate-decision.mjs baseline` (vor dem Lauf, schreibt baseline.json) bzw. `... decide` (Standard).
 *
 * Entscheidungsmatrix (Reihenfolge ist verbindlich):
 *  1 kein Produktionslauf (PUBLISH != true)                               NO_ACTION  NO_PRODUCTION_PUBLICATION
 *  2 keine eigene Mutation (Setup, Quellen, Tests, Vorschau-Browser ...)  NO_ACTION  PRE_MUTATION_FAILURE
 *  3 kein relevanter Schrittfehler                                        NO_ACTION  NO_RELEVANT_STEP_FAILURE
 *  4 Live-QA der eigenen Veroeffentlichung rot                            CLOSE_GATE OWN_PUBLICATION_LIVE_QA_FAILED
 *  5 Probe nicht verfuegbar, eigene Mutation (sicher oder nicht auszuschliessen)
 *                                                                         CLOSE_GATE PROBE_UNAVAILABLE_AFTER_OWN_MUTATION
 *  6 Gate seit Lauf-Beginn ohne legitime Oeffnung auf AVAILABLE           CLOSE_GATE GATE_OPENED_WITHOUT_LEGITIMACY
 *  7 Gate geschlossen (DISABLED/STAGED): nichts ausgeliefert              NO_ACTION  GATE_ALREADY_CLOSED_NOTHING_EXPOSED
 *  8 Gate offen, ausgelieferte Generation == eigene                       NO_ACTION  OWN_GENERATION_SERVED_HEALTHY
 *  9 Gate offen, Generation == Stand vor dem Lauf, GOOD plausibel         NO_ACTION  DELIVERY_NOT_YET_UPDATED
 * 10 Gate offen, alles andere (fremde/fehlende Generation)                CLOSE_GATE WRONG_GENERATION_SERVED
 * Zeile 5 begruendet: Nach einer eigenen Mutation kann ohne Probe weder "gesund" noch "falsch" belegt werden; ein Schliessen
 * ist umkehrbar (Gate AVAILABLE ist ein bewusster Schritt), ein ungeprueft ausgelieferter GOOD nicht. Ohne eigene Mutation
 * gibt es nichts zurueckzunehmen: dort nur Warnung. Ein Rollback des GOOD-Zeigers erfolgt nur, wenn er noch unsere Generation
 * traegt (nie ein fremdes GOOD zuruecknehmen). */
import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const DECISION=Object.freeze({NONE:'NO_ACTION',CLOSE:'CLOSE_GATE'});
export const MUTATION=Object.freeze({YES:'YES',NO:'NO',UNKNOWN:'UNKNOWN'});
const CLOSED_GATES=['DISABLED','STAGED'];
const FAILED=['failure','cancelled'];
const DELIVERY_URL='https://research.visionuniverse.de/company-intelligence-delivery.json?gate-decision=';

/** Hat dieser Lauf den GOOD-Zeiger selbst geschrieben? health.json (runRefresh) belegt es; der Lauf-Id-Abgleich schliesst fremde Dateien aus. */
export function deriveMutation({publish,outcomes={},health=null,runId=null}){
 if(!publish)return MUTATION.NO;
 const h=health&&typeof health==='object'&&(!runId||String(health.runId)===String(runId))?health:null;
 if(h?.published===true&&h.verification!==true)return MUTATION.YES;
 const run=outcomes.run;
 if(run==='success')return MUTATION.UNKNOWN; // Erfolg ohne Veroeffentlichungsbeleg: nicht beweisbar, also nicht "keine Mutation"
 if(run==='cancelled')return MUTATION.UNKNOWN; // Abbruch kann zwischen Zeiger-Schreiben und health.json liegen
 return MUTATION.NO; // failure/skipped/leer: runRefresh meldet published=false, Zeiger wird erst im letzten Schritt geschrieben
}

const usable=probe=>!!probe&&probe.available===true&&(CLOSED_GATES.includes(probe.gateState)||['FOUND','ABSENT'].includes(probe.served?.status));

/** Reine Entscheidung. Alle Zustaende kommen als Parameter; kein I/O. */
export function decide({publish=false,recover=false,outcomes={},health=null,baseline=null,probe=null,runId=null}={}){
 const mutation=deriveMutation({publish,outcomes,health,runId});
 const out=(decision,reason,rollback=false)=>({decision,reason,rollback,mutation});
 if(!publish)return out(DECISION.NONE,'NO_PRODUCTION_PUBLICATION');
 if(mutation===MUTATION.NO)return out(DECISION.NONE,'PRE_MUTATION_FAILURE');
 const failed=['run','dispatch','served','liveqa','observe'].filter(k=>FAILED.includes(outcomes[k]));
 if(!failed.length)return out(DECISION.NONE,'NO_RELEVANT_STEP_FAILURE');
 const expected=health?.consumerGeneration||null;
 // Rollback nur, wenn der GOOD-Zeiger noch unsere Generation traegt; ist die Probe unlesbar, bleibt es beim bisherigen Verhalten.
 const rollbackOk=probe?.available===true?(!!expected&&probe.goodGeneration===expected):true;
 if(outcomes.liveqa==='failure')return out(DECISION.CLOSE,'OWN_PUBLICATION_LIVE_QA_FAILED',rollbackOk);
 if(!usable(probe))return out(DECISION.CLOSE,'PROBE_UNAVAILABLE_AFTER_OWN_MUTATION',rollbackOk);
 const baseGate=baseline?.available===true?baseline.gateState:null;
 const legitimateOpening=recover&&outcomes.run==='success';
 if(probe.gateState==='AVAILABLE'&&baseGate&&CLOSED_GATES.includes(baseGate)&&!legitimateOpening)return out(DECISION.CLOSE,'GATE_OPENED_WITHOUT_LEGITIMACY',rollbackOk);
 if(CLOSED_GATES.includes(probe.gateState))return out(DECISION.NONE,'GATE_ALREADY_CLOSED_NOTHING_EXPOSED');
 // Ab hier: Gate AVAILABLE und die ausgelieferte Generation ist lesbar (FOUND) oder fehlt (ABSENT).
 const served=probe.served.status==='FOUND'?probe.served.generation:null;
 if(served&&expected&&served===expected)return out(DECISION.NONE,'OWN_GENERATION_SERVED_HEALTHY');
 const before=baseline?.available===true&&baseline.served?.status==='FOUND'?baseline.served.generation:null;
 const goodPlausible=probe.goodGeneration===expected||(!!baseline?.goodGeneration&&probe.goodGeneration===baseline.goodGeneration);
 if(served&&before&&served===before&&goodPlausible)return out(DECISION.NONE,'DELIVERY_NOT_YET_UPDATED');
 return out(DECISION.CLOSE,'WRONG_GENERATION_SERVED',rollbackOk);
}

/** Nur-Lese-Probe der Produktion: Gate, aktiver GOOD, ausgelieferte Generation. Wirft nie; Unlesbares => available=false. */
export async function probeProduction({driver,fetcher=fetch}={}){
 const result={available:false,reason:null,gateState:null,activeNamespace:null,goodGeneration:null,served:{status:'UNKNOWN',generation:null}};
 try{
  const {approval}=await import('./production-approval.mjs'),{prefixFor}=await import('./public-delivery.mjs');
  const {readGateState}=await import('./production-observation.mjs'),{activeNamespace,goodState}=await import('./refresh-storage.mjs');
  const gate=await readGateState({read:()=>driver.get(prefixFor(approval.namespace)+'gate.json'),approvalId:approval.approvalId,generation:approval.consumerGeneration});
  if(!gate.gateState){result.reason=gate.gateReason||'GATE_UNREADABLE';return result;}
  result.gateState=gate.gateState;
  result.activeNamespace=await activeNamespace(driver);
  const good=await goodState(driver,result.activeNamespace);
  if(!good){result.reason='GOOD_MISSING';return result;}
  result.goodGeneration=good.generation;
  result.available=true;
 }catch(error){result.available=false;result.reason='R2_PROBE_FAILED_'+String(error?.name||'ERROR').replace(/[^A-Za-z0-9]/g,'').slice(0,40);return result;}
 try{
  const r=await fetcher(DELIVERY_URL+Date.now(),{signal:AbortSignal.timeout(15000)});
  if(r.status===404)result.served={status:'ABSENT',generation:null};
  else if(!r.ok)result.served={status:'ERROR',generation:null,http:r.status};
  else{const d=await r.json();result.served=typeof d?.generation==='string'?{status:'FOUND',generation:d.generation}:{status:'ERROR',generation:null};}
 }catch{result.served={status:'ERROR',generation:null};}
 return result;
}

const readJson=file=>{try{return JSON.parse(readFileSync(file,'utf8'));}catch{return null;}};
/* Nur feste Codes in Ausgaben, nie Berichtsinhalt. */
const safe=v=>String(v??'').replace(/[^A-Za-z0-9_,.:\- ]/g,'?').slice(0,160);
const stage=(outcome)=>safe(outcome||'-');

export async function main(argv=process.argv.slice(2),env=process.env,{driverFactory,fetcher=fetch,probe:probeFn}={}){
 const mode=argv[0]||'decide',root=env.REPORT_ROOT||env.RUNNER_TEMP&&join(env.RUNNER_TEMP,'ci-profile-source')||'/tmp';
 const makeDriver=driverFactory||(async()=>(await import('../market/storage/s3-driver.mjs')).createS3DriverFromEnv());
 if(mode==='baseline'){
  let probe;
  try{probe=await(probeFn||(async()=>probeProduction({driver:await makeDriver(),fetcher})))();}catch{probe={available:false,reason:'DRIVER_UNAVAILABLE'};}
  try{mkdirSync(root,{recursive:true});writeFileSync(join(root,'baseline.json'),JSON.stringify({...probe,checkedAt:new Date().toISOString()})+'\n');}catch{/* Beleg ist Zusatz; fehlt er, gilt die Basis als unbekannt */}
  console.log(`Produktionsbasis (nur lesend): gate=${safe(probe.gateState)} served=${safe(probe.served?.status)} verfuegbar=${probe.available}`);
  return probe;
 }
 const publish=env.PUBLISH==='true',recover=env.RECOVER_FULL_SCOPE==='true',runId=env.GITHUB_RUN_ID||null;
 const outcomes={run:env.OUTCOME_RUN,dispatch:env.OUTCOME_DISPATCH,served:env.OUTCOME_SERVED,liveqa:env.OUTCOME_LIVEQA,observe:env.OUTCOME_OBSERVE};
 const health=readJson(join(root,'health.json')),baseline=readJson(join(root,'baseline.json'));
 let result;
 try{
  // Die Probe ist nur noetig, wenn eine Mutation vorliegt; Fehler vor der Mutation brauchen keinen R2-Zugriff.
  const needsProbe=publish&&deriveMutation({publish,outcomes,health,runId})!==MUTATION.NO&&outcomes.liveqa!=='failure';
  const probe=needsProbe?await(probeFn||(async()=>probeProduction({driver:await makeDriver(),fetcher})))():null;
  result=decide({publish,recover,outcomes,health,baseline,probe,runId});
 }catch(error){
  // Fail-closed: bei einem Fehler der Entscheidung selbst nur bei (moeglicher) Mutation schliessen.
  const mutation=deriveMutation({publish,outcomes,health,runId});
  result=mutation===MUTATION.NO?{decision:DECISION.NONE,reason:'PRE_MUTATION_FAILURE',rollback:false,mutation}:{decision:DECISION.CLOSE,reason:'DECISION_ERROR_FAIL_CLOSED_'+safe(error?.name),rollback:false,mutation};
 }
 const line=`Fehlerpfad-Entscheidung: ${result.decision} (${safe(result.reason)}), eigene Mutation=${result.mutation}, run=${stage(outcomes.run)} dispatch=${stage(outcomes.dispatch)} served=${stage(outcomes.served)} liveqa=${stage(outcomes.liveqa)} observe=${stage(outcomes.observe)}`;
 console.log(line);
 if(result.decision===DECISION.NONE&&result.reason!=='NO_PRODUCTION_PUBLICATION'&&result.reason!=='NO_RELEVANT_STEP_FAILURE')console.log(`::warning::Company Intelligence Profil-/Quellen-Lauf fehlgeschlagen, Gate und GOOD bleiben unveraendert (${safe(result.reason)}); Produktionszustand pruefen.`);
 if(result.decision===DECISION.CLOSE)console.log(`::error::Company Intelligence Gate wird geschlossen (${safe(result.reason)}).`);
 try{mkdirSync(root,{recursive:true});writeFileSync(join(root,'failure-gate-decision.json'),JSON.stringify({...result,outcomes})+'\n');}catch{/* optional */}
 if(env.GITHUB_OUTPUT)appendFileSync(env.GITHUB_OUTPUT,`decision=${result.decision}\nreason=${safe(result.reason)}\nrollback=${result.rollback===true}\n`);
 if(env.GITHUB_STEP_SUMMARY){try{appendFileSync(env.GITHUB_STEP_SUMMARY,line+'\n');}catch{/* optional */}}
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{await main();}catch{console.log('::error::failure-gate-decision crashed');process.exitCode=1;}
}
