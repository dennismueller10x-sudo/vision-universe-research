import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {auditEuropeanCacheSeries,runEuropeCacheAudit,compactEuropeanCacheAudit} from '../audit-europe-cache.mjs';
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
 const current=out.researchDiagnostics.find(d=>d.asOf==='2026-10-02');assert.equal(current.status,'PARTIAL');
 assert.equal(current.fields.sma20.status,'BLOCKED');assert.ok(current.fields.sma20.causes.includes('SHORT_HISTORY'));
 assert.equal(current.fields.drawdown.status,'PARTIAL');assert.equal(current.fields.drawdown.valueUnit,'FRACTION_FROM_WINDOW_RUNNING_HIGH');
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
test('private raw chart is bound to the safe current window while adjusted indicators and relative strength remain blocked',()=>{
 const input=fixture(),out=auditEuropeanCacheSeries(input);
 assert.equal(out.chart.status,'PARTIAL');assert.equal(out.chart.state,'CHART_READY_WITH_LIMITATION');assert.deepEqual(out.chart.window,{start:'2026-09-18',end:'2026-10-02'});
 assert.equal(out.chart.inputSeriesHash,sha(input.history.bars));assert.equal(out.chart.asOf,'2026-10-02');assert.equal(out.chart.dataAsOf,'2026-10-06');
 assert.equal(out.chart.priceBasis,'RAW');assert.equal(out.chart.publicDisplay,false);
 assert.equal(out.relativeStrength.status,'BLOCKED');assert.deepEqual(out.relativeStrength.causes,['RS_BLOCKED_NO_BENCHMARK']);
 assert.ok(out.adjustmentWindowObservation.identicalRawAndAdjustedOHLC===0);
 assert.ok(Object.values(out.recentWindow.technicalFields).every(f=>f.status!=='READY'));
 const diagnosis=out.researchDiagnostics.find(d=>d.asOf==='2026-09-16');assert.ok(Number.isFinite(diagnosis.fields.drawdown.value));
 assert.equal(diagnosis.trendDiagnostic.mode,'RESEARCH_ONLY');assert.equal(diagnosis.trendDiagnostic.screenerEligible,false);
});
test('compact reports keep full issue counts and hashes without duplicating bars or total-return arrays',()=>{
 const input=fixture(),out=auditEuropeanCacheSeries(input),compact=compactEuropeanCacheAudit(out);
 assert.equal(compact.fullWindow.fullHistoryQuality.issues.count,out.fullWindow.fullHistoryQuality.issues.length);
 assert.equal(compact.fullWindow.fullHistoryQuality.issues.sha256,sha(out.fullWindow.fullHistoryQuality.issues));
 assert.equal(compact.fullWindow.technicalBars,null);assert.equal(compact.inputSeriesHash,sha(input.history.bars));
 if(out.totalReturnDiagnostic.engineResult?.tr)assert.equal(compact.totalReturnDiagnostic.engineResult.tr.sha256,sha(out.totalReturnDiagnostic.engineResult.tr));
 assert.deepEqual(compact.recentWindow.technicalFields,out.recentWindow.technicalFields);assert.deepEqual(compact.chart,out.chart);
});
test('original source availability never labels stale or unknown latest EOD READY',()=>{
 const input=fixture(),stale=auditEuropeanCacheSeries(input);
 assert.equal(stale.sourceFields.status,'READY');assert.equal(stale.latestEod.status,'PARTIAL');assert.equal(stale.latestEod.state,'STALE');
 const unknown=auditEuropeanCacheSeries({...input,calendar:undefined});
 assert.equal(unknown.latestEod.status,'BLOCKED');assert.equal(unknown.latestEod.state,'UNKNOWN');
 const lastDate=input.history.bars.at(-1).date;
 const freshCalendar={...input.calendar,expectedLastSession:lastDate,localClock:{date:'2026-10-03',time:'10:00'},verified:true};
 const fresh=auditEuropeanCacheSeries({...input,calendar:freshCalendar});assert.equal(fresh.latestEod.status,'READY');
 assert.equal(fresh.latestEod.state,'FRESH_LAST_VALID_SESSION');
 const invalid=auditEuropeanCacheSeries({...input,calendar:{...freshCalendar,expectedLastSession:'2026-10-01'}});
 assert.equal(invalid.latestEod.status,'BLOCKED');assert.equal(invalid.latestEod.state,'INVALID');
});
test('current source-matching OHLC and currency defects block latest EOD, while an older defect does not',()=>{
 function fresh(){const i=fixture();i.calendar={...i.calendar,expectedLastSession:i.history.bars.at(-1).date,localClock:{date:'2026-10-03',time:'10:00'},verified:true};return i;}
 for(const mutate of [i=>i.history.currency='GBP',i=>i.history.bars.at(-1).currency='GBP',i=>i.sources[1].body.data.at(-1).currency='GBP',i=>i.sources[1].body.data.at(-1).price_currency='GBP',i=>i.history.bars.at(-1).quoteUnit='MINOR',
  i=>{i.history.bars.at(-1).high=1;i.sources[1].body.data.at(-1).high=1;}]){
  const i=fresh();mutate(i);const r=auditEuropeanCacheSeries(i);assert.equal(r.sourceFields.status,'READY');
  assert.equal(r.latestEod.status,'BLOCKED');assert.equal(r.latestEod.state,'INVALID');
  assert.ok(r.latestEod.causes.includes('MAPPING_ERROR')||r.latestEod.causes.includes('PROVIDER_DATA_DEFECT'));
 }
 const i=fresh();i.history.bars[0].high=1;i.sources[1].body.data[0].high=1;const r=auditEuropeanCacheSeries(i);
 assert.equal(r.latestEod.status,'READY');assert.ok(r.fullWindow.splitAdjustedOHLC.causes.includes('PROVIDER_DATA_DEFECT'));
 const alias=fresh();alias.history.bars.at(-1).quoteUnit='MAJOR_CURRENCY_UNIT';assert.equal(auditEuropeanCacheSeries(alias).latestEod.status,'READY');
 const earlierMismatch=fresh();earlierMismatch.history.bars[0].close+=0.01;const local=auditEuropeanCacheSeries(earlierMismatch);
 assert.equal(local.sourceFields.status,'BLOCKED');assert.equal(local.latestEod.status,'READY');assert.equal(local.chart.status,'READY');
 assert.ok(local.researchDiagnostics.some(d=>d.asOf===earlierMismatch.history.bars.at(-1).date&&d.status==='PARTIAL'));
});
test('the current chart allows only a fresh session or one exactly proven session of delay',()=>{
 const input=fixture(),one=auditEuropeanCacheSeries(input);assert.equal(one.chart.status,'PARTIAL');assert.equal(one.chart.lagSessions,1);
 assert.ok(one.chart.causes.includes('STALE_EOD'));assert.equal(one.chart.freshnessPolicy.maxLagSessions,1);
 const fresh=auditEuropeanCacheSeries({...input,calendar:{...input.calendar,expectedLastSession:'2026-10-02'}});
 assert.equal(fresh.chart.status,'READY');assert.equal(fresh.chart.state,'CHART_READY');
 const two=auditEuropeanCacheSeries({...input,calendar:{...input.calendar,expectedLastSession:'2026-10-06'}});
 assert.equal(two.chart.status,'BLOCKED');assert.equal(two.chart.lagSessions,2);assert.equal(two.chart.state,'CHART_BLOCKED');
 assert.ok(two.researchDiagnostics.some(d=>d.status==='PARTIAL'));
 const unknown=auditEuropeanCacheSeries({...input,calendar:{...input.calendar,verified:false,expectedLastSession:null}});
 assert.equal(unknown.chart.status,'BLOCKED');assert.equal(unknown.chart.lagSessions,null);
 const wrongUnit=fixture();wrongUnit.history.bars.at(-1).quoteUnit='MINOR';assert.equal(auditEuropeanCacheSeries(wrongUnit).chart.status,'BLOCKED');
});
test('immutable bad-observation ledger remains counted after a genuine source correction without an active-quarantine blanket block',()=>{
 const input=fixture();input.history.quarantineLedger=[{date:'2026-01-02',reason:'invalidOHLC',sourceEvidence:'synthetic-original-bad-response'}];
 const r=auditEuropeanCacheSeries(input);assert.equal(r.immutableQuarantineObservationCount,1);assert.equal(r.activeQuarantineCount,0);
 assert.equal(r.immutableQuarantineLedgerHash,sha(input.history.quarantineLedger));
 assert.equal(r.fullWindow.fullHistoryQuality.immutableQuarantineObservationCount,1);
 assert.equal(r.fullWindow.fullHistoryQuality.activeQuarantineCount,0);assert.equal(r.chart.status,'PARTIAL');
});
test('a volume adapter mismatch does not certify volume or block independently verified source-price windows',()=>{
 const input=fixture();input.history.bars.at(-1).volume=null;const r=auditEuropeanCacheSeries(input);
 assert.equal(r.sourceFields.status,'BLOCKED');assert.equal(r.sourceFields.priceStatus,'READY');assert.equal(r.sourceFields.volumeStatus,'BLOCKED');
 assert.equal(r.latestEod.state,'STALE');assert.equal(r.latestEod.status,'PARTIAL');assert.equal(r.chart.status,'PARTIAL');
 assert.equal(r.recentWindow.technicalFields.relativeVolume.status,'BLOCKED');
});
test('explicit original row MIC aliases and ISIN cannot contradict the frozen identity',()=>{
 for(const patch of [{exchange_code:'XPAR'},{isin:'US000SYNTH00'}]){
  const input=fixture();Object.assign(input.sources[1].body.data.at(-1),patch);const r=auditEuropeanCacheSeries(input);
  assert.equal(r.sourceFields.priceStatus,'BLOCKED');assert.equal(r.latestEod.status,'BLOCKED');assert.equal(r.chart.status,'BLOCKED');
 }
 const input=fixture();Object.assign(input.sources[1].body.data.at(-1),{exchange_code:input.listing.mic,isin:input.listing.isin});
 const r=auditEuropeanCacheSeries(input);assert.equal(r.sourceFields.priceStatus,'READY');assert.equal(r.chart.status,'PARTIAL');
});
test('future bars cannot enter a current research window or a READY product field',()=>{
 const input=fixture();input.asOf='2026-10-01';assert.throws(()=>auditEuropeanCacheSeries(input),/FIXED_VALID/);
});
test('offline CLI refuses writing into any repository path before reading inputs',()=>{
 assert.throws(()=>runEuropeCacheAudit({out:new URL('../../../reports/private-audit/',import.meta.url).pathname}),/PRIVATE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED/);
});

