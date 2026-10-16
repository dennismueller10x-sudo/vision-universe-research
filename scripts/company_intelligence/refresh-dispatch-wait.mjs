/* Auslieferung des Refresh ueber die bestehende Pages-Pipeline: dispatchen, den EIGENEN Pages-Lauf verfolgen, bei Verdraengung
 * begrenzt neu dispatchen und erst nach Fristende scheitern (Workflow company-intelligence-refresh.yml, Schritt deploy_live).
 *
 * WARUM (15.10.2026 20:14-20:18Z): Der Schritt dispatchte `pages-release.yml` EINMAL ohne Lauf-ID und wartete 15 min auf
 * `company-intelligence-delivery.json.generation`. Die Concurrency-Gruppe `pages-production` (cancel-in-progress false) haelt nur
 * EINEN wartenden Lauf: Dutzende workflow_run-Laeufe der Datenjobs verdraengten den Dispatch (Lauf 38798312279 `cancelled`, 0 Jobs),
 * und serielle Laeufe zu je 5-6 min liessen die 15-min-Frist reissen. Folge: PRODUCTION_PUBLICATION_SLO_FAILED, Rollback, Gate zu,
 * obwohl die Daten gut waren (die Generation wurde 3,5 min nach der Frist ausgeliefert).
 *
 * ABLAUF
 *  1. Vor dem Dispatch die vorhandenen workflow_dispatch-Laeufe merken (Lauf-IDs), dann dispatchen.
 *  2. Alle 10 s: erwartete Generation ausgeliefert -> fertig (Exit 0). Sonst eigene Laeufe (neu seit dem Dispatch) beurteilen:
 *     - aktiv (queued/in_progress/waiting/pending): weiter warten.
 *     - `cancelled`/`skipped` (verdraengt) oder nach APPEAR_MS nie erschienen: Re-Dispatch, hoechstens `maxRedispatch` (2) Mal und nur,
 *       wenn die erwartete Generation noch nicht ausgeliefert ist (unmittelbar davor erneut geprueft).
 *     - `failure`/`timed_out`/`startup_failure`/...: ECHTER Fehler, sofort Ende mit Exit 1 (Rollback wie bisher, keine Wiederholung).
 *     - `success`, Generation aber nicht sichtbar: weiter lesen (CDN); die Frist entscheidet.
 *     Obergrenze erreicht: kein weiterer Dispatch, aber weiter nur lesen bis zur Wartefrist (andere Pages-Laeufe liefern evtl. aus).
 *     Nach einem eigenen `success` ohne sichtbare Generation ebenfalls bis zur Wartefrist weiter lesen.
 *  3. Frist (waitDeadline, siehe planDeadlines): Rollback darf erst danach folgen. Laeuft ein eigener Lauf noch (in_progress), wird bis
 *     zur harten Frist weiter gewartet (er liefert evtl. gerade aus); ein noch nicht gestarteter (queued/pending) eigener Lauf wird
 *     abgebrochen, damit er nicht NACH dem Rollback mit altem Stand ausliefert. Ein laufender Lauf wird nie abgebrochen.
 *
 * FRIST-RECHNUNG (alles ab Jobstart `JOB_STARTED_AT`, siehe planDeadlines/guaranteedWaitMs):
 *   Job-Timeout 100 min - Reserve 10 min (Rollback, disable, OFF-Dispatch, Upload; Teil von refresh-live-verify) = Frist der Live-QA t=90.
 *   Wartefrist endet 15 min (Gesamtbudget der Live-QA) davor, t=75. Der Refresh selbst braucht gemessen 25 min.
 *   Garantiertes Warten = 100 - 10 - 15 - 25 = 50 min. EHRLICH: das sind rund 8 warme (6 min) oder rund 4 kalte Pages-Laeufe (13 min,
 *   FULL_UNIVERSE_ROLLOUT.md) hintereinander. Eine laengere Warteschlange scheitert weiterhin (dann Rollback nach der Frist).
 * GRENZEN (dokumentiert in CONTINUOUS_REFRESH.md): "eigener Lauf" = neuer workflow_dispatch-Lauf auf main seit dem ersten Dispatch; ein
 *   fremder Dispatch (manuell, Re-Freeze, profile-source) kann so als eigen zaehlen. Jeder (Re-)Dispatch belegt den einen Wartesteckplatz
 *   der Gruppe pages-production und verdraengt dort einen wartenden fremden Lauf (z. B. Re-Freeze #731, profile-source); das ist
 *   Eigenschaft der Gruppe (cancel-in-progress false, ein Pending) und bei maximal 3 Dispatches begrenzt. Am Fristende wird nur ein
 *   eigener, noch nicht gestarteter Lauf abgebrochen, nie ein laufender und nie ein fremder.
 *
 * Das Skript fuehrt weder Rollback noch Gate-Aenderung aus. Exit 0 = ausgeliefert, Exit 1 = nicht ausgeliefert (der Workflow rollt
 * danach wie bisher zurueck). gh und Auslieferungs-Abfrage sind injizierbar (testbar ohne Netz und ohne Workflow-Lauf).
 */
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {LIMITS as VERIFY_LIMITS} from './refresh-live-verify.mjs';

