import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {openSealed,sealedFormat} from '../research/calibration/open-sealed-v3.mjs';
import {sealFileStream} from '../research/calibration/seal-stream-v3.mjs';
import {encryptForOwner} from '../validation/lib.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
test('owner opens both sealed formats with an ephemeral key and the plaintext hash matches',async()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'open-sealed-')),{publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const pub=publicKey.export({type:'spki',format:'pem'}),priv=privateKey.export({type:'pkcs8',format:'pem'});
 const keyFile=path.join(d,'k.pem');fs.writeFileSync(keyFile,priv,{mode:0o600});
 const plain=Buffer.from(JSON.stringify({a:1,rows:Array.from({length:500},(_,i)=>i)}));
 const src=path.join(d,'p.json');fs.writeFileSync(src,plain);
 await sealFileStream({input:src,output:path.join(d,'s.stream.sealed'),recipients:{owner:pub}});
 fs.writeFileSync(path.join(d,'s.env.json'),encryptForOwner(pub,plain));
 assert.equal(sealedFormat(path.join(d,'s.stream.sealed')),'STREAM');assert.equal(sealedFormat(path.join(d,'s.env.json')),'JSON_ENVELOPE');
 for(const [name,fmt] of [['s.stream.sealed','STREAM'],['s.env.json','JSON_ENVELOPE']]){
  const out=path.join(d,'out-'+name),r=await openSealed({input:path.join(d,name),output:out,privateKeyFile:keyFile});
  assert.equal(r.format,fmt);assert.equal(r.plaintextSha256,sha(plain));assert.deepEqual(fs.readFileSync(out),plain);
  await assert.rejects(()=>openSealed({input:path.join(d,name),output:out,privateKeyFile:keyFile}),/OPEN_SEALED_OUTPUT_EXISTS/);
 }
 const other=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
 const wrong=path.join(d,'w.pem');fs.writeFileSync(wrong,other,{mode:0o600});
 await assert.rejects(()=>openSealed({input:path.join(d,'s.env.json'),output:path.join(d,'x1'),privateKeyFile:wrong}));
});
