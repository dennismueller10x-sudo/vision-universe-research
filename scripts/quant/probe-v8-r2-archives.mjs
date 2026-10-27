#!/usr/bin/env node
// Read-only inspection of the existing History Store's two index variants.
// No bucket listing, raw series fetch, write, delete or credential publication.
import {createS3Driver} from '../market/storage/s3-driver.mjs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import * as zlib from 'node:zlib';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),Guard=require('../../quant/engines/zero-cost-guard.js'),History=require('../../quant/engines/history-store.js');
const sha=b=>createHash('sha256').update(b).digest('hex');
const {gunzipSync,zstdDecompressSync}=zlib;
const REQUIRED=['VU_HISTORY_S3_ENDPOINT','VU_HISTORY_S3_BUCKET','VU_HISTORY_S3_ACCESS_KEY_ID','VU_HISTORY_S3_SECRET_ACCESS_KEY'];
const MAX_BYTES=4*1024*1024,MAX_UNPACKED_BYTES=32*1024*1024;
const safeError=e=>{const status=String(e.message).match(/HTTP (\d{3})/);return status?'HTTP_'+status[1]:/BUDGET/.test(String(e.message))?'READ_BUDGET_EXCEEDED':'NETWORK_OR_INDEX_SCHEMA_FAILURE';};

export async function probe({env=process.env,fetchImpl=globalThis.fetch}={}){
 const budget=Guard.createBudget({classAOperations:0,classBOperations:4});
 const report={schemaVersion:'quant-v8-r2-archive-probe-1.0.0',observedAt:new Date().toISOString(),gitHead:env.GITHUB_SHA||null,runId:env.GITHUB_RUN_ID||null,credentialBindings:Object.fromEntries(REQUIRED.map(k=>[k,Boolean(env[k])])),limits:{maximumRequests:4,maximumIndexGets:2,maximumCompressedIndexBytes:MAX_BYTES,maximumDecompressedIndexBytes:MAX_UNPACKED_BYTES,maximumPublishedSampleRecords:100},networkRequests:0,downloadedBytes:0,objects:[],state:'NOT_CONFIGURED_IN_THIS_RUNTIME',productionApproved:false,rawDataPublished:false,scope:'Known History Store index keys only; absent keys do not establish an empty bucket or absent historical archives.'};
 if(REQUIRED.some(k=>!env[k]))return {...report,budgetSpent:budget.spent};
 let gets=0,publishedSamples=0;
 const boundedFetch=async(url,options)=>{
  if(!['HEAD','GET'].includes(options.method)||new URL(url).search)throw Error('READ_BUDGET_METHOD');
  if(report.networkRequests>=4||options.method==='GET'&&gets>=2)throw Error('READ_BUDGET_REQUESTS');
  budget.consumeClassB(1,'V8 existing index metadata');report.networkRequests++;if(options.method==='GET')gets++;
  const response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(20000)});
  if(options.method==='HEAD')return response;
  const declared=Number(response.headers.get('content-length')||0);
  if(declared>MAX_BYTES){await response.body?.cancel();throw Error('READ_BUDGET_BYTES');}
  const chunks=[];let size=0;
  if(response.body){const reader=response.body.getReader();for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw Error('READ_BUDGET_BYTES');}chunks.push(value);}}
  report.downloadedBytes+=size;budget.noteDownload(size);
  return new Response(Buffer.concat(chunks),{status:response.status,statusText:response.statusText,headers:response.headers});
 };
 let driver;
 try{driver=createS3Driver({endpoint:env.VU_HISTORY_S3_ENDPOINT,bucket:env.VU_HISTORY_S3_BUCKET,region:env.VU_HISTORY_S3_REGION||'auto',accessKeyId:env.VU_HISTORY_S3_ACCESS_KEY_ID,secretAccessKey:env.VU_HISTORY_S3_SECRET_ACCESS_KEY,maxRetries:0,fetchImpl:boundedFetch});}
 catch{return {...report,state:'CONFIGURATION_INVALID',budgetSpent:budget.spent};}
 for(const extension of ['gz','zst']){
  const key=History.LAYOUT+'/tiingo/daily/US/_index.json.'+extension;
  const item={key,state:'UNTESTED'};report.objects.push(item);
  try{
   const head=await driver.head(key);
   if(!head){item.state='KNOWN_INDEX_NOT_FOUND';continue;}
   item.state='INDEX_METADATA_CONFIRMED';item.bytes=head.size;item.lastModified=head.lastModified;
   if(head.size>MAX_BYTES){item.contentSkipped='COMPRESSED_INDEX_ABOVE_BUDGET';continue;}
   if(extension==='zst'&&typeof zstdDecompressSync!=='function'){item.contentSkipped='RUNTIME_ZSTD_UNAVAILABLE';continue;}
   const bytes=await driver.get(key);if(!bytes){item.state='INDEX_CHANGED_OR_REMOVED_DURING_PROBE';continue;}
   const raw=extension==='gz'?gunzipSync(bytes,{maxOutputLength:MAX_UNPACKED_BYTES}):zstdDecompressSync(bytes,{maxOutputLength:MAX_UNPACKED_BYTES});
   const index=JSON.parse(raw),symbols=index.symbols;
   if(!symbols||typeof symbols!=='object'||Array.isArray(symbols))throw Error('INVALID_INDEX_SCHEMA');
   const names=Object.keys(symbols).sort(),sample=names.filter(x=>/^[A-Z0-9._-]{1,40}$/.test(x)).slice(0,100-publishedSamples);publishedSamples+=sample.length;
   const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
   item.state='INDEX_CONTENT_CONFIRMED';item.compressedSha256=sha(bytes);item.indexSha256=sha(raw);item.symbolCount=names.length;item.generatedAt=typeof index.generatedAt==='string'&&/^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(index.generatedAt)?index.generatedAt:null;
   item.sample=sample.map(ticker=>{const row=symbols[ticker]||{};return {ticker,first:date(row.first),last:date(row.last),barCount:Number.isSafeInteger(row.barCount)?row.barCount:null};});
  }catch(e){item.state='UNRESOLVED';item.reason=safeError(e);if(['HTTP_401','HTTP_403','HTTP_429'].includes(item.reason))break;}
 }
 report.state=report.objects.some(x=>x.state==='INDEX_CONTENT_CONFIRMED')?'READABLE_INDEX_PROVED':report.objects.some(x=>x.state==='INDEX_METADATA_CONFIRMED')?'READABLE_INDEX_METADATA_PROVED':report.objects.some(x=>x.state==='UNRESOLVED')?'ACCESS_OR_SCHEMA_UNRESOLVED':'KNOWN_INDEX_KEYS_NOT_FOUND';
 report.budgetSpent=budget.spent;
 report.limitations=['This bounded probe does not list or qualify all objects, raw corporate actions, original SEC vintages or private backtest generations.','Index metadata is not historical listing-class or PIT-population evidence.','Bindings are observed only in the executing runtime; missing bindings do not prove missing secrets in another authorized environment.'];
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const out=resolve(process.argv[2]||'.verification/v8-r2');
 if(!out.startsWith(resolve('.verification')+'/'))throw Error('DERIVED_OUTPUT_REQUIRED');
 const result=await probe();result.codeHash=sha(readFileSync(new URL(import.meta.url)));
 mkdirSync(out,{recursive:true});writeFileSync(join(out,'r2-assessment.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({state:result.state,networkRequests:result.networkRequests,downloadedBytes:result.downloadedBytes}));
}