export const WORKFLOW='pages-release.yml';
export const DELIVERY_URL='https://research.visionuniverse.de/company-intelligence-delivery.json';

export const LIMITS=Object.freeze({
 maxRedispatch:2,                 // zusaetzlich zum ersten Dispatch: hoechstens 3 Dispatches
 pollMs:10000,
 appearMs:180000,                 // ein dispatchter Lauf muss binnen 3 min in der Laufliste erscheinen
 settleMs:600000,                 // nach erfolgreichem eigenem Lauf: so lange auf die sichtbare Generation warten (CDN)
 jobTimeoutMs:VERIFY_LIMITS.jobTimeoutMs, // timeout-minutes des Jobs refresh (einzige Quelle: refresh-live-verify.mjs)
 reserveMs:VERIFY_LIMITS.reserveMs,       // Rollback, disable, OFF-Dispatch, Upload
 verifyCapMs:VERIFY_LIMITS.totalCapMs,    // Gesamtbudget der Live-Verifikation nach der Auslieferung
 minVerifyMs:300000,              // darunter lohnt auch eine Grace-Verlaengerung nicht (hartes Ende der Wartezeit)
 pipelineMaxMs:25*60000,          // gemessene Dauer des Refresh vor dem Pages-Schritt (Kommentar im Workflow)
 minWaitMs:40*60000,              // Mindestwartezeit ab Pipelineende (Untergrenze im Test; tatsaechlich 50 min = ~8 warme oder ~4 kalte Pages-Laeufe zu 6 bzw. 13 min)
 skewMs:60000                     // Uhrenabweichung Runner/GitHub bei createdAt
});

/** Fristen als absolute Zeitpunkte (ms). jobStartMs fehlt: 15 min ab jetzt (frueheres Verhalten, fail-closed statt Job-Timeout). */
export function planDeadlines({jobStartMs=null,nowMs=Date.now(),limits=LIMITS}={}){
 if(!jobStartMs)return {waitDeadlineMs:nowMs+15*60000,hardDeadlineMs:nowMs+15*60000,verifyDeadlineMs:nowMs+15*60000+limits.verifyCapMs};
 const verifyDeadlineMs=jobStartMs+limits.jobTimeoutMs-limits.reserveMs;
 return {waitDeadlineMs:verifyDeadlineMs-limits.verifyCapMs,hardDeadlineMs:verifyDeadlineMs-limits.minVerifyMs,verifyDeadlineMs};
}

/** Garantierte Wartezeit ab Pipelineende im unguenstigsten Fall (Pipeline braucht pipelineMaxMs). */
export const guaranteedWaitMs=(limits=LIMITS)=>limits.jobTimeoutMs-limits.reserveMs-limits.verifyCapMs-limits.pipelineMaxMs;

const ACTIVE=new Set(['queued','in_progress','waiting','pending','requested']);
const PENDING=new Set(['queued','waiting','pending','requested']);   // noch nicht gestartet
const SUPERSEDED=new Set(['cancelled','skipped']);                   // verdraengt (kein Fehler der Pipeline)

/** Eigene Laeufe: neu seit dem Dispatch (nicht in der Vorher-Menge) und nicht aelter als der Dispatch (abzueglich Uhrenabweichung). */
export function ownRuns(runs,{known,sinceMs,skewMs=LIMITS.skewMs}){
 return (runs||[]).filter(r=>r&&!known.has(String(r.databaseId))&&(Date.parse(r.createdAt)||0)>=sinceMs-skewMs);
}

/** Urteil ueber die eigenen Laeufe: ACTIVE | PENDING_ONLY | SUCCESS | SUPERSEDED | FAILED | NONE. Rein. */
export function judge(own){
 if(!own.length)return {verdict:'NONE'};
 const active=own.filter(r=>ACTIVE.has(r.status));
 if(active.length)return {verdict:active.every(r=>PENDING.has(r.status))?'PENDING_ONLY':'ACTIVE',active};
 const done=own.filter(r=>r.status==='completed');
 if(done.some(r=>r.conclusion==='success'))return {verdict:'SUCCESS'};
 const failed=done.filter(r=>!SUPERSEDED.has(r.conclusion));
 if(failed.length)return {verdict:'FAILED',conclusion:failed[0].conclusion||'unknown'};
 return {verdict:done.length?'SUPERSEDED':'NONE'};
}

