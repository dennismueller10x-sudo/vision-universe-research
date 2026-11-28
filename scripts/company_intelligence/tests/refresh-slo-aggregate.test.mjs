import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAggregate,historyEntry,HISTORY_MAX,AGGREGATE_PATH,robotsRolling,ROBOTS_RUN_WARN,ROBOTS_ROLLING_RUNS} from '../refresh-slo-aggregate.mjs';
import {robotsRun,applyBacklog} from '../backlog-slo.mjs';

const verdict=(o={})=>({status:'WARNING',refreshBasis:'BACKLOG_RATIO_FULL_SCOPE',refreshSLO:'WARNING',backlogSLO:'CRITICAL',backlogRatio:0.25301,dueOverSevenDays:1347,eligibleSources:5324,
 reportAsOf:'2026-11-28T10:14:00Z',pythonRuntimeSeconds:1120.4,runtimeSLO:'HEALTHY',newsLaneSLO:'HEALTHY',secLaneSLO:'HEALTHY',
 blockedByOperator:{sources:640,activeApprovedSources:5324,share:0.12022,basis:'ROBOTS_TXT_HTTP_403_OR_401'},blockedByOperatorSLO:'HEALTHY',...o});
const NOW=new Date('2026-11-28T11:00:00Z');

test('RA-1 Aggregat: nur Zahlen und Urteile, Anteil gerundet, Hinweise auf fehlende Privat-/Quellenzeilen',()=>{
 const a=buildAggregate(verdict(),null,NOW);
 assert.equal(AGGREGATE_PATH,'company-intelligence/data/refresh-slo.json');
 assert.equal(a.schema,1);assert.equal(a.asOf,NOW.toISOString());assert.equal(a.status,'WARNING');
 assert.equal(a.backlogRatio,0.253);assert.equal(a.dueOverSevenDays,1347);assert.equal(a.eligibleSources,5324);
 assert.deepEqual(a.blockedByOperator,{sources:640,activeApprovedSources:5324,share:0.1202,basis:'ROBOTS_TXT_HTTP_403_OR_401'});
 assert.equal(a.blockedByOperatorSLO,'HEALTHY');
 assert.equal(a.privateOperationalRowsIncluded,false);assert.equal(a.sourceRowsIncluded,false);assert.equal(a.contentIncluded,false);
 // Kein Schluessel traegt Quellen, Hosts oder Inhalte.
 assert.ok(!/https?:|sourceId|companyId|ticker|\.com/i.test(JSON.stringify(a)));
 assert.equal(a.history.length,1);assert.deepEqual(a.history[0],historyEntry(verdict()));
});

test('RA-2 Verlauf: ein Eintrag je Bericht, gleicher Bericht ersetzt, sortiert, auf HISTORY_MAX begrenzt',()=>{
 let prev=null;
 for(let i=0;i<HISTORY_MAX+5;i++){
  const at=new Date(Date.UTC(2026,10,1,0,i)).toISOString();
  prev=buildAggregate(verdict({reportAsOf:at,dueOverSevenDays:2000-i}),prev,NOW);
 }
 assert.equal(prev.history.length,HISTORY_MAX);
 assert.equal(prev.history.at(-1).dueOverSevenDays,2000-(HISTORY_MAX+4));
 assert.ok(prev.history.every((e,i,a)=>i===0||a[i-1].asOf<e.asOf));
 const again=buildAggregate(verdict({reportAsOf:prev.history.at(-1).asOf,dueOverSevenDays:1}),prev,NOW);
 assert.equal(again.history.length,HISTORY_MAX);assert.equal(again.history.at(-1).dueOverSevenDays,1);
});

test('RA-3 Fehlende Angaben bleiben null, kaputter Vorstand und fehlender Bericht brechen nichts',()=>{
 const a=buildAggregate({status:'CRITICAL'},{history:'kaputt'},NOW);
 assert.equal(a.status,'CRITICAL');assert.equal(a.backlogRatio,null);assert.equal(a.blockedByOperator,null);assert.equal(a.history.length,0);
 const b=buildAggregate(verdict({blockedByOperator:undefined,blockedByOperatorSLO:undefined}),null,NOW);
 assert.equal(b.blockedByOperator,null);assert.equal(b.history[0].blockedByOperatorShare,null);
});

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
test('RA-4 Health-Workflow: schreibt das Aggregat nur in den Datenzweig, nie nach main, ohne zusaetzlichen Commit auf main',()=>{
 const w=readFileSync(resolve('.github/workflows/company-intelligence-health.yml'),'utf8');
 assert.match(w,/push-data-branch\.sh data\/live company-intelligence\/data\/refresh-slo\.json/);
 assert.doesNotMatch(w,/push-with-retry|commit-and-push|git push|git commit/,'kein Commit auf main');
 assert.match(w,/seed-data-branch\.sh companyIntelligenceRefresh/,'bisheriger Verlauf aus dem Datenzweig');
 // Der Worktree von push-data-branch.sh erbt das Sparse-Checkout: liegt der Pfad ausserhalb, verweigert git add ihn (Lauf 46147166954).
 assert.match(w,/sparse-checkout: \|[\s\S]*?\n            company-intelligence\/data\n/,'Pfad der Aggregat-Datei im Sparse-Checkout');
 assert.match(w,/if: always\(\) && github\.ref == 'refs\/heads\/main'/,'nur Laeufe auf main, auch bei SLO CRITICAL');
 // Scheitern ist sichtbar: Fehlermeldung und roter Lauf, nie nur eine Warnung (Steuerung 28.11.2026).
 const schritt=w.slice(w.indexOf('Aggregat in den Datenzweig schreiben'),w.indexOf('actions/upload-artifact'));
 assert.doesNotMatch(schritt,/::warning::/,'kein stilles Scheitern');
 for(const was of ['Datenzweig data/live nicht eingespielt','nicht gebaut','nicht in den Datenzweig data/live geschrieben'])assert.match(schritt,new RegExp('::error::Refresh-SLO-Aggregat[^"\\n]*'+was));
 assert.match(schritt,/exit "\$rc"/,'rc wird ausgegeben');
 // Workflow-Ebene bleibt lesend; Schreibrecht nur am Job.
 assert.match(w,/^permissions:\n  contents: read\n  actions: read\n/m);
 assert.match(w,/jobs:\n  health:[\s\S]*?permissions:\n      contents: write\n/);
 const reg=JSON.parse(readFileSync(resolve('core/registry/data-branch.json'),'utf8')).domains.find(d=>d.id==='companyIntelligenceRefresh');
 assert.equal(reg.phase,'BRANCH_ONLY');assert.deepEqual(reg.paths,['company-intelligence/data/refresh-slo.json']);assert.equal(reg.workflow,'company-intelligence-health.yml');
});

