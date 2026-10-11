import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import{fileURLToPath}from 'node:url';
import{methods,rulebook,historicalParticipants,dataBlocked}from './methods.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../../../..');
export const hash=buf=>crypto.createHash('sha256').update(buf).digest('hex');
const relevantFiles=()=>['accounting.mjs','data.mjs','runner.mjs','metrics.mjs','methods.mjs','run.mjs','protocol.json','freeze.mjs','session-public-key.pem',...fs.readdirSync(path.join(dir,'engines')).filter(f=>f.endsWith('.mjs')).map(f=>'engines/'+f)];
export function createFreeze(){
 const files=Object.fromEntries(relevantFiles().map(f=>[f,hash(fs.readFileSync(path.join(dir,f)))]));
 const dependencyPaths=['core/identity.js','quant/engines/canonical-total-return.js','quant/engines/return-series.js','quant/engines/history-store.js','quant/engines/bar-codec.js','quant/engines/zero-cost-guard.js','quant/engines/us-security-master.js','quant/engines/instrument-classification.js','scripts/market/storage/s3-driver.mjs','scripts/supertrader/validation/lib.mjs','scripts/supertrader/validation/results-public-key.pem'];
 const dependencies=Object.fromEntries(dependencyPaths.map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]));
 return{schema:'supertrader-method-freezes-1.0.0',frozenAt:new Date().toISOString(),codeCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),frozenBeforePerformance:true,protocolHash:files['protocol.json'],files,dependencies,methods:methods.map(m=>({id:m.id,version:m.version||'1.0.0',rulebookHash:hash(JSON.stringify(rulebook(m))),rulebook:rulebook(m),historicalAdmission:historicalParticipants.some(p=>p.id===m.id)?'ADMITTED_RESEARCH_ADAPTATION':'BLOCKED_DATA',dataRequirements:m.dataContract||m.dataRequirements||m.missingSourceComponents||null})),dataBlocked};
}
export function assertFreeze(freeze){
 if(!freeze?.frozenBeforePerformance)throw new Error('PRE_PERFORMANCE_FREEZE_REQUIRED');
 for(const[file,want]of Object.entries(freeze.files||{}))if(hash(fs.readFileSync(path.join(dir,file)))!==want)throw new Error('FROZEN_CODE_CHANGED');
 for(const[file,want]of Object.entries(freeze.dependencies||{}))if(hash(fs.readFileSync(path.join(root,file)))!==want)throw new Error('FROZEN_DEPENDENCY_CHANGED');
 for(const m of methods){const f=freeze.methods.find(f=>f.id===m.id);if(!f||f.rulebookHash!==hash(JSON.stringify(rulebook(m))))throw new Error('FROZEN_RULEBOOK_CHANGED');}
 return true;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const out=process.argv[process.argv.indexOf('--out')+1];if(!out||!process.argv.includes('--out'))throw new Error('EXPLICIT_OUT_REQUIRED');
 const freeze=createFreeze();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'SUPERTRADER-METHOD-FREEZES.json'),JSON.stringify(freeze,null,2)+'\n');console.log(JSON.stringify({status:'FROZEN',methods:freeze.methods.length}));
}
