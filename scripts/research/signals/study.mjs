#!/usr/bin/env node
// E4/S1. Research only. Engines are imported unchanged; no detection predicates here.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const TA = require('../../../quant/engines/technical/technical-analysis.js');
const Canonical = require('../../../quant/engines/technical/canonical-bars.js');
const Returns = require('../../../quant/engines/return-series.js');
const Trade = require('../../../quant/engines/technical/trade-setup.js');
export const FAMILIES = ['PULLBACK_TO_SUPPORT', 'BREAKOUT_RETEST', 'SMA50_PULLBACK_NOT_SUPPLIED', 'RANGE_BREAKOUT_UP', 'DEEPER_CORRECTION'];
export const HORIZON = 60;
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const mean = a => a.length ? a.reduce((s,v) => s+v,0)/a.length : null;
const goodBar = b => ['open','high','low','close','splitFactor'].every(k => Number.isFinite(b[k]) && b[k]>0) && b.high >= Math.max(b.open,b.close) && b.low <= Math.min(b.open,b.close);
export function net(entry, exit) { return exit-entry-.001*(entry+exit); }
export function seriesOf(payload, bars) {
  const f = Returns.splitFactors(bars);
  return Canonical.createSeries({ instrumentId: payload.ticker, exchange: payload.exchange, currency: payload.currency,
    source: payload.provider, priceSeriesType: 'SPLIT_ADJUSTED', timeframe: '1D' }, {
    timestamps: bars.map(b=>b.date), ...Object.fromEntries(['open','high','low','close'].map(k=>[k,bars.map((b,i)=>b[k]/f[i])])),
    volume: bars.map((b,i)=>Number.isFinite(b.volume)?b.volume*f[i]:null), adjustmentFactor: f.map(v=>1/v)
  });
}
export function detect(payload, cut) {
  return TA.analyze({series:seriesOf(payload,cut), benchmarkSeries:null,
    options:{elliott:false,annotations:false,multiTimeframe:false,includeChartSeries:false}});
}
// Replay in full-series split units. Signal-time marks are converted by caller.
export function replay(s, e, stop, target) {
  const entry=s.open[e];
  if (!(stop<entry && entry<target)) return {reason:'GAP_ENTRY'};
  const end=e+HORIZON-1;
  if (end>=s.length) return {reason:'RIGHT_CENSORED'};
  let ambiguous=0;
  for(let j=e;j<=end;j++) {
    if(s.open[j]<=stop) return {j,exit:s.open[j],kind:'STOP_GAP',ambiguous};
    if(s.open[j]>=target) return {j,exit:s.open[j],kind:'TARGET_GAP',ambiguous};
    if(s.low[j]<=stop) { ambiguous += s.high[j]>=target ? 1:0; return {j,exit:stop,kind:'STOP',ambiguous}; }
    if(s.high[j]>=target) return {j,exit:target,kind:'TARGET',ambiguous};
  }
  return {j:end,exit:s.close[end],kind:'TIME',ambiguous};
}
export function clusterP(rows, field) {
  if(!rows.length) return 1;
  const observed=mean(rows.map(r=>r[field]));
  if(observed<=0) return 1;
  const groups=new Map();
  for(const r of rows) groups.set(r.quarter,(groups.get(r.quarter)||0)+r[field]-observed);
  const sums=[...groups.values()]; let seed=20261105, exceed=0;
  for(let b=0;b<9999;b++) {
    let sum=0;
    for(const x of sums) { seed ^= seed<<13; seed ^= seed>>>17; seed ^= seed<<5; sum += (seed>>>0)%2 ? x : -x; }
    if(sum/rows.length>=observed) exceed++;
  }
  return (exceed+1)/10000;
}
export function holm(ps) {
  const order=ps.map((p,i)=>({p,i})).sort((a,b)=>a.p-b.p); const out=[]; let prev=0;
  order.forEach(({p,i},k)=>{ prev=Math.max(prev,Math.min(1,p*(ps.length-k))); out[i]=prev; }); return out;
}
export function stats(rows) {
  const wins=rows.filter(r=>r.netR>0), losses=rows.filter(r=>r.netR<0);
  return {n:rows.length,tickers:new Set(rows.map(r=>r.ticker)).size,quarters:new Set(rows.map(r=>r.quarter)).size,
    winRate:rows.length?wins.length/rows.length:null,averageWinR:mean(wins.map(r=>r.netR)),averageLossR:mean(losses.map(r=>r.netR)),
    zero:rows.filter(r=>r.netR===0).length,netR:mean(rows.map(r=>r.netR)),grossR:mean(rows.map(r=>r.grossR)),
    netReturn:mean(rows.map(r=>r.netReturn)),holdR:mean(rows.map(r=>r.holdR)),deltaHoldR:mean(rows.map(r=>r.deltaHoldR)),
    spyProxyR:mean(rows.filter(r=>r.spyProxyR!==null).map(r=>r.spyProxyR)),
    deltaSpyProxyR:mean(rows.filter(r=>r.spyProxyR!==null).map(r=>r.netR-r.spyProxyR)),
    spyExactR:null,holdingDays:mean(rows.map(r=>r.holdingDays)),ambiguous:rows.reduce((s,r)=>s+r.ambiguous,0)};
}
function inventory() {
  const dirs=['quant/data/market/discover-series-long','quant/data/market/discover-series','quant/data/market/golden-preview/daily'];
  return dirs.map(dir=>{
    const files=readdirSync(join(ROOT,dir)).filter(f=>f.endsWith('.json')&&f!=='index.json').sort();
    const items=files.map(f=>{const p=join(ROOT,dir,f), d=read(p);return {path:relative(ROOT,p),sha256:hash(p),grain:d.grain||'daily',points:d.points?.length??d.bars?.length??0,from:d.from||d.first,to:d.to||d.last,ohlc:!!d.bars?.every(goodBar)};});
    return {dir,files:items.length,ohlcFiles:items.filter(x=>x.ohlc).length,items};
  });
}
export async function run(out) {
  const protocol=join(ROOT,'docs/research/signals/PROTOKOLL.md');
  const protocolCommit=execFileSync('git',['log','-1','--format=%H','--',relative(ROOT,protocol)],{cwd:ROOT,encoding:'utf8'}).trim();
  const base=execFileSync('git',['rev-parse',protocolCommit+'^'],{cwd:ROOT,encoding:'utf8'}).trim();
  const inv=inventory();
  const spyPath=join(ROOT,'quant/data/market/multi-asset/series/SPY.json');
  const spy=read(spyPath).points; const spyMap=new Map(spy.map((p,i)=>[p[0],i]));
  function regime(date) {const i=spyMap.get(date);return i===undefined||i<199?'UNAVAILABLE':spy[i][1]>=mean(spy.slice(i-199,i+1).map(p=>p[1]))?'ABOVE_200':'BELOW_200';}
  const trades=[], counts=Object.fromEntries(FAMILIES.map(f=>[f,{activeObservations:0,conditionalObservations:0,signals:0,overlap:0,incomplete:0,gapEntry:0,rightCensored:0,invalidWindow:0}]));
  const files=inv[2].items;
  for(const file of files) {
    const payload=read(join(ROOT,file.path)), bars=payload.bars, full=seriesOf(payload,bars), busy={};
    for(let i=299;i<bars.length;i++) {
      if(bars[i].date<'2016-01-01'||bars[i].date>'2026-12-31') continue;
      const cut=bars.slice(0,i+1);
      if(!cut.every(goodBar)) throw Error('Invalid detection history: '+file.path);
      const b=detect(payload,cut);
      if(b.dataCutoff!==bars[i].date) throw Error('LOOKAHEAD');
      for(const s of b.scenarios.scenarios) {
        if(s.direction!=='BULLISH'||!FAMILIES.includes(s.template)) continue;
        const c=counts[s.template];
        if(s.status!=='ACTIVE'||s.entryStatus!=='ACTIVE') { c.conditionalObservations++; continue; }
        c.activeObservations++;
        const setup=Trade.buildTradeSetup(s,{close:b.lastBar.close,atr:b.featuresAtCutoff.atr,averageVolume:b.featuresAtCutoff.averageVolume});
        if(!['COMPLETE','COMPLETE_LOW_RR'].includes(setup.status)) { c.incomplete++;continue; }
        if(i<=(busy[s.template]??-1)) {c.overlap++;continue;}
        c.signals++;
        const e=i+1,end=e+HORIZON-1;
        if(end>=bars.length||bars[end].date>'2026-12-31') {c.rightCensored++;continue;}
        if(bars.slice(e,end+1).some((bar,k)=>!goodBar(bar)||Date.parse(bar.date)-Date.parse(bars[e+k-1].date)>7*86400000)) {c.invalidWindow++;continue;}
        const scale=full.close[i]/b.lastBar.close;
        const stop=setup.tradeStop.price*scale, target=setup.targets[0].zoneLow*scale;
        const r=replay(full,e,stop,target);
        if(r.reason) {c.gapEntry++;continue;}
        busy[s.template]=r.j;
        const entry=full.open[e],risk=entry-stop,netR=net(entry,r.exit)/risk;
        const holdR=net(entry,full.close[r.j])/risk;
        const si=spyMap.get(bars[e-1].date),sj=spyMap.get(bars[r.j].date);
        const spyProxyR=si===undefined||sj===undefined?null:net(spy[si][1],spy[sj][1])/spy[si][1]/(risk/entry);
        trades.push({family:s.template,ticker:payload.ticker,securityId:payload.securityId,signal:bars[i].date,entryDate:bars[e].date,exitDate:bars[r.j].date,
          quarter:bars[e].date.slice(0,4)+'Q'+(Math.floor((+bars[e].date.slice(5,7)-1)/3)+1),regime:regime(bars[i].date),
          setupId:setup.setupId,setupStatus:setup.status,entry,stop,target,exit:r.exit,kind:r.kind,risk,grossR:(r.exit-entry)/risk,netR,netReturn:net(entry,r.exit)/entry,
          holdR,deltaHoldR:netR-holdR,spyProxyR,holdingDays:r.j-e+1,ambiguous:r.ambiguous});
      }
      if(i%500===0) console.log(payload.ticker,bars[i].date,trades.length,'trades');
    }
    console.log('finished',payload.ticker);
  }
  const families=FAMILIES.map(f=>{const rows=trades.filter(r=>r.family===f);return {family:f,counts:counts[f],...stats(rows),pHold:clusterP(rows,'deltaHoldR'),pSpyExact:1,
    regimes:Object.fromEntries(['ABOVE_200','BELOW_200','UNAVAILABLE'].map(k=>[k,stats(rows.filter(r=>r.regime===k))]))};});
  const adjusted=holm(families.flatMap(f=>[f.pHold,f.pSpyExact]));
  families.forEach((f,i)=>{f.pHoldHolm=adjusted[2*i];f.pSpyExactHolm=adjusted[2*i+1];f.verdict=f.n<100||f.tickers<20||f.quarters<20?'zu wenig Fälle':'nicht besser';f.s2Candidate=f.netR>0&&f.deltaHoldR>0;});
  families.sort((a,b)=>(b.netR??-Infinity)-(a.netR??-Infinity));
  const engineFiles=execFileSync('git',['ls-tree','-r','--name-only',base,'quant/engines'],{cwd:ROOT,encoding:'utf8'}).trim().split('\n');
  const manifest={schema:'e4-signals-1',label:'Forschung, nicht zertifiziert',base,protocolCommit,protocolSha256:hash(protocol),node:process.version,
    cadence:'DAILY',from:'2016-01-01',requestedThrough:'2026-12-31',observedThrough:Math.max(...files.map(f=>Date.parse(f.to)))?files.map(f=>f.to).sort().at(-1):null,
    spy:{path:relative(ROOT,spyPath),sha256:hash(spyPath),basis:'SPLIT_ADJUSTED_PRICE_CLOSE_PROXY',exactAvailable:false},
    engineHashes:Object.fromEntries(engineFiles.map(p=>[p,hash(join(ROOT,p))])),inventory:inv};
  mkdirSync(out,{recursive:true});
  writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  writeFileSync(join(out,'results.json'),JSON.stringify({families},null,2)+'\n');
  writeFileSync(join(out,'trades.jsonl'),trades.map(t=>JSON.stringify(t)).join('\n')+'\n');
  return {families,manifest};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const i=process.argv.indexOf('--out');
  if(i<0||!process.argv[i+1]) throw Error('Required: --out DIR');
  await run(resolve(process.argv[i+1]));
}
