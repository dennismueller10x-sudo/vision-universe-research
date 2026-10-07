import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
test('numeric acceptance sends all three requests through the existing adapter and uses unambiguous SEC share dates',()=>{
 const root=mkdtempSync(join(tmpdir(),'ci-band-fixture-')),preload=join(root,'fixture.mjs'),out=join(root,'evidence.json');
 const fixture=`const today=new Date(),date=new Date(today-86400000).toISOString().slice(0,10),end=new Date(today-30*86400000).toISOString().slice(0,10);let requests=0;
 globalThis.fetch=async url=>{requests++;if(url.includes('api.tiingo.com')){const ticker=url.match(/daily\\/([^/]+)\\/prices/)[1],price={BOH:60,SBSI:30,AMPY:4}[ticker];return new Response(JSON.stringify([{date:date+'T00:00:00Z',close:price,open:price,high:price,low:price,volume:1000,splitFactor:1,divCash:0}]),{status:200});}
 const cik=url.match(/CIK(\\d+)/)[1];return new Response(JSON.stringify({cik:Number(cik),facts:{dei:{EntityCommonStockSharesOutstanding:{units:{shares:[{val:40000000,end,filed:end,form:'10-Q',accn:'fixture'}]}}}}}),{status:200});};
 process.on('exit',()=>{if(requests!==6)process.exitCode=2;});`;
 try{writeFileSync(preload,fixture);const result=spawnSync(process.execPath,['--import',preload,'scripts/company_intelligence/numeric-band-review.mjs','--evidence',out],{encoding:'utf8',env:{...process.env,TIINGO_API_KEY:'fixture-only'},maxBuffer:1024*1024});assert.equal(result.status,0,result.stderr);const report=JSON.parse(readFileSync(out));assert.deepEqual(report.rows.map(r=>r.band),['MID_CAP','SMALL_CAP','MICRO_CAP']);assert(report.rows.every(r=>r.sharesAsOf===r.sharesFiled&&r.priceSource==='EXISTING_TIINGO_DAILY_ADAPTER'));assert.equal(report.productionMarketDataWrites,0);}finally{rmSync(root,{recursive:true,force:true});}
});
