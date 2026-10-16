/* Reuse two-slot consumer storage, but expose only the QA-committed GOOD pointer.
   A failed candidate always uses the slot opposite GOOD, even on the next run. */
import {publish,preflight,prefixFor,validateManifest} from './public-delivery.mjs';
import {download} from './download-public.mjs';
import {refreshApproved,refreshConfig} from './refresh-approval.mjs';
import {createHash} from 'node:crypto';
import {objectPool} from './bounded-objects.mjs';
import {universeConfig} from './universe-approval.mjs';
export const activationKey=()=>prefixFor(universeConfig.consumerNamespace)+'activation.json';
export async function universeActive(driver){
 if(!universeConfig.enabled)return false;
 const b=await driver.get(activationKey());if(!b)return false;
 const p=JSON.parse(b);
 if(p.schema!==1||p.approvalId!==universeConfig.approvalId||!['AVAILABLE','ROLLBACK_46'].includes(p.state))throw Error('INVALID_UNIVERSE_ACTIVATION_POINTER');
 return p.state==='AVAILABLE';
}
export async function activeNamespace(driver){return await universeActive(driver)?universeConfig.consumerNamespace:refreshConfig.consumerNamespace;}
export async function activeGood(driver){return goodState(driver,await activeNamespace(driver));}
export const goodKey=namespace=>prefixFor(namespace)+'good.json';
export async function goodState(driver,namespace=refreshConfig.consumerNamespace){
 const raw=await driver.get(goodKey(namespace));if(!raw)return null;
 const p=JSON.parse(raw);if(p.state==='LEGACY_FALLBACK')return null;
 if(p.schema!==1||!refreshApproved(p.manifest)||p.generation!==p.manifest.generation||![namespace+'-a',namespace+'-b'].includes(p.payloadNamespace))throw Error('INVALID_REFRESH_GOOD_POINTER');
 validateManifest(p.manifest);return p;
}
export function goodView(driver,namespace,good){
 const prefix=prefixFor(namespace), manifest=good?Buffer.from(JSON.stringify(good.manifest)):null;
 const previous=null;
 return {...driver,get:key=>key===prefix+'manifest.json'?Promise.resolve(manifest):key===prefix+'previous.json'?Promise.resolve(previous):driver.get(key)};
}
export async function downloadGood(driver,{namespace=refreshConfig.consumerNamespace,output}){
 const good=await goodState(driver,namespace);if(!good)return null;
 const before=Buffer.from(await driver.get(goodKey(namespace)));
 if(good.previous){
  const previous=good.previous;
  await download(goodView(driver,previous.payloadNamespace,previous),{namespace:previous.payloadNamespace,output});
 }
 const result=await download(goodView(driver,good.payloadNamespace,good),{namespace:good.payloadNamespace,output});
 if(!Buffer.from(await driver.get(goodKey(namespace))).equals(before))throw Error('REFRESH_GOOD_CHANGED_DURING_DOWNLOAD');
 preflight(output,good.manifest);return {...result,good};
}
export async function prepareCandidate(driver,{namespace,directory,good}){
 const payloadNamespace=good?.payloadNamespace===namespace+'-a'?namespace+'-b':namespace+'-a';
 const protectedPrior=good?.previous?.payloadNamespace===payloadNamespace?good.previous:null;
 const base=goodView(driver,payloadNamespace,protectedPrior),key=prefixFor(payloadNamespace)+'manifest.json';let written=false;
 const view={...base,get:k=>k===key&&written?driver.get(k):base.get(k),put:async(k,v)=>{await driver.put(k,v);if(k===key)written=true;}};
 const result=await publish(view,{namespace:payloadNamespace,directory});
 return {...result,payloadNamespace,manifest:JSON.parse(await driver.get(key))};
}
export async function commitGood(driver,{namespace,payloadNamespace,manifest,health,inventory,expectedGood}){
 if(!refreshApproved(manifest))throw Error('REFRESH_APPROVAL_REQUIRED');
 if(![namespace+'-a',namespace+'-b'].includes(payloadNamespace))throw Error('INVALID_CANDIDATE_NAMESPACE');
 const key=goodKey(namespace),prior=await driver.get(key);
 const actual=prior?JSON.parse(prior):null;
 if(JSON.stringify(actual?.state==='LEGACY_FALLBACK'?null:actual)!==JSON.stringify(expectedGood))throw Error('CONCURRENT_GOOD_POINTER_ADVANCE');
 // Every candidate asset is hash-read before this sole production pointer write.
 const prefix=prefixFor(payloadNamespace);
 await objectPool(Object.entries(manifest.assets),async ([path,meta])=>{
  const bytes=await driver.get(prefix+`slot-${manifest.slot||0}/`+(path==='index.json'?path:path.split('/').slice(2).join('/')));
  if(!bytes||bytes.length!==meta.bytes||createHash('sha256').update(bytes).digest('hex')!==meta.sha256)throw Error('CANDIDATE_READBACK_FAILED');
 });
 const next={schema:1,state:'GOOD',generation:manifest.generation,payloadNamespace,manifest,health,inventory,
  previous:expectedGood?{manifest:expectedGood.manifest,payloadNamespace:expectedGood.payloadNamespace,generation:expectedGood.generation,health:expectedGood.health,inventory:expectedGood.inventory}:null};
 const bytes=Buffer.from(JSON.stringify(next));
 try{
  await driver.put(key,bytes);
  const back=await driver.get(key);if(!back||!Buffer.from(back).equals(bytes))throw Error('GOOD_POINTER_READBACK_FAILED');
 }catch(error){
  // Unknown commit status must never be interpreted as success. Restore the prior
  // verified pointer; an initial failed commit selects the legacy 6c fallback.
  const restore=prior||Buffer.from(JSON.stringify({schema:1,state:'LEGACY_FALLBACK'}));
  await driver.put(key,restore);const back=await driver.get(key);
  if(!back||!Buffer.from(back).equals(Buffer.from(restore)))throw Error('GOOD_POINTER_RECOVERY_FAILED');
  throw error;
 }
 return next;
}
/* Rollback mit Erwartungsgeneration (CAS-aehnlich) und Idempotenz.
   Statuswerte (kein Schreiben ausser bei ROLLED_BACK):
   - ROLLED_BACK          Zeiger stand auf der erwarteten Generation und zeigt jetzt auf den Vorgaenger.
   - ALREADY_ROLLED_BACK  Zeiger wurde bereits von genau dieser Generation zurueckgerollt (Retry, zweiter Fehlerpfad).
   - GENERATION_MISMATCH  Zeiger steht auf einer fremden Generation oder aenderte sich waehrend des Laufs: KEIN Schreiben.
   - LEGACY_FALLBACK      Es gibt keinen GOOD-Zeiger (mehr): nichts zu tun.
   Ohne expectGeneration gilt die aktuelle Generation als Erwartung; ein bereits zurueckgerollter Zeiger
   (Marker rolledBackFrom, kein Vorgaenger) wird nicht weiter zurueckgeschoben.
   Grenze: Der S3-Treiber kennt keine bedingten Writes (If-Match/ETag). Atomaritaet entsteht ausschliesslich durch die
   Concurrency-Gruppe company-intelligence-continuous-production; hier gilt Lesen-Vergleichen-Schreiben mit erneutem
   Lesen direkt vor dem Write und Nachlesen danach. Ein Restfenster zwischen letztem Lesen und Put bleibt. */
