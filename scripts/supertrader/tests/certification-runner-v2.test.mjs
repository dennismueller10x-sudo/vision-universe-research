import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {methods, historicalParticipants, prepareSourceFeatures} from '../research/tournament/methods.mjs';
import * as old from '../research/tournament/runner.mjs';
import * as revised from '../research/certification/runner-v2.mjs';
const protocol=JSON.parse(fs.readFileSync(new URL('../research/tournament/protocol.json',import.meta.url),'utf8'));
function fixture() {
 const dates=[];let day=new Date('2017-01-02T00:00:00Z');
 while(dates.length<1020){if(![0,6].includes(day.getUTCDay()))dates.push(day.toISOString().slice(0,10));day=new Date(+day+86400000);}
 const bars=seed=>dates.map((date,i)=>{const close=20+seed+i*.035+Math.sin(i/11)*.1;return {date,open:close*.999,high:close*1.006,low:close*.994,close,rawOpen:close*.999,rawHigh:close*1.006,rawLow:close*.994,rawClose:close,rawVolume:1000000,volume:1000000,dividend:0,splitFactor:1,splitAdjustmentFactor:1,totalReturnIndex:close};});
 const securities=Array.from({length:4},(_,i)=>({id:`SYNTHETIC_${i}`,ticker:`SYNTHETIC_${i}`,bars:bars(i),fundamentals:[],listing:{startDate:dates[0],endDate:null,active:true},terminal:null}));
 const benchmark={bars:bars(5)};
 return prepareSourceFeatures({securities,benchmark,spyBars:benchmark.bars,calendar:dates.filter(d=>d>='2018-01-02'),window:protocol.window});
}
test('six original methods retain full signals, portfolio, accounting and sensitivity parity without new evidence',()=>{
 for(const method of historicalParticipants){const a=fixture(),b=fixture();
  const before=old.runMethod(a,method,protocol),after=revised.runMethod(b,method,protocol);
  assert.deepEqual(after,before,method.id);
 }
 const method=methods.find(m=>m.id==='cross_sectional_momentum');
 for(const opts of [{costMultiplier:2,measureSignals:false},{scenario:'DISTRESS_ZERO_OTHER_MINUS_30',measureSignals:false}])assert.deepEqual(revised.runMethod(fixture(),method,protocol,opts),old.runMethod(fixture(),method,protocol,opts));
});
test('context preserves real source and fiscal metadata with exact conservative prior-day visibility',()=>{
 const data=fixture(),asOf=data.calendar.at(-1),s=data.securities[0];
 s.priceSource={provider:'synthetic-independent-source',sha256:'a'.repeat(64)};s.issuerCik='0000123456';s.issuerCikConflict=true;s.issuerCikEvidence={status:'UNVERIFIED',historical:false};
 const earlier=data.calendar.at(-2);
 s.fundamentals=[{key:'assets',value:100,periodEnd:'2019-12-31',availableAt:earlier+'T23:59:59.999Z'},
  {key:'assets',value:900,periodEnd:'2019-12-31',availableAt:asOf+'T00:00:00.000Z'}];
 s.fiscalPeriodLinks=[{knownFrom:earlier+'T23:59:59.999Z',source:'source-bound-prior'},
  {knownFrom:asOf+'T00:00:00.000Z',source:'not-yet-receiver-visible'}];
 const ctx=revised.formationContext(data,methods[0],asOf,null,protocol),row=ctx.securities.find(x=>x.id===s.id);
 assert.equal(row.fundamentals.length,1);assert.equal(row.fundamentals[0].value,100);
 assert.equal(row.fiscalPeriodLinks.length,1);assert.equal(row.priceSource,s.priceSource);assert.equal(row.issuerCik,s.issuerCik);assert.equal(row.issuerCikConflict,true);assert.equal(row.issuerCikEvidence,s.issuerCikEvidence);
 assert.equal(ctx.inputKnowledgeBoundUTC,asOf+'T00:00:00.000Z');
 assert.equal(ctx.formationCutoffBasis,'CONSERVATIVE_INPUT_KNOWLEDGE_BOUND_NOT_ACTUAL_SIGNAL_TIMESTAMP');
 assert.equal(row.bars.at(-1).date,asOf); // Closing price knowledge is not delayed.
});
test('known conflicting-field invalidation cannot silently resurrect an older fact',()=>{
 const data=fixture(),asOf=data.calendar.at(-1),s=data.securities[0],earlier=data.calendar.at(-2);
 s.fundamentals=[{key:'assets',value:100,periodEnd:'2019-12-31',availableAt:earlier},
  {key:'revenue',value:200,periodEnd:'2019-12-31',availableAt:earlier}];
 s.fundamentalInvalidations=[{key:'assets',periodEnd:'2019-12-31',knownFrom:earlier+'T12:00:00Z'}];
 let ctx=revised.formationContext(data,methods[0],asOf,null,protocol);
 assert.deepEqual(ctx.securities[0].fundamentals.map(f=>f.key),['revenue']);
 s.fundamentalInvalidations[0].knownFrom=asOf+'T00:00:00.000Z';
 ctx=revised.formationContext(data,methods[0],asOf,null,protocol);
 assert.equal(ctx.securities[0].fundamentals.length,2); // Future metadata cannot poison the past.
});
test('nonempty certified cash ledger cannot mix portfolio entitlement and uncertified signal outcomes',()=>{
 const data=fixture();data.certifiedCashEvents=[{eventId:'missing_clock_fixture'}];
 assert.throws(()=>revised.runMethod(data,methods[0],protocol),/CERTIFIED_CASH_SIGNAL_OUTCOME_CONTRACT_NOT_INTEGRATED/);
 data.certifiedSessionClocks=Object.fromEntries(data.calendar.map(date=>[date,{beforeOpenUTC:date+'T13:30:00Z',afterCloseUTC:date+'T20:00:00Z'}]));
 assert.throws(()=>revised.runMethod(data,methods[0],protocol),/CERTIFIED_CASH_SIGNAL_OUTCOME_CONTRACT_NOT_INTEGRATED/);
});

test('current issuer diagnostics require a dated, known and matching historical link',()=>{
 const security={issuerCik:'0000123456',listing:{id:'SYNTHETIC_LISTING'}};
 assert.equal(revised.issuerCikStatusAt(security,'2026-10-09'),'UNVERIFIED');
 security.issuerCikEvidence={status:'VERIFIED',historical:true,validFrom:'2020-01-01',validTo:null,knownFrom:'2026-10-08T12:00:00Z',listingId:'SYNTHETIC_LISTING'};
 assert.equal(revised.issuerCikStatusAt(security,'2026-10-09'),'VERIFIED');
 security.issuerCikEvidence.validTo='2025-12-31';assert.equal(revised.issuerCikStatusAt(security,'2026-10-09'),'UNVERIFIED');
 security.issuerCikEvidence.validTo=null;security.issuerCikEvidence.knownFrom='2026-10-09T00:00:00Z';assert.equal(revised.issuerCikStatusAt(security,'2026-10-09'),'UNVERIFIED');
 security.issuerCikEvidence.knownFrom='2026-10-08T12:00:00Z';security.issuerCikEvidence.listingId='OTHER_SYNTHETIC_LISTING';assert.equal(revised.issuerCikStatusAt(security,'2026-10-09'),'UNVERIFIED');
});
