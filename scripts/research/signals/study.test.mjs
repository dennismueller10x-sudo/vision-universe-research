import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {net,replay,seriesOf,detect,holm,clusterP,stats} from './study.mjs';
const fixture = () => ({length:61,open:Array(61).fill(100),high:Array(61).fill(102),low:Array(61).fill(98),close:Array(61).fill(101)});
test('costs are charged on each actual notional',()=>{
 assert.equal(net(100,110),9.79); assert.equal(net(100,100),-.2);
});
test('next-open execution, entry-day ambiguity, adverse and favourable gaps',()=>{
 const s=fixture(); s.low[0]=1;s.high[0]=1000; // signal bar must not execute
 assert.equal(replay(s,1,95,110).kind,'TIME');
 s.low[1]=94;s.high[1]=111;
 assert.deepEqual(replay(s,1,95,110),{j:1,exit:95,kind:'STOP',ambiguous:1});
 s.low[1]=98;s.high[1]=102;s.open[2]=90;
 assert.equal(replay(s,1,95,110).exit,90);
 s.open[2]=120; assert.equal(replay(s,1,95,110).exit,120);
 s.open[1]=94;assert.equal(replay(s,1,95,110).reason,'GAP_ENTRY');
});
test('full horizon required even for early exits; day 60 included',()=>{
 const s=fixture();s.high[1]=120;
 assert.equal(replay(s,2,95,110).reason,'RIGHT_CENSORED');
 s.high[1]=102;assert.equal(replay(s,1,95,110).j,60);
});
test('splits use canonical factors and signal-time scale, including execution after a split',()=>{
 const p={ticker:'TEST',provider:'fixture'};
 const bars=[{date:'2020-01-01',open:100,high:102,low:98,close:100,volume:1,splitFactor:1},
 {date:'2020-01-02',open:50,high:51,low:49,close:50,volume:2,splitFactor:2}];
 assert.equal(seriesOf(p,bars.slice(0,1)).close[0],100);
 assert.deepEqual(seriesOf(p,bars).close,[50,50]);
 assert.deepEqual(seriesOf(p,bars).volume,[2,2]);
});
test('real engine replay is independent of future and reports the cutoff',()=>{
 const p=JSON.parse(readFileSync(new URL('../../../quant/data/market/golden-preview/daily/ref_AAPL.json',import.meta.url)));
 const prefix=p.bars.slice(0,400);
 const a=detect(p,prefix);
 const poisoned={...p,bars:[...prefix,...p.bars.slice(400).map(b=>({...b,close:1e10,splitFactor:100}))]};
 const b=detect(poisoned,poisoned.bars.slice(0,400));
 assert.deepEqual(a.scenarios,b.scenarios);assert.deepEqual(a.tradeSetup,b.tradeSetup);
 assert.equal(a.dataCutoff,prefix.at(-1).date);
});
test('Holm retains all ten planned tests; empty results stay unavailable',()=>{
 assert.deepEqual(holm([.001,.01,...Array(8).fill(1)]),[.01,.09,...Array(8).fill(1)]);
 assert.equal(clusterP([],'deltaHoldR'),1);assert.equal(stats([]).netR,null);
 const rows=Array.from({length:40},(_,i)=>({quarter:'Q'+i,deltaHoldR:1+i%3}));
 assert.equal(clusterP(rows,'deltaHoldR'),clusterP(rows,'deltaHoldR'));
});
test('preregistered protocol is unchanged from first commit',()=>{
 const path='docs/research/signals/PROTOKOLL.md';
 // Fixed from preregistration commit 10b0021c; works in shallow CI checkouts.
 assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),'75a0b43f322bacf3877f725d85994851f3ffe5ca48a648d1b14865f353dfef08');
});
