import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sealFileStream,openFileStream} from '../research/calibration/seal-stream-v3.mjs';
const pair=()=>crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
test('streaming envelope round-trips for each recipient, hashes match, wrong key and tampering fail',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-')),owner=pair(),session=pair(),other=pair();
 try{
  const src=path.join(dir,'p.json');const big=Buffer.from(JSON.stringify({rows:Array.from({length:60000},(_,i)=>({i,v:'x'.repeat(i%17),r:Math.sin(i)}))}));fs.writeFileSync(src,big);
  const sealed=path.join(dir,'p.sealed'),r=await sealFileStream({input:src,output:sealed,recipients:{owner:owner.publicKey,session:session.publicKey}});
  assert.equal(r.plaintextBytes,big.length);assert.equal(r.plaintextSha256,crypto.createHash('sha256').update(big).digest('hex'));assert.equal(r.sealedSha256,crypto.createHash('sha256').update(fs.readFileSync(sealed)).digest('hex'));
  assert.ok(fs.statSync(sealed).size<big.length/2);assert.equal(fs.readFileSync(sealed).includes(Buffer.from('"rows"')),false);
  for(const [aud,k] of [['owner',owner],['session',session]]){const o=await openFileStream({input:sealed,output:path.join(dir,aud+'.out'),audience:aud,privateKeyPem:k.privateKey});assert.equal(o.plaintextSha256,r.plaintextSha256);assert.deepEqual(fs.readFileSync(path.join(dir,aud+'.out')),big);}
  await assert.rejects(openFileStream({input:sealed,output:path.join(dir,'x.out'),audience:'owner',privateKeyPem:other.privateKey}));
  const bad=Buffer.from(fs.readFileSync(sealed));bad[bad.length-40]^=1;fs.writeFileSync(path.join(dir,'bad.sealed'),bad);
  await assert.rejects(openFileStream({input:path.join(dir,'bad.sealed'),output:path.join(dir,'y.out'),audience:'owner',privateKeyPem:owner.privateKey}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
