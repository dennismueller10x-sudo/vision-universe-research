import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,privateDecrypt,createDecipheriv,constants} from 'node:crypto';
import {boundedPut,encryptedAuthorization,handoff} from '../handoff-transfer.mjs';
const expected={namespace:'accepted-test',rolloutNamespace:'rollout-test',checkpointSha256:'a'.repeat(64),checkpointBytes:30905804};
const env={VU_HISTORY_S3_ENDPOINT:'https://'+'b'.repeat(32)+'.r2.cloudflarestorage.com',VU_HISTORY_S3_BUCKET:'private-test',VU_HISTORY_S3_ACCESS_KEY_ID:'test-id',VU_HISTORY_S3_SECRET_ACCESS_KEY:'not-a-real-secret'};
test('authorization binds exact archive hash, size, method, path and immutable create',()=>{
 const stamp=new Date('2026-10-07T10:00:00Z');const t=boundedPut(expected,env,stamp);
 assert.equal(t.method,'PUT');assert.equal(t.headers['if-none-match'],'*');assert.equal(t.headers['content-length'],'30905804');assert.equal(t.headers['x-amz-content-sha256'],expected.checkpointSha256);
 assert(t.url.endsWith('/accepted-test/incoming-'+expected.checkpointSha256+'.tar.gz'));assert.equal(t.expiresAt,'2026-10-07T10:10:00.000Z');assert(!JSON.stringify(t).includes(env.VU_HISTORY_S3_SECRET_ACCESS_KEY));
 for(const altered of [{...expected,checkpointSha256:'c'.repeat(64)},{...expected,checkpointBytes:3},{...expected,namespace:'other'}])assert.notEqual(t.headers.authorization,boundedPut(altered,env,stamp).headers.authorization);
 assert.throws(()=>boundedPut(expected,{...env,VU_HISTORY_S3_ENDPOINT:'https://public.example.com'}));
});
test('capability artifact requires matching private key and authenticated ciphertext',()=>{
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});const e=encryptedAuthorization({authorization:'SENSITIVE_SCOPE_ONLY'},publicKey);
 assert(!JSON.stringify(e).includes('SENSITIVE_SCOPE_ONLY'));
 const key=privateDecrypt({key:privateKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(e.key,'base64'));
 const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));cipher.setAuthTag(Buffer.from(e.tag,'base64'));assert.equal(JSON.parse(Buffer.concat([cipher.update(Buffer.from(e.ciphertext,'base64')),cipher.final()])).authorization,'SENSITIVE_SCOPE_ONLY');
 const other=generateKeyPairSync('rsa',{modulusLength:2048});assert.throws(()=>privateDecrypt({key:other.privateKey,oaepHash:'sha256'},Buffer.from(e.key,'base64')));
});
test('different accepted pointer blocks issuance without any object mutation',async()=>{
 const calls=[];const driver={get:async key=>{calls.push('get');return key.includes('/accepted-test/')?Buffer.from(JSON.stringify({schema:1,slot:0,sha256:'b'.repeat(64),bytes:60000000})):null;},head:async()=>null,put:async()=>{calls.push('put');}};
 await assert.rejects(handoff('issue',{driver,expected,output:'/unused',env}),/ACCEPTED_NAMESPACE_ALREADY_HAS_DIFFERENT_STATE/);assert(!calls.includes('put'));
});

test('richer original rollout is inspected and preserved; ticket never updates either pointer',async()=>{
 const temp=mkdtempSync(join(tmpdir(),'handoff-'));
 try {
  const calls=[];const driver={get:async key=>{calls.push(['get',key]);return key.includes('/rollout-test/')?Buffer.from(JSON.stringify({schema:1,slot:1,sha256:'b'.repeat(64),bytes:60000000,updatedAt:'2026-10-08T00:00:00Z'})):null;},head:async key=>{calls.push(['head',key]);return null;},put:async()=>calls.push(['put'])};
  const output=join(temp,'envelope.json');const result=await handoff('issue',{driver,expected,output,env});
  assert.equal(result.remotePointers['rollout-test'].status,'DIFFERENT_PRESERVED');assert(!calls.some(([method])=>method==='put'));
  const artifact=JSON.parse(readFileSync(output));assert.equal(artifact.status,'ENCRYPTED_EXACT_PUT_AUTHORIZATION');assert(!JSON.stringify(artifact).includes(env.VU_HISTORY_S3_ACCESS_KEY_ID));
 } finally {rmSync(temp,{recursive:true,force:true});}
});