const result=(served,reason,extra={})=>({served,reason,...extra});

/**
 * Kern ohne Prozess-/Netzzugriff.
 *  gh: {dispatch():Promise, listRuns():Promise<Array<{databaseId,status,conclusion,createdAt}>>, cancel(id):Promise}
 *  generation(): Promise<string|null>  ausgelieferte Generation (null = unbekannt)
 */
export async function waitForDelivery({expected,gh,generation,now=()=>Date.now(),sleep=async()=>{},limits=LIMITS,deadlines}){
 const log=[],note=(event,extra={})=>log.push({at:now(),event,...extra});
 const served=async()=>{try{return (await generation())===expected;}catch{return false;}};
 const list=async()=>{try{return await gh.listRuns();}catch{return null;}};
 let redispatches=0,known=null,firstAt=0,dispatchedAt=0,dispatchFailed=false,successSeenAt=null,graceNoted=false,capped=false,lastReason=null;
 const handled=new Set(); // verdraengte Laeufe frueherer Dispatches: nicht erneut beurteilen

 /* Dispatch. Die Vorher-Menge wird NUR vor dem ersten Dispatch gebildet: so bleibt auch ein spaet erscheinender Lauf eines frueheren
    Dispatches (z. B. #1 taucht erst nach dem Re-Dispatch in der Liste auf) ein eigener Lauf und wird verfolgt/abgebrochen.
    Ein fehlgeschlagener Dispatch verbraucht einen Versuch (kein stilles Weitermachen). */
 const dispatch=async()=>{
  if(known===null){const before=await list();known=new Set((before||[]).map(r=>String(r.databaseId)));firstAt=now();}
  dispatchedAt=now();dispatchFailed=false;
  try{await gh.dispatch();note('dispatch',{n:redispatches+1});}catch{dispatchFailed=true;note('dispatch-failed',{n:redispatches+1});}
  successSeenAt=null;
 };
 const finish=(res)=>({...res,dispatches:redispatches+1,log});
 const own=runs=>ownRuns(runs,{known,sinceMs:firstAt,skewMs:limits.skewMs}).filter(r=>!handled.has(String(r.databaseId)));
 const supersede=async(reason,ownNow)=>{ // Re-Dispatch nur mit Rest-Budget und nur wenn die Generation noch nicht ausgeliefert ist
  if(await served())return 'SERVED';
  if(redispatches>=limits.maxRedispatch)return 'LIMIT';
  redispatches++;note('redispatch',{reason,n:redispatches});
  for(const r of ownNow)if(r.status==='completed')handled.add(String(r.databaseId));
  await dispatch();return 'DONE';
 };
 /* Abbruch eines noch nicht gestarteten eigenen Laufs: Status unmittelbar davor neu lesen (er kann inzwischen gestartet sein); nie in_progress. */
 const cancelIfStillPending=async id=>{
  const fresh=await list();const r=(fresh||[]).find(x=>String(x.databaseId)===String(id));
  if(!r||!PENDING.has(r.status)){note('cancel-skipped',{id,status:r?.status??'unknown'});return;}
  try{await gh.cancel(id);note('cancel-pending',{id});}catch{note('cancel-failed',{id});}
 };

 await dispatch();
 for(;;){
  if(await served())return finish(result(true,'DELIVERED'));
  const t=now();
  const runs=await list();
  const ownNow=runs?own(runs):[];
  const j=runs?judge(ownNow):{verdict:'UNKNOWN'};
  if(j.verdict==='SUCCESS')successSeenAt??=t;
  if(t>=deadlines.waitDeadlineMs){
   /* Frist abgelaufen. Rollback erst, wenn kein eigener Lauf mehr laeuft (und ein gerade erfolgreicher seine Auslieferung zeigen konnte). */
   const settling=j.verdict==='SUCCESS'&&t-successSeenAt<limits.settleMs;
   if((j.verdict==='ACTIVE'||settling)&&t<deadlines.hardDeadlineMs){if(!graceNoted){graceNoted=true;note('grace-active-run');}await sleep(limits.pollMs);continue;}
   if(j.verdict==='PENDING_ONLY'||j.verdict==='ACTIVE'){
    for(const r of j.active.filter(r=>PENDING.has(r.status)))await cancelIfStillPending(r.databaseId);
    return finish(result(false,j.verdict==='ACTIVE'?'RUN_STILL_ACTIVE_AT_HARD_DEADLINE':'PRODUCTION_PUBLICATION_SLO_FAILED',{ownRun:j.verdict,capped,lastReason}));
   }
   return finish(result(false,'PRODUCTION_PUBLICATION_SLO_FAILED',{ownRun:j.verdict,capped,lastReason}));
  }
  if(j.verdict==='FAILED')return finish(result(false,'PAGES_RUN_FAILED',{conclusion:j.conclusion})); // echter Fehler: sofort
  if(!capped&&j.verdict!=='SUCCESS'&&(j.verdict==='SUPERSEDED'||dispatchFailed||(j.verdict==='NONE'&&t-dispatchedAt>=limits.appearMs))){
   const reason=dispatchFailed?'DISPATCH_FAILED':j.verdict==='SUPERSEDED'?'RUN_CANCELLED':'RUN_NEVER_APPEARED';
   const s=await supersede(reason,ownNow);
   if(s==='SERVED')return finish(result(true,'DELIVERED'));
   if(s==='LIMIT'){
    /* Obergrenze erreicht: KEIN weiterer Dispatch, aber weiter lesen bis zur Wartefrist. Im Vorfall verdraengten die workflow_run-Laeufe
       jeden Dispatch, lieferten die Generation aber selbst aus (3,5 min nach der alten Frist). */
    capped=true;lastReason=reason;note('redispatch-limit-reached',{reason});
   }
   continue;
  }
  await sleep(limits.pollMs);
 }
}

