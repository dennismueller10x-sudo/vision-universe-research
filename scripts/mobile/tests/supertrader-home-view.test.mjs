import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {projectSupertraderHome} from '../../vu2/supertrader-home-view.mjs';
test('home delivery copies every displayed signal header/count unchanged and excludes detail rows',()=>{
 const source={schema:'supertrader-signals-1.0.0',asOf:'2026-11-05',inputsGeneratedAt:'fixture-date',policy:'fixture-policy',disclaimer:'fixture-text',counts:{ACTIVE:0,CLOSED:4,SETUP:2},strategies:{large:'unused'},bySymbol:{FIX:[]}};
 const view=projectSupertraderHome(source);
 for(const key of ['schema','asOf','inputsGeneratedAt','policy','disclaimer','counts'])assert.equal(view[key],source[key]);
 assert.deepEqual(Object.keys(view).sort(),['deliveryView','schema','asOf','inputsGeneratedAt','policy','disclaimer','counts'].sort());
 for(const bad of [{...source,schema:'unknown'},{...source,asOf:null},{...source,counts:null}])assert.throws(()=>projectSupertraderHome(bad),/INVALID_SUPERTRADER_HOME_SOURCE/);
});
test('modern home waits only for its view and market; legacy and missing-view paths remain available',async()=>{
 const source=readFileSync(new URL('../../../supertrader/assets/supertrader.js',import.meta.url),'utf8'),snippet=source.slice(source.indexOf('  function fullPageData()'),source.indexOf("  (page === 'home' ? homePageData()"));
 for(const modern of [true,false])for(const missing of [false,true]){
  const calls=[],view={deliveryView:'st-home-view-1',counts:{ACTIVE:0}},context={UI:Promise.resolve(),window:{STRedesign:modern?{render:{home(){}}}:null},need:['registry','signals','market','pilot','replay','trend52'],load:async key=>{calls.push(key);return {key};},getJSON:async name=>{calls.push(name);if(missing)throw Error('old release');return view;}};
  vm.runInNewContext(snippet+';this.run=homePageData',context);const result=await context.run();
  if(modern){assert.deepEqual(calls.sort(),(missing?['home-view.json','signals','market']:['home-view.json','market']).sort());if(!missing)assert.equal(result.compact.signals,view);assert.equal(result.compact.market.key,'market');if(missing)assert.equal(result.compact.signals.key,'signals');}
  else{assert.deepEqual(calls.sort(),context.need.slice().sort());assert.equal(result.length,6);}
 }
});

test('Supertrader reuses the stamped preload key instead of downloading the same script twice',async()=>{
 const source=readFileSync(new URL('../../../supertrader/assets/supertrader.js',import.meta.url),'utf8'),snippet=source.slice(source.indexOf('  var SCRIPT_P ='),source.indexOf('  var CSS_P ='));
 const requests=[],preload={href:'https://example.test/assets/vu-ui.js?v=abcdef1234567890'},context={document:{querySelector:selector=>selector.includes('href^=')?preload:null,createElement:()=>({}),head:{appendChild:s=>{requests.push(s.src);s.onload();}}}};
 vm.runInNewContext(snippet+';this.run=loadScript',context);
 const first=context.run('/assets/vu-ui.js?v=vu-ui-1.2.0');assert.equal(context.run('/assets/vu-ui.js?v=vu-ui-1.2.0'),first);await first;assert.deepEqual(requests,[preload.href]);
});
