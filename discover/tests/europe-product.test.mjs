import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, stat, mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {dirname, resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const Product=require('../engines/europe-product.js');
const Core=require('../../core/europe-market-data.js');
const Contract=require('../engines/contract.js');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const id='ref_EUTEST_XETR',ref={region:'EUROPE',securityId:id};
const rights={display:true,commercial:true,evidenceRef:'synthetic-test-rights',dataPaths:['IDENTITY','RAW_EOD']};
function catalog(){return {securities:[{region:'EUROPE',securityId:id,companyId:'issuer:synthetic-europe',
  instrumentId:'vu_abcdef012345',name:'Synthetic Europe Equity',isin:'DE0007164600',ticker:'EUTEST',aliases:['EUTEST.DE'],
  acceptance:'ACCEPTED',identity:{status:'VERIFIED'},primaryListingId:'listing:EUTEST:XETR',
  listings:[{listingId:'listing:EUTEST:XETR',ticker:'EUTEST',providerSymbol:'EUTEST.DE',mic:'XETR',country:'DE',currency:'EUR',
    latest:{status:'LAST_VALID_SESSION',date:'2026-10-06'},history:{valid:true,observations:366},
    priceQuality:{status:'VALIDATED',evidenceRef:'synthetic-quality'},adjustment:{status:'ADJUSTMENT_UNKNOWN'}}]}]};}
function points(){return Array.from({length:366},(_,i)=>[new Date(Date.UTC(2025,9,6+i)).toISOString().slice(0,10),100+i/10]);}
function memory(){const values=new Map([['vu-discover-watchlist-v1','["TESTUS"]']]);return {values,storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}};}
function setup(options={}){
  let loads=0,searches=0;
  const data=catalog(),store=memory();
  const client=Core.create({usClient:{},catalog:data,rights:options.rights ?? rights,audience:options.audience || 'public',
    now:'2026-10-08T00:00:00Z',loadSeries:async request=>{loads++;return {securityId:id,listingId:'listing:EUTEST:XETR',
      basis:request.basis,currency:'EUR',points:points(),sessionContinuity:'VALIDATED',provenance:{evidenceRef:'synthetic-series'}};}});
  const original=client.search;client.search=function(){searches++;return original.apply(client,arguments);};
  const watchlist=Core.createWatchlist({storage:store.storage,catalog:data});
  const product=Product.create({client,watchlist,securityRefs:[id]});
  return {product,client,watchlist,store,loads:()=>loads,searches:()=>searches};
}

test('Discover closed gate prevents index/series loads and research clients cannot bypass public readiness',async()=>{
  for(const audience of ['public','research']){
    const s=setup({rights:{},audience});
    assert.equal((await s.product.search('EUTEST')).state,'UNAVAILABLE');
    assert.equal((await s.product.detail(id)).state,'UNAVAILABLE');
    assert.equal((await s.product.browse()).state,'UNAVAILABLE');
    assert.equal(s.loads(),0);assert.equal(s.searches(),0);
    assert.equal((await s.product.toggle(id)).state,'UNAVAILABLE');
    assert.deepEqual(s.watchlist.values(),[]);
  }
});

test('existing Discover contract receives canonical routes, explicit raw basis and missing metrics',async()=>{
  const s=setup(),result=await s.product.detail(id),stock=result.data;
  assert.equal(result.state,'AVAILABLE');
  Contract.assertStock(stock);
  assert.equal(stock.href,'#/s/EUROPE/'+id);
  assert.equal(stock.symbol,'EUTEST');assert.equal(stock.securityId,id);
  assert.equal(stock.currency,'EUR');assert.equal(stock.priceBasis,'RAW_UNADJUSTED');
  assert.match(stock.basisLabel,/unbereinigt/);
  assert.equal(stock.metrics.leadershipScore,null);assert.equal(stock.scores.leadership,null);
  assert.equal(stock.series.source,'vu-core-europe');
  assert.equal((await s.product.series(stock.europeRef)).data.points.length,366);
  assert.equal(s.loads(),1);
});

test('aliases/ISIN search has one canonical primary result and never emits duplicate UI routes',async()=>{
  const s=setup();
  for(const query of ['EUTEST','Synthetic Europe','DE0007164600','EUTEST.DE','XETR']){
    const result=await s.product.search(query);
    assert.equal(result.data.entries.length,1);
    assert.equal(result.data.entries[0].s,id);
    assert.equal(result.data.entries[0].displaySymbol,'EUTEST');
  }
  const original=s.client.search;
  s.client.search=async function(){const result=await original.apply(s.client,arguments);result.data.results.push({...result.data.results[0]});return result;};
  assert.equal((await s.product.search('EUTEST')).data.entries.length,1);
  assert.equal(s.loads(),0);
});