/* ---- Prozess-/Netzschicht ---- */
const run=(cmd,args,env)=>new Promise((resolve,reject)=>execFile(cmd,args,{env,timeout:60000,maxBuffer:4<<20},(e,out)=>e?reject(e):resolve(String(out))));

export function realGh(env=process.env){
 return {
  dispatch:()=>run('gh',['workflow','run',WORKFLOW,'--ref','main'],env),
  listRuns:async()=>JSON.parse(await run('gh',['run','list','--workflow',WORKFLOW,'--event','workflow_dispatch','--branch','main','--limit','30','--json','databaseId,status,conclusion,createdAt'],env)),
  cancel:id=>run('gh',['run','cancel',String(id)],env)
 };
}

export const realGeneration=async(fetcher=fetch)=>{
 const r=await fetcher(DELIVERY_URL+'?refresh='+Date.now(),{signal:AbortSignal.timeout(15000)});
 return (await r.json()).generation??null;
};

export async function main(argv=process.argv.slice(2),env=process.env,io={}){
 const arg=n=>{const i=argv.indexOf(n);return i>=0?argv[i+1]:null;};
 const health=arg('--health'),out=arg('--out');
 if(!health){console.error('USAGE: refresh-dispatch-wait.mjs --health <health.json> [--out <file>]');return result(false,'HEALTH_MISSING');}
 let expected;
 try{expected=JSON.parse(readFileSync(health,'utf8')).consumerGeneration;}catch{expected=null;}
 if(typeof expected!=='string'||!expected)return result(false,'EXPECTED_GENERATION_UNKNOWN'); // fail-closed
 const started=Number(env.JOB_STARTED_AT),jobStartMs=Number.isFinite(started)&&started>0&&started*1000<=Date.now()?started*1000:null;
 const deadlines=planDeadlines({jobStartMs});
 const res=await waitForDelivery({expected,gh:io.gh||realGh(env),generation:io.generation||(()=>realGeneration()),
  sleep:io.sleep||(ms=>new Promise(r=>setTimeout(r,ms))),deadlines});
 const safe=v=>String(v??'').replace(/[^A-Za-z0-9_,.:()<>=\- ]/g,'?').slice(0,200);
 const line=`Refresh-Auslieferung: ${res.served?'OK':'FEHLER'} (${safe(res.reason)}), Dispatches: ${res.dispatches}`;
 console.log(line);
 if(!res.served)console.error(safe(res.reason));
 if(env.GITHUB_STEP_SUMMARY){try{appendFileSync(env.GITHUB_STEP_SUMMARY,line+'\n');}catch{/* optional */}}
 if(out){try{mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify({...res,expected:undefined},null,2)+'\n');}catch{/* Beleg optional */}}
 return res;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const r=await main();process.exitCode=r.served?0:1;}catch(error){console.error('REFRESH_DISPATCH_WAIT_ERROR',error?.name);process.exitCode=1;} // fail-closed
}
