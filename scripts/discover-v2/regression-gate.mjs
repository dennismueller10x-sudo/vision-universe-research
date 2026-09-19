#!/usr/bin/env node
// Compare the parallel view against the audited production source, including
// uncommitted edits. Never rebuild data while checking preservation.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const baseline=process.env.DISCOVER_BASELINE || 'e4bcd8e1a89687078cea4dd77c89d5c1ebbcaf93';
const git=(...args)=>execFileSync('git',args,{maxBuffer:32*1024*1024});
const protectedPaths=['discover','quant','providers','scripts/market','scripts/quant','scripts/technical'];
const files=git('ls-tree','-r','--name-only',baseline,'--',...protectedPaths).toString().trim().split('\n').filter(Boolean);
const changed=git('diff','--name-only',baseline,'--',...protectedPaths).toString().trim();
assert.equal(changed,'','Canonical/Discover 1.0 files modified: '+changed);
const checked=files.length;
const navPath='assets/site-navigation.js';
const before=git('show',baseline+':'+navPath).toString();
const after=readFileSync(navPath,'utf8');
const entry=/^.*\['Discover 2\.0',\s*'\/discover-v2\/'\],?\s*\n/gm;
assert.equal((after.match(entry)||[]).length,1,'Exactly one Discover 2.0 navigation entry required');
assert.equal(after.replace(entry,''),before,'Shared navigation changes must only add Discover 2.0');
const html=readFileSync('discover-v2/index.html','utf8');
assert(/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html),'Preview must be noindex');
assert(/<vu-navigation[\s>]/i.test(html),'Shared navigation required');
assert(html.includes('/assets/site-navigation.css'),'Shared navigation CSS required');
assert(/lang=["']de["']/.test(html),'German document language required');
console.log(JSON.stringify({status:'PASS',baseline,protectedFiles:checked,discoverTree:git('rev-parse',baseline+':discover').toString().trim(),navigation:'ONLY_AUTHORIZED_ENTRY',preview:'NOINDEX'},null,2));
