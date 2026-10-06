import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,readdirSync,lstatSync,symlinkSync,linkSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync,spawnSync} from 'node:child_process';
import {generateHandoffKeys,encryptHandoff,decryptHandoff} from '../actions-handoff.mjs';
import {splitEncryptedResult,assembleEncryptedResult,MAX_PART_BYTES} from '../chunk-encrypted-result.mjs';
const keys=generateHandoffKeys(),payload=Buffer.from('PRIVATE_RAW_SOURCE_MUST_STAY_ENCRYPTED\n'.repeat(70));
const envelopeBytes=Buffer.from(JSON.stringify(encryptHandoff(payload,keys.publicKey,'result'))+'\n');
function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'vu-private-cipher-parts-'));try{const input=join(dir,'input.enc.json');writeFileSync(input,envelopeBytes,{mode:0o600});fn({dir,input,out:join(dir,'parts')});}finally{rmSync(dir,{recursive:true,force:true});}}
test('existing real encrypted handoff splits deterministically, assembles byte exactly and decrypts to original private input',()=>fixture(({dir,input,out})=>{
 const one=splitEncryptedResult({input,out,maxPartBytes:1024}),two=splitEncryptedResult({input,out:join(dir,'second'),maxPartBytes:1024});assert.equal(one.chunked,true);assert.ok(one.partCount>=2&&one.partCount<=16);assert.equal(one.sha256,two.sha256);
 for(const name of readdirSync(out)){assert.deepEqual(readFileSync(join(out,name)),readFileSync(join(dir,'second',name)));assert.equal(lstatSync(join(out,name)).mode&0o777,0o600);}assert.equal(lstatSync(out).mode&0o777,0o700);
 const manifest=JSON.parse(readFileSync(one.manifest));assert.equal(manifest.partCount,one.partCount);assert.ok(manifest.parts.every(p=>p.bytes<=1024));assert.deepEqual(Object.keys(manifest).sort(),['partCount','parts','sha256','totalBytes','version']);assert.ok(!readFileSync(one.manifest,'utf8').includes('PRIVATE_RAW_SOURCE'));
 assert.throws(()=>assembleEncryptedResult({manifest:one.manifest,parts:out,out:one.manifest}),/MUST_NOT_REPLACE_SOURCE/);
 const restored=join(dir,'restored.enc.json'),result=assembleEncryptedResult({manifest:one.manifest,parts:out,out:restored});assert.equal(result.sha256,one.sha256);assert.deepEqual(readFileSync(restored),envelopeBytes);assert.deepEqual(decryptHandoff(JSON.parse(readFileSync(restored)),keys.privateKey,'result'),payload);assert.equal(lstatSync(restored).mode&0o777,0o600);
}));
test('small valid ciphertext keeps the original whole-file transport and creates no parts',()=>fixture(({input,out})=>{
 const result=splitEncryptedResult({input,out});assert.equal(result.chunked,false);assert.equal(result.partCount,0);assert.equal(result.manifest,null);assert.throws(()=>lstatSync(out),/ENOENT/);assert.equal(MAX_PART_BYTES,20*1024*1024);
}));
test('raw source, request-purpose envelopes, plaintext extra fields and malformed base64 are never split',()=>fixture(({dir,input,out})=>{
 for(const invalid of [{data:'private raw response'},encryptHandoff(payload,keys.publicKey,'request'),{...JSON.parse(envelopeBytes),raw:'plaintext'}, {...JSON.parse(envelopeBytes),tag:'invalid!'}, {...JSON.parse(envelopeBytes),wrappedKey:'AA=='}]){writeFileSync(input,JSON.stringify(invalid));assert.throws(()=>splitEncryptedResult({input,out,maxPartBytes:1024}),/CIPHER_ENVELOPE_INVALID/);assert.throws(()=>lstatSync(out),/ENOENT/);}
 const duplicate=envelopeBytes.toString().replace('\"version\":','\"version\":\"PRIVATE_RAW_SOURCE\",\"version\":');writeFileSync(input,duplicate);assert.throws(()=>splitEncryptedResult({input,out,maxPartBytes:1024}),/CIPHER_ENVELOPE_INVALID/);
}));
test('tampered/missing parts, reordered/unsafe manifests and total hash mismatch fail before output creation',()=>fixture(({dir,input,out})=>{
 const m=splitEncryptedResult({input,out,maxPartBytes:1024}),original=readFileSync(m.manifest),p=JSON.parse(original),first=join(out,p.parts[0].name),part=readFileSync(first),target=join(dir,'never.enc.json'),assemble=()=>assembleEncryptedResult({manifest:m.manifest,parts:out,out:target});
 const damaged=Buffer.from(part);damaged[0]^=1;writeFileSync(first,damaged);assert.throws(assemble,/PART_SHA_MISMATCH/);writeFileSync(first,part);
 rmSync(first);assert.throws(assemble,/PART_MISSING/);writeFileSync(first,part);
 writeFileSync(m.manifest,JSON.stringify({...p,parts:p.parts.slice().reverse()}));assert.throws(assemble,/MANIFEST_PART_INVALID/);
 writeFileSync(m.manifest,JSON.stringify({...p,parts:[{...p.parts[0],name:'../secret'},...p.parts.slice(1)]}));assert.throws(assemble,/MANIFEST_PART_INVALID/);
 writeFileSync(m.manifest,JSON.stringify({...p,sha256:'0'.repeat(64)}));assert.throws(assemble,/TOTAL_SHA_MISMATCH/);
 writeFileSync(m.manifest,original);assert.throws(()=>lstatSync(target),/ENOENT/);
}));
test('unsafe source/output links, special files and repository output are refused without overwriting originals',()=>fixture(({dir,input,out})=>{
 const symbolic=join(dir,'link.enc.json');symlinkSync(input,symbolic);assert.throws(()=>splitEncryptedResult({input:symbolic,out}),/SYMLINK/);
 const hard=join(dir,'hard.enc.json');linkSync(input,hard);assert.throws(()=>splitEncryptedResult({input:hard,out}),/HARDLINK/);rmSync(hard);
 const pipe=join(dir,'source.pipe');execFileSync('mkfifo',[pipe]);assert.throws(()=>splitEncryptedResult({input:pipe,out}),/FILE_TYPE_REJECTED/);
 const outside=join(dir,'outside');mkdirSync(outside);symlinkSync(outside,out,'dir');assert.throws(()=>splitEncryptedResult({input,out}),/SYMLINK/);rmSync(out);
 assert.throws(()=>splitEncryptedResult({input,out:join(process.cwd(),'.verification','not-allowed')}),/OUTSIDE_REPOSITORY/);
 const split=splitEncryptedResult({input,out,maxPartBytes:1024});const existing=join(dir,'protected.enc.json');writeFileSync(existing,'protected');const alias=join(dir,'protected.alias');linkSync(existing,alias);assert.throws(()=>assembleEncryptedResult({manifest:split.manifest,parts:out,out:existing}),/HARDLINK/);assert.equal(readFileSync(existing,'utf8'),'protected');
}));
test('16-part and 20MiB limits reject unsafe overrides; CLI emits only safe transport metadata',()=>fixture(({dir,input,out})=>{
 assert.throws(()=>splitEncryptedResult({input,out,maxPartBytes:1}),/PART_LIMIT_EXCEEDED/);assert.throws(()=>splitEncryptedResult({input,out,maxPartBytes:MAX_PART_BYTES+1}),/ARGUMENTS_INVALID/);
 const script=new URL('../chunk-encrypted-result.mjs',import.meta.url).pathname;const child=spawnSync(process.execPath,[script,'split','--input',input,'--out='+out,'--max-part-bytes=1024'],{encoding:'utf8'});assert.equal(child.status,0,child.stderr);const metadata=JSON.parse(child.stdout);assert.equal(metadata.chunked,true);assert.ok(!child.stdout.includes('PRIVATE_RAW_SOURCE'));const target=join(dir,'assembled.enc.json');const next=spawnSync(process.execPath,[script,'assemble','--manifest',metadata.manifest,'--parts',out,'--out',target],{encoding:'utf8'});assert.equal(next.status,0,next.stderr);assert.equal(JSON.parse(next.stdout).assembled,true);assert.deepEqual(readFileSync(target),envelopeBytes);
}));
