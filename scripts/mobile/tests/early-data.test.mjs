import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../../../quant/index.html',import.meta.url),'utf8'),code=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('window.__vuEarly'))[1];
test('early data is bounded to its route, shared with the canonical loader and discarded after 30 s',()=>{
 for(const hash of ['#/aktie/NVDA','#/aktie/NVDA?tab=test','#/','#/aktien']){
  const calls=[],timers=[],context={location:{hash,search:''},fetch:(path,options)=>{calls.push(path);assert.equal(options.cache,'no-cache');return Promise.resolve({});},setTimeout:(fn,ms)=>{assert.equal(ms,30000);timers.push(fn);}};context.window=context;vm.createContext(context);vm.runInContext(code,context);vm.runInContext(code,context);
  const stock=hash.startsWith('#/aktie/');assert.equal(calls.length,stock?5:hash==='#/'?2:1);assert.equal(calls.length,new Set(calls).size);
  for(const callback of timers)callback();assert.deepEqual(Object.keys(context.__vuEarly),[]);
 }
});
