import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),Gate=require('../engines/market-eod-gate.js');
const calendar=JSON.parse(readFileSync(new URL('../config/market-calendar.json',import.meta.url)));
test('completed session respects regular close, weekend, holiday and early close',()=>{
 for(const [now,expected] of [
  ['2026-09-08T19:59:59Z','2026-09-04'], // Labor Day Monday
  ['2026-09-08T20:00:00Z','2026-09-08'],
  ['2026-09-12T15:00:00Z','2026-09-11'],
  ['2026-11-27T17:59:59Z','2026-11-25'],
  ['2026-11-27T18:00:00Z','2026-11-27']
 ]){const result=Gate.latestClosedSession(now,calendar);assert.equal(result.date,expected,now);assert.equal(result.providerFinality,'NOT_CERTIFIED');}
});
test('unknown calendar coverage cannot certify a session',()=>{
 assert.equal(Gate.latestClosedSession('2030-01-01T22:00:00Z',calendar).reason,'CALENDAR_UNAVAILABLE');
 assert.equal(Gate.latestClosedSession('2026-09-09T22:00:00Z',null).state,'BLOCKED');
});
test('strict continuation forbids implicit backfill and open-session stored data',()=>{
 const session={state:'AVAILABLE',date:'2026-09-09'};
 for(const d of [null,'invalid','2026-02-30'])assert.equal(Gate.plan(d,session,calendar).reason,'HISTORY_RESTORE_REQUIRED');
 assert.equal(Gate.plan('2026-09-10',session,calendar).reason,'STORED_SESSION_NOT_FINAL');
 assert.equal(Gate.plan('2026-09-09',session,calendar).state,'CURRENT');
 assert.deepEqual(Gate.plan('2026-09-08',session,calendar),{state:'FETCH',from:'2026-09-09',through:'2026-09-09',expectedDates:['2026-09-09']});
});
test('partial provider response remains retryable; action events require reconciliation',()=>{
 const plan={from:'2026-09-08',through:'2026-09-09',expectedDates:['2026-09-08','2026-09-09']};
 assert.equal(Gate.reconcile([],plan).complete,false);
 assert.equal(Gate.reconcile([{date:'2026-09-08',splitFactor:1,dividend:0}],plan).complete,false);
 assert.equal(Gate.reconcile(['2026-09-08','2026-09-09'].map(date=>({date,splitFactor:1,dividend:0})),plan).complete,true);
 for(const action of [{splitFactor:2},{dividend:0.5}])assert.equal(Gate.reconcile([{date:'2026-09-09',splitFactor:1,dividend:0,...action}],plan).reason,'CORPORATE_ACTION_RECONCILIATION_REQUIRED');
 assert.equal(Gate.reconcile([{date:'2026-09-10'}],plan).reason,'OUTSIDE_INCREMENTAL_WINDOW');
 assert.equal(Gate.reconcile([{date:'2026-09-07'}],plan).reason,'OUTSIDE_INCREMENTAL_WINDOW');
});

test('missing action evidence and holes cannot advance stored history',()=>{
 const plan=Gate.plan('2026-09-04',{state:'AVAILABLE',date:'2026-09-09'},calendar);
 assert.deepEqual(plan.expectedDates,['2026-09-08','2026-09-09']);
 assert.equal(Gate.reconcile([{date:'2026-09-09',splitFactor:1,dividend:0}],plan).reason,'MISSING_SESSION_BAR');
 assert.equal(Gate.reconcile([{date:'2026-09-08',splitFactor:null,dividend:null}],plan).reason,'CORPORATE_ACTION_EVIDENCE_MISSING');
 assert.equal(Gate.reconcile([{date:'2026-09-07',splitFactor:1,dividend:0}],plan).reason,'NON_TRADING_SESSION_BAR');
 assert.equal(Gate.plan('2024-12-31',{state:'AVAILABLE',date:'2026-09-09'},null).reason,'CALENDAR_UNAVAILABLE');
});
