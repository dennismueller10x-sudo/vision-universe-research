import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyHistoryHandoff} from '../../scripts/vu2/verify-history-handoff.mjs';
const calendar=JSON.parse(readFileSync(new URL('../config/market-calendar.json',import.meta.url)));
function context(){return {
 preflight:{executionAllowed:true,measured:true,offline:false,operation:'RECOVERY',provider:'tiingo',market:'US',gate:'GATE_100',generatedAt:'2026-09-14T05:00:00Z'},
 sync:{direction:'PULL',provider:'tiingo',market:'US',gate:'GATE_100',zeroCost:{preflight:{generatedAt:'2026-09-14T05:00:00Z'}},tally:{requested:1,ok:1,failed:0,missing:0}},
 members:[{ticker:'TST',securityId:'ref_TST'}],calendar,now:'2026-09-14T05:01:00Z',
 store:{readBars:()=>({ticker:'TST',securityId:'ref_TST',provider:'tiingo',restoredFrom:'history-store',bars:[{securityId:'ref_TST',date:'2026-09-10',close:123.456789}]})}
};}
test('verified restoration does not certify stale EOD, finality, or production lifecycle',()=>{
 const r=verifyHistoryHandoff(context());assert.equal(r.sampleRestore,'PASS');
 assert.equal(r.securities[0].eodCoverage,'FETCH');assert.equal(r.latestClosedSession,'2026-09-11');
 assert.equal(r.productionLifecycle,'NOT_CERTIFIED');assert.ok(r.openEvidence.includes('DURABLE_CHECKPOINT_LINEAGE'));
 assert.ok(!JSON.stringify(r).includes('123.456789'));assert.ok(!JSON.stringify(r).includes('"bars"'));
});
test('unmatched or unapproved producer evidence cannot pass',()=>{
 for(const mutate of [c=>c.preflight.executionAllowed=false,c=>c.preflight.offline=true,
  c=>c.sync.tally.missing=1,c=>c.sync.zeroCost.preflight.generatedAt='other',c=>c.members=[],
  c=>c.members=Array(6).fill(c.members[0])]){
  const c=context();mutate(c);assert.equal(verifyHistoryHandoff(c).sampleRestore,'FAIL');
 }
});
test('wrong identity, missing data and read errors fail without exposing data',()=>{
 for(const readBars of [()=>null,()=>({securityId:'foreign'}),()=>{throw new Error('secret-sentinel');}]){
  const c=context();c.store={readBars};const r=verifyHistoryHandoff(c);assert.equal(r.sampleRestore,'FAIL');
  assert.ok(!JSON.stringify(r).includes('secret-sentinel'));
 }
});
