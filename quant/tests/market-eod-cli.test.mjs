import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Store=require('../engines/market-store.js');
const source=new URL('../../',import.meta.url);
function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'vu-eod-cli-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const path of ['providers','quant/engines','quant/config','scripts/market/ingest-tiingo.mjs']){mkdirSync(join(root,path.includes('.mjs')?'scripts/market':path),{recursive:true});cpSync(new URL(path,source),join(root,path),{recursive:true});}
 const configPath=join(root,'quant/config/tiingo-universe.json'),config=JSON.parse(readFileSync(configPath));config.securities=config.securities.filter(s=>s.ticker==='AAPL');assert.equal(config.securities.length,1);writeFileSync(configPath,JSON.stringify(config));
 const preload=join(root,'fixture.mjs');writeFileSync(preload,`import {readFileSync,appendFileSync} from 'node:fs';const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-09-09T22:00:00Z']));}static now(){return new RealDate('2026-09-09T22:00:00Z').getTime();}};globalThis.fetch=async(url)=>{appendFileSync(${JSON.stringify(join(root,'requests.txt'))},String(url)+'\\n');return new Response(readFileSync(${JSON.stringify(join(root,'response.json'))},'utf8'),{status:200,headers:{'content-type':'application/json'}});};`);
 const store=Store.createMarketStore({root,providerId:'tiingo'});
 function run(bars){writeFileSync(join(root,'response.json'),JSON.stringify(bars));return spawnSync(process.execPath,['--import',preload,join(root,'scripts/market/ingest-tiingo.mjs'),'--strict-incremental','--publish-preview'],{env:{...process.env,TIINGO_API_KEY:'test-only-not-a-credential'},encoding:'utf8',timeout:10000});}
 return {root,store,run,id:config.securities[0].securityId};
}
function raw(date){return {date:date+'T00:00:00.000Z',open:100,high:102,low:99,close:101,volume:1000,adjOpen:100,adjHigh:102,adjLow:99,adjClose:101,adjVolume:1000,splitFactor:1,divCash:0};}
test('strict CLI refuses missing restored history before any provider request',t=>{
 const f=fixture(t),result=f.run([]);assert.equal(result.status,1,result.stderr);assert.match(result.stderr,/HISTORY_RESTORE_REQUIRED/);assert.equal(existsSync(join(f.root,'requests.txt')),false);
});
test('strict CLI prevents missing-session merge and preview publication',t=>{
 const f=fixture(t);f.store.mergeBars(f.id,[{date:'2026-09-04',open:100,high:102,low:99,close:101,volume:1000,splitFactor:1,dividend:0}]);
 const result=f.run([raw('2026-09-09')]);assert.equal(result.status,1,result.stdout+result.stderr);assert.match(result.stdout,/MISSING_SESSION_BAR/);const health=JSON.parse(readFileSync(join(f.root,'.market-cache/tiingo/strict-eod-health.json')));assert.equal(health.processingState,'INCOMPLETE');assert.equal(health.qualityStatus,'FAIL');assert.deepEqual(health.pending,[f.id]);assert.equal(f.store.lastStoredDate(f.id),'2026-09-04');assert.equal(existsSync(join(f.root,'quant/data/market/golden-preview/daily',f.id+'.json')),false);
});
test('strict CLI restores a lagging history despite an ahead checkpoint and resumes idempotently',t=>{
 const f=fixture(t);f.store.mergeBars(f.id,[{date:'2026-09-08',open:100,high:102,low:99,close:101,volume:1000,splitFactor:1,dividend:0}]);
 const checkpoint=f.store.loadCheckpoint('strict-eod-2026-09-09');checkpoint.done.push(f.id);f.store.saveCheckpoint(checkpoint);
 const first=f.run([raw('2026-09-09')]);assert.equal(first.status,0,first.stdout+first.stderr);assert.equal(f.store.lastStoredDate(f.id),'2026-09-09');assert.equal(f.store.readBars(f.id).bars.length,2);
 const requests=readFileSync(join(f.root,'requests.txt'),'utf8');assert.match(requests,/startDate=2026-09-09/);assert.match(requests,/endDate=2026-09-09/);
 const second=f.run([]);assert.equal(second.status,0,second.stdout+second.stderr);assert.equal(readFileSync(join(f.root,'requests.txt'),'utf8'),requests);assert.equal(f.store.readBars(f.id).bars.length,2);
});
