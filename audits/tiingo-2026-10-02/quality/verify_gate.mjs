#!/usr/bin/env node
// Isolated replay of fresh account evidence; no production artifact writes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const here=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
const Q=require(path.resolve(here,'../../../quant/engines/market-quality.js'));
const source=process.argv[2]||path.resolve(here,'../runtime/account_evidence.json');
const report=JSON.parse(fs.readFileSync(source));
const results=[];
for(const record of report.responses){
  if(!record.references.some(p=>p.group==='quality'||p.id.startsWith('quality-supplemental-'))||!Array.isArray(record.payload)||!record.payload[0]?.close)continue;
  const bars=record.payload.map(b=>({date:b.date.slice(0,10),close:b.close,adjustedClose:b.adjClose,splitFactor:b.splitFactor,dividend:b.divCash}));
  const result=Q.validateAdjustmentConsistency(bars,{claimedStatus:'TOTAL_RETURN'});
  results.push({references:record.references,sha256:record.sha256,source:path.relative(path.resolve(here,'../../..'),source),ok:result.ok,inferredStatus:result.inferredStatus,observed:result.observed,findings:result.findings});
}
fs.writeFileSync(path.join(here,'fresh_gate_verification.json'),JSON.stringify({productionOutputsRegenerated:false,codeFixApplied:true,scope:'Declared action coherence only; ok does not prove corporate-action completeness. Missing reported splits require external reconciliation, and China historical activation is BLOCKED in fitness summary.',results},null,2)+'\n');
process.stdout.write(JSON.stringify({priceSeriesChecked:results.length,passes:results.filter(r=>r.ok).length,failures:results.filter(r=>!r.ok).map(r=>r.references[0].id)})+'\n');