test('browse requires Discover readiness while identity-only Search/Watchlist remain available',async()=>{
  const s=setup();
  assert.equal((await s.product.browse()).data.cards.length,1);
  assert.equal(s.loads(),0);
  const data=catalog();data.securities[0].listings[0].history.valid=false;
  const client=Core.create({usClient:{},catalog:data,rights}),watchlist=Core.createWatchlist({storage:memory().storage,catalog:data});
  const product=Product.create({client,watchlist,securityRefs:[id]});
  assert.equal((await product.search('EUTEST')).data.entries.length,1);
  assert.equal((await product.detail(id)).data.price.value,null);
  assert.equal((await product.browse()).state,'UNAVAILABLE');
});

test('canonical Watchlist UI operations add/save/reload/remove preserve the existing US store',async()=>{
  const s=setup();
  assert.equal((await s.product.toggle(id)).data.saved,true);
  const next=Product.create({client:s.client,watchlist:Core.createWatchlist({storage:s.store.storage,catalog:catalog()}),securityRefs:[id]});
  assert.deepEqual(next.savedIds(),[id]);
  assert.equal((await next.saved()).data.members[0].name,'Synthetic Europe Equity');
  assert.deepEqual(next.remove(id),[]);
  assert.deepEqual(s.product.savedIds(),[]);
  assert.equal(s.store.values.get('vu-discover-watchlist-v1'),'["TESTUS"]');
});

test('saved unavailable securities remain removable without leaking formerly licensed identity',async()=>{
  const s=setup();await s.product.toggle(id);
  const closed=Core.create({usClient:{},catalog:catalog()});
  const next=Product.create({client:closed,watchlist:s.watchlist,securityRefs:[id]});
  const member=(await next.saved()).data.members[0];
  assert.equal(member.state,'UNAVAILABLE');assert.equal(member.name,null);assert.equal(member.href,null);
  assert.deepEqual(next.remove(id),[]);
});

test('existing App/Search/Detail glue is shipped and retains canonical/US routing boundaries',async()=>{
  const files=await Promise.all(['discover/app.js','discover/ui/search.js','discover/ui/detail.js','discover/ui/cards.js','discover/index.html','discover/ui/europe.js'].map(path=>readFile(resolve(root,path),'utf8')));
  assert.match(files[0],/D\.EuropeView\.attachApp/);assert.match(files[0],/D\.EuropeView\.render/);
  assert.match(files[5],/configureEurope\(options\)/);assert.match(files[5],/product\.detail\(id\)/);
  assert.match(files[1],/product\.search\(q\)/);assert.match(files[2],/D\.europeProduct\.series\(series.ref\)/);
  assert.match(files[2],/detail\.region !== "EUROPE"/);assert.match(files[3],/card\.region !== "EUROPE"/);
  assert.match(files[4],/\/discover\/engines\/europe-product.js/);
  assert.match(files[4],/\/discover\/ui\/europe.js/);
});

