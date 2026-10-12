/** Read-only pre-performance inventory. Sensitive source inputs leave only sealed. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import * as Listing from '../../validation/lib.mjs';
import {loadHistoricalData} from '../tournament/data.mjs';
import {certifyUniversePanel,canonicalListing} from './universe-certification.mjs';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const Identity=require('../../../../core/identity.js');
const Store=require('../../../../quant/engines/history-store.js');
const Guard=require('../../../../quant/engines/zero-cost-guard.js');
const Master=require('../../../../quant/engines/us-security-master.js');
export const INVENTORY_VERSION='supertrader-private-data-inventory-1.0.0';
const privateKeys=['_validation/manifest.json.gz','_validation/sec-pit-r13.json.gz','_validation/sec-delist-r13.json.gz'];
const secKeys=['v1/sec/fundamentals/_manifest.json','v1/sec/fundamentals/_index.json.gz'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
function assertSourceRows(rows){
 const kept=[],rejected={};let supported=0;
 for(const r of rows){
  if(r.assetType!=='Stock'||r.priceCurrency!=='USD'||!Listing.EXCHANGES.has(r.exchange)||!r.startDate){kept.push(r);continue;}
  supported++;
  const reason=!Identity.normalizeTicker(r.ticker)?'SOURCE_TICKER_UNSUPPORTED':!validDate(r.startDate)?'SOURCE_START_DATE_INVALID':r.endDate&&!validDate(r.endDate)?'SOURCE_END_DATE_INVALID':r.endDate&&r.endDate<r.startDate?'SOURCE_DATE_RANGE_INVALID':null;
  if(reason)rejected[reason]=(rejected[reason]||0)+1;else kept.push(r);
 }
 return {kept,rejected,supported};
}
/** Injected driver/documents/rows support hermetic tests; no writes or LIST calls. */
export async function collectDataInventory(options={}){
 const observedAt=options.observedAt||new Date().toISOString(),asOf=observedAt.slice(0,10);
 if(!validDate(asOf))throw Error('INVALID_OBSERVATION_DATE');
 const read=options.readJson||((p)=>JSON.parse(fs.readFileSync(path.join(options.root||root,p),'utf8')));
 const protocol=options.protocol||await read('scripts/supertrader/research/tournament/protocol.json');
 const documents=options.documents||{};
 const universe=documents.universe||await read('quant/data/market/scale/universe-FULL_UNIVERSE.json');
 const eligibility=documents.eligibility||await read('quant/data/market/security-master/eligibility.json');
 const companies=documents.companies||await read('quant/data/market/security-master/company-names.json');
 const consumerIndex=documents.consumerIndex||await Promise.resolve().then(()=>read('quant/data/sec/consumer/index.json')).catch(()=>null);
 let listingRows=options.listingRows,listingSourceHash=listingRows?hash(Buffer.from(JSON.stringify(listingRows))):null;
 if(!listingRows){const r=await fetch(Listing.LIST_URL);if(!r.ok)throw Error('PUBLIC_LISTING_SOURCE_UNAVAILABLE');const bytes=Buffer.from(await r.arrayBuffer());listingRows=Listing.parseTickerCsv(Listing.unzipCsv(bytes));listingSourceHash=hash(bytes);}
 const sourceRows=assertSourceRows(listingRows),classByTicker=new Map((eligibility.decisions||[]).map(d=>[d.ticker,d.instrument_type]));
 const active=new Map((universe.securities||[]).filter(s=>s.active!==false).map(s=>[s.ticker,{startDate:s.startDate,instrumentType:classByTicker.get(s.ticker)||null}]));
 const listings=Listing.buildListingTable(sourceRows.kept,active,{today:asOf}).filter(l=>l.startDate<=protocol.window.to&&(!l.listEnd||l.listEnd>=protocol.window.warmupFrom)).map(canonicalListing);
 const budget=Guard.createBudget({classAOperations:0,classBOperations:30000});
 let driver=options.driver;
 if(!driver){const {createS3DriverFromEnv}=await import('../../../market/storage/s3-driver.mjs');driver=createS3DriverFromEnv(process.env);}
 const readReceipts=new Map();
 const readOnly={kind:driver.kind,async get(key){budget.consumeClassB(1,'READ_ONLY_SOURCE_GET');const b=await driver.get(key);if(b){budget.noteDownload(b.length);readReceipts.set(key,{sourceKey:key,sha256:hash(b),capturedAt:new Date().toISOString(),bytes:b.length});}return b;}};
 // Separate store meters are deliberately unmetered: the driver meters each
 // physical GET once, including usage and optional full canonical series.
 const mainStore=Store.createHistoryStore({driver:readOnly,provider:'tiingo',market:'US',budget:Guard.createBudget({unmetered:true})});
 const pitStore=Store.createHistoryStore({driver:readOnly,provider:'tiingo-delisted',market:'US',budget:Guard.createBudget({unmetered:true})});
 const [a,b]=await Promise.all([mainStore.readUsage(),pitStore.readUsage()]);
 const usage=Guard.applyUsage(a,{classAOperations:b.classAOperations,classBOperations:b.classBOperations});
 const estimate=listings.length+(options.factDocLimit||0)+10;
 if(Guard.evaluate({usage,estimate:Guard.estimateOperations({kind:'VALIDATION_ANALYZE',objectReads:estimate}),operation:'VALIDATION_ANALYZE'}).verdict!==Guard.ALLOWED)throw Error('ZERO_COST_GUARD_BLOCKED');
 const sourceObjects=[],cache=new Map();
 async function getJson(key){
  if(cache.has(key))return cache.get(key);
  const raw=await readOnly.get(key),value=raw?JSON.parse(key.endsWith('.gz')?zlib.gunzipSync(raw).toString('utf8'):raw.toString('utf8')):null;
  sourceObjects.push({key,status:raw?'AVAILABLE':'MISSING',sha256:raw?hash(raw):null,bytes:raw?.length||0,retrievedAt:observedAt});cache.set(key,value);return value;
 }
 const [manifest,pit,delist,secManifest,secIndex]=await Promise.all([...privateKeys.map(k=>getJson(pitStore.seriesPrefix+k)),...secKeys.map(getJson)]);
 const nameByTicker=new Map((companies.rows||[]).map(r=>[r.ticker,r])),roots=Master.collectListedRoots(sourceRows.kept);
 const observedListings=listings.map(l=>{
  const entry=manifest?.entries?.[l.id],current=nameByTicker.get(l.ticker),f=pit?.[l.id],d=delist?.[l.id];
  let classification=null;if(l.source==='STORE_ACTIVE')classification={cls:l.storeClass,included:Listing.INCLUDED_CLASSES.has(l.storeClass)};
  else if(entry&&['OK','PARTIAL'].includes(entry.status))classification=l.source==='UNFETCHABLE_REUSED'?{cls:entry.cls||null,included:entry.included===true}:Listing.classifyListing(Master,l,entry.name,roots);
  const nonStock=Listing.nonStockProduct({ticker:l.ticker,exchange:l.exchange,name:entry?.name||current?.companyName});
  return {listing:l,observedClass:classification?.cls||null,loaderCandidate:classification?.included===true&&!nonStock,nonStockProduct:nonStock,
   seriesManifest:entry||null,historicalIssuerIdentity:{status:'UNVERIFIED',historical:false,reason:'LEGACY_OR_CURRENT_CIK_JOIN_NOT_HISTORICAL_SOURCE_LINK',listingId:l.id,securityId:l.securityId,cik:null,issuerId:null,validFrom:null,validTo:null,knownFrom:null,issuerStructure:'UNKNOWN'},
   cikObservations:{legacyPitCik:f?.cik||null,legacyMappingHow:f?.how||null,currentCompanyCik:current?.cik||null,currentConsumerCik:consumerIndex?.byTicker?.[l.ticker]?.cik||null,currentObservationAt:companies.asOf||companies.generatedAt||observedAt,currentJoinAppliedHistorically:false},
   legacySecInputs:f?{cik:f.cik||null,how:f.how||null,taxonomy:f.taxonomy||null,epsTag:f.epsTag||null,eps:f.eps||[],revenue:f.rev||[],shares:f.shares||[],sourceKey:pitStore.seriesPrefix+privateKeys[1],tupleContract:'periodEnd,value,firstFiled,derivedOrConcept; accession/unit/class scope not retained',certification:'RAW_LEGACY_SOURCE_ONLY_NOT_REVALIDATED'}:null,
   observedDelistingHint:d?{...d,sourceKey:pitStore.seriesPrefix+privateKeys[2],certification:'CLASS_HINT_ONLY_PROCEEDS_NOT_OBSERVED'}:null};
 });
 const factDocs=[];
 const limit=options.factDocLimit??0;if(!Number.isSafeInteger(limit)||limit<0||limit>64)throw Error('INVALID_FACT_DOC_LIMIT');
 for(const cik of Object.keys(secIndex?.objects||{}).sort().slice(0,limit)){
  const entry=secIndex.objects[cik],key=entry.key;
  if(!/^v1\/sec\/fundamentals\/facts\/\d{10}\.json\.gz$/.test(key||'')){factDocs.push({cik,status:'SOURCE_KEY_REJECTED'});continue;}
  const document=await getJson(key);factDocs.push({cik,key,status:document?'AVAILABLE':'MISSING',sourceSha256:sourceObjects.find(o=>o.key===key)?.sha256,document});
 }
 let canonicalData=null;
 if(options.canonical){
  const readPrivate=k=>getJson(pitStore.seriesPrefix+k);
  canonicalData=await (options.canonicalLoader||loadHistoricalData)({...protocol.window,rawDataDeps:{universe,eligibility,companies,listingRows,mainStore,pitStore,readPrivate,today:asOf}});
  if(canonicalData.state==='AVAILABLE'){
   const attach=(security,store,symbol)=>{const key=store.seriesKey(symbol),receipt=readReceipts.get(key);security.priceSource=receipt?{provider:'Tiingo',sourceKey:receipt.sourceKey,sha256:receipt.sha256,capturedAt:receipt.capturedAt,canonicalContractHash:canonicalData.coverage?.canonicalContractHash||null,dataFingerprint:canonicalData.fingerprint,publicationTimeCertification:'NOT_ESTABLISHED_BY_OBJECT_RETRIEVAL'}:null;};
   for(const security of canonicalData.securities){
    const l=security.listing||{},baseId=String(l.id||security.id).split('#')[0],f=pit?.[baseId];
    if(l.source==='STORE_ACTIVE')attach(security,mainStore,l.ticker);else if(l.ticker&&l.startDate)attach(security,pitStore,`${l.ticker}@${l.startDate}`);
    if(f?.cik){security.issuerCik=f.cik;security.issuerCikEvidence={status:'UNVERIFIED',historical:false,sourceKey:pitStore.seriesPrefix+privateKeys[1],legacyHow:f.how||null,reason:'LEGACY_CIK_OBSERVATION_NOT_REVIEWED_HISTORICAL_SECURITY_LINK'};}
    if(f?.fiscalPeriodLinks)security.fiscalPeriodLinks=f.fiscalPeriodLinks;
   }
   if(canonicalData.benchmark)attach(canonicalData.benchmark,pitStore,'SPY@1993-01-29');
  }
 }
 const certification=certifyUniversePanel({listings,providerRows:sourceRows.kept,identityEvidence:options.identityEvidence||[],populationEvidence:options.populationEvidence||null,expectedFormationCalendar:options.expectedFormationCalendar||null,window:protocol.window,asOf,canonicalData});
 const privateInput={schema:INVENTORY_VERSION,observedAt,protocolWindow:protocol.window,listingSource:{url:Listing.LIST_URL,sha256:listingSourceHash,observedAt,classification:'EXISTING_PROVIDER_SUPPORTED_SNAPSHOT_NOT_INDEPENDENT_PIT_POPULATION'},sourceObjects,readReceipts:[...readReceipts.values()],observedListings,secFundamentalManifest:secManifest,secFundamentalIndex:secIndex,secFactDocuments:factDocs,certification,
  availableOfficialResources:[{url:'https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip',role:'RAW_COMPANYFACTS_BULK_NO_HISTORICAL_SECURITY_ROSTER'},{url:'https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip',role:'FILINGS_AND_CURRENT_PROFILE_NOT_HISTORICAL_TICKER_VALIDITY'},{url:'https://www.sec.gov/files/company_tickers_exchange.json',role:'CURRENT_ISSUER_TICKER_SNAPSHOT_NOT_HISTORICAL_MAPPING'}],
  limits:['SEC_NORMALIZED_R2_FACTBOOKS_ARE_SOURCE_INPUTS_NOT_A_MIGRATED_CORE_CERTIFICATE','LEGACY_SHARES_DEI_SUM_AND_WADSO_FALLBACK_REQUIRE_REVALIDATION','SEC_SUBMISSIONS_FORMER_NAMES_DATES_DO_NOT_DATE_SECURITY_OR_EXCHANGE_MEMBERSHIP','CURRENT_INSTRUMENT_CLASS_NOT_RETROACTIVE_PIT_CLASS_PROOF'],performanceCalculated:false};
 const publicStatus={schema:INVENTORY_VERSION,status:manifest&&pit?'SOURCE_INPUTS_AVAILABLE_NOT_CERTIFIED':'PARTIAL_SOURCE_INPUTS',mode:options.canonical?'READ_ONLY_CANONICAL_INVENTORY':'READ_ONLY_COMPACT_INVENTORY',universeState:certification.state,counts:{providerSupportedListingRecords:sourceRows.supported,sourceRowsRejected:Object.values(sourceRows.rejected).reduce((s,n)=>s+n,0),observedListingGenerations:listings.length,legacyPitEntries:Object.keys(pit||{}).length,legacyDelistingEntries:Object.keys(delist||{}).length,secFundamentalIndexedIssuers:Object.keys(secIndex?.objects||{}).length,sourceObjectsAvailable:sourceObjects.filter(o=>o.status==='AVAILABLE').length,sourceObjectsMissing:sourceObjects.filter(o=>o.status==='MISSING').length,readOnlyGetCalls:budget.spent.classB,writeCalls:budget.spent.classA},sourceRights:'PRIVATE_OWNER_SESSION_ONLY',performanceCalculated:false};
 if(canonicalData){publicStatus.canonicalStatus=canonicalData.state;publicStatus.canonicalCounts={inputSegments:canonicalData.coverage?.inputSegments??0,usableSegments:canonicalData.coverage?.usableSegments??0};if(canonicalData.state==='BLOCKED')privateInput.canonicalPrivateDiagnostic=canonicalData.privateDiagnostics||{reason:canonicalData.reason};}
 return {privateInput,publicStatus,canonicalData};
}
export function sealInventory(result,out,{ownerKey,sessionKey,canonicalChunkBytes=8*1024*1024}){
 const dest=path.resolve(out);if(dest===root||dest.startsWith(root+path.sep))throw Error('PRIVATE_OUTPUT_OUTSIDE_REPO_REQUIRED');fs.mkdirSync(dest,{recursive:true,mode:0o700});fs.chmodSync(dest,0o700);
 const seal=(stem,bytes)=>{for(const [audience,key] of [['owner',ownerKey],['session',sessionKey]])fs.writeFileSync(path.join(dest,`${stem}.${audience}.sealed.json`),Listing.encryptForOwner(key,bytes),{mode:0o600});};
 seal('data-certification-inputs',Buffer.from(JSON.stringify(result.privateInput)));
 // Full canonical history can exceed V8's single-string ceiling. Preserve
 // every security/bar/fact in bounded encrypted parts; never truncate inputs.
 if(result.canonicalData?.state==='AVAILABLE'){
  if(!Number.isSafeInteger(canonicalChunkBytes)||canonicalChunkBytes<128||canonicalChunkBytes>64*1024*1024)throw Error('INVALID_CANONICAL_CHUNK_BYTES');
  const data=result.canonicalData,parts=[];let batch=[],batchBytes=0;
  const flush=()=>{if(!batch.length)return;const stem=`canonical-dataset-part-${String(parts.length).padStart(4,'0')}`,bytes=Buffer.from('{"schema":"supertrader-private-canonical-dataset-part-1.0.0","securities":['+batch.join(',')+']}');seal(stem,bytes);parts.push({stem,sha256:hash(bytes),plaintextBytes:bytes.length,securities:batch.length});batch=[];batchBytes=0;};
  for(const security of data.securities){const encoded=JSON.stringify(security),bytes=Buffer.byteLength(encoded);if(bytes>64*1024*1024)throw Error('CANONICAL_SECURITY_OBJECT_TOO_LARGE');if(batch.length&&batchBytes+bytes>canonicalChunkBytes)flush();batch.push(encoded);batchBytes+=bytes+1;}
  flush();
  seal('canonical-dataset-manifest',Buffer.from(JSON.stringify({schema:'supertrader-private-canonical-dataset-manifest-1.0.0',state:data.state,window:data.window,fingerprint:data.fingerprint,coverage:data.coverage,limitations:data.limitations,benchmark:data.benchmark,calendar:data.calendar,securities:data.securities.length,parts,barHistoryTruncated:false,canonicalCoreReused:true,performanceCalculated:false})));
  result.publicStatus.canonicalSealedParts=parts.length;
 }
 fs.writeFileSync(path.join(dest,'data-certification-status.json'),JSON.stringify(result.publicStatus,null,2)+'\n',{mode:0o600});return result.publicStatus;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=flag=>args[args.indexOf(flag)+1],out=args.includes('--out')?arg('--out'):null;
 if(!out)throw Error('EXPLICIT_OUT_REQUIRED');
 try{const result=await collectDataInventory({canonical:args.includes('--canonical'),factDocLimit:args.includes('--fact-doc-limit')?Number(arg('--fact-doc-limit')):0});const status=sealInventory(result,out,{ownerKey:fs.readFileSync(path.join(root,'scripts/supertrader/validation/results-public-key.pem'),'utf8'),sessionKey:fs.readFileSync(path.join(root,'scripts/supertrader/research/tournament/session-public-key.pem'),'utf8')});console.log(JSON.stringify(status));}
 catch(error){const status={schema:INVENTORY_VERSION,status:'INVENTORY_FAILED',errorType:error.name||'Error',performanceCalculated:false};const detail={schema:INVENTORY_VERSION,status,privateDiagnostic:{message:String(error.message),stack:error.stack||null}};const dest=path.resolve(out);if(dest===root||dest.startsWith(root+path.sep))throw Error('PRIVATE_OUTPUT_OUTSIDE_REPO_REQUIRED');fs.mkdirSync(dest,{recursive:true});for(const [a,p] of [['owner','scripts/supertrader/validation/results-public-key.pem'],['session','scripts/supertrader/research/tournament/session-public-key.pem']])fs.writeFileSync(path.join(dest,`data-certification-error.${a}.sealed.json`),Listing.encryptForOwner(fs.readFileSync(path.join(root,p),'utf8'),Buffer.from(JSON.stringify(detail))),{mode:0o600});fs.writeFileSync(path.join(dest,'data-certification-status.json'),JSON.stringify(status)+'\n',{mode:0o600});console.log(JSON.stringify(status));process.exitCode=2;}
}
