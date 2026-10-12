// Operational certificate primitives only; no performance measurement or method
// thresholds. Certificate labels are assertions whose document/identity audit
// must be completed independently; this validator does not fetch or authenticate sources.
export const EXECUTION_CERTIFICATION_VERSION='OFFICIAL_CASH_RECEIVABLE_TWO_STAGE_V2';
const utc=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const date=/^\d{4}-\d{2}-\d{2}$/;
const validTime=x=>typeof x==='string'&&utc.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,19)===x.slice(0,19);
const validDay=x=>typeof x==='string'&&date.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const types=new Set(['CASH_ACQUISITION','SPAC_CASH_REDEMPTION','EQUITY_CANCELLED_ZERO']);

export function certifyOfficialCashEvent(event,{asOfTimestamp}={}) {
  const reject=reason=>({accepted:false,status:'UNAVAILABLE',reason});
  const legalOnly=event?.status==='CERTIFIED_LEGAL_CASH_ENTITLEMENT';
  if(!validTime(asOfTimestamp))return reject('EXPLICIT_OBSERVATION_TIMESTAMP_REQUIRED');
  if(!['OFFICIAL_EVENT_CERTIFIED','CERTIFIED_LEGAL_CASH_ENTITLEMENT'].includes(event?.status)||!event.eventId||!event.economicActionId||!event.id||!event.listingId||!event.securityId||
      event.identityStatus!=='PIT_IDENTITY_CERTIFIED'||!types.has(event.eventType))return reject('OFFICIAL_IDENTITY_AND_EVENT_CERTIFICATE_REQUIRED');
  if(!validTime(event.availableAt)||!validTime(event.effectiveAt))return reject('EXPLICIT_EFFECTIVE_AND_PUBLICATION_TIMESTAMPS_REQUIRED');
  if(!legalOnly&&(!validDay(event.settlementDate)||event.settlementDate<event.effectiveAt.slice(0,10)))
    return reject('ACTUAL_SETTLEMENT_DATE_REQUIRED');
  if(Date.parse(event.availableAt)>Date.parse(asOfTimestamp))return reject('SOURCE_NOT_AVAILABLE_AT_OBSERVATION');
  if(event.cashAmountStatus!=='EXACT_OFFICIAL_CASH_AMOUNT'||(!legalOnly&&event.settlementDateStatus!=='ACTUAL_CONFIRMED'))
    return reject('APPROXIMATE_AMOUNT_OR_EXPECTED_SETTLEMENT_NOT_ACTUAL_CERTIFICATE');
  if(event.currency!=='USD'||event.priceBasis!=='RAW_SHARE'||!Number.isFinite(event.perShareCash)||event.perShareCash<0||
      !(Number.isFinite(event.executionAdjustmentFactor)&&event.executionAdjustmentFactor>0)||
      event.adjustmentBasisStatus!=='CERTIFIED_AT_EFFECTIVE_EVENT')return reject('CASH_UNITS_CURRENCY_AND_ADJUSTMENT_BASIS_REQUIRED');
  if(event.perShareCash===0&&event.eventType!=='EQUITY_CANCELLED_ZERO')return reject('ZERO_REQUIRES_OFFICIAL_EQUITY_CANCELLATION');
  const source=event.officialSource;
  if(!source||!['SEC_FILING','ISSUER_RELEASE','EXCHANGE_NOTICE','COURT_ORDER'].includes(source.kind)||
      !/^https:\/\//.test(source.url||'')||!source.locator||source.inspectionStatus!=='BODY_INSPECTED'||
      !/^[a-f0-9]{64}$/i.test(source.bodySha256||''))return reject('INSPECTED_OFFICIAL_DOCUMENT_REQUIRED');
  // Date-only payouts use a disclosed conservative end-of-date cash availability.
  // This is an operational convention, not an invented actual settlement clock.
  let cashAvailableAt=legalOnly?null:event.settlementAt;
  if(legalOnly){ /* A lawful claim needs no invented payment date. */ }
  else if(cashAvailableAt!==undefined){
    if(!validTime(cashAvailableAt)||cashAvailableAt.slice(0,10)!==event.settlementDate||Date.parse(cashAvailableAt)<Date.parse(event.effectiveAt))
      return reject('SETTLEMENT_TIMESTAMP_INVALID');
    if(Date.parse(cashAvailableAt)>Date.parse(event.availableAt))return reject('ACTUAL_SETTLEMENT_CONFIRMATION_PRECEDES_SETTLEMENT');
  }else{
    if(event.cashTimingConvention!=='AFTER_SETTLEMENT_DATE_CLOSE_VU_CONSERVATIVE')return reject('SETTLEMENT_CLOCK_OR_EXPLICIT_CONSERVATIVE_CONVENTION_REQUIRED');
    cashAvailableAt=event.settlementDate+'T23:59:59.999Z';
    if(event.settlementDate>event.availableAt.slice(0,10))return reject('ACTUAL_SETTLEMENT_CONFIRMATION_PRECEDES_SETTLEMENT');
  }
  const adjustedCashPerShare=event.perShareCash/event.executionAdjustmentFactor;
  if(!Number.isFinite(adjustedCashPerShare)||adjustedCashPerShare<0)return reject('ADJUSTED_CASH_NONFINITE');
  return {accepted:true,status:Date.parse(event.effectiveAt)<=Date.parse(asOfTimestamp)?'EFFECTIVE':'AVAILABLE_NOT_EFFECTIVE',
    adjustedCashPerShare,cashAvailableAt,stage:legalOnly?'LEGAL_ENTITLEMENT_ONLY':'LEGAL_ENTITLEMENT_AND_SETTLEMENT'};
}

