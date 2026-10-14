// Waechter fuer company-intelligence-refresh.yml (eigener Workflow, eigene Concurrency-Gruppe).
//
// Warum ausserhalb des Refresh-Workflows: Jeder Schedule-Lauf besetzt die Gruppe
// company-intelligence-continuous-production, bevor ein Gate-Job entscheiden kann;
// GitHub haelt nur EINEN wartenden Lauf je Gruppe, ein neuer verdraengt den alten
// (cancelled). Ein zusaetzlicher Cron IM Refresh-Workflow verdoppelte diese
// Ankuenfte. Der Waechter laeuft in einer eigenen Gruppe und stoesst den Refresh nur
// dann per workflow_dispatch an, wenn (a) der letzte erfolgreiche Produktionslauf
// aelter als WATCHDOG_STALE_HOURS (4,5 h) ist und (b) in der Produktionsgruppe weder
// ein Lauf laeuft noch wartet (Refresh, profile-source, universe-release).
//
// Fail-safe-Richtung ist hier das Gegenteil des Gates: bei JEDER Unsicherheit wird
// NICHT dispatcht und der Job schlaegt sichtbar fehl (der Primaerslot laeuft ohnehin).
import {appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {collectRuns,decide,loadConfig,makeFetchJson} from './scheduler-gate.mjs';

export const GROUP_WORKFLOWS=Object.freeze(['company-intelligence-refresh.yml','company-intelligence-profile-source.yml','company-intelligence-universe-release.yml']);
export const BUSY_STATUSES=Object.freeze(['queued','in_progress','waiting','pending','requested']);
export const STALE_HOURS=4.5;

// Zaehlt Laeufe, die die Gruppe halten oder darauf warten. API-Fehler wirft.
export async function busyRuns({fetchJson,repo,workflows=GROUP_WORKFLOWS,statuses=BUSY_STATUSES}){
  const busy=[];
  for(const wf of workflows)for(const status of statuses){
    const d=await fetchJson(`/repos/${repo}/actions/workflows/${wf}/runs?status=${status}&per_page=5`);
    if(!d||typeof d.total_count!=='number'||!Array.isArray(d.workflow_runs))throw new Error('BUSY_LIST_MALFORMED');
    if(d.total_count>0)busy.push({workflow:wf,status,count:d.total_count});
  }
  return busy;
}

export async function evaluateWatchdog({fetchJson,repo,now=new Date(),configPath,staleHours=STALE_HOURS}){
  const no=(reason,extra={})=>({dispatch:false,financial:true,reason,...extra});
  try{
    const busy=await busyRuns({fetchJson,repo});
    if(busy.length)return no('GROUP_BUSY',{busy});
    const config={guardHours:staleHours,...(configPath?loadConfig(configPath):{})};
    const runs=await collectRuns({fetchJson,repo,workflowFile:GROUP_WORKFLOWS[0]});
    const d=decide({event:'schedule',now,runs,config});
    if(d.failSafe)return no('UNSURE_NO_DISPATCH:'+d.reason);
    if(!d.run)return no(d.reason,{lastProductionAgeHours:d.lastProductionAgeHours});
    return {dispatch:true,financial:d.financial,reason:d.reason,lastProductionAgeHours:d.lastProductionAgeHours};
  }catch(error){
    return {...no('API_OR_CONFIG_ERROR:'+String(error&&error.message||error).slice(0,80)),error:true};
  }
}

async function main(){
  const env=process.env;
  const result=await evaluateWatchdog({fetchJson:makeFetchJson(env.GH_TOKEN,env.CI_GATE_API_BASE||undefined),repo:env.GITHUB_REPOSITORY,
    configPath:'company-intelligence/config/continuous-refresh.json',staleHours:env.WATCHDOG_STALE_HOURS?Number(env.WATCHDOG_STALE_HOURS):STALE_HOURS});
  if(env.GITHUB_OUTPUT)appendFileSync(env.GITHUB_OUTPUT,`dispatch=${result.dispatch}\nfinancial=${result.financial}\nreason=${result.reason}\n`);
  const text='Refresh watchdog: '+JSON.stringify(result);
  console.log(text);
  if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,'```\n'+text+'\n```\n');
  if(result.error)process.exitCode=1; // sichtbar machen; nichts dispatchen
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  main().catch(error=>{
    console.log('Refresh watchdog failed, no dispatch: '+String(error&&error.message||error).slice(0,120));
    if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'dispatch=false\n');
    process.exitCode=1;
  });
}
