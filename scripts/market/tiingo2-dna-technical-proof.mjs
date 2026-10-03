/** Narrow existing-DNA technical refresh proof from current private history.
 * A new producer run must reproduce the exact staged DNA records. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {runExistingProcess} from './tiingo2-fundamentals.mjs';

const read=path=>{const bytes=readFileSync(path);return JSON.parse(path.endsWith('.gz')?gunzipSync(bytes):bytes);};
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const valueHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const technical='quant/data/product/technical-signals-v1';
export function verifyDnaFullHistory({baselineHistory,price,minimumBars=300}){
 const series=baselineHistory?.series,old=series?.bars,current=price?.bars;
 if(series?.ticker!=='DNA'||series?.securityId!=='ref_DNA'||series?.provider!=='tiingo'||
    !Array.isArray(old)||old.length<minimumBars||!Array.isArray(current)||current.length<old.length)
  return {status:'BLOCKED',reasonCodes:['DNA_FULL_R2_BASELINE_UNAVAILABLE'],baselineBars:old?.length??null};
 const byDate=new Map(current.map(bar=>[bar.date,bar])),rawFields=['open','high','low','close','volume','splitFactor','dividend'],
  adjustedFields=['adjustedOpen','adjustedHigh','adjustedLow','adjustedClose','adjustedVolume'];
 let rawMismatch=0,adjustedMismatch=0,missing=0,metadataMismatch=0;
 for(const bar of old){const next=byDate.get(bar.date);if(!next){missing++;continue;}
  if(rawFields.some(field=>!Number.isFinite(bar[field])||!Number.isFinite(next[field])||bar[field]!==next[field]))rawMismatch++;
  if(adjustedFields.some(field=>!Number.isFinite(bar[field])||!Number.isFinite(next[field])||bar[field]!==next[field]))adjustedMismatch++;
  if((bar.currency??series.currency)!==(next.currency??price.currency)||
     (bar.adjustmentStatus??series.adjustmentStatus)!==(next.adjustmentStatus??price.adjustmentStatus))metadataMismatch++;
 }
 const evidence=baselineHistory.evidence;
 const valid=evidence?.bars===old.length&&evidence?.firstDate===old[0]?.date&&evidence?.latestDate===old.at(-1)?.date&&
  old.every((bar,index)=>!index||bar.date>old[index-1].date)&&byDate.size===current.length;
 const reasonCodes=[];
 if(!valid)reasonCodes.push('DNA_R2_INDEX_OR_HISTORY_INCONSISTENT');
 if(missing)reasonCodes.push('DNA_OLD_R2_SESSION_MISSING');
 if(rawMismatch)reasonCodes.push('DNA_R2_RAW_OR_ACTION_REVISED');
 if(adjustedMismatch)reasonCodes.push('DNA_R2_ADJUSTMENT_RESTATEMENT_UNPROVEN');
 if(metadataMismatch)reasonCodes.push('DNA_R2_CURRENCY_OR_ADJUSTMENT_STATUS_CHANGED');
 return {status:reasonCodes.length?'BLOCKED':'PASS',reasonCodes,baselineBars:old.length,comparedBars:old.length-missing,
  missingBars:missing,revisedRawBars:rawMismatch,revisedAdjustedBars:adjustedMismatch,metadataMismatches:metadataMismatch,
  firstDate:old[0]?.date,latestBaselineDate:old.at(-1)?.date};
}
export function verifyDnaTechnicalRecords({baseline,staged,replayed,price,correction,baselineHistory}){
 const reasons=[],before=baseline.shard?.instruments?.DNA,after=staged.shard?.instruments?.DNA,again=replayed.shard?.instruments?.DNA,
  beforeSummary=baseline.summary?.rows?.DNA,afterSummary=staged.summary?.rows?.DNA,againSummary=replayed.summary?.rows?.DNA,
  evidence=correction?.evidence,series=price?.bars??[],dates=new Map((after?.bars?.timestamps??[]).map((date,index)=>[date,index]));
 if(!before||!after||!again||!beforeSummary||!afterSummary||!againSummary)reasons.push('DNA_TECHNICAL_RECORD_MISSING');
 const fullHistory=verifyDnaFullHistory({baselineHistory,price,minimumBars:beforeSummary?.bars??300});
 reasons.push(...fullHistory.reasonCodes);
 if(before?.instrumentId!=='DNA'||before?.securityId!=='ref_DNA'||before?.source!=='tiingo'||
    before?.provenance?.corporateActionReconciliation?.status!=='PASS'||beforeSummary?.technical!=='AVAILABLE')
  reasons.push('DNA_BASELINE_TECHNICAL_IDENTITY_MISMATCH');
 if(!evidence||evidence.cik!=='0001830214'||evidence.corporateActionsValid!==true||evidence.priceHistoryValid!==true||
    evidence.latestPriceValid!==true||evidence.secIdentityVerified!==true||evidence.bars!==series.length||
    evidence.latestDate!==series.at(-1)?.date||price?.ticker!=='DNA'||price?.securityId!=='ref_DNA'||price?.provider!=='tiingo'||
    price?.provenance?.sourceResponseSha256!==evidence.providerResponseSha256||
    price?.provenance?.seriesSha256!==valueHash(series)||series.some(bar=>bar.securityId!=='ref_DNA'))
  reasons.push('DNA_PRICE_ACTION_IDENTITY_PROOF_MISMATCH');
 if(after?.instrumentId!=='DNA'||after?.securityId!=='ref_DNA'||after?.isMock!==false||after?.source!=='tiingo'||
    after?.priceSeriesType!=='SPLIT_ADJUSTED'||after?.bundle?.methodologyVersion!=='technical-v1.0.0'||
    after?.provenance?.corporateActionReconciliation?.status!=='PASS'||
    after?.provenance?.sourceBars!==series.length||after?.provenance?.last!==evidence?.latestDate||
    afterSummary?.technical!=='AVAILABLE'||afterSummary?.bars!==series.length||afterSummary?.asOf!==evidence?.latestDate)
  reasons.push('DNA_NATIVE_TECHNICAL_PROVENANCE_MISMATCH');
 if(after?.sourceRevision!==price?.updatedAt&&after?.sourceRevision!==price?.durableUpdatedAt)
  reasons.push('DNA_TECHNICAL_SOURCE_REVISION_MISMATCH');
 if(!same(after,again)||!same(afterSummary,againSummary))reasons.push('DNA_NATIVE_TECHNICAL_REPLAY_MISMATCH');
 let overlap=0;
 if(before&&after){
  const oldDates=before.bars?.timestamps??[],newDates=after.bars?.timestamps??[],
   oldLast=oldDates.at(-1),appended=newDates.filter(date=>date>oldLast).length,
   dropped=oldDates.length+appended-newDates.length;
  const exactSlidingWindow=Number.isInteger(dropped)&&dropped>=0&&(
   dropped===0||oldDates.length===270&&newDates.length===270)&&
   oldDates.slice(dropped).every((date,index)=>newDates[index]===date)&&
   newDates.slice(oldDates.length-dropped).every(date=>date>oldLast)&&
   newDates.every((date,index)=>!index||newDates[index-1]<date);
  for(let i=0;i<oldDates.length;i++){
   const j=dates.get(oldDates[i]);if(j===undefined)continue;overlap++;
   for(const key of ['open','high','low','close','volume','corporateActionFlags'])
    if(!same(before.bars[key]?.[i],after.bars[key]?.[j])){reasons.push('DNA_EXISTING_PRICE_WINDOW_REWRITTEN');break;}
  }
  if(overlap<200||overlap!==oldDates.length-dropped||!exactSlidingWindow||newDates.at(-1)!==evidence?.latestDate||
     oldLast>=newDates.at(-1))reasons.push('DNA_TECHNICAL_HISTORY_NOT_APPEND_ONLY');
 }
 for(const lookback of [5,20,60]){
  const newer=staged.signals?.[lookback],againSignals=replayed.signals?.[lookback],row=newer?.results?.find(item=>item.ticker==='DNA'),
   rerun=againSignals?.results?.find(item=>item.ticker==='DNA'),events=newer?.events?.filter(item=>item.ticker==='DNA'),
   rerunEvents=againSignals?.events?.filter(item=>item.ticker==='DNA');
  if(!row||row.state!=='AVAILABLE'||row.asOf!==evidence?.latestDate||!same(row,rerun)||!same(events,rerunEvents))
   reasons.push('DNA_SIGNAL_REPLAY_MISMATCH_'+lookback);
 }
 return {status:reasons.length?'BLOCKED':'PASS',reasonCodes:[...new Set(reasons)],baselineBars:beforeSummary?.bars??null,
  freshBars:afterSummary?.bars??null,overlappingVerifiedBars:overlap,latestDate:evidence?.latestDate??null,
  fullHistory,securityId:'ref_DNA',instrumentId:'vu_f4c48467a5f4ef',producer:'scripts/technical/materialize-product-intelligence.mjs',
  methodologyVersion:'technical-v1.0.0',corporateActionStatus:after?.provenance?.corporateActionReconciliation?.status??null};
}
export async function proveDnaTechnicalRefresh({root,shadow,marketStoreDir,sourceCache,secReportPath,workDir,correction,asOf}){
 root=resolve(root);shadow=resolve(shadow);marketStoreDir=resolve(marketStoreDir);workDir=resolve(workDir);
 if(!correction||correction.ticker!=='DNA'||correction.securityId!=='ref_DNA'||
    correction.instrumentId!=='vu_f4c48467a5f4ef')throw Error('DNA_TECHNICAL_CANONICAL_CORRECTION_REQUIRED');
 const pricePath=join(marketStoreDir,'tiingo/daily/ref_DNA.json');
 if(!existsSync(pricePath))throw Error('DNA_PRIVATE_HISTORY_REQUIRED');
 const oldHistoryPath=join(marketStoreDir,'tiingo/baseline/ref_DNA.json');
 if(!existsSync(oldHistoryPath))throw Error('DNA_FULL_R2_BASELINE_REQUIRED');
 const producer='scripts/technical/materialize-product-intelligence.mjs',sourceProducer=join(root,producer),
  shadowProducer=join(shadow,producer),sourceProducerSha256=hash(sourceProducer);
 if(sourceProducerSha256!==hash(shadowProducer))throw Error('DNA_NATIVE_PRODUCER_NOT_CURRENT_MAIN');
 if(!sourceCache||!secReportPath||!existsSync(secReportPath))throw Error('DNA_CACHE_SEC_SOURCE_PROOF_REQUIRED');
 let cacheMatches=0;
 for(const name of readdirSync(join(sourceCache,'evidence')).filter(name=>/^[a-f0-9]{64}\.json$/.test(name))){
  const entry=read(join(sourceCache,'evidence',name));
  if(entry.metadata?.ticker!=='DNA')continue;
  if(entry.key+'.json'!==name||valueHash(entry.rows)!==correction.evidence?.providerResponseSha256||
     entry.summary?.source?.responseSha256!==correction.evidence?.providerResponseSha256||
     valueHash(entry.metadata)!==correction.evidence?.providerMetadataSha256)continue;
  cacheMatches++;
 }
 const sec=read(secReportPath).byTicker?.DNA;
 if(cacheMatches<1||sec?.cik!=='0001830214'||sec?.securityId!=='ref_DNA'||sec?.pitValid!==true||
    sec?.identityVerified!==true||valueHash(sec.identityEvidence)!==correction.evidence?.secIdentitySha256)
  throw Error('DNA_CACHE_SEC_SOURCE_PROOF_MISMATCH');
 const replayDir=join(workDir,'dna-technical-replay'),runner=join(workDir,'dna-technical-replay-runner.mjs');
 const stagedSummary=read(join(shadow,technical,'summary.json'));
 const producerNow=stagedSummary.generatedAt;
 if(!producerNow||!Number.isFinite(Date.parse(producerNow))||producerNow.slice(0,10)<asOf)
  throw Error('DNA_TECHNICAL_PRODUCER_TIME_INVALID');
 mkdirSync(workDir,{recursive:true});
 writeFileSync(runner,`import {materialize} from ${JSON.stringify(pathToFileURL(join(shadow,'scripts/technical/materialize-product-intelligence.mjs')).href)};\nmaterialize({tickers:['DNA'],workDir:${JSON.stringify(marketStoreDir)},outDir:${JSON.stringify(replayDir)}});\n`);
 const run=await runExistingProcess(process.execPath,[runner,'--root',shadow,'--now',producerNow],{cwd:shadow});
 if(run.code!==0)throw Error('DNA_NATIVE_TECHNICAL_REPLAY_FAILED:'+run.output.slice(-500));
 const collect=base=>({shard:read(join(base,technical,'DN.json.gz')),summary:read(join(base,technical,'summary.json')),
  signals:Object.fromEntries([5,20,60].map(n=>[n,read(join(base,technical,'signals-'+n+'.json.gz'))]))});
 const replayed={shard:read(join(replayDir,'DN.json.gz')),summary:read(join(replayDir,'summary.json')),
  signals:Object.fromEntries([5,20,60].map(n=>[n,read(join(replayDir,'signals-'+n+'.json.gz'))]))};
 const result=verifyDnaTechnicalRecords({baseline:collect(root),staged:collect(shadow),replayed,price:read(pricePath),
  baselineHistory:read(oldHistoryPath),correction});
 return {...result,sourcePriceSha256:hash(pricePath),baselineShardSha256:hash(join(root,technical,'DN.json.gz')),
  historicalR2BaselineSha256:hash(oldHistoryPath),sourceProducerSha256,currentCacheResponseSha256:correction.evidence.providerResponseSha256,
  r2IndexSymbolSha256:read(oldHistoryPath).evidence?.indexSymbolSha256,
  r2IndexETagSha256:read(oldHistoryPath).evidence?.indexETagSha256,
  currentSecReportSha256:hash(secReportPath),currentSecIdentitySha256:correction.evidence.secIdentitySha256,
  stagedShardSha256:hash(join(shadow,technical,'DN.json.gz')),
  baselineSummarySha256:hash(join(root,technical,'summary.json')),
  stagedSummarySha256:hash(join(shadow,technical,'summary.json')),
  signalSha256:Object.fromEntries([5,20,60].map(n=>[n,{before:hash(join(root,technical,'signals-'+n+'.json.gz')),
   after:hash(join(shadow,technical,'signals-'+n+'.json.gz'))}]))};
}
