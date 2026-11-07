import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../../supertrader/assets/supertrader.js',import.meta.url),'utf8');
test('Supertrader shares pending JSON, expires settled data and retries failures',async()=>{
 let now=100000,calls=0,fail=false;class Clock extends Date{static now(){return now;}}
 const context={Date:Clock,DATA:'/supertrader/data/',fetch:async(path,options)=>{calls++;assert.equal(options.cache,'no-cache');if(fail)throw Error('offline');return {ok:true,json:async()=>({version:calls})};}};
 vm.runInNewContext(source.slice(source.indexOf('  var JSON_P ='),source.indexOf('  function num('))+';this.load=getJSON',context);
 const a=context.load('build.json');assert.equal(context.load('build.json'),a);await a;assert.equal(context.load('build.json'),a);assert.equal(calls,1);
 now+=30001;const b=context.load('build.json');assert.notEqual(a,b);await b;assert.equal(calls,2);
 now+=30001;fail=true;await assert.rejects(context.load('build.json'),/offline/);fail=false;await context.load('build.json');assert.equal(calls,4);
});
