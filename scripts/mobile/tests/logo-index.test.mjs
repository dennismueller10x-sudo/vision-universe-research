import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../../../assets/vu-ui.js',import.meta.url),'utf8'),logos=readFileSync(new URL('../../../discover/ui/logos.js',import.meta.url),'utf8');
const MIN={v:1,t:'AAPL,NVDA',x:{NVDA:'files/odd.png'},d:['AAPL']};
const mk=(routes)=>{const urls=[];const context={document:{querySelectorAll:()=>[]},fetch:async u=>{urls.push(u);const r=routes[u];return r?{ok:true,json:async()=>r}:{ok:false,json:async()=>({})};}};context.window=context;vm.createContext(context);return {context,urls};};
test('both logo consumers share the compact index in either loading order',async()=>{
 for(const first of ['ui','logos']){
  const {context,urls}=mk({'/discover/logos/index.json':MIN});
  if(first==='ui'){vm.runInContext(ui,context);context.VUUI.logo('NVDA');vm.runInContext(logos,context);}else{vm.runInContext(logos,context);vm.runInContext(ui,context);context.VUUI.logo('NVDA');}
  await new Promise(r=>setImmediate(r));await context.__vuLogoIndex;
  assert.deepEqual(urls,['/discover/logos/index.json']);
  const d=await context.__vuLogoIndex;
  assert.deepEqual(JSON.parse(JSON.stringify(d.files)),{AAPL:'files/AAPL.png',NVDA:'files/odd.png'});assert.deepEqual(JSON.parse(JSON.stringify(d.dark)),['AAPL']);
 }
});
test('the source form (files) still works and is fetched exactly once from the same address',async()=>{
 const {context,urls}=mk({'/discover/logos/index.json':{files:{A:'files/A.png'},dark:['A']}});
 vm.runInContext(ui,context);context.VUUI.logo('NVDA');
 const d=await context.__vuLogoIndex;
 assert.deepEqual(urls,['/discover/logos/index.json']);assert.deepEqual(JSON.parse(JSON.stringify(d.files)),{A:'files/A.png'});
});
test('wide ratios load lazily and only for wide marks',async()=>{
 const {context,urls}=mk({'/discover/logos/index.json':MIN,'/discover/logos/wide.min.json':{v:1,w:{NVDA:3}}});
 context.document.createElement=()=>({classList:{add(){}},style:{setProperty(){}},setAttribute(){},appendChild(){},addEventListener(){},childNodes:[]});
 vm.runInContext(logos,context);
 context.VUDiscover.Logos.mark('AAPL',{});await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 assert.equal(urls.includes('/discover/logos/wide.min.json'),false);
 context.VUDiscover.Logos.mark('NVDA',{wide:true});await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 assert.equal(urls.includes('/discover/logos/wide.min.json'),true);
});
test('compact lists are derived from index.json (nothing hand-committed)',async()=>{
 const {compactLogoIndex}=await import('../../vu2/logo-index-min.mjs');
 const {existsSync}=await import('node:fs');
 assert.equal(existsSync(new URL('../../../discover/logos/index.min.json',import.meta.url)),false);
 assert.equal(existsSync(new URL('../../../discover/logos/wide.min.json',import.meta.url)),false);
 const src=JSON.parse(readFileSync(new URL('../../../discover/logos/index.json',import.meta.url),'utf8'));
 assert.ok(src.files&&!('t' in src),'Quelle bleibt die volle Form');
 const {index,wide}=compactLogoIndex(src);
 const {context}=mk({'/discover/logos/index.json':index});
 vm.runInContext(ui,context);context.VUUI.logo('NVDA');
 const d=await context.__vuLogoIndex;
 assert.deepEqual(JSON.parse(JSON.stringify(d.files)),src.files);assert.deepEqual(JSON.parse(JSON.stringify(d.dark)),src.dark);
 assert.deepEqual(wide.w,src.wide);
});
