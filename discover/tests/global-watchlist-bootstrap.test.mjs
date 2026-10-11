import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('direct global watchlist waits for canonical bootstrap before declaring completion',async()=>{
 const list={children:[],append(n){this.children.push(n);}},root={querySelectorAll(){return [];},querySelector(){return list;},append(){}};
 function el(tag,attrs,children=[]){return {tag,attrs,children,querySelector(name){return children.find(c=>c.tag===name);}};}
 const D={GlobalUniverse:{async ready(){await Promise.resolve();D.europePublicLoader={async connect(){D.europeProduct={async saved(){return {data:{members:[{securityId:'ref_2GB_DE_XETR',name:'2G Energy',href:'#/s/EUROPE/ref_2GB_DE_XETR'}]}};}};}};}}};
 const localStorage={getItem(){return JSON.stringify({securityIds:['ref_2GB_DE_XETR']});}},window={VUDiscover:D,QuantShell:{el}};
 vm.runInNewContext(readFileSync(new URL('../ui/global.js',import.meta.url),'utf8'),{window,localStorage});
 await D.GlobalView.watchlist(root,{active:()=>true,route(){}});
 assert.equal(list.children.length,1);
 assert.equal(list.children[0].children[0].attrs.href,'#/s/EUROPE/ref_2GB_DE_XETR');
});
