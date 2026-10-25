#!/usr/bin/env node
/* Explicit local operator rollback; no network endpoint or scheduler. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {withWriterLock}=require('./materialize-real-backtest-read.cjs'),A=require('../../quant/engines/weekly-real-adapter.cjs'),C=require('../../quant/api/real-backtest-contract.js');
function rollback({output,generation}={}){
 if(!/^[a-f0-9]{64}$/.test(generation||''))throw Error('INVALID_GENERATION');
 return withWriterLock({output},()=>{
  const base=path.join(path.resolve(output),generation),release=JSON.parse(fs.readFileSync(path.join(base,'release.json')));
  if(release.generation!==generation||release.schemaVersion!==C.VERSION||release.certification!=='NOT_CERTIFIED'||release.publiclyActivated!==false)throw Error('INVALID_ROLLBACK_RELEASE');
  const snapshot=JSON.parse(fs.readFileSync(path.join(base,'snapshot.json')));
  if(snapshot.generation!==generation||A.hash(snapshot.input)!==generation)throw Error('INVALID_ROLLBACK_SNAPSHOT');
  const same=(a,b)=>JSON.stringify(a||null)===JSON.stringify(b||null);
  if(snapshot.computedAt!==release.computedAt||!same(snapshot.input.model,release.executionModel)||!same(snapshot.input.calculationRuntime,release.calculationRuntime))throw Error('INVALID_ROLLBACK_BINDING');
  let count=0;
  for(const [key,hash] of Object.entries(release.shards)){
   if(!/^[A-Z0-9._-]{2}$/.test(key))throw Error('INVALID_SHARD');const shard=JSON.parse(fs.readFileSync(path.join(base,'index',key+'.json')));if(A.hash(shard)!==hash)throw Error('INVALID_SHARD_HASH');
   for(const [id,expected] of Object.entries(shard.entries)){
    if(!C.safeId(id))throw Error('INVALID_SECURITY_ID');const folder=path.join(base,'listings',id),s=JSON.parse(fs.readFileSync(path.join(folder,'summary.json'))),{summaryHash,...raw}=s;
    if(A.hash(raw)!==summaryHash||summaryHash!==expected||C.summaryViolations(s,id,generation).length)throw Error('INVALID_ROLLBACK_SUMMARY');
    if(s.computedAt!==release.computedAt||!same(s.executionModel,release.executionModel)||!same(s.calculationRuntime,release.calculationRuntime))throw Error('INVALID_ROLLBACK_BINDING');
    for(const [period,r] of Object.entries(s.periods))for(const section of ['equity','trades']){const bytes=fs.readFileSync(path.join(folder,period+'-'+section+'.json.gz'));if(bytes.length>262144)throw Error('PAYLOAD_LIMIT');const detail=JSON.parse(zlib.gunzipSync(bytes,{maxOutputLength:2097152}));if(A.hash(detail)!==r.details[section].hash||C.detailViolations(detail,s,period,section).length)throw Error('INVALID_ROLLBACK_DETAIL');}count++;
   }
  }
  if(count!==release.expected)throw Error('INCOMPLETE_ROLLBACK_GENERATION');
  const pointer=path.join(path.resolve(output),'release.json');fs.writeFileSync(pointer+'.tmp',JSON.stringify(release)+'\n');fs.renameSync(pointer+'.tmp',pointer);return {state:'ROLLED_BACK',generation,verifiedListings:count,certification:'NOT_CERTIFIED'};
 });
}
if(require.main===module){const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];try{console.log(JSON.stringify(rollback({output:get('--output'),generation:get('--generation')})));}catch{console.error('ROLLBACK_FAILED_LAST_RELEASE_PRESERVED');process.exitCode=1;}}
module.exports={rollback};