test('offline audit checks source content hashes before certification and keeps files private',async()=>{
 const fs=await import('node:fs'),{tmpdir}=await import('node:os'),path=await import('node:path');
 const dir=fs.mkdtempSync(path.join(tmpdir(),'vu-private-source-audit-'));
 try{
  const input=fixture(),listing={...input.listing,listingId:'lst_XETR_DE0007164600',securityId:'sec_isin_DE0007164600',isin:'DE0007164600'};
  const history={...input.history,isin:listing.isin,sourceEvidence:[],bars:input.history.bars.map(b=>({...b,securityId:listing.securityId,listingId:listing.listingId}))};input.sources[0].body.isin=listing.isin;
  fs.mkdirSync(path.join(dir,'normalized'));fs.mkdirSync(path.join(dir,'sources'));
  for(const s of input.sources){const id=sha(s);history.sourceEvidence.push('sha256:'+id);fs.writeFileSync(path.join(dir,'sources',id+'.json'),JSON.stringify(s));}
  fs.writeFileSync(path.join(dir,'normalized',listing.listingId+'.json'),JSON.stringify(history));
  const frozenListing={...listing,tradingCurrency:listing.currency};delete frozenListing.currency;
  fs.writeFileSync(path.join(dir,'request.json'),JSON.stringify({listingMap:{listings:[frozenListing]}}));
  fs.writeFileSync(path.join(dir,'calendars.json'),JSON.stringify({configs:{XETR:{mic:'XETR',timeZone:'Europe/Berlin',annualRules:[{year:2026,verified:true,weekdayTrading:true,closedDates:[],halfDays:[],evidence:['synthetic-calendar']}],regularClose:{verified:true,time:'17:30',meaning:'NOT_BEFORE',evidence:['synthetic-close']}}}}));
  const opts={requestPath:path.join(dir,'request.json'),normalizedDir:path.join(dir,'normalized'),sourceDir:path.join(dir,'sources'),calendarRulesPath:path.join(dir,'calendars.json'),out:path.join(dir,'out'),asOf:input.asOf,now:input.calendar.now};
  runEuropeCacheAudit(opts);assert.equal(fs.statSync(opts.out).mode&0o777,0o700);assert.equal(fs.statSync(path.join(opts.out,'summary.json')).mode&0o777,0o600);
  assert.equal(JSON.parse(fs.readFileSync(path.join(opts.out,listing.listingId+'.json'))).chart.status,'PARTIAL');
  const sourcePath=path.join(dir,'sources',history.sourceEvidence[0].slice(7)+'.json'),tampered=JSON.parse(fs.readFileSync(sourcePath));tampered.body.isin='WRONG';fs.writeFileSync(sourcePath,JSON.stringify(tampered));
  assert.throws(()=>runEuropeCacheAudit({...opts,out:path.join(dir,'rejected')}),/SOURCE_EVIDENCE_HASH_MISMATCH/);
  assert.equal(fs.existsSync(path.join(dir,'rejected',listing.listingId+'.json')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
