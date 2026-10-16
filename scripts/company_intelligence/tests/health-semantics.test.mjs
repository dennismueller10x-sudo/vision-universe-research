import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {productionObservation} from '../production-observation.mjs';
import {freshness,runSLO,evaluateHealth,FRESHNESS_HOURS,refreshConfig} from '../refresh-approval.mjs';
import {approval} from '../production-approval.mjs';

const H=3600000,NOW=Date.parse('2026-10-14T12:00:00Z'),ago=h=>new Date(NOW-h*H).toISOString();
const GEN='a'.repeat(24);
const good=(refreshAgeH=1,buildAgeH=1,extra={})=>({generation:GEN,manifest:{},health:{lastSuccessfulRefresh:ago(refreshAgeH),lastSuccessfulConsumerBuild:ago(buildAgeH),...extra}});
const observed=(ageH=1)=>({generation:GEN,lastSuccessfulProductionPublication:ago(ageH)});
const delivery=(o={})=>async()=>({ok:true,status:200,json:async()=>({generation:GEN,cohortStocks:46,issuers:45,...o})});
const http=status=>async()=>({ok:false,status});
const gateBytes=(state,o={})=>Buffer.from(JSON.stringify({schema:1,state,generation:approval.consumerGeneration,approvalId:approval.approvalId,changedAt:'2026-10-13T10:00:00Z',...o}));
const gate=read=>({read,approvalId:approval.approvalId,generation:approval.consumerGeneration});
const gateOf=state=>gate(async()=>gateBytes(state));

test('VERIFIED: served generation equals GOOD and the accepted observation',async()=>{
 const p=await productionObservation(good(),observed(),delivery(),gateOf('AVAILABLE'));
 assert.deepEqual([p.state,p.servedGeneration,p.gateState,p.reason],['VERIFIED',GEN,'AVAILABLE',null]);
});
test('MISMATCH keeps its meaning (different generation, scope or observation)',async()=>{
 assert.equal((await productionObservation(good(),observed(),delivery({generation:'b'.repeat(24)}),gateOf('AVAILABLE'))).state,'MISMATCH');
 assert.equal((await productionObservation(good(),{generation:'b'.repeat(24)},delivery(),gateOf('AVAILABLE'))).state,'MISMATCH');
 assert.equal((await productionObservation(good(),observed(),delivery({cohortStocks:5120,issuers:5120}),gateOf('AVAILABLE'))).state,'MISMATCH');
});
test('GATE_CLOSED only for clean DISABLED gate plus HTTP 404 delivery',async()=>{
 const p=await productionObservation(good(),observed(),http(404),gateOf('DISABLED'));
 assert.deepEqual([p.state,p.reason,p.gateState,p.servedGeneration],['GATE_CLOSED','GATE_DISABLED_DELIVERY_ABSENT','DISABLED',null]);
});
test('every other lane stays UNAVAILABLE: HTTP 500/403/401, timeout, network error, HTML, password page',async()=>{
 const closed=gateOf('DISABLED');
 for(const status of [500,502,503,403,401,429,410])assert.equal((await productionObservation(good(),observed(),http(status),closed)).state,'UNAVAILABLE','HTTP '+status);
 const timeout=Object.assign(new Error('t'),{name:'TimeoutError'});
 const t=await productionObservation(good(),observed(),async()=>{throw timeout;},closed);
 assert.deepEqual([t.state,t.reason],['UNAVAILABLE','DELIVERY_TIMEOUT']);
 assert.equal((await productionObservation(good(),observed(),async()=>{throw new TypeError('fetch failed');},closed)).reason,'DELIVERY_FETCH_FAILED');
 const html=async()=>({ok:true,status:200,json:async()=>{throw new SyntaxError('Unexpected token <');}});
 assert.equal((await productionObservation(good(),observed(),html,closed)).reason,'DELIVERY_NOT_JSON');
 const password=async()=>({ok:true,status:200,json:async()=>{throw new SyntaxError('<form action="/login">');}});
 assert.equal((await productionObservation(good(),observed(),password,closed)).state,'UNAVAILABLE');
 const nullBody=async()=>({ok:true,status:200,json:async()=>null});
 assert.equal((await productionObservation(good(),observed(),nullBody,closed)).state,'UNAVAILABLE');
});
test('404 without proof of a deliberate OFF is an outage: gate read error, missing, invalid, AVAILABLE, STAGED, foreign approval, no gate reader',async()=>{
 const cases={
  'read error':gate(async()=>{throw new Error('R2 503');}),
  'missing':gate(async()=>null),
  'garbage':gate(async()=>Buffer.from('<html>login</html>')),
  'AVAILABLE':gateOf('AVAILABLE'),
  'STAGED':gateOf('STAGED'),
  'unknown state':gate(async()=>gateBytes('OFF')),
  'foreign approval':gate(async()=>gateBytes('DISABLED',{approvalId:'other'})),
  'foreign generation':gate(async()=>gateBytes('DISABLED',{generation:'c'.repeat(24)})),
  'wrong schema':gate(async()=>gateBytes('DISABLED',{schema:2})),
  'no gate reader':null,
 };
 for(const [name,g] of Object.entries(cases)){
  const p=await productionObservation(good(),observed(),http(404),g);
  assert.equal(p.state,'UNAVAILABLE',name);
  assert.match(p.reason,/^DELIVERY_MISSING_/,name);
 }
 assert.equal((await productionObservation(good(),observed(),http(404),gateOf('AVAILABLE'))).reason,'DELIVERY_MISSING_GATE_AVAILABLE');
 assert.equal((await productionObservation(good(),observed(),http(404),cases['read error'])).reason,'DELIVERY_MISSING_GATE_READ_FAILED');
});
test('a DISABLED gate with a still-served delivery is judged by the delivery, not by the gate',async()=>{
 assert.equal((await productionObservation(good(),observed(),delivery(),gateOf('DISABLED'))).state,'VERIFIED');
 assert.equal((await productionObservation(good(),observed(),http(500),gateOf('DISABLED'))).state,'UNAVAILABLE');
});