const economicBinding=event=>JSON.stringify([event.eventId,event.economicActionId,event.listingId,event.securityId,event.eventType,
  event.effectiveAt,event.perShareCash,event.currency,event.priceBasis,event.executionAdjustmentFactor]);

export function certifyCashSettlementEvent(event,claim,{asOfTimestamp}={}) {
  const reject=reason=>({accepted:false,status:'UNAVAILABLE',reason});
  if(event?.status!=='ACTUAL_CASH_SETTLEMENT_CERTIFIED'||!claim||event.claimEventId!==claim.eventId||event.id!==claim.id||
     event.economicActionId!==claim.economicActionId||event.listingId!==claim.listingId||event.securityId!==claim.securityId)
    return reject('EXISTING_LEGAL_CLAIM_AND_SAME_ECONOMIC_IDENTITY_REQUIRED');
  const c=certifyOfficialCashEvent({...event,status:'OFFICIAL_EVENT_CERTIFIED',eventId:claim.eventId,
    eventType:claim.eventType,effectiveAt:claim.effectiveAt},{asOfTimestamp});
  if(!c.accepted)return c;
  if(c.adjustedCashPerShare!==claim.cashPerShare||event.perShareCash!==claim.perShareCash||
     event.executionAdjustmentFactor!==claim.executionAdjustmentFactor||event.currency!==claim.currency||event.priceBasis!==claim.priceBasis)
    return reject('SETTLEMENT_CONSIDERATION_DIFFERS_FROM_LEGAL_CLAIM');
  return {...c,status:'SETTLEMENT_VISIBLE'};
}

export const receivableValue=book=>[...(book.receivables?.values()||[])].reduce((sum,p)=>sum+p.shares*p.cashPerShare,0);
export const receivableUnrealizedPnl=book=>[...(book.receivables?.values()||[])].reduce((sum,p)=>sum+p.shares*p.cashPerShare+p.dividends-p.cost,0);

