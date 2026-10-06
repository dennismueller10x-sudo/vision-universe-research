/* VU2 draft persistence delegates definitions, hashes and immutable versions
 * to the existing Strategy engine. No backtest or ranking calculation. */
(function(g){
'use strict';
const node=typeof module!=='undefined'&&module.exports;
const Strategy=node?require('../engines/strategy.js'):g.VUStrategy;
const KEY='vu2.strategy.draft.v1';
function load(storage){const raw=storage.getItem(KEY);if(raw===null)return null;if(raw.length>500000)throw Error('INVALID_SAVED_STRATEGY');let record;try{record=JSON.parse(raw);}catch{throw Error('INVALID_SAVED_STRATEGY');}
 if(!record?.strategy?.strategyId||!Array.isArray(record.versions)||!record.versions.length||record.versions.length>100)throw Error('INVALID_SAVED_STRATEGY');
 for(let i=0;i<record.versions.length;i++){const v=record.versions[i];if(v.version!==i+1||v.strategyId!==record.strategy.strategyId||v.parentVersion!==(i?i:null)||!Strategy.validate(v.definition).valid||v.definitionHash!==Strategy.definitionHash(v.definition))throw Error('INVALID_SAVED_STRATEGY');}
 if(record.strategy.latestVersion!==record.versions.length)throw Error('INVALID_SAVED_STRATEGY');return record;
}
function save(storage,{name,definition,reason}){
 Strategy.assertValid(definition);if(typeof name!=='string'||!name.trim()||name.length>120)throw Error('INVALID_STRATEGY_NAME');
 const previous=load(storage);let record;
 if(previous){if(previous.versions.length>=100)throw Error('VERSION_LIMIT');record=Strategy.addVersion(previous,definition,reason);}
 else record=Strategy.createStrategy({name:name.trim(),definition,origin:'builder',changeReason:typeof reason==='string'&&reason.trim()?reason.trim():'Initiale Version'});
 const serialized=JSON.stringify(record);if(serialized.length>500000)throw Error('SAVED_STRATEGY_SIZE_LIMIT');storage.setItem(KEY,serialized);return record;
}
const api={load,save,key:KEY};if(node)module.exports=api;else g.VUStrategyWorkspace=api;
})(typeof window!=='undefined'?window:globalThis);
