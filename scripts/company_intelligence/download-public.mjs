/* Read only the digest-listed consumer namespace into a fresh Pages release.
   The existing disabled index survives any failure; no private object can be copied. */
import {mkdir,writeFile,rename,mkdtemp,rm} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {validateManifest,prefixFor,readAsset,MAX_MANIFEST} from './public-delivery.mjs';
import {objectPool} from './bounded-objects.mjs';
import {createS3DriverFromEnv} from '../market/storage/s3-driver.mjs';
import {createFsDriver} from '../market/storage/fs-driver.mjs';
export async function download(driver,{namespace,output,now=Date.now()}){
 const prefix=prefixFor(namespace), manifests=[], pinned=new Map();
 for(const file of ['manifest.json','previous.json']){
  const bytes=await driver.get(prefix+file);pinned.set(prefix+file,bytes);if(!bytes){if(file==='manifest.json')throw Error('CONSUMER_NOT_PUBLISHED');continue;}
  if(bytes.length>MAX_MANIFEST)throw Error('INVALID_MANIFEST');manifests.push(validateManifest(JSON.parse(bytes)));
 }
 const current=manifests[0], files=new Map();let total=0;
 // Pin the two small manifests once instead of rereading them for every object.
 const view={get:async key=>pinned.has(key)?pinned.get(key):driver.get(key)};
 // Verify the entire retained view before writing the release, including the current index.
 for(const [i,m] of manifests.entries())await objectPool(Object.keys(m.assets),async asset=>{
  if(i>0&&asset==='index.json')return;
  const result=await readAsset(view,{namespace,asset,now});
  if(result.generation!==m.generation)throw Error('GENERATION_CHANGED_DURING_DOWNLOAD');
  files.set(asset,result.bytes);total+=result.bytes.length;if(total>(current.scope==='PER_ISSUER_ELIGIBILITY'?256:128)*1024*1024)throw Error('PUBLIC_EXPORT_BUDGET_EXCEEDED');
 });
 const finalPointer=await driver.get(prefix+'manifest.json');
 if(!finalPointer||!Buffer.from(finalPointer).equals(Buffer.from(pinned.get(prefix+'manifest.json'))))throw Error('GENERATION_CHANGED_DURING_DOWNLOAD');
 const stage=await mkdtemp(join(tmpdir(),'intelligence-public-'));
 try{
  for(const [asset,bytes] of files){const p=resolve(stage,asset);await mkdir(dirname(p),{recursive:true});await writeFile(p,bytes);}
  // Each immutable snapshot is complete before the pointer moves. Never overwrite a retained generation with different bytes.
  for(const [asset,bytes] of files){if(asset==='index.json')continue;const p=resolve(output,asset);await mkdir(dirname(p),{recursive:true});await writeFile(p,bytes);}
  await mkdir(output,{recursive:true});const pointer=resolve(output,'index.json.tmp');await writeFile(pointer,files.get('index.json'));await rename(pointer,resolve(output,'index.json'));
 }finally{await rm(stage,{recursive:true,force:true});}
 return {status:'PASS',generation:current.generation,files:files.size,bytes:total,retainedGenerations:manifests.length,privateObjectsRead:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1];try{if(!args.includes('--namespace')||!args.includes('--out'))throw Error('MISSING_ARGUMENT');const driver=args.includes('--local-root')?createFsDriver(arg('--local-root')):createS3DriverFromEnv();console.log(JSON.stringify(await download(driver,{namespace:arg('--namespace'),output:arg('--out')})));}catch{console.error('CONSUMER_RELEASE_DOWNLOAD_FAILED');process.exitCode=1;}}