// Call with the certified exchange-clock timestamp BEFORE next-open pending
// orders, then AFTER_CLOSE. A terminal callback after orders alone is insufficient
// for an action effective before the open. No source after the timestamp is read.
export function processCertifiedCashEvents(book,events,{date:sessionDate,asOfTimestamp}={}) {
  if(!validDay(sessionDate)||!validTime(asOfTimestamp)||asOfTimestamp.slice(0,10)!==sessionDate)throw new Error('CERTIFIED_EVENT_PHASE_CLOCK_REQUIRED');
  book.receivables??=new Map();book.corporateActionEvents??=new Set();book.corporateActionAudit??=[];
  book.corporateActionBindings??=new Map();
  const results=[],seen=new Set(),securities=new Set(),legalChecks=[],settlementChecks=[];
  let plannedValue=receivableValue(book);
  // Preflight before any cash/share mutation. Only already-public accepted
  // records participate, so later unavailable records cannot invalidate a past
  // prefix. This primitive supports one full-cancellation cash action per
  // listing; multi-installment distributions need a separate explicit contract.
  for(const event of events||[]){
    if(event.status==='ACTUAL_CASH_SETTLEMENT_CERTIFIED')continue;
    const c=certifyOfficialCashEvent(event,{asOfTimestamp});
    legalChecks.push({event,c});
    if(!c.accepted)continue;
    if(seen.has(event.eventId)||securities.has(event.id))throw new Error('DUPLICATE_OR_CONFLICTING_OFFICIAL_EVENT');
    seen.add(event.eventId);securities.add(event.id);
    const binding=economicBinding(event);
    const previous=book.corporateActionBindings.get(event.id);
    if(previous!==undefined&&previous!==binding)throw new Error('CONFLICTING_OFFICIAL_EVENT_BINDING');
    const p=book.positions.get(event.id);
    if(c.status==='EFFECTIVE'&&p){plannedValue+=p.shares*c.adjustedCashPerShare;
      if(!Number.isFinite(plannedValue))throw new Error('NONFINITE_CERTIFIED_CASH_ENTITLEMENT');}
  }
  const receiptIds=new Set();
  for(const event of events||[]){
    if(event.status!=='ACTUAL_CASH_SETTLEMENT_CERTIFIED')continue;
    const existing=book.receivables.get(event.claimEventId);
    const planned=legalChecks.find(x=>x.c.accepted&&x.c.status==='EFFECTIVE'&&x.event.eventId===event.claimEventId);
    const claim=existing||(planned?{...planned.event,cashPerShare:planned.c.adjustedCashPerShare}:null);
    const c=certifyCashSettlementEvent(event,claim,{asOfTimestamp});settlementChecks.push({event,c});
    if(!c.accepted)continue;
    if(receiptIds.has(event.claimEventId))throw new Error('DUPLICATE_OR_CONFLICTING_SETTLEMENT_PROOF');receiptIds.add(event.claimEventId);
    if(existing?.cashAvailableAt&&existing.cashAvailableAt!==c.cashAvailableAt)throw new Error('CONFLICTING_SETTLEMENT_CLOCK');
  }
  for(const {event,c:certificate}of legalChecks){
    results.push({eventId:event.eventId,id:event.id,...certificate});
    if(!certificate.accepted||certificate.status!=='EFFECTIVE'||book.corporateActionEvents.has(event.eventId))continue;
    const p=book.positions.get(event.id);
    if(p){
      book.receivables.set(event.eventId,{...p,eventId:event.eventId,economicActionId:event.economicActionId,listingId:event.listingId,
        securityId:event.securityId,eventType:event.eventType,cashPerShare:certificate.adjustedCashPerShare,cashAvailableAt:certificate.cashAvailableAt,effectiveAt:event.effectiveAt});
      Object.assign(book.receivables.get(event.eventId),{perShareCash:event.perShareCash,executionAdjustmentFactor:event.executionAdjustmentFactor,currency:event.currency,priceBasis:event.priceBasis});
      book.positions.delete(event.id);book.lastMarks.delete(event.id);
      book.corporateActionAudit.push({eventId:event.eventId,id:event.id,date:sessionDate,action:'OFFICIAL_EVENT_RECEIVABLE_RECOGNIZED'});
      book.terminalCount++;
    }
    book.corporateActionBindings.set(event.id,economicBinding(event));
    book.corporateActionEvents.add(event.eventId);
  }
  for(const {event,c}of settlementChecks){
    results.push({eventId:event.eventId,id:event.id,...c});
    if(c.accepted){const claim=book.receivables.get(event.claimEventId);if(claim)claim.cashAvailableAt=c.cashAvailableAt;}
  }
  for(const [eventId,p]of book.receivables){
    const zeroCancellation=p.eventType==='EQUITY_CANCELLED_ZERO'&&p.cashPerShare===0;
    if(!zeroCancellation&&(!validTime(p.cashAvailableAt)||Date.parse(p.cashAvailableAt)>Date.parse(asOfTimestamp)))continue;
    const gross=p.shares*p.cashPerShare;book.cash+=gross;
    book.trades.push({id:p.id,ticker:p.ticker,entryDate:p.entryDate,date:sessionDate,cost:p.cost,pnl:gross+p.dividends-p.cost,
      returnPct:(gross+p.dividends)/p.cost-1,reason:zeroCancellation?'OFFICIAL_ZERO_CANCELLATION':'OFFICIAL_CASH_SETTLEMENT',transactionCosts:0,fraction:1,
      eventId,economicSource:'CERTIFIED_OFFICIAL_EVENT'});
    // A compulsory distribution is not a market order: no artificial slippage,
    // no repeated dividend, and no spending unsettled receivables as cash.
    book.receivables.delete(eventId);book.corporateActionAudit.push({eventId,id:p.id,date:sessionDate,
      action:zeroCancellation?'OFFICIAL_EQUITY_ZERO_CANCELLED':'OFFICIAL_EVENT_CASH_SETTLED'});
  }
  return results;
}

