#!/usr/bin/env node
// Independent accounting and source checks; never rewrites study results.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {FAMILIES,HORIZON,net,seriesOf,replay,stats,holm,detect} from './study.mjs';
const get=n=>{const i=process.argv.indexOf(n);if(i<0||!process.argv[i+1])throw Error('Required: '+n);return resolve(process.argv[i+1]);};
const dir=get('--results'), out=get('--out');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const m=read(join(dir,'manifest.json')), result=read(join(dir,'results.json'));
const spyPoints=read('quant/data/market/multi-asset/series/SPY.json').points;
const spyMap=new Map(spyPoints.map((p,i)=>[p[0],i]));
const rows=readFileSync(join(dir,'trades.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));
assert.equal(sha('docs/research/signals/PROTOKOLL.md'),m.protocolSha256);
let sourceFiles=0;
for(const p of m.inventory.flatMap(d=>d.items).concat([m.spy])) {assert.equal(sha(p.path),p.sha256,p.path);sourceFiles++;}
for(const [p,h] of Object.entries(m.engineHashes)) assert.equal(sha(p),h,p);
const byTicker=new Map(m.inventory[2].items.map(p=>{const d=read(p.path);return [d.ticker,{payload:d,bars:d.bars,series:seriesOf(d,d.bars)}];}));
const seen=new Set();
for(const r of rows) {
 const {bars,series}=byTicker.get(r.ticker),e=bars.findIndex(b=>b.date===r.entryDate),j=bars.findIndex(b=>b.date===r.exitDate);
 assert.equal(bars[e-1].date,r.signal); assert.equal(series.open[e],r.entry);assert.equal(r.risk,r.entry-r.stop);
 assert.ok(e+HORIZON-1<bars.length);assert.ok(r.holdingDays<=60&&r.holdingDays>0);
 const check=replay(series,e,r.stop,r.target);
 assert.equal(check.j,j);assert.equal(check.exit,r.exit);assert.equal(check.kind,r.kind);
 assert.equal(net(r.entry,r.exit)/r.risk,r.netR);
 assert.equal(net(r.entry,series.close[j])/r.risk,r.holdR);
 assert.equal(r.netR-r.holdR,r.deltaHoldR);
 const si=spyMap.get(r.signal),sj=spyMap.get(r.exitDate);
 assert.equal(r.spyProxyR,net(spyPoints[si][1],spyPoints[sj][1])/spyPoints[si][1]/(r.risk/r.entry));
 const sma=spyPoints.slice(si-199,si+1).reduce((sum,p)=>sum+p[1],0)/200;
 assert.equal(r.regime,spyPoints[si][1]>=sma?'ABOVE_200':'BELOW_200');
 const key=r.ticker+':'+r.family;
 if(!seen.has(key)) {
   seen.add(key);
   const b=detect(byTicker.get(r.ticker).payload,bars.slice(0,e));
   const scenario=b.scenarios.scenarios.find(s=>s.template===r.family&&s.direction==='BULLISH');
   assert.equal(scenario.status,'ACTIVE');assert.equal(scenario.entryStatus,'ACTIVE');
   const scale=series.close[e-1]/b.lastBar.close;
   assert.equal(r.stop,(scenario.tradeStop?.price??scenario.invalidation.price)*scale);
   assert.equal(r.target,scenario.targetZones[0].zoneLow*scale);
 }

}
assert.deepEqual(result.families.map(f=>f.family).sort(),FAMILIES.slice().sort());
const ordered=FAMILIES.map(k=>result.families.find(f=>f.family===k));
const adjusted=holm(ordered.flatMap(f=>[f.pHold,1]));
for(const [i,f] of ordered.entries()) {
 const rs=rows.filter(r=>r.family===f.family), c=f.counts;
 assert.equal(c.signals,f.n+c.gapEntry+c.rightCensored+c.invalidWindow);
 assert.equal(c.activeObservations,c.signals+c.overlap+c.incomplete);
 const actual=stats(rs);for(const [k,v] of Object.entries(actual)) assert.equal(f[k],v,f.family+':'+k);
 assert.equal(f.pHoldHolm,adjusted[i*2]);assert.equal(f.pSpyExactHolm,1);
 assert.equal(Object.values(f.regimes).reduce((s,v)=>s+v.n,0),f.n);
 const sorted=rs.slice().sort((a,b)=>a.entryDate.localeCompare(b.entryDate)); const last=new Map();
 for(const r of sorted) {assert.ok(!last.has(r.ticker)||r.signal>last.get(r.ticker),'overlapping trade');last.set(r.ticker,r.exitDate);}
 assert.equal(f.verdict,'zu wenig Fälle'); // dataset has at most five distinct equities
}
const files=['scripts/research/signals/study.mjs','scripts/research/signals/study.test.mjs','scripts/research/signals/report.mjs','scripts/research/signals/verify.mjs',join(dir,'manifest.json'),join(dir,'results.json'),join(dir,'trades.jsonl')];
const record={verified:true,trades:rows.length,sourceFiles,engines:Object.keys(m.engineHashes).length,
 signalReconstructions:seen.size,checks:['signal-time scenario reconstruction','SPY proxy and SMA200 regime','protocol and all source/engine hashes','next-open chronology','canonical split units','stop/target/time replay','costs and R','same-date holding comparison','exclusion accounting','no same-family overlap','all families and regimes','Holm family size'],
 hashes:Object.fromEntries(files.map(p=>[p,sha(p)]))};
writeFileSync(out,JSON.stringify(record,null,2)+'\n');console.log('Verified',rows.length,'trades;',sourceFiles,'source files.');
