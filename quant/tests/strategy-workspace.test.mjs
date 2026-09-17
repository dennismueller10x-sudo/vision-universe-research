import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Workspace=require('../api/strategy-workspace.js'),Strategy=require('../engines/strategy.js'),Screen=require('../api/screener-workspace.js');
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}};
test('Screener filters retain canonical Strategy semantics and immutable versions',()=>{
 const q=Screen.build([{field:'momentum6m',operator:'gte',value:10,scale:'raw'},{field:'revenueGrowth',operator:'gte',value:20,scale:'raw'}]);const d=Strategy.createDefinition({filters:q.filters});assert.deepEqual(d.filters,q.filters);const store=memory(),first=Workspace.save(store,{name:'Momentum',definition:d,reason:'Meine Ausgangsthese'});assert.equal(first.versions[0].changeReason,'Meine Ausgangsthese');
 const next=Strategy.createDefinition({...d,execution:{...d.execution,slippageBps:10}});const second=Workspace.save(store,{name:'Momentum',definition:next,reason:'Mehr Slippage'});assert.equal(second.strategy.latestVersion,2);assert.deepEqual(second.versions[0],first.versions[0]);assert.equal(second.versions[1].parentVersion,1);assert.deepEqual(Workspace.load(store),second);
});
test('invalid weights, unchanged versions and missing change reasons do not overwrite history',()=>{
 const store=memory(),def=Strategy.defaults();Workspace.save(store,{name:'Idee',definition:def});const before=store.getItem(Workspace.key);assert.throws(()=>Workspace.save(store,{name:'Idee',definition:def,reason:'gleich'}),/identical/);assert.throws(()=>Workspace.save(store,{name:'Idee',definition:Strategy.createDefinition({...def,rebalance:'monthly'}),reason:''}),/changeReason/);assert.throws(()=>Workspace.save(store,{name:'Idee',definition:Strategy.createDefinition({...def,ranking:{factors:[{factor:'quality',weight:0.2}]}}),reason:'invalid'}));assert.equal(store.getItem(Workspace.key),before);
});
test('corrupt saved data and failed storage writes are explicit failures',()=>{
 const store=memory();store.setItem(Workspace.key,'broken');assert.throws(()=>Workspace.load(store),/INVALID_SAVED/);assert.throws(()=>Workspace.save(store,{name:'Idee',definition:Strategy.defaults()}));assert.equal(store.getItem(Workspace.key),'broken');assert.throws(()=>Workspace.save({getItem:()=>null,setItem:()=>{throw Error('quota')}},{name:'Idee',definition:Strategy.defaults()}),/quota/);
});
