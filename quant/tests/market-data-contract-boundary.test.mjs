import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),C=require('../engines/market-data-contract.js');
const Hours=require('../engines/realtime/market-hours.js'),calendar=require('../config/market-calendar.json');
test('invalid counts and minima never certify data or technical history',()=>{
 for(const barCount of [Infinity,NaN,-1,1.5,'500',null]){
  assert.equal(C.resolveHistorical({barCount}).state,'HISTORICAL_UNAVAILABLE');
  assert.equal(C.resolveIntraday({barCount}).state,'INTRADAY_UNAVAILABLE');
  assert.equal(C.technicalHistory(barCount).inputValid,false);
  assert.equal(C.describe({historical:{barCount}}).technical.inputValid,false);
 }
 for(const minBars of [0,-1,Infinity,NaN,'2',0.5]){
  assert.equal(C.resolveHistorical({barCount:0,minBars}).inputValid,false);
  assert.equal(C.technicalHistory(500,minBars).inputValid,false);
 }
 assert.equal(C.resolveHistorical({barCount:2}).state,'HISTORICAL_AVAILABLE');
});
test('invalid, missing and uncovered calendar evidence stays unknown',()=>{
 for(const result of [null,{phase:'UNKNOWN',calendarCoverage:true},{phase:'REGULAR',calendarCoverage:false}]){
  const s=C.marketSession({sessionAt:()=>result});assert.equal(s.state,null);assert.equal(s.tradingOpen,null);
 }
 for(const at of ['not-a-date',null,Symbol('invalid'),1n,'2030-01-02T15:00:00Z'])assert.equal(C.marketSession(Hours,at,{calendar}).tradingOpen,null);
 assert.equal(C.marketSession({sessionAt:()=>{throw Error('calendar unavailable');}}).tradingOpen,null);
 assert.equal(C.marketSession(Hours,'2026-09-08T15:00:00Z',{calendar}).tradingOpen,true);
 assert.equal(C.marketSession(Hours,'2026-09-13T15:00:00Z',{calendar}).state,'MARKET_CLOSED');
});
test('connected socket is transport evidence, never a live-price claim',()=>{
 assert.equal(C.resolveRealtime({connection:'CONNECTED'}).state,'REALTIME_UNAVAILABLE');
 const status=C.resolveRealtime({tradingOpen:true,connection:'CONNECTED',updates:0});
 assert.equal(status.availabilityScope,'TRANSPORT_ONLY');assert.equal(status.isLive,false);assert.equal(status.priceTypeConfirmed,false);
 assert.equal(C.resolveRealtime({tradingOpen:false,connection:'ERROR'}).state,'MARKET_CLOSED');
});
