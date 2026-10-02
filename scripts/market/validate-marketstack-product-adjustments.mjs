/** Offline product-fitness evidence. Reuses PR334 controls; never fetches data. */
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve,basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { collectPriceEvidence, canonicalPriceEvidenceValue } from './audit-marketstack-scale-adjustments.mjs';
import { canonicalAdjustmentPrototype,splitAdjustmentFactors } from './marketstack-canonical-adjustment-prototype.mjs';
import { compareTiingoWindow } from './validate-marketstack-adjustment-compatibility.mjs';
const sha = data => createHash('sha256').update(data).digest('hex');
const date = row => String(row.date || '').slice(0,10);
const finite = n => typeof n === 'number' && Number.isFinite(n);
const extrema = values => ({count:values.length,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null});
const validOhlc = row => ['open','high','low','close'].every(k=>finite(row[k])&&row[k]>0)&&row.high>=Math.max(row.open,row.low,row.close)&&row.low<=Math.min(row.open,row.high,row.close);

export function buildUSFullWindowAdjustmentStudy(probe,tiingo={},previousProbes=[],previousControls=[]) {
  const endpoints=probe.endpoints||[], symbols=[...new Set(endpoints.filter(e=>e.label==='product-fitness-us-eod').map(e=>e.params.symbols))].sort();
  const explicitSourceRunIds=[...new Set(endpoints.map(e=>e.sourceRunId).filter(Boolean).map(String))].sort();
  const sourceRunId=explicitSourceRunIds.length===1?explicitSourceRunIds[0]:null;
  const previousEvidence=previousProbes.length?collectPriceEvidence(previousProbes):[];
  const rows=symbols.map(symbol=>{
    const select=endpoint=>endpoints.find(e=>e.endpoint===endpoint&&e.params.symbols===symbol);
    const eod=select('eod'),split=select('splits'),dividend=select('dividends');
    const bars=Array.isArray(eod?.data?.data)?eod.data.data:[],splits=split?.data?.data||[],dividends=dividend?.data?.data||[];
    const endpointEvidence=[eod,split,dividend].map(e=>{
      const p=e?.data?.pagination,body=e?.data?.data;
      return {endpoint:e?.endpoint||null,checkedAt:e?.checkedAt||null,sourceRunId:e?.sourceRunId||probe.run?.runId||null,
        responseSha256:sha(JSON.stringify(e?.data??null)),pagination:p||null,
        paginationDeclaredComplete:e?.ok===true&&Array.isArray(body)&&Number.isInteger(p?.total)&&Number.isInteger(p?.count)&&p.offset===0&&p.total===p.count&&p.count===body.length,
        query:{symbol:e?.params?.symbols,mic:e?.params?.exchange,from:e?.params?.date_from,to:e?.params?.date_to},
        directBodyExchangeAndCurrencyAttestation:e?.endpoint==='eod'?'PER_BAR_CHECKED':'NOT_PRESENT_ON_ACTION_ROWS'};
    });
    const embeddedSplits=new Map(bars.filter(b=>b.split_factor!==1).map(b=>[date(b),b.split_factor])),embeddedDividends=new Map(bars.filter(b=>b.dividend>0).map(b=>[date(b),b.dividend]));
    const ledgerSplits=new Map(splits.map(b=>[date(b),b.split_factor])),ledgerDividends=new Map(dividends.map(b=>[date(b),b.dividend]));
    const availableDates=new Set(bars.map(date));
    const differences=(embedded,ledger)=>[...new Set([...embedded.keys(),...ledger.keys()])].sort().filter(d=>availableDates.has(d)&&embedded.get(d)!==ledger.get(d)).map(d=>({date:d,embeddedEodValue:embedded.get(d)??null,separateEndpointValue:ledger.get(d)??null}));
    const actionDifferences={splits:differences(embeddedSplits,ledgerSplits),dividends:differences(embeddedDividends,ledgerDividends)};
    for(const difference of actionDifferences.dividends){
      const {embeddedEodValue:embedded,separateEndpointValue:separate}=difference;
      difference.relativeDifferenceBps=embedded>0&&separate>0?Math.abs(embedded/separate-1)*10000:null;
      difference.interpretation=embedded===null?'EVENT_MISSING_FROM_EMBEDDED_BAR':Math.abs(embedded-separate)<=.00500000001?'ROUNDING_POSSIBLE_NOT_INDEPENDENTLY_RESOLVED':'MATERIAL_AMOUNT_OR_SHARE_BASIS_DIFFERENCE_UNRESOLVED';
      const independentCash=tiingo[symbol]?.bars.find(b=>date(b)===difference.date);
      if(independentCash?.dividend>0&&finite(embedded)&&finite(separate)){
        const laterSplits=tiingo[symbol].bars.filter(b=>date(b)>difference.date&&date(b)<=eod.params.date_to&&b.splitFactor!==1);
        const anchorShareFactor=laterSplits.reduce((f,b)=>f/b.splitFactor,1);
        const confirms=anchorShareFactor!==1&&Math.abs(separate-independentCash.dividend)<1e-10&&Math.abs(embedded-independentCash.dividend*anchorShareFactor)<1e-10;
        difference.independentShareBasisDiagnostic={tiingoAsTradedCash:independentCash.dividend,laterTiingoSplits:laterSplits.map(b=>({date:date(b),factor:b.splitFactor})),
          anchorShareFactor,embeddedMatchesAnchorShareCash:confirms,separateMatchesAsTradedCash:Math.abs(separate-independentCash.dividend)<1e-10,
          providerCashCurrencyAttested:false,fullActionCompletenessCertified:false};
        if(confirms)difference.interpretation='BOUNDED_SPLIT_SHARE_BASIS_PATTERN_CONFIRMED_WITH_TIINGO_ACTIONS';
      }
    }
    const revisionControls=previousControls.filter(c=>c.symbol===symbol&&c.mic===eod.params.exchange&&c.from>=eod.params.date_from&&c.to<=eod.params.date_to).map(control=>{
      const previous=extractAdjustmentControlBars(previousProbes,control,previousEvidence),current=new Map(bars.map(b=>[date(b),b]));
      const fields=['open','high','low','close','volume','adj_open','adj_high','adj_low','adj_close','adj_volume','split_factor','dividend','price_currency'];
      const observedChanges=[],fieldChangeCounts={};let pairedDays=0;
      for(const old of previous){const now=current.get(date(old));if(!now)continue;pairedDays++;const changed=fields.filter(k=>old[k]!==now[k]);
        for(const k of changed)fieldChangeCounts[k]=(fieldChangeCounts[k]||0)+1;if(changed.length)observedChanges.push({date:date(old),fields:changed});}
      return {symbol,mic:control.mic,from:control.from,to:control.to,pairedDays,observedChanges,fieldChangeCounts,
        previousObservations:control.sourceObservations,currentObservation:{checkedAt:eod.checkedAt,sourceRunId:eod.sourceRunId||probe.run?.runId},
        status:pairedDays>=3?(observedChanges.length?'BOUNDED_HISTORICAL_FIELD_CHANGES_OBSERVED':'NO_FIELD_CHANGES_IN_BOUNDED_RETRIEVAL_PAIR'):'NOT_COMPARABLE',
        universalRestatementPolicyCertified:false};
    }).filter(r=>r.pairedDays);
    // ISO casing normalization never converts or overrides a foreign currency.
    const comparisonBars=bars.map(b=>({...b,price_currency:typeof b.price_currency==='string'?b.price_currency.toUpperCase():b.price_currency}));
    const conflictingCurrencyDates=bars.filter(b=>b.price_currency&&String(b.price_currency).toUpperCase()!=='USD').map(date);
    const comparison=tiingo[symbol]?compareTiingoWindow(comparisonBars,tiingo[symbol].bars,{from:eod.params.date_from,to:eod.params.date_to,symbol,mic:eod.params.exchange,currency:'USD',allowMissingProviderCurrencyForDiagnostic:true}):null;
    const referenceIndex=new Map((tiingo[symbol]?.bars||[]).map((b,i)=>[date(b),i]));
    const referenceBars=new Map((tiingo[symbol]?.bars||[]).map(b=>[date(b),b])),providerBars=new Map(bars.map(b=>[date(b),b]));
    const consecutiveSessionErrors=[];let skippedSessionIntervals=0;
    for(let i=1;i<(comparison?.pairDates.length||0);i++){
      const before=comparison.pairDates[i-1],after=comparison.pairDates[i];
      if(referenceIndex.get(after)!==referenceIndex.get(before)+1){skippedSessionIntervals++;continue;}
      const m0=providerBars.get(before).adj_close,m1=providerBars.get(after).adj_close,t0=referenceBars.get(before).adjustedClose,t1=referenceBars.get(after).adjustedClose;
      if([m0,m1,t0,t1].every(n=>finite(n)&&n>0))consecutiveSessionErrors.push(Math.abs((m1/m0)/(t1/t0)-1)*10000);
    }
    const independentControl=comparison?{pairedDays:comparison.pairedDays,currencyValidation:comparison.currencyValidation,
      missingProviderCurrencyDays:comparison.missingProviderCurrencyDates.length,conflictingDates:comparison.conflictingDates,
      rawProviderCurrencyCasingNormalization:'ASCII_ISO_CODE_CASE_FOLD_ONLY_NO_FX_OR_FOREIGN_CURRENCY_OVERRIDE',excludedConflictingCurrencyDates:conflictingCurrencyDates,
      missingMarketstackDates:comparison.missingMarketstackDates,rawOHLCMarketstackToTiingo:comparison.rawOHLCMarketstackToTiingo,
      reportedVolumeMarketstackToTiingoRaw:comparison.reportedVolumeMarketstackToTiingoRaw,
      reportedAdjVolumeMarketstackToTiingoAdjusted:comparison.reportedAdjVolumeMarketstackToTiingoAdjusted,
      adjustedScaleSpreadBps:comparison.adjustedScaleSpreadBps,pairedObservationReturnErrorBps:comparison.adjustedDailyReturnErrorBps,
      adjacentTiingoObservedSessionReturnErrorBps:extrema(consecutiveSessionErrors),excludedNonAdjacentSessionReturnIntervals:skippedSessionIntervals,
      adjustedReturnsConsistentWithinOneBasisPoint:comparison.adjustedReturnsConsistentWithinOneBasisPoint,
      actionPairs:comparison.actionPairs,dividendFactorDiagnostics:comparison.dividendFactorDiagnostics,
      controlScope:'INDEPENDENT_PROVIDER_NUMERICAL_DIAGNOSTIC_NOT_FULL_ADMISSION'}:null;
    const barDates=bars.map(date),calendarReference=tiingo[symbol]?.bars.filter(b=>date(b)>=eod.params.date_from&&date(b)<=eod.params.date_to).map(date)||null;
    const duplicateDates=barDates.filter((d,i)=>barDates.indexOf(d)!==i);
    const rawInvalid=bars.filter(b=>!validOhlc(b)).map(date);
    const adjInvalid=bars.filter(b=>!validOhlc({open:b.adj_open,high:b.adj_high,low:b.adj_low,close:b.adj_close})).map(date);
    const splitReturnDiagnostics=splits.map(action=>{
      const index=bars.findIndex(b=>date(b)===date(action)),before=index>0?bars[index-1]:null,after=index>=0?bars[index]:null;
      const tBefore=before&&tiingo[symbol]?.bars.find(b=>date(b)===date(before)),tAfter=after&&tiingo[symbol]?.bars.find(b=>date(b)===date(after));
      const asTradedControl=!!tBefore&&!!tAfter&&Math.abs(before.close/tBefore.close-1)<1e-5&&Math.abs(after.close/tAfter.close-1)<1e-5;
      return {date:date(action),providerFactor:action.split_factor,precedingReturnedDate:before?date(before):null,
        rawCloseReturnPercent:before&&after?(after.close/before.close-1)*100:null,
        providerAdjustedCloseReturnPercent:before?.adj_close>0&&after?.adj_close>0?(after.adj_close/before.adj_close-1)*100:null,
        candidateSplitNeutralReturnIfRawAsTradedPercent:before&&after?(after.close*action.split_factor/before.close-1)*100:null,
        independentTiingoRawPriceControl:asTradedControl,
        tiingoSplitNeutralReturnPercent:tBefore&&tAfter?(tAfter.close*tAfter.splitFactor/tBefore.close-1)*100:null,
        interpretation:asTradedControl?'BOUNDED_RAW_PRICE_SPLIT_RETURN_CONTROL':'COUNTERFACTUAL_ONLY_RAW_BASIS_NOT_INDEPENDENTLY_VERIFIED'};
    });
    return {symbol,mic:eod.params.exchange,from:eod.params.date_from,to:eod.params.date_to,bars:bars.length,first:barDates[0]||null,last:barDates.at(-1)||null,
      endpointEvidence,providerPaginationComplete:endpointEvidence.every(e=>e.paginationDeclaredComplete),
      independentlyCompleteActions:false,calendar:{independentExchangeCalendarVerified:false,tiingoObservedSessionReferenceAvailable:!!calendarReference,
        missingVersusTiingoObservedSessions:calendarReference?calendarReference.filter(d=>!barDates.includes(d)):null},
      missingHistoricalCurrencyBars:bars.filter(b=>!b.price_currency).length,explicitCurrencies:[...new Set(bars.map(b=>b.price_currency).filter(Boolean))].sort(),
      conflictingHistoricalCurrencyBars:conflictingCurrencyDates.length,conflictingHistoricalCurrencyDates:conflictingCurrencyDates,
      rawProviderCurrencyCounts:bars.reduce((counts,b)=>{const key=b.price_currency??'NULL';counts[key]=(counts[key]||0)+1;return counts;},{}),
      invalidRawOhlcDates:rawInvalid,invalidAdjustedOhlcDates:adjInvalid,duplicateDates,
      identityMismatchBars:bars.filter(b=>b.symbol!==symbol||b.exchange!==eod.params.exchange).length,
      splits:{separateEndpointCount:splits.length,embeddedCount:embeddedSplits.size,events:splits.map(e=>({date:date(e),factor:e.split_factor,symbol:e.symbol})),returnDiagnostics:splitReturnDiagnostics},
      dividends:{separateEndpointCount:dividends.length,embeddedCount:embeddedDividends.size},actionDifferences,
      actionDatesWithoutPriceBar:{splits:[...ledgerSplits.keys()].filter(d=>!availableDates.has(d)),dividends:[...ledgerDividends.keys()].filter(d=>!availableDates.has(d))},independentControl,revisionControls,
      compatibility:{technicalIndicators:rawInvalid.length||adjInvalid.length||actionDifferences.splits.length||actionDifferences.dividends.length||conflictingCurrencyDates.length?'UNSAFE':'BLOCKED',
        quantTechnical:'BLOCKED',supertrader:'BLOCKED',backtesting:'BLOCKED'},fullHistoryCertified:false,
      blockingReasons:[...(!bars.length?['NO_PRICE_RESPONSE']:[]),...(rawInvalid.length?['INVALID_RAW_OHLC']:[]),...(adjInvalid.length?['INVALID_ADJUSTED_OHLC']:[]),
        ...(bars.some(b=>!b.price_currency)?['MISSING_HISTORICAL_QUOTE_CURRENCY']:[]),...(conflictingCurrencyDates.length?['CONFLICTING_NATIVE_QUOTE_CURRENCY_FOR_US_LISTING']:[]),...((actionDifferences.splits.length||actionDifferences.dividends.length)?['ACTION_ENDPOINT_AND_EMBEDDED_BAR_DISAGREE']:[]),
        'INDEPENDENT_FULL_ACTION_COMPLETENESS_UNVERIFIED','INDEPENDENT_EXCHANGE_CALENDAR_UNVERIFIED','POINT_IN_TIME_REVISION_AND_ACTION_AVAILABILITY_UNVERIFIED'],productionAdmission:false};
  });
  return {sourceRunId,explicitSourceRunIds,sourceRunIdBasis:'UNIQUE_EXPLICIT_ENDPOINT_RESPONSE_ORIGIN_NOT_REPLAY_CONTAINER_ID',rows,scope:'FRESH_BOUNDED_US_EOD_SPLITS_DIVIDENDS_RESPONSES_2024_2026_NO_PRODUCTION_ADMISSION',
    summary:{symbolsRequested:rows.length,withPriceResponses:rows.filter(r=>r.bars).length,withAtLeast250Bars:rows.filter(r=>r.bars>=250).length,
      returnedBars:rows.reduce((n,r)=>n+r.bars,0),declaredCompleteEndpointResponses:rows.flatMap(r=>r.endpointEvidence).filter(e=>e.paginationDeclaredComplete).length,
      independentlyComparedListings:rows.filter(r=>r.independentControl).length,independentPairedDays:rows.reduce((n,r)=>n+(r.independentControl?.pairedDays||0),0),
      listingsWithActionEndpointDisagreements:rows.filter(r=>r.actionDifferences.splits.length||r.actionDifferences.dividends.length).length,
      boundedShareBasisExplainedDifferences:rows.reduce((n,r)=>n+r.actionDifferences.dividends.filter(d=>d.interpretation==='BOUNDED_SPLIT_SHARE_BASIS_PATTERN_CONFIRMED_WITH_TIINGO_ACTIONS').length,0),
      listingsWithMissingHistoricalCurrency:rows.filter(r=>r.missingHistoricalCurrencyBars).length,
      listingsWithConflictingHistoricalCurrency:rows.filter(r=>r.conflictingHistoricalCurrencyBars).length,
      boundedRevisionControlPairs:rows.reduce((n,r)=>n+r.revisionControls.length,0),boundedRevisionPairedDays:rows.reduce((n,r)=>n+r.revisionControls.reduce((s,c)=>s+c.pairedDays,0),0),
      independentlyCompleteActionHistories:0,fullHistoryCertified:0},
    acquisitionAccounting:probe.accounting||{},accountingScope:'ROOT_COORDINATED_ONE_TIME_FRESH_RUN_THE_OFFLINE_ANALYZER_SPENDS_ZERO_CREDITS'};
}

