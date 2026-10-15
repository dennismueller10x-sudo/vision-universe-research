/* Veroeffentlichungsnachweis nach einem Company-Intelligence-Refresh (Workflow company-intelligence-refresh.yml,
   Schritt deploy_live). Ersetzt die fruehere Inline-Schleife, die beim ersten passenden delivery.json "served" meldete.

   WARUM (Refresh-Laeufe 38630050363 und 38652800358, 14.10.2026):
   1. GitHub Pages liefert hinter Fastly mit cache-control max-age=600 aus, der Cache-Schluessel ignoriert die Query
      (gemessen: verschiedene ?x= liefern HIT mit gleichem age). delivery.json und refresh.json werden je Datei und
      Edge-Knoten gecacht und koennen bis zu zehn Minuten aus verschiedenen Deployments stammen. Ein einzelner Treffer
      belegt nichts; runtime-candidate.mjs sah danach delivery=alt und refresh=neu und brach (zu Recht) ab.
   2. Ist das Produktions-Gate DISABLED, liefert stageProduction kein delivery.json aus. Ein Refresh kann dann nicht
      live veroeffentlicht werden; das Warten darauf endete deterministisch in PRODUCTION_PUBLICATION_SLO_FAILED und
      loeste Rollback und Abschaltung erneut aus.

   REGELN:
   - publicationPlan: nur ein sauber gelesenes, gueltiges Gate mit state DISABLED oder STAGED ergibt GATE_CLOSED
     (stageProduction liefert dann kein delivery.json aus; keine Live-Verifikation, kein Fail-closed: es gibt keine
     Produktion zu pruefen). AVAILABLE und jeder unklare Zustand (Lesefehler, fehlend, ungueltig) bleiben VERIFY.
   - awaitConsistentPublication: delivery.json UND refresh.json muessen die erwartete Generation tragen, und zwar
     ununterbrochen ueber ein volles Cache-Fenster (stableMs > max-age). Jede Abweichung startet das Fenster neu.
     Zwei Fristen: bis zur ERSTEN Beobachtung der neuen Generation (Warteschlange + Build + Deploy) gilt
     propagationMs; ab dieser ersten Beobachtung haben veraltete Edge-Kopien hoechstens cacheMs Restlaufzeit, danach
     muss das Fenster stableMs halten (settleMs = cacheMs + stableMs + Reserve). Danach
     PRODUCTION_PUBLICATION_SLO_FAILED mit Beobachtungen (Generation, Status, Edge, age) als Beleg.
     Zeitmessung monoton (performance.now), Zeitspruenge der Wanduhr verkuerzen kein Fenster.
   Keine Pruefung wird gelockert: die anschliessende Live-QA (refresh-qa.mjs --live) laeuft unveraendert. */
import {pathToFileURL} from 'node:url';
import {readGateState} from './production-observation.mjs';

export const PUBLICATION_DEFAULTS=Object.freeze({
 origin:'https://research.visionuniverse.de',
 propagationMs:20*60000, // bis zur ersten Beobachtung: Warteschlange pages-production + Build (~10 min) + Deploy
 cacheMs:600000,         // cache-control max-age=600 der Pages-Auslieferung
 stableMs:630000,        // ununterbrochen konsistent: max-age plus 30 s Reserve
 reserveMs:60000,
 intervalMs:10000,
 requestTimeoutMs:15000,
 keepObservations:60
});
export const CLOSED_GATE_STATES=Object.freeze(['DISABLED','STAGED']);

export async function publicationPlan(gate){
 const g=await readGateState(gate).catch(()=>({gateState:null,gateReason:'GATE_READ_FAILED'}));
 return {mode:CLOSED_GATE_STATES.includes(g.gateState)?'GATE_CLOSED':'VERIFY',gateState:g.gateState,gateReason:g.gateReason};
}

async function readGeneration(ctx,path){
 try{
  const r=await ctx.fetch(ctx.origin+path+'?refresh='+ctx.now(),{signal:AbortSignal.timeout(ctx.requestTimeoutMs)});
  const h=k=>r.headers?.get?.(k)??null,meta={status:r.status,edge:h('x-served-by'),age:h('age'),cache:h('x-cache')};
  if(!r.ok)return {generation:null,...meta};
  let body=null;try{body=await r.json();}catch{}
  return {generation:body&&typeof body==='object'&&typeof body.generation==='string'?body.generation:null,...meta};
 }catch(error){return {generation:null,status:null,error:String(error?.name||'Error')};}
}

