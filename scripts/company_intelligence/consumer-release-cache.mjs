/* Derived public bytes only. R2 GOOD remains authoritative on every build;
   cached bytes cannot bypass the existing hash/schema/pointer checks. */
import {readFileSync,realpathSync,existsSync} from 'node:fs';
import {mkdir,mkdtemp,copyFile,rm,rename} from 'node:fs/promises';
import {resolve,join,dirname,basename,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {prefixFor,validateManifest} from './public-delivery.mjs';
import {objectPool} from './bounded-objects.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
function records(good){
 const rows=[];
 for(const g of [good,good?.previous].filter(Boolean)){
  validateManifest(g.manifest);
  for(const [path,meta] of Object.entries(g.manifest.assets))rows.push({path,meta,key:prefixFor(g.payloadNamespace)+`slot-${g.manifest.slot||0}/`+(path==='index.json'?path:path.split('/').slice(2).join('/'))});
 }
 return rows;
}
function directory(value){const root=resolve(value);if(basename(root)!=='ci-public-cache')throw Error('INVALID_CONSUMER_CACHE_DIRECTORY');return root;}
export function consumerCacheDriver(driver,good,value){
 const stats={cachedAssets:0,remoteAssets:0};
 if(!value||good?.manifest?.scope!=='PER_ISSUER_ELIGIBILITY')return {driver,stats};
 const root=directory(value),map=new Map(records(good).map(r=>[r.key,r]));
 return {stats,driver:{...driver,get:async key=>{
  const row=map.get(key);
  if(row){
   try{
    const file=join(root,row.path);
    if(existsSync(file)&&realpathSync(file).startsWith(root+sep)){
     const bytes=readFileSync(file);
     if(bytes.length===row.meta.bytes&&hash(bytes)===row.meta.sha256){stats.cachedAssets++;return bytes;}
    }
   }catch{}
   stats.remoteAssets++;
  }
  return driver.get(key);
 }}};
}
export async function saveConsumerCache(output,good,value){
 if(!value||good?.manifest?.scope!=='PER_ISSUER_ELIGIBILITY')return;
 const root=directory(value);await mkdir(dirname(root),{recursive:true});
 const stage=await mkdtemp(join(dirname(root),'ci-safe-cache-'));
 try{
  const unique=new Map();for(const row of records(good))if(!unique.has(row.path))unique.set(row.path,row);
  await objectPool([...unique.values()],async ({path,meta})=>{
   const source=join(output,path),bytes=readFileSync(source);
   if(bytes.length!==meta.bytes||hash(bytes)!==meta.sha256)throw Error('CACHE_SOURCE_INTEGRITY_FAILED');
   const target=join(stage,path);await mkdir(dirname(target),{recursive:true});await copyFile(source,target);
  });
  await rm(root,{recursive:true,force:true});await rename(stage,root);
 }finally{await rm(stage,{recursive:true,force:true});}
}