for(const scenario of [
  {key:'chromium-mobile',engine:'chromium',viewport:{width:390,height:844},isMobile:true,hasTouch:true},
  {key:'webkit-desktop',engine:'webkit',viewport:{width:1280,height:900}},
  {key:'webkit-iphone13',engine:'webkit',device:'iPhone 13'}
]) test('actual '+scenario.key+' App/Search/Detail/Watchlist: US routes, raw labels, dark reload and accessibility',
  {skip:process.env.VU_EUROPE_BROWSER_TESTS!=='1',timeout:120000},async()=>{
    let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');}
    const usStock=Object.assign(Contract.normalizeStock({symbol:'TESTUS',companyName:'Synthetic US Equity',dataMode:'real',universeId:'US_REAL'}),
      {scores:{leadership:null,momentum:null,relativeStrength:null,breakout:null},ranks:{},series:{source:null},fundamentals:{available:false},technicalIntelligence:{layers:{}}});
    const json={
      '/discover/data/meta.json':{universes:[{universeId:'US_REAL',label:'US',securities:1,asOf:'2026-10-06'}],realtime:{available:false},home:[],rows:[],visualLanguage:{sectorWorlds:{}},gates:{}},
      '/discover/data/search/US_REAL.json':{universeLabel:'US',entries:[{s:'TESTUS',n:'Synthetic US Equity',m:true}]},
      '/discover/data/stock-index/US_REAL.json':{symbols:['TESTUS']},
      '/discover/data/stocks/US_REAL/TESTUS.json':usStock,
      '/discover/logos/index.json':{files:{}},'/discover/logos/credits.json':{credits:{}}
    },requests=[];
    const server=createServer(async(req,res)=>{
      const path=new URL(req.url,'http://127.0.0.1').pathname;requests.push(path);
      if(json[path]){res.setHeader('content-type','application/json');res.end(JSON.stringify(json[path]));return;}
      const file=resolve(root,'.'+(path==='/'?'/discover/index.html':path.endsWith('/')?path+'index.html':path));
      try{if(!file.startsWith(root+sep)||(await stat(file)).isDirectory())throw Error('missing');
        res.setHeader('content-type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
      }catch{res.writeHead(404);res.end('not found');}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin='http://127.0.0.1:'+server.address().port;
    let browser;
    try{
      browser=await playwright[scenario.engine].launch({headless:true,...(scenario.engine==='chromium'?{executablePath:process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']}:{executablePath:process.env.VU_EUROPE_WEBKIT_EXECUTABLE || undefined})});
      const device=scenario.device?playwright.devices[scenario.device]:{viewport:scenario.viewport,isMobile:scenario.isMobile,hasTouch:scenario.hasTouch};
      const {defaultBrowserType,...contextOptions}=device;
      const page=await browser.newPage(contextOptions);
      const evidence={scenario:scenario.key,browser:scenario.engine,browserVersion:browser.version(),device:scenario.device || null,synthetic:true,providerRequests:0,accessibility:[],screenshots:[],externalRequestsBlocked:[]};
      const out=process.env.VU_EUROPE_BROWSER_EVIDENCE;
      if(out)await mkdir(out,{recursive:true});
      async function screenshot(name){if(out){const path=resolve(out,scenario.key+'-'+name+'.png');await page.screenshot({path});evidence.screenshots.push(path);}}
      let axePath=process.env.VU_EUROPE_AXE_PATH;
      if(!axePath){try{axePath=require.resolve('axe-core/axe.min.js');}catch{axePath='/tmp/vu-europe-browser-tools/node_modules/axe-core/axe.min.js';}}
      assert.ok(existsSync(axePath),'axe-core is required for explicit browser validation; install outside the repository');
      async function accessibility(name){
        await page.addScriptTag({path:axePath});
        const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
        evidence.accessibility.push({name,violations:result.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}))});
        assert.deepEqual(result.violations.filter(v=>v.impact==='critical').map(v=>v.id),[],'critical accessibility violations in '+name);
      }
      await page.route('**/*',route=>{
        const url=route.request().url();
        if(url.startsWith(origin))return route.continue();
        evidence.externalRequestsBlocked.push(url);
        if(/marketstack|tiingo/i.test(url))evidence.providerRequests++;
        return route.abort();
      });
      await page.goto(origin+'/discover/');await page.waitForSelector('#v2-main[aria-busy="false"]');
      evidence.viewResources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>/^\/discover\/(app|home|detail|themes)\.(js|css)$/.test(new URL(r.name).pathname)).map(r=>({path:new URL(r.name).pathname,decodedBytes:r.decodedBodySize})));
      evidence.viewDecodedBytes=evidence.viewResources.reduce((n,r)=>n+r.decodedBytes,0);
      assert.ok(evidence.viewDecodedBytes<=180000,'existing Discover view decoded byte budget');
      assert.ok(evidence.viewResources.length<=12,'existing Discover view request budget');
      await page.keyboard.press('/');await page.locator('input[type=search]').fill('TESTUS');
      await page.getByRole('option').filter({hasText:'Synthetic US Equity'}).click();
      await page.waitForURL('**/#/s/US_REAL/TESTUS');await page.waitForSelector('#v2-main[aria-busy="false"]');
      assert.ok(requests.includes('/discover/data/stocks/US_REAL/TESTUS.json'));
      await accessibility('existing-us-detail');await screenshot('us-baseline');
      await page.evaluate(()=>localStorage.setItem('vu-discover-watchlist-v1','["TESTUS"]'));
      async function connect(open,keepRoute=false){
        await page.addScriptTag({path:resolve(root,'core/europe-market-data.js')});
        await page.evaluate(({data,id,rights,points,open,keepRoute})=>{
          const Core=VUCore.EuropeMarketData;window.__euLoads=0;
          const client=Core.create({usClient:{},catalog:data,rights:open?rights:{},now:'2026-10-08T00:00:00Z',
            loadSeries:async request=>{window.__euLoads++;return {securityId:id,listingId:'listing:EUTEST:XETR',currency:'EUR',basis:request.basis,
              points,sessionContinuity:'VALIDATED',provenance:{evidenceRef:'synthetic-browser-series'}};}});
          VUDiscover.App.configureEurope({client,watchlist:Core.createWatchlist({storage:localStorage,catalog:data}),securityRefs:[id]});
          return keepRoute?VUDiscover.App.route():VUDiscover.App.selectUniverse('EUROPE');
        },{data:catalog(),id,rights,points:points(),open,keepRoute});
      }
      await connect(false);
      assert.equal(await page.evaluate(()=>window.__euLoads),0);
      assert.equal(await page.getByRole('link',{name:'Synthetic Europe Equity'}).count(),0);
      await page.keyboard.press('/');await page.locator('input[type=search]').fill('EUTEST');
      await page.waitForFunction(()=>document.querySelector('.dx-search-hint')?.textContent.includes('noch nicht freigegeben'));
      assert.equal(await page.getByRole('option').count(),0);await page.keyboard.press('Escape');
      await screenshot('rights-closed');
      await connect(true);
      assert.equal(await page.locator('a[href="#/s/EUROPE/'+id+'"]').count(),1);
      await page.keyboard.press('/');await page.locator('input[type=search]').fill('EUTEST.DE');
      await page.getByRole('option').filter({hasText:'Synthetic Europe Equity'}).waitFor();
      assert.equal(await page.getByRole('option').count(),1);
      await accessibility('europe-search');
      await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
      await page.waitForURL('**/#/s/EUROPE/'+id);
      await page.waitForSelector('.dx-chart-hero-span');
      assert.match(await page.locator('.dx-chart-hero-span').innerText(),/unbereinigt/);
      assert.match(await page.locator('.dx-price b').innerText(),/EUR|€/);
      assert.equal(await page.locator('#v2-main a[href*="/chartbild"]').count(),0);
      assert.equal(await page.locator('.dv2-stock-next a[href="#/c/EUROPE/all"]').count(),1);
      assert.equal(await page.evaluate(()=>window.__euLoads),1);
      await accessibility('europe-raw-detail-light');await screenshot('europe-detail-light');
      await page.locator('.v2-watch-button').click();
      assert.equal(await page.locator('.v2-watch-button').getAttribute('aria-pressed'),'true');
      await page.evaluate(()=>{location.hash='#/watchlist';});await page.waitForURL('**/#/watchlist/EUROPE');await page.waitForSelector('.v2-watch-row');
      assert.match(await page.locator('.v2-watch-row').innerText(),/Synthetic Europe Equity/);
      await page.evaluate(()=>{localStorage.setItem('vu-discover-theme-v1','dark');});
      await page.reload();await page.waitForSelector('#v2-main[aria-busy="false"]');await connect(true,true);
      assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
      await page.waitForURL('**/#/watchlist/EUROPE');await page.waitForSelector('.v2-watch-row');
      await accessibility('europe-watchlist-dark-reload');await screenshot('europe-watchlist-dark');
      await page.getByRole('button',{name:'Synthetic Europe Equity aus Watchlist entfernen'}).click();
      await page.waitForFunction(()=>document.querySelector('.v2-watch-list')?.textContent.includes('Noch keine europäischen Aktien'));
      assert.equal(await page.evaluate(()=>localStorage.getItem('vu-discover-watchlist-v1')),'["TESTUS"]');
      assert.equal(evidence.providerRequests,0);
      evidence.passed=true;evidence.checks=['existing-us-detail-route','rights-closed-zero-loads','canonical-browse','duplicate-free-alias-search','keyboard-search-open-arrow-enter-escape','raw-basis-native-EUR','no-unqualified-US-technical-link','add-save-browser-reload-remove','explicit-europe-watchlist-route','dark-mode','critical-axe-checks','existing-US-store-unchanged'];
      if(out)await writeFile(resolve(out,scenario.key+'.json'),JSON.stringify(evidence,null,2)+'\n');
    }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
  });