export async function awaitConsistentPublication(expected,opts={}){
 const ctx={...PUBLICATION_DEFAULTS,fetch:globalThis.fetch,now:()=>performance.now(),sleep:ms=>new Promise(r=>setTimeout(r,ms)),...opts};
 if(typeof expected!=='string'||!expected)throw Error('EXPECTED_GENERATION_REQUIRED');
 const start=ctx.now(),observations=[],settleMs=ctx.cacheMs+ctx.stableMs+ctx.reserveMs;
 let since=null,firstSeen=null,mismatches=0,firstMismatch=null,lastMismatch=null;
 const deadline=()=>firstSeen===null?start+ctx.propagationMs:firstSeen+settleMs;
 const evidence=at=>({expected,elapsedMs:Math.round(at-start),firstSeenMs:firstSeen===null?null:Math.round(firstSeen-start),stableSinceMs:since===null?null:Math.round(since-start),mismatches,firstMismatch,lastMismatch,observations});
 for(;;){
  const delivery=await readGeneration(ctx,'/company-intelligence-delivery.json'),refresh=await readGeneration(ctx,'/company-intelligence-refresh.json');
  const at=ctx.now(),consistent=delivery.generation===expected&&refresh.generation===expected;
  const o={atMs:Math.round(at-start),consistent,delivery:delivery.generation,refresh:refresh.generation,deliveryStatus:delivery.status,refreshStatus:refresh.status,deliveryEdge:delivery.edge??null,refreshEdge:refresh.edge??null,deliveryAge:delivery.age??null,refreshAge:refresh.age??null};
  observations.push(o);
  if(firstSeen===null&&(delivery.generation===expected||refresh.generation===expected))firstSeen=at;
  if(!consistent){mismatches++;firstMismatch??=o;lastMismatch=o;}
  if(observations.length>ctx.keepObservations)observations.splice(0,observations.length-ctx.keepObservations);
  since=consistent?(since??at):null;
  if(consistent&&at-since>=ctx.stableMs)return {status:'PUBLISHED',generation:expected,stableMs:Math.round(at-since),...evidence(at)};
  if(at>=deadline()){const e=Error('PRODUCTION_PUBLICATION_SLO_FAILED');e.evidence=evidence(at);throw e;}
  await ctx.sleep(Math.max(0,Math.min(ctx.intervalMs,deadline()-at)));
 }
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
export const EXIT_GATE_CLOSED_DURING_VERIFICATION=3;

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const {readFileSync,writeFileSync}=await import('node:fs');
 const args=process.argv.slice(2),arg=k=>args.includes(k)?args[args.indexOf(k)+1]:null;
 if(args[0]==='plan'){
  // Lesefehler (fehlende Zugangsdaten, R2 nicht erreichbar) ergeben VERIFY: der bisherige strenge Pfad bleibt.
  const plan=await readPlanFromEnv();
  console.log(JSON.stringify(plan));
  if(process.env.GITHUB_OUTPUT)writeFileSync(process.env.GITHUB_OUTPUT,`mode=${plan.mode}\n`,{flag:'a'});
 }else if(args[0]==='await'){
  const expected=JSON.parse(readFileSync(arg('--health'))).consumerGeneration,out=arg('--out');
  try{
   const r=await awaitConsistentPublication(expected);
   if(out)writeFileSync(out,JSON.stringify(r,null,1)+'\n');
   console.log(JSON.stringify({status:r.status,generation:r.generation,stableMs:r.stableMs,elapsedMs:r.elapsedMs,firstSeenMs:r.firstSeenMs,mismatches:r.mismatches}));
  }catch(error){
   // Wurde das Gate waehrend des Wartens geschlossen (z. B. Fail-closed eines parallelen Pages-Laufs), gibt es keine
   // Produktion mehr zu pruefen; ein zweiter Rollback waere falsch. Nur ein sauber gelesenes geschlossenes Gate zaehlt.
   const plan=error.message==='PRODUCTION_PUBLICATION_SLO_FAILED'?await readPlanFromEnv():{mode:'VERIFY'};
   const closed=plan.mode==='GATE_CLOSED';
   if(out)writeFileSync(out,JSON.stringify({status:closed?'GATE_CLOSED_DURING_VERIFICATION':'FAILED',error:error.message,gate:plan,...(error.evidence||{})},null,1)+'\n');
   if(closed){console.log(`::notice::Production gate became ${plan.gateState} while waiting; no live verification and no rollback.`);process.exitCode=EXIT_GATE_CLOSED_DURING_VERIFICATION;}
   else{console.log('::error::'+error.message+(error.evidence?` (expected ${error.evidence.expected}, first seen ${error.evidence.firstSeenMs} ms, last mismatch ${JSON.stringify(error.evidence.lastMismatch)})`:''));process.exitCode=1;}
  }
 }else{console.error('usage: refresh-publication.mjs plan | await --health <health.json> [--out <file>]');process.exitCode=2;}
}
