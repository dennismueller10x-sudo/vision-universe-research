import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { openCache, sealCache, validateCacheArchive } from '../../scripts/market/tiingo2-cache.mjs';

const apiKey=randomBytes(24).toString('hex'),context='codex/tiingo2-tests';
async function fixture(fn){const root=mkdtempSync(join(tmpdir(),'vu-encrypted-cache-'));try{
 const workDir=join(root,'tiingo2'),file=join(root,'tiingo2-cache.enc');mkdirSync(workDir);await fn({root,workDir,file,context,apiKey});
}finally{rmSync(root,{recursive:true,force:true});}}
function archiveEntry(name,{type='0',data='private provider body',link=''}={}){
 const h=Buffer.alloc(512),body=Buffer.from(data),size=type==='0'?body.length:0;
 h.write(name,0,100);h.write('0000600\0',100,8);h.write('0000000\0',108,8);h.write('0000000\0',116,8);
 h.write(size.toString(8).padStart(11,'0')+'\0',124,12);h.write('00000000000\0',136,12);h.fill(32,148,156);
 h.write(type,156,1);h.write(link,157,100);h.write('ustar\0',257,6);h.write('00',263,2);
 const checksum=h.reduce((sum,x)=>sum+x,0);h.write(checksum.toString(8).padStart(6,'0')+'\0 ',148,8);
 return Buffer.concat([h,type==='0'?body:Buffer.alloc(0),Buffer.alloc((512-size%512)%512),Buffer.alloc(1024)]);
}
function authenticatedArchive(file,tar){
 const salt=randomBytes(32),nonce=randomBytes(12),header=Buffer.concat([Buffer.from('VUT2ENC1'),salt,nonce]);
 const key=Buffer.from(hkdfSync('sha256',Buffer.from(apiKey),salt,Buffer.from('vision-universe/tiingo2-private-cache/aes256gcm/v1\0'+context),32));
 const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(header);
 writeFileSync(file,Buffer.concat([header,cipher.update(gzipSync(tar)),cipher.final(),cipher.getAuthTag()]));
}

test('encrypted private cache roundtrips nested provider files and uses randomized authenticated ciphertext',async()=>fixture(async options=>{
 const payload=JSON.stringify({ticker:'DNA',prices:[12.375,24.125],internal:'licensed-provider-body'});
 mkdirSync(join(options.workDir,'evidence'));writeFileSync(join(options.workDir,'evidence/rows.json'),payload);
 writeFileSync(join(options.workDir,'index.json'),'private-cache-index');
 assert.equal((await sealCache(options)).status,'SEALED');const first=readFileSync(options.file);
 assert.ok(!first.includes(Buffer.from(payload)));assert.equal(statSync(options.file).mode&0o777,0o600);
 assert.equal((await sealCache(options)).status,'SEALED');assert.notDeepEqual(readFileSync(options.file),first);
 rmSync(options.workDir,{recursive:true});assert.equal((await openCache(options)).status,'OPENED');
 assert.equal(readFileSync(join(options.workDir,'evidence/rows.json'),'utf8'),payload);
 assert.equal(readFileSync(join(options.workDir,'index.json'),'utf8'),'private-cache-index');
}));

for(const mutation of ['wrong-key','wrong-context','tamper','salt-tamper','nonce-tamper','tag-tamper','magic-tamper','truncation']){
 test(`${mutation} is a sanitized cache miss and preserves existing plaintext`,async()=>fixture(async options=>{
  writeFileSync(join(options.workDir,'index.json'),'old-cache');await sealCache(options);
  writeFileSync(join(options.workDir,'index.json'),'current-cache');let params=options;
  if(mutation==='wrong-key')params={...options,apiKey:randomBytes(24).toString('hex')};
  if(mutation==='wrong-context')params={...options,context:'different-branch'};
  if(mutation==='tamper'){const bytes=readFileSync(options.file);bytes[60]^=1;writeFileSync(options.file,bytes);}
  if(['salt-tamper','nonce-tamper','tag-tamper','magic-tamper'].includes(mutation)){const bytes=readFileSync(options.file);const offset={'salt-tamper':12,'nonce-tamper':42,'tag-tamper':bytes.length-1,'magic-tamper':1}[mutation];bytes[offset]^=1;writeFileSync(options.file,bytes);}
  if(mutation==='truncation')writeFileSync(options.file,readFileSync(options.file).subarray(0,40));
  const result=await openCache(params);assert.deepEqual(result,{status:'MISS',reason:'CACHE_UNREADABLE'});
  assert.equal(readFileSync(join(options.workDir,'index.json'),'utf8'),'current-cache');
  assert.ok(readdirSync(options.root).every(name=>!name.startsWith('.tiingo2-open-')));
 }));
}

