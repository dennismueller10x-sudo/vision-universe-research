import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Service=require('../../../quant/api/product-services.js'),Policy=require('../../../quant/engines/display-policy.js'),Query=require('../../../quant/engines/query.js');
test('concurrent stock consumers share pending work; failure is not a settled permission/data cache',async()=>{
 let release,reads=0;const gate=new Promise(r=>release=r);
 const api=Service.create({loadJSON:async()=>{reads++;await gate;throw Error('fixture unavailable');},displayPolicy:Policy,queryEngine:Query});
 const first=api.getStockIntelligence('nvda'),second=api.getStockIntelligence('NVDA');assert.equal(first,second);
 await Promise.resolve();assert(reads>0);release();const value=await first;assert.equal(value.state,'UNAVAILABLE');
 const retry=api.getStockIntelligence('NVDA');assert.notEqual(retry,first);assert.deepEqual(await retry,value);
});

test('the current navigation consumes its stock result once even when the page pack arrives later',async()=>{
 const {readFileSync}=await import('node:fs'),vm=await import('node:vm');
 const source=readFileSync(new URL('../../../quant/app/app.js',import.meta.url),'utf8'),begin=source.indexOf('    prefetchStock: function'),end=source.indexOf('    /* Im Release',begin);
 let calls=0,resolve;const first=new Promise(r=>resolve=r),context={Date,global:{QXLoadStockCss(){}},api:{getStockIntelligence(){calls++;return calls===1?first:Promise.resolve({state:'AVAILABLE',read:calls});}}};
 vm.runInNewContext('var ctx={'+source.slice(begin,end)+'};this.ctx=ctx;',context);
 context.ctx.startStock('NVDA');resolve({state:'AVAILABLE',read:1});await first;await Promise.resolve();
 assert.equal((await context.ctx.takePrefetched('NVDA')).read,1);assert.equal(calls,1);assert.equal(context.ctx.takePrefetched('NVDA'),null);
 context.ctx.startStock('NVDA');assert.equal((await context.ctx.takePrefetched('NVDA')).read,2);assert.equal(calls,2,'new navigation revalidates instead of retaining a settled permission decision');
});
