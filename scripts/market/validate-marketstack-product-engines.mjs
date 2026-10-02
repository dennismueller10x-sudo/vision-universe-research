// Research-only adapters. Production providers, histories and memberships are never written.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { computeIndicators, sma, percentileRanks, isoWeekKey } from '../supertrader/engine/indicators.mjs';
import { simulate } from '../supertrader/engine/simulator.mjs';
import { runPortfolio, computeMetrics } from '../supertrader/engine/backtest.mjs';
import { evaluateGates } from '../supertrader/engine/gates.mjs';
import darvas from '../supertrader/engine/strategies/darvas.mjs';
import minervini from '../supertrader/engine/strategies/minervini.mjs';
import donchian from '../supertrader/engine/strategies/donchian.mjs';
import weinstein from '../supertrader/engine/strategies/weinstein.mjs';
import kk from '../supertrader/engine/strategies/kk-breakout.mjs';
import { splitAdjustmentFactors } from './marketstack-canonical-adjustment-prototype.mjs';
const require = createRequire(import.meta.url);
const Factors = require('../../quant/engines/factors.js');
const QuantScore = require('../../quant/engines/quant-score.js');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const numeric = x => typeof x === 'number' && Number.isFinite(x);
const round = x => numeric(x) ? Math.round(x * 1e8) / 1e8 : null;
const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d;
export function evidenceTimestamp(probes) {
  const times=probes.flatMap(p=>[p.generatedAt,...(p.endpoints||[]).flatMap(e=>[e.checkedAt,e.retrievedAt])]).filter(t=>typeof t==='string'&&Number.isFinite(Date.parse(t))).map(t=>Date.parse(t));
  return times.length?new Date(Math.max(...times)).toISOString():'2026-10-02T00:00:00.000Z';
}
export function validOHLC(b) {
  return ['open','high','low','close'].every(k => numeric(b[k]) && b[k] > 0) &&
    b.low <= Math.min(b.open,b.close) && b.high >= Math.max(b.open,b.close) && b.high >= b.low;
}
export function columns(rows) {
  return Object.fromEntries(['date','open','high','low','close','volume'].map(k => [k,rows.map(b => b[k] ?? null)]));
}
export function longestObservedSegment(rows, maxGapDays = 7) {
  const sorted = rows.slice().sort((a,b)=>a.date.localeCompare(b.date));
  const segments = [[]];
  for (const b of sorted) {
    const s = segments.at(-1), prior = s.at(-1);
    if (prior && (Date.parse(b.date)-Date.parse(prior.date))/86400000 > maxGapDays) segments.push([]);
    segments.at(-1).push(b);
  }
  // A segment is observed, not certified complete against an exchange calendar.
  return segments.sort((a,b)=>b.length-a.length || String(b.at(-1)?.date).localeCompare(String(a.at(-1)?.date)))[0];
}
export function gatherHistories(probes) {
  const groups = new Map();
  for (const p of probes) for (const e of p.endpoints || []) {
    if (e.endpoint !== 'eod' || !e.ok || !Array.isArray(e.data?.data)) continue;
    for (const raw of e.data.data) {
      if (!raw?.symbol || !raw.exchange || !/^\d{4}-\d{2}-\d{2}/.test(raw.date || '')) continue;
      const key = raw.symbol+'|'+raw.exchange;
      if (!groups.has(key)) groups.set(key,{symbol:raw.symbol,mic:raw.exchange,dates:new Map(),conflicts:new Set(),sources:new Map()});
      const g=groups.get(key), b={...raw,date:raw.date.slice(0,10)};
      const stamp=JSON.stringify(Object.fromEntries(['open','high','low','close','volume','adj_open','adj_high','adj_low','adj_close','price_currency','split_factor','dividend'].map(k=>[k,b[k]??null])));
      if(g.dates.has(b.date) && g.dates.get(b.date).stamp !== stamp) g.conflicts.add(b.date);
      else g.dates.set(b.date,{bar:b,stamp});
      const source={endpoint:e.endpoint,params:e.params,checkedAt:e.checkedAt,sourceRunId:e.sourceRunId??null,sourceRunAttribution:e.sourceRunAttribution??'UNVERIFIED'};
      g.sources.set(JSON.stringify(source),source);
    }
  }
  return [...groups.values()].sort((a,b)=>(a.symbol+'|'+a.mic).localeCompare(b.symbol+'|'+b.mic)).map(g=>({
    symbol:g.symbol,mic:g.mic,conflictingDates:[...g.conflicts].sort(),sources:[...g.sources.values()],
    rows:longestObservedSegment([...g.dates].filter(([d])=>!g.conflicts.has(d)).map(([,v])=>v.bar)),
    uniqueObservedDates:g.dates.size
  }));
}
export function indicatorSnapshot(rows, closeField='close') {
  const c=rows.map(b=>b[closeField]??null), n=c.length, last=c.at(-1);
  const mean=w=>n>=w && c.slice(-w).every(numeric) ? c.slice(-w).reduce((a,b)=>a+b,0)/w : null;
  const ret=w=>n>w && numeric(last) && c[n-1-w]>0 ? last/c[n-1-w]-1 : null;
  const window=c.slice(-253), rets=window.slice(1).map((x,i)=>numeric(x)&&window[i]>0?x/window[i]-1:null);
  const clean=rets.length>=2 && rets.every(numeric), avg=clean?rets.reduce((a,b)=>a+b,0)/rets.length:null;
  let peak=0,dd=0;
  for(const x of window){if(!numeric(x)||x<=0){dd=null;break;} peak=Math.max(peak,x);dd=Math.min(dd,x/peak-1);}
  let ema=null; // Seed with 20 actual observations; never synthesize missing sessions.
  if(n>=20 && c.every(numeric)){ema=c.slice(0,20).reduce((a,b)=>a+b,0)/20;for(const x of c.slice(20))ema=2/21*x+19/21*ema;}
  return Object.fromEntries(Object.entries({SMA20:mean(20),SMA50:mean(50),SMA200:mean(200),EMA20:ema,
    HIGH_52W:n>=252&&c.slice(-252).every(numeric)?Math.max(...c.slice(-252)):null,
    LOW_52W:n>=252&&c.slice(-252).every(numeric)?Math.min(...c.slice(-252)):null,
    MOMENTUM_3M:ret(63),MOMENTUM_6M:ret(126),MOMENTUM_12M:ret(252),
    VOLATILITY:clean?Math.sqrt(rets.reduce((s,r)=>s+(r-avg)**2,0)/(rets.length-1))*Math.sqrt(252):null,
    MAX_DRAWDOWN:dd, BREAKOUT_HIGH20:n>=20&&rows.slice(-20).every(b=>numeric(b.high))?Math.max(...rows.slice(-20).map(b=>b.high)):null,
    RELATIVE_STRENGTH_INPUT:ret(126)}).map(([k,v])=>[k,round(v)]));
}
export function compareSnapshots(reference,candidate) {
  return Object.fromEntries(Object.keys(reference).map(k=>{
    const a=reference[k],b=candidate[k];
    if(!numeric(a)||!numeric(b))return[k,{status:'UNSAFE',reason:'INSUFFICIENT_OBSERVED_INPUT',absoluteDelta:null,relativeDelta:null}];
    const abs=Math.abs(a-b), rel=Math.abs(a)>1e-12?abs/Math.abs(a):null;
    const price=/SMA|EMA|HIGH|LOW/.test(k), tolerance=price?Math.max(0.01,Math.abs(a)*0.005):0.005;
    return[k,{status:abs<=1e-8?'MATCH':abs<=tolerance?'ACCEPTABLE_DELTA':'MATERIAL_DIFFERENCE',absoluteDelta:round(abs),relativeDelta:round(rel),tolerance:round(tolerance)}];
  }));
}
export function technicalGate(history,listing,{controlCurrency=null}={}) {
  const reasons=[];
  if(history.conflictingDates.length)reasons.push('CONFLICTING_PROVIDER_DATES');
  if(history.rows.some(b=>!validDate(b.date)))reasons.push('INVALID_TRADING_DATE');
  if(history.rows.some(b=>!validOHLC(b)))reasons.push('INVALID_OHLC');
  if(history.rows.some(b=>!numeric(b.volume)||b.volume<0))reasons.push('INVALID_VOLUME');
  if(history.rows.length<253)reasons.push('INSUFFICIENT_12M_OBSERVATIONS');
  if(!listing?.listingId)reasons.push('UNVERIFIED_CANONICAL_LISTING_IDENTITY');
  const referenceCurrency=listing?.tradingCurrency??controlCurrency;
  const currencyCode=b=>typeof b.price_currency==='string'&&/^[A-Za-z]{3}$/.test(b.price_currency)?b.price_currency.toUpperCase():null;
  if(!history.rows.every(b=>currencyCode(b)&&currencyCode(b)===referenceCurrency))reasons.push('UNVERIFIED_HISTORICAL_QUOTE_UNIT');
  if(referenceCurrency&&history.rows.some(b=>currencyCode(b)&&currencyCode(b)!==referenceCurrency))reasons.push('CURRENCY_CONTRACT_MISMATCH');
  // Existing foundation declares these series display-only. A numeric match cannot certify action completeness.
  reasons.push('FULL_SPLIT_DIVIDEND_VOLUME_BASIS_UNVERIFIED','EXCHANGE_SESSION_CALENDAR_NOT_CERTIFIED');
  return {status:reasons.some(r=>['INVALID_OHLC','INVALID_VOLUME','INVALID_TRADING_DATE','CONFLICTING_PROVIDER_DATES','CURRENCY_CONTRACT_MISMATCH'].includes(r))?'UNSAFE':'BLOCKED',reasons,productionAdmission:false};
}
function factorMetrics(rows, rawField='close', adjField='adj_close', currency=null) {
  if(!rows.length)return null;
  const series={startIndex:0,endIndex:rows.length-1,close:rows.map(b=>b[rawField]??null),adjustedClose:rows.map(b=>b[adjField]??null)};
  const volumeAt=rows.every(b=>numeric(b.volume)&&b.volume>=0)?(_,i)=>rows[i].volume:undefined;
  const result=Factors.priceMetrics(series,rows.length-1,null,volumeAt,'isolated');
  if(result&&currency!=='USD'){result.avgNativeTurnoverMillions=result.avgDollarVolume;result.avgDollarVolume=null;}
  return result;
}
export function tiingoSplitAdjustedRows(rows, completeControlRows) {
  const anchor=rows.at(-1)?.date;
  return rows.map(b=>{
    const factor=completeControlRows.filter(x=>x.date>b.date&&x.date<=anchor).reduce((f,x)=>f*(x.splitFactor||1),1);
    return {...b,...Object.fromEntries(['open','high','low','close'].map(k=>[k,numeric(b[k])?b[k]/factor:null])),volume:numeric(b.volume)?b.volume*factor:null};
  });
}
export function reconstructSplitControlDiagnostic(rows,actions,{priceBasis,volumeBasis}={}) {
  if(priceBasis!=='INDEPENDENTLY_CONTROLLED_AS_TRADED' || volumeBasis!=='ALREADY_SPLIT_SCALED_OBSERVED_CONTROL')throw Error('UNVERIFIED_DIAGNOSTIC_FIELD_BASIS');
  if(actions.some(a=>a.type!=='SPLIT'||!numeric(a.factor)||a.factor<=0||!validDate(a.date)||a.verification!=='VERIFIED_OFFICIAL_AND_PROVIDER_EVENT'))throw Error('UNVERIFIED_DIAGNOSTIC_SPLIT');
  const factors=splitAdjustmentFactors(rows,actions,rows.at(-1)?.date);
  return rows.map((b,i)=>({...b,...Object.fromEntries(['open','high','low','close'].map(k=>[k,numeric(b[k])?b[k]*factors[i]:null])),volume:b.volume}));
}
export function maskInvalidDiagnosticBars(rows) {
  return rows.map(b=>({...b,...(!validOHLC(b)||!validDate(b.date)?Object.fromEntries(['open','high','low','close'].map(k=>[k,null])):{}),
    volume:numeric(b.volume)&&b.volume>=0?b.volume:null}));
}
function context(h, basis='REPORTED_RAW') {
  const sourceRows=basis==='TIINGO_SPLIT_ADJUSTED'?tiingoSplitAdjustedRows(h.rows,h.completeControlRows||h.rows):h.rows;
  const rows=maskInvalidDiagnosticBars(sourceRows);
  const bars=columns(rows),ind=computeIndicators(bars);
  const weeks=new Map(),weekAt=new Array(rows.length).fill(null);
  rows.forEach((b,t)=>{const k=isoWeekKey(b.date),old=weeks.get(k);weeks.set(k,{date:b.date,close:b.close,volume:numeric(b.volume)&&(!old||numeric(old.volume))?(old?.volume||0)+b.volume:null});
    if(t+1<rows.length&&isoWeekKey(rows[t+1].date)!==k || t===rows.length-1&&new Date(b.date+'T12:00:00Z').getUTCDay()===5)weekAt[t]=k;});
  const keys=[...weeks.keys()],weekly={date:keys.map(k=>weeks.get(k).date),close:keys.map(k=>weeks.get(k).close),volume:keys.map(k=>weeks.get(k).volume),rs:keys.map(()=>null)};
  weekly.volume[0]=null;weekly.ma30=sma(weekly.close,30);weekly.volAvg=weekly.volume.map((_,i)=>i>=11&&weekly.volume.slice(i-10,i).every(numeric)?weekly.volume.slice(i-10,i).reduce((a,b)=>a+b,0)/10:null);
  return {symbol:h.symbol+'|'+(h.mic??'UNVERIFIED'),originalSymbol:h.symbol,mic:h.mic??null,bars,ind,cross:{mom126:new Array(rows.length).fill(null),rs:new Array(rows.length).fill(null),mom63:new Array(rows.length).fill(null),mom21:new Array(rows.length).fill(null)},
    weekly,weekAt:weekAt.map(k=>k===null?null:keys.indexOf(k)),indexOf:new Map(bars.date.map((d,i)=>[d,i])),
    maskedOHLCdates:sourceRows.filter(b=>!validOHLC(b)||!validDate(b.date)).map(b=>b.date),
    missingVolumeDates:sourceRows.filter(b=>!numeric(b.volume)||b.volume<0).map(b=>b.date)};
}
export function addObservedRanks(contexts){
  const days=[...new Set(contexts.flatMap(c=>c.bars.date))].sort();
  for(const d of days)for(const [target,key] of [['mom126','ret126'],['mom63','ret63'],['mom21','ret21'],['rs','ret252']]){
    const entries=contexts.flatMap(c=>{const i=c.indexOf.get(d);if(i===undefined||!(c.ind.dollarVol20[i]>=1e6))return[];
      const parts=[c.ind.ret63[i],c.ind.ret126[i],c.ind.ret189[i],c.ind.ret252[i]];
      const value=target==='rs'?(parts.every(numeric)?0.4*parts[0]+0.2*parts[1]+0.2*parts[2]+0.2*parts[3]:null):c.ind[key][i];
      return numeric(value)?[{key:c.symbol,value}]:[];});
    const ranks=percentileRanks(entries);for(const c of contexts){const i=c.indexOf.get(d);if(i!==undefined)c.cross[target][i]=ranks.get(c.symbol)??null;}
  }
}
export function strategyDiagnostic(strategy,ctx){
  const result=simulate(strategy,ctx,{recordedAt:'2026-10-02T00:00:00Z'});
  const trades=result.finished.filter(s=>s.entry&&s.exits.length).map(signal=>({symbol:ctx.symbol,signal}));
  const lookup=new Map(ctx.bars.date.map((d,i)=>[d,ctx.bars.close[i]]));
  const portfolio=runPortfolio(trades,(_,d)=>lookup.get(d)??null,ctx.bars.date);
  const metrics=computeMetrics(portfolio.equity,portfolio.taken,null);
  return {strategy:strategy.variant,observedSessions:ctx.bars.date.length,finishedSignals:result.finished.length,
    tradeCount:portfolio.taken.length,entryDates:portfolio.taken.map(s=>s.entry.date),exitDates:portfolio.taken.flatMap(s=>s.exits.map(x=>x.date)),
    transitions:result.finished.flatMap(s=>s.transitions.map(t=>({date:t.date,state:t.state,ruleId:t.ruleId}))),
    totalReturn:round(metrics?.totalReturn),maxDrawdown:round(metrics?.maxDrawdown),
    executionInvariant:portfolio.taken.every(s=>{const trigger=s.transitions.find(t=>t.state==='TRIGGERED');return trigger&&s.entry.date>trigger.date&&s.entry.date===ctx.bars.date[s.entry.index]&&s.entry.rawOpen===Math.round(ctx.bars.open[s.entry.index]*1e4)/1e4;}),
    executionInvariantScope:portfolio.taken.length?'OBSERVED_TRIGGER_BEFORE_ENTRY_AND_ACTUAL_NEXT_OBSERVED_OPEN':'NO_EXECUTED_TRADES_NO_EXECUTION_VALIDATION',
    maskedOHLCdates:ctx.maskedOHLCdates||[],missingVolumeDates:ctx.missingVolumeDates||[],
    missingBarPolicy:'INVALID_OHLC_ALL_FOUR_FIELDS_NULL_DATES_PRESERVED_NO_INTERPOLATION_OR_CLOSE_COPY',
    missingBarMarkToMarket:'EXISTING_RESEARCH_PORTFOLIO_ENTRY_PRICE_FALLBACK_NOT_OBSERVED_VALUATION',
    publishedStrategyStatus:'BLOCKED',note:'Diagnostic native-unit price-only simulation; no complete action/calendar/currency/FX/PIT/survivorship certification. Zero trades is not a validation success.'};
}
export function buildEngineFitness(probes,{listings=[],controls={},closeControls={},officialEvents=[],generatedAt='2026-10-02T00:00:00Z'}={}){
  const byIdentity=new Map(listings.map(l=>[l.providerSymbol+'|'+l.mic,l]));
  const allHistories=gatherHistories(probes);
  const histories=allHistories.filter(h=>h.rows.length>=20 || controls[h.symbol]);
  const selected=histories.filter(h=>h.rows.length>=250 || controls[h.symbol] || closeControls[h.symbol]);
  // Additional short, exact accepted equities make the regional sample broader,
  // while their missing-history status remains explicitly blocked.
  const sampled=new Set(selected.map(h=>h.symbol+'|'+h.mic));
  const shortCandidates=allHistories.filter(h=>h.rows.length>=7&&!sampled.has(h.symbol+'|'+h.mic)&&byIdentity.get(h.symbol+'|'+h.mic)?.assetType==='EQUITY');
  const countryUse=new Map();
  for(let n=0;n<20&&shortCandidates.length;n++){
    shortCandidates.sort((a,b)=>{const ac=byIdentity.get(a.symbol+'|'+a.mic)?.listingCountry,bc=byIdentity.get(b.symbol+'|'+b.mic)?.listingCountry;return(countryUse.get(ac)||0)-(countryUse.get(bc)||0)||(a.symbol+'|'+a.mic).localeCompare(b.symbol+'|'+b.mic);});
    const h=shortCandidates.shift(),country=byIdentity.get(h.symbol+'|'+h.mic)?.listingCountry;countryUse.set(country,(countryUse.get(country)||0)+1);selected.push(h);
  }
  const rows=selected.map(h=>{const l=byIdentity.get(h.symbol+'|'+h.mic),controlCurrency=controls[h.symbol]?.currency??closeControls[h.symbol]?.currency??null,gate=technicalGate(h,l,{controlCurrency});return{
    listingId:l?.listingId??null,symbol:h.symbol,mic:h.mic,assetType:l?.assetType??(controls[h.symbol]||closeControls[h.symbol]?'EQUITY':'UNVERIFIED'),
    country:l?.country??null,listingCountry:l?.listingCountry??null,tradingCurrency:l?.tradingCurrency??null,
    historyBars:h.rows.length,uniqueObservedDates:h.uniqueObservedDates,from:h.rows[0]?.date,to:h.rows.at(-1)?.date,
    historicalProviderCurrencyCounts:h.rows.reduce((a,b)=>(a[b.price_currency??'NULL']=(a[b.price_currency??'NULL']||0)+1,a),{}),
    independentControlCurrency:controlCurrency,
    invalidRawCandles:h.rows.filter(b=>!validOHLC(b)).length,conflictingDates:h.conflictingDates,
    invalidAdjustedCandles:h.rows.filter(b=>!validOHLC({open:b.adj_open,high:b.adj_high,low:b.adj_low,close:b.adj_close})).length,
    scope:'ISOLATED_DIAGNOSTIC',...gate,sourceObservations:h.sources,
    rawDiagnosticMetrics:indicatorSnapshot(h.rows),reportedAdjustedDiagnosticMetrics:indicatorSnapshot(h.rows,'adj_close')};});
  const paired=[];
  for(const h of selected){
    const control=controls[h.symbol], chart=closeControls[h.symbol];if(!control&&!chart)continue;
    if(control?.mic!==h.mic && (control || !['XNAS','XNYS','ARCX'].includes(h.mic)))continue;
    const refRows=control?.bars??chart?.points?.map(([date,close])=>({date:date.slice(0,10),close}));
    if(!refRows)continue;const ref=new Map(refRows.map(b=>[b.date,b]));
    const market=h.rows.filter(b=>ref.has(b.date)),tiingo=market.map(b=>ref.get(b.date));if(!market.length)continue;
    const independentEvents=officialEvents.filter(e=>e.providerSymbol===h.symbol&&e.exchange===h.mic&&e.type==='SPLIT'&&e.verification==='VERIFIED_OFFICIAL_SOURCE'&&e.marketDate>=market[0].date&&e.marketDate<=market.at(-1).date);
    const providerEvents=probes.flatMap(p=>(p.endpoints||[]).filter(e=>e.endpoint==='splits'&&e.ok&&e.params?.symbols===h.symbol&&e.params?.exchange===h.mic&&e.data?.pagination?.count===e.data?.pagination?.total).flatMap(e=>e.data?.data||[]));
    const matchedEvents=independentEvents.filter(e=>providerEvents.some(p=>p.symbol===h.symbol&&p.date.slice(0,10)===e.marketDate&&p.split_factor===e.factor)).map(e=>({type:'SPLIT',date:e.marketDate,factor:e.factor,verification:'VERIFIED_OFFICIAL_AND_PROVIDER_EVENT',sourceUrl:e.sourceUrl,sourceSha256:e.sourceSha256}));
    // Narrow empirical third path: NVDA2024 raw prices + independently confirmed10:1 event.
    // Its reported volume is already split-scaled. This is numerical research, not canonical admission.
    const reconstructed=h.symbol==='NVDA'&&h.mic==='XNAS'&&matchedEvents.length===1&&matchedEvents[0].date==='2024-06-10'?
      reconstructSplitControlDiagnostic(market,matchedEvents,{priceBasis:'INDEPENDENTLY_CONTROLLED_AS_TRADED',volumeBasis:'ALREADY_SPLIT_SCALED_OBSERVED_CONTROL'}):null;
    const tiingoSplit=control?tiingoSplitAdjustedRows(tiingo,control.bars):null;
    paired.push({symbol:h.symbol,mic:h.mic,pairedSessions:market.length,from:market[0].date,to:market.at(-1).date,
      referenceKind:control?'TIINGO_OBSERVED_DAILY_OHLCV':'TIINGO_SPLIT_ADJUSTED_CLOSE_ONLY',
      commonDatesOnly:true,missingTiingoDates:h.rows.filter(b=>!ref.has(b.date)).length,
      comparison:compareSnapshots(indicatorSnapshot(tiingo),indicatorSnapshot(market)),
      adjustedComparison:control?compareSnapshots(indicatorSnapshot(tiingo,'adjustedClose'),indicatorSnapshot(market,'adj_close')):null,
      vuSplitControl:reconstructed?{scope:'NUMERICAL_PRICE_RETURN_CONTROL_NOT_FULL_HISTORY_CERTIFICATION',actions:matchedEvents,
        volumeReapplied:false,productionAdmission:false,comparison:compareSnapshots(indicatorSnapshot(tiingoSplit),indicatorSnapshot(reconstructed)),
        eventCrosschecks:matchedEvents.map(event=>{const m=market.filter(b=>b.date<=event.date),v=reconstructed.filter(b=>b.date<=event.date),t=tiingoSplit.filter(b=>b.date<=event.date);
          return {eventDate:event.date,observedPrefixSessions:m.length,rawVsTiingo:compareSnapshots(indicatorSnapshot(t),indicatorSnapshot(m)),
            vuVsTiingo:compareSnapshots(indicatorSnapshot(t),indicatorSnapshot(v)),
            rawMomentum3m:indicatorSnapshot(m).MOMENTUM_3M,vuMomentum3m:indicatorSnapshot(v).MOMENTUM_3M,tiingoMomentum3m:indicatorSnapshot(t).MOMENTUM_3M};}),
        missingCanonicalGates:['ISSUER_IDENTITY','CONFLICTING_HISTORICAL_CURRENCY','INVALID_OHLC','ACTION_COMPLETENESS','DIVIDEND_TOTAL_RETURN','CALENDAR_COMPLETENESS']} : null,
      quantReference:control?factorMetrics(tiingo,'close','adjustedClose',control.currency):null,quantCandidate:control?factorMetrics(market,'close','adj_close',market.every(b=>b.price_currency===control.currency)?control.currency:null):null,
      certification:'NOT_CERTIFIED',_market:market,_tiingo:tiingo,_reconstructed:reconstructed});
  }
  const technicalRows=rows.map(r=>({...r}));
  const quantRows=rows.map((r,i)=>({...r,rawDiagnosticMetrics:undefined,reportedAdjustedDiagnosticMetrics:undefined,
    technicalMetrics:r.assetType==='EQUITY'?factorMetrics(selected[i].rows,'close','adj_close',r.tradingCurrency):null,fullQuantStatus:'BLOCKED',fundamentalJoinRequired:r.assetType==='EQUITY',
    companyQuantApplicability:r.assetType==='EQUITY'?'ISOLATED_DIAGNOSTIC_ONLY':'NOT_APPLICABLE',
    nativeTurnoverIsNotUsdLiquidity:r.tradingCurrency!=='USD'}));
  const equityHistory=h=>byIdentity.get(h.symbol+'|'+h.mic)?.assetType==='EQUITY'||Boolean(controls[h.symbol]&&controls[h.symbol].mic===h.mic)||Boolean(closeControls[h.symbol]&&['XNAS','XNYS','ARCX'].includes(h.mic));
  const contexts=selected.filter(h=>h.rows.length>=60&&h.rows.every(b=>validDate(b.date))&&equityHistory(h)).map(h=>context(h));
  addObservedRanks(contexts);
  const strategies=[darvas,minervini,donchian,weinstein,kk];
  const simulations=contexts.map(c=>({symbol:c.originalSymbol,mic:c.mic,
    diagnostics:strategies.map(s=>strategyDiagnostic(s,c)),status:'BLOCKED',crossSectionScope:'OBSERVED_SAME_DATE_FIXED_RESEARCH_SAMPLE_NOT_PRODUCTION_RANKS',
    crossSectionMethod:'EXISTING_SUPERTRADER_RS_WEIGHTED_63_126_189_252_AND_1M_LIQUIDITY_RULE_RESEARCH_ONLY',
    nativeLiquidityThresholdCertification:'UNVERIFIED_RESEARCH_NATIVE_UNIT_INPUTS_NEVER_USD_ADMISSION_FOR_FOREIGN_MARKETS',
    missingWeeklyBenchmark:true}));
  const pairedSimulations=[];
  // Fixed peer sample, matched dates, price-return split basis for Tiingo control; no fabricated ranks.
  const fullPairs=paired.filter(p=>p.referenceKind==='TIINGO_OBSERVED_DAILY_OHLCV'&&p._market.length>=60&&p._market.every(b=>validDate(b.date)));
  const marketContexts=fullPairs.map(p=>context({symbol:p.symbol,mic:p.mic,rows:p._market}));
  const tiingoContexts=fullPairs.map(p=>context({symbol:p.symbol,mic:p.mic,rows:p._tiingo,completeControlRows:controls[p.symbol].bars},'TIINGO_SPLIT_ADJUSTED'));
  const vuContexts=fullPairs.map(p=>context({symbol:p.symbol,mic:p.mic,rows:p._reconstructed??p._market}));
  addObservedRanks(tiingoContexts);addObservedRanks(marketContexts);addObservedRanks(vuContexts);
  for(let i=0;i<fullPairs.length;i++)pairedSimulations.push({symbol:fullPairs[i].symbol,mic:fullPairs[i].mic,
    pairedSessions:fullPairs[i].pairedSessions,strategies:strategies.map(s=>{const a=strategyDiagnostic(s,tiingoContexts[i]),b=strategyDiagnostic(s,marketContexts[i]);return{
      strategy:s.variant,tiingo:a,marketstack:b,
      vuSplitReconstruction:fullPairs[i]._reconstructed?strategyDiagnostic(s,vuContexts[i]):null,
      vuSplitReturnDelta:fullPairs[i]._reconstructed?round(strategyDiagnostic(s,vuContexts[i]).totalReturn-a.totalReturn):null,
      tradeCountDelta:b.tradeCount-a.tradeCount,
      totalReturnDelta:numeric(a.totalReturn)&&numeric(b.totalReturn)?round(b.totalReturn-a.totalReturn):null,signalDifferenceCount:new Set([...a.entryDates,...b.entryDates]).size-a.entryDates.filter(d=>b.entryDates.includes(d)).length,
      signalDifferenceScope:'SYMMETRIC_DIFFERENCE_OF_EXECUTED_ENTRY_DATES_NOT_ALL_SCANNED_SETUPS',
      status:'NOT_BACKTEST_SAFE',reason:'SHORT_FIXED_PEER_SAMPLE_UNVERIFIED_ACTIONS_SURVIVORSHIP_AND_SESSION_COVERAGE'};})});
  const fixedPeerQuant=[];
  const ref=paired.filter(p=>p.quantReference&&p.quantCandidate).map(p=>({securityId:'isolated_'+p.symbol,ticker:p.symbol,sector:'RESEARCH_CONTROL',industry:'RESEARCH_CONTROL',...p.quantReference}));
  if(ref.length>1){const baseline=QuantScore.computeScorePanel({metricPanel:{rows:ref,asOf:paired[0]?.to},robustZ:false});
    for(const p of paired.filter(p=>p.quantReference&&p.quantCandidate)){const substitution=ref.map(r=>r.ticker===p.symbol?{...r,...p.quantCandidate}:r);
      const result=QuantScore.computeScorePanel({metricPanel:{rows:substitution,asOf:p.to},robustZ:false});
      const a=baseline.byId['isolated_'+p.symbol],b=result.byId['isolated_'+p.symbol];fixedPeerQuant.push({symbol:p.symbol,referencePeerCount:ref.length,
        method:'ONE_SECURITY_SUBSTITUTION_IN_FIXED_TIINGO_REFERENCE_PEER_PANEL',referenceStatus:a.status,candidateStatus:b.status,
        referenceScore:a.score,candidateScore:b.score,fullQuantStatus:'BLOCKED',reason:'NO_FUNDAMENTAL_INPUTS_SUPPLIED_TO_TECHNICAL_COMPARISON',
        factorScoresReference:a.factorScores,factorScoresCandidate:b.factorScores});}}
  const common={schemaVersion:'marketstack-product-engine-fitness-1.0.0',generatedAt,scope:'ISOLATED_RESEARCH_NO_PRODUCTION_ADMISSION',marketstackRequests:0,productionChanged:false,
    summary:{cachedListingHistories:allHistories.length,longOrControlListingHistories:histories.length,selectedListingHistories:rows.length,equitySample:rows.filter(r=>r.assetType==='EQUITY').length,
      pairedTiingoControls:paired.length,fullOhlcvPairedControls:fullPairs.length,ready:0},
    limitations:['Observed segments are not exchange-calendar-complete certificates.','Long-window numerical comparisons do not certify price/volume adjustment basis.','Research ranks are scoped to a fixed sample, never the production consumer universe.']};
  return {technical:{...common,rows:technicalRows,comparisons:paired.map(({_market,_tiingo,_reconstructed,quantReference,quantCandidate,...p})=>p)},
    quant:{...common,rows:quantRows,comparisons:paired.map(({_market,_tiingo,_reconstructed,comparison,adjustedComparison,...p})=>p),fixedPeerQuant},
    supertrader:{...common,rows:simulations,comparisons:pairedSimulations,strategyGates:strategies.map(s=>evaluateGates(s.variant,{historyYears:0}))},
    backtest:{...common,status:'NOT_BACKTEST_SAFE',rows:simulations,comparisons:pairedSimulations,existingEngine:'scripts/supertrader/engine/simulator.mjs + backtest.mjs',
      dividendAssumption:'PRICE_ONLY_DIAGNOSTIC_NO_CASH_REINVESTMENT',currencyAssumption:'ONE_INSTRUMENT_NATIVE_UNIT_DIAGNOSTIC_NO_MULTICURRENCY_PORTFOLIO',
      quantExecutionGate:'NEXT_OPEN_REQUIRES_VERIFIED_ADJUSTED_OPEN_AND_TOTAL_RETURN_SEMANTICS'}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
  const paths=process.argv.filter(x=>x.startsWith('--probe=')).map(x=>x.slice(8));if(!paths.length)throw Error('CACHED_PROBE_REQUIRED');
  const probes=paths.map(p=>JSON.parse(readFileSync(p))),listingsPath=arg('listings','quant/data/global-market/listings.json');
  const controls={},closeControls={},inputHashes=paths.map(p=>({kind:'PRIVATE_PROBE',sha256:hash(readFileSync(p))}));
  for(const symbol of ['NVDA','AAPL','MSFT','XOM','JPM']){const p='quant/data/market/golden-preview/daily/ref_'+symbol+'.json';controls[symbol]=JSON.parse(readFileSync(p));inputHashes.push({path:p,sha256:hash(readFileSync(p))});}
  const us=['TSLA','PLTR','GOOGL','GOOG','BRK.B','TSM','BABA','XPEV','META','AMD','WMT','COST','CAT','BAC','PANW','CRWD','BA','RIVN','SOUN','VAI'];
  for(const s of us){const p='quant/data/market/discover-series/ref_'+s+'.json';if(existsSync(p)){const j=JSON.parse(readFileSync(p));if(j.provider==='tiingo'&&j.grain==='daily'&&j.priceSeriesType==='SPLIT_ADJUSTED')closeControls[s]=j;inputHashes.push({path:p,sha256:hash(readFileSync(p))});}}
  inputHashes.push({path:listingsPath,sha256:hash(readFileSync(listingsPath))});
  const officialPath='reports/marketstack/marketstack_adjustment_controls.json',officialEvents=JSON.parse(readFileSync(officialPath)).events;
  inputHashes.push({path:officialPath,sha256:hash(readFileSync(officialPath))});
  const r=buildEngineFitness(probes,{listings:JSON.parse(readFileSync(listingsPath)).listings,controls,closeControls,officialEvents,generatedAt:evidenceTimestamp(probes)});
  const out=arg('out','reports/marketstack');mkdirSync(out,{recursive:true});
  const engineSourceHashes=['quant/engines/factors.js','quant/engines/quant-score.js','scripts/supertrader/engine/indicators.mjs','scripts/supertrader/engine/simulator.mjs','scripts/supertrader/engine/backtest.mjs',
    ...['darvas','minervini','donchian','weinstein','kk-breakout'].map(s=>'scripts/supertrader/engine/strategies/'+s+'.mjs'),
    'scripts/market/marketstack-canonical-adjustment-prototype.mjs','scripts/market/validate-marketstack-product-engines.mjs'].map(path=>({path,sha256:hash(readFileSync(path))}));
  for(const [key,name]of Object.entries({technical:'technical_indicator_crosscheck.json',quant:'quant_marketstack_fitness.json',supertrader:'supertrader_marketstack_fitness.json',backtest:'backtest_marketstack_fitness.json'})){
    r[key].inputHashes=inputHashes;r[key].engineSourceHashes=engineSourceHashes;writeFileSync(join(out,name),JSON.stringify(r[key],null,2)+'\n');}
  console.log(JSON.stringify(r.technical.summary));
}
