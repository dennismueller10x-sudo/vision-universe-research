import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import legacy from '../engine/strategies/kk-breakout-v32.mjs';
import {certifiedLegacyMomentumEntry,legacyClosedSessionExitPolicy} from '../research/certification/legacy-momentum-execution.mjs';
import * as original from '../research/tournament/accounting.mjs';
import * as overlay from '../research/certification/execution-audit-accounting.mjs';
import {certifyOfficialCashEvent,processCertifiedCashEvents,terminalClassHintR15,certifiedTerminalTotalReturn,terminalExecutionCertification,terminalClassHintAsOf,terminalClassificationPITOverlay} from '../research/certification/execution-audit.mjs';
import {classifyDelistingR15} from '../validation/sec-pit.mjs';

const cfg={slippageBpsPerSide:10,commissionBpsPerSide:1};
const bars=(date,open=100,close=100)=>new Map([['SYNTHETIC',{date,open,close,low:80,high:120,rawClose:close,dividend:0}]]);
const event=(extra={})=>({status:'CERTIFIED_LEGAL_CASH_ENTITLEMENT',eventId:'SYNTHETIC_EVENT',economicActionId:'SYNTHETIC_ACTION',id:'SYNTHETIC',listingId:'SYNTHETIC',securityId:'SYNTHETIC_SECURITY',identityStatus:'PIT_IDENTITY_CERTIFIED',eventType:'CASH_ACQUISITION',availableAt:'2024-01-02T12:00:00Z',effectiveAt:'2024-01-03T15:00:00Z',settlementDate:'2024-01-05',settlementAt:'2024-01-05T21:00:00Z',cashAmountStatus:'EXACT_OFFICIAL_CASH_AMOUNT',settlementDateStatus:'ACTUAL_CONFIRMED',currency:'USD',priceBasis:'RAW_SHARE',perShareCash:120,executionAdjustmentFactor:1,adjustmentBasisStatus:'CERTIFIED_AT_EFFECTIVE_EVENT',officialSource:{kind:'SEC_FILING',url:'https://www.sec.gov/Archives/synthetic-test-only',locator:'Synthetic contract fixture; not a researched source.',inspectionStatus:'BODY_INSPECTED',bodySha256:'a'.repeat(64)},...extra});
const payment=(extra={})=>event({status:'ACTUAL_CASH_SETTLEMENT_CERTIFIED',eventId:'SETTLEMENT_PROOF',claimEventId:'SYNTHETIC_EVENT',availableAt:'2024-01-05T21:01:00Z',...extra});
const enter=(api)=>{const b=api.createBook(1000);api.executeTargets(b,[{id:'SYNTHETIC',ticker:'SYNTHETIC',weight:.5}],bars('2024-01-02'),'2024-01-02',cfg,{asOf:'2024-01-01'});return b;};

test('legacy inherits full execution-day low: certified instant gate is invariant to later low',()=>{
  const ctx={bars:{date:['2024-01-01','2024-01-02'],open:[100,110],high:[101,120],low:[99,109],close:[100,115],volume:[100,100]},ind:{adr20:[.2,.2],vol50:[100,100]}};
  const pending={levels:{trigger:105,adr20:.2}};
  const evidence={status:'ENTRY_TIME_OBSERVATION_CERTIFIED',entryTimestamp:'2024-01-02T14:30:00Z',observedThrough:'2024-01-02T14:30:00Z',snapshotKind:'INSTANT_AT_ENTRY',sourceContract:'NO_OBSERVATION_AFTER_ENTRY',sourceHash:'a'.repeat(64),sessionOpen:110,lowObservedThroughEntry:110,triggerReached:true};
  const bad1=legacy.intradayEntry(ctx,1,pending),good1=certifiedLegacyMomentumEntry(ctx,1,pending,evidence);
  ctx.bars.low[1]=90;
  assert.notEqual(legacy.intradayEntry(ctx,1,pending).stop,bad1.stop);
  assert.deepEqual(certifiedLegacyMomentumEntry(ctx,1,pending,evidence),good1);
  ctx.bars.close[1]=80;ctx.bars.high[1]=150;ctx.bars.volume[1]=10000;
  assert.deepEqual(certifiedLegacyMomentumEntry(ctx,1,pending,evidence),good1);
  assert.equal(good1.price,110);assert.equal(good1.stop,110*.9999);
  assert.equal(certifiedLegacyMomentumEntry(ctx,1,pending,null).notTaken,true);
  assert.equal(certifiedLegacyMomentumEntry(ctx,1,pending,{...evidence,observedThrough:'2024-01-02T21:00:00Z'}).notTaken,true);
});

