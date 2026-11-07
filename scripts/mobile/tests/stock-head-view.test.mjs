import {test} from 'node:test';import assert from 'node:assert/strict';
import {projectStockHead} from '../../vu2/stock-head-view.mjs';
const stock={ticker:'FIX',state:'AVAILABLE',instrumentId:'vu_fixture',masterMemberId:'fixture-id',name:'Fixture AG',price:{state:'AVAILABLE',value:105,asOf:'2026-11-05'},chart:{state:'AVAILABLE',bars:[{date:'2026-11-04',close:100},{date:'2026-11-05',close:105}]}};
test('head view preserves the service price and the existing page date/change display',()=>{
 const view=projectStockHead(stock,{t:'COMMON_STOCK',il:2},{factorState:'AVAILABLE',overall:{rated:6}});
 assert.equal(view.instrumentId,stock.instrumentId);assert.equal(view.masterMemberId,stock.masterMemberId);assert.equal(view.price.value,105);assert.equal(view.price.changePct,(105/100-1)*100);assert.equal(view.price.at,'05.11.2026');assert.equal(view.listingCount,2);assert.equal(view.question,'Was sagt Quant insgesamt?');
});
test('head view never supplies withheld, unavailable, undated or invented-name prices',()=>{
 for(const change of [{state:'UNAVAILABLE'},{price:{reason:'DISPLAY_NOT_PERMITTED',value:105}},{price:{value:null}},{price:{value:105,asOf:'invalid'}},{name:'FIX'},{name:null}])assert.equal(projectStockHead({...stock,...change},null,null),null);
});

test('delivery writer uses final overlaid data, versions content and omits unavailable prices',async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join,dirname}=await import('node:path');
 const {writeStockHeadViews}=await import('../../vu2/stock-head-view.mjs');
 const dir=await mkdtemp(join(tmpdir(),'e5-head-')),source=join(dir,'code'),site=join(dir,'site');
 try{
  const files={
   'quant/api/product-services.js':`exports.create=({loadJSON})=>({getStockIntelligence:t=>loadJSON('/fixture.json').then(x=>({...x,ticker:t})),getUniverseEntry:async()=>({t:'COMMON_STOCK'}),getFactorEvidence:async()=>({})});`,
   'quant/engines/display-policy.js':'module.exports={};','quant/engines/query.js':'module.exports={};',
   'core/identity.js':`exports.shardKey=t=>t.slice(0,2);exports.securityIdForTicker=t=>'fixture-id';`,
   'quant/app/view-model.js':`exports.identityNote=()=>null;exports.stock=()=>({factorState:'AVAILABLE',overall:{rated:6}});`
  };
  for(const [file,text] of Object.entries(files)){await mkdir(dirname(join(source,file)),{recursive:true});await writeFile(join(source,file),text);}
  await mkdir(site);await writeFile(join(site,'fixture.json'),JSON.stringify(stock));
  const first=await writeStockHeadViews({source,site,tickers:['FIX']});assert.equal(first.records,1);
  const read=async()=>JSON.parse(await readFile(join(site,'quant/data/product/stock-head-v1/FI.json')));
  assert.equal((await read()).entries.FIX.price.value,105);
  // Data/live-style overlay happens after the code build, before this writer.
  await writeFile(join(site,'fixture.json'),JSON.stringify({...stock,price:{value:106,asOf:'2026-11-05'}}));
  const second=await writeStockHeadViews({source,site,tickers:['FIX']});assert.notEqual(second.version,first.version);assert.equal((await read()).entries.FIX.price.value,106);
  const manifest=JSON.parse(await readFile(join(site,'quant/data/product/stock-head-v1/index.json')));assert.equal(manifest.version,second.version);
  await writeFile(join(site,'fixture.json'),JSON.stringify({...stock,price:{value:106,reason:'DISPLAY_NOT_PERMITTED'}}));
  const third=await writeStockHeadViews({source,site,tickers:['FIX']});assert.equal(third.records,0);assert.deepEqual(third.rejected,['FIX']);assert.notEqual(third.version,second.version);
  await assert.rejects(writeStockHeadViews({source,site:source,tickers:[]}),/OUTPUT_MUST_BE_OUTSIDE_SOURCE/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('CLI requires an explicit external --out and never defaults to production data',async()=>{
 const {spawnSync}=await import('node:child_process'),{fileURLToPath}=await import('node:url');const script=fileURLToPath(new URL('../../vu2/stock-head-view.mjs',import.meta.url));
 const missing=spawnSync(process.execPath,[script],{encoding:'utf8'});assert.notEqual(missing.status,0);assert.match(missing.stderr,/USAGE/);
 const unsafe=spawnSync(process.execPath,[script,'--out',process.cwd()],{encoding:'utf8'});assert.notEqual(unsafe.status,0);assert.match(unsafe.stderr,/OUTPUT_MUST_BE_OUTSIDE_SOURCE/);
});