export function extractAdjustmentControlBars(probes, control, collectedEvidence = null) {
  const seen = new Set(), out = [];
  for (const entry of collectedEvidence || collectPriceEvidence(probes)) {
    if (entry.endpoint.replace(/^\//,'') !== 'eod' || !entry.ok || !String(entry.params?.symbols || '').split(',').includes(control.symbol) ||
      (entry.params?.exchange && entry.params.exchange !== control.mic) ||
      (entry.params?.date_from && entry.params.date_from > control.from) || (entry.params?.date_to && entry.params.date_to < control.to)) continue;
    const within = new Set();
    for (const row of Array.isArray(entry.data?.data) ? entry.data.data : []) {
      if (row.symbol !== control.symbol || row.exchange !== control.mic || date(row)<control.from || date(row)>control.to) continue;
      const key = JSON.stringify(canonicalPriceEvidenceValue(row));
      if (!seen.has(key) || within.has(key)) { out.push(row); seen.add(key); } within.add(key);
    }
  }
  return out.sort((a,b)=>date(a).localeCompare(date(b)));
}

/** Bounded numerical diagnostics deliberately do not assert missing currency,
 * full-history action completeness or policy eligibility. */
export function compareAdjustedControlWindow(marketstackBars, tiingoBars, control, officialEvent) {
  const ti = new Map(tiingoBars.filter(b=>date(b)>=control.from&&date(b)<=control.to).map(b=>[date(b),b]));
  const duplicates = new Set(), ms = new Map();
  for (const b of marketstackBars) { if(ms.has(date(b)))duplicates.add(date(b)); ms.set(date(b),b); }
  const dates=[...ms.keys()].filter(d=>ti.has(d)&&!duplicates.has(d)).sort();
  if (!officialEvent?.factor || !officialEvent.marketDate || dates.length<3 || officialEvent.verification!=='VERIFIED_OFFICIAL_SOURCE') return {status:'UNVERIFIED',pairedDays:dates.length};
  const eventDate=officialEvent.marketDate, factor=officialEvent.factor;
  const before=dates.filter(d=>d<eventDate), after=dates.filter(d=>d>=eventDate);
  const closeRatios=before.map(d=>ms.get(d).close/ti.get(d).close);
  const beforeRaw=closeRatios.length&&closeRatios.every(n=>Math.abs(n-1)<1e-5);
  const beforeAlreadySplit=closeRatios.length&&closeRatios.every(n=>Math.abs(n*factor-1)<1e-5);
  const afterRaw=after.length&&after.every(d=>Math.abs(ms.get(d).close/ti.get(d).close-1)<1e-5);
  const basis=beforeRaw&&afterRaw?'AS_TRADED':beforeAlreadySplit&&afterRaw?'SPLIT_ADJUSTED_TO_WINDOW_ANCHOR':'UNVERIFIED';
  if(basis==='UNVERIFIED')return{status:'UNVERIFIED',pairedDays:dates.length};
  const rows=dates.map(d=>ms.get(d)), controls=dates.map(d=>ti.get(d));
  const factors=splitAdjustmentFactors(rows,[{type:'SPLIT',date:eventDate,factor}],dates.at(-1));
  const adjusted=rows.map((b,i)=>({date:date(b),close:b.close*(basis==='AS_TRADED'?factors[i]:1)}));
  const expected=controls.map((b,i)=>b.close*factors[i]);
  const priceErrors=adjusted.map((b,i)=>Math.abs(b.close/expected[i]-1)*10000);
  const returnErrors=adjusted.slice(1).map((b,i)=>Math.abs((b.close/adjusted[i].close)/(expected[i+1]/expected[i])-1)*10000);
  const sma5Errors=adjusted.slice(4).map((_,i)=>{
    const m=adjusted.slice(i,i+5).reduce((s,b)=>s+b.close,0)/5,t=expected.slice(i,i+5).reduce((s,n)=>s+n,0)/5;
    return Math.abs(m/t-1)*10000;
  });
  const volumeRows=dates.map((d,i)=>({date:d,rawRatio:ms.get(d).volume/ti.get(d).volume,
    windowAnchorAdjustedRatio:ms.get(d).volume/(ti.get(d).volume/factors[i])}));
  const volumeAlreadyAdjusted=volumeRows.every(r=>finite(r.windowAnchorAdjustedRatio)&&Math.abs(r.windowAnchorAdjustedRatio-1)<1e-5);
  const preSplitVolumeAlreadyAdjusted=volumeRows.filter(r=>r.date<eventDate).length>0&&volumeRows.filter(r=>r.date<eventDate).every(r=>finite(r.windowAnchorAdjustedRatio)&&Math.abs(r.windowAnchorAdjustedRatio-1)<1e-5);
  return {status:'BOUNDED_NUMERICAL_FEASIBILITY_ONLY',pairedDays:dates.length,dates,officialSplit:{date:eventDate,factor,sourceSha256:officialEvent.sourceSha256},
    empiricallyObservedPriceBasis:basis,empiricallyObservedVolumeBasis:volumeAlreadyAdjusted?'SPLIT_ADJUSTED_TO_WINDOW_ANCHOR':preSplitVolumeAlreadyAdjusted?'PRE_SPLIT_MATCHES_ANCHOR_ADJUSTED_POST_EVENT_VOLUME_DIFFERENCES':'UNVERIFIED',
    postEventVolumeDifferenceBps:extrema(volumeRows.filter(r=>r.date>=eventDate).map(r=>Math.abs(r.windowAnchorAdjustedRatio-1)*10000)),
    splitAdjustedCloseErrorBps:extrema(priceErrors),splitAdjustedDailyReturnErrorBps:extrema(returnErrors),sma5ErrorBps:extrema(sma5Errors),
    currencyVerified:rows.every(b=>b.price_currency==='USD'),volumeRatios:volumeRows,
    comparisonDefinition:'SPLIT_ADJUSTED_PRICE_RETURN_TO_LAST_CONTROL_DATE_NOT_VENDOR_TOTAL_RETURN',
    historyCoverage:dates.length,fullHistoryCertified:false,productionAdmission:false,
    warning:'AAPL already split-scaled OHLC must not be adjusted a second time. NVDA already split-scaled volume must not be multiplied again.'};
}

export function buildProductAdjustmentValidation(compatibility, controls, probes=[], tiingo={}) {
  const collectedEvidence = probes.length ? collectPriceEvidence(probes) : [];
  const rows=compatibility.rows.map(control=>{
    const bars=probes.length?extractAdjustmentControlBars(probes,control,collectedEvidence):[];
    const event=controls.events.find(e=>e.providerSymbol===control.symbol&&e.exchange===control.mic&&e.type==='SPLIT');
    const numerical=tiingo[control.symbol]&&event?compareAdjustedControlWindow(bars,tiingo[control.symbol].bars,control,event):null;
    const diagnosticInput={bars:bars.map(b=>({...b,currency:b.price_currency})),identity:{listingId:`bounded:${control.mic}:${control.symbol}`,symbol:control.symbol,mic:control.mic,currency:bars.find(b=>b.price_currency)?.price_currency},
      coverage:{from:control.from,to:control.to},fieldBasis:{price:'UNVERIFIED',volume:'UNVERIFIED'},actions:[],mode:'SPLIT_ADJUSTED'};
    const rejection=canonicalAdjustmentPrototype(diagnosticInput);
    return {symbol:control.symbol,mic:control.mic,from:control.from,to:control.to,role:control.role,
      controlEvidence:{bars:control.analysis.bars,rawInvalid:control.analysis.rawInvalid,adjustedInvalid:control.analysis.adjustedInvalid??null,
        observedCloseBasis:control.observedCloseBasis,signatures:control.analysis.signatures,officialEvent:control.officialEvent,
        dividendFactorSteps:control.dividendFactorSteps,sourceObservations:control.sourceObservations},
      numericalReconstruction:numerical,
      prototype:{status:rejection.status,reasons:rejection.issues,scope:'FULL_SERIES_ADMISSION_GATE_NOT_BOUNDED_NUMERICAL_DIAGNOSTIC'},
      compatibility:{charts:control.compatibility.rawCharts==='PARTIAL_DISPLAY_ONLY'?'PARTIAL':control.analysis.rawInvalid?'UNSAFE':'BLOCKED',
        technicalIndicators:'BLOCKED',quantTechnical:'BLOCKED',supertrader:'BLOCKED',backtesting:'BLOCKED'},
      fullHistoryCertified:false,productionAdmission:false};
  });
  return {schemaVersion:'marketstack-product-adjustment-validation-1.0.0',generatedAt:compatibility.generatedAt,
    scope:'EXACT_PR334_LISTING_WINDOWS_OFFLINE_NO_FULL_SERIES_OR_POINT_IN_TIME_CERTIFICATION',rows,
    priceSemantics:{close:'MIXED: AAPL already split-adjusted in tested window; NVDA as-traded OHLC in tested window. No universal basis.',
      adj_close:'Provider field present but reverse-split/dividend gaps persist for some listings; never assumed total-return.',
      volume:'Mixed price/volume conventions: AAPL and NVDA pre-split volume match split-scaled Tiingo volume; post-event provider volume discrepancies remain.',
      splits:'Separate event fields exist; event presence never proves adjustment needed or complete history.',
      dividends:'Cash observations and local factor steps exist; EU distributions sometimes copied raw; no universal total-return certification.',
      retroactiveRestatement:'UNVERIFIED_NO_COMPARABLE_SAME_LISTING_SAME_DATES_SEPARATE_RETRIEVAL_REVISION_CONTROL'},
    canonicalPrototype:{feasible:'DETERMINISTIC_GIVEN_INDEPENDENTLY_VERIFIED_RAW_BASIS_COMPLETE_ACTIONS_QUOTE_UNIT_AND_CALENDAR',
      deployed:false,priceReturn:'SPLIT_ADJUSTED',totalReturn:'EX_DATE_CLOSE_CASH_REINVESTMENT',execution:'RAW_AS_TRADED_ONLY',
      fullHistoryActionCompleteness:'UNVERIFIED_FOR_MARKETSTACK_LISTINGS'},
    summary:{controlWindows:rows.length,returnedWindows:rows.filter(r=>r.controlEvidence.bars).length,
      independentlyControlledNumericalReconstructions:rows.filter(r=>r.numericalReconstruction?.status==='BOUNDED_NUMERICAL_FEASIBILITY_ONLY').length,
      currencyVerifiedNumericalReconstructions:rows.filter(r=>r.numericalReconstruction?.currencyVerified).length,
      fullTechnicalSeriesCertified:0,quantTechnicalAdmissions:0,supertraderAdmissions:0,backtestAdmissions:0},
    compatibilityMatrix:{rawEodCharts:'PARTIAL_EXISTING_ACCEPTED_SCOPE_PRESERVED',movingAverages:'BLOCKED_FULL_SERIES_ADJUSTMENT_UNVERIFIED',
      high52Week:'BLOCKED_FULL_SERIES_ADJUSTMENT_UNVERIFIED',momentum:'BLOCKED_FULL_SERIES_ADJUSTMENT_UNVERIFIED',
      relativeStrength:'BLOCKED_FULL_SERIES_ADJUSTMENT_UNVERIFIED',drawdown:'BLOCKED_FULL_SERIES_ADJUSTMENT_UNVERIFIED',
      quantTechnical:'BLOCKED',supertrader:'BLOCKED',backtesting:'BLOCKED',selfAdjustment:'FEASIBLE_PROTOTYPE_NOT_ADMITTED'},
    limitations:['Bounded SMA5/returns diagnostics are not SMA200,52-week or full-history fitness.',
      'TRUE close-to-close reinvestment differs from vendor backward cash adjustment; never silently substitute one return definition.',
      'ASML compound capital-return/reverse-split and MBG spin-off are rejected by this ordinary split/cash prototype.',
      'Adjusted histories use ex-post actions. A PIT backtest must use action announcement/availability data and raw execution prices.'],
    marketstackRequests:0,productionChanged:false,providerDecision:'DEFERRED'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const arg=n=>process.argv.slice(2).filter(a=>a.startsWith(`--${n}=`)).map(a=>a.slice(n.length+3));
  const read=p=>JSON.parse(readFileSync(p)),base='reports/marketstack';
  const compatPath=arg('compatibility')[0]||`${base}/marketstack_adjustment_compatibility.json`,controlPath=arg('controls')[0]||`${base}/marketstack_adjustment_controls.json`;
  const probeFiles=arg('probe'),tiingo={};
  for(const symbol of ['AAPL','NVDA','MSFT','XOM','JPM']){
    const record=read(`quant/data/market/golden-preview/daily/ref_${symbol}.json`),expectedMic=['XOM','JPM'].includes(symbol)?'XNYS':'XNAS';
    if(record.ticker!==symbol||record.provider!=='tiingo'||record.currency!=='USD'||record.mic!==expectedMic||!Array.isArray(record.bars))throw Error('TIINGO_FULL_WINDOW_CONTROL_IDENTITY_MISMATCH');
    tiingo[symbol]=record;
  }
  const compatibility=read(compatPath),previousProbes=probeFiles.map(read);
  const result=buildProductAdjustmentValidation(compatibility,read(controlPath),previousProbes,tiingo);
  const usProbePath=arg('us-probe')[0];
  if(usProbePath){const probe=read(usProbePath);result.usFullWindowStudy=buildUSFullWindowAdjustmentStudy(probe,tiingo,previousProbes,compatibility.rows);result.generatedAt=Object.values(probe.accounting||{}).map(a=>a.finishedAt).filter(Boolean).sort().at(-1)||result.generatedAt;
    result.priceSemantics.retroactiveRestatement='NVDA10_BOUNDED_DATES_COMPARED_ACROSS_OCT1_OCT2_RETRIEVALS_SEE_REVISION_CONTROLS_UNIVERSAL_REVISION_POLICY_UNVERIFIED';}
  result.inputProvenance=[compatPath,controlPath,...probeFiles,...(usProbePath?[usProbePath]:[]),...Object.keys(tiingo).map(s=>`quant/data/market/golden-preview/daily/ref_${s}.json`)].map(p=>({sourceName:basename(p),sha256:sha(readFileSync(p))}));
  const out=arg('out')[0]||`${base}/marketstack_adjustment_validation.json`;mkdirSync(resolve(out,'..'),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({boundedControls:result.summary,usFullWindow:result.usFullWindowStudy?.summary||null}));
}
