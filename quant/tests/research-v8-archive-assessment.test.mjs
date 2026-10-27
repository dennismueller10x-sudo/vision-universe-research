import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';

test('V8 archive assessment: raw daily support requalifies multi-day move; gzip facts counted; raw prices stay private',()=>{
 const root=mkdtempSync(join(tmpdir(),'v8-private-archive-'));
 try {
  for(const p of ['quant/data/market/security-master','quant/data/market/discover-series-long','.market-cache/tiingo2/evidence','.sec-cache'])mkdirSync(join(root,p),{recursive:true});
  const rows=[],points=[];
  for(let w=0;w<60;w++)for(let d=0;d<5;d++){
   const date=new Date(Date.UTC(2001,0,1)+(w*7+d)*86400000).toISOString().slice(0,10);
   const close=w<10?10:w===10?10*Math.pow(2,(d+1)/5):20;
   rows.push({date,close,open:close,high:close,low:close,adjClose:close,splitFactor:1,divCash:0,volume:1000});
   if(d===4)points.push([date,close]);
  }
  const identity={baseline_security_id:'ref_TEST',canonical_id:'TEST:NASDAQ:2001-01-01',ticker:'TEST',currency:'USD',provider:'tiingo',start_date:'2001-01-01',active_status:'ACTIVE',eligible_us_equity:true,instrument_type:'EQUITY_COMMON'};
  writeFileSync(join(root,'quant/data/market/security-master/us-security-master.json'),JSON.stringify({rows:[identity]}));
  const weekly={schemaVersion:'test-weekly',asOf:points.at(-1)[0],securityId:'ref_TEST',instrumentId:'TEST',ticker:'TEST',currency:'USD',provider:'tiingo',dataMode:'real',priceSeriesType:'SPLIT_ADJUSTED',grain:'weekly',points,from:points[0][0],to:points.at(-1)[0]};
  const path=join(root,'quant/data/market/discover-series-long/ref_TEST.json'),original=JSON.stringify(weekly);writeFileSync(path,original);
  writeFileSync(join(root,'.market-cache/tiingo2/evidence/example.json'),JSON.stringify({metadata:{ticker:'TEST'},rows}));
  writeFileSync(join(root,'.sec-cache/facts.gz'),gzipSync(JSON.stringify({facts:{'us-gaap':{Revenue:{units:{USD:[{accn:'0000000001-01-000001',filed:'2001-05-01',val:123}]}}}}})));
  const result=spawnSync(process.execPath,[resolve('scripts/quant/audit-v8-archives.mjs'),'.verification/v8-archives'],{cwd:root,encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr);const report=JSON.parse(readFileSync(join(root,'.verification/v8-archives/archive-assessment.json')));
  assert.equal(report.summary.dailySeries,1);assert.equal(report.summary.additionalQualifiedWeeklySeries,1);
  assert.equal(report.weeklyRequalification[0].before,'CORPORATE_ACTION_UNRESOLVED');assert.equal(report.weeklyRequalification[0].after,'QUALIFIED');
  assert.equal(report.weeklyRequalification[0].pricesModified,false);assert.equal(report.secFacts.factObservations,1);assert.equal(report.secFacts.uniqueAccessions,1);
  assert.equal(report.rawPublication,false);assert.equal(report.providerRequests,0);assert.equal(report.productionApproved,false);
  assert.equal(readFileSync(path,'utf8'),original);assert.ok(!JSON.stringify(report).includes('"adjClose"'));assert.ok(!JSON.stringify(report).includes('"close"'));assert.ok(!JSON.stringify(report).includes('"val"'));
 } finally {rmSync(root,{recursive:true,force:true});}
});
