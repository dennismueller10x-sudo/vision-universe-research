import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
/* Vorladen der Aktien-Daten (stock-boot.js, 23.11.2026): jede vorgeladene URL muss von der Seite selbst mit denselben Optionen
   abgerufen werden (quant/ui/shell.js#loadJSON/#loadCompressedJSON: fetch(path,{cache:'no-cache'}) oder __vuEarly), sonst wird doppelt geladen. */
const src=f=>readFileSync(new URL('../../'+f,import.meta.url),'utf8');
const boot=src('quant/app/stock-boot.js'),services=src('quant/api/product-services.js'),shell=src('quant/ui/shell.js'),stockPage=src('quant/app/page-stock.js');
/* Die Liste aus stock-boot.js ausfuehren (ohne Browser): Weg ueber ein Skript mit gefaelschtem fetch. */
function warmed(ticker,securityId){
 const calls=[],map={};
 const w={__vuEarly:map,location:{href:'x',hash:'#/aktie/'+ticker}};
 const m=boot.match(/\(function warm\(\)\{[\s\S]*?\n  \}\)\(\);/);assert.ok(m,'warm()-Block gefunden');
 vm.runInNewContext('var ticker=T,key=K,parsed={ctx:{securityId:S}};'+m[0].replace(/\bw\b/g,'W'),{T:ticker,K:(ticker.replace(/[^A-Z0-9]/g,'')+'_').slice(0,2),S:securityId,W:w,fetch:(p,o)=>{calls.push({p,o});return Promise.resolve({})},setTimeout:()=>0});
 return calls;
}
test('Alle vorgeladenen Pfade stehen so in product-services.js und werden mit loadJSON bzw. loadCompressedJSON abgerufen',()=>{
 const c=warmed('NVDA','ref_NVDA');
 assert.equal(c.length,11);
 for(const {o} of c)assert.equal(JSON.stringify(o),'{"cache":"no-cache","priority":"low"}','wie shell.js: cache no-cache, keine eigenen Anmeldedaten');
 const paths=c.map(x=>x.p);
 assert.equal(JSON.stringify(paths),JSON.stringify(['/quant/data/universe/instruments/NV.json','/quant/data/universe/capability-shards/NV.json','/quant/data/market/factors/product-shards/NV.json','/quant/data/product/universe-list-shards/NV.json','/discover/data/stocks/US_REAL/NVDA.json','/quant/data/market/golden-preview/daily/ref_NVDA.chart.json','/quant/data/product/technical-signals-v1/by-ticker/NVDA.json.gz','/quant/data/product/pattern-match-v1/NV.json.gz','/quant/data/product/factor-evidence-v1/NV.json.gz','/quant/data/product/setup-observations-v1/NV.json.gz','/quant/data/product/radar-ticker-v1/NV.json.gz']));
 /* Gegenstellen: derselbe Pfadbau steht im Code, der sie abruft. */
 for(const frag of ["'/quant/data/universe/capability-shards/'+key","'/quant/data/market/factors/product-shards/'+Master.shardKey(ticker)","'/quant/data/product/universe-list-shards/'+key","'/discover/data/stocks/US_REAL/'+ticker","'/quant/data/market/golden-preview/daily/'+stock.masterMemberId+'.chart.json'","'/quant/data/product/technical-signals-v1/by-ticker/'+ticker+'.json.gz'","'/quant/data/product/pattern-match-v1/'+key+'.json.gz'","'/quant/data/product/factor-evidence-v1/'+key+'.json.gz'","'/quant/data/product/setup-observations-v1/'+key+'.json.gz'","'/quant/data/product/radar-ticker-v1/'+key+'.json.gz'"])
  assert.ok(services.includes(frag),'product-services.js ruft ab: '+frag);
 assert.match(src('core/client.js'),/instrumentShard: function \(t\) \{ return "\/quant\/data\/universe\/instruments\/" \+ Identity\.shardKey\(t\) \+ "\.json"; \}/);
});
test('shell.js übernimmt vorab gestartete Abrufe für JSON und gzip-JSON mit gleichen Optionen (cache no-cache)',()=>{
 assert.equal((shell.match(/global\.__vuEarly && global\.__vuEarly\[path\]/g)||[]).length,2);
 assert.equal((shell.match(/fetch\(path, \{ cache: "no-cache" \}\)/g)||[]).length,2);
});
test('Schardenschlüssel bei Satzzeichen: gleiche Regel wie technicalShard',()=>{
 const c=warmed('BRK.B','ref_BRK_B').map(x=>x.p);
 assert.ok(c.includes('/quant/data/product/pattern-match-v1/BR.json.gz'));
 const d=warmed('A.B','ref_A_B').map(x=>x.p);
 assert.ok(d.includes('/quant/data/product/pattern-match-v1/A..json.gz'),'technicalShard behaelt Punkt (A.), shardKey nicht (AB)');
 assert.ok(d.includes('/quant/data/universe/instruments/AB.json'));
 assert.match(services,/function technicalShard\(ticker\)\{return \(ticker\+'_'\)\.slice\(0,2\)\.replace\(\/\[\^A-Z0-9\._-\]\/g,'_'\);\}/);
});
