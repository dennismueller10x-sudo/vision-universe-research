// Release packaging only. Canonical sources and R2 objects are never modified.
import {readFile,writeFile,mkdir,copyFile,lstat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
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
export const FACTOR_PROJECTION_BUDGET=4*1024*1024,FACTOR_SHARD_BUDGET=256*1024,CAPABILITY_SHARD_BUDGET=64*1024;
/* Je Master.shardKey die unveraenderten Mitgliedsobjekte der
   Kapazitaetsdatei, in ihrer Reihenfolge, mit den Kopffeldern
   (product-services.js#memberFor). Kein zweiter Schluessel (ADR-001). */
export function capabilityShards(capability){
 if(!capability||!Array.isArray(capability.members))throw Error('INVALID_CAPABILITY_SOURCE');
 const out={};
 for(const member of capability.members){
  if(!member||typeof member.s!=='string')continue;
  const key=Master.shardKey(member.s);
  if(!out[key]){out[key]={};for(const h of Object.keys(capability))if(h!=='members')out[key][h]=capability[h];out[key].shard=key;out[key].members=[];}
  out[key].members.push(member);
 }
 return out;
}
/* AUSLIEFERUNGSANSICHTEN FUER DIE AKTIENSEITE (Payload-Audit 12.10.2026, Teil 2).
   Der Release schreibt aus denselben Quelldateien kleinere Ausschnitte; die
   Quelldateien und ihre Erzeuger bleiben unberuehrt, und jeder Ausschnitt
   traegt die Quellobjekte UNVERAENDERT (Beleg: quant/tests/stock-page-payload.test.mjs).
   Fehlt ein Ausschnitt (lokal, aelterer Stand), liest die Seite wie bisher
   die volle Datei. */

/* Technische Auswertung: ein Scherben (zwei Zeichen, im Mittel 15 Titel,
   bis 1 MB) je Aufruf, gebraucht wird ein Titel. Je Ticker ein Dokument im
   Aufbau des Scherbens - Kopffelder, `instruments` und `unavailable` auf
   diesen Titel beschnitten -, damit der Leser (materializedTechnical,
   technicalUnavailability) dieselben Pruefungen durchlaeuft. */
export const TECHNICAL_TICKER_DIR='quant/data/product/technical-signals-v1/by-ticker/';
export const TECHNICAL_SHARD_PATH=/^quant\/data\/product\/technical-signals-v1\/[A-Z0-9._-]{2}\.json\.gz$/;
export function technicalTickerDocs(shard){
 if(!shard||typeof shard.shard!=='string'||!shard.instruments||typeof shard.instruments!=='object')throw Error('INVALID_TECHNICAL_SHARD');
 const head={};for(const k of Object.keys(shard))if(k!=='instruments'&&k!=='unavailable')head[k]=shard[k];
 const hasUnavailable=Object.hasOwn(shard,'unavailable'),unavailable=shard.unavailable||{};
 const out={};
 for(const ticker of new Set([...Object.keys(shard.instruments),...Object.keys(unavailable)])){
  /* Was der Leser nie anfragt (getTechnicalIntelligence prueft dieselbe Form), wird nicht ausgeliefert. */
  if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))continue;
  const doc={...head,instruments:Object.hasOwn(shard.instruments,ticker)?{[ticker]:shard.instruments[ticker]}:{}};
  if(hasUnavailable)doc.unavailable=Object.hasOwn(unavailable,ticker)?{[ticker]:unavailable[ticker]}:{};
  out[ticker]=doc;
 }
 return out;
}
/* Verzeichnis der Liste (universe-list-v1.json.gz, 126 KB gzip): die
   Aktienseite braucht den Eintrag EINES Titels (mitVerzeichnis), die
   Namenslisten (Start, Aktien, Screener, Strategien, Radar) nur Name, Art
   und Zahl der Gattungen. Je Master.shardKey die unveraenderten Eintraege;
   daneben eine Namensansicht mit s, n, t, il. */
