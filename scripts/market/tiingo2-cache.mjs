/** Authenticated CI cache. Only ciphertext may enter a public Actions cache. */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, lstat, mkdir, mkdtemp, open, readdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

const MAGIC=Buffer.from('VUT2ENC1'),HEADER_BYTES=8+32+12,TAG_BYTES=16;
const DOMAIN='vision-universe/tiingo2-private-cache/aes256gcm/v1';
const PROFILES={tiingo2:{name:'tiingo2',magic:MAGIC,domain:DOMAIN},marketstack:{name:'marketstack',magic:Buffer.from('VUMSENC1'),domain:'vision-universe/marketstack-private-cache/aes256gcm/v1'}};
function profileFor(provider='tiingo2'){if(!Object.hasOwn(PROFILES,provider))throw Error('CACHE_PROVIDER_INVALID');return PROFILES[provider];}
const secretName=name=>/^\.env(?:\.|$)/i.test(name)||/^(?:secrets|credentials)\.json$/i.test(name)||/\.key$/i.test(name);
const exists=async path=>{try{await access(path);return true;}catch{return false;}};
async function noSymlinkAncestors(path){
 for(let current=path;;current=dirname(current)){
  try{if((await lstat(current)).isSymbolicLink())throw Error('CACHE_PATH_SYMLINK_REJECTED');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(dirname(current)===current)break;
 }
}
function keyFor(apiKey,salt,context,profile=PROFILES.tiingo2){
 if(typeof apiKey!=='string'||!apiKey.trim()||/[\r\n\0]/.test(apiKey))throw Error('CACHE_CREDENTIAL_REQUIRED');
 if(typeof context!=='string'||!context||context.length>512||/[\r\n\0]/.test(context))throw Error('CACHE_CONTEXT_REQUIRED');
 return Buffer.from(hkdfSync('sha256',Buffer.from(apiKey),salt,Buffer.from(profile.domain+'\0'+context),32));
}
async function paths(workDir,file,profile=PROFILES.tiingo2){
 workDir=resolve(workDir);file=resolve(file);
 if(basename(workDir)!==profile.name||file===workDir||file.startsWith(workDir+'/'))throw Error('CACHE_PATH_INVALID');
 await noSymlinkAncestors(workDir);await noSymlinkAncestors(file);
 if(await exists(workDir)){const stat=await lstat(workDir);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('CACHE_DIRECTORY_INVALID');}
 if(await exists(file)){const stat=await lstat(file);if(stat.isSymbolicLink()||!stat.isFile())throw Error('CACHE_FILE_INVALID');}
 return {workDir,file};
}
async function validateSource(dir,apiKey){
 for(const name of await readdir(dir)){
  if(secretName(name)||/[\r\n\\]/.test(name))throw Error('CACHE_AUTH_OR_PATH_INPUT_REJECTED');
  const path=join(dir,name),stat=await lstat(path);
  if(stat.isSymbolicLink()||(!stat.isFile()&&!stat.isDirectory())||(stat.isFile()&&stat.nlink>1))throw Error('CACHE_LINK_INPUT_REJECTED');
  if(stat.isDirectory())await validateSource(path,apiKey);
  else{let carry=Buffer.alloc(0);const secret=Buffer.from(apiKey);
   for await(const chunk of createReadStream(path)){const data=Buffer.concat([carry,chunk]);if(data.includes(secret))throw Error('CACHE_AUTH_INPUT_REJECTED');carry=data.subarray(Math.max(0,data.length-secret.length+1));}
  }
 }
}
function tarProcess(args,cwd){
 const child=spawn('tar',args,{cwd,stdio:['ignore','pipe','pipe']});let stderr='';
 child.stderr.on('data',chunk=>{if(stderr.length<1024)stderr+=chunk.toString();});
 const done=new Promise((yes,no)=>{child.on('error',()=>no(Error('CACHE_ARCHIVE_FAILED')));child.on('close',code=>code===0?yes():no(Error('CACHE_ARCHIVE_FAILED')));});
 // Attach immediately, so a pipeline failure cannot cause an unhandled reject.
 done.catch(()=>{});return {child,done};
}
const tarString=(header,start,size)=>header.subarray(start,start+size).toString('utf8').split('\0')[0];
const octal=value=>{const trimmed=value.replace(/\0/g,'').trim();if(!/^[0-7]+$/.test(trimmed))throw Error('CACHE_ARCHIVE_HEADER_INVALID');return parseInt(trimmed,8);};
/** Validate ustar before extraction. Reject links, traversal, special files,
 * auth files and credentials in file bodies, even in authenticated archives. */
export async function validateCacheArchive(path,apiKey,provider='tiingo2'){
 const profile=profileFor(provider);
 let pending=Buffer.alloc(0),mode='header',remaining=0,padding=0,zeros=0,count=0,carry=Buffer.alloc(0);
 const secret=Buffer.from(apiKey);
 const input=createReadStream(path),decompressed=createGunzip();input.on('error',error=>decompressed.destroy(error));decompressed.on('error',()=>input.destroy());
 for await(const chunk of input.pipe(decompressed)){
  pending=Buffer.concat([pending,chunk]);
  while(pending.length){
   if(mode==='header'){
    if(pending.length<512)break;
    const h=pending.subarray(0,512);pending=pending.subarray(512);
    if(h.every(v=>v===0)){zeros++;continue;}
    if(zeros)throw Error('CACHE_ARCHIVE_TRAILING_ENTRY');
    const checksum=octal(tarString(h,148,8));let sum=0;for(let i=0;i<512;i++)sum+=i>=148&&i<156?32:h[i];
    if(checksum!==sum||tarString(h,257,6)!=='ustar')throw Error('CACHE_ARCHIVE_HEADER_INVALID');
    const prefix=tarString(h,345,155),entry=(prefix?prefix+'/':'')+tarString(h,0,100),parts=entry.replace(/\/$/,'').split('/');
    if(parts[0]!==profile.name||parts.some(p=>!p||p==='.'||p==='..'||secretName(p))||/[\r\n\\]/.test(entry))throw Error('CACHE_ARCHIVE_PATH_REJECTED');
    const type=tarString(h,156,1);if(!['','0','5'].includes(type))throw Error('CACHE_ARCHIVE_LINK_REJECTED');
    const size=octal(tarString(h,124,12));if(!Number.isSafeInteger(size)||(type==='5'&&size!==0)||++count>1000000)throw Error('CACHE_ARCHIVE_HEADER_INVALID');
    remaining=size;padding=(512-size%512)%512;carry=Buffer.alloc(0);mode=remaining?'data':padding?'padding':'header';
   }else if(mode==='data'){
    const n=Math.min(remaining,pending.length),data=Buffer.concat([carry,pending.subarray(0,n)]);
    if(data.includes(secret))throw Error('CACHE_AUTH_INPUT_REJECTED');carry=data.subarray(Math.max(0,data.length-secret.length+1));
    pending=pending.subarray(n);remaining-=n;if(!remaining)mode=padding?'padding':'header';
   }else{const n=Math.min(padding,pending.length);pending=pending.subarray(n);padding-=n;if(!padding)mode='header';}
  }
 }
 if(mode!=='header'||pending.length||zeros<2||!count)throw Error('CACHE_ARCHIVE_TRUNCATED');
}

export async function sealCache({provider='tiingo2',workDir='.market-cache/tiingo2',file='.market-cache/tiingo2-cache.enc',context,apiKey=provider==='marketstack'?process.env.MARKETSTACK_API_KEY:process.env.TIINGO_API_KEY}={}){
 const profile=profileFor(provider);
 const salt=randomBytes(32),nonce=randomBytes(12),key=keyFor(apiKey,salt,context,profile),p=await paths(workDir,file,profile);
 if(!await exists(p.workDir))return {status:'MISS',reason:'SOURCE_ABSENT'};
 await validateSource(p.workDir,apiKey);await mkdir(dirname(p.file),{recursive:true});
 const tmp=p.file+'.tmp-'+randomBytes(8).toString('hex'),header=Buffer.concat([profile.magic,salt,nonce]);
 const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(header);
 let archive;
 try{
  const handle=await open(tmp,'wx',0o600);await handle.write(header);await handle.close();
  archive=tarProcess(['--format=ustar','-czf','-','--',profile.name],dirname(p.workDir));
  await pipeline(archive.child.stdout,cipher,createWriteStream(tmp,{flags:'a',mode:0o600}));await archive.done;
  const handleTag=await open(tmp,'a');await handleTag.write(cipher.getAuthTag());await handleTag.close();
  await rename(tmp,p.file);return {status:'SEALED'};
 }catch{archive?.child.kill();await rm(tmp,{force:true});throw Error('CACHE_SEAL_FAILED');}
 finally{key.fill(0);}
}

export async function openCache({provider='tiingo2',workDir='.market-cache/tiingo2',file='.market-cache/tiingo2-cache.enc',context,apiKey=provider==='marketstack'?process.env.MARKETSTACK_API_KEY:process.env.TIINGO_API_KEY}={}){
 const profile=profileFor(provider);
 const p=await paths(workDir,file,profile);if(!await exists(p.file))return {status:'MISS',reason:'CACHE_ABSENT'};
 await mkdir(dirname(p.workDir),{recursive:true});
 const tmp=await mkdtemp(join(dirname(p.workDir),'.'+profile.name+'-open-'));let key,backup;
 try{
  const handle=await open(p.file,'r'),stat=await handle.stat(),header=Buffer.alloc(HEADER_BYTES),tag=Buffer.alloc(TAG_BYTES);
  try{if(stat.size<HEADER_BYTES+TAG_BYTES)throw Error('CACHE_INVALID');await handle.read(header,0,HEADER_BYTES,0);await handle.read(tag,0,TAG_BYTES,stat.size-TAG_BYTES);}finally{await handle.close();}
  if(!header.subarray(0,8).equals(profile.magic))throw Error('CACHE_INVALID');
  key=keyFor(apiKey,header.subarray(8,40),context,profile);const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(40,52));decipher.setAAD(header);decipher.setAuthTag(tag);
  const archive=join(tmp,'cache.tar.gz');
  await pipeline(createReadStream(p.file,{start:HEADER_BYTES,end:stat.size-TAG_BYTES-1}),decipher,createWriteStream(archive,{flags:'wx',mode:0o600}));
  await validateCacheArchive(archive,apiKey,provider);const extracted=join(tmp,'extracted');await mkdir(extracted);
  const unpack=tarProcess(['-xzf',archive,'--no-same-owner','--no-same-permissions','--',profile.name],extracted);await unpack.done;
  if(await exists(p.workDir)){backup=join(tmp,'previous');await rename(p.workDir,backup);}
  try{await rename(join(extracted,profile.name),p.workDir);}catch(error){if(backup)await rename(backup,p.workDir);throw error;}
  return {status:'OPENED'};
 }catch{ return {status:'MISS',reason:'CACHE_UNREADABLE'}; }
 finally{key?.fill(0);await rm(tmp,{recursive:true,force:true});}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),mode=args.shift(),allowed=new Set(['--work-dir','--file','--context']);
 let options={};
 try{
  if(!['seal','open'].includes(mode)||args.length%2)throw Error('CACHE_ARGUMENTS_INVALID');
  for(let i=0;i<args.length;i+=2){if(!allowed.has(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('CACHE_ARGUMENTS_INVALID');options[{'--work-dir':'workDir','--file':'file','--context':'context'}[args[i]]]=args[i+1];}
  console.log(JSON.stringify(await (mode==='seal'?sealCache:openCache)(options)));
 }catch{console.error('Tiingo encrypted cache operation failed.');process.exitCode=1;}
}
