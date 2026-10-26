#!/usr/bin/env node
// Offline, bounded, read-only archive assessment. Publishes derived metadata only.
import {readFileSync,readdirSync,lstatSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {scanCorporateActionSeries} from '../market/tiingo2-corporate-action-scan.mjs';
const require=createRequire(import.meta.url), CA=require('../../quant/engines/corporate-action-evidence.js'), Adapter=require('../../quant/engines/weekly-real-adapter.cjs'), Returns=require('../../quant/engines/return-series.js'), Weekly=require('./run-real-weekly-backtest.cjs'), Benchmark=require('../../quant/engines/weekly-benchmark.cjs'), Store=require('../../quant/engines/research-artifacts.cjs');
const root=process.cwd(),out=resolve(process.argv[2]||'.verification/v8-archives');
if(!out.startsWith(resolve(root,'.verification')+'/'))throw Error('DERIVED_OUTPUT_REQUIRED');
const sha=b=>createHash('sha256').update(b).digest('hex'), loader=Adapter.createLoader(root), master=JSON.parse(readFileSync(join(root,'quant/data/market/security-master/us-security-master.json'))), ids=new Map(master.rows.map(r=>[r.baseline_security_id,r]));
const report={schemaVersion:'v8-private-archives-1.1.0',gitHead:process.env.GITHUB_SHA||null,runId:process.env.GITHUB_RUN_ID||null,codeHash:sha(readFileSync(new URL(import.meta.url))),rawPublication:false,providerRequests:0,productionApproved:false,runtime:Adapter.calculationRuntime(),cacheRestores:{discover:{key:'discover-market-cache-40047253956',hit:process.env.V8_DISCOVER_CACHE_HIT==='true'},tiingo:{key:'tiingo2-encrypted-v1-main-39962041711',hit:process.env.V8_TIINGO_CACHE_HIT==='true'},sec:{key:'sec-fundamentals-40087710308',hit:process.env.V8_SEC_CACHE_HIT==='true'}},archives:[],series:[],weeklyRequalification:[],secFacts:{files:0,factObservations:0,accessions:new Set(),earliestFiled:null,latestFiled:null},budgets:{maxFiles:250000,maxFileBytes:64*1024*1024,maxProcessedBytes:20*1024**3}};
const originalHeaderPath=join(root,'docs/quant-recovery/v8/sec-acceptance-validation.json'), originalHeaders=existsSync(originalHeaderPath)?JSON.parse(readFileSync(originalHeaderPath)).results:[];
const originalByKey=new Map(originalHeaders.filter(x=>x.state==='MATCH').map(x=>[String(x.cik).replace(/^0+/, '')+':'+x.accession,x]));
const originalAudit=new Map();
report.normalizedFactbooks={files:0,sourceCompanyfactsHashBound:0,timelines:0,observations:0,restatedTimelines:0,missingAvailability:0,dateOnlyAvailability:0,exactAvailability:0,availabilityBeforePeriodEnd:0,provenanceAccessionPresent:0,filingIndexEntries:0,filingIndexAcceptancePresent:0,qualityCounts:{},earliestAvailability:null,latestAvailability:null,earliestFiscalYear:null,latestFiscalYear:null,scope:'Stored normalized accession-specific timelines; missing first filings and original XBRL vintage completeness not established'};
let count=0,total=0,processedBytes=0,metadataTruncated=false;const fingerprints=[],metadataFingerprints=[],budgetEvents=[],requalified=new Map();
function processJson(p,bytes){
 let doc;try{doc=JSON.parse(bytes);}catch{return false;}
 if(Array.isArray(doc?.factbook?.timelines)){
  const n=report.normalizedFactbooks;n.files++;
  if(/^[a-f0-9]{64}$/.test(doc.raw_companyfacts_sha256||''))n.sourceCompanyfactsHashBound++;
  for(const filing of doc.filing_index||[]){n.filingIndexEntries++;if(filing.acceptance_datetime)n.filingIndexAcceptancePresent++;}
  for(const t of doc.factbook.timelines){
   n.timelines++;if(t.restated)n.restatedTimelines++;
   if(Number.isInteger(t.fiscal_year)){n.earliestFiscalYear=n.earliestFiscalYear===null?t.fiscal_year:Math.min(n.earliestFiscalYear,t.fiscal_year);n.latestFiscalYear=n.latestFiscalYear===null?t.fiscal_year:Math.max(n.latestFiscalYear,t.fiscal_year);}
   for(const observation of t.observations||[]){
    n.observations++;const available=observation.available_from;
    if(!available)n.missingAvailability++;else{
     if(String(available).includes('T'))n.exactAvailability++;else n.dateOnlyAvailability++;
     if(observation.period_end&&String(available).slice(0,10)<observation.period_end)n.availabilityBeforePeriodEnd++;
     n.earliestAvailability=!n.earliestAvailability||available<n.earliestAvailability?available:n.earliestAvailability;n.latestAvailability=!n.latestAvailability||available>n.latestAvailability?available:n.latestAvailability;
    }
    const quality=observation.quality||'UNSPECIFIED';n.qualityCounts[quality]=(n.qualityCounts[quality]||0)+1;
    const accession=observation.provenance?.accession;if(accession)n.provenanceAccessionPresent++;
    const key=String(doc.cik).replace(/^0+/, '')+':'+accession,header=originalByKey.get(key);
    if(header){
     if(!originalAudit.has(key))originalAudit.set(key,{cik:String(doc.cik),accession,originalHeaderHash:header.sourceHash,expectedAcceptanceUtc:header.acceptanceUtc,observations:0,availabilityMatches:0,availabilityConflicts:0,missingAvailability:0,metrics:new Set()});
     const audit=originalAudit.get(key);audit.observations++;audit.metrics.add(t.metric);
     if(!available)audit.missingAvailability++;else if(available===header.acceptanceUtc)audit.availabilityMatches++;else audit.availabilityConflicts++;
    }
   }
  }
 }
 if(doc?.facts){report.secFacts.files++;for(const tax of Object.values(doc.facts))for(const concept of Object.values(tax||{}))for(const values of Object.values(concept.units||{}))for(const f of values||[]){report.secFacts.factObservations++;if(f.accn)report.secFacts.accessions.add(f.accn);if(f.filed){report.secFacts.earliestFiled=!report.secFacts.earliestFiled||f.filed<report.secFacts.earliestFiled?f.filed:report.secFacts.earliestFiled;report.secFacts.latestFiled=!report.secFacts.latestFiled||f.filed>report.secFacts.latestFiled?f.filed:report.secFacts.latestFiled;}}}
 const rows=Array.isArray(doc?.bars)?doc.bars:Array.isArray(doc?.rows)&&doc.rows.some(r=>r?.adjClose)?doc.rows:null;
 if(!rows?.length)return;
 const ticker=doc.ticker||doc.metadata?.ticker||doc.securityId?.replace(/^ref_/,'')||null;if(!ticker||!/^[A-Za-z0-9_.-]+$/.test(ticker))return;
 const result=scanCorporateActionSeries([{ticker,bars:rows,sourceSha256:sha(bytes)}]).results[0];report.series.push(result);
 const securityId=doc.securityId||'ref_'+ticker,wp=join(root,'quant/data/market/discover-series-long',securityId+'.json'),identity=ids.get(securityId);
 if(!existsSync(wp)||!identity)return;
 const weekly=JSON.parse(readFileSync(wp));let before;try{loader(securityId);before='QUALIFIED';}catch(e){before=e.message.split(':')[0];}
 if(before!=='CORPORATE_ACTION_UNRESOLVED')return;
 // No fill and no price edits: fresh evidence requires exact split-adjusted weekly parity.
 const bars=rows.map(r=>({...r,date:String(r.date).slice(0,10)}));
 let daily;try{daily=Returns.splitAdjusted(bars).map((close,i)=>({date:bars[i].date,close}));}catch{return;}
 if(!Array.isArray(daily))return;
 const by=new Map(daily.map(r=>[r.date,r.close]));
 if(!weekly.points.every(([d,v])=>by.has(d)&&Math.abs(by.get(d)-v)<=0.00500001))return;
 const evidence=CA.evidence(daily,weekly.points,bars);if(!evidence)return;
 const revised={...weekly,corporateActions:evidence};let after;try{loader(securityId,JSON.stringify(revised));after='QUALIFIED';}catch(e){after=e.message.split(':')[0];}
 report.weeklyRequalification.push({securityId,before,after,weeklySourceHash:sha(readFileSync(wp)),dailySourceHash:sha(bytes),evidenceHash:sha(JSON.stringify(evidence)),pricesModified:false});
 if(after==='QUALIFIED'&&!requalified.has(securityId))requalified.set(securityId,{revised,dailySourceHash:sha(bytes),weeklySourceHash:sha(readFileSync(wp))});
}
// Metadata discovery is distinct from bounded content parsing. Opaque archive
// binaries (ciphertext/ZIP) are not loaded into memory or mislabeled parsed.
function walk(dir,summary){
 if(!existsSync(dir)||metadataTruncated)return;
 for(const name of readdirSync(dir).sort()){
  if(metadataTruncated)return;
  const p=join(dir,name),st=lstatSync(p);
  if(st.isSymbolicLink()){summary.linksSkipped++;continue;}
  if(st.isDirectory()){walk(p,summary);continue;}
  if(!st.isFile())continue;
  if(count>=report.budgets.maxFiles){metadataTruncated=true;budgetEvents.push({reason:'DISCOVERED_FILE_LIMIT',limit:report.budgets.maxFiles,discoveredFiles:count});return;}
  count++;total+=st.size;summary.files++;summary.bytes+=st.size;
  metadataFingerprints.push(relative(root,p)+'\0'+st.size);
  if(!name.endsWith('.json')&&!name.endsWith('.gz')){summary.opaqueFiles++;summary.opaqueBytes+=st.size;continue;}
  summary.candidateFiles++;
  if(st.size>report.budgets.maxFileBytes){summary.oversizeSkipped++;summary.oversizeBytes+=st.size;continue;}
  if(processedBytes+st.size>report.budgets.maxProcessedBytes){summary.budgetSkippedFiles++;summary.budgetSkippedBytes+=st.size;continue;}
  const bytes=readFileSync(p);processedBytes+=bytes.length;summary.readBytes+=bytes.length;
  fingerprints.push(relative(root,p)+'\0'+sha(bytes));
  if(name.endsWith('.gz')){
   try{const unpacked=gunzipSync(bytes,{maxOutputLength:report.budgets.maxFileBytes});summary.decompressedBytes+=unpacked.length;if(processJson(p,unpacked)===false)summary.jsonParseFailures++;else summary.parsedFiles++;}
   catch{summary.compressedSkipped++;}
  }else{if(processJson(p,bytes)===false)summary.jsonParseFailures++;else summary.parsedFiles++;}
 }
}
for(const name of ['.market-cache','.sec-cache','quant/data/sec/facts','.quant-state']){
 const summary={path:name,exists:existsSync(name),files:0,bytes:0,candidateFiles:0,parsedFiles:0,readBytes:0,decompressedBytes:0,linksSkipped:0,oversizeSkipped:0,oversizeBytes:0,opaqueFiles:0,opaqueBytes:0,compressedSkipped:0,jsonParseFailures:0,budgetSkippedFiles:0,budgetSkippedBytes:0};
 walk(name,summary);report.archives.push(summary);
}
if(report.archives.some(x=>x.budgetSkippedFiles))budgetEvents.push({reason:'PROCESSED_BYTE_LIMIT',limit:report.budgets.maxProcessedBytes,processedBytes});
report.coverage={metadataDiscoveryComplete:!metadataTruncated,discoveredFiles:count,discoveredBytes:total,processedBytes,opaqueFiles:report.archives.reduce((n,x)=>n+x.opaqueFiles,0),opaqueBytes:report.archives.reduce((n,x)=>n+x.opaqueBytes,0),candidateFiles:report.archives.reduce((n,x)=>n+x.candidateFiles,0),parsedFiles:report.archives.reduce((n,x)=>n+x.parsedFiles,0),oversizeSkipped:report.archives.reduce((n,x)=>n+x.oversizeSkipped,0),compressedSkipped:report.archives.reduce((n,x)=>n+x.compressedSkipped,0),jsonParseFailures:report.archives.reduce((n,x)=>n+x.jsonParseFailures,0),budgetEvents};
report.coverage.state=metadataTruncated||budgetEvents.length||report.coverage.oversizeSkipped||report.coverage.compressedSkipped||report.coverage.jsonParseFailures?'PARTIAL':'COMPLETE_FOR_JSON_AND_GZIP_FORMATS';
report.discoveredMetadataHash=sha(metadataFingerprints.sort().join('\n'));
report.originalAccessionAvailabilityAudit=[...originalAudit.values()].map(x=>({...x,metrics:[...x.metrics].sort()})).sort((a,b)=>(a.cik+':'+a.accession).localeCompare(b.cik+':'+b.accession));
report.secFacts.uniqueAccessions=report.secFacts.accessions.size;delete report.secFacts.accessions;
report.manifestHash=sha(fingerprints.sort().join('\n'));report.summary={files:count,bytes:total,dailySeries:report.series.length,actionCoherentSeries:report.series.filter(r=>r.corporateActionGatePassed).length,additionalQualifiedWeeklySeries:requalified.size};
// Recompute only genuinely newly qualified listings; no original points are edited.
// Existing immutable generation store and independent Python execution reference.
const privateRoot=resolve(process.env.RUNNER_TEMP||tmpdir(),'quant-v8-archive-studies');
report.recoveredStudies={requested:[...requalified.keys()].sort().slice(0,20),candidateListings:requalified.size,maximumStudies:20,results:[],returnBasis:'PRICE_RETURN',certification:'NOT_CERTIFIED',productionApproved:false};
if(requalified.size){
 mkdirSync(privateRoot,{recursive:true,mode:0o700});
 let benchmark;try{benchmark=Benchmark.load(root);}catch(e){benchmark={error:e.message};}
 for(const securityId of report.recoveredStudies.requested){
  const candidate=requalified.get(securityId),sourceBytes=JSON.stringify(candidate.revised),sourceFile=join(privateRoot,securityId+'-source.json');
  writeFileSync(sourceFile,sourceBytes,{mode:0o600});
  try{
   const data={...loader(securityId,sourceBytes),sourcePath:sourceFile},result=Weekly.run(data,{benchmark}),repeat=Weekly.run(data,{benchmark});
   if(result.resultHash!==repeat.resultHash)throw Error('RECOMPUTATION_MISMATCH');
   const clean=JSON.parse(JSON.stringify(result)),generation=Store.publish(join(privateRoot,'generations'),{source:candidate.revised,result:clean}),resultFile=join(privateRoot,securityId+'-result.json');
   writeFileSync(resultFile,JSON.stringify(clean),{mode:0o600});
   const parity=spawnSync('python3',[resolve(import.meta.dirname,'verify-real-weekly-backtest.py'),resultFile],{cwd:root,encoding:'utf8',timeout:90000,maxBuffer:262144});
   if(parity.status!==0)throw Error('INDEPENDENT_PYTHON_PARITY_FAILED');
   const independent=JSON.parse(parity.stdout);
   report.recoveredStudies.results.push({securityId,state:'PASS',sourceBytesHash:data.sourceBytesHash,originalWeeklySourceHash:candidate.weeklySourceHash,rawDailySourceHash:candidate.dailySourceHash,inputHash:result.inputHash,resultHash:result.resultHash,generation:generation.generation,repeatIdentical:true,independent,metrics:result.metrics,marketBenchmarkState:result.marketBenchmark.state,scope:'Existing NEW_52W_HIGH funded price-ledger model; source-derived corporate-action evidence, selected surviving listings; no new market population or prediction confirmation'});
  }catch(e){report.recoveredStudies.results.push({securityId,state:'UNRESOLVED',reason:e.message});}
 }
}
report.codeDependencies=Object.fromEntries(['scripts/quant/audit-v8-archives.mjs','scripts/quant/run-real-weekly-backtest.cjs','scripts/quant/verify-real-weekly-backtest.py','quant/engines/weekly-real-adapter.cjs','quant/engines/return-series.js','quant/engines/corporate-action-evidence.js','quant/engines/weekly-benchmark.cjs','quant/engines/research-classification-evidence.cjs'].map(p=>[p,sha(readFileSync(resolve(import.meta.dirname,'../..',p)))]));
report.limitations=['Archive existence and coherent action factors do not establish historical listing identity, first-filing provenance, complete market coverage or independent evidence.','Companyfacts observations are latest extracted SEC records, not original filing vintages.','Weekly corrections are assessment only; no canonical data, gates or published results changed.'];
mkdirSync(out,{recursive:true});writeFileSync(join(out,'archive-assessment.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report.summary,coverage:report.coverage}));
