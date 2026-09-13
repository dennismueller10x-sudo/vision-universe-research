import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createFsDriver} from '../../scripts/market/storage/fs-driver.mjs';
const require=createRequire(import.meta.url);
const {createHistoryStore}=require('../engines/history-store.js');
const {createMarketStore}=require('../engines/market-store.js');
const Guard=require('../engines/zero-cost-guard.js');
const root=new URL('../../',import.meta.url);
const member={ticker:'TST',securityId:'ref_TST'};
const bar=(date,close=10)=>({securityId:member.securityId,date,close,adjustedClose:close});
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'vu2-sync-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const files=['scripts/market/sync-history-store.mjs','scripts/market/storage/fs-driver.mjs',
 'quant/engines/history-store.js','quant/engines/bar-codec.js','quant/engines/zero-cost-guard.js','quant/config/tiingo-scale.json'];
 for(const f of files){mkdirSync(dirname(join(dir,f)),{recursive:true});copyFileSync(new URL(f,root),join(dir,f));}
 const universe=join(dir,'quant/data/market/scale/universe-TEST.json');mkdirSync(dirname(universe),{recursive:true});writeFileSync(universe,JSON.stringify({securities:[member]}));
 const workingDir=join(dir,'working'),cache=join(workingDir,'tiingo/daily/ref_TST.json');
 const durable=createHistoryStore({driver:createFsDriver(join(dir,'durable')),provider:'tiingo'});
 const series=(bars,meta={})=>({ticker:'TST',securityId:'ref_TST',provider:'tiingo',bars,...meta});
 function local(payload){mkdirSync(dirname(cache),{recursive:true});writeFileSync(cache,JSON.stringify(payload));}
 function run(direction='pull',extra=[],remote=false){
  const operation=direction==='pull'?'RECOVERY':'BULK_UPLOAD';
  const preflight=join(dir,'preflight.json');writeFileSync(preflight,JSON.stringify({generatedAt:new Date().toISOString(),operation,verdict:{verdict:Guard.ALLOWED},budgetForRun:{classAOperations:100,classBOperations:100}}));
  return spawnSync(process.execPath,[join(dir,files[0]),'--'+direction,'--gate','TEST','--work-dir',workingDir,'--report',join(dir,'report.json'),'--preflight',preflight,...(remote?[]:['--local-root',join(dir,'durable')]),...extra],{encoding:'utf8',env:{PATH:process.env.PATH}});
 }
 return {dir,workingDir,cache,durable,series,local,run,universe};
}
test('restore preserves newer local bars and freshness while allowing incremental continuation',async t=>{
 const f=fixture(t);await f.durable.putSeries(f.series([bar('2026-09-08')]));
 f.local(f.series([bar('2026-09-08'),bar('2026-09-09')],{updatedAt:'2026-09-09T22:00:00Z'}));
 const result=f.run();assert.equal(result.status,0,result.stderr);
 const data=JSON.parse(readFileSync(f.cache));assert.equal(data.bars.length,2);assert.equal(data.last,'2026-09-09');
 assert.equal(data.updatedAt,'2026-09-09T22:00:00Z');assert.ok(data.restoredAt);
 const market=createMarketStore({root:f.dir,workingDir:f.workingDir,providerId:'tiingo'});
 assert.equal(market.nextFetchFrom('ref_TST'),'2026-09-10');
 assert.equal(existsSync(join(f.workingDir,'tiingo/checkpoints')),false);
});
test('fresh runner restore does not invent market freshness or publish data',async t=>{
 const f=fixture(t);await f.durable.putSeries(f.series([bar('2026-09-08')]));
 const r=f.run();assert.equal(r.status,0,r.stderr);const data=JSON.parse(readFileSync(f.cache));
 assert.equal(data.updatedAt,null);assert.equal(data.barCount,1);
 assert.equal(existsSync(join(f.dir,'quant/data/market/daily')),false);
});
test('pull refuses foreign series identity and per-bar identity without changing cache',async t=>{
 for(const meta of [{securityId:'other'},{ticker:'OTHER'},{provider:'other'},{bars:[{...bar('2026-09-08'),securityId:'other'}]}]){
  const f=fixture(t);await f.durable.putSeries(f.series([bar('2026-09-08')],meta.ticker?{}:meta));
  if(meta.ticker){const Codec=require('../engines/bar-codec.js');await f.durable.driver.put(f.durable.seriesKey('TST'),Codec.encode(f.series([bar('2026-09-08')],meta)).buffer);}
  f.local(f.series([bar('2026-09-09')]));const before=readFileSync(f.cache,'utf8');
  const r=f.run();assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stdout,/HISTORY_IDENTITY_MISMATCH/);
  assert.equal(readFileSync(f.cache,'utf8'),before);
 }
});
test('restore rejects conflicting overlapping prices instead of overwriting evidence',async t=>{
 const f=fixture(t);await f.durable.putSeries(f.series([bar('2026-09-08',10)]));f.local(f.series([bar('2026-09-08',11)]));
 const before=readFileSync(f.cache,'utf8'),r=f.run();assert.equal(r.status,1);assert.match(r.stdout,/HISTORY_RECONCILIATION_REQUIRED/);assert.equal(readFileSync(f.cache,'utf8'),before);
});
test('push refuses a foreign existing durable identity and preserves its object',async t=>{
 const f=fixture(t);await f.durable.putSeries(f.series([bar('2026-09-08')],{securityId:'foreign'}));f.local(f.series([bar('2026-09-09')]));
 const before=await f.durable.getSeries('TST'),r=f.run('push');assert.equal(r.status,1);assert.match(r.stdout,/HISTORY_IDENTITY_MISMATCH/);
 assert.deepEqual(await f.durable.getSeries('TST'),before);
});
test('push rejects foreign cache identity before writing a series',async t=>{
 const f=fixture(t);f.local(f.series([bar('2026-09-09')],{securityId:'foreign'}));
 const r=f.run('push');assert.equal(r.status,1);assert.match(r.stdout,/HISTORY_IDENTITY_MISMATCH/);assert.equal(await f.durable.getSeries('TST'),null);
});
test('invalid dates and duplicate identities fail closed',async t=>{
 const f=fixture(t);await f.durable.putSeries(f.series([bar('2026-02-30')]));
 const r=f.run();assert.equal(r.status,1);assert.match(r.stdout,/HISTORY_INVALID_DATES/);assert.equal(existsSync(f.cache),false);
 writeFileSync(f.universe,JSON.stringify({securities:[member,member]}));const duplicate=f.run();assert.equal(duplicate.status,1);assert.match(duplicate.stderr,/HISTORY_UNIVERSE_IDENTITY_INVALID/);
});
test('remote dry-run still requires preflight before driver or credential access',t=>{
 const f=fixture(t);
 const absent=spawnSync(process.execPath,[join(f.dir,'scripts/market/sync-history-store.mjs'),'--pull','--dry-run','--gate','TEST','--preflight',join(f.dir,'missing.json')],{encoding:'utf8',env:{PATH:process.env.PATH}});
 assert.equal(absent.status,3,absent.stderr);assert.match(absent.stderr,/ZERO_COST_GUARD_BLOCKED/);
});
test('push and restore roundtrip uses the same durable series and remains idempotent',async t=>{
 const f=fixture(t);f.local(f.series([bar('2026-09-08'),bar('2026-09-09')]));
 let result=f.run('push');assert.equal(result.status,0,result.stdout+result.stderr);
 const stored=await f.durable.getSeries('TST');assert.equal(stored.bars.length,2);
 result=f.run('push');assert.equal(result.status,0,result.stdout+result.stderr);
 const report=JSON.parse(readFileSync(join(f.dir,'report.json')));assert.equal(report.tally.unchanged,1);
 rmSync(f.workingDir,{recursive:true,force:true});result=f.run();assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(readFileSync(f.cache)).bars,stored.bars);
});
test('malformed cache and absent universe members cannot become a successful empty sync',t=>{
 const f=fixture(t);f.local({});let r=f.run('push');assert.equal(r.status,1);assert.match(r.stdout,/HISTORY_IDENTITY_MISMATCH/);
 for(const securities of [undefined,[],{}]){
  writeFileSync(f.universe,JSON.stringify({securities}));r=f.run();assert.equal(r.status,1);assert.match(r.stderr,/HISTORY_UNIVERSE_IDENTITY_INVALID/);
 }
});
