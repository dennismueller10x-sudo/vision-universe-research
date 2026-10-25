#!/usr/bin/env node
/* Offline comparison of repeated and shared master parsing; no result tuning. */
const fs=require('node:fs'),path=require('node:path'),A=require('../../quant/engines/weekly-real-adapter.cjs');
const root=path.resolve(__dirname,'../..');
const ids=fs.readdirSync(path.join(root,'quant/data/market/discover-series-long')).filter(x=>/^ref_.*\.json$/.test(x)).sort().slice(0,25).map(x=>x.slice(0,-5));
function measure(load){const start=performance.now();const fingerprints=ids.map(id=>{try{return load(id).sourceBytesHash;}catch(e){return e.message;}});return {ms:performance.now()-start,fingerprints};}
const repeated=measure(id=>A.load(root,id)),start=performance.now(),loader=A.createLoader(root),setup=performance.now()-start,shared=measure(loader);
const identical=JSON.stringify(repeated.fingerprints)===JSON.stringify(shared.fingerprints);
if(!identical)throw Error('LOADER_RESULT_CHANGED');
console.log(JSON.stringify({listings:ids.length,repeatedMasterLoadMs:repeated.ms,sharedMasterLoadMs:setup+shared.ms,identical,sharedMasterSetupMs:setup}));