const prod=async(g,o,f,gt)=>productionObservation(g,o,f,gt);
test('health: OFF is its own status, not HEALTHY and not an alarm (exit 0) while refresh/build are fresh',async()=>{
 const g=good(1,1),s=evaluateHealth(g,observed(),await prod(g,observed(),http(404),gateOf('DISABLED')),NOW);
 assert.equal(s.status,'OFF');assert.equal(s.exitCode,0);
 assert.equal(s.publicationSLO,'OFF');assert.equal(s.productionState,'GATE_CLOSED');assert.equal(s.gateState,'DISABLED');
 assert.equal(s.lastSuccessfulProductionPublication,null,'a historical timestamp never certifies an OFF delivery');
 assert.equal(s.refreshSLO,'HEALTHY');assert.equal(s.buildSLO,'HEALTHY');
});
test('health: OFF does not hide stale refresh/build (freshness is still judged)',async()=>{
 const off=async g=>prod(g,observed(),http(404),gateOf('DISABLED'));
 let g=good(9,1),s=evaluateHealth(g,observed(),await off(g),NOW);assert.deepEqual([s.status,s.exitCode],['WARNING',0]);
 g=good(13,1);s=evaluateHealth(g,observed(),await off(g),NOW);assert.deepEqual([s.status,s.exitCode,s.refreshSLO],['CRITICAL',1,'CRITICAL']);
 g=good(1,13);s=evaluateHealth(g,observed(),await off(g),NOW);assert.deepEqual([s.status,s.exitCode,s.buildSLO],['CRITICAL',1,'CRITICAL']);
 g={...good(1,1),health:{}};s=evaluateHealth(g,observed(),await off(g),NOW);assert.equal(s.status,'CRITICAL');
 s=evaluateHealth(null,observed(),await prod(null,observed(),http(404),gateOf('DISABLED')),NOW);assert.equal(s.status,'CRITICAL');
});
test('health: every outage lane is CRITICAL exit 1 with publicationSLO CRITICAL',async()=>{
 const g=good(1,1),lanes={
  http500:[http(500),gateOf('DISABLED')],
  timeout:[async()=>{throw Object.assign(new Error('x'),{name:'TimeoutError'});},gateOf('DISABLED')],
  html:[async()=>({ok:true,json:async()=>{throw new SyntaxError('<');}}),gateOf('DISABLED')],
  gateReadError:[http(404),gate(async()=>{throw new Error('boom');})],
  gateAvailable404:[http(404),gateOf('AVAILABLE')],
  mismatch:[delivery({generation:'b'.repeat(24)}),gateOf('AVAILABLE')],
 };
 for(const [name,[f,gt]] of Object.entries(lanes)){
  const s=evaluateHealth(g,observed(),await prod(g,observed(),f,gt),NOW);
  assert.deepEqual([s.status,s.exitCode,s.publicationSLO],['CRITICAL',1,'CRITICAL'],name);
  assert.notEqual(s.productionState,'GATE_CLOSED',name);
 }
});
test('health: VERIFIED fresh is HEALTHY exit 0; delivery age is separate from data age',async()=>{
 const g=good(2,2),o=observed(0.5),s=evaluateHealth(g,o,await prod(g,o,delivery(),gateOf('AVAILABLE')),NOW);
 assert.deepEqual([s.status,s.exitCode,s.productionState],['HEALTHY',0,'VERIFIED']);
 assert.equal(s.goodDataAgeHours,2);assert.equal(s.deliveryVerifiedAgeHours,0.5);assert.equal(s.consumerBuildAgeHours,2);
 assert.equal(s.gateState,'AVAILABLE');
});
test('health: field naming - correct GOOD field plus deprecated alias with the same value; failure fields from GOOD health only',async()=>{
 const g=good(2,2,{failureStage:'CANDIDATE_QA',failureCode:'CANDIDATE_QA_FAILED'}),s=evaluateHealth(g,observed(),await prod(g,observed(),delivery(),gateOf('AVAILABLE')),NOW);
 assert.equal(s.lastSuccessfulGoodRefresh,g.health.lastSuccessfulRefresh);
 assert.equal(s.lastSuccessfulPrivateRefresh,s.lastSuccessfulGoodRefresh);
 assert.deepEqual([s.failureStage,s.failureCode,s.failureSource],['CANDIDATE_QA','CANDIDATE_QA_FAILED','GOOD_HEALTH']);
 const t=evaluateHealth(good(),observed(),await prod(good(),observed(),delivery(),gateOf('AVAILABLE')),NOW);
 assert.deepEqual([t.failureStage,t.failureCode,t.failureSource],[null,null,'NOT_RECORDED_IN_GOOD_HEALTH']);
});
test('freshness thresholds are unchanged: 8 h WARNING / 12 h CRITICAL',()=>{
 assert.deepEqual({...FRESHNESS_HOURS},{warning:8,critical:12});
 for(const [h,want] of [[7.9,'HEALTHY'],[8.1,'WARNING'],[11.9,'WARNING'],[12.1,'CRITICAL']]){
  assert.equal(freshness(ago(h),NOW),want,'freshness '+h);
  const g=good(h,1),s=evaluateHealth(g,observed(),{state:'VERIFIED',servedGeneration:GEN},NOW);
  assert.equal(s.refreshSLO,want,'refresh '+h);
  assert.equal(evaluateHealth(good(1,h),observed(),{state:'VERIFIED',servedGeneration:GEN},NOW).buildSLO,want,'build '+h);
  assert.equal(evaluateHealth(good(1,1),observed(h),{state:'VERIFIED',servedGeneration:GEN},NOW).publicationSLO,want,'publication '+h);
 }
 assert.equal(freshness(null,NOW),'CRITICAL');assert.equal(freshness('not a date',NOW),'CRITICAL');
 assert.equal(refreshConfig.warningHours,8);assert.equal(refreshConfig.criticalHours,12,'documented config values equal the hard-coded ones');
});