test('legacy unfavorable same-day exit is a separate later close phase',()=>{
  const input={close:90,entryPrice:110,stop:100,sessionDate:'2024-01-02',sessionClockStatus:'EXCHANGE_CALENDAR_CERTIFIED',sessionClosedAt:'2024-01-02T21:00:00Z'};
  assert.equal(legacyClosedSessionExitPolicy({...input,asOfTimestamp:'2024-01-02T14:30:00Z'}).available,false);
  assert.deepEqual(legacyClosedSessionExitPolicy({...input,asOfTimestamp:'2024-01-02T21:00:00Z'}),{available:true,pessimisticSameDayExit:true,certainSameDayExit:true});
  for(const sessionClosedAt of ['2024-01-02','2024-01-02T00:00:00','2024-02-31T21:00:00Z','2024-01-02T25:00:00Z'])
    assert.equal(legacyClosedSessionExitPolicy({...input,sessionClosedAt,asOfTimestamp:'2024-01-02T21:00:00Z'}).available,false);
  assert.equal(legacyClosedSessionExitPolicy({...input,sessionDate:'2024-01-03',asOfTimestamp:'2024-01-02T21:00:00Z'}).available,false);
  assert.equal(legacyClosedSessionExitPolicy({...input,sessionClockStatus:'UNKNOWN',asOfTimestamp:'2024-01-02T21:00:00Z'}).available,false);
});

test('no-certificate accounting parity preserves fees, dividends, partial stop state and unknown terminals',()=>{
  const a=enter(original),b=enter(overlay);
  for(const [api,book]of [[original,a],[overlay,b]]){
    const d=bars('2024-01-03',103,102);d.get('SYNTHETIC').dividend=1;api.creditDividends(book,d);
    api.executeTargets(book,[{id:'SYNTHETIC',weight:.5}],d,'2024-01-03',cfg,{asOf:'2024-01-02',stateful:true,signals:[{id:'SYNTHETIC',sellFraction:1/3,moveStopToBreakEven:true}]});
    api.markClose(book,d,'2024-01-03');
    api.settleTerminals(book,bars('2024-01-04',99,97),[{id:'SYNTHETIC',date:'2024-01-04',delistClass:'UNKNOWN'}],'2024-01-04',cfg,'UNKNOWN_MINUS_30');
    api.markClose(book,bars('2024-01-04',99,97),'2024-01-04');
    assert.equal(api.reconcileBook(book).pass,true);
  }
  for(const field of ['cash','curve','trades','fills','executionCosts','dividends','turnover','rejections'])assert.deepEqual(b[field],a[field]);
});

test('actual zero/missing opens reject and do not fabricate fills; rejected partial leaves state unchanged',()=>{
  const b=enter(overlay),p=b.positions.get('SYNTHETIC'),shares=p.shares;
  for(const d of [new Map(),bars('2024-01-03',0,100)])overlay.executeTargets(b,[{id:'SYNTHETIC',weight:.5}],d,'2024-01-03',cfg,{asOf:'2024-01-02',stateful:true,signals:[{id:'SYNTHETIC',sellFraction:1/3,moveStopToBreakEven:true}]});
  assert.equal(p.shares,shares);assert.equal(p.partialDone,false);assert.equal(p.stop,null);assert.equal(b.fills.length,1);
});

test('official cash: recognize receivable, preserve equity/reconciliation, settle once and never 30pct discount',()=>{
  const b=enter(overlay),p=b.positions.get('SYNTHETIC'),q=p.shares,cost=p.cost,initialCash=b.cash;
  processCertifiedCashEvents(b,[event()],{date:'2024-01-03',asOfTimestamp:'2024-01-03T21:00:00Z'});
  assert.equal(b.positions.size,0);assert.equal(b.receivables.size,1);assert.equal(b.cash,initialCash);
  assert.equal(overlay.equityAt(b,new Map()),initialCash+q*120);
  overlay.markClose(b,new Map(),'2024-01-03');assert.equal(overlay.reconcileBook(b).pass,true);
  assert.equal(b.curve.at(-1).exposure,0);
  processCertifiedCashEvents(b,[event(),payment()],{date:'2024-01-05',asOfTimestamp:'2024-01-05T20:00:00Z'});assert.equal(b.cash,initialCash);
  processCertifiedCashEvents(b,[event(),payment()],{date:'2024-01-05',asOfTimestamp:'2024-01-05T21:01:00Z'});
  assert.equal(b.cash,initialCash+q*120);assert.equal(b.trades[0].pnl,q*120-cost);assert.equal(b.trades[0].transactionCosts,0);
  processCertifiedCashEvents(b,[event(),payment()],{date:'2024-01-05',asOfTimestamp:'2024-01-05T21:01:00Z'});assert.equal(b.trades.length,1);
  overlay.markClose(b,new Map(),'2024-01-05');assert.equal(overlay.reconcileBook(b).pass,true);
});

