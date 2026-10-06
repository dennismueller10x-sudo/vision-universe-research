import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {auditEuropeanCacheSeries,runEuropeCacheAudit} from '../audit-europe-cache.mjs';
import {buildEuropeanCalendar} from '../europe-calendar.mjs';
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fixture(){
 const calendar=buildEuropeanCalendar({mic:'XETR',timeZone:'Europe/Berlin',now:'2026-10-06T13:44:00Z',
  annualRules:[{year:2026,verified:true,weekdayTrading:true,closedDates:[],halfDays:[],basis:'SYNTHETIC_FIXTURE',evidence:['synthetic-calendar']}],
  regularClose:{verified:true,time:'17:30',meaning:'NOT_BEFORE',evidence:['synthetic-close']}});
 const listing={name:'Synthetic only',isin:'DE000SYNTH00',mic:'XETR',securityId:'synthetic-security',listingId:'synthetic-listing',currency:'EUR',quoteUnit:'MAJOR',providerSymbol:'SYN.DE'};
 const bars=calendar.expectedSessions.filter(d=>d>='2026-01-01'&&d<='2026-10-02'&&d!=='2026-09-17').map((date,i)=>({date,open:100+i/10,high:101+i/10,low:99+i/10,close:100.5+i/10,
  volume:1000,splitFactor:1,dividend:0,adjustedClose:null,adjustmentObservation:{close:100.5+i/10},...{securityId:listing.securityId,listingId:listing.listingId}}));
 const history={isin:listing.isin,mic:'XETR',currency:'EUR',quoteUnit:'MAJOR',apiVersion:'v2',source:'marketstack',sourceEvidence:['synthetic'],bars,quarantined:[]};
 const sourceBase={status:200,apiVersion:'v2',host:'api.marketstack.com'};
 const sources=[{...sourceBase,file:'synthetic-metadata',endpoint:'/tickers/SYN.DE',body:{isin:listing.isin,symbol:'SYN.DE'}},
  {...sourceBase,file:'synthetic-prices',endpoint:'/eod',params:{symbols:'SYN.DE',exchange:'XETR'},body:{data:bars.map(b=>({...b,symbol:'SYN.DE',exchange:'XETR'}))}}];
 return {listing,history,calendar,asOf:'2026-10-06',sources,rawDocumentationEvidence:['synthetic-raw-documentation']};
}
test('a real calendar hole keeps current 11 bars blocked; older raw research actually runs existing engines',()=>{
 const input=fixture(),out=auditEuropeanCacheSeries(input);
 assert.equal(out.identity.status,'READY');assert.equal(out.sourceFields.status,'READY');assert.deepEqual(out.missingSourceSessions,['2026-09-17']);
 assert.equal(out.recentWindow.certificationWindow.from,'2026-09-18');assert.equal(out.recentWindow.certificationWindow.bars,11);
 assert.ok(out.recentWindow.technicalFields.sma20.causes.includes('SHORT_HISTORY'));
 const current=out.researchDiagnostics.find(d=>d.asOf==='2026-10-02');assert.equal(current.status,'BLOCKED');assert.ok(current.causes.includes('SHORT_HISTORY'));
 const historical=out.researchDiagnostics.find(d=>d.asOf==='2026-09-16');assert.equal(historical.mode,'RESEARCH_ONLY');assert.equal(historical.status,'PARTIAL');
 assert.ok(Number.isFinite(historical.fields.sma20.value));assert.ok(Number.isFinite(historical.fields.sma50.value));
 assert.ok(historical.causes.includes('HISTORICAL_DIAGNOSTIC_WINDOW_ONLY'));assert.equal(historical.screenerEligible,false);assert.equal(historical.strategyEligible,false);
 assert.equal(historical.inputSeriesHash,sha(input.history.bars));assert.equal(out.quant.score,null);assert.equal(out.publicDisplay,false);
});
test('source-invalid quarantines are separated from absent sessions and never filled',()=>{
 const input=fixture(),removed=input.history.bars.splice(20,1)[0];input.history.quarantined=[{date:removed.date,reason:'invalidOHLC'}];
 const out=auditEuropeanCacheSeries(input);assert.deepEqual(out.quarantinedSessions,[removed.date]);assert.deepEqual(out.missingSourceSessions,['2026-09-17']);
 assert.equal(out.quarantinedRows,1);assert.equal(out.sourceFields.matches,input.history.bars.length);
});
test('unknown field documentation, wrong ISIN, API version or host do not permit raw research',()=>{
 for(const mutate of [i=>i.rawDocumentationEvidence=[],i=>i.sources[0].body.isin='US000SYNTH00',i=>i.sources[1].apiVersion='v1',i=>i.sources[1].host='different.invalid']){
  const input=fixture();mutate(input);const out=auditEuropeanCacheSeries(input);
  assert.ok(out.researchDiagnostics.every(d=>d.status==='BLOCKED'&&d.causes.includes('PROVIDER_PROVENANCE_UNVERIFIED')));
 }
});
test('adapter differences invalidate diagnosis; current fields never gain implicit adjustment approval',()=>{
 const input=fixture();input.history.bars[0].close+=0.01;const out=auditEuropeanCacheSeries(input);
 assert.equal(out.sourceFields.status,'BLOCKED');assert.ok(out.sourceFields.causes.includes('ADAPTER_BUG'));
 assert.ok(Object.values(out.recentWindow.technicalFields).every(f=>f.status==='BLOCKED'&&f.value===null));
});
test('future bars cannot enter a current research window or a READY product field',()=>{
 const input=fixture();input.asOf='2026-10-01';assert.throws(()=>auditEuropeanCacheSeries(input),/FIXED_VALID/);
});
test('offline CLI refuses writing into any repository path before reading inputs',()=>{
 assert.throws(()=>runEuropeCacheAudit({out:new URL('../../../reports/private-audit/',import.meta.url).pathname}),/PRIVATE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED/);
});
