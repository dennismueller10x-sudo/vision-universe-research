#!/usr/bin/env node
// Closing proof: every Quant test file, original isolation checks and original
// 900s child limit, sequential complete partitions with durable checkpoints.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pruefe } from '../quality/check-test-isolation.mjs';
const require=createRequire(import.meta.url);
const C=require('../../quant/engines/research-contract.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--output'||!args[1])throw Error('PRIVATE_OUTPUT_REQUIRED');
const output=path.resolve(args[1]);
const outside=p=>path.relative(root,p).startsWith('..'+path.sep);
if(!outside(output))throw Error('OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
fs.mkdirSync(output,{recursive:true,mode:0o700});
if(!outside(fs.realpathSync(output)))throw Error('OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
const files=fs.readdirSync(path.join(root,'quant/tests')).filter(f=>f.endsWith('.test.mjs')).sort();
if(!files.length||files.some(f=>! /^[a-z]/.test(f)))throw Error('UNSUPPORTED_TEST_MANIFEST');
const manifest=Object.fromEntries(files.map(f=>['quant/tests/'+f,C.shaFile(path.join(root,'quant/tests',f))]));
const prefixes=[...new Set(files.map(f=>f[0]))].sort();
const report={schemaVersion:'quant-v6-securement-isolation-1.0.0',head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),runtime:C.runtime(),manifest,manifestHash:C.hash(manifest),expectedFiles:files.length,childTimeoutMs:900000,checks:[],state:'RUNNING',productionApproved:false};
const save=()=>{const body={...report,reportHash:C.hash(report)};fs.writeFileSync(path.join(output,'isolation.json.tmp'),JSON.stringify(body,null,2)+'\n',{mode:0o600});fs.renameSync(path.join(output,'isolation.json.tmp'),path.join(output,'isolation.json'));};
save();
for(const prefix of prefixes){
  const suite=`quant/tests/${prefix}*.test.mjs`,selected=files.filter(f=>f.startsWith(prefix));
  console.log('START '+suite+' ('+selected.length+' files)');
  const start=performance.now(),result=pruefe(suite);
  const check={...result,files:selected.map(f=>'quant/tests/'+f),durationMs:performance.now()-start,state:result.ok&&result.testsExitCode===0?'PASS':'FAIL'};
  report.checks.push(check);save();console.log(JSON.stringify({suite,state:check.state,testsExitCode:check.testsExitCode,durationMs:check.durationMs}));
  if(check.state!=='PASS'){report.state='FAIL';save();process.exit(1);}
}
const covered=report.checks.flatMap(c=>c.files);
if(covered.length!==files.length||new Set(covered).size!==files.length)throw Error('INCOMPLETE_OR_DUPLICATE_COVERAGE');
for(const [file,hash] of Object.entries(manifest))if(C.shaFile(path.join(root,file))!==hash)throw Error('TEST_SOURCE_CHANGED_DURING_RUN');
report.state='PASS';report.coveredFiles=covered.length;save();console.log('PASS: complete Quant suite and production isolation, '+covered.length+' files');
