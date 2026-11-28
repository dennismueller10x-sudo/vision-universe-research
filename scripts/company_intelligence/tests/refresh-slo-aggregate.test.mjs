import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAggregate,historyEntry,HISTORY_MAX,AGGREGATE_PATH} from '../refresh-slo-aggregate.mjs';

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
