import test from 'node:test';
import assert from 'node:assert/strict';
import {backlogSLO,backlogRatio,applyBacklog,pickReport,isFullScope,fromMain} from '../backlog-slo.mjs';
import {evaluateHealth} from '../refresh-approval.mjs';

const H=3600000,NOW=Date.parse('2026-11-20T05:00:00Z'),ago=h=>new Date(NOW-h*H).toISOString();
const GEN='a'.repeat(24);
const verdict=(stampAge=36)=>evaluateHealth({generation:GEN,manifest:{},health:{lastSuccessfulRefresh:ago(stampAge),lastSuccessfulConsumerBuild:ago(1)}},{generation:GEN,lastSuccessfulProductionPublication:ago(1)},{state:'VERIFIED',servedGeneration:GEN,gateState:'AVAILABLE'},NOW);
const report=(over=3000,o={})=>({verification:false,scope:'PER_ISSUER_ELIGIBILITY',cohortIssuers:5016,eligibleSources:5342,asOf:ago(2),scheduler:{dueOverSevenDays:over},health:{lastSuccessfulNewsRefresh:ago(2),lastSuccessfulSecRefresh:ago(2),lastSuccessfulRefresh:ago(36)},...o});

test('Schwellen: <=10 % HEALTHY, <=25 % WARNING, darueber CRITICAL; unlesbar CRITICAL',()=>{
 assert.equal(backlogSLO(0.10),'HEALTHY');assert.equal(backlogSLO(0.101),'WARNING');
 assert.equal(backlogSLO(0.25),'WARNING');assert.equal(backlogSLO(0.251),'CRITICAL');assert.equal(backlogSLO(NaN),'CRITICAL');
});
test('Vorher/Nachher heute: ~58 % Rueckstand bleibt ehrlich CRITICAL, Stempel-Urteil unveraendert streng',()=>{
 const v=verdict(),a=applyBacklog(v,report(3082),NOW);
 assert.equal(v.refreshSLO,'CRITICAL');
 assert.equal(a.refreshSLO,'CRITICAL');assert.equal(a.backlogSLO,'CRITICAL');assert.equal(a.status,'CRITICAL');assert.equal(a.exitCode,1);
 assert.ok(Math.abs(a.backlogRatio-0.577)<0.001);
});
test('Rueckstand unter 10 % und frische Lane-Stempel: Refresh HEALTHY trotz altem Stempel',()=>{
 const a=applyBacklog(verdict(),report(400),NOW);
 assert.equal(a.refreshSLO,'HEALTHY');assert.equal(a.stampRefreshSLO,'CRITICAL');assert.equal(a.status,'HEALTHY');assert.equal(a.exitCode,0);
});
test('WARNING bei 10-25 %; Lane-Stempel ergaenzen und ersetzen den Rueckstand nicht',()=>{
 assert.equal(applyBacklog(verdict(),report(1000),NOW).status,'WARNING');
 assert.equal(applyBacklog(verdict(),report(100,{health:{lastSuccessfulNewsRefresh:ago(20),lastSuccessfulSecRefresh:ago(2)}}),NOW).refreshSLO,'CRITICAL');
 assert.equal(applyBacklog(verdict(),report(100,{asOf:ago(30)}),NOW).refreshSLO,'CRITICAL');
});
test('Build und Auslieferung bleiben massgeblich',()=>{
 const v=evaluateHealth({generation:GEN,manifest:{},health:{lastSuccessfulRefresh:ago(36),lastSuccessfulConsumerBuild:ago(30)}},{generation:GEN,lastSuccessfulProductionPublication:ago(1)},{state:'VERIFIED',servedGeneration:GEN},NOW);
 assert.equal(applyBacklog(v,report(100),NOW).status,'CRITICAL');
});
test('kein Vollumfang, Verifikationslauf oder fehlende Daten: Urteil unveraendert',()=>{
 const v=verdict();
 assert.equal(applyBacklog(v,report(0,{scope:'X',cohortIssuers:45}),NOW),v);
 assert.equal(applyBacklog(v,report(0,{verification:true}),NOW),v);
 assert.equal(applyBacklog(v,null,NOW),v);assert.equal(applyBacklog(v,{...report(0),scheduler:undefined},NOW),v);
 assert.equal(isFullScope({cohortIssuers:5016}),true);assert.ok(Number.isNaN(backlogRatio({eligibleSources:0,scheduler:{dueOverSevenDays:1}})));
});
test('pickReport nimmt das juengste Produktionsartefakt mit Scheduler, ueberspringt Verifikation und abgelaufene',()=>{
 const main={workflow_run:{head_branch:'main',head_repository_id:7,repository_id:7}};
 const arts=[{...main,id:1,name:'company-intelligence-refresh-health-1',created_at:ago(9)},{...main,id:2,name:'company-intelligence-refresh-health-2',created_at:ago(1)},{...main,id:3,name:'company-intelligence-refresh-health-3',created_at:ago(2),expired:true},{...main,id:4,name:'other',created_at:ago(0)}];
 const reports={1:report(5),2:report(9,{verification:true})};
 assert.equal(pickReport(arts,a=>reports[a.id]).scheduler.dueOverSevenDays,5);
 assert.equal(pickReport(arts,()=>{throw Error('x');}),null);
});
test('pickReport: nur Artefakte von Laeufen auf main aus dem eigenen Repository (BB 24.11.2026); PR-, Fork- und herkunftslose Artefakte zaehlen nie, auch wenn sie juenger sind',()=>{
 const own={workflow_run:{head_branch:'main',head_repository_id:7,repository_id:7}};
 const arts=[
  {id:1,name:'company-intelligence-refresh-health-1',created_at:ago(9),...own},
  {id:2,name:'company-intelligence-refresh-health-2',created_at:ago(1),workflow_run:{head_branch:'ci-pr-branch',head_repository_id:7,repository_id:7}},
  {id:3,name:'company-intelligence-refresh-health-3',created_at:ago(2),workflow_run:{head_branch:'main',head_repository_id:99,repository_id:7}},
  {id:4,name:'company-intelligence-refresh-health-4',created_at:ago(3)},
  {id:5,name:'company-intelligence-refresh-health-5',created_at:ago(4),workflow_run:{head_branch:'main'}},
  {id:6,name:'company-intelligence-refresh-health-6',created_at:ago(5),workflow_run:{head_branch:'main',head_repository_id:null,repository_id:null}}];
 const reports={1:report(5),2:report(1),3:report(2),4:report(3),5:report(4),6:report(6)};
 assert.equal(pickReport(arts,a=>reports[a.id]).scheduler.dueOverSevenDays,5,'nur das main-Artefakt (id 1) zaehlt');
 assert.equal(pickReport(arts.slice(1),a=>reports[a.id]),null,'ohne main-Artefakt: kein Bericht, Stempel-Urteil bleibt (strikt)');
 for(const a of arts.slice(1))assert.equal(fromMain(a),false,'id '+a.id);assert.equal(fromMain(arts[0]),true);assert.equal(fromMain(null),false);assert.equal(fromMain({}),false);
 // Mutant: ohne Filter wuerde das juengste fremde Artefakt gewinnen.
 const noFilter=a=>a&&!a.expired&&String(a.name).startsWith('company-intelligence-refresh-health-');
 assert.equal(arts.filter(noFilter).sort((x,y)=>Date.parse(y.created_at)-Date.parse(x.created_at))[0].id,2,'der Mutant waehlt das PR-Artefakt, der Test erkennt es');
});