test('cash certificates reject future publication, class-only hints, missing dates/units and unsupported zero',()=>{
  const opts={asOfTimestamp:'2024-01-06T21:00:00Z'},full=extra=>event({status:'OFFICIAL_EVENT_CERTIFIED',availableAt:'2024-01-05T21:01:00Z',...extra});
  for(const e of [full({availableAt:'2024-01-07T12:00:00Z'}),full({settlementDate:null}),full({settlementAt:undefined}),full({priceBasis:'UNKNOWN'}),full({identityStatus:'CURRENT_ONLY'}),full({perShareCash:0}),full({availableAt:'2024-01-02T12:00:00Z'}),{delistClass:'SPAC_TRUST'}])assert.equal(certifyOfficialCashEvent(e,opts).accepted,false);
  assert.equal(certifyOfficialCashEvent(full({perShareCash:0,eventType:'EQUITY_CANCELLED_ZERO'}),opts).accepted,true);
  assert.equal(certifyOfficialCashEvent(full({settlementAt:undefined,cashTimingConvention:'AFTER_SETTLEMENT_DATE_CLOSE_VU_CONSERVATIVE'}),opts).cashAvailableAt,'2024-01-05T23:59:59.999Z');
  assert.equal(certifyOfficialCashEvent(event({perShareCash:Number.MAX_VALUE,executionAdjustmentFactor:Number.MIN_VALUE}),opts).reason,'ADJUSTED_CASH_NONFINITE');
  assert.equal(certifyOfficialCashEvent(event({cashAmountStatus:'APPROXIMATE'}),opts).accepted,false);
  assert.equal(certifyOfficialCashEvent(full({settlementDateStatus:'EXPECTED'}),opts).accepted,false);
});

test('pending known cash action retains last mark before effective time then becomes dated receivable',()=>{
  const b=enter(overlay),d=bars('2024-01-03',100,99),q=b.positions.get('SYNTHETIC').shares;
  overlay.settleTerminals(b,d,[{id:'SYNTHETIC',date:'2024-01-03',delistClass:'UNKNOWN'}],'2024-01-03',cfg,'UNKNOWN_MINUS_30',{certifiedEvents:[event({effectiveAt:'2024-01-04T15:00:00Z'})],asOfTimestamp:'2024-01-03T21:00:00Z'});
  assert.equal(b.positions.size,1);assert.equal(b.receivables.size,0);assert.equal(b.terminalCount,0);
  overlay.markClose(b,d,'2024-01-03');assert.ok(Math.abs(b.curve.at(-1).equity-(b.cash+q*99))<1e-9);
  processCertifiedCashEvents(b,[event({effectiveAt:'2024-01-04T15:00:00Z'})],{date:'2024-01-04',asOfTimestamp:'2024-01-04T21:00:00Z'});
  assert.equal(b.positions.size,0);assert.equal(b.receivables.size,1);
});

test('conflicting cash ledger rejects atomically and cannot overwrite recognized action',()=>{
  const b=enter(overlay),cash=b.cash,q=b.positions.get('SYNTHETIC').shares,opts={date:'2024-01-03',asOfTimestamp:'2024-01-03T21:00:00Z'};
  assert.throws(()=>processCertifiedCashEvents(b,[event(),event({eventId:'SECOND',perShareCash:150})],opts),/CONFLICTING/);
  assert.equal(b.cash,cash);assert.equal(b.positions.get('SYNTHETIC').shares,q);assert.equal(b.receivables.size,0);
  processCertifiedCashEvents(b,[event()],opts);
  assert.throws(()=>processCertifiedCashEvents(b,[event({perShareCash:150})],opts),/CONFLICTING/);
  assert.equal(b.receivables.get('SYNTHETIC_EVENT').cashPerShare,120);
});

