/** Ciphertext-only bounded artifact transport; never reads a provider secret. */
import {readFileSync,writeFileSync,mkdirSync,lstatSync,readdirSync,existsSync,mkdtempSync,renameSync,rmSync,chmodSync} from 'node:fs';
import {resolve,join,dirname,basename,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {assertPrivateOutput,rejectSymlinkAncestors} from './private-output.mjs';
export const MAX_PART_BYTES=20*1024*1024,MAX_PARTS=16;
const VERSION='vu-marketstack-cipher-chunks-1',sha=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Error(code);};
function regular(path){
 rejectSymlinkAncestors(path);const stat=lstatSync(path);
 if(!stat.isFile())fail('CIPHER_SOURCE_FILE_TYPE_REJECTED');
 if(stat.nlink!==1)fail('CIPHER_SOURCE_HARDLINK_REJECTED');return stat;
}
function directory(path){rejectSymlinkAncestors(path);if(!lstatSync(path).isDirectory())fail('CIPHER_DIRECTORY_REQUIRED');}
function output(path,directoryExpected=false){
 assertPrivateOutput(path,{allowCache:true});
 if(existsSync(path)){if(directoryExpected)directory(path);else regular(path);}
}
function exactKeys(value,keys){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.slice().sort().join(',');}
function base64Bytes(value){
 if(typeof value!=='string'||value.length%4||/[^A-Za-z0-9+/=]/.test(value))fail('CIPHER_ENVELOPE_INVALID');
 const padding=value.endsWith('==')?2:value.endsWith('=')?1:0,equals=value.indexOf('=');
 if(equals!==-1&&equals!==value.length-padding)fail('CIPHER_ENVELOPE_INVALID');
 if(padding){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',last=alphabet.indexOf(value[value.length-padding-1]);if(last<0||(last&(padding===2?15:3)))fail('CIPHER_ENVELOPE_INVALID');}
 return value.length/4*3-padding;
}
export function validateResultEnvelope(bytes){
 let value;const text=bytes.toString('utf8');try{value=JSON.parse(text);}catch{fail('CIPHER_ENVELOPE_INVALID');}
 if(!exactKeys(value,['version','purpose','recipient','iv','wrappedKey','ciphertext','tag'])||value.version!=='vu-marketstack-handoff-1'||value.purpose!=='result'||!/^[a-f0-9]{64}$/.test(value.recipient||''))fail('CIPHER_ENVELOPE_INVALID');
 // Existing handoff output is compact canonical JSON, with optional newline.
 // Reject duplicate keys: JSON.parse alone can hide earlier plaintext values.
 const encoded=JSON.stringify(value);if(text!==encoded&&text!==encoded+'\n')fail('CIPHER_ENVELOPE_INVALID');
 const keyBytes=base64Bytes(value.wrappedKey);
 if(base64Bytes(value.iv)!==12||base64Bytes(value.tag)!==16||keyBytes<384||keyBytes>1024||base64Bytes(value.ciphertext)>512*1024*1024)fail('CIPHER_ENVELOPE_INVALID');
 return true;
}
const partName=i=>'part-'+String(i).padStart(2,'0')+'.enc.part';
export function splitEncryptedResult({input,out,maxPartBytes=MAX_PART_BYTES}={}){
 if(!input||!out||!Number.isSafeInteger(maxPartBytes)||maxPartBytes<1||maxPartBytes>MAX_PART_BYTES)fail('CIPHER_SPLIT_ARGUMENTS_INVALID');
 input=resolve(input);out=resolve(out);output(out,true);
 if(existsSync(out)&&readdirSync(out).length)fail('CIPHER_PART_OUTPUT_NOT_EMPTY');
 const stat=regular(input);if(stat.size>maxPartBytes*MAX_PARTS)fail('CIPHER_PART_LIMIT_EXCEEDED');
 const bytes=readFileSync(input);validateResultEnvelope(bytes);
 const meta={chunked:bytes.length>maxPartBytes,partCount:0,manifest:null,totalBytes:bytes.length,sha256:sha(bytes),ciphertextOnly:true};
 if(!meta.chunked)return meta;
 mkdirSync(dirname(out),{recursive:true,mode:0o700});const stage=mkdtempSync(join(dirname(out),'.cipher-parts-'));
 try{
  const parts=[];for(let offset=0;offset<bytes.length;offset+=maxPartBytes){const value=bytes.subarray(offset,offset+maxPartBytes),name=partName(parts.length);writeFileSync(join(stage,name),value,{mode:0o600,flag:'wx'});parts.push({name,bytes:value.length,sha256:sha(value)});}
  const manifest={version:VERSION,partCount:parts.length,totalBytes:bytes.length,sha256:meta.sha256,parts};
  writeFileSync(join(stage,'manifest.json'),JSON.stringify(manifest)+'\n',{mode:0o600,flag:'wx'});
  renameSync(stage,out);chmodSync(out,0o700);
  return {...meta,partCount:parts.length,manifest:join(out,'manifest.json')};
 }finally{rmSync(stage,{recursive:true,force:true});}
}
function validateManifest(m){
 if(!exactKeys(m,['version','partCount','totalBytes','sha256','parts'])||m.version!==VERSION||!Number.isInteger(m.partCount)||m.partCount<2||m.partCount>MAX_PARTS||!Number.isSafeInteger(m.totalBytes)||m.totalBytes<1||m.totalBytes>MAX_PARTS*MAX_PART_BYTES||!/^[a-f0-9]{64}$/.test(m.sha256||'')||!Array.isArray(m.parts)||m.parts.length!==m.partCount)fail('CIPHER_MANIFEST_INVALID');
 let total=0;for(let i=0;i<m.parts.length;i++){const p=m.parts[i];if(!exactKeys(p,['name','bytes','sha256'])||p.name!==partName(i)||!Number.isInteger(p.bytes)||p.bytes<1||p.bytes>MAX_PART_BYTES||!/^[a-f0-9]{64}$/.test(p.sha256||''))fail('CIPHER_MANIFEST_PART_INVALID');total+=p.bytes;}
 if(total!==m.totalBytes)fail('CIPHER_MANIFEST_LENGTH_INVALID');
}
export function assembleEncryptedResult({manifest,parts,out}={}){
 if(!manifest||!parts||!out)fail('CIPHER_ASSEMBLE_ARGUMENTS_INVALID');
 manifest=resolve(manifest);parts=resolve(parts);out=resolve(out);
 if(out===manifest||out===parts||out.startsWith(parts+sep))fail('CIPHER_OUTPUT_MUST_NOT_REPLACE_SOURCE');
 output(out);regular(manifest);directory(parts);
 const manifestStat=regular(manifest);if(manifestStat.size>16384)fail('CIPHER_MANIFEST_INVALID');
 let m;try{m=JSON.parse(readFileSync(manifest,'utf8'));}catch{fail('CIPHER_MANIFEST_INVALID');}validateManifest(m);
 const expected=new Set(m.parts.map(p=>p.name));if(dirname(manifest)===parts)expected.add(basename(manifest));
 const names=readdirSync(parts);for(const name of names){regular(join(parts,name));if(!expected.has(name))fail('CIPHER_PART_FILES_UNEXPECTED');}
 if(names.length!==expected.size||m.parts.some(p=>!names.includes(p.name)))fail('CIPHER_PART_MISSING');
 const values=m.parts.map(p=>{const path=join(parts,p.name),stat=regular(path);if(stat.size!==p.bytes)fail('CIPHER_PART_LENGTH_MISMATCH');const value=readFileSync(path);if(sha(value)!==p.sha256)fail('CIPHER_PART_SHA_MISMATCH');return value;});
 const bytes=Buffer.concat(values);if(bytes.length!==m.totalBytes||sha(bytes)!==m.sha256)fail('CIPHER_TOTAL_SHA_MISMATCH');validateResultEnvelope(bytes);
 mkdirSync(dirname(out),{recursive:true,mode:0o700});const stage=mkdtempSync(join(dirname(out),'.cipher-assembled-'));
 try{const file=join(stage,'result.enc.json');writeFileSync(file,bytes,{mode:0o600,flag:'wx'});output(out);renameSync(file,out);chmodSync(out,0o600);}finally{rmSync(stage,{recursive:true,force:true});}
 return {assembled:true,totalBytes:bytes.length,sha256:m.sha256,ciphertextOnly:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv[2],args=process.argv.slice(3),options={};
 try{
  const allowed=mode==='split'?['input','out','max-part-bytes']:mode==='assemble'?['manifest','parts','out']:[];
  if(!allowed.length)fail('CIPHER_TRANSPORT_MODE_INVALID');
  for(let i=0;i<args.length;i++){const match=/^--([a-z-]+)(?:=(.*))?$/.exec(args[i]);if(!match||!allowed.includes(match[1])||Object.hasOwn(options,match[1]))fail('CIPHER_TRANSPORT_ARGUMENTS_INVALID');const value=match[2]??args[++i];if(!value||value.startsWith('--'))fail('CIPHER_TRANSPORT_ARGUMENTS_INVALID');options[match[1]]=value;}
  const result=mode==='split'?splitEncryptedResult({input:options.input,out:options.out,maxPartBytes:options['max-part-bytes']===undefined?MAX_PART_BYTES:Number(options['max-part-bytes'])}):assembleEncryptedResult(options);
  console.log(JSON.stringify(result));
 }catch(error){console.error('Encrypted result transport stopped: '+(/^[A-Z0-9_]+$/.test(error.message)?error.message:'CIPHER_TRANSPORT_FAILED'));process.exitCode=1;}
}
