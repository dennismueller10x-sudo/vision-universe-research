import fs from 'node:fs';
import path from 'node:path';
import {spawnSync}from 'node:child_process';
import{fileURLToPath}from 'node:url';
import{encryptForOwner}from '../../validation/lib.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),out=process.argv[process.argv.indexOf('--out')+1];if(!out||!process.argv.includes('--out'))throw new Error('EXPLICIT_OUT_REQUIRED');
fs.mkdirSync(out,{recursive:true});
const commands=[['core','node',['--test','core/tests/*.test.mjs']],['quant','node',['--test','quant/tests/*.test.mjs']],['products','node',['--test','discover/tests/*.test.mjs','scripts/supertrader/tests/*.test.mjs','screener/tests/*.test.mjs']],['python','python3',['-m','unittest','discover','-s','scripts/quant/tests','-p','test_*.py']],['isolation','node',['scripts/quality/check-test-isolation.mjs']]];
const status=[],logs=[];
for(const[name,command,args]of commands){const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:64*1024*1024});status.push({suite:name,exitCode:r.status??-1,passed:r.status===0});logs.push({suite:name,stdout:r.stdout,stderr:r.stderr,exitCode:r.status});console.log(JSON.stringify(status.at(-1)));}
const report={status:status.every(s=>s.passed)?'PASS':'FAIL',suites:status};fs.writeFileSync(path.join(out,'regression-status.json'),JSON.stringify(report,null,2)+'\n');
for(const[tag,key]of [['owner','../../validation/results-public-key.pem'],['session','session-public-key.pem']])fs.writeFileSync(path.join(out,`regression.${tag}.sealed.json`),encryptForOwner(fs.readFileSync(path.join(dir,key),'utf8'),Buffer.from(JSON.stringify({report,logs}))));
if(report.status!=='PASS')process.exitCode=1;
