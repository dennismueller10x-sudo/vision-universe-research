// Release packaging only. Canonical sources and R2 objects are never modified.
import {readFile,writeFile,mkdir,copyFile,lstat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Master=require('../../quant/engines/company-master.js'),History=require('../../quant/api/fundamentals-contract.js'),FactorProjection=require('../../quant/engines/factor-product-projection.js');
export const SEC_BUDGET=8*1024*1024;
const fields=(x,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(x||{},k)).map(k=>[k,x[k]]));
export function projectInspector(source){
 if(!source?.cik||!Array.isArray(source.rows)||source.policy!=='latest_known')throw Error('INVALID_INSPECTOR_SOURCE');
 return {...fields(source,['cik','generated_at_utc','versions','policy','as_of','scope','quality_summary','quality_errors']),
  profile:fields(source.profile,['cik','name','tickers','sic']),
  rows:source.rows.map(row=>fields(row,['metric','fiscal_year','fiscal_period','value','unit','period_start','period_end','available','available_from','filed','form','accession','concept','source','transformation','quality','flags','reason']))};
}
export function projectQuarterly(source){
 if(source?.schema!=='vu-consumer-fundamentals-1.0.0'||source.dataSource?.isMock!==false||source.dataSource?.provider!=='sec_edgar'||source.policy!=='as_of_latest'||!/^\d{10}$/.test(source.cik)||source.versions?.normalization_schema!=='1.0.0'||JSON.stringify(source.columns)!==JSON.stringify(['fy','fp','end','v','filed','accn','derived']))throw Error('INVALID_QUARTERLY_SOURCE');
 const ids=new Set(History.metrics.map(m=>m.id)),quarterly=Object.fromEntries(Object.entries(source.quarterly||{}).filter(([id,rows])=>ids.has(id)&&Array.isArray(rows)&&rows.length));
 if(!Object.keys(quarterly).length)return null;
 const unavailableMetrics={};
 for(const [metric,rows] of Object.entries(quarterly)){const checked=History.validateQuarterlyFacts(rows,{asOf:source.asOf,unit:source.units?.[metric]});if(checked.state!=='AVAILABLE'){unavailableMetrics[metric]='INVALID_FACT_EVIDENCE';delete quarterly[metric];}}
 return {...fields(source,['generatedAtUtc','versions','dataSource','cik','asOf','policy','availability','columns']),schema:'vu-quant-quarterly-1.0.0',sourceSchema:source.schema,
  semantics:{quarterly:source.semantics?.quarterly},units:Object.fromEntries(Object.entries(source.units||{}).filter(([id])=>Object.hasOwn(quarterly,id))),quarterly,unavailableMetrics};
}
export const FACTOR_PROJECTION_BUDGET=4*1024*1024,FACTOR_SHARD_BUDGET=256*1024;
export function permitted(path){
 if(/^reports\/marketstack\/de-eu\//.test(path)||path==='core/config/de-eu-reference-sources.json'||/^core\/data\/de-eu\/series\//.test(path))return false;
 if(path.split('/').some(p=>p.startsWith('.'))&&path!=='.nojekyll')return false;
 if(/^(scripts|docs|providers)\//.test(path)||/\/(tests|fixtures)\//.test(path)||/\.test\.(m?js|py)$/.test(path))return false;
 if(/^quant\/data\/(sec|fundamentals)\//.test(path))return false;
 return !/^(README\.md|VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER\.md)$/.test(path);
}
export async function buildRelease({root,output}){
 root=resolve(root);output=resolve(output);
 if(output===root||root.startsWith(output+sep)||output.startsWith(root+sep))throw Error('OUTPUT_MUST_BE_OUTSIDE_SOURCE');
 const paths=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).split('\0').filter(Boolean);
 // Private local output must never be picked up by the public packager,
 // including an accidentally modified tracked directory descriptor.
 if(paths.includes('core/data/de-eu/listings.json')){
  const local=JSON.parse(await readFile(resolve(root,'core/data/de-eu/listings.json'),'utf8'));
  if(local.state!=='DISABLED'||!Array.isArray(local.listings)||local.listings.length||local.publicDisplay!==false)throw Error('DE_EU_PRIVATE_DATA_PUBLICATION_BLOCKED');
 }
 const emitted=[];await mkdir(output,{recursive:true});
 // Refuse reuse: stale files must not survive a release projection.
 const {readdir}=await import('node:fs/promises');if((await readdir(output)).length)throw Error('OUTPUT_NOT_EMPTY');
 for(const p of paths.filter(permitted)){const from=resolve(root,p);if(!(await lstat(from)).isFile())throw Error('NON_FILE_INPUT');await mkdir(dirname(resolve(output,p)),{recursive:true});await copyFile(from,resolve(output,p));}
 async function json(path,value){const bytes=Buffer.from(JSON.stringify(value));await mkdir(dirname(resolve(output,path)),{recursive:true});await writeFile(resolve(output,path),bytes);emitted.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 const load=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
 /* Produktprojektion der Faktordatei (factor-product-projection.js): die
    Quant-Ansichten laden 3,4 statt 19,2 MB. Die volle Datei bleibt daneben. */
 /* Eigener Schreibweg mit eigenem Budget: das SEC-Auslieferungsbudget unten
    gilt den SEC-Projektionen und bleibt unveraendert. */
 if(paths.includes('quant/data/market/factors/factors-FULL_UNIVERSE.json')){
  const projected=FactorProjection.project(await load('quant/data/market/factors/factors-FULL_UNIVERSE.json'));
  const bytes=Buffer.from(JSON.stringify(projected));
  if(bytes.length>FACTOR_PROJECTION_BUDGET)throw Error('FACTOR_PROJECTION_BUDGET_EXCEEDED');
  await writeFile(resolve(output,'quant/data/market/factors/factors-FULL_UNIVERSE-product.json'),bytes);
  /* Je shardKey ein kleiner Ausschnitt fuer die Aktienseite. */
  await mkdir(resolve(output,'quant/data/market/factors/product-shards'),{recursive:true});
  for(const [key,part] of Object.entries(FactorProjection.shards(projected,Master.shardKey))){
   if(!/^[A-Z0-9_]{1,2}$/.test(key))throw Error('FACTOR_SHARD_KEY_INVALID');
   const b=Buffer.from(JSON.stringify(part));if(b.length>FACTOR_SHARD_BUDGET)throw Error('FACTOR_SHARD_BUDGET_EXCEEDED');
   await writeFile(resolve(output,'quant/data/market/factors/product-shards/'+key+'.json'),b);
  }
 }
 const index=await load('quant/data/sec/inspector_index.json');
 await json('quant/data/sec/inspector_index.json',index);
 for(const name of ['quant-factor-inputs.json','coverage_matrix.json','pit_gates.json'])await json('quant/data/sec/'+name,await load('quant/data/sec/'+name));
 for(const company of index.companies){
  if(!/^[A-Z0-9.-]+$/.test(company.ticker)||!/^\d{10}$/.test(company.cik))throw Error('INVALID_INDEX_IDENTITY');
  const source=await load('quant/data/sec/inspector/'+company.ticker+'.json');
  if(source.cik!==company.cik)throw Error('INSPECTOR_IDENTITY_MISMATCH');
  await json('quant/data/sec/inspector/'+company.ticker+'.json',projectInspector(source));
 }
 // A serving projection of existing consumer facts, not a second SEC pipeline.
 // Bounded shards avoid thousands of filesystem allocation blocks; no universe download.
 const consumerPaths=paths.filter(p=>/^quant\/data\/sec\/consumer\/CIK[0-9]{10}\.json$/.test(p));
 if(consumerPaths.length){
  const manifest=await load('quant/data/universe/master-manifest.json'),eligible=new Set();
  for(const {shard} of manifest.shards.index){const members=await load('quant/data/universe/instruments/'+shard+'.json');for(const member of members.instruments)if(Master.inProductUniverse(member)&&/^\d{10}$/.test(member.cik))eligible.add(member.cik);}
  const quarterlyShards=new Map();
  for(const path of consumerPaths){const cik=path.match(/CIK([0-9]{10})/)[1];if(!eligible.has(cik))continue;
   const source=await load(path);if(source.cik!==cik)throw Error('QUARTERLY_IDENTITY_MISMATCH');const projection=projectQuarterly(source);if(!projection)continue;
   const shard=cik.slice(-2);if(!quarterlyShards.has(shard))quarterlyShards.set(shard,{schema:'vu-quant-quarterly-shard-1.0.0',shard,issuers:{}});quarterlyShards.get(shard).issuers[cik]=projection;
  }
  for(const [shard,payload] of quarterlyShards){
   const raw=Buffer.from(JSON.stringify(payload)),bytes=gzipSync(raw,{level:9}),target='quant/data/sec/quarterly/'+shard+'.json.gz';
   if(raw.length>1048576||bytes.length>131072)throw Error('QUARTERLY_SHARD_BUDGET_EXCEEDED');
   await mkdir(dirname(resolve(output,target)),{recursive:true});await writeFile(resolve(output,target),bytes);emitted.push({path:target,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
 }
 // Delivery-only compaction: preserve canonical shard contents and URLs.
 for(const p of paths.filter(p=>/^quant\/data\/universe\/instruments\/[^/]+\.json$/.test(p))){
  await writeFile(resolve(output,p),JSON.stringify(await load(p)));
 }
 // Concatenate classic scripts in their existing document order. Original
 // modules remain available to every other workspace, including Discover.
 // The canonical Quant product lives at /quant/ (quant/index.html).
 async function bundlePage(page,bundlePath){
  const html=await readFile(resolve(root,page),'utf8');
  const tags=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)];
  // Attributlose Inline-Skripte (Farbschema vor dem ersten Zeichnen setzen,
  // Navigation synchronisieren) bleiben an ihrer Stelle; gebuendelt werden
  // nur die externen klassischen Skripte. Alles andere bleibt unzulaessig.
  const inline=(html.match(/<script>(?:(?!<\/script>)[\s\S])*<\/script>/g)||[]).length;
  if(!tags.length||tags.length+inline!==(html.match(/<script\b/g)||[]).length)throw Error('UNSUPPORTED_SCRIPT_TAG');
  const dir=page.slice(0,page.lastIndexOf('/')+1),chunks=[];
  for(const tag of tags){const p=tag[1].startsWith('/')?tag[1].slice(1):dir+tag[1];
   if(!paths.includes(p)||!permitted(p))throw Error('INVALID_BUNDLE_INPUT');
   chunks.push('/* '+p+' */\n'+await readFile(resolve(root,p),'utf8'));
  }
  const bundle=chunks.join('\n;\n'),bundleVersion=createHash('sha256').update(bundle).digest('hex').slice(0,16);
  await writeFile(resolve(output,bundlePath),bundle);
  let bundled=html;for(const tag of tags)bundled=bundled.replace(tag[0],'');
  bundled=bundled.replace('</body>','<script src="/'+bundlePath+'?v='+bundleVersion+'"></script></body>');
  await writeFile(resolve(output,page),bundled);
  return bundleVersion;
 }
 const quantBundle=await bundlePage('quant/index.html','quant/release-bundle.js');
 // Former entries (/vu2/, /Quant/) are one hop to the canonical product.
 // The query string travels along; /quant/ maps ?view=... to its routes.
 const legacyEntry='<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="canonical" href="/quant/"><title>Vision Universe® Quant</title><script>location.replace("/quant/"+location.search+location.hash)</script></head><body><p><a href="/quant/">Vision Universe® Quant öffnen</a></p></body></html>';
 await mkdir(resolve(output,'vu2'),{recursive:true});
 await writeFile(resolve(output,'vu2/index.html'),legacyEntry);
 // Preserve the capitalized entry used in owner-facing launch links.
 await mkdir(resolve(output,'Quant'),{recursive:true});
 await writeFile(resolve(output,'Quant/index.html'),legacyEntry);
 // Screener universe: a release projection of the Discover data shipped in
 // this very release, so the screener never lags the product it filters.
 // A failure must not block the whole site: the screener then shows its
 // "Daten nicht verfuegbar" state from the status file.
 let screener;
 try{const {writeUniverse}=await import('../screener/build-universe.mjs');screener=await writeUniverse({root,out:resolve(output,'screener/data'),log:()=>{}});}
 catch(e){screener={state:'UNAVAILABLE',reason:String(e&&e.message||e).slice(0,200)};await mkdir(resolve(output,'screener/data'),{recursive:true});await writeFile(resolve(output,'screener/data/status.json'),JSON.stringify(screener));}
 const bytes=emitted.reduce((n,f)=>n+f.bytes,0);
 if(bytes>SEC_BUDGET||emitted.some(f=>f.bytes>2*1024*1024))throw Error('SEC_DELIVERY_BUDGET_EXCEEDED');
 const report={schemaVersion:1,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),storage:'EXISTING_R2_UNCHANGED',secBudget:SEC_BUDGET,secBytes:bytes,files:emitted,excluded:['quant/data/sec/consumer','quant/data/sec/canonical','quant/data/fundamentals'],screener,quantBundle,status:'PASS'};
 await writeFile(resolve(output,'release-delivery.json'),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);if(!output)throw Error('OUTPUT_REQUIRED');
 console.log(JSON.stringify(await buildRelease({root:process.cwd(),output}),null,2));
}
