#!/usr/bin/env node
// Compare the parallel view against the audited production source, including
// uncommitted edits. Never rebuild data while checking preservation.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const baseline=process.env.DISCOVER_BASELINE || 'c84caa38382022a6bd65fc00df0ec20389bc96e1';
const git=(...args)=>execFileSync('git',args,{maxBuffer:32*1024*1024});
const allowedPaths=new Set([
  'discover-v2/app.css','discover-v2/app.js','discover-v2/detail.css','discover-v2/detail.js',
  'discover-v2/home.css','discover-v2/home.js','discover-v2/index.html',
  'scripts/discover-v2/browser-qa.mjs','scripts/discover-v2/contract-qa.mjs','scripts/discover-v2/regression-gate.mjs',
  'docs/discover-v2/premium-orchestration.md','docs/discover-v2/premium-contract-audit.md',
  'docs/discover-v2/premium-design-qa.md'
]);
const allowed=path=>allowedPaths.has(path);
const files=git('ls-tree','-r','--name-only',baseline).toString().trim().split('\n').filter(path=>path&&!allowed(path));
const changed=git('diff','--name-only',baseline).toString().trim().split('\n').filter(path=>path&&!allowed(path));
const untracked=git('ls-files','--others','--exclude-standard').toString().trim().split('\n').filter(path=>path&&!allowed(path));
assert.deepEqual([...changed,...untracked],[],'Files outside the isolated preview changed');
const checked=files.length;
const navPath='assets/site-navigation.js';
const before=git('show',baseline+':'+navPath).toString();
const after=readFileSync(navPath,'utf8');
const entry=/^.*\['Discover 2\.0',\s*'\/discover-v2\/'\],?\s*\n/gm;
assert.equal((after.match(entry)||[]).length,1,'Exactly one Discover 2.0 navigation entry required');
assert.equal(after,before,'Shared navigation must remain identical to production baseline');
const html=readFileSync('discover-v2/index.html','utf8');
assert(/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html),'Preview must be noindex');
assert(/<vu-navigation[\s>]/i.test(html),'Shared navigation required');
assert(html.includes('/assets/site-navigation.css'),'Shared navigation CSS required');
assert(/lang=["']de["']/.test(html),'German document language required');
const permittedChanged=git('diff','--name-only',baseline).toString().trim().split('\n').filter(Boolean).filter(allowed);
const contractGate=JSON.parse(execFileSync(process.execPath,['scripts/discover-v2/contract-qa.mjs'],{maxBuffer:4*1024*1024}).toString());
assert.match(contractGate.status,/^PASS/,'Discover 2.1 contract gate failed');
console.log(JSON.stringify({status:'PASS',baseline,protectedFiles:checked,protectedDiscoverTree:git('rev-parse',baseline+':discover').toString().trim(),allowedPaths:[...allowedPaths].sort(),permittedChanged,navigation:'UNCHANGED',preview:'NOINDEX',contractGate:{status:contractGate.status,b1:contractGate.b1,b2:contractGate.b2,b3:contractGate.b3,b4:contractGate.b4,b5:contractGate.b5,zeroCost:contractGate.zeroCost,ownerReview:contractGate.ownerReview}},null,2));
