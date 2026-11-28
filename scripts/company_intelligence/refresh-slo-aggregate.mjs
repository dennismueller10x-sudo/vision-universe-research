/* Veroeffentlichbares Aggregat des Company-Intelligence-Refresh-SLO (Steuerung 28.11.2026): nur Zahlen, kein Quellen-, Host- oder Inhaltsbezug.
   Quelle ist das Urteil aus refresh-run.mjs health + backlog-slo.mjs (eine Wahrheit). Die Datei geht ueber scripts/ci/push-data-branch.sh in
   den Datenzweig data/live (core/registry/data-branch.json, companyIntelligenceRefresh); /status/ liest sie ueber core/registry/domains.json.
   Verlauf: je Bericht (reportAsOf) ein Eintrag, die letzten HISTORY_MAX; ein erneutes Urteil zum selben Bericht ersetzt den Eintrag. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

export const AGGREGATE_PATH='company-intelligence/data/refresh-slo.json';
export const HISTORY_MAX=60;
export const ROBOTS_RUN_WARN=0.25,ROBOTS_ROLLING_RUNS=3;
const num=v=>Number.isFinite(v)?v:null;
const round=(v,d)=>Number.isFinite(v)?Math.round(v*10**d)/10**d:null;

export function historyEntry(v){
 const b=v.blockedByOperator;
 return {asOf:v.reportAsOf||null,status:v.status||null,backlogRatio:round(v.backlogRatio,4),dueOverSevenDays:num(v.dueOverSevenDays),eligibleSources:num(v.eligibleSources),
  blockedByOperatorShare:b?round(b.share,4):null,blockedByOperatorSources:b?num(b.sources):null,
  robotsFailed:num(v.robotsRun?.failed),robotsChecked:num(v.robotsRun?.checked),robotsShare:v.robotsRun?round(v.robotsRun.share,4):null};
}
/* Gleitend ueber die letzten ROBOTS_ROLLING_RUNS Laeufe (Summe der Fehlschlaege durch Summe der geprueften Quellen); Alarm nur bei voller Laufzahl,
   damit einzelne Ausreisser nicht ausloesen. */
export function robotsRolling(history,n=ROBOTS_ROLLING_RUNS){
 const runs=(history||[]).filter(e=>Number.isFinite(e.robotsFailed)&&Number.isFinite(e.robotsChecked)&&e.robotsChecked>0).slice(-n);
 const failed=runs.reduce((a,e)=>a+e.robotsFailed,0),checked=runs.reduce((a,e)=>a+e.robotsChecked,0);
 if(!runs.length)return null;
 const share=failed/checked;
 return {runs:runs.length,failed,checked,share:round(share,4),slo:runs.length>=n?(share>ROBOTS_RUN_WARN?'WARNING':'HEALTHY'):null};
}
/* verdict: Ausgabe von backlog-slo.mjs (applyBacklog). previous: bisheriges Aggregat oder null. */
export function buildAggregate(verdict,previous,now=new Date()){
 const v=verdict||{},b=v.blockedByOperator||null;
 const entry=historyEntry(v);
 const old=Array.isArray(previous?.history)?previous.history.filter(e=>e&&typeof e.asOf==='string'):[];
 const history=(entry.asOf?old.filter(e=>e.asOf!==entry.asOf):old).concat(entry.asOf?[entry]:[]).sort((x,y)=>String(x.asOf).localeCompare(String(y.asOf))).slice(-HISTORY_MAX);
 return {schema:1,asOf:now.toISOString(),reportAsOf:v.reportAsOf||null,status:v.status||null,refreshBasis:v.refreshBasis||null,refreshSLO:v.refreshSLO||null,backlogSLO:v.backlogSLO||null,
  backlogRatio:round(v.backlogRatio,4),dueOverSevenDays:num(v.dueOverSevenDays),eligibleSources:num(v.eligibleSources),
  blockedByOperator:b?{sources:num(b.sources),activeApprovedSources:num(b.activeApprovedSources),share:round(b.share,4),basis:b.basis||null}:null,
  blockedByOperatorSLO:v.blockedByOperatorSLO||null,pythonRuntimeSeconds:num(v.pythonRuntimeSeconds),runtimeSLO:v.runtimeSLO||null,
  newsLaneSLO:v.newsLaneSLO||null,secLaneSLO:v.secLaneSLO||null,
  robotsRun:v.robotsRun?{failed:num(v.robotsRun.failed),checked:num(v.robotsRun.checked),share:round(v.robotsRun.share,4),basis:v.robotsRun.basis||null}:null,
  robotsRolling3:robotsRolling(history),history,
  privateOperationalRowsIncluded:false,sourceRowsIncluded:false,contentIncluded:false};
}
const read=f=>{try{return JSON.parse(readFileSync(f,'utf8'));}catch{return null;}};
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const args=process.argv.slice(2),arg=k=>{const i=args.indexOf(k);return i>=0?args[i+1]:undefined;};
 const verdict=read(arg('--verdict')),out=arg('--out')||AGGREGATE_PATH;
 if(!verdict){console.log('::warning::Refresh-SLO-Aggregat nicht geschrieben: kein lesbares Urteil');process.exit(0);}
 const agg=buildAggregate(verdict,arg('--previous')?read(arg('--previous')):null);
 mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(agg,null,1)+'\n');
 console.log(JSON.stringify({written:out,status:agg.status,history:agg.history.length}));
 const rr=agg.robotsRolling3;
 if(rr?.slo==='WARNING')console.log(`::warning::Company Intelligence: ${rr.failed} von ${rr.checked} in den letzten ${rr.runs} Laeufen geprueften Quellen scheiterten an robots.txt (${Math.round(rr.share*1000)/10} %, Alarm ueber ${ROBOTS_RUN_WARN*100} %); Anteil der geprueften Quellen der Laeufe, nicht der aktiven Quellen`);
}
