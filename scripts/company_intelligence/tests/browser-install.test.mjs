import test from 'node:test';
import assert from 'node:assert/strict';
import {browserInstallPlan,installBrowser} from '../install-browser-deps.mjs';

test('browser setup uses existing signed Ubuntu fallback and exact pinned CLI without weakening tests',()=>{
 const cli='/tmp/ci-live/node_modules/.bin/playwright';
 const plan=browserInstallPlan(cli,['/etc/apt/apt-mirrors.txt','/etc/apt/apt-security-mirrors.txt']);
 assert.equal(plan.length,4);
 assert(plan.slice(0,2).every(s=>s.input==='https://archive.ubuntu.com/ubuntu\n'));
 assert.equal(plan[2].input,'Acquire::http::Timeout "30";\nAcquire::https::Timeout "30";\nAcquire::Retries "1";\n');
 assert.deepEqual(plan[3].args,['--signal=TERM','--kill-after=30s','8m',cli,'install','--with-deps','chromium']);
 assert(!JSON.stringify(plan).includes('AllowUnauthenticated'));
 assert.throws(()=>browserInstallPlan(cli,['/etc/apt/sources.list']),/UNEXPECTED_APT_MIRROR_FILE/);
});
test('dependency errors or timeout stop setup rather than pretending browser QA passed',()=>{
 for(const status of [1,124,null]){
  const calls=[];
  assert.throws(()=>installBrowser('/pinned/playwright',(cmd,args)=>{calls.push({cmd,args});return{status:cmd==='timeout'?status:0};},[]),/BROWSER_SETUP_FAILED/);
  assert.equal(calls.length,2);
 }
 assert.throws(()=>installBrowser('',()=>{throw Error('must not execute')},[]),/PINNED_PLAYWRIGHT_CLI_REQUIRED/);
});
