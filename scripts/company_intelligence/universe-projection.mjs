/* 46er-Projektion des live ausgelieferten Universe-GOOD (Entscheidung Steuerung 08.11.2026, Weg a).

   Solange das Universum aktiv ist, rueckt das Legacy-GOOD nicht mehr vor (der Continuous Refresh schreibt nur in den
   Universe-Namensraum). Der eingefrorene 46er-Rollback wuerde nach sieben Tagen verfallen und der Rueckfall endete
   im geschlossenen Gate. Diese Projektion baut aus dem Universe-GOOD einen 46/45-Stand im Legacy-Format:

   - Die 45 Emittenten-Dateien sind BYTEGLEICH zum Universe-GOOD (jede per SHA-256 gegen dessen Manifest gelesen).
   - Nur index.json und die Lookup-Shards entstehen neu, eingeschraenkt auf die 46 Kohortentitel; die Listings je
     Titel stammen unveraendert aus den Universe-Shards.
   - Das Manifest traegt die Kohortenfreigabe (refreshApproved) und die Herkunft (`projection`).
   - Fail-closed: fehlt ein Kohortenemittent oder -titel im Universum, passt ein Hash nicht oder fehlen deutsche
     Profile (45 verlangt, wie GERMAN_PROFILE_REGRESSION im Legacy-Refresh), wird nichts gebaut.

   Liest nur (driver.get); schreibt nur in das lokale Verzeichnis `output`. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {prefixFor,preflight} from './public-delivery.mjs';
import {refreshConfig,frozenInventory,frozenTickers,refreshApproved} from './refresh-approval.mjs';
import {universeConfig} from './universe-approval.mjs';

export const PROJECTION_KIND='UNIVERSE_COHORT_46';
const SCHEMA='vu-company-intelligence-1.0.0';
const sha=b=>createHash('sha256').update(b).digest('hex');
const sorted=a=>[...a].sort();

/* Ein Asset des Universe-GOOD, hash-geprueft gegen dessen Manifest (gleiche Schluessel wie public-delivery). */
async function universeAsset(driver,good,path){
 const meta=good.manifest.assets[path];assert(meta,'PROJECTION_SOURCE_ASSET_MISSING:'+path);
 const key=prefixFor(good.payloadNamespace)+`slot-${good.manifest.slot||0}/`+(path==='index.json'?path:path.split('/').slice(2).join('/'));
 const raw=await driver.get(key),bytes=raw?Buffer.from(raw):null;
 assert(bytes&&bytes.length===meta.bytes&&sha(bytes)===meta.sha256,'PROJECTION_SOURCE_INTEGRITY_FAILED:'+path);
 return bytes;
}

