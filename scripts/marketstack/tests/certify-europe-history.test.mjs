import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {certifyEuropeanHistory} from '../certify-europe-history.mjs';
import {buildEuropeanCalendar} from '../europe-calendar.mjs';
import CanonicalBars from '../../../quant/engines/technical/canonical-bars.js';
import Features from '../../../quant/engines/technical/feature-store.js';
import methodology from '../../../quant/methodology/technical-v1.json' with {type:'json'};

function fixture(n=270){
 const calendar=buildEuropeanCalendar({mic:'XETR',timeZone:'Europe/Berlin',now:'2026-10-06T13:00:00Z',
  annualRules:[2025,2026].map(year=>({year,verified:true,weekdayTrading:true,closedDates:[],halfDays:[],basis:'SYNTHETIC_COMPLETE_YEAR_FIXTURE',evidence:['synthetic-test-calendar']})),
  regularClose:{verified:true,time:'17:35',evidence:['synthetic-test-close']}});
 const dates=calendar.expectedSessions.filter(d=>d<='2026-10-05').slice(-n);
 const listing={isin:'DE000SYNTH00',mic:'XETR',securityId:'synthetic-security',listingId:'synthetic-listing',currency:'EUR',quoteUnit:'EUR'};
 const history={source:'marketstack',apiVersion:'v2',...listing,sourceEvidence:['synthetic-only'],bars:dates.map((date,i)=>({date,open:100+i/10,high:101+i/10,low:99+i/10,close:100.5+i/10,volume:1000+i,splitFactor:1,dividend:0}))};
 const window={from:dates[0],to:dates.at(-1)};
 const basisEvidence={verified:true,kind:'LISTING_FIELD_WINDOW_VERIFICATION',isin:listing.isin,mic:listing.mic,...window,
  ohlcBasis:'RAW',volumeBasis:'RAW_SHARES',volumeUnit:'SHARES',actionsComplete:true,evidence:['synthetic-listing-window-validation'],
  splitSemantics:{verified:true,direction:'NEW_SHARES_PER_OLD_SHARE',eventDate:'EX_DATE',evidence:['synthetic-split-semantics']},
  dividendSemantics:{verified:true,basis:'PER_NEW_SHARE_AT_EX_DATE',currency:'EUR',evidence:['synthetic-dividend-semantics']}};
 return {listing,history,calendar,window,basisEvidence,asOf:'2026-10-06'};
}
test('certified input uses the existing feature engine exactly and binds current fields to original bars',()=>{
 const input=fixture(),before=JSON.stringify(input),out=certifyEuropeanHistory(input);
 assert.equal(out.splitAdjustedOHLC.status,'READY');assert.equal(out.splitAdjustedVolume.status,'READY');assert.equal(out.totalReturn.status,'READY');
 const bars=out.technicalBars;
 const series=CanonicalBars.createSeries({instrumentId:input.listing.securityId,exchange:'XETR',currency:'EUR',source:'marketstack',priceSeriesType:'SPLIT_ADJUSTED'},
  {timestamps:bars.map(b=>b.date),...Object.fromEntries(['open','high','low','close','volume'].map(k=>[k,bars.map(b=>b[k])]))});
 const central=Features.computeFeatures(series,methodology.features).last();
 assert.equal(out.technicalFields.sma20.value,central.sma20);
 assert.equal(out.technicalFields.momentum3M.value,central.momentum3M);
 assert.equal(out.technicalFields.relativeVolume.value,central.relativeVolume);
 for(const field of Object.values(out.technicalFields)){
  assert.equal(field.status,'READY');assert.equal(field.asOf,input.history.bars.at(-1).date);
  assert.equal(field.window.to,field.asOf);assert.equal(field.inputSeriesHash,createHash('sha256').update(JSON.stringify(input.history.bars)).digest('hex'));
  assert.ok(field.evidence.length);assert.ok(Number.isFinite(field.value));
 }
 assert.equal(JSON.stringify(input),before);assert.deepEqual(certifyEuropeanHistory(input),out);
 assert.equal(out.publicDisplay,false);assert.equal(out.quantScore,null);assert.equal(out.supertraderScore,null);
});
test('raw split and reverse split use central OHLC/volume normalization, once',()=>{
 for(const ratio of [2,0.5]){
  const input=fixture(30),i=15;
  input.history.bars.forEach((b,j)=>{for(const k of ['open','high','low','close'])b[k]=j<i?100:100/ratio;b.volume=j<i?1000:1000*ratio;});
  input.history.bars[i].splitFactor=ratio;
  const out=certifyEuropeanHistory(input);
  assert.equal(out.splitAdjustedOHLC.status,'READY');assert.equal(out.splitAdjustedVolume.status,'READY');assert.equal(out.totalReturn.status,'READY');
  assert.ok(out.technicalBars.every(b=>b.close===100/ratio&&b.volume===1000*ratio));
 }
});
test('already split-adjusted OHLC and volume are never adjusted again',()=>{
 const input=fixture(30);input.basisEvidence.ohlcBasis='SPLIT_ADJUSTED';input.basisEvidence.volumeBasis='SPLIT_ADJUSTED_SHARES';
 input.history.bars[15].splitFactor=2;
 const out=certifyEuropeanHistory(input);assert.equal(out.splitAdjustedOHLC.status,'READY');
 assert.deepEqual(out.technicalBars.map(b=>b.close),input.history.bars.map(b=>b.close));
 assert.deepEqual(out.technicalBars.map(b=>b.volume),input.history.bars.map(b=>b.volume));assert.equal(out.totalReturn.status,'BLOCKED');
});
test('field names and successful responses do not certify listing/window basis',()=>{
 const input=fixture();input.basisEvidence={verified:true,evidence:['docs'],ohlcBasis:'RAW'};
 const out=certifyEuropeanHistory(input);assert.equal(out.splitAdjustedOHLC.status,'BLOCKED');assert.ok(out.splitAdjustedOHLC.causes.includes('UNKNOWN_ADJUSTMENT_BASIS'));
 assert.ok(Object.values(out.technicalFields).every(f=>f.status==='BLOCKED'&&f.value===null));
});
test('missing volume blocks only volume features, and zero volume does not invalidate price',()=>{
 const input=fixture(30);input.history.bars[0].volume=null;
 const out=certifyEuropeanHistory(input);assert.equal(out.technicalFields.sma20.status,'READY');assert.equal(out.technicalFields.relativeVolume.status,'BLOCKED');
 assert.equal(out.splitAdjustedOHLC.status,'READY');assert.ok(out.technicalBars.every(b=>b.volume===null));
 input.history.bars.forEach(b=>b.volume=0);const zero=certifyEuropeanHistory(input);
 assert.equal(zero.splitAdjustedVolume.status,'READY');assert.equal(zero.splitAdjustedOHLC.status,'READY');
});
test('short genuine history grants only warm engines and no fabricated 52W/long values',()=>{
 const out=certifyEuropeanHistory(fixture(30));assert.equal(out.technicalFields.sma20.status,'READY');assert.equal(out.technicalFields.momentum1M.status,'READY');
 assert.equal(out.technicalFields.sma200.status,'BLOCKED');assert.equal(out.technicalFields.high52w.value,null);assert.ok(out.technicalFields.high52w.causes.includes('SHORT_HISTORY'));
});
test('missing or unexpected calendar sessions are visible, never filled or removed',()=>{
 const input=fixture(30),removed=input.history.bars.splice(5,1)[0],out=certifyEuropeanHistory(input);
 assert.deepEqual(out.missingSessions,[removed.date]);assert.ok(out.splitAdjustedOHLC.causes.includes('MISSING_HISTORY'));
 assert.equal(out.fullHistoryQuality.bars,29);
 const weekend=fixture(30);weekend.history.bars.push({...weekend.history.bars.at(-1),date:'2026-10-03'});
 const bad=certifyEuropeanHistory(weekend);assert.ok(bad.unexpectedSessions.includes('2026-10-03'));assert.equal(bad.splitAdjustedOHLC.status,'BLOCKED');
});
test('observed prices or another MIC cannot replace an independent calendar',()=>{
 const input=fixture();input.calendar.mic='XPAR';const out=certifyEuropeanHistory(input);
 assert.ok(out.splitAdjustedOHLC.causes.includes('MISSING_CALENDAR_BASIS'));
});
test('adapter quarantines, duplicates, identity and currency contradictions are not silently repaired',()=>{
 const input=fixture(30);input.history.quarantined=[{date:input.history.bars[3].date,reason:'ORIGINAL_BAD_ROW'}];
 input.history.bars[5].currency='USD';input.history.bars[6].date=input.history.bars[5].date;
 const out=certifyEuropeanHistory(input);assert.ok(out.splitAdjustedOHLC.causes.includes('MAPPING_ERROR'));assert.ok(out.splitAdjustedOHLC.causes.includes('PROVIDER_DATA_DEFECT'));
 assert.equal(out.fullHistoryQuality.quarantinedRowsRetained,1);assert.equal(input.history.bars.length,30);
 input.history.mic='XNAS';assert.ok(certifyEuropeanHistory(input).splitAdjustedOHLC.causes.includes('MAPPING_ERROR'));
});
test('older defect blocks full window, while a verified recent window can be diagnosed independently',()=>{
 const input=fixture(270);input.history.bars[0].high=-1;
 assert.equal(certifyEuropeanHistory(input).splitAdjustedOHLC.status,'BLOCKED');
 input.window.from=input.history.bars[20].date;
 const scoped=certifyEuropeanHistory(input);assert.equal(scoped.splitAdjustedOHLC.status,'READY');assert.equal(scoped.fullHistoryQuality.issues.some(i=>i.reason==='MISSING_OR_INVALID_OHLC'),true);
 assert.equal(scoped.technicalFields.sma200.status,'READY');
 input.window.to=input.history.bars.at(-2).date;
 const historical=certifyEuropeanHistory(input);assert.ok(historical.technicalFields.sma20.causes.includes('HISTORICAL_DIAGNOSTIC_WINDOW_ONLY'));assert.equal(historical.technicalFields.sma20.value,null);
});
test('unknown split direction, missing action fields, old-share dividends and MIC-less actions cannot certify TR',()=>{
 const input=fixture(30);input.basisEvidence.dividendSemantics.basis='PER_OLD_SHARE';assert.equal(certifyEuropeanHistory(input).totalReturn.status,'BLOCKED');
 input.basisEvidence.dividendSemantics.basis='PER_NEW_SHARE_AT_EX_DATE';input.history.bars[3].dividend=null;assert.equal(certifyEuropeanHistory(input).totalReturn.status,'BLOCKED');
 input.history.bars[3].dividend=0;input.basisEvidence.splitSemantics.direction='OLD_SHARES_PER_NEW_SHARE';assert.equal(certifyEuropeanHistory(input).splitAdjustedOHLC.status,'BLOCKED');
 input.basisEvidence.splitSemantics.direction='NEW_SHARES_PER_OLD_SHARE';input.basisEvidence.mic='MIC_NOT_REPORTED';assert.equal(certifyEuropeanHistory(input).totalReturn.status,'BLOCKED');
});
test('adjusted OHLC diagnostics cannot automatically change verified raw input basis',()=>{
 const input=fixture(30);input.history.bars[0].adjustmentObservation={open:80,high:90,low:70,close:85};
 const out=certifyEuropeanHistory(input);assert.ok(out.rawVsAdjustedObservations.adjustedFieldIssues.length);
 assert.equal(out.rawVsAdjustedObservations.adjustmentObservationIsNotCertification,true);assert.equal(out.splitAdjustedOHLC.status,'READY');
});
test('null rows, invalid dates and invalid fixed windows fail safely without crashing on observations',()=>{
 const input=fixture(30);input.history.bars[0]=null;assert.equal(certifyEuropeanHistory(input).splitAdjustedOHLC.status,'BLOCKED');
 input.window.to='2026-10-07';assert.throws(()=>certifyEuropeanHistory(input),/FIXED_VALID/);
});
