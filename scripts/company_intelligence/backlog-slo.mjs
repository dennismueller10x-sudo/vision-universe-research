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
/* Laufzeit-Fruehwarnung (Steuerung 25.11.2026): Der Python-Refresh hat in refresh-run.mjs (Belegdatei, gesperrt) einen festen Prozess-Timeout von 1200 s;
   die Voll-Laeufe enden bei Median 1140 s, Maximum 1158 s (Abstand 42 s). Ueber 1180 s: WARNING im Health-Lauf, kein Abbruch, kein CRITICAL. */
export const RUNTIME_WARN_SECONDS=1180,PROCESS_TIMEOUT_SECONDS=1200;
export function runtimeSLO(seconds){return Number.isFinite(seconds)?(seconds>RUNTIME_WARN_SECONDS?'WARNING':'HEALTHY'):null;}
/* "Blockiert vom Betreiber" (Steuerung 28.11.2026): Quellen, deren robots.txt der Betreiber mit HTTP 403/401 abweist (WAF/CDN).
   Sie bleiben im Rueckstand, werden aber nicht still herausgerechnet: eigene Zahl mit Anteil an den aktiven Quellen, und ein eigener
   Alarm (WARNING, nie CRITICAL), wenn der Anteil ueber 15 % steigt. Quelle: sourceRegistryAudit.blockedByOperator (source_registry_audit.py). */
export const BLOCKED_SHARE_WARN=0.15;
export function blockedSLO(share){return Number.isFinite(share)?(share>BLOCKED_SHARE_WARN?'WARNING':'HEALTHY'):null;}
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
 const rt=runtimeSLO(report.runtimeSeconds);
 if(rt){out.pythonRuntimeSeconds=report.runtimeSeconds;out.runtimeSLO=rt;if(rt==='WARNING')all.push('WARNING');}
 const bo=report.sourceRegistryAudit?.blockedByOperator,bs=blockedSLO(bo?.share);
 if(bs){out.blockedByOperator={sources:bo.sources,activeApprovedSources:bo.activeApprovedSources,share:bo.share,basis:bo.basis||null};out.blockedByOperatorSLO=bs;if(bs==='WARNING')all.push('WARNING');}
 out.status=all.includes('CRITICAL')?'CRITICAL':all.includes('WARNING')?'WARNING':out.publicationSLO==='OFF'?'OFF':'HEALTHY';
 out.exitCode=out.status==='CRITICAL'?1:0;
 return out;
}
/* Herkunft (Befund BB 24.11.2026): `actions/artifacts` listet Artefakte aller Laeufe, auch von Pull-Requests. Nur Artefakte eines Laufs auf main aus dem
   EIGENEN Repository zaehlen (workflow_run.head_branch == main und head_repository_id == repository_id, wie bei der Basis des Schnellwegs, #2370).
   Fehlt die Herkunftsangabe oder ist sie unvollstaendig, gilt das Artefakt nicht (fail-closed). */
export const fromMain=a=>{const w=a?.workflow_run;return !!w&&w.head_branch==='main'&&w.head_repository_id!=null&&w.repository_id!=null&&w.head_repository_id===w.repository_id;};
/* Juengstes Produktionsartefakt (nicht Verifikation) mit Scheduler-Daten waehlen. artifacts: [{name,created_at,expired,workflow_run:{head_branch,head_repository_id,repository_id}}], read(a)->report|null */
export function pickReport(artifacts,read){
 const list=(artifacts||[]).filter(a=>a&&!a.expired&&fromMain(a)&&String(a.name).startsWith(ARTIFACT_PREFIX)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
 for(const a of list.slice(0,8)){let r=null;try{r=read(a);}catch{}if(r&&r.verification===false&&r.scheduler)return r;}
 return null;
}
const gh=p=>execFileSync('gh',['api',p],{encoding:'buffer',maxBuffer:64*1024*1024});
/* Gesundheitsartefakte NUR ueber die Laeufe von company-intelligence-refresh.yml auf main (Befund 24.11.2026): `actions/artifacts?per_page=100`
   liefert repoweit nur die juengsten 100 Artefakte aller Laeufe; bei dem Aufkommen anderer Laeufe lag der Bericht des letzten Vollumfang-Laufs
   schnell dahinter und das Rueckstandsurteil fiel auf die Stempelbasis zurueck (Health 20:57 und 00:57 'kein Vollumfang-Bericht lesbar').
   Jetzt: die letzten 20 Laeufe des Refresh-Workflows auf main, je Lauf dessen Artefakte (sie tragen workflow_run fuer fromMain). Ein Lauf, dessen
   Artefaktliste nicht lesbar ist, wird uebersprungen (nie ein Abbruch des Health-Laufs). gh ist einspeisbar (Test). */
export const REFRESH_WORKFLOW='company-intelligence-refresh.yml';
export function listRefreshArtifacts(repo,ghApi=gh){
 const runs=JSON.parse(Buffer.from(ghApi(`repos/${repo}/actions/workflows/${REFRESH_WORKFLOW}/runs?branch=main&per_page=20`)).toString('utf8')).workflow_runs||[];
 return runs.flatMap(r=>{try{return JSON.parse(Buffer.from(ghApi(`repos/${repo}/actions/runs/${r.id}/artifacts?per_page=30`)).toString('utf8')).artifacts||[];}catch{return [];}});
}
function readFromGitHub(repo){
 return {
  list:()=>listRefreshArtifacts(repo),
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
 if(final.runtimeSLO==='WARNING')console.log(`::warning::Company Intelligence Python-Laufzeit ${final.pythonRuntimeSeconds} s (Warnung ab ${RUNTIME_WARN_SECONDS} s, fester Prozess-Timeout ${PROCESS_TIMEOUT_SECONDS} s in refresh-run.mjs)`);
 if(final.blockedByOperatorSLO==='WARNING')console.log(`::warning::Company Intelligence: ${final.blockedByOperator.sources} von ${final.blockedByOperator.activeApprovedSources} aktiven Quellen (${Math.round(final.blockedByOperator.share*1000)/10} %) sind vom Betreiber blockiert (robots.txt HTTP 403/401), Alarm ab ${BLOCKED_SHARE_WARN*100} %`);
 if(final.status==='CRITICAL')console.log(`::error::Company Intelligence SLO CRITICAL (refresh ${final.refreshSLO}${final.backlogRatio!==undefined?' backlog '+final.backlogRatio:''}, build ${final.buildSLO}, publication ${final.publicationSLO}, production ${final.productionState})`);
 process.exitCode=final.exitCode;
}