export async function rollbackGood(driver,namespace=refreshConfig.consumerNamespace,{expectGeneration}={}){
 const key=goodKey(namespace),raw=await driver.get(key),good=await goodState(driver,namespace);
 if(!good)return {status:'LEGACY_FALLBACK'};
 const expected=expectGeneration??good.generation;
 if(good.generation!==expected){
  if(good.rolledBackFrom?.generation===expected)return {status:'ALREADY_ROLLED_BACK',generation:good.generation,rolledBackFrom:expected};
  return {status:'GENERATION_MISMATCH',expectedGeneration:expected,actualGeneration:good.generation};
 }
 if(expectGeneration===undefined&&good.rolledBackFrom&&!good.previous)return {status:'ALREADY_ROLLED_BACK',generation:good.generation,rolledBackFrom:good.rolledBackFrom.generation};
 const next=good.previous?{schema:1,state:'GOOD',...good.previous,previous:null,rolledBackFrom:{generation:good.generation}}:{schema:1,state:'LEGACY_FALLBACK'};
 const bytes=Buffer.from(JSON.stringify(next)),prior=Buffer.from(raw);
 // Direkt vor dem Write erneut lesen: hat ein anderer Lauf den Zeiger bewegt, wird nichts geschrieben.
 const again=await driver.get(key);
 if(!again||!Buffer.from(again).equals(prior))return {status:'GENERATION_MISMATCH',expectedGeneration:expected,actualGeneration:'CHANGED_DURING_ROLLBACK'};
 try{
  await driver.put(key,bytes);
  const back=await driver.get(key);if(!back||!Buffer.from(back).equals(bytes))throw Error('ROLLBACK_READBACK_FAILED');
 }catch(error){
  // Unbekannter Schreibstatus: den vorherigen Zeiger byte-genau wiederherstellen und pruefen.
  await driver.put(key,prior);const back=await driver.get(key);
  if(!back||!Buffer.from(back).equals(prior))throw Error('ROLLBACK_RECOVERY_FAILED');
  throw error;
 }
 return {status:'ROLLED_BACK',generation:next.generation||refreshConfig.baselineGeneration,rolledBackFrom:good.generation};
}