export const UNIVERSE_SHARD_DIR='quant/data/product/universe-list-shards/';
export const UNIVERSE_NAMES_PATH='quant/data/product/universe-names-v1.json.gz';
export const UNIVERSE_NAMES_SCHEMA='universe-names-1.0.0';
export function universeListViews(list){
 if(!list||!Array.isArray(list.entries)||typeof list.schemaVersion!=='string')throw Error('INVALID_UNIVERSE_LIST_SOURCE');
 const head={};for(const k of Object.keys(list))if(k!=='entries')head[k]=list[k];
 const shards={},names=[];
 for(const entry of list.entries){
  if(!entry||typeof entry.s!=='string')continue;
  const key=Master.shardKey(entry.s);
  if(!shards[key])shards[key]={...head,shard:key,entries:[]};
  shards[key].entries.push(entry);
  const slim={s:entry.s};for(const k of ['n','t','il'])if(Object.hasOwn(entry,k))slim[k]=entry[k];
  names.push(slim);
 }
 return {shards,names:{schemaVersion:UNIVERSE_NAMES_SCHEMA,sourceSchemaVersion:list.schemaVersion,generatedAt:list.generatedAt,entries:names}};
}
/* Kursverlauf der Aktienseite fuer die Titel mit voller Historie
   (golden-preview/daily/<id>.json, rund 1 MB, 176 KB gzip): die Seite liest je Kerze
   Datum, Schluss und Splitfaktor (product-services.js#getStockIntelligence).
   Kopffelder unveraendert, Kerzen auf diese drei Felder beschnitten. Die
   volle Datei bleibt daneben (Signale, Erzeuger, Technical Intelligence). */