export function terminalClassHintR15(record,classifyDelistingR15) {
  const hint=classifyDelistingR15(record);
  return {...hint,status:'OBSERVED_CLASS_HINT_ONLY',proceedsKnown:false,pitDecisionAvailable:false};
}

// Date-only SEC filing metadata is usable no earlier than the NEXT calendar
// date; same-day publication cannot be guessed. A class hint is still not an
// actual economic outcome, even when its provenance is older than the cutoff.
export function terminalClassHintAsOf(hint,{terminalDate,asOfTimestamp}={}) {
  if(!validDay(terminalDate))return {cls:'UNKNOWN',status:'UNAVAILABLE',reason:'TERMINAL_DATE_INVALID'};
  if(asOfTimestamp!==undefined&&(!validTime(asOfTimestamp)||asOfTimestamp.slice(0,10)!==terminalDate))
    return {cls:'UNKNOWN',status:'UNAVAILABLE',reason:'TERMINAL_PHASE_TIMESTAMP_INVALID'};
  const evidence=hint?.evidence||[];
  const dated=evidence.filter(row=>Array.isArray(row)&&validDay(row[1]));
  const available=dated.filter(row=>row[1]<terminalDate);
  const exactPublicationKnown=validTime(hint?.availableAt)&&validTime(asOfTimestamp)&&Date.parse(hint.availableAt)<=Date.parse(asOfTimestamp);
  const futureDate=dated.some(row=>row[1]>terminalDate);
  const sameDay=dated.some(row=>row[1]===terminalDate);
  if(dated.length===0||dated.length!==evidence.length||futureDate||
     (sameDay&&(!exactPublicationKnown||hint.availableAt.slice(0,10)!==terminalDate)))
    return {cls:'UNKNOWN',status:'STRIPPED_UNCERTIFIED_CLASS_HINT',reason:'FUTURE_SAME_DAY_OR_UNDATED_CLASSIFICATION_EVIDENCE'};
  return {cls:hint?.cls||'UNKNOWN',status:'PIT_DATED_CLASS_HINT_ONLY',proceedsKnown:false,evidence:available,
    reason:'CLASSIFICATION_IS_NOT_ACTUAL_PROCEEDS_CERTIFICATION'};
}