test('RA-5 Robots-Sperren je Lauf: Anteil der geprueften Quellen, gleitend ueber 3 Laeufe, Alarm nur bei voller Laufzahl und ueber 25 %',()=>{
 assert.equal(ROBOTS_RUN_WARN,0.25);assert.equal(ROBOTS_ROLLING_RUNS,3);
 // robotsRun liest die Felder des Produktions-Health (kein Audit noetig)
 assert.deepEqual(robotsRun({sourceOutcomes:{ROBOTS_TEMPORARY_FAILURE:6,SUCCESS:49},sourcesChecked:115}),{failed:6,checked:115,share:6/115,basis:'ROBOTS_TEMPORARY_FAILURE_OF_CHECKED_SOURCES_IN_RUN'});
 assert.equal(robotsRun({sourceOutcomes:{SUCCESS:1},sourcesChecked:0}),null);assert.equal(robotsRun({}),null);
 assert.equal(robotsRun({sourceOutcomes:{SUCCESS:5},sourcesChecked:5}).failed,0,'ohne Schluessel: keine Robots-Fehler im Lauf');
 assert.equal(robotsRun({sourcesChecked:5}),null,'ohne sourceOutcomes: unbekannt');
 const mk=(at,failed,checked)=>verdict({reportAsOf:at,robotsRun:{failed,checked,share:failed/checked,basis:'X'}});
 let a=buildAggregate(mk('2026-11-28T00:00:00Z',125,207),null,NOW);
 assert.equal(a.robotsRolling3.runs,1);assert.equal(a.robotsRolling3.slo,null,'ein Lauf loest nicht aus');
 a=buildAggregate(mk('2026-11-28T03:00:00Z',53,165),a,NOW);assert.equal(a.robotsRolling3.slo,null);
 a=buildAggregate(mk('2026-11-28T06:00:00Z',9,118),a,NOW);
 assert.equal(a.robotsRolling3.runs,3);assert.equal(a.robotsRolling3.failed,187);assert.equal(a.robotsRolling3.checked,490);assert.equal(a.robotsRolling3.share,0.3816);assert.equal(a.robotsRolling3.slo,'WARNING');
 // Ausreisser: ein hoher Lauf zwischen ruhigen loest nicht aus
 let b=null;for(const [at,f,c] of [['2026-11-28T00:00:00Z',5,120],['2026-11-28T03:00:00Z',60,150],['2026-11-28T06:00:00Z',6,115]])b=buildAggregate(mk(at,f,c),b,NOW);
 assert.equal(b.robotsRolling3.share,0.1844);assert.equal(b.robotsRolling3.slo,'HEALTHY');
 // das Fenster gleitet: nur die letzten 3
 b=buildAggregate(mk('2026-11-28T09:00:00Z',6,115),b,NOW);assert.equal(b.robotsRolling3.failed,72);assert.equal(b.robotsRolling3.runs,3);
 assert.equal(b.robotsRun.share,0.0522);
 // ohne Angaben im Health: kein Alarm, keine Zahl
 assert.equal(buildAggregate(verdict(),null,NOW).robotsRolling3,null);assert.equal(robotsRolling([]),null);
 // applyBacklog uebernimmt robotsRun aus dem Produktions-Health
 const rep={verification:false,scope:'PER_ISSUER_ELIGIBILITY',cohortIssuers:5016,eligibleSources:5324,asOf:new Date().toISOString(),scheduler:{dueOverSevenDays:1343},sourceOutcomes:{ROBOTS_TEMPORARY_FAILURE:6},sourcesChecked:115,health:{}};
 const out=applyBacklog({status:'HEALTHY',refreshSLO:'HEALTHY',buildSLO:'HEALTHY',publicationSLO:'HEALTHY'},rep,Date.now());
 assert.equal(out.robotsRun.failed,6);assert.equal(out.robotsRun.checked,115);
});