export const GOLDEN_CHART_VIEW='golden-chart-view-1.0.0';
export const GOLDEN_FILE=/^quant\/data\/market\/golden-preview\/daily\/ref_[A-Za-z0-9_-]+\.json$/;
export function goldenChartView(payload){
 if(!payload||!Array.isArray(payload.bars)||typeof payload.securityId!=='string')throw Error('INVALID_GOLDEN_SOURCE');
 const view={};for(const k of Object.keys(payload))if(k!=='bars')view[k]=payload[k];
 view.chartView=GOLDEN_CHART_VIEW;
 view.bars=payload.bars.map(b=>{const o={};for(const k of ['date','close','splitFactor'])if(b&&Object.hasOwn(b,k))o[k]=b[k];return o;});
 return view;
}
export function permitted(path){
 if(path.split('/').some(p=>p.startsWith('.'))&&path!=='.nojekyll')return false;
 if(/^brand-media\//.test(path))return false; // unveroeffentlichte Markenmedien: nie ausliefern
 if(/^(scripts|docs|providers)\//.test(path)||/\/(tests|fixtures)\//.test(path)||/\.test\.(m?js|py)$/.test(path))return false;
 if(/^quant\/data\/(sec|fundamentals)\//.test(path))return false;
 // Synthetisches Modelluniversum: Generator und Provider dienen nur den Engine-Tests, keine Seite laedt sie.
 if(/^quant\/engines\/mock-(generator|provider)\.js$/.test(path))return false;
 return !/^(README\.md|VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER\.md)$/.test(path);
}
export async function buildRelease({root,output}){
 root=resolve(root);output=resolve(output);
 if(output===root||root.startsWith(output+sep)||output.startsWith(root+sep))throw Error('OUTPUT_MUST_BE_OUTSIDE_SOURCE');
 const paths=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).split('\0').filter(Boolean);
 const emitted=[];await mkdir(output,{recursive:true});
 // Refuse reuse: stale files must not survive a release projection.
 const {readdir}=await import('node:fs/promises');if((await readdir(output)).length)throw Error('OUTPUT_NOT_EMPTY');
 /* Die Scherben der technischen Auswertung werden durch Ausschnitte je Ticker ersetzt (gleiche Datenmenge, ein Titel je Abruf). */
 const technicalShards=paths.filter(p=>TECHNICAL_SHARD_PATH.test(p));
 const replaced=new Set(technicalShards);
 for(const p of paths.filter(p=>permitted(p)&&!replaced.has(p))){const from=resolve(root,p);if(!(await lstat(from)).isFile())throw Error('NON_FILE_INPUT');await mkdir(dirname(resolve(output,p)),{recursive:true});await copyFile(from,resolve(output,p));}
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
 /* Die Aktienseite braucht ein Mitglied der Kapazitaetsdatei (1,2 MB),
    nicht alle: je shardKey ein Ausschnitt. Die volle Datei bleibt daneben
    (Uebersicht, Signale). */
 if(paths.includes('quant/data/universe/market-capability.json')){
  await mkdir(resolve(output,'quant/data/universe/capability-shards'),{recursive:true});
  for(const [key,part] of Object.entries(capabilityShards(await load('quant/data/universe/market-capability.json')))){
   if(!/^[A-Z0-9_]{1,2}$/.test(key))throw Error('CAPABILITY_SHARD_KEY_INVALID');
   const b=Buffer.from(JSON.stringify(part));if(b.length>CAPABILITY_SHARD_BUDGET)throw Error('CAPABILITY_SHARD_BUDGET_EXCEEDED');
   await writeFile(resolve(output,'quant/data/universe/capability-shards/'+key+'.json'),b);
  }
 }
 /* Auslieferungsansichten der Aktienseite (siehe oben). Jeder Schritt liest
    nur Quelldateien des Repositories und schreibt nur in den Release. */
 for(const p of technicalShards){
  const shard=JSON.parse(gunzipSync(await readFile(resolve(root,p))));
  if(shard.shard!==p.slice(p.lastIndexOf('/')+1,-8))throw Error('TECHNICAL_SHARD_KEY_MISMATCH');
  for(const [ticker,doc] of Object.entries(technicalTickerDocs(shard))){
   const target=TECHNICAL_TICKER_DIR+ticker+'.json.gz';
   await mkdir(dirname(resolve(output,target)),{recursive:true});
   await writeFile(resolve(output,target),gzipSync(Buffer.from(JSON.stringify(doc)),{level:9}));
  }
 }
 /* Elliott Home (elliott-home-1.0.0): kompakte Entdeckungsansicht der veroeffentlichten Technical-Intelligence-Shards, nur in der Auslieferung
    (wie die Ausschnitte oben, nie committet). Faellt sie aus, zeigt /elliott/ den Zustand "nicht verfuegbar"; die Website bleibt ausgeliefert. */
 if(paths.includes('quant/data/technical-intelligence/v3/index.json.gz')){
  try{
   const {buildHomeFromDir,HOME_PATH}=await import('../technical/elliott-home/home.mjs');
   await mkdir(dirname(resolve(output,HOME_PATH)),{recursive:true});
   await writeFile(resolve(output,HOME_PATH),JSON.stringify(buildHomeFromDir(root)));
  }catch(e){console.warn('ELLIOTT_HOME_SKIPPED',String(e&&e.message||e).slice(0,200));}
 }
 /* Verfuegbarkeits-Manifest des Aktien-Navigators (scripts/core/stock-availability.mjs, VU3): je shardKey ein kleiner Ausschnitt
    aus den Artefakten dieser Auslieferung, nie committet. Faellt es aus, zeigt der Navigator jedes Modul neutral als "unknown". */
 try{
  const {writeAvailability,AVAILABILITY_DIR}=await import('../core/stock-availability.mjs');
  writeAvailability({root,out:resolve(output,AVAILABILITY_DIR)});
 }catch(e){console.warn('STOCK_AVAILABILITY_SKIPPED',String(e&&e.message||e).slice(0,200));}
 if(paths.includes('quant/data/product/universe-list-v1.json.gz')){
  const views=universeListViews(JSON.parse(gunzipSync(await readFile(resolve(root,'quant/data/product/universe-list-v1.json.gz')))));
  await mkdir(resolve(output,UNIVERSE_SHARD_DIR),{recursive:true});
  for(const [key,part] of Object.entries(views.shards)){
   if(!/^[A-Z0-9_]{1,2}$/.test(key))throw Error('UNIVERSE_SHARD_KEY_INVALID');
   await writeFile(resolve(output,UNIVERSE_SHARD_DIR+key+'.json'),JSON.stringify(part));
  }
  await writeFile(resolve(output,UNIVERSE_NAMES_PATH),gzipSync(Buffer.from(JSON.stringify(views.names)),{level:9}));
 }
 for(const p of paths.filter(p=>GOLDEN_FILE.test(p))){
  await writeFile(resolve(output,p.replace(/\.json$/,'.chart.json')),JSON.stringify(goldenChartView(await load(p))));
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
 async function bundlePage(page,bundlePath,tail=''){
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
  if(tail)chunks.push(tail);
  const bundle=chunks.join('\n;\n'),bundleVersion=createHash('sha256').update(bundle).digest('hex').slice(0,16);
  await writeFile(resolve(output,bundlePath),bundle);
  let bundled=html;for(const tag of tags)bundled=bundled.replace(tag[0],'');
  bundled=bundled.replace('</body>','<script src="/'+bundlePath+'?v='+bundleVersion+'"></script></body>');
  await writeFile(resolve(output,page),bundled);
  return bundleVersion;
 }
 /* FX-Paket der Quant-Aktienseite (Chartstandard, docs/charts/CHART_STANDARD.md): der
    Chartstandard, die FX-Schicht, soweit sie nicht im Buendel steht, die Lizenzkonfiguration
    und die EZB-Reihe EUR/USD in EINER Datei, nachgeladen nur auf der Aktienseite. Einzeln
    waeren es elf Abrufe; die Startseite traegt nichts davon (ihr Byte-Budget). Alles aus
    den unveraenderten Quelldateien dieses Commits, keine zweite Fassung im Repository. */
 const quantHtml=await readFile(resolve(root,'quant/index.html'),'utf8');
 const FX_PACK=['core/chart-standard.js'].concat(['fx-provider-registry','fx-rates','fx-freshness','currency-registry','currency-class',
  'currency-engine','money-format','currency-preference','currency-contract','bootstrap','currency-switch'].map(n=>'quant/engines/fx/'+n+'.js'))
  .filter(p=>!quantHtml.includes('src="/'+p+'"'));
 const FX_DATA=['quant/config/fx-license.json','quant/data/market/fx/ecb/EURUSD.json'];
 // Fehlt eine Quelle (z. B. ein Ausschnitt in Tests), kein Paket: die Seite laedt die Schicht dann einzeln.
 const withPack=FX_PACK.concat(FX_DATA).every(p=>paths.includes(p)&&permitted(p));
 const packChunks=[];
 if(withPack)for(const p of FX_PACK)packChunks.push('/* '+p+' */\n'+await readFile(resolve(root,p),'utf8'));
 const packData=!withPack?null:{license:JSON.parse(await readFile(resolve(root,'quant/config/fx-license.json'),'utf8')),
  series:[JSON.parse(await readFile(resolve(root,'quant/data/market/fx/ecb/EURUSD.json'),'utf8'))]};
 let packTail='';
 if(withPack){
  packChunks.push('(function(g){var F=g.VUFx=g.VUFx||{};F.PACK='+JSON.stringify(packData)+';})(typeof globalThis!=="undefined"?globalThis:this);');
  const pack=packChunks.join('\n;\n'),packVersion=createHash('sha256').update(pack).digest('hex').slice(0,16);
  await writeFile(resolve(output,'quant/fx-pack.js'),pack);
  packTail='globalThis.VUFxPack="/quant/fx-pack.js?v='+packVersion+'";';
 }
 const quantBundle=await bundlePage('quant/index.html','quant/release-bundle.js',packTail);
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
