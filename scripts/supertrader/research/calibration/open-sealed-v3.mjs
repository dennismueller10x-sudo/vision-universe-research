/**
 * Owner-side opener for sealed V3 artifacts (both formats). Run it on the key holder's own machine:
 *   node open-sealed-v3.mjs --input X.sealed[.json] --output Y --private-key owner-private.pem [--audience owner]
 * The private key is read from a file path and never printed or logged; output is written with mode 0600 and must not exist.
 * Prints only the plaintext SHA-256 and byte count. Detects the streaming format and the JSON envelope automatically.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openFileStream,STREAM_SEAL_SCHEMA} from './seal-stream-v3.mjs';
import {decryptSealed} from '../../validation/lib.mjs';

export function sealedFormat(input){
 const fd=fs.openSync(input,'r');
 try{
  const probe=Buffer.alloc(65536),n=fs.readSync(fd,probe,0,probe.length,0),nl=probe.subarray(0,n).indexOf(10);
  if(nl>0){try{if(JSON.parse(probe.subarray(0,nl).toString('utf8')).schema===STREAM_SEAL_SCHEMA)return'STREAM';}catch{}}
  return'JSON_ENVELOPE';
 }finally{fs.closeSync(fd);}
}
export async function openSealed({input,output,privateKeyFile,audience='owner'}){
 if(!input||!output||!privateKeyFile)throw new Error('OPEN_SEALED_ARGUMENTS_REQUIRED');
 if(fs.existsSync(output))throw new Error('OPEN_SEALED_OUTPUT_EXISTS');
 const privateKeyPem=fs.readFileSync(privateKeyFile,'utf8'),format=sealedFormat(input);
 if(format==='STREAM')return{format,...await openFileStream({input,output,audience,privateKeyPem})};
 const plain=decryptSealed(privateKeyPem,fs.readFileSync(input,'utf8'));
 fs.writeFileSync(output,plain,{mode:0o600,flag:'wx'});
 return{format,plaintextSha256:crypto.createHash('sha256').update(plain).digest('hex'),plaintextBytes:plain.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2),arg=f=>{const i=a.indexOf(f);return i>=0?a[i+1]:null;};
 try{process.stdout.write(JSON.stringify(await openSealed({input:arg('--input'),output:arg('--output'),privateKeyFile:arg('--private-key'),audience:arg('--audience')||'owner'}))+'\n');}
 catch(e){process.stderr.write(JSON.stringify({status:'OPEN_SEALED_FAILED',code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'OPEN_SEALED_FAILURE'})+'\n');process.exitCode=1;}
}
