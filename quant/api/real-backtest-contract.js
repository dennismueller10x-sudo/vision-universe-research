/* Read-only contract. No execution engine, provider fetch or certification promotion. */
(function(g){
'use strict';
const VERSION='real-backtest-read-1.0.0',QUALITY='real-backtest-quality-1.0.0';
const periods=['1Y','3Y','5Y','10Y','MAX'],sections=['summary','quality','equity','trades'];
const safeId=x=>typeof x==='string'&&/^ref_[A-Za-z0-9_.-]{1,80}$/.test(x);
const identityKey=i=>({instrumentId:i.instrumentId,masterMemberId:i.masterMemberId,issuerId:i.issuerId||null,symbol:i.symbol,exchange:i.exchange||null,currency:i.currency||null,firstTradeDate:i.firstTradeDate||null,generation:i.generation??null});
const shard=id=>id.slice(4,6).toUpperCase().padEnd(2,'_');
async function digest(x){const s=typeof x==='string'?x:JSON.stringify(x);if(typeof module!=='undefined'&&module.exports)return require('node:crypto').createHash('sha256').update(s).digest('hex');return Array.from(new Uint8Array(await g.crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
function summaryViolations(s,id,generation){
 const errors=[];const fail=x=>errors.push(x);
 if(!s||s.schemaVersion!==VERSION||s.generation!==generation||s.identity?.sourceSecurityId!==id) return ['INVALID_SUMMARY_IDENTITY_OR_VERSION'];
 if(s.certification!=='NOT_CERTIFIED'||s.returnBasis!=='PRICE_RETURN'||s.executionModel?.schemaVersion!=='weekly-execution-model-2.0.0'||s.executionModel?.strategyCertification!=='NOT_CERTIFIED'||s.executionModel?.returnBasis!=='PRICE_RETURN'||s.executionModel?.state!=='VALIDATED_EXECUTION_MODEL'||s.executionModel?.scope!=='EXECUTION_MECHANICS_ONLY'||s.executionModel?.productionApproved!==false||s.executionModel?.rule!=='NEW_52W_HIGH'||s.executionModel?.costModel!=='PER_SIDE_NOTIONAL'||s.executionModel?.feeBpsPerSide!==10||s.executionModel?.slippageBpsPerSide!==5)fail('INVALID_RELEASE_STATUS');
 if(s.quality?.schemaVersion!==QUALITY||s.quality.certification!=='NOT_CERTIFIED'||s.quality.sourceSecurityId!==id||s.quality.listingId!==s.identity.listingId)fail('INVALID_QUALITY');
 if(s.calculationRuntime!==undefined&&(!/^[0-9]+\.[0-9]+\.[0-9]+/.test(s.calculationRuntime?.nodeVersion||'')||!/^[a-f0-9]{64}$/.test(s.calculationRuntime?.nodeExecutableHash||'')))fail('INVALID_CALCULATION_RUNTIME');
 if(s.kindScope!=='SINGLE_LISTING_WEEKLY_REPLAY_NOT_AGGREGATE_SIGNAL_CERTIFICATION')fail('INVALID_KIND_SCOPE');
 if(!['AVAILABLE_LIMITED','BLOCKED'].includes(s.state)||!s.periods||!Array.isArray(s.supportedPeriods))fail('INVALID_EXECUTION_STATE');
 if(s.state==='BLOCKED'){
  if(s.quality?.class!=='C'||s.quality?.technicallyExecutable!==false||s.supportedPeriods.length||Object.keys(s.periods||{}).length)fail('BLOCKED_RESULT_LEAK');
 }else{
  if(s.quality?.class!=='B'||s.quality?.technicallyExecutable!==true||!s.identity.listingId||s.quality.returnBasis!=='PRICE_RETURN'||s.availableBacktestKinds?.join(',')!=='SAME_STOCK_REPLAY,SIGNAL_BACKTEST')fail('INVALID_AVAILABLE_QUALITY');
  for(const period of periods){const r=s.periods[period];if(!r||r.period!==period||r.strategy?.id!=='NEW_52W_HIGH'||r.returnBasis!=='PRICE_RETURN'||r.certification!=='NOT_CERTIFIED'||!r.metrics||r.initialCapital!==undefined&&(!Number.isFinite(r.initialCapital)||r.initialCapital<=0)||!Number.isFinite(r.endCapital)||!Number.isFinite(r.metrics.totalReturn)||!Number.isFinite(r.metrics.maxDrawdown)||!Number.isFinite(r.metrics.fees)||!Number.isFinite(r.metrics.slippage)||!Number.isFinite(r.metrics.cagr)||r.from>r.to||!['AVAILABLE','BENCHMARK_UNAVAILABLE'].includes(r.marketBenchmark?.state)||r.buyAndHold?.returnBasis!=='PRICE_RETURN'||(r.marketBenchmark?.state==='AVAILABLE'&&r.marketBenchmark.returnBasis!=='PRICE_RETURN')||!r.inputHash||!r.resultHash||!r.details?.equity?.hash||!r.details?.trades?.hash)fail('INVALID_PERIOD:'+period);}
 }
 return errors;
}
function detailViolations(d,s,period,section){const r=s.periods[period];if(!d||d.schemaVersion!==VERSION||d.generation!==s.generation||d.sourceSecurityId!==s.identity.sourceSecurityId||d.listingId!==s.identity.listingId||d.period!==period||d.resultHash!==r.resultHash||d.section!==section||d.certification!=='NOT_CERTIFIED'||d.returnBasis!=='PRICE_RETURN')return ['INVALID_DETAIL_BINDING'];
 if(section==='equity'&&(!Array.isArray(d.equity)||d.equity.length<2||d.equity[0].date!==r.from||d.equity.at(-1).date!==r.to||d.equity.some((x,i)=>!Number.isFinite(x.value)||x.value<=0||(i&&x.date<=d.equity[i-1].date))))return ['INVALID_EQUITY'];
 if(section==='trades'&&(!Array.isArray(d.trades)||d.trades.length!==r.metrics.completedTrades||d.trades.some(t=>!t.completed||t.signalDate>=t.entryDate||t.entryDate>=t.exitDate||!Number.isFinite(t.netExitValue))))return ['INVALID_TRADES'];return [];
}
const api={identityKey,VERSION,QUALITY,periods,sections,safeId,shard,digest,summaryViolations,detailViolations};if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.VURealBacktestContract=api;
})(typeof window!=='undefined'?window:globalThis);