export function terminalClassificationPITOverlay(data,{phaseTimestampForDate}={}) {
  const counts={examined:0,stripped:0,datedHintOnly:0,rejectedHintRows:0,unchangedUnknown:0};
  const securities=data.securities.map(security=>{
    if(!security.terminal||security.terminal.kind==='DATA_QUARANTINE')return security;
    counts.examined++;
    const terminal=security.terminal,hint={cls:terminal.delistClass,evidence:terminal.evidence,availableAt:terminal.classificationAvailableAt};
    const c=terminalClassHintAsOf(hint,{terminalDate:terminal.date,asOfTimestamp:phaseTimestampForDate?.(terminal.date)});
    if(c.status==='PIT_DATED_CLASS_HINT_ONLY')counts.datedHintOnly++;else {counts.rejectedHintRows++;if(terminal.delistClass&&terminal.delistClass!=='UNKNOWN')counts.stripped++;else counts.unchangedUnknown++;}
    return {...security,terminal:{...terminal,delistClass:c.cls,classificationPITStatus:c.status,classificationPITReason:c.reason}};
  });
  return {data:{...data,securities},audit:{version:'TERMINAL_CLASS_PIT_FILTER_V1',counts,methodParametersChanged:false,
    originalUnknownProceedsScenarioUnchanged:true,actualProceedsCertified:0}};
}

export function terminalExecutionCertification(terminal,{event,asOfTimestamp}={}) {
  if(terminal?.kind==='DATA_QUARANTINE')return {status:'UNCERTIFIED_OUTCOME',reason:'DATA_QUARANTINE_IS_NOT_AN_ECONOMIC_DELISTING',originalScenarioPreserved:true};
  if(event){const c=certifyOfficialCashEvent(event,{asOfTimestamp});
    if(c.accepted)return {status:c.status==='EFFECTIVE'?'CERTIFIED_CASH_RECEIVABLE':'KNOWN_FUTURE_CASH_EVENT',eventId:event.eventId};
    return {status:'UNCERTIFIED_OUTCOME',reason:c.reason,originalScenarioPreserved:true};
  }
  return {status:'SCENARIO_ASSUMPTION_ONLY',reason:'OFFICIAL_PROCEEDS_AND_SETTLEMENT_NOT_CERTIFIED',originalScenarioPreserved:true};
}

// Outcome primitive for fixed-horizon total-return observations. The endpoint
// and adjustment basis must be independently certified; no future bar or
// reinvestment/cash yield is introduced. A receivable is valued economically,
// while the portfolio cannot spend it until the separate settlement clock.
export function certifiedTerminalTotalReturn({event,asOfTimestamp,entry,lastTradingBar}) {
  const c=certifyOfficialCashEvent(event,{asOfTimestamp});
  if(!c.accepted||c.status!=='EFFECTIVE')return {available:false,reason:c.reason||'EVENT_NOT_EFFECTIVE'};
  if(!entry||!lastTradingBar||lastTradingBar.date>event.effectiveAt.slice(0,10)||
     ![entry.open,entry.close,entry.totalReturnIndex,lastTradingBar.close,lastTradingBar.totalReturnIndex].every(v=>Number.isFinite(v)&&v>0))
    return {available:false,reason:'CERTIFIED_ENDPOINT_AND_ENTRY_REQUIRED'};
  const totalReturn=lastTradingBar.totalReturnIndex/entry.totalReturnIndex*entry.close/entry.open*c.adjustedCashPerShare/lastTradingBar.close-1;
  if(!Number.isFinite(totalReturn))return {available:false,reason:'NONFINITE_CERTIFIED_TERMINAL_RETURN'};
  return {available:true,totalReturn,
    source:'OFFICIAL_CASH_RECEIVABLE',cashYield:0};
}