test('an absent encrypted cache is a normal miss',async()=>fixture(async options=>{
 writeFileSync(join(options.workDir,'index.json'),'current-cache');
 assert.deepEqual(await openCache(options),{status:'MISS',reason:'CACHE_ABSENT'});
 assert.equal(readFileSync(join(options.workDir,'index.json'),'utf8'),'current-cache');
}));

test('seal rejects symlinks without exposing target content or replacing prior ciphertext',async()=>fixture(async options=>{
 writeFileSync(join(options.workDir,'index.json'),'safe-input');await sealCache(options);const initial=readFileSync(options.file);
 const outside=join(options.root,'outside');writeFileSync(outside,'private-outside-file');symlinkSync(outside,join(options.workDir,'alias'));
 await assert.rejects(sealCache(options),/CACHE_LINK_INPUT_REJECTED/);assert.deepEqual(readFileSync(options.file),initial);
}));

for(const name of ['.env','credentials.json','config.key']){
 test(`seal rejects authentication input ${name}`,async()=>fixture(async options=>{
  writeFileSync(join(options.workDir,name),'authentication-input');await assert.rejects(sealCache(options),/AUTH_OR_PATH_INPUT_REJECTED/);
 }));
}
test('seal rejects configured credential bytes even in an ordinary provider JSON filename',async()=>fixture(async options=>{
 writeFileSync(join(options.workDir,'rows.json'),JSON.stringify({authorization:apiKey}));
 await assert.rejects(sealCache(options),/CACHE_AUTH_INPUT_REJECTED/);
}));

test('seal detects credential content spanning input stream chunks',async()=>fixture(async options=>{
 writeFileSync(join(options.workDir,'rows.json'),Buffer.concat([Buffer.alloc(65536-apiKey.length/2,65),Buffer.from(apiKey),Buffer.alloc(100,66)]));
 await assert.rejects(sealCache(options),/CACHE_AUTH_INPUT_REJECTED/);
}));

test('source symlink ancestors are rejected before sealing or opening',async()=>fixture(async options=>{
 const alias=join(options.root,'alias');symlinkSync(options.root,alias,'dir');
 await assert.rejects(sealCache({...options,workDir:join(alias,'tiingo2')}),/CACHE_PATH_SYMLINK_REJECTED/);
 await assert.rejects(openCache({...options,workDir:join(alias,'tiingo2')}),/CACHE_PATH_SYMLINK_REJECTED/);
}));

test('ciphertext destination symlink ancestors cannot overwrite an external file',async()=>fixture(async options=>{
 const actual=join(options.root,'actual'),alias=join(options.root,'alias');mkdirSync(actual);symlinkSync(actual,alias,'dir');
 const filename='tiingo2-cache.enc';writeFileSync(join(actual,filename),'protected-existing-ciphertext');
 await assert.rejects(sealCache({...options,file:join(alias,filename)}),/CACHE_PATH_SYMLINK_REJECTED/);
 await assert.rejects(openCache({...options,file:join(alias,filename)}),/CACHE_PATH_SYMLINK_REJECTED/);
 assert.equal(readFileSync(join(actual,filename),'utf8'),'protected-existing-ciphertext');
}));

test('archive input read failures reject without uncaught stream errors',async()=>fixture(async options=>{
 await assert.rejects(validateCacheArchive(join(options.root,'missing.tar.gz'),apiKey),/ENOENT/);
}));

for(const entry of [{name:'tiingo2/../outside.txt'},{name:'/tiingo2/outside.txt'},{name:'tiingo2/link',type:'2',link:'../outside.txt'},{name:'tiingo2/hardlink',type:'1',link:'../outside.txt'},{name:'tiingo2/.env'}]){
 test(`authenticated unsafe archive entry ${entry.name} (${entry.type||'file'}) never extracts`,async()=>fixture(async options=>{
  writeFileSync(join(options.workDir,'index.json'),'current-cache');authenticatedArchive(options.file,archiveEntry(entry.name,entry));
  assert.equal((await openCache(options)).status,'MISS');
  assert.equal(readFileSync(join(options.workDir,'index.json'),'utf8'),'current-cache');
  assert.ok(!readdirSync(options.root).includes('outside.txt'));
 }));
}

test('CLI accepts credentials only through environment and never prints supplied auth arguments',async()=>fixture(async options=>{
 const script=join(dirname(fileURLToPath(import.meta.url)),'../../scripts/market/tiingo2-cache.mjs');
 let output='';try{execFileSync(process.execPath,[script,'seal','--api-key',apiKey],{encoding:'utf8',stdio:'pipe',env:{...process.env,TIINGO_API_KEY:apiKey}});assert.fail('Auth argument accepted');}
 catch(error){output=String(error.stdout)+String(error.stderr);assert.equal(error.status,1);}
 assert.ok(!output.includes(apiKey));assert.match(output,/encrypted cache operation failed/);
}));
