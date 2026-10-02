import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const out=dirname(fileURLToPath(import.meta.url)),root=join(out,'../../..');
const script=join(root,'scripts/market/build-us-eligibility.mjs');
const baselineRef='ef666ab3';
const tempScript=join(root,'scripts/market/.tiingo-audit-before-eligibility.mjs');
const dir=mkdtempSync(join(tmpdir(),'vu-eligibility-before-after-'));
const protectedFiles=['quant/data/market/security-master/eligibility.json','quant/data/market/scale/universe-FULL_UNIVERSE.json','quant/data/market/scale/universe-ELIGIBLE_US_EQUITY.json'];
const hash=()=>Object.fromEntries(protectedFiles.map(p=>[p,createHash('sha256').update(readFileSync(join(root,p))).digest('hex')]));
const beforeHash=hash();
try {
 const original=spawnSync('git',['show',baselineRef+':scripts/market/build-us-eligibility.mjs'],{cwd:root,encoding:'utf8'});
 if(original.status!==0)throw Error('Cannot read baseline script');
 writeFileSync(tempScript,original.stdout);
 const run=(file,label)=>{
  const target=join(dir,label);
  const p=spawnSync(process.execPath,[file,'--master',join(root,'quant/data/market/security-master/us-security-master.json'),
   '--today','2026-09-15','--out',target,'--scale-out',join(target,'scale'),
   '--names',join(root,'quant/data/market/security-master/company-names.json')],{cwd:root,encoding:'utf8'});
  if(p.status!==0)throw Error(p.stderr+p.stdout);
  return JSON.parse(readFileSync(join(target,'eligibility.json'),'utf8'));
 };
 const before=run(tempScript,'before'),after=run(script,'after');
 const by=new Map(before.decisions.map(r=>[r.ticker,r]));
 const changed=after.decisions.filter(r=>JSON.stringify(r)!==JSON.stringify(by.get(r.ticker))).map(r=>({ticker:r.ticker,before:by.get(r.ticker),after:r}));
 const afterHash=hash();
 if(JSON.stringify(beforeHash)!==JSON.stringify(afterHash))throw Error('Protected output changed');
 writeFileSync(join(out,'listing_period_fix_replay.json'),JSON.stringify({generatedAt:new Date().toISOString(),
  replay_today:'2026-09-15',baseline_script_ref:baselineRef,provider_requests:0,source_master:'quant/data/market/security-master/us-security-master.json',
  baseline_counts:before.counts,fixed_counts:after.counts,changed_count:changed.length,changed,
  protected_hashes_before:beforeHash,protected_hashes_after:afterHash,protected_outputs_unchanged:true,
  production_membership_not_regenerated:true,limitation:'Replay proves listing selection only; no historical market data or consumer materialization regenerated.'},null,2)+'\n');
 console.log(JSON.stringify({before:before.counts,after:after.counts,changed:changed.length,protected_outputs_unchanged:true}));
}finally{rmSync(tempScript,{force:true});rmSync(dir,{recursive:true,force:true});}
