#!/usr/bin/env node
/* Explicit LOCAL refresh/watch after stored price publication. No provider,
   HTTP refresh endpoint, cron registration or deployment mutation. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const A=require('../../quant/engines/weekly-real-adapter.cjs');
function fingerprint(root,ids){
 const files=['quant/config/research-classification-evidence.json','scripts/quant/contracts/weekly-execution-model-v2.json','quant/data/market/security-master/us-security-master.json','quant/data/market/multi-asset/series/SPY.json','quant/data/market/multi-asset/instruments.json','quant/data/market/discover-series/ref_SPY.json',...ids.map(id=>'quant/data/market/discover-series-long/'+id+'.json')];
 for(const dir of ['quant/engines','quant/api','scripts/quant','quant/data/universe/instruments'])for(const file of fs.readdirSync(path.join(root,dir)).filter(f=>/\.(?:cjs|js|json)$/.test(f)).sort())files.push(dir+'/'+file);
 const binary=fs.statSync(process.execPath);return A.hash({runtime:A.calculationRuntime(),executableStamp:[binary.dev,binary.ino,binary.size,binary.mtimeMs,binary.ctimeMs],inputs:files.sort().map(p=>[p,fs.existsSync(path.join(root,p))?A.hash(fs.readFileSync(path.join(root,p),'utf8')):'MISSING'])});
}
function scope(output,ids){
 let prior=null;const pointer=path.join(path.resolve(output),'release.json');if(fs.existsSync(pointer)){const release=JSON.parse(fs.readFileSync(pointer));if(!/^[a-f0-9]{64}$/.test(release.generation||''))throw Error('INVALID_RELEASE');const snapshot=JSON.parse(fs.readFileSync(path.join(path.resolve(output),release.generation,'snapshot.json')));if(A.hash(snapshot.input)!==release.generation)throw Error('INVALID_SNAPSHOT');prior=snapshot.input.sources.map(x=>x.securityId).sort();}
 const selected=ids?Array.from(new Set(ids)).sort():(prior||['ref_NVDA']);if(selected.some(id=>!/^ref_[A-Za-z0-9_.-]{1,80}$/.test(id)))throw Error('INVALID_REFRESH_CONFIGURATION');
 if(prior&&JSON.stringify(prior)!==JSON.stringify(selected))throw Error('SCOPE_CHANGE_REQUIRES_NEW_OUTPUT_DIRECTORY');return selected;
}
function refresh({root=path.resolve(__dirname,'../..'),output,ids=null}={}){
 if(!output)throw Error('INVALID_REFRESH_CONFIGURATION');ids=scope(output,ids);
 // Fresh process on every actual refresh: changed source modules cannot be
 // mislabeled with new code hashes while executing an old require() cache.
 const result=spawnSync(process.execPath,[path.join(root,'scripts/quant/materialize-real-backtest-read.cjs'),'--output',path.resolve(output),'--ids',ids.join(',')],{cwd:root,encoding:'utf8',maxBuffer:1048576});
 if(result.status!==0)throw Error('LOCAL_REFRESH_FAILED_LAST_RELEASE_PRESERVED');return JSON.parse(result.stdout);
}
async function main(){const args=process.argv.slice(2),get=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d,root=path.resolve(__dirname,'../..'),output=get('--output'),ids=scope(output,get('--ids',null)?.split(',')||null),interval=Number(get('--interval-seconds','60'));
 if(!Number.isInteger(interval)||interval<30)throw Error('INVALID_WATCH_INTERVAL');let last=null,stopped=false;
 for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>{stopped=true;});
 do{try{const current=fingerprint(root,ids);if(current!==last){const report=refresh({root,output,ids});last=current;console.log(JSON.stringify({state:report.state,generation:report.generation,calculatedListings:report.calculatedListings,calculationCacheHits:report.calculationCacheHits,computed:report.computed,reused:report.reused}));}}
 catch{console.error('LOCAL_REFRESH_FAILED_LAST_RELEASE_PRESERVED');if(!args.includes('--watch')){process.exitCode=1;return;}}
 if(!args.includes('--watch'))return;
 for(let elapsed=0;elapsed<interval&&!stopped;elapsed++)await new Promise(r=>setTimeout(r,1000));
 }while(!stopped);
}
if(require.main===module)main().catch(()=>{console.error('INVALID_LOCAL_REFRESH_CONFIGURATION');process.exitCode=1;});
module.exports={refresh,fingerprint,scope};
