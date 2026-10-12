/** Bounded source-input reader. No R2, decrypt, strategy or performance code. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Store=require('../../../../quant/engines/history-store.js'),Identity=require('../../../../core/identity.js');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
export const CANONICAL_INPUT_VERSION='supertrader-bounded-canonical-input-1.0.0';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function directory(dir){const d=fs.realpathSync(path.resolve(dir));if(d===root||d.startsWith(root+path.sep))throw Error('PRIVATE_CANONICAL_INPUT_OUTSIDE_REPO_REQUIRED');return d;}
function partPath(dir,stem){if(!/^canonical-dataset-part-\d{4}$/.test(stem))throw Error('CANONICAL_PART_NAME_INVALID');return path.join(dir,stem+'.json');}
export function loadCanonicalManifest(dir){
 const d=directory(dir),m=JSON.parse(fs.readFileSync(path.join(d,'canonical-dataset-manifest.json')));
 if(m.schema!=='supertrader-private-canonical-dataset-manifest-1.0.0'||!Array.isArray(m.parts)||new Set(m.parts.map(p=>p.stem)).size!==m.parts.length||m.barHistoryTruncated!==false||m.performanceCalculated!==false||!Number.isSafeInteger(m.securities)||m.securities<1)throw Error('CANONICAL_MANIFEST_INVALID');
 for(const p of m.parts){partPath(d,p.stem);if(!/^[a-f0-9]{64}$/.test(p.sha256)||!Number.isSafeInteger(p.plaintextBytes)||p.plaintextBytes<1||p.plaintextBytes>128*1024*1024||!Number.isSafeInteger(p.securities)||p.securities<1)throw Error('CANONICAL_PART_CONTRACT_INVALID');}
 return m;
}
export function* iterateCanonicalSecurities(dir,{verify=true}={}){
 const d=directory(dir),m=loadCanonicalManifest(d);let total=0;
 for(const p of m.parts){const b=fs.readFileSync(partPath(d,p.stem));if(verify&&(b.length!==p.plaintextBytes||hash(b)!==p.sha256))throw Error('CANONICAL_PART_HASH_MISMATCH');const x=JSON.parse(b);if(x.schema!=='supertrader-private-canonical-dataset-part-1.0.0'||!Array.isArray(x.securities)||x.securities.length!==p.securities)throw Error('CANONICAL_PART_MEMBERSHIP_MISMATCH');for(const security of x.securities){total++;yield security;}}
 if(total!==m.securities)throw Error('CANONICAL_TOTAL_MEMBERSHIP_MISMATCH');
}
function keyCandidates(provider,symbol){
 const store=Store.createHistoryStore({driver:{kind:'fs'},provider,market:'US'}),key=store.seriesKey(symbol);
 // Codec suffix is not security identity. Both are the existing store format;
 // the receipt must authenticate the exact physical key actually received.
 return [key.replace(/\.(gz|zst)$/,'.gz'),key.replace(/\.(gz|zst)$/,'.zst')];
}
export function createCanonicalSourceOverlay(inputs,manifest){
 const listings=new Map(),receipts=new Map();
 for(const row of inputs.observedListings||[]){
  const l=row?.listing;
  if(!l?.id||!Identity.normalizeTicker(l.ticker)||l.id!==`tiingo:${l.exchange}:${l.ticker}:${l.startDate}`)throw Error('SOURCE_LISTING_IDENTITY_INVALID');
  if(listings.has(l.id))throw Error('DUPLICATE_SOURCE_LISTING_ID');
  if(l.securityId&&l.securityId!==Identity.securityIdForTicker(l.ticker))throw Error('SOURCE_LISTING_SECURITY_ID_MISMATCH');
  listings.set(l.id,row);
 }
 for(const r of inputs.readReceipts||[]){if(!r?.sourceKey||!/^[a-f0-9]{64}$/.test(r.sha256||''))continue;if(receipts.has(r.sourceKey)&&receipts.get(r.sourceKey).sha256!==r.sha256)throw Error('CONFLICTING_SOURCE_READ_RECEIPTS');receipts.set(r.sourceKey,r);}
 const counts={securities:0,priceSourcesAttached:0,priceSourcesMissing:0,issuerCikDiagnostics:0,existingPriceSourceMismatch:0};
 const receipt=(provider,symbol)=>{const found=keyCandidates(provider,symbol).filter(k=>receipts.has(k)).map(k=>receipts.get(k));if(found.length>1)throw Error('AMBIGUOUS_SOURCE_CODEC_RECEIPTS');return found[0]||null;};
 const price=r=>({provider:'Tiingo',sourceKey:r.sourceKey,sha256:r.sha256,capturedAt:r.capturedAt,canonicalContractHash:manifest.coverage?.canonicalContractHash||null,dataFingerprint:manifest.fingerprint,publicationTimeCertification:'NOT_ESTABLISHED_BY_OBJECT_RETRIEVAL'});
 const apply=security=>{
  counts.securities++;const baseId=String(security.id||'').split('#')[0];
  if(!baseId||security.listing?.id!==baseId)throw Error('CANONICAL_SOURCE_GENERATION_MISMATCH');
  const observed=listings.get(baseId),l=observed?.listing;
  if(l){
   const suffix=String(security.id).slice(l.id.length),sl=security.listing;
   // Reproduce the frozen loader's generation metadata exactly. In particular,
   // listEnd on an active source row is an observed data endpoint, not a new
   // delisting inference; the original normalized loader retained that date.
   if(!sl||sl.id!==l.id||!String(security.id).startsWith(l.id)||(suffix!==''&&!/^#[1-9]\d*$/.test(suffix))||security.ticker!==l.ticker||security.securityId!==Identity.securityIdForTicker(l.ticker)||sl.startDate!==l.startDate||(sl.endDate??null)!==(l.listEnd||l.endDate||null)||sl.active!==(l.active===true)||sl.reusedLater!==(l.reusedLater===true))throw Error('CANONICAL_SOURCE_GENERATION_MISMATCH');
  }
  const r=l?receipt(l.source==='STORE_ACTIVE'?'tiingo':'tiingo-delisted',l.source==='STORE_ACTIVE'?l.ticker:`${l.ticker}@${l.startDate}`):null;
  if(r){if(security.priceSource&&(security.priceSource.sha256!==r.sha256||security.priceSource.sourceKey!==r.sourceKey)){counts.existingPriceSourceMismatch++;throw Error('EXISTING_PRICE_SOURCE_RECEIPT_MISMATCH');}security.priceSource=price(r);counts.priceSourcesAttached++;}else counts.priceSourcesMissing++;
  const f=observed?.legacySecInputs;if(f?.cik){security.issuerCik=f.cik;security.issuerCikEvidence={status:'UNVERIFIED',historical:false,sourceKey:f.sourceKey,legacyHow:f.how||null,reason:'LEGACY_CIK_OBSERVATION_NOT_REVIEWED_HISTORICAL_SECURITY_LINK'};counts.issuerCikDiagnostics++;}
  return security;
 };
 return {apply,attachBenchmark(benchmark){const r=receipt('tiingo-delisted','SPY@1993-01-29');if(r&&benchmark)benchmark.priceSource=price(r);return Boolean(r&&benchmark);},proof(){return {schema:'supertrader-read-receipt-provenance-overlay-1.0.0',version:CANONICAL_INPUT_VERSION,counts:{...counts},readReceiptsSha256:hash(Buffer.from(JSON.stringify(inputs.readReceipts||[]))),observedListingMetadataSha256:hash(Buffer.from(JSON.stringify((inputs.observedListings||[]).map(r=>r.listing)))),baseFingerprintUnchanged:true,priceBarsUnchanged:true,corePriceEngineUnchanged:true,currentCikAppliedHistorically:false,historicalIdentityCertification:'UNVERIFIED',publicationTimeCertification:'NOT_ESTABLISHED_BY_OBJECT_RETRIEVAL',performanceCalculated:false};}};
}
export function loadCanonicalData(dir,{sourceProvenanceOverlay=true,expectedSourceMetadataSha256}={}){
 const d=directory(dir),m=loadCanonicalManifest(d);let inputs=null;
 if(sourceProvenanceOverlay){
  if(!/^[a-f0-9]{64}$/.test(expectedSourceMetadataSha256||''))throw Error('PREDECLARED_SOURCE_METADATA_HASH_REQUIRED');
  const bytes=fs.readFileSync(path.join(d,'data-certification-inputs.json'));
  if(hash(bytes)!==expectedSourceMetadataSha256)throw Error('SOURCE_METADATA_HASH_MISMATCH');
  inputs=JSON.parse(bytes);
 }
 const overlay=inputs?createCanonicalSourceOverlay(inputs,m):null;
 const securities=[];for(const s of iterateCanonicalSecurities(d))securities.push(overlay?overlay.apply(s):s);
 const benchmark=m.benchmark;if(overlay)overlay.attachBenchmark(benchmark);
 return {version:CANONICAL_INPUT_VERSION,state:'AVAILABLE',universeId:'US_PIT_2016_A',window:m.window,fingerprint:m.fingerprint,coverage:m.coverage,limitations:m.limitations||[],securities,benchmark,calendar:m.calendar,spyBars:benchmark?.bars||[],spyTR:(benchmark?.bars||[]).filter(b=>b.date>=m.window.from).map(b=>({date:b.date,value:b.totalReturnIndex})),sourceProvenanceOverlay:overlay?.proof()||null};
}