/* Baut den Kandidaten in `output` (leer). Gibt {manifest, inventory, health} fuer den Freeze-Zeiger zurueck. */
export async function projectUniverseCohort(driver,{universe,output,codeSha='local'}){
 const um=universe?.manifest;
 assert(um?.scope==='PER_ISSUER_ELIGIBILITY'&&refreshApproved(um),'PROJECTION_SOURCE_NOT_APPROVED_UNIVERSE');
 assert(!existsSync(output)||readdirSync(output).length===0,'PROJECTION_DIRECTORY_NOT_EMPTY');
 const ug=um.generation,cids=sorted(Object.keys(frozenInventory));
 // Kohorte vollstaendig im Universum: jeder Emittent geeignet, jeder Kohortentitel genau diesem Emittenten zugeordnet.
 const owner={};
 for(const cid of cids){
  const r=um.eligibility[cid];assert(r,'PROJECTION_ISSUER_NOT_IN_UNIVERSE:'+cid);
  for(const t of frozenInventory[cid].tickers){assert(r.tickers.includes(t),'PROJECTION_TICKER_NOT_IN_UNIVERSE:'+t);owner[t]=cid;}
 }
 assert.deepEqual(sorted(Object.keys(owner)),sorted(frozenTickers),'PROJECTION_COHORT_TICKERS_MISMATCH');
 // Emittenten-Dateien bytegleich.
 const payloads={};let german=0;
 for(const cid of cids){
  const bytes=await universeAsset(driver,universe,`snapshots/${ug}/${cid}.json`),p=JSON.parse(bytes);
  assert(p.companyId===cid&&p.schema===SCHEMA&&p.state==='AVAILABLE'&&p.generatedAt===um.generatedAt,'PROJECTION_SOURCE_PAYLOAD_INVALID:'+cid);
  german+=p.companyProfile?.language==='de'?1:0;payloads[cid]={bytes,p};
 }
 assert.equal(german,45,'PROJECTION_GERMAN_PROFILES_INCOMPLETE');
 // Listings je Kohortentitel unveraendert aus den Universe-Shards.
 const listings={},shards=new Map();
 for(const t of frozenTickers){
  const prefix=t.slice(0,2);
  if(!shards.has(prefix))shards.set(prefix,JSON.parse(await universeAsset(driver,universe,`snapshots/${ug}/lookup/${prefix}.json`)));
  const shard=shards.get(prefix),rows=shard.tickers?.[t];
  assert(shard.schema===SCHEMA&&shard.generation===ug&&Array.isArray(rows)&&rows.length&&rows.every(l=>l.companyId===owner[t]),'PROJECTION_SOURCE_LOOKUP_INVALID:'+t);
  listings[t]=rows;
 }
 // Generation: Herkunft + Kohorte + Hashes der uebernommenen Dateien (deterministisch, nie gleich der Universe-Generation).
 const generation=sha(JSON.stringify({kind:PROJECTION_KIND,sourceGeneration:ug,tickers:frozenTickers,payloads:cids.map(cid=>[cid,sha(payloads[cid].bytes)]),listings})).slice(0,24);
 assert.notEqual(generation,ug);
 const assets={},path=cid=>`snapshots/${generation}/${cid}.json`;
 const write=(p,bytes)=>{const file=join(output,p);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,bytes);assets[p]={sha256:sha(bytes),bytes:bytes.length};};
 const json=v=>Buffer.from(JSON.stringify(v)+'\n');
 for(const cid of cids)write(path(cid),payloads[cid].bytes);
 const prefixes=sorted(new Set(frozenTickers.map(t=>t.slice(0,2))));
 for(const prefix of prefixes){
  const rows=Object.fromEntries(sorted(frozenTickers.filter(t=>t.slice(0,2)===prefix)).map(t=>[t,listings[t]]));
  const ids=sorted(new Set(Object.values(rows).flat().map(l=>l.companyId)));
  write(`snapshots/${generation}/lookup/${prefix}.json`,json({schema:SCHEMA,generation,tickers:rows,companies:Object.fromEntries(ids.map(cid=>[cid,path(cid)]))}));
 }
 write('index.json',json({schema:SCHEMA,state:'PREVIEW',generatedAt:um.generatedAt,generation,lookupShards:prefixes,companyCount:45,coveredCompanyCount:45,scope:'CONTROLLED_COHORT'}));
 const manifest={schema:1,generation,generatedAt:um.generatedAt,assets,tickers:[...frozenTickers],sourceUsagePolicy:refreshConfig.sourceUsagePolicy,
  productionApproval:refreshConfig.approvalId,releaseState:'APPROVED_CONTROLLED_PRODUCTION',
  refreshValidation:{status:'PASS',structural:'PASS',profiles:german,privateCompanies:um.refreshValidation.privateCompanies,checkpointSha256:um.refreshValidation.checkpointSha256,codeSha},
  projection:{kind:PROJECTION_KIND,sourceNamespace:universeConfig.consumerNamespace,sourceGeneration:ug,sourceGeneratedAt:um.generatedAt,sourceAssetsSha256:sha(JSON.stringify(um.assets))}};
 assert(refreshApproved(manifest),'PROJECTION_NOT_COHORT_APPROVED');
 writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest)+'\n');
 preflight(output,manifest);
 const inventory=Object.fromEntries(cids.map(cid=>{const p=payloads[cid].p;return [cid,{tickers:frozenInventory[cid].tickers,germanProfile:p.companyProfile?.language==='de',
  financials:p.latestFinancials?.state||'UNAVAILABLE',staleFinancials:Boolean(p.latestFinancials?.stale),news:Array.isArray(p.news)?p.news.length:0}];}));
 return {manifest,inventory,health:universe.health};
}
