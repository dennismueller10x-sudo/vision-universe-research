/** Authenticated hybrid handoff. Public artifacts contain only keys/ciphertext. */
import { generateKeyPairSync,createHash,randomBytes,publicEncrypt,privateDecrypt,createCipheriv,createDecipheriv,constants,createPublicKey } from 'node:crypto';
import { readFileSync,writeFileSync,mkdirSync,lstatSync,readdirSync,rmSync } from 'node:fs';
import { resolve,join,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assertPrivateOutput,rejectSymlinkAncestors } from './private-output.mjs';
export const REQUEST_PATH='scripts/marketstack/private-bootstrap/request.enc.json';
const sha=value=>createHash('sha256').update(value).digest('hex');
const fail=message=>{throw Error(message);};
export const fingerprint=key=>sha(createPublicKey(key).export({type:'spki',format:'der'}));
export function generateHandoffKeys(){const keys=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});return {...keys,fingerprint:fingerprint(keys.publicKey)};}
export function encryptHandoff(bytes,publicKey,purpose='request'){
 if(!Buffer.isBuffer(bytes)||bytes.length>512*1024*1024||!['request','result'].includes(purpose))fail('HANDOFF_INPUT_INVALID');
 const key=randomBytes(32),iv=randomBytes(12),header={version:'vu-marketstack-handoff-1',purpose,recipient:fingerprint(publicKey),iv:iv.toString('base64')};
 const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(JSON.stringify(header)));
 try{return {...header,wrappedKey:publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key).toString('base64'),ciphertext:Buffer.concat([cipher.update(bytes),cipher.final()]).toString('base64'),tag:cipher.getAuthTag().toString('base64')};}finally{key.fill(0);}
}
export function decryptHandoff(envelope,privateKey,purpose='request'){
 try{
  if(envelope?.version!=='vu-marketstack-handoff-1'||envelope.purpose!==purpose||envelope.recipient!==fingerprint(privateKey)||typeof envelope.ciphertext!=='string'||envelope.ciphertext.length>720*1024*1024)fail('HANDOFF_ENVELOPE_INVALID');
  const iv=Buffer.from(envelope.iv,'base64'),tag=Buffer.from(envelope.tag,'base64');if(iv.length!==12||tag.length!==16)fail('HANDOFF_ENVELOPE_INVALID');
  const key=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.wrappedKey,'base64'));
  try{const d=createDecipheriv('aes-256-gcm',key,iv);d.setAAD(Buffer.from(JSON.stringify({version:envelope.version,purpose:envelope.purpose,recipient:envelope.recipient,iv:envelope.iv})));d.setAuthTag(tag);return Buffer.concat([d.update(Buffer.from(envelope.ciphertext,'base64')),d.final()]);}finally{key.fill(0);}
 }catch{fail('HANDOFF_DECRYPT_FAILED');}
}
export function bootstrapHandoff({privateDir='.market-cache/marketstack',publicOut='.verification/marketstack-handoff-public.json',context}={}){
 assertPrivateOutput(privateDir,{allowCache:true});rejectSymlinkAncestors(publicOut);if(!context||!/^refs\/pull\/\d+\/merge$/.test(context))fail('HANDOFF_PR_CONTEXT_REQUIRED');
 mkdirSync(privateDir,{recursive:true,mode:0o700});const keyPath=join(privateDir,'handoff-private.pem');let privateKey,publicKey;
 try{privateKey=readFileSync(keyPath,'utf8');publicKey=createPublicKey(privateKey).export({type:'spki',format:'pem'});}catch(error){if(error.code!=='ENOENT')fail('HANDOFF_EXISTING_KEY_INVALID');({privateKey,publicKey}=generateHandoffKeys());writeFileSync(keyPath,privateKey,{mode:0o600,flag:'wx'});}
 mkdirSync(dirname(publicOut),{recursive:true});const data={version:'vu-marketstack-handoff-public-1',context,publicKey,fingerprint:fingerprint(publicKey),providerRequests:0};writeFileSync(publicOut,JSON.stringify(data)+'\n');return {fingerprint:data.fingerprint,providerRequests:0};
}
export function verifyPrivateRequest(request,{context,root=process.cwd()}={}){
 if(!request||request.version!=='vu-marketstack-live-request-1'||request.context!==context||!/^refs\/pull\/\d+\/merge$/.test(context)||!/^([a-f0-9]{40})$/.test(request.sourceSHA||'')||!request.runId||!['sample','mandatory','refresh','identity_probe'].includes(request.phase)||!request.resultPublicKey)fail('PRIVATE_REQUEST_INVALID');
 const referenceHash=sha(JSON.stringify(request.listingMap));if(request.authorization?.sourceSHA!==request.sourceSHA||request.authorization?.referenceHash!==referenceHash||request.authorization?.runId!==request.runId)fail('PRIVATE_REQUEST_AUTHORIZATION_MISMATCH');
 execFileSync('git',['merge-base','--is-ancestor',request.sourceSHA,'HEAD'],{cwd:root,stdio:'pipe'});
 const changed=execFileSync('git',['diff','--name-only',request.sourceSHA,'HEAD'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
 if(changed.some(p=>p!==REQUEST_PATH))fail('AUTHORIZED_SOURCE_DRIFT');
 const key=createPublicKey(request.resultPublicKey);if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails?.modulusLength<3072)fail('RESULT_RECIPIENT_INVALID');
 return {referenceHash,sourceSHA:request.sourceSHA};
}
export function loadPrivateRequest({privateDir='.market-cache/marketstack',requestPath=REQUEST_PATH,context,root=process.cwd()}={}){
 assertPrivateOutput(privateDir,{allowCache:true});rejectSymlinkAncestors(requestPath);
 const privateKey=readFileSync(join(privateDir,'handoff-private.pem'),'utf8'),envelope=JSON.parse(readFileSync(requestPath,'utf8'));
 const request=JSON.parse(decryptHandoff(envelope,privateKey,'request').toString('utf8'));verifyPrivateRequest(request,{context,root});
 return {request,ciphertextHash:sha(JSON.stringify(envelope))};
}
export function encryptResultArchive({privateDir,previewDir,publicKey,out}){
 assertPrivateOutput(privateDir,{allowCache:true});assertPrivateOutput(previewDir);rejectSymlinkAncestors(out);
 for(const path of [privateDir,previewDir]){const scan=p=>{const s=lstatSync(p);if(s.isSymbolicLink()||(!s.isDirectory()&&!s.isFile())||s.isFile()&&s.nlink>1)fail('RESULT_ARCHIVE_UNSAFE');if(s.isDirectory())for(const f of readdirSync(p))scan(join(p,f));};scan(path);}
 // cwd/root guards require deterministic names; no shell interpolation.
 if(dirname(resolve(previewDir))!==dirname(resolve(privateDir)))fail('RESULT_DIRECTORIES_REQUIRE_SHARED_PRIVATE_PARENT');
 const parent=dirname(resolve(privateDir)),cacheName=privateDir.split('/').at(-1),previewName=previewDir.split('/').at(-1);
 const bytes=execFileSync('tar',['--format=ustar','--exclude='+cacheName+'/handoff-private.pem','-czf','-','--',cacheName,previewName],{cwd:parent,maxBuffer:512*1024*1024});
 const envelope=encryptHandoff(bytes,publicKey,'result');mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(envelope)+'\n',{mode:0o600});return {ciphertextSha256:sha(readFileSync(out)),format:'ENCRYPTED_TAR_GZIP',privateProviderSourceIncluded:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv[2],arg=n=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3);
 try{if(mode==='bootstrap')console.log(JSON.stringify(bootstrapHandoff({context:process.env.GITHUB_REF,privateDir:process.env.VU_MARKETSTACK_PRIVATE_DIR||'.market-cache/marketstack'})));
 else if(mode==='encrypt-request'){const keys=JSON.parse(readFileSync(arg('public'),'utf8'));const input=readFileSync(arg('input'));writeFileSync(arg('out'),JSON.stringify(encryptHandoff(input,keys.publicKey))+'\n');console.log(JSON.stringify({ciphertextOnly:true,recipient:keys.fingerprint}));}
 else if(mode==='generate-result-key'){const k=generateHandoffKeys();assertPrivateOutput(arg('private'));writeFileSync(arg('private'),k.privateKey,{mode:0o600,flag:'wx'});writeFileSync(arg('public'),k.publicKey,{mode:0o600});console.log(JSON.stringify({fingerprint:k.fingerprint}));}
 else if(mode==='decrypt-result'){assertPrivateOutput(arg('out'));const data=decryptHandoff(JSON.parse(readFileSync(arg('input'),'utf8')),readFileSync(arg('private'),'utf8'),'result');writeFileSync(arg('out'),data,{mode:0o600});console.log(JSON.stringify({privateResultReady:true}));}
 else fail('HANDOFF_MODE_INVALID');}catch(error){console.error('Private Marketstack handoff failed: '+(/^[A-Z0-9_]+$/.test(error.message)?error.message:'HANDOFF_OPERATION_FAILED'));process.exitCode=1;}
}
