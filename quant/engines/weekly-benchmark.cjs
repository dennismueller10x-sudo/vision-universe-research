/* Read-only PRICE_RETURN benchmark contract. Exact observed dates, no filling. */
const fs = require('node:fs');
const path = require('node:path');
const {hash} = require('./weekly-real-adapter.cjs');
const SOURCE = 'quant/data/market/multi-asset/series/SPY.json';
function prepare(doc, catalog, bytesHash) {
  const rows = catalog.instruments.filter(x => x.symbol === 'SPY');
  if (rows.length !== 1 || rows[0].instrumentId !== doc.instrumentId || rows[0].currency !== 'USD' || rows[0].tracker?.performanceSemantics !== 'ETF_PRICE_RETURN_SPLIT_ADJUSTED' || doc.symbol !== 'SPY' || doc.source !== 'tiingo-equity' || doc.frequency !== 'DAILY' || doc.valueSemantics !== 'PRICE' || doc.unitId !== 'USD_PER_SHARE' || doc.representation !== 'OBSERVATIONS') throw Error('BENCHMARK_IDENTITY_OR_BASIS_UNVERIFIED');
  const byDate = new Map();
  let previous = null;
  for (const [date, price] of doc.points || []) {
    const parsed = new Date(date + 'T00:00:00Z');
    if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0,10) !== date || ![1,2,3,4,5].includes(parsed.getUTCDay()) || !Number.isFinite(price) || price <= 0 || (previous && date <= previous)) throw Error('BENCHMARK_INVALID_OBSERVATION');
    byDate.set(date, price); previous=date;
  }
  if (!byDate.size || doc.from !== doc.points[0][0] || doc.to !== doc.points.at(-1)[0] || doc.observations !== doc.points.length) throw Error('BENCHMARK_BOUNDARIES_INVALID');
  return {byDate, provenance:{sourcePath:SOURCE, sourceBytesHash:bytesHash || hash(doc), catalogHash:hash(catalog), instrumentId:doc.instrumentId, source:doc.source, from:doc.from, to:doc.to, returnBasis:'PRICE_RETURN', currency:'USD', verification:'CATALOG_IDENTITY_AND_PUBLISHER_SPLIT_ADJUSTED_PRICE_CONTRACT'}};
}
function load(root) {
  const bytes = fs.readFileSync(path.join(root,SOURCE),'utf8');
  const catalog = JSON.parse(fs.readFileSync(path.join(root,'quant/data/market/multi-asset/instruments.json'),'utf8'));
  const benchmark=prepare(JSON.parse(bytes),catalog,hash(bytes));
  const overlapPath='quant/data/market/discover-series/ref_SPY.json';
  const overlapBytes=fs.readFileSync(path.join(root,overlapPath),'utf8'), overlap=JSON.parse(overlapBytes);
  if(overlap.securityId!=='ref_SPY' || overlap.dataMode!=='real' || overlap.priceSeriesType!=='SPLIT_ADJUSTED' || overlap.currency!=='USD') throw Error('BENCHMARK_OVERLAP_BASIS_INVALID');
  const pairs=overlap.points.filter(p=>benchmark.byDate.has(p[0]));
  if(pairs.length<100 || pairs.some(([d,p])=>Math.abs(benchmark.byDate.get(d)-p)>0.005000001)) throw Error('BENCHMARK_OVERLAP_CONFLICT');
  benchmark.provenance.overlap={sourcePath:overlapPath,sourceBytesHash:hash(overlapBytes),observations:pairs.length,toleranceAbsoluteUSD:0.005000001,independentProvider:false};
  return benchmark;
}
function statistics(values,dates,initial) {
  const years=(Date.parse(dates.at(-1))-Date.parse(dates[0]))/86400000/365.2425;
  let peak=values[0],maxDrawdown=0;
  for(const value of values){peak=Math.max(peak,value);maxDrawdown=Math.min(maxDrawdown,value/peak-1);}
  return {endCapital:values.at(-1),totalReturn:values.at(-1)/initial-1,cagr:years>0?(values.at(-1)/initial)**(1/years)-1:null,maxDrawdown};
}
function compare(benchmark,equity,strategy,currency='USD',initial=100000) {
  const unavailable=reason=>({id:'SPY_BUY_AND_HOLD',state:'BENCHMARK_UNAVAILABLE',reason,returnBasis:'PRICE_RETURN'});
  if (!benchmark || benchmark.error) return unavailable(benchmark?.error || 'SOURCE_MISSING');
  if(currency !== benchmark.provenance.currency) return unavailable('CURRENCY_MISMATCH');
  const missing=equity.filter(p=>!benchmark.byDate.has(p.date)).map(p=>p.date);
  if(missing.length)return {...unavailable('EXACT_VALUATION_DATES_MISSING'),missingDates:missing,provenance:benchmark.provenance};
  const base=benchmark.byDate.get(equity[0].date);
  const points=equity.map(p=>({date:p.date,value:initial*benchmark.byDate.get(p.date)/base}));
  const metrics=statistics(points.map(p=>p.value),points.map(p=>p.date),initial);
  return {id:'SPY_BUY_AND_HOLD',state:'AVAILABLE',returnBasis:'PRICE_RETURN',currency,costsBps:0,from:points[0].date,to:points.at(-1).date,provenance:benchmark.provenance,...metrics,excessTotalReturn:strategy.totalReturn-metrics.totalReturn,excessCagr:strategy.cagr===null||metrics.cagr===null?null:strategy.cagr-metrics.cagr,excessEndCapital:initial*(1+strategy.totalReturn)-metrics.endCapital,points};
}
module.exports={load,prepare,compare,statistics,SOURCE};
