/** Combine separately measured frozen shards; no strategy or parameter changes. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {historicalParticipants,methods} from './methods.mjs';
import {assertFreeze} from './freeze.mjs';
import {methodOverlap} from './metrics.mjs';
import {currentConsensus} from './runner.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const json=x=>JSON.stringify(x);
const same=(a,b)=>json(a)===json(b);
function profileOverlap(a,b,dimension){
 const labels=dimension==='trend'?['BULL','BEAR','SIDEWAYS','UNKNOWN']:['HIGH_VOL','LOW_VOL','MID_VOL','UNKNOWN'];
 const profile=signals=>Object.fromEntries(labels.map(label=>[label,signals.length?signals.filter(s=>(s.regime?.[dimension]||'UNKNOWN')===label).length/signals.length:null]));
 const pa=profile(a),pb=profile(b);
 return {dimension,distributionOverlap:a.length&&b.length?labels.reduce((v,l)=>v+Math.min(pa[l],pb[l]),0):null,methodA:pa,methodB:pb,interpretation:'Formation-signal distribution overlap only; shared benchmark regimes do not establish independent edges.'};
}
export function assembleShards(shards,current){
 if(!Array.isArray(shards)||!shards.length)throw new Error('HISTORICAL_SHARDS_REQUIRED');
 const first=shards[0],ids=new Set(),expected=historicalParticipants.map(m=>m.id),results=[];
 for(const shard of shards){
  if(shard.status!=='HISTORICAL_MEASURED_CURRENT_SKIPPED'||!Array.isArray(shard.results)||!shard.results.length)throw new Error('INCOMPLETE_HISTORICAL_SHARD');
  if(!shard.freeze||!shard.protocol?.delisting?.baseline||!Array.isArray(shard.protocol.delisting.sensitivity)||shard.protocol.delisting.sensitivity.length!==2||typeof shard.dataFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(shard.dataFingerprint)||!(shard.dataCoverage?.usableSegments>0)||shard.dataCoverage.benchmarkAvailable!==true||shard.benchmarkMetrics?.status!=='READY'||!Number.isFinite(shard.benchmarkMetrics.cagr))throw new Error('REQUIRED_SHARD_METADATA_MISSING');
  if(!same(shard.freeze,first.freeze)||!same(shard.protocol,first.protocol)||shard.dataFingerprint!==first.dataFingerprint||!same(shard.dataCoverage,first.dataCoverage)||!same(shard.benchmarkMetrics,first.benchmarkMetrics))throw new Error('SHARD_FREEZE_PROTOCOL_DATA_BENCHMARK_MISMATCH');
  if(!same(shard.results.map(r=>r.id),shard.selectedMethodIds))throw new Error('SHARD_SELECTION_MISMATCH');
  const variants=[{costMultiplier:2,scenario:shard.protocol.delisting.baseline},...shard.protocol.delisting.sensitivity.map(scenario=>({costMultiplier:1,scenario}))];
  for(const r of shard.results){if(!expected.includes(r.id)||ids.has(r.id)||r.run?.reconciliation?.pass!==true||r.run.costMultiplier!==1||r.run.scenario!==shard.protocol.delisting.baseline||r.sensitivity?.length!==3||r.sensitivity.some((s,i)=>s.reconciliation?.pass!==true||s.costMultiplier!==variants[i].costMultiplier||s.scenario!==variants[i].scenario))throw new Error('SHARD_METHOD_OR_ACCOUNTING_INVALID');ids.add(r.id);results.push(r);}
 }
 if(expected.some(id=>!ids.has(id))||ids.size!==expected.length)throw new Error('FULL_PARTICIPANT_COVERAGE_REQUIRED');
 if(!same(current?.freeze,first.freeze)||!same(current?.protocol,first.protocol)||current.historicalCalculation!=='NOT_RUN_CURRENT_ONLY')throw new Error('CURRENT_SHARD_FREEZE_PROTOCOL_MISMATCH');
 if(current.status==='CURRENT_SCANNED_REVIEW_PENDING'&&(!/^\d{4}-\d{2}-\d{2}$/.test(current.currentAsOf||'')||typeof current.currentFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(current.currentFingerprint)))throw new Error('CURRENT_COMPLETED_METADATA_REQUIRED');
 if(!Array.isArray(current.currentScans)||current.currentScans.length!==methods.length||new Set(current.currentScans.map(s=>s.id)).size!==methods.length||methods.some(m=>!current.currentScans.some(s=>s.id===m.id)))throw new Error('CURRENT_METHOD_COVERAGE_REQUIRED');
 results.sort((a,b)=>expected.indexOf(a.id)-expected.indexOf(b.id));
 const overlap=methodOverlap(results.map(r=>({id:r.id,signals:r.run.signals,curve:r.run.curve}))).map(pair=>{
  const a=results.find(r=>r.id===pair.methodA).run.signals,b=results.find(r=>r.id===pair.methodB).run.signals,ai=new Set(a.map(s=>s.id)),bi=new Set(b.map(s=>s.id)),intersection=[...ai].filter(id=>bi.has(id)).length;
  return {...pair,sameStockFrequency:{uniqueIntersection:intersection,uniqueUnion:new Set([...ai,...bi]).size,uniqueMethodA:ai.size,uniqueMethodB:bi.size},regimeProfileOverlap:[profileOverlap(a,b,'trend'),profileOverlap(a,b,'vol')]};
 });
 const adequate=results.filter(r=>['A','B'].includes(r.ranking.tier)).map(r=>r.id);
 return {...first,schema:'supertrader-consolidated-private-1.0.0',assembledAt:new Date().toISOString(),selectedMethodIds:expected,overlapScope:'FULL_FROZEN_HISTORICAL_PARTICIPANT_SET',shardFingerprintsVerified:true,results,overlap,currentAsOf:current.currentAsOf,currentCoverage:current.currentCoverage,currentLimitations:current.currentLimitations,currentFingerprint:current.currentFingerprint,currentScans:current.currentScans,forwardLedger:current.forwardLedger,consensus:{strongMethods:currentConsensus(current.currentScans,adequate),allFrozenDiagnostic:currentConsensus(current.currentScans,methods.map(m=>m.id)),eligibleStrongMethods:adequate,notAnIndependentTradingScore:true},status:current.status==='CURRENT_SCANNED_REVIEW_PENDING'?'MEASURED_REVIEW_PENDING':'HISTORICAL_MEASURED_CURRENT_BLOCKED',finalReviewPending:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),read=flag=>{const i=args.indexOf(flag);if(i<0||!args[i+1])throw new Error('EXPLICIT_ARGUMENT_REQUIRED');return args[i+1];};
 const out=path.resolve(read('--out'));
 if(out===root||out.startsWith(root+path.sep))throw new Error('PLAINTEXT_OUTPUT_MUST_STAY_PRIVATE');
 const shards=read('--shards').split(',').map(p=>JSON.parse(fs.readFileSync(p))),current=JSON.parse(fs.readFileSync(read('--current'))),result=assembleShards(shards,current);
 assertFreeze(result.freeze);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result));
 console.log(JSON.stringify({status:result.status,participants:result.results.length,currentMethods:result.currentScans.length,fullOverlapPairs:result.overlap.length}));
}
