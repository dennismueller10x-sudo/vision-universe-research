#!/usr/bin/env node
// Offline, bounded, read-only archive assessment. Publishes derived metadata only.
import {readFileSync,readdirSync,lstatSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {scanCorporateActionSeries} from '../market/tiingo2-corporate-action-scan.mjs';
const require=createRequire(import.meta.url), CA=require('../../quant/engines/corporate-action-evidence.js'), Adapter=require('../../quant/engines/weekly-real-adapter.cjs'), Returns=require('../../quant/engines/return-series.js');
const root=process.cwd(),out=resolve(process.argv[2]||'.verification/v8-archives');
if(!out.startsWith(resolve(root,'.verification')+'/'))throw Error('DERIVED_OUTPUT_REQUIRED');
const sha=b=>createHash('sha256').update(b).digest('hex'), loader=Adapter.createLoader(root), master=JSON.parse(readFileSync(join(root,'quant/data/market/security-master/us-security-master.json'))), ids=new Map(master.rows.map(r=>[r.baseline_security_id,r]));
const report={schemaVersion:'v8-private-archives-1',gitHead:process.env.GITHUB_SHA||null,runId:process.env.GITHUB_RUN_ID||null,codeHash:sha(readFileSync(new URL(import.meta.url))),rawPublication:false,providerRequests:0,productionApproved:false,archives:[],series:[],weeklyRequalification:[],secFacts:{files:0,factObservations:0,accessions:new Set(),earliestFiled:null,latestFiled:null},budgets:{maxFiles:100000,maxFileBytes:64*1024*1024,maxTotalBytes:6*1024**3}};
let count=0,total=0;const fingerprints=[];
function processJson(p,bytes){
 let doc;try{doc=JSON.parse(bytes);}catch{return;}
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
}
function walk(dir,summary){if(!existsSync(dir))return;for(const name of readdirSync(dir).sort()){const p=join(dir,name),s=lstatSync(p);if(s.isSymbolicLink()){summary.linksSkipped++;continue;}if(s.isDirectory()){walk(p,summary);continue;}if(!s.isFile())continue;if(++count>report.budgets.maxFiles||total+s.size>report.budgets.maxTotalBytes)throw Error('ARCHIVE_BUDGET');total+=s.size;summary.files++;summary.bytes+=s.size;if(s.size>report.budgets.maxFileBytes){summary.oversizeSkipped++;continue;}const b=readFileSync(p);fingerprints.push(relative(root,p)+'\0'+sha(b));if(name.endsWith('.gz')){try{processJson(p,gunzipSync(b,{maxOutputLength:report.budgets.maxFileBytes}));}catch{summary.compressedSkipped++;}}else if(name.endsWith('.json')||dir.includes('.sec-cache'))processJson(p,b);}}
for(const name of ['.market-cache','.sec-cache','quant/data/sec/facts','.quant-state']){const summary={path:name,exists:existsSync(name),files:0,bytes:0,linksSkipped:0,oversizeSkipped:0,compressedSkipped:0};walk(name,summary);report.archives.push(summary);}
report.secFacts.uniqueAccessions=report.secFacts.accessions.size;delete report.secFacts.accessions;
report.manifestHash=sha(fingerprints.sort().join('\n'));report.summary={files:count,bytes:total,dailySeries:report.series.length,actionCoherentSeries:report.series.filter(r=>r.corporateActionGatePassed).length,additionalQualifiedWeeklySeries:report.weeklyRequalification.filter(r=>r.after==='QUALIFIED').length};
report.limitations=['Archive existence and coherent action factors do not establish historical listing identity, first-filing provenance, complete market coverage or independent evidence.','Companyfacts observations are latest extracted SEC records, not original filing vintages.','Weekly corrections are assessment only; no canonical data, gates or published results changed.'];
mkdirSync(out,{recursive:true});writeFileSync(join(out,'archive-assessment.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
