import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../../../assets/vu-ui.js',import.meta.url),'utf8'),logos=readFileSync(new URL('../../../discover/ui/logos.js',import.meta.url),'utf8');
test('both logo consumers share the index in either loading order',async()=>{
 for(const first of ['ui','logos']){
  let calls=0;const context={document:{querySelectorAll:()=>[]},fetch:async()=>{calls++;return {ok:true,json:async()=>({files:{}})};}};context.window=context;vm.createContext(context);
  if(first==='ui'){vm.runInContext(ui,context);context.VUUI.logo('NVDA');vm.runInContext(logos,context);}else{vm.runInContext(logos,context);vm.runInContext(ui,context);context.VUUI.logo('NVDA');}
  await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(await context.__vuLogoIndex instanceof Error,false);
 }
});
