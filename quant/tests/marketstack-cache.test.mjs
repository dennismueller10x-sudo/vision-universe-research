import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openMarketstackCache,sealMarketstackCache } from '../../scripts/market/marketstack-cache.mjs';
import { openCache } from '../../scripts/market/tiingo2-cache.mjs';
const apiKey=randomBytes(24).toString('hex');
async function fixture(fn){const root=mkdtempSync(join(tmpdir(),'vu-ms-cache-'));try{const workDir=join(root,'marketstack'),file=join(root,'marketstack.enc');mkdirSync(workDir);await fn({root,workDir,file,context:'codex/de-eu',apiKey});}finally{rmSync(root,{recursive:true,force:true});}}
test('marketstack uses existing authenticated archive machinery and preserves source responses privately',async()=>fixture(async options=>{
 const raw='{"providerBody":"private-response","close":12.345}';writeFileSync(join(options.workDir,'raw.json'),raw);
 assert.equal((await sealMarketstackCache(options)).status,'SEALED');assert.equal(readFileSync(options.file).subarray(0,8).toString(),'VUMSENC1');assert.ok(!readFileSync(options.file).includes(Buffer.from(raw)));
 rmSync(options.workDir,{recursive:true});assert.equal((await openMarketstackCache(options)).status,'OPENED');assert.equal(readFileSync(join(options.workDir,'raw.json'),'utf8'),raw);
}));
test('provider separation, credential rotation, context and tamper are sanitized misses',async()=>fixture(async options=>{
 writeFileSync(join(options.workDir,'raw.json'),'current-cache');await sealMarketstackCache(options);
 for(const override of [{apiKey:'wrong-key'},{context:'wrong-branch'}])assert.deepEqual(await openMarketstackCache({...options,...override}),{status:'MISS',reason:'CACHE_UNREADABLE'});
 const tiingo2=join(options.root,'tiingo2');mkdirSync(tiingo2);assert.equal((await openCache({...options,workDir:tiingo2})).status,'MISS');
 const bytes=readFileSync(options.file);bytes[60]^=1;writeFileSync(options.file,bytes);assert.equal((await openMarketstackCache(options)).status,'MISS');assert.equal(readFileSync(join(options.workDir,'raw.json'),'utf8'),'current-cache');
}));
test('marketstack cache rejects secret-bearing bodies and path/credential files',async()=>fixture(async options=>{
 writeFileSync(join(options.workDir,'raw.json'),apiKey);await assert.rejects(sealMarketstackCache(options),/CACHE_AUTH_INPUT_REJECTED/);
 rmSync(join(options.workDir,'raw.json'));writeFileSync(join(options.workDir,'.env'),'auth');await assert.rejects(sealMarketstackCache(options),/CACHE_AUTH_OR_PATH_INPUT_REJECTED/);
}));
