import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Base = require('../engines/instrument-classification.js');
const Master = require('../engines/us-security-master.js');
const opts = { today: '2026-10-02' };
const row = { ticker: 'PFBC', exchange: 'NASDAQ', assetType: 'Stock', currency: 'USD',
 startDate: '1999-08-19', endDate: '2026-10-01' };

test('Preferred Bank issuer is common stock from provider and exchange names', () => {
 for (const name of ['Preferred Bank', 'Preferred Bank - Common Stock']) {
  const base = Base.classify({ ...row, name }, opts);
  assert.equal(base.instrumentType, 'COMMON_STOCK');
  const fine = Master.classifySecurity({ ...row, name }, opts);
  assert.equal(fine.instrumentType, 'EQUITY_COMMON');
  assert.equal(fine.eligibleUsEquity, true);
  assert.equal(Master.decideProductEligibility({instrumentType:fine.instrumentType,
   classificationStatus:fine.classificationStatus, confidence:fine.classificationConfidence,
   activeStatus:'ACTIVE', eligible:true, policyBucket:fine.policyBucket}).status, 'ELIGIBLE');
 }
});

test('Preferred Bank preferred instruments keep their security-form classification', () => {
 for (const security of [
  { ticker:'PFBC-P-A', name:'Preferred Bank' },
  { ticker:'PFBC', name:'Preferred Bank Series A Preferred Shares' },
  { ticker:'PFBC', name:'Preferred Bank Pfd. Shares' },
  { ticker:'PFBC', name:'Preferred Bank Pref. Shares' },
  { ticker:'OTHER', name:'Another Bank Preferred Stock' }
 ]) {
  assert.equal(Base.classify({ ...row, ...security }, opts).instrumentType, 'PREFERRED');
  assert.equal(Master.classifySecurity({ ...row, ...security }, opts).instrumentType, 'PREFERRED');
 }
});

test('narrow issuer correction keeps preferred-income ETF wrapper classified ETF', () => {
 const security={...row,ticker:'PREF',name:'Preferred Bank Preferred Income ETF'};
 assert.equal(Base.classify(security,opts).instrumentType,'ETF');
});

import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=join(dirname(fileURLToPath(import.meta.url)),'../..');
function cachedEligibility(ticker,name,version='us-security-master-1.2.0',securityName=null) {
 const dir=mkdtempSync(join(tmpdir(),'vu-preferred-issuer-cache-'));
 try {
  const sec={securityId:'ref_'+ticker,ticker,exchange:'NASDAQ',assetType:'Stock',currency:'USD',active:true,startDate:'1999-08-19'};
  const universe=join(dir,'universe.json'),master=join(dir,'master.json'),names=join(dir,'names.json'),out=join(dir,'out');
  const bytes=JSON.stringify({securities:[sec]});writeFileSync(universe,bytes);
  writeFileSync(master,JSON.stringify({version,rows:[{ticker,exchange:'NASDAQ',asset_type:'Stock',currency:'USD',
   instrument_type:'PREFERRED',classification_status:'CLASSIFIED',classification_confidence:'HIGH',active_status:'ACTIVE',
   start_date:'1999-08-19',end_date:'2026-10-01',eligible_us_equity:false,policy_bucket:'SEPARATE',
   eligibility_reason:'CLASS_PREFERRED_SEPARATE_FROM_PRIMARY_COMMON_EQUITY',review_flags:[],security_name:securityName}]}));
  writeFileSync(names,JSON.stringify({rows:[{securityId:sec.securityId,companyName:name}]}));
  const result=spawnSync(process.execPath,[join(root,'scripts/market/build-us-eligibility.mjs'),'--universe',universe,
   '--master',master,'--names',names,'--out',out,'--scale-out',join(dir,'scale'),'--today','2026-10-02'],{encoding:'utf8',cwd:root});
  assert.equal(result.status,0,result.stderr+result.stdout);
  assert.equal(readFileSync(universe,'utf8'),bytes,'cached correction must preserve raw membership/IDs');
  return JSON.parse(readFileSync(join(out,'eligibility.json'),'utf8')).decisions[0];
 }finally{rmSync(dir,{recursive:true,force:true});}
}

test('cached 1.2.0 false preferred issuer is rejudged before the FORM guard',()=>{
 const r=cachedEligibility('PFBC','Preferred Bank');
 assert.equal(r.instrument_type,'EQUITY_COMMON');
 assert.equal(r.product_eligibility,'ELIGIBLE');
 assert.equal(r.evidence_source,'SECURITY_MASTER_REJUDGED');
 assert.ok(r.review_flags.includes('NAME_RULE_CACHE_INVALIDATED:PREFERRED_BANK_ISSUER'));
});

test('cached same-version real preferred series and old-version cache remain compatible',()=>{
 assert.equal(cachedEligibility('PFBC-P-A','Preferred Bank').instrument_type,'PREFERRED');
 assert.equal(cachedEligibility('PFBC','Preferred Bank Series A Preferred Shares').product_eligibility,'SEPARATE_CLASS');
 assert.equal(cachedEligibility('PFBC','Preferred Bank','us-security-master-1.1.0').product_eligibility,'ELIGIBLE');
});

test('generic issuer-name layer cannot lower explicit cached preferred-share evidence',()=>{
 const r=cachedEligibility('PFBC','Preferred Bank','us-security-master-1.2.0','Preferred Bank Series A Preferred Shares');
 assert.equal(r.instrument_type,'PREFERRED');
 assert.equal(r.product_eligibility,'SEPARATE_CLASS');
 assert.ok(!r.review_flags.includes('NAME_RULE_CACHE_INVALIDATED:PREFERRED_BANK_ISSUER'));
});
