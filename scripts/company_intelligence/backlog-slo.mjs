/* Refresh-SLO bei Vollumfang (PER_ISSUER_ELIGIBILITY): Rueckstandsquote statt Vollstaendigkeits-Stempel.
   Entscheidung Steuerung 20.11.2026 (b): Bei ~5.000 Quellen und 240 Anfragen je Lauf wird ein Lauf nie
   "vollstaendig" (REQUEST_BUDGET_EXHAUSTED), `lastSuccessfulRefresh` bleibt stehen und der SLO ist
   nach 12 h dauerhaft CRITICAL. Jetzt zaehlt: Anteil der Quellen, die mehr als 7 Tage ueberfaellig sind
   (dueOverSevenDays / eligibleSources) aus dem juengsten Produktions-Gesundheitsartefakt, UND die Lane-Stempel
   (News, SEC) bleiben frisch (8 h / 12 h, wie freshness()). Ergaenzt den Stempel, ersetzt ihn nur bei Vollumfang.
   Nicht lesbar oder kein Vollumfang -> Urteil bleibt unveraendert (streng). Nur Lesen, keine Quellen, keine Daten. */
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {freshness} from './refresh-approval.mjs';
export const BACKLOG_LIMITS=Object.freeze({healthy:0.10,warning:0.25});
export const ARTIFACT_PREFIX='company-intelligence-refresh-health-';
const RANK={HEALTHY:0,WARNING:1,CRITICAL:2},worst=(...v)=>v.reduce((a,b)=>RANK[b]>RANK[a]?b:a,'HEALTHY');
export function backlogSLO(ratio){
 if(!Number.isFinite(ratio))return 'CRITICAL';
 return ratio<=BACKLOG_LIMITS.healthy?'HEALTHY':ratio<=BACKLOG_LIMITS.warning?'WARNING':'CRITICAL';
}
export const isFullScope=r=>r?.scope==='PER_ISSUER_ELIGIBILITY'||r?.cohortIssuers>45;
export function backlogRatio(r){
 const over=r?.scheduler?.dueOverSevenDays,total=r?.eligibleSources;
 return Number.isFinite(over)&&Number.isFinite(total)&&total>0?over/total:NaN;
}
/* verdict: Ausgabe von evaluateHealth. report: juengstes Produktions-health.json. Rein, ohne IO. */
export function applyBacklog(verdict,report,now=Date.now()){
 if(!verdict||!report||!isFullScope(report)||report.verification===true||!report.scheduler)return verdict;
 const ratio=backlogRatio(report),h=report.health||{};
 const news=freshness(h.lastSuccessfulNewsRefresh,now),sec=freshness(h.lastSuccessfulSecRefresh,now),backlog=backlogSLO(ratio);
 const reportAge=freshness(report.asOf,now);
 const refreshSLO=worst(backlog,news,sec,reportAge);
 const out={...verdict,refreshBasis:'BACKLOG_RATIO_FULL_SCOPE',stampRefreshSLO:verdict.refreshSLO,
  backlogRatio:Number.isFinite(ratio)?Math.round(ratio*1000)/1000:null,backlogSLO:backlog,
  dueOverSevenDays:report.scheduler.dueOverSevenDays??null,eligibleSources:report.eligibleSources??null,
  newsLaneSLO:news,secLaneSLO:sec,reportAsOf:report.asOf||null,refreshSLO};
 const all=[refreshSLO,out.buildSLO,out.publicationSLO];
 out.status=all.includes('CRITICAL')?'CRITICAL':all.includes('WARNING')?'WARNING':out.publicationSLO==='OFF'?'OFF':'HEALTHY';
 out.exitCode=out.status==='CRITICAL'?1:0;
 return out;
}
/* Juengstes Produktionsartefakt (nicht Verifikation) mit Scheduler-Daten waehlen. artifacts: [{name,created_at,expired}], read(a)->report|null */
export function pickReport(artifacts,read){
 const list=(artifacts||[]).filter(a=>a&&!a.expired&&String(a.name).startsWith(ARTIFACT_PREFIX)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
 for(const a of list.slice(0,8)){let r=null;try{r=read(a);}catch{}if(r&&r.verification===false&&r.scheduler)return r;}
 return null;
}
const gh=p=>execFileSync('gh',['api',p],{encoding:'buffer',maxBuffer:64*1024*1024});
function readFromGitHub(repo){
 return {
  list:()=>JSON.parse(gh(`repos/${repo}/actions/artifacts?per_page=100`).toString('utf8')).artifacts,
  read:a=>{const zip=gh(`repos/${repo}/actions/artifacts/${a.id}/zip`);
   const dir=mkdtempSync(join(tmpdir(),'ci-backlog-'));
   try{const f=join(dir,'a.zip');writeFileSync(f,zip);return JSON.parse(execFileSync('unzip',['-p',f,'health.json'],{encoding:'utf8',maxBuffer:64*1024*1024}));}
   finally{rmSync(dir,{recursive:true,force:true});}}
 };
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1],file=arg('--verdict');
 let verdict;try{verdict=JSON.parse(readFileSync(file,'utf8'));}catch{process.exit(Number(process.env.PRIOR_RC||2));}
 let final=verdict;
 try{
  const io=readFromGitHub(process.env.GITHUB_REPOSITORY);
  const report=pickReport(io.list(),io.read);
  final=applyBacklog(verdict,report);
  if(final===verdict)console.log('::notice::Refresh-SLO: Stempel gilt (kein Vollumfang-Bericht lesbar)');
 }catch(e){console.log('::warning::Rueckstandsquote nicht lesbar, Stempel-Urteil bleibt: '+String(e?.message||e).slice(0,120));}
 writeFileSync(file,JSON.stringify(final,null,2)+'\n');console.log(JSON.stringify(final));
 if(final.status==='CRITICAL')console.log(`::error::Company Intelligence SLO CRITICAL (refresh ${final.refreshSLO}${final.backlogRatio!==undefined?' backlog '+final.backlogRatio:''}, build ${final.buildSLO}, publication ${final.publicationSLO}, production ${final.productionState})`);
 process.exitCode=final.exitCode;
}