const okReport=(o={})=>({status:'SUCCESS',failureStage:null,published:true,retainedLastGood:false,health:{lastSuccessfulRefresh:new Date().toISOString()},...o});
test('run SLO is HEALTHY only for a really successful, published run',()=>{
 const r=runSLO(okReport());assert.deepEqual([r.refreshSLO,r.runSucceeded,r.failureCode],['HEALTHY',true,null]);
});
test('run SLO is not tautological: a failed run stamped with a fresh health timestamp is CRITICAL with its failureCode',()=>{
 const fresh={lastSuccessfulRefresh:new Date().toISOString()};
 const failed=runSLO({status:'PIPELINE_FAILURE',failureStage:'CANDIDATE_QA',failureCode:'CANDIDATE_QA_FAILED',published:false,retainedLastGood:true,health:fresh});
 assert.deepEqual([failed.refreshSLO,failed.runSucceeded,failed.failureCode],['CRITICAL',false,'CANDIDATE_QA_FAILED']);
 for(const bad of [
  {status:'PIPELINE_FAILURE'},{failureStage:'GOOD_POINTER'},{published:false},{retainedLastGood:true},{status:'RETAINED_LAST_GOOD'},{published:undefined}])
  assert.equal(runSLO(okReport(bad)).refreshSLO,'CRITICAL',JSON.stringify(bad));
 assert.equal(runSLO(okReport({status:'PIPELINE_FAILURE',failureCode:undefined})).failureCode,'PIPELINE_FAILURE');
 assert.equal(runSLO(okReport({published:false})).failureCode,'RUN_NOT_PUBLISHED');
});
test('run SLO on success still judges the freshness of what was published (never looser)',()=>{
 const now=Date.parse('2026-10-14T12:00:00Z');
 for(const [h,want] of [[7.9,'HEALTHY'],[8.1,'WARNING'],[12.1,'CRITICAL']])
  assert.equal(runSLO(okReport({health:{lastSuccessfulRefresh:new Date(now-h*H).toISOString()}}),now).refreshSLO,want);
 assert.equal(runSLO(okReport({health:{}})).refreshSLO,'CRITICAL');
});
test('unvollstaendiger Lauf: zusaetzliche Health-Felder aendern Schwellen und Alter nicht (Stempel bleibt alt)',()=>{
 const extra={lastRefreshComplete:false,incompleteReasons:['SOURCE_NOT_SUCCESSFUL:TEMPORARY_FAILURE']};
 for(const [h,want] of [[7.9,'HEALTHY'],[8.1,'WARNING'],[12.1,'CRITICAL']])
  assert.equal(runSLO(okReport({health:{lastSuccessfulRefresh:ago(h),...extra}}),NOW).refreshSLO,want);
 const s=evaluateHealth(good(9,1,extra),observed(1),{state:'VERIFIED'},NOW);
 assert.equal(s.lastSuccessfulGoodRefresh,ago(9));assert.equal(s.goodDataAgeHours,9);
 // Alter GOOD-Zustand ohne die neuen Felder bleibt lesbar.
 assert.equal(evaluateHealth(good(9),observed(1),{state:'VERIFIED'},NOW).goodDataAgeHours,9);
});
test('runRefresh report is wired to runSLO, not to the bare timestamp freshness',()=>{
 const src=readFileSync(fileURLToPath(new URL('../refresh-run.mjs',import.meta.url)),'utf8');
 assert.match(src,/Object\.assign\(report,runSLO\(report\)\)/);
 assert.doesNotMatch(src,/report\.refreshSLO=freshness\(report\.health/);
});

const script=fileURLToPath(new URL('../refresh-run.mjs',import.meta.url));
test('a crashing health check ends with exit 2 and ::error::health crashed, distinct from SLO CRITICAL (exit 1)',()=>{
 const env={PATH:process.env.PATH};
 const r=spawnSync(process.execPath,[script,'health'],{env,encoding:'utf8',timeout:60000});
 assert.equal(r.status,2,r.stdout+r.stderr);
 assert.match(r.stdout,/::error::health crashed/);
 assert.doesNotMatch(r.stdout,/SLO CRITICAL/);
});
