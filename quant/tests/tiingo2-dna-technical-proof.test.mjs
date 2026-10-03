import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyDnaTechnicalRecords,verifyDnaFullHistory} from '../../scripts/market/tiingo2-dna-technical-proof.mjs';
import {compareTechnicalExistingPayload,compareSignalExistingPayload,compareTechnicalSummaryExistingPayload,compareChangedExistingProductFiles}
 from '../../scripts/market/tiingo2-existing-product-semantics.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {gzipSync} from 'node:zlib';

function fixture({fullBars=220,baselineBars=210,displayBars=220}={}){
 const dates=Array.from({length:fullBars},(_,i)=>new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10)),
  bars=dates.map((date,i)=>({date,securityId:'ref_DNA',open:10+i,high:11+i,low:9+i,close:10+i,
   volume:100,splitFactor:1,dividend:0,adjustedOpen:10+i,adjustedHigh:11+i,adjustedLow:9+i,
   adjustedClose:10+i,adjustedVolume:100,currency:'USD',adjustmentStatus:'adjusted'})),
  response='a'.repeat(64),latest=dates.at(-1);
 const makeShard=(count,start=0)=>{const window=Math.min(count,displayBars);return {instruments:{DNA:{instrumentId:'DNA',securityId:'ref_DNA',isMock:false,source:'tiingo',
  sourceRevision:'2026-08-09T00:00:00Z',priceSeriesType:'SPLIT_ADJUSTED',bundle:{methodologyVersion:'technical-v1.0.0'},
  provenance:{corporateActionReconciliation:{status:'PASS'},sourceBars:count,last:dates[start+window-1]},
  bars:{timestamps:dates.slice(start,start+window),open:Array.from({length:window},(_,i)=>start+i+1),
   high:Array.from({length:window},(_,i)=>start+i+2),low:Array.from({length:window},(_,i)=>start+i),
   close:Array.from({length:window},(_,i)=>start+i+1),volume:Array(window).fill(100),
   corporateActionFlags:Array(window).fill(false)}}}};};
 const baseline={shard:makeShard(baselineBars,Math.max(0,baselineBars-displayBars)),summary:{rows:{DNA:{technical:'AVAILABLE',bars:baselineBars,asOf:dates[baselineBars-1]}}},signals:{}},
  staged={shard:makeShard(fullBars,Math.max(0,fullBars-displayBars)),summary:{rows:{DNA:{technical:'AVAILABLE',bars:fullBars,asOf:latest}}},signals:{}};
 for(const lookback of [5,20,60]){
  baseline.signals[lookback]={results:[{ticker:'DNA',state:'AVAILABLE',asOf:dates[baselineBars-1],events:[]}],events:[]};
  staged.signals[lookback]={results:[{ticker:'DNA',state:'AVAILABLE',asOf:latest,events:[]}],events:[]};
 }
 const price={ticker:'DNA',securityId:'ref_DNA',provider:'tiingo',currency:'USD',adjustmentStatus:'adjusted',updatedAt:'2026-08-09T00:00:00Z',bars,
  provenance:{sourceResponseSha256:response,seriesSha256:createHash('sha256').update(JSON.stringify(bars)).digest('hex')}},
  correction={evidence:{cik:'0001830214',corporateActionsValid:true,priceHistoryValid:true,latestPriceValid:true,
   secIdentityVerified:true,providerResponseSha256:response,bars:fullBars,latestDate:latest}};
 const baselineHistory={series:{ticker:'DNA',securityId:'ref_DNA',provider:'tiingo',currency:'USD',adjustmentStatus:'adjusted',bars:structuredClone(bars.slice(0,baselineBars))},
  evidence:{bars:baselineBars,firstDate:dates[0],latestDate:dates[baselineBars-1]}};
 return {baseline,staged,replayed:structuredClone(staged),price,correction,baselineHistory};
}
test('DNA technical correction requires native replay and unchanged historical overlap',()=>{
 const input=fixture(),pass=verifyDnaTechnicalRecords(input);
 assert.equal(pass.status,'PASS');
 assert.equal(pass.overlappingVerifiedBars,210);
 const revised=fixture();revised.staged.shard.instruments.DNA.bars.close[0]=999;
 assert.ok(verifyDnaTechnicalRecords(revised).reasonCodes.includes('DNA_EXISTING_PRICE_WINDOW_REWRITTEN'));
 const forged=fixture();forged.staged.signals[60].results[0].events=[{id:'fabricated'}];
 assert.ok(verifyDnaTechnicalRecords(forged).reasonCodes.includes('DNA_SIGNAL_REPLAY_MISMATCH_60'));
 const wrongSource=fixture();wrongSource.price.provenance.sourceResponseSha256='b'.repeat(64);
 assert.ok(verifyDnaTechnicalRecords(wrongSource).reasonCodes.includes('DNA_PRICE_ACTION_IDENTITY_PROOF_MISMATCH'));
 const wrongAction=fixture();wrongAction.correction.evidence.corporateActionsValid=false;
 assert.ok(verifyDnaTechnicalRecords(wrongAction).reasonCodes.includes('DNA_PRICE_ACTION_IDENTITY_PROOF_MISMATCH'));
 const rolling=fixture({fullBars:286,baselineBars:270,displayBars:270});
 assert.equal(verifyDnaTechnicalRecords(rolling).status,'PASS','a producer-owned 270-bar display window may roll forward by the 16 new bars');
 rolling.staged.shard.instruments.DNA.bars.timestamps.splice(100,1);
 assert.ok(verifyDnaTechnicalRecords(rolling).reasonCodes.includes('DNA_TECHNICAL_HISTORY_NOT_APPEND_ONLY'),
  'dropping a middle baseline session is never an allowed rolling-window change');
 const older=fixture({fullBars:1372,baselineBars:1356,displayBars:270});
 assert.equal(verifyDnaTechnicalRecords(older).status,'PASS');
 older.price.bars[100].close+=1;
 assert.ok(verifyDnaFullHistory({baselineHistory:older.baselineHistory,price:older.price,minimumBars:1356}).reasonCodes.includes('DNA_R2_RAW_OR_ACTION_REVISED'),
  'an old price outside the 270-bar technical display window still blocks DNA');
 const adjustment=fixture({fullBars:1372,baselineBars:1356,displayBars:270});adjustment.price.bars[100].adjustedOpen+=0.5;
 assert.ok(verifyDnaFullHistory({baselineHistory:adjustment.baselineHistory,price:adjustment.price,minimumBars:1356}).reasonCodes.includes('DNA_R2_ADJUSTMENT_RESTATEMENT_UNPROVEN'));
});
test('DNA-only technical exception still rejects changed signals and rows for other titles',()=>{
 const proof={status:'PASS'},before={schemaVersion:'v',shard:'DN',generatedAt:'old',instruments:{DNA:{bars:1356},DNR:{bars:400}},unavailable:{}},
  after=structuredClone(before);after.instruments.DNA.bars=1372;after.generatedAt='new';
 assert.equal(compareTechnicalExistingPayload(before,after,{dnaTechnicalProof:proof}).status,'PASS');
 after.instruments.DNR.bars=401;
 assert.equal(compareTechnicalExistingPayload(before,after,{dnaTechnicalProof:proof}).status,'BLOCKED');
 const signalBefore={schemaVersion:'v',lookback:60,scope:'CANONICAL_PRODUCT_UNIVERSE',results:[
  {ticker:'DNA',state:'AVAILABLE',asOf:'2026-09-10'},{ticker:'DNR',state:'AVAILABLE',asOf:'2026-09-10'}],events:[],
  counts:{requested:2,available:2,unavailable:0}},signalAfter=structuredClone(signalBefore);
 signalAfter.results[0].asOf='2026-10-02';
 assert.equal(compareSignalExistingPayload(signalBefore,signalAfter,{dnaTechnicalProof:proof}).status,'PASS');
 signalAfter.results[1].asOf='2026-10-02';
 assert.equal(compareSignalExistingPayload(signalBefore,signalAfter,{dnaTechnicalProof:proof}).status,'BLOCKED');
 const summaryBefore={schemaVersion:'v',source:{},artifacts:{},rows:{DNA:{bars:1356},DNR:{bars:400}}},
  summaryAfter=structuredClone(summaryBefore);summaryAfter.rows.DNA.bars=1372;
 assert.equal(compareTechnicalSummaryExistingPayload(summaryBefore,summaryAfter,{dnaTechnicalProof:proof}).status,'PASS');
 summaryAfter.rows.DNR.bars=401;
 assert.equal(compareTechnicalSummaryExistingPayload(summaryBefore,summaryAfter,{dnaTechnicalProof:proof}).status,'BLOCKED');
});
test('DNA technical permission is bound to exact staged bytes for each product file',()=>{
 const dir=mkdtempSync(join(tmpdir(),'vu-dna-technical-hash-')),root=join(dir,'root'),shadow=join(dir,'shadow'),
  stageRoot=join(dir,'sealed');
 try{
  const base='quant/data/product/technical-signals-v1',files=[];
  const write=(relative,value,gzip=false)=>{
   const left=join(root,relative),right=join(shadow,relative);mkdirSync(dirname(left),{recursive:true});mkdirSync(dirname(right),{recursive:true});
   const bytes=gzip?gzipSync(Buffer.from(JSON.stringify(value))):Buffer.from(JSON.stringify(value));
   writeFileSync(left,bytes);return {right,bytes};
  };
  const staged=(relative,value,gzip=false)=>{
   const bytes=gzip?gzipSync(Buffer.from(JSON.stringify(value))):Buffer.from(JSON.stringify(value)),path=join(shadow,relative);
   const stagedSha256=createHash('sha256').update(bytes).digest('hex'),stagedPath='projection-blobs/'+stagedSha256+'.bin';
   mkdirSync(join(stageRoot,'projection-blobs'),{recursive:true});writeFileSync(join(stageRoot,stagedPath),bytes);
   writeFileSync(path,bytes);files.push({path:relative,projection:true,baselineSha256:'baseline',stagedSha256,stagedPath});
   return files.at(-1).stagedSha256;
  };
  const screener={columns:['s','price'],cols:{s:['DNA'],price:[10]}};
  write('screener/data/universe-US_REAL.json',screener);
  writeFileSync(join(shadow,'screener/data/universe-US_REAL.json'),JSON.stringify(screener));
  const shardBefore={schemaVersion:'v',shard:'DN',instruments:{DNA:{bars:1356}},unavailable:{}},shardAfter=structuredClone(shardBefore);
  shardAfter.instruments.DNA.bars=1372;
  write(base+'/DN.json.gz',shardBefore,true);const stagedShardSha256=staged(base+'/DN.json.gz',shardAfter,true);
  const summaryBefore={schemaVersion:'v',source:{},artifacts:{},rows:{DNA:{bars:1356}}},summaryAfter=structuredClone(summaryBefore);
  summaryAfter.rows.DNA.bars=1372;
  write(base+'/summary.json',summaryBefore);const stagedSummarySha256=staged(base+'/summary.json',summaryAfter);
  const signalSha256={};
  for(const lookback of [5,20,60]){
   const before={schemaVersion:'v',lookback,scope:'CANONICAL_PRODUCT_UNIVERSE',results:[{ticker:'DNA',state:'AVAILABLE',asOf:'2026-09-10'}],
    events:[],counts:{requested:1,available:1,unavailable:0}},after=structuredClone(before);
   after.results[0].asOf='2026-10-02';
   write(base+'/signals-'+lookback+'.json.gz',before,true);
   signalSha256[lookback]={after:staged(base+'/signals-'+lookback+'.json.gz',after,true)};
  }
  const stage={additions:[],files,manifestPath:join(stageRoot,'manifest.json')},proof={status:'PASS',stagedShardSha256,stagedSummarySha256,signalSha256};
  assert.equal(compareChangedExistingProductFiles({root,shadow,stage,baselineScreener:screener,dnaTechnicalProof:proof}).status,'PASS');
  const forged=structuredClone(proof);forged.signalSha256[60].after='0'.repeat(64);
  const result=compareChangedExistingProductFiles({root,shadow,stage,baselineScreener:screener,dnaTechnicalProof:forged});
  assert.equal(result.status,'BLOCKED');assert.ok(result.findings.some(row=>row.path.endsWith('signals-60.json.gz')));
  const tampered=files.find(row=>row.path.endsWith('DN.json.gz'));
  writeFileSync(join(stageRoot,tampered.stagedPath),'tampered');
  assert.equal(compareChangedExistingProductFiles({root,shadow,stage,baselineScreener:screener,dnaTechnicalProof:proof}).status,'BLOCKED',
   'the staged blob must independently match the shadow and sealed manifest');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
