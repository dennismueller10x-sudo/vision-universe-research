import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Store=require('../engines/market-store.js');
const source=new URL('../../',import.meta.url);
function fixture(t,{scopeFromPreview=false,strict=true}={}){
 const root=mkdtempSync(join(tmpdir(),'vu-eod-cli-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const path of ['providers','quant/engines','quant/config','scripts/market/ingest-tiingo.mjs','scripts/market/preview-scope.mjs','scripts/market/publish-discover-series.mjs','scripts/market/universe-source.mjs']){mkdirSync(join(root,path.includes('.mjs')?'scripts/market':path),{recursive:true});cpSync(new URL(path,source),join(root,path),{recursive:true});}
 const configPath=join(root,'quant/config/tiingo-universe.json'),config=JSON.parse(readFileSync(configPath));config.securities=config.securities.filter(s=>s.ticker==='AAPL'||(scopeFromPreview&&s.ticker==='MSFT'));assert.equal(config.securities.length,scopeFromPreview?2:1);writeFileSync(configPath,JSON.stringify(config));
 const previewPath=join(root,'quant/config/development-preview.json'),preview=JSON.parse(readFileSync(previewPath));preview.scope=[scopeFromPreview?'MSFT':'AAPL'];delete preview.scopeUniverse;delete preview.benchmark;preview.discoverSeries={...(preview.discoverSeries||{}),fullHistory:preview.scope};writeFileSync(previewPath,JSON.stringify(preview));
 const preload=join(root,'fixture.mjs');writeFileSync(preload,`import {readFileSync,appendFileSync} from 'node:fs';const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-09-09T22:00:00Z']));}static now(){return new RealDate('2026-09-09T22:00:00Z').getTime();}};globalThis.fetch=async(url)=>{appendFileSync(${JSON.stringify(join(root,'requests.txt'))},String(url)+'\\n');return new Response(readFileSync(${JSON.stringify(join(root,'response.json'))},'utf8'),{status:200,headers:{'content-type':'application/json'}});};`);
 const store=Store.createMarketStore({root,providerId:'tiingo'});
 function run(bars){writeFileSync(join(root,'response.json'),JSON.stringify(bars));return spawnSync(process.execPath,['--import',preload,join(root,'scripts/market/ingest-tiingo.mjs'),...(strict?['--strict-incremental']:[]),'--publish-preview',...(scopeFromPreview?['--scope-from-preview']:[])],{env:{...process.env,TIINGO_API_KEY:'test-only-not-a-credential'},encoding:'utf8',timeout:10000});}
 return {root,store,run,id:config.securities.find(s=>s.ticker===(scopeFromPreview?'MSFT':'AAPL')).securityId};
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

test('strict scoped ingest preflights and completes the resolved scope rather than the default universe',t=>{
 const f=fixture(t,{scopeFromPreview:true});f.store.mergeBars(f.id,[{date:'2026-09-08',open:100,high:102,low:99,close:101,volume:1000,splitFactor:1,dividend:0}]);
 const r=f.run([raw('2026-09-09')]);assert.equal(r.status,0,r.stdout+r.stderr);
 const requests=readFileSync(join(f.root,'requests.txt'),'utf8');assert.match(requests,/MSFT/i);assert.doesNotMatch(requests,/AAPL/i);
 const health=JSON.parse(readFileSync(join(f.root,'.market-cache/tiingo/strict-eod-health.json')));assert.equal(health.processingState,'COMPLETE');assert.deepEqual(health.pending,[]);assert.equal(health.providerFinality,'NOT_CERTIFIED');
});
test('empty provider response keeps strict scoped history incomplete and retryable',t=>{
 const f=fixture(t,{scopeFromPreview:true});f.store.mergeBars(f.id,[{date:'2026-09-08',open:100,high:102,low:99,close:101,volume:1000,splitFactor:1,dividend:0}]);
 const first=f.run([]);assert.equal(first.status,1,first.stdout+first.stderr);assert.match(first.stderr,/STRICT_EOD_INCOMPLETE/);assert.equal(f.store.lastStoredDate(f.id),'2026-09-08');
 assert.equal(existsSync(join(f.root,'quant/data/market/golden-preview/daily',f.id+'.json')),false);
 const second=f.run([raw('2026-09-09')]);assert.equal(second.status,0,second.stdout+second.stderr);assert.equal(f.store.lastStoredDate(f.id),'2026-09-09');
});

/* Das Ablehnungsregister ueberlebt den taeglichen Reset des Checkpoints -
   das war schon immer so und bleibt. Was sich am 18.09.2026 geaendert hat,
   ist die Frist: eine frische Ablehnung ruht knapp einen Tag (und laenger,
   wenn sie sich wiederholt), nicht pauschal eine Woche. Beide Haelften
   werden hier geprueft. */
test('regular import keeps a fresh rejection on cooldown across the daily checkpoint reset',t=>{
 const f=fixture(t,{strict:false});f.store.mergeBars(f.id,[{date:'2026-09-08',open:100,high:102,low:99,close:101,volume:1000}]);
 /* Vier Stunden alt: innerhalb der Frist von zwanzig Stunden. */
 const c=f.store.loadCheckpoint('incremental');c.startedAt='2026-09-08T22:00:00Z';c.done=[f.id];c.rejected={[f.id]:{at:'2026-09-09T18:00:00Z',codes:'INVALID_OHLC'}};f.store.saveCheckpoint(c);
 const result=f.run([]);assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/uebersprungen \(TEMPORARY_REJECT/);assert.equal(existsSync(join(f.root,'requests.txt')),false);
 assert.deepEqual(f.store.loadCheckpoint('incremental').rejected,c.rejected);
});

test('regular import asks again once the cooldown has passed - no title is locked out for a week',t=>{
 const f=fixture(t,{strict:false});f.store.mergeBars(f.id,[{date:'2026-09-08',open:100,high:102,low:99,close:101,volume:1000}]);
 /* Vierundzwanzig Stunden alt: die Frist ist abgelaufen, der naechste
    Tageslauf fragt wieder. Genau das fehlte beim Stillstand vom 16.09. */
 const c=f.store.loadCheckpoint('incremental');c.startedAt='2026-09-08T22:00:00Z';c.done=[f.id];c.rejected={[f.id]:{at:'2026-09-08T22:00:00Z',codes:'INVALID_OHLC'}};f.store.saveCheckpoint(c);
 const result=f.run([raw('2026-09-09')]);assert.equal(result.status,0,result.stdout+result.stderr);
 assert.match(result.stdout,/erneuter Versuch/);
 assert.equal(existsSync(join(f.root,'requests.txt')),true,'der Titel muss wieder gefragt werden');
 assert.equal(f.store.loadCheckpoint('incremental').rejected[f.id],undefined,'liefert er gueltige Daten, verschwindet die Ablehnung');
 assert.equal(f.store.lastStoredDate(f.id),'2026-09-09');
});

/* Der Vorfall selbst, als Test: ein Tageslauf holt EINE neue Bar. Vor der
   Korrektur lehnte die Qualitaetspruefung sie mit `too_few_bars` ab, weil
   sie allein stand - und sperrte den Titel. Jetzt steht die gespeicherte
   Bar als Anschluss davor, und der Tag wird uebernommen. */
test('a one-bar daily increment is accepted, not rejected as too_few_bars',t=>{
 const f=fixture(t,{strict:false});f.store.mergeBars(f.id,[{date:'2026-09-08',open:100,high:102,low:99,close:101,volume:1000,splitFactor:1,dividend:0}]);
 const result=f.run([raw('2026-09-09')]);
 assert.equal(result.status,0,result.stdout+result.stderr);
 assert.doesNotMatch(result.stdout,/too_few_bars/);
 assert.equal(f.store.lastStoredDate(f.id),'2026-09-09');
 assert.equal(f.store.readBars(f.id).bars.length,2,'die gespeicherte Bar bleibt, die neue kommt dazu');
 assert.deepEqual(f.store.loadCheckpoint('incremental').rejected,{},'kein Eintrag im Ablehnungsregister');
});
