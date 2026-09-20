#!/usr/bin/env node
// Compare the parallel view against the audited production source, including
// uncommitted edits. Never rebuild data while checking preservation.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const baseline=process.env.DISCOVER_BASELINE || '27b045971cb5a96db71646a5e5befe63943b4e5e';
const git=(...args)=>execFileSync('git',args,{maxBuffer:32*1024*1024});
const allowed=path=>/^(discover-v2|scripts\/discover-v2|docs\/discover-v2)\//.test(path)||path==='.github/workflows/discover-v2-ci.yml';
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
console.log(JSON.stringify({status:'PASS',baseline,protectedFiles:checked,discoverTree:git('rev-parse',baseline+':discover').toString().trim(),navigation:'UNCHANGED',preview:'NOINDEX'},null,2));
