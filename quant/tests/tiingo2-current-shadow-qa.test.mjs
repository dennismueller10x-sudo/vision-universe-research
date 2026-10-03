import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {explainChangedExistingFiles,compareDeferredDnaSnapshots} from '../../scripts/market/tiingo2-current-shadow-qa.mjs';
import {measuredBrowserBudgetReport} from '../../scripts/market/tiingo2-finalize-preview.mjs';
import {budgets} from '../../scripts/vu2/resource-budget.mjs';

test('existing projection changes are exact-byte rows tied to the staged manifest',()=>{
 const old='a'.repeat(64),next='b'.repeat(64);
 const rows=explainChangedExistingFiles({files:[
  {path:'quant/data/product/factor-evidence-v1/AA.json.gz',projection:true,baselineSha256:old,stagedSha256:next},
  {path:'quant/data/universe/search/manifest.json',projection:true,baselineSha256:old,stagedSha256:next},
  {path:'discover/data/stocks/US_REAL/IPO.json',projection:true,baselineSha256:null,stagedSha256:next},
  {path:'unrelated',projection:false,baselineSha256:old,stagedSha256:next}
 ]});
 assert.deepEqual(rows.map(row=>row.path),['quant/data/product/factor-evidence-v1/AA.json.gz','quant/data/universe/search/manifest.json']);
 assert.equal(rows[0].reasonCode,'POPULATION_RANK_NORMALIZATION');
 assert.equal(rows[1].reasonCode,'ADDITIVE_MEMBERSHIP_OR_INDEX');
 assert.ok(rows.every(row=>row.beforeSha256===old&&row.afterSha256===next&&row.explanation.length>=16));
});

test('browser proof is built only from measured eight-budget browser evidence',()=>{
 const dir=mkdtempSync(join(tmpdir(),'vu-tiingo2-budget-'));
 const write=(name,data)=>writeFileSync(join(dir,name),JSON.stringify(data));
 try{
  const results=Object.entries(budgets).flatMap(([view,budget])=>[1440,390].map(width=>({view,width,
   budget,decodedBytes:Math.min(1000,budget.decodedBytes),requests:1,pass:true,failures:[]})));
  write('resource-budgets.json',{results});write('results.json',{findings:[]});
  const stage={manifestSha256:'a'.repeat(64)},sourceCommit='b'.repeat(40);
  const report=measuredBrowserBudgetReport({browserDir:dir,stage,sourceCommit});
  assert.equal(report.results.length,8);assert.equal(report.sourceManifestSha256,stage.manifestSha256);
  results[0].budget={...results[0].budget,decodedBytes:999999999};write('resource-budgets.json',{results});
  assert.throws(()=>measuredBrowserBudgetReport({browserDir:dir,stage,sourceCommit}),/MEASURED_BROWSER_BUDGET_NOT_GREEN/);
  results[0].budget=budgets[results[0].view];write('resource-budgets.json',{results});write('results.json',{findings:['broken chart']});
  assert.throws(()=>measuredBrowserBudgetReport({browserDir:dir,stage,sourceCommit}),/MEASURED_BROWSER_QA_NOT_GREEN/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('deferred DNA preserves existing canonical, chart and technical rows exactly',()=>{
 const old={instrument:[{instrumentId:'vu_f4c48467a5f4ef',productEligibility:'REVIEW'}],
  eligibility:[{securityId:'ref_DNA',active_status:'INACTIVE'}],raw:[{securityId:'ref_DNA'}],
  marketFactor:[],universeList:[{s:'DNA'}],technical:{securityId:'ref_DNA',bars:1356},
  watchlistIdentity:{instrumentId:'vu_f4c48467a5f4ef',securityId:'ref_DNA'},
  searchSymbol:[{shard:'DN',entry:{i:'vu_f4c48467a5f4ef',s:'DNA'}}],
  searchName:[{shard:'GI',entry:{i:'vu_f4c48467a5f4ef',s:'DNA'}}],
  marketCapability:[{s:'DNA',m:'ref_DNA',i:'vu_f4c48467a5f4ef',l:'2026-09-08'}],
  signals:{60:{result:{ticker:'DNA',asOf:'2026-09-10'},events:[]}},charts:{daily:null,long:'a'.repeat(64)}};
 assert.equal(compareDeferredDnaSnapshots(old,structuredClone(old)).status,'PASS');
 for(const mutate of [row=>row.instrument[0].productEligibility='ELIGIBLE',row=>row.technical.bars=1372,
  row=>row.signals[60].result.asOf='2026-10-02',row=>row.charts.long='b'.repeat(64)]){
  const changed=structuredClone(old);mutate(changed);
  assert.equal(compareDeferredDnaSnapshots(old,changed).status,'BLOCKED');
 }
 for(const mutate of [row=>row.searchSymbol[0].entry.i='vu_wrong',row=>row.searchName[0].entry.s='DNA2',
  row=>row.marketCapability[0].i='vu_wrong',row=>row.watchlistIdentity.securityId='ref_wrong',
  row=>row.marketCapability.push({...row.marketCapability[0]}),row=>row.universeList.push({s:'DNA'}),
  row=>row.instrument.push({instrumentId:'vu_duplicate',symbol:'DNA'})]){
  const changed=structuredClone(old);mutate(changed);
  assert.equal(compareDeferredDnaSnapshots(old,changed).status,'BLOCKED');
 }
});
