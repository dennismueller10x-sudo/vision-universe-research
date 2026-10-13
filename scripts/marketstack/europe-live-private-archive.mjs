/** Encrypt Actions evidence before artifact upload. No provider or product writes. */
import {createCipheriv,createDecipheriv,createHash,publicEncrypt,privateDecrypt,randomBytes,constants} from 'node:crypto';
import {createReadStream,createWriteStream,existsSync,mkdirSync,readFileSync,writeFileSync,openSync,closeSync,readSync,rmSync,chmodSync} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {execFileSync} from 'node:child_process';
import {join,resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {privateReplayRoot} from './europe-private-files.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fileHash(p){const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);return h.digest('hex');}
const write=(p,v)=>writeFileSync(p,JSON.stringify(v)+'\n',{flag:'wx',mode:0o600});
function separate(a,b){const inside=(x,y)=>{const r=relative(x,y);return !r||r!=='..'&&!r.startsWith('..'+sep);};if(inside(a,b)||inside(b,a))throw Error('ARCHIVE_OUTPUT_SOURCE_OVERLAP');}
export async function sealPrivateEvidence({sourceRoot,out,publicKeyPath,sourceCommit,runId,planSha256}){
 sourceRoot=privateReplayRoot(sourceRoot);out=privateReplayRoot(out);separate(sourceRoot,out);
 if(!/^[a-f0-9]{40}$/.test(sourceCommit||'')||!/^\d+$/.test(runId||'')||!/^[a-f0-9]{64}$/.test(planSha256||''))throw Error('ARCHIVE_SOURCE_BINDING_REQUIRED');
 if(!existsSync(sourceRoot))throw Error('PRIVATE_EVIDENCE_MISSING');
 if(existsSync(out))throw Error('ARCHIVE_REENTRY_REFUSED');mkdirSync(out,{recursive:true,mode:0o700});chmodSync(out,0o700);
 const archive=join(out,'plaintext.tar.gz'),cipherPath=join(out,'cipher.tmp');
 try{
  execFileSync('tar',['-czf',archive,'-C',sourceRoot,'.']);chmodSync(archive,0o600);
  const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  await pipeline(createReadStream(archive),cipher,createWriteStream(cipherPath,{flags:'wx',mode:0o600}));
  const pieces=[],fd=openSync(cipherPath,'r');try{
   for(let n=0;;n++){const b=Buffer.alloc(20*1024*1024),bytes=readSync(fd,b,0,b.length,null);if(!bytes)break;
    const data=b.subarray(0,bytes),name='cipher-'+String(n).padStart(3,'0')+'.bin';writeFileSync(join(out,name),data,{flag:'wx',mode:0o600});pieces.push({name,bytes,sha256:hash(data)});}
  }finally{closeSync(fd);}
  const wrapped=publicEncrypt({key:readFileSync(publicKeyPath),padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key);
  const envelope={schema:'vu-europe-live-encrypted-evidence-1',algorithm:'AES-256-GCM+RSA-OAEP-SHA256',sourceCommit,runId,planSha256,
   iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),wrappedKey:wrapped.toString('base64'),archiveSha256:await fileHash(archive),pieces};
  write(join(out,'envelope.json'),envelope);return {sourceCommit,runId,planSha256,pieces:pieces.length,encryptedBytes:pieces.reduce((n,p)=>n+p.bytes,0),envelopeSha256:hash(readFileSync(join(out,'envelope.json')))};
 }finally{rmSync(archive,{force:true});rmSync(cipherPath,{force:true});}
}
export async function unsealPrivateEvidence({sealedRoot,out,privateKeyPath,sourceCommit,runId,planSha256}){
 sealedRoot=privateReplayRoot(sealedRoot);out=privateReplayRoot(out);separate(sealedRoot,out);
 const e=JSON.parse(readFileSync(join(sealedRoot,'envelope.json'),'utf8'));
 if(e.schema!=='vu-europe-live-encrypted-evidence-1'||e.algorithm!=='AES-256-GCM+RSA-OAEP-SHA256'||e.sourceCommit!==sourceCommit||e.runId!==String(runId)||e.planSha256!==planSha256||!Array.isArray(e.pieces)||!e.pieces.length)throw Error('ARCHIVE_SOURCE_MISMATCH');
 if(existsSync(out))throw Error('ARCHIVE_REENTRY_REFUSED');mkdirSync(out,{recursive:true,mode:0o700});chmodSync(out,0o700);
 const key=privateDecrypt({key:readFileSync(privateKeyPath),padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(e.wrappedKey,'base64'));
 const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));decipher.setAuthTag(Buffer.from(e.tag,'base64'));
 const archive=join(out,'plaintext.tar.gz');
 async function* pieces(){for(let i=0;i<e.pieces.length;i++){const p=e.pieces[i];if(p.name!=='cipher-'+String(i).padStart(3,'0')+'.bin')throw Error('ARCHIVE_PIECE_PATH_INVALID');
  const b=readFileSync(join(sealedRoot,p.name));if(hash(b)!==p.sha256||b.length!==p.bytes)throw Error('ARCHIVE_CIPHER_HASH');yield b;}}
 try{
  // Decrypt bounded authenticated chunks without a second full ciphertext copy.
  await pipeline(Readable.from(pieces()),decipher,createWriteStream(archive,{flags:'wx',mode:0o600}));
  if(await fileHash(archive)!==e.archiveSha256)throw Error('ARCHIVE_PLAINTEXT_HASH');
  const names=execFileSync('tar',['-tzf',archive],{encoding:'utf8',maxBuffer:16*1024*1024}).trim().split('\n');
  if(names.some(n=>!n.startsWith('./')||n.split('/').includes('..')||n.includes('\\')))throw Error('ARCHIVE_PATH_INVALID');
  const listing=execFileSync('tar',['-tvzf',archive],{encoding:'utf8',maxBuffer:32*1024*1024});if(listing.split('\n').filter(Boolean).some(n=>!['d','-'].includes(n[0])))throw Error('ARCHIVE_LINK_REFUSED');
  execFileSync('tar',['-xzf',archive,'--no-same-owner','--no-same-permissions','-C',out]);return {sourceCommit,runId:String(runId),planSha256,entries:names.length,archiveSha256:e.archiveSha256};
 }finally{rmSync(archive,{force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=Object.fromEntries(process.argv.slice(3).reduce((a,v,i,all)=>i%2===0?[...a,[v.replace(/^--/,''),all[i+1]]]:a,[]));
 const mode=process.argv[2];if(mode==='seal')console.log(JSON.stringify(await sealPrivateEvidence(args)));else if(mode==='unseal')console.log(JSON.stringify(await unsealPrivateEvidence(args)));else throw Error('ARCHIVE_MODE_REQUIRED');
}
