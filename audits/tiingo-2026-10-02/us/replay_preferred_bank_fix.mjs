import {readFileSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
const out=dirname(fileURLToPath(import.meta.url)),root=join(out,'../../..');
const require=createRequire(import.meta.url);
const baselineRef='ef666ab3';
const original=p=>{const r=spawnSync('git',['show',baselineRef+':'+p],{cwd:root,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout;};
function evaluate(text,dependency){const module={exports:{}};vm.runInNewContext(text,{module,require:()=>dependency,Date},{timeout:5000});return module.exports;}
const oldBase=evaluate(original('quant/engines/instrument-classification.js'));
const oldMaster=evaluate(original('quant/engines/us-security-master.js'),oldBase);
const newBase=require(join(root,'quant/engines/instrument-classification.js'));
const newMaster=require(join(root,'quant/engines/us-security-master.js'));
const raw=JSON.parse(readFileSync(join(root,'quant/data/market/scale/universe-FULL_UNIVERSE.json'),'utf8')).securities;
const names=new Map(JSON.parse(readFileSync(join(root,'quant/data/market/security-master/company-names.json'),'utf8')).rows.map(r=>[r.ticker,r.companyName]));
const opts={today:'2026-10-02',listedRoots:newMaster.collectListedRoots(raw)};
const changes=[];
for(const r of raw){const input={...r,name:names.get(r.ticker)||r.company||null};
 const before=oldMaster.classifySecurity(input,opts),after=newMaster.classifySecurity(input,opts);
 if(before.instrumentType!==after.instrumentType)changes.push({ticker:r.ticker,name:input.name,before_type:before.instrumentType,after_type:after.instrumentType,
  before_eligible:before.eligibleUsEquity,after_eligible:after.eligibleUsEquity,
  base_before:oldBase.classify(input,opts).instrumentType,base_after:newBase.classify(input,opts).instrumentType});
}
const evidence={generatedAt:new Date().toISOString(),candidate_rows:raw.length,name_source:'quant/data/market/security-master/company-names.json',
 original_engine_source:'git '+baselineRef+' production baseline',changed_count:changes.length,changes,
 period_fix_not_part_of_this_comparison:true,provider_requests:0,production_outputs_regenerated:false};
writeFileSync(join(out,'preferred_bank_fix_replay.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