test('action effective before open rejects pending reentry and preserves exact ordinary fees',()=>{
  const b=enter(overlay),fills=b.fills.length,fees=b.executionCosts;
  overlay.executeTargets(b,[{id:'SYNTHETIC',weight:.5}],bars('2024-01-03'),'2024-01-03',cfg,{asOf:'2024-01-02',certifiedEvents:[event()],asOfTimestamp:'2024-01-03T15:01:00Z'});
  assert.equal(b.fills.length,fills);assert.equal(b.executionCosts,fees);assert.equal(b.positions.size,0);assert.equal(b.receivables.size,1);
  assert.equal(b.rejections.at(-1).reason,'OFFICIAL_EVENT_SECURITY_NOT_TRADABLE');
});

test('R15 five historical SEC metadata cases are reused only as class hints; SIC does not certify payout',()=>{
  const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/delist-cases-r15.json',import.meta.url)));
  assert.equal(fixture.cases.length,5);
  for(const c of fixture.cases){const candidate=c.candidates.find(x=>x.sic);const f=candidate.filingsInWindow;
    const hint=terminalClassHintR15({filings:{form:f.map(x=>x[0]),filingDate:f.map(x=>x[1])},sic:candidate.sic,listEnd:c.listEnd,distress:c.distress},classifyDelistingR15);
    assert.equal(hint.cls,c.expect);assert.equal(hint.proceedsKnown,false);assert.equal(hint.pitDecisionAvailable,false);
  }
});

test('fixed-horizon cash endpoint uses certified payout without market haircut, including zero cancellation',()=>{
  const input={event:event(),asOfTimestamp:'2024-01-05T21:00:00Z',entry:{open:100,close:100,totalReturnIndex:1},lastTradingBar:{date:'2024-01-03',close:100,totalReturnIndex:1}};
  assert.ok(Math.abs(certifiedTerminalTotalReturn(input).totalReturn-.2)<1e-12);
  assert.equal(certifiedTerminalTotalReturn({...input,event:event({perShareCash:0,eventType:'EQUITY_CANCELLED_ZERO'})}).totalReturn,-1);
  assert.equal(certifiedTerminalTotalReturn({...input,asOfTimestamp:'2024-01-01T21:00:00Z'}).available,false);
});

test('data quarantine and class-only terminal scenarios never become certified realized outcomes',()=>{
  assert.equal(terminalExecutionCertification({kind:'DATA_QUARANTINE'}).status,'UNCERTIFIED_OUTCOME');
  assert.equal(terminalExecutionCertification({kind:'DELISTED',delistClass:'SPAC_TRUST',proceedsKnown:false}).status,'SCENARIO_ASSUMPTION_ONLY');
  assert.equal(terminalExecutionCertification({kind:'DELISTED'},{event:event(),asOfTimestamp:'2024-01-03T21:00:00Z'}).status,'CERTIFIED_CASH_RECEIVABLE');
});

test('two-stage legal cash claim needs no payment date; later visible actual settlement releases cash only then',()=>{
  const b=enter(overlay),q=b.positions.get('SYNTHETIC').shares,cash=b.cash;
  const legal=event({status:'CERTIFIED_LEGAL_CASH_ENTITLEMENT',settlementDate:undefined,settlementAt:undefined,settlementDateStatus:undefined});
  assert.equal(certifyOfficialCashEvent(legal,{asOfTimestamp:'2024-01-03T21:00:00Z'}).accepted,true);
  processCertifiedCashEvents(b,[legal],{date:'2024-01-03',asOfTimestamp:'2024-01-03T21:00:00Z'});
  assert.equal(b.positions.size,0);assert.equal(b.receivables.size,1);assert.equal(b.cash,cash);
  assert.equal(overlay.equityAt(b,new Map()),cash+q*120);
  overlay.markClose(b,new Map(),'2024-01-03');assert.equal(overlay.reconcileBook(b).pass,true);
  const paid=event({status:'ACTUAL_CASH_SETTLEMENT_CERTIFIED',eventId:'SETTLEMENT_PROOF',claimEventId:legal.eventId,availableAt:'2024-01-05T21:01:00Z'});
  processCertifiedCashEvents(b,[legal,{...paid,perShareCash:240,executionAdjustmentFactor:2}],{date:'2024-01-05',asOfTimestamp:'2024-01-05T21:01:00Z'});
  assert.equal(b.cash,cash);assert.equal(b.receivables.size,1);
  processCertifiedCashEvents(b,[legal,paid],{date:'2024-01-05',asOfTimestamp:'2024-01-05T20:00:00Z'});assert.equal(b.cash,cash);
  processCertifiedCashEvents(b,[legal,paid],{date:'2024-01-05',asOfTimestamp:'2024-01-05T21:01:00Z'});
  assert.equal(b.cash,cash+q*120);assert.equal(b.receivables.size,0);assert.equal(b.trades.length,1);
  overlay.markClose(b,new Map(),'2024-01-05');assert.equal(overlay.reconcileBook(b).pass,true);
  const historical=certifiedTerminalTotalReturn({event:legal,asOfTimestamp:'2024-01-03T21:00:00Z',entry:{open:100,close:100,totalReturnIndex:1},lastTradingBar:{date:'2024-01-03',close:100,totalReturnIndex:1}});
  assert.ok(Math.abs(historical.totalReturn-.2)<1e-12);
});

