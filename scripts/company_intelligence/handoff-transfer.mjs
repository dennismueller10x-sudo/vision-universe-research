/* Exact-byte private handoff through the existing Actions R2 bindings.
   Only a short-lived, hash/length/key-bound PUT authorization leaves the runner,
   encrypted to the workspace public key. No secret key, DB or archive artifact.
   Existing rollout pointers are read only; the accepted checkpoint gets its own
   two-slot namespace. The complete checkpoint is always verified before sync. */
import { createHash, randomBytes, createCipheriv, publicEncrypt, constants } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createS3DriverFromEnv, signRequest, uriEncode } from '../market/storage/s3-driver.mjs';
import { prefixFor, sync } from './sync-state.mjs';
import { inspectPrivacy } from './privacy.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
export function encryptedAuthorization(ticket, publicKey) {
  const key = randomBytes(32), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm',key,iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(ticket)),cipher.final()]);
  return {schema:1,algorithm:'RSA-OAEP-SHA256+A256GCM',key:publicEncrypt({key:publicKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
export function boundedPut(expected, env, stamp = new Date()) {
  const endpoint = new URL(env.VU_HISTORY_S3_ENDPOINT);
  if (!/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com\/?$/i.test(endpoint.href)) throw new Error('UNSUPPORTED_PRIVATE_ENDPOINT');
  const key = prefixFor(expected.namespace) + 'incoming-' + expected.checkpointSha256 + '.tar.gz';
  const path = '/' + uriEncode(env.VU_HISTORY_S3_BUCKET,true) + '/' + uriEncode(key,false);
  const amzDate=stamp.toISOString().replace(/[:-]|\.\d{3}/g,'');
  const headers={host:endpoint.host,'x-amz-date':amzDate,'x-amz-content-sha256':expected.checkpointSha256,'content-length':String(expected.checkpointBytes),'content-type':'application/gzip','if-none-match':'*'};
  headers.authorization=signRequest({method:'PUT',host:endpoint.host,path,query:{},headers,payloadHash:expected.checkpointSha256,accessKeyId:env.VU_HISTORY_S3_ACCESS_KEY_ID,secretAccessKey:env.VU_HISTORY_S3_SECRET_ACCESS_KEY,region:env.VU_HISTORY_S3_REGION||'auto',service:'s3',amzDate}).authorization;
  return {method:'PUT',url:endpoint.origin+path,headers,bytes:expected.checkpointBytes,sha256:expected.checkpointSha256,expiresAt:new Date(stamp.getTime()+10*60*1000).toISOString()};
}
export async function handoff(mode,{driver,expected,output,snapshot,engine,state,env=process.env}) {
  // Read each relevant remote state BEFORE issuing any write capability.
  const pointers={};
  for(const namespace of [expected.rolloutNamespace,expected.namespace]) {
    const bytes=await driver.get(prefixFor(namespace)+'index.json');
    if(bytes) {
      const p=JSON.parse(bytes);
      if(p.schema!==1||![0,1].includes(p.slot)||!/^[a-f0-9]{64}$/.test(p.sha256)||!Number.isSafeInteger(p.bytes)||p.bytes<=0||p.bytes>128*1024*1024)throw new Error('INVALID_EXISTING_REMOTE_POINTER');
      pointers[namespace]={status:p.sha256===expected.checkpointSha256?'EQUAL':'DIFFERENT_PRESERVED',sha256:p.sha256,bytes:p.bytes,updatedAt:p.updatedAt};
    } else pointers[namespace]={status:'ABSENT'};
  }
  const incoming=prefixFor(expected.namespace)+'incoming-'+expected.checkpointSha256+'.tar.gz';
  const head=await driver.head(incoming);
  if(mode==='issue') {
    if(pointers[expected.namespace].status==='DIFFERENT_PRESERVED')throw new Error('ACCEPTED_NAMESPACE_ALREADY_HAS_DIFFERENT_STATE');
    if(head) {
      const existing=await driver.get(incoming);
      if(existing?.length!==expected.checkpointBytes||hash(existing)!==expected.checkpointSha256)throw new Error('IMMUTABLE_INPUT_OBJECT_MISMATCH');
      writeFileSync(output,JSON.stringify({schema:1,status:'INPUT_ALREADY_PRESENT',pointers}));
    } else {
      const ticket=boundedPut(expected,env);
      const envelope=encryptedAuthorization(ticket,readFileSync('company-intelligence/config/handoff-upload-public.pem'));
      writeFileSync(output,JSON.stringify({schema:1,status:'ENCRYPTED_EXACT_PUT_AUTHORIZATION',pointers,envelope}));
    }
    return {status:'PRIVATE_HANDOFF_INPUT_READY',remotePointers:pointers,privateArchiveArtifact:false};
  }
  if(mode!=='accept')throw new Error('INVALID_HANDOFF_MODE');
  if(pointers[expected.namespace].status==='DIFFERENT_PRESERVED')throw new Error('ACCEPTED_NAMESPACE_ALREADY_HAS_DIFFERENT_STATE');
  if(head?.size!==expected.checkpointBytes)throw new Error('PRIVATE_INPUT_OBJECT_SIZE_MISMATCH');
  const bytes=await driver.get(incoming);
  if(bytes?.length!==expected.checkpointBytes||hash(bytes)!==expected.checkpointSha256)throw new Error('PRIVATE_INPUT_OBJECT_HASH_MISMATCH');
  writeFileSync(snapshot,bytes);
  const verification=spawnSync('python3',['scripts/company_intelligence/accepted_state_verify.py','--snapshot',snapshot,'--state',state,'--engine',engine,'--original-engine','.accepted-original-engine','--expected','company-intelligence/config/accepted-state-handoff.json','--evidence',output],{stdio:['ignore','pipe','pipe']});
  if(verification.status!==0)throw new Error('ACCEPTED_PRIVATE_RESTORE_OR_EXPORT_FAILED');
  const result=await sync(driver,{direction:'push',namespace:expected.namespace,file:snapshot,initialize:pointers[expected.namespace].status==='ABSENT'});
  const pointer=JSON.parse(await driver.get(prefixFor(expected.namespace)+'index.json'));
  if(pointer.sha256!==expected.checkpointSha256||pointer.bytes!==expected.checkpointBytes)throw new Error('ACCEPTED_POINTER_INTEGRITY_FAILED');
  const evidence=JSON.parse(readFileSync(output));
  Object.assign(evidence,{remotePreservation:result,remotePointersBefore:pointers,remoteStatePointer:prefixFor(expected.namespace)+'index.json',r2Object:prefixFor(expected.namespace)+`snapshot-${pointer.slot}.tar.gz`,rolloutNamespaceModified:false});
  writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
  return {status:'ACCEPTED_PRIVATE_STATE_PRESERVED',sha256:result.sha256||expected.checkpointSha256,bytes:expected.checkpointBytes,rolloutNamespaceModified:false};
}
if(process.argv[1]?.endsWith('/handoff-transfer.mjs')) {
  try {
    const privacy=await inspectPrivacy();
    if(privacy.status!=='VERIFIED_NON_PUBLIC')throw new Error('PRIVATE_BUCKET_PROOF_REQUIRED');
    console.log(JSON.stringify(privacy));
    const expected=JSON.parse(readFileSync('company-intelligence/config/accepted-state-handoff.json'));
    const result=await handoff(process.argv[2],{driver:createS3DriverFromEnv(),expected,output:process.env.HANDOFF_EVIDENCE,snapshot:process.env.HANDOFF_SNAPSHOT,engine:'.accepted-engine',state:process.env.HANDOFF_STATE});
    const evidence=JSON.parse(readFileSync(process.env.HANDOFF_EVIDENCE));evidence.bucketPrivacy=privacy;writeFileSync(process.env.HANDOFF_EVIDENCE,JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify(result));
  }catch(error) {console.error('PRIVATE_HANDOFF_FAILED: '+(['ACCEPTED_NAMESPACE_ALREADY_HAS_DIFFERENT_STATE','PRIVATE_INPUT_OBJECT_SIZE_MISMATCH','PRIVATE_INPUT_OBJECT_HASH_MISMATCH','ACCEPTED_PRIVATE_RESTORE_OR_EXPORT_FAILED','PRIVATE_BUCKET_PROOF_REQUIRED','IMMUTABLE_INPUT_OBJECT_MISMATCH'].includes(error.message)?error.message:'PRIVATE_STORAGE_OPERATION_FAILED'));process.exitCode=1;}
}
