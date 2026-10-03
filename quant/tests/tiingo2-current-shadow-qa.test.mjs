import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {explainChangedExistingFiles} from '../../scripts/market/tiingo2-current-shadow-qa.mjs';
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