test('finite individual cash inputs cannot produce an overflowing economic receivable',()=>{
  const b=enter(overlay),q=b.positions.get('SYNTHETIC').shares;
  assert.throws(()=>processCertifiedCashEvents(b,[event({perShareCash:Number.MAX_VALUE})],{date:'2024-01-03',asOfTimestamp:'2024-01-03T21:00:00Z'}),/NONFINITE/);
  assert.equal(b.positions.get('SYNTHETIC').shares,q);assert.equal(b.receivables.size,0);
});

test('final official zero cancellation completes exactly once without fake settlement and preserves prior dividends',()=>{
  const b=enter(overlay),p=b.positions.get('SYNTHETIC'),q=p.shares,cost=p.cost;
  const d=bars('2024-01-03');d.get('SYNTHETIC').dividend=1;overlay.creditDividends(b,d);const cash=b.cash;
  const zero=event({eventType:'EQUITY_CANCELLED_ZERO',perShareCash:0,settlementDate:undefined,settlementAt:undefined,settlementDateStatus:undefined});
  const phase={date:'2024-01-03',asOfTimestamp:'2024-01-03T21:00:00Z'};
  processCertifiedCashEvents(b,[zero],phase);assert.equal(b.cash,cash);assert.equal(b.positions.size,0);assert.equal(b.receivables.size,0);
  assert.equal(b.trades.length,1);assert.equal(b.trades[0].reason,'OFFICIAL_ZERO_CANCELLATION');assert.equal(b.trades[0].pnl,q-cost);assert.equal(b.trades[0].transactionCosts,0);
  processCertifiedCashEvents(b,[zero],phase);assert.equal(b.trades.length,1);
  processCertifiedCashEvents(b,[zero,payment({eventType:'EQUITY_CANCELLED_ZERO',perShareCash:0})],{date:'2024-01-05',asOfTimestamp:'2024-01-05T21:01:00Z'});
  assert.equal(b.trades.length,1);assert.equal(b.cash,cash);overlay.markClose(b,new Map(),'2024-01-05');assert.equal(overlay.reconcileBook(b).pass,true);
});

test('post-terminal, same-day undated-clock and undated class hints are stripped without mutating frozen data',()=>{
  for(const evidence of [[['SC 13E3','2024-01-04']],[['SC 13E3','2024-01-03']],[['SIC','6770']]])
    assert.equal(terminalClassHintAsOf({cls:'ACQUISITION',evidence},{terminalDate:'2024-01-03'}).cls,'UNKNOWN');
  assert.equal(terminalClassHintAsOf({cls:'ACQUISITION',evidence:[['SC 13E3','2024-01-02']]},{terminalDate:'2024-01-03'}).status,'PIT_DATED_CLASS_HINT_ONLY');
  assert.equal(terminalClassHintAsOf({cls:'ACQUISITION',availableAt:'2024-01-02T12:00:00Z',evidence:[['SC 13E3','2024-01-04']]},{terminalDate:'2024-01-03',asOfTimestamp:'2024-01-03T21:00:00Z'}).cls,'UNKNOWN');
  const data={securities:[{id:'SYNTHETIC',terminal:{date:'2024-01-03',kind:'DELISTED',delistClass:'ACQUISITION',evidence:[['SC 13E3','2024-01-04']]}}]};
  const snapshot=JSON.stringify(data),filtered=terminalClassificationPITOverlay(data);
  assert.equal(JSON.stringify(data),snapshot);assert.equal(filtered.data.securities[0].terminal.delistClass,'UNKNOWN');
  assert.deepEqual(filtered.audit.counts,{examined:1,stripped:1,datedHintOnly:0,rejectedHintRows:1,unchangedUnknown:0});
});
