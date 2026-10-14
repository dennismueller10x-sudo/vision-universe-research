// Entscheidung "Lauf starten?" und "Finanz-Refresh?" fuer company-intelligence-refresh.yml.
//
// Ohne R2, ohne Provider: gelesen werden nur die GitHub-Actions-Metadaten dieses
// Repositories (Lauflisten, Artefaktnamen). Das Skript startet nichts.
//
// Warum es das gibt:
//  * Die alte Finanz-Kopplung "UTC-Stunde % 8 == 0" traf nur Schedule-Laeufe, die
//    zufaellig in der richtigen Stunde starteten. GitHub verspaetet Cron um Stunden;
//    der Finanz-Refresh war faktisch inaktiv. Jetzt zaehlt der Zustand: der letzte
//    erfolgreiche Produktionslauf MIT Finanz-Refresh.
//  * Zusaetzliche, versetzte Cron-Slots sind nur dann Redundanz statt Doppellast,
//    wenn ein frischer Produktionslauf den Slot beendet, bevor er Quellen anfasst.
//
// Fail-safe-Richtung: Jede Unsicherheit (API-Fehler, kaputte Antwort, Zeitversatz)
// ergibt run=true und financial=true. Die Wache darf nie still ausfallen lassen.
//
// Markierung erfolgreicher Laeufe: Artefakt "ci-refresh-mode-<runId>-<modus>-<finanz>"
// (modus production|verification, finanz financial|plain), nur bei erfolgreichem
// Lauf hochgeladen. Der Gesundheits-Artefaktname bleibt unveraendert (Scale-Receipt
// der Universe-Freigabe liest ihn).
import {readFileSync,appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const MARKER_PREFIX='ci-refresh-mode-';
export const DEFAULTS=Object.freeze({
  financialHours:8,        // Soll-Spanne; wird aus continuous-refresh.json gelesen
  financialGraceHours:0.5, // Schedule-Verzug: Lauf bei Alter >= Soll - Toleranz
  guardHours:2.5,          // frischer Produktionslauf juenger als das -> Slot ueberspringen
  failureCooldownMinutes:45, // nach einem fehlgeschlagenen Schedule-Lauf kein sofortiger Zweitversuch
  clockSkewMinutes:10      // Zeitstempel weiter in der Zukunft gelten als unglaubwuerdig
});
const HOUR=3600e3,MINUTE=60e3;

export function parseMarker(name,runId){
  const m=/^ci-refresh-mode-(\d+)-(production|verification)-(financial|plain)$/.exec(String(name||''));
  if(!m||(runId!==undefined&&String(runId)!==m[1]))return null;
  return {mode:m[2],financial:m[3]==='financial'};
}
export function markerName(runId,{verification,financial}){
  return `${MARKER_PREFIX}${runId}-${verification?'verification':'production'}-${financial?'financial':'plain'}`;
}
function ms(value){const t=Date.parse(value);return Number.isFinite(t)?t:NaN;}
function failSafe(reason,event){return {run:true,financial:true,reason,event,failSafe:true};}

// Reine Entscheidung. runs: Lauf-Eintraege {id,event,conclusion,startedAt,completedAt,marker}
// des eigenen Workflows (neueste zuerst oder beliebig), marker aus parseMarker oder null.
export function decide({event,now,runs,config={}}){
  const c={...DEFAULTS,...config};
  const nowMs=now instanceof Date?now.getTime():ms(now);
  if(event!=='schedule')return {run:true,financial:true,reason:'NON_SCHEDULE_EVENT_FINANCIAL_ON',event};
  if(!Number.isFinite(nowMs)||!Array.isArray(runs))return failSafe('INPUT_UNREADABLE',event);
  const skew=c.clockSkewMinutes*MINUTE;
  const production=[];let lastFailure=null;
  for(const r of runs){
    if(!r||typeof r!=='object')continue;
    const completed=ms(r.completedAt),started=ms(r.startedAt);
    if(r.conclusion==='success'&&r.marker&&r.marker.mode==='production'&&Number.isFinite(completed)&&Number.isFinite(started)){
      if(completed>nowMs+skew||started>nowMs+skew)return failSafe('RUN_TIMESTAMP_IN_FUTURE',event);
      production.push({started,completed,financial:r.marker.financial===true});
    }else if(r.event==='schedule'&&(r.conclusion==='failure'||r.conclusion==='timed_out')&&Number.isFinite(completed)){
      if(!lastFailure||completed>lastFailure)lastFailure=completed;
    }
  }
  const lastProd=production.reduce((a,r)=>Math.max(a,r.completed),-Infinity);
  const lastFin=production.filter(r=>r.financial).reduce((a,r)=>Math.max(a,r.started),-Infinity);
  // Finanz-Gate: zustandsbasiert. Kein bekannter Finanzlauf -> an.
  const finAge=Number.isFinite(lastFin)?(nowMs-lastFin)/HOUR:Infinity;
  const financial=!(finAge<c.financialHours-c.financialGraceHours);
  const detail={event,financial,financialAgeHours:Number.isFinite(finAge)?+finAge.toFixed(2):null,
    lastProductionAgeHours:Number.isFinite(lastProd)?+((nowMs-lastProd)/HOUR).toFixed(2):null};
  // Frische-Wache: nur erfolgreiche Produktionslaeufe zaehlen (Verifikation nie).
  const prodAge=(nowMs-lastProd)/HOUR;
  if(Number.isFinite(lastProd)&&prodAge<c.guardHours){
    return {...detail,run:false,reason:'FRESH_PRODUCTION_RUN'};
  }
  // Kein Zweitversuch unmittelbar nach einem Fehlschlag (ein Fehler wird nicht verdoppelt).
  if(lastFailure!==null&&(!Number.isFinite(lastProd)||lastFailure>lastProd)&&nowMs-lastFailure<c.failureCooldownMinutes*MINUTE&&nowMs>=lastFailure){
    return {...detail,run:false,reason:'FAILURE_COOLDOWN'};
  }
  return {...detail,run:true,reason:Number.isFinite(lastProd)?'PRODUCTION_RUN_DUE':'NO_MARKED_PRODUCTION_RUN'};
}

// API-Zugriff. fetchJson(path) -> geparstes JSON; wirft bei HTTP-/Parsefehlern.
export async function collectRuns({fetchJson,repo,workflowFile,branch='main',limit=30,maxArtifactLookups=8}){
  const list=await fetchJson(`/repos/${repo}/actions/workflows/${workflowFile}/runs?branch=${encodeURIComponent(branch)}&per_page=${limit}&exclude_pull_requests=true`);
  if(!list||!Array.isArray(list.workflow_runs))throw new Error('RUN_LIST_MALFORMED');
  const runs=[];let lookups=0;let needProd=true,needFin=true;
  const sorted=[...list.workflow_runs].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
  for(const r of sorted){
    if(r.status!=='completed')continue;
    const item={id:r.id,event:r.event,conclusion:r.conclusion,startedAt:r.run_started_at||r.created_at,completedAt:r.updated_at,marker:null};
    if(r.conclusion==='success'&&(needProd||needFin)&&lookups<maxArtifactLookups){
      lookups++;
      const a=await fetchJson(`/repos/${repo}/actions/runs/${r.id}/artifacts?per_page=100`);
      if(!a||!Array.isArray(a.artifacts))throw new Error('ARTIFACT_LIST_MALFORMED');
      for(const art of a.artifacts){
        if(art.expired)continue;
        const m=parseMarker(art.name,r.id);if(m){item.marker=m;break;}
      }
      if(item.marker&&item.marker.mode==='production'){needProd=false;if(item.marker.financial)needFin=false;}
    }
    runs.push(item);
  }
  return runs;
}

export function loadConfig(path){
  const cfg=JSON.parse(readFileSync(path,'utf8'));
  const hours=Number(cfg.financialHours);
  if(!Number.isFinite(hours)||hours<=0)throw new Error('FINANCIAL_HOURS_INVALID');
  return {financialHours:hours};
}

export async function evaluate({event,now=new Date(),fetchJson,repo,workflowFile,configPath,env={}}){
  if(event!=='schedule'){
    // Dispatch/Call: Finanz-Refresh bleibt an, ausser ein Aufrufer setzt ausdruecklich financial=false.
    const base=decide({event,now,runs:[]});
    return env.INPUT_FINANCIAL==='false'?{...base,financial:false,reason:'DISPATCH_FINANCIAL_DISABLED_BY_INPUT'}:base;
  }
  try{
    const config=configPath?loadConfig(configPath):{};
    if(env.CI_GATE_GUARD_HOURS)config.guardHours=Number(env.CI_GATE_GUARD_HOURS);
    if(env.CI_GATE_FINANCIAL_GRACE_HOURS)config.financialGraceHours=Number(env.CI_GATE_FINANCIAL_GRACE_HOURS);
    for(const k of Object.keys(config))if(!Number.isFinite(config[k])||config[k]<0)return failSafe('CONFIG_INVALID',event);
    const runs=await collectRuns({fetchJson,repo,workflowFile});
    return decide({event,now,runs,config});
  }catch(error){
    return failSafe('API_OR_CONFIG_ERROR:'+String(error&&error.message||error).slice(0,80),event);
  }
}

export function makeFetchJson(token,base='https://api.github.com'){
  return async path=>{
    let last;
    for(let attempt=0;attempt<2;attempt++){
      try{
        const response=await fetch(base+path,{signal:AbortSignal.timeout(15000),headers:{accept:'application/vnd.github+json','x-github-api-version':'2022-11-28',...(token?{authorization:'Bearer '+token}:{})}});
        if(!response.ok)throw new Error('HTTP_'+response.status);
        return await response.json();
      }catch(e){last=e;}
    }
    throw last;
  };
}

async function main(){
  const env=process.env;
  if(env.CI_GATE_TEST_CRASH)throw new Error('TEST_CRASH');
  const result=await evaluate({
    event:env.GITHUB_EVENT_NAME,repo:env.GITHUB_REPOSITORY,workflowFile:'company-intelligence-refresh.yml',
    fetchJson:makeFetchJson(env.GH_TOKEN,env.CI_GATE_API_BASE||undefined),configPath:'company-intelligence/config/continuous-refresh.json',env});
  const lines=[`run=${result.run}`,`financial=${result.financial}`,`reason=${result.reason}`];
  if(env.GITHUB_OUTPUT)appendFileSync(env.GITHUB_OUTPUT,lines.join('\n')+'\n');
  const text=`Scheduler gate: ${JSON.stringify(result)}`;
  console.log(text);
  if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,'```\n'+text+'\n```\n');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  // Niemals mit Fehlercode enden: ein Absturz darf den Refresh nicht abschalten.
  main().catch(error=>{
    console.log('Scheduler gate failed safe: '+String(error&&error.message||error).slice(0,120));
    if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'run=true\nfinancial=true\nreason=GATE_CRASH_FAIL_SAFE\n');
  });
}
