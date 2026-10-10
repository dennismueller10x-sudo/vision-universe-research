import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const draft=new URL('../ui/microchart.js',import.meta.url);
class Node {
  constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.textContent='';}
  setAttribute(k,v){this.attrs[k]=String(v);}
  appendChild(child){this.children.push(child);return child;}
}
function load(path){
  const context=vm.createContext({document:{createElementNS:(_ns,tag)=>new Node(tag)}});
  context.window=context;
  vm.runInContext(fs.readFileSync(path,'utf8'),context);
  return context.VUDiscover.MicroChart;
}
function serialized(node){return JSON.stringify(node,(k,v)=>k.startsWith('__')?undefined:v);}
const points=[['2026-07-01',100],['2026-07-03',103],['2026-07-20',99],['2026-07-22',101]];
const options={symbol:'FIXTURE',range:'1Y',width:720,height:300};
test('undefined segments preserves exact original US SVG output',()=>{
  assert.equal(createHash('sha256').update(serialized(load(draft).renderRange(points,options))).digest('hex'),'ebb2cf83e66e21bfff8c555116d1b68e70033f540035ccc7dc0a6b53a5bd3be3');
});
test('gap renders separate line moves and closed fills with accessible disclosure',()=>{
  const svg=load(draft).renderRange(points,{...options,segments:[points.slice(0,2),points.slice(2)]});
  const paths=svg.children.filter(x=>x.tag==='path');
  assert.equal((paths[1].attrs.d.match(/M/g)||[]).length,2);
  assert.equal((paths[1].attrs.d.match(/L/g)||[]).length,2);
  assert.equal((paths[0].attrs.d.match(/Z/g)||[]).length,2);
  assert.equal(svg.attrs['data-segment-count'],'2');
  assert.match(svg.attrs['aria-label'],/Datenlücken/);
  assert.equal(svg.__punkte.length,4);
});
test('selected viewport preserves source segment split without inventing missing points',()=>{
  const svg=load(draft).renderRange(points.slice(1,3),{...options,segments:[points.slice(0,2),points.slice(2)]});
  const path=svg.children.find(x=>x.attrs.class==='dx-art-line dx-range-line');
  assert.equal((path.attrs.d.match(/M/g)||[]).length,2);
  assert.equal((path.attrs.d.match(/L/g)||[]).length,0);
});
test('foreign segment tuple cannot authorize a drawn price',()=>{
  assert.equal(load(draft).renderRange(points,{...options,segments:[points.map(p=>[p[0],p[1]+1])]}),null);
});
