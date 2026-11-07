import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../../assets/vu-ui.js',import.meta.url),'utf8');
function runtime({reduced=false}={}){
 const listeners={},doc={visibilityState:'visible',addEventListener:(n,f)=>listeners[n]=f,removeEventListener:n=>delete listeners[n]},global={navigator:{connection:{saveData:false}},matchMedia:()=>({matches:reduced})};
 const context={globalThis:global,document:doc,location:{href:'https://example.test/quant/'},URL,Map,Date,Promise,setTimeout,clearTimeout,module:{exports:{}}};
 vm.runInNewContext(source,context);return {ui:context.module.exports,doc,global,listeners};
}
test('transition snapshots synchronous route start and does not await slow data',async()=>{
 const {ui,doc}=runtime();let callbackResult,calls=0,resolve;
 const slow=new Promise(r=>resolve=r);
 doc.startViewTransition=callback=>{callbackResult=callback();return {finished:Promise.resolve(),updateCallbackDone:Promise.resolve()};};
 const result=ui.transition(()=>{calls++;return slow;});assert.equal(callbackResult,undefined);assert.equal(calls,1);resolve('ready');assert.equal(await result,'ready');
});
test('reduced motion and unsupported/throwing View Transitions run the update once',()=>{
 for(const reduced of [true,false]){const {ui,doc}=runtime({reduced});let calls=0;doc.startViewTransition=()=>{if(reduced)assert.fail('motion must be bypassed');throw Error('unsupported');};assert.equal(ui.transition(()=>++calls),1);assert.equal(calls,1);}
});
test('intent loads one canonical key, ignores Save-Data and external links, and disposes listeners',async()=>{
 const {ui,doc,global,listeners}=runtime(),calls=[];
 const dispose=ui.bindIntent(url=>url.origin==='https://example.test'?url.hash.slice(1):null,key=>calls.push(key),doc);
 const event=href=>({type:'pointerdown',target:{closest:()=>({href})}});
 listeners.pointerdown(event('https://example.test/quant/#NVDA'));listeners.pointerdown(event('https://example.test/quant/#NVDA'));
 await Promise.resolve();await Promise.resolve();assert.deepEqual(calls,['NVDA']);
 global.navigator.connection.saveData=true;listeners.pointerdown(event('https://example.test/quant/#AAPL'));assert.deepEqual(calls,['NVDA']);
 global.navigator.connection.saveData=false;listeners.pointerdown(event('https://outside.test/#AAPL'));await Promise.resolve();assert.deepEqual(calls,['NVDA']);dispose();assert.equal(Object.keys(listeners).length,0);
});

test('superseded transitions handle ready/finished aborts without losing the route update',async()=>{
 const {ui,doc}=runtime();let calls=0;
 doc.startViewTransition=callback=>{callback();return {ready:Promise.reject(Error('Old view transition aborted')),finished:Promise.reject(Error('aborted')),updateCallbackDone:Promise.resolve()};};
 assert.equal(await ui.transition(()=>{calls++;return 'ready';}),'ready');await new Promise(r=>setImmediate(r));assert.equal(calls,1);
});
