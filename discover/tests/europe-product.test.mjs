import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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
const id='fixture_EUTEST_XETR',listingId='fixture_listing_EUTEST_XETR';
const now='2026-10-08T12:00:00Z';
const rights={display:true,commercial:true,evidenceRef:'SYNTHETIC_TEST_RIGHTS_ONLY',dataPaths:['IDENTITY','RAW_EOD']};
const sha=value=>createHash('sha256').update(value).digest('hex');
function fixtureCatalog({count=30,gap=true}={}){
  const points=Array.from({length:count},(_,n)=>[new Date(Date.UTC(2026,9,6-(count-1-n)*2)).toISOString().slice(0,10),100+n/10]);
  const companyId='fixture_issuer_europe',isin='DE0007164600',providerSymbol='EUTEST.DE',mic='XETR';
  const dimensions={securityId:id,listingId,companyId,isin,providerSymbol,mic,currency:'EUR'};
  const identityAdmission={...dimensions,version:'europe-discover-identity-2.0.0',status:'UNIVERSE_IDENTITY_READY',
    assetType:'EQUITY',issuerBinding:'SECURITY_SCOPED_OFFICIAL_ISSUER',securityKey:'ISIN:'+isin,active:true,
    localListingPlausible:true,issuerCountry:'DE',duplicateResolved:true,evidenceRefs:[{verified:true,sha256:sha('synthetic official identity')}]};
  const proof={...dimensions,version:'europe-discover-close-chart-1',evidenceRef:{verified:true,sha256:sha('synthetic close proof')},
    pointsSha256:sha(JSON.stringify(points)),sourceInputSha256:sha('synthetic input'),immutableExclusionsSha256:sha('synthetic exclusions'),
    evaluatedAt:now,observationCount:points.length,firstDate:points[0][0],lastDate:points.at(-1)[0],
    sessionLag:1,calendarSource:'SYNTHETIC_XETR_CALENDAR_WITH_REAL_SESSION_DATES',calendarSourceSha256:sha('synthetic calendar proof'),calendarProof:{evaluatedAt:now,verified:true,mic:'XETR',sourceSha256:sha('synthetic calendar proof'),coverageFrom:'2026-01-01',coverageTo:'2026-12-31',expectedLastCompletedSession:'2026-10-07',nextScheduledSession:{date:'2026-10-08',close:'2026-10-08T15:30:00Z'}},priceBasis:'RAW_UNADJUSTED',quoteUnit:'EUR',
    quoteBasis:{...dimensions,quoteUnit:'EUR',kind:'PROVIDER_EXPLICIT_QUOTE_CURRENCY',sourceSha256:sha('synthetic currency proof'),providerCurrencyObservationSha256:sha('synthetic provider currency observation'),contractSchemaSha256:sha('synthetic provider documented currency schema')},
    criticalIssues:[],reasonCodes:[],chartStatus:'CHART_LIMITED',segments:gap?[points.slice(0,10),points.slice(10)]:[points]};
  const catalog={securities:[{region:'EUROPE',securityId:id,companyId,isin,ticker:'EUTEST',name:'Synthetic Europe Equity',
    instrumentId:'fixture_instrument_europe',aliases:['EUTEST.DE'],acceptance:'DISCOVER_ONLY',primaryListingId:listingId,identityAdmission,
    listings:[{listingId,providerSymbol,mic,currency:'EUR',country:'DE',ticker:'EUTEST',identityAdmission,discoverChart:proof,
      latest:{status:'DELAYED',date:proof.lastDate},adjustment:{status:'ADJUSTMENT_INVALID'},priceQuality:{status:'INVALID',volumeValid:false}}]}]};
  return {catalog,points};
}
function fixtureSetup(options={}){
  const {catalog,points}=fixtureCatalog(options),store=new Map([['vu-discover-watchlist-v1','["TESTUS"]']]);
  const storage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
  let loads=0;
  const audience=options.audience||'public';
  const client=Core.create({usClient:{},catalog,rights:options.closed?{}:rights,audience,now,
    loadSeries:async request=>{loads++;return {...request,currency:'EUR',points,provenance:{evidenceRef:'SYNTHETIC_SERIES_ONLY'}};}});
  const watchlist=Core.createWatchlist({storage,catalog});
  const product=Product.create({client,watchlist,securityRefs:[id],audience:options.productAudience||'public',privateResearch:options.privateResearch,now});
  return {catalog,points,client,watchlist,product,store,loads:()=>loads};
}

function catalog(){return fixtureCatalog().catalog;}
function points(){return fixtureCatalog().points;}
const ref={region:'EUROPE',securityId:id};
test('actual Core accepts meaningful RAW close chart with strict inputs blocked',async()=>{
  const s=fixtureSetup(),result=await s.product.detail(id);
  assert.equal(result.state,'AVAILABLE');
  Contract.assertStock(result.data);
  assert.equal(result.data.readiness.IDENTITY,'VERIFIED');
  assert.equal(result.data.readiness.DISCOVER_ELIGIBLE,true);
  assert.equal(result.data.readiness.TECHNICAL_READY,false);
  assert.equal(result.data.readiness.QUANT_READY,false);
  assert.equal(result.data.priceBasis,'RAW_UNADJUSTED');
  assert.equal(result.data.metrics.leadershipScore,null);
  assert.equal(result.data.quantMessage,'Quant-Analyse für dieses Wertpapier noch nicht verfügbar.');
  assert.equal(result.data.technicalMessage,'Technische Analyse für dieses Wertpapier noch nicht verfügbar.');
  assert.equal((await s.product.series(result.data.europeRef)).data.segments.length,2);
  assert.equal(s.loads(),1);
});
test('actual Core identity-only single-point catalog never emits a visible product result',async()=>{
  const s=fixtureSetup({count:1,gap:false});
  assert.equal((await s.product.detail(id)).state,'UNAVAILABLE');
  assert.equal((await s.product.browse()).state,'UNAVAILABLE');
  assert.equal((await s.product.search('EUTEST')).state,'UNAVAILABLE');
  assert.equal((await s.product.toggle(id)).state,'UNAVAILABLE');
  assert.equal(s.loads(),0);
});
test('default adapter cannot use research Core to bypass public rights',async()=>{
  const s=fixtureSetup({closed:true,audience:'research'});
  assert.equal((await s.product.search('EUTEST')).state,'UNAVAILABLE');
  assert.equal((await s.product.browse()).state,'UNAVAILABLE');
  assert.equal(s.loads(),0);
});
test('explicit private research preview remains private and watchlist preserves US state',async()=>{
  const s=fixtureSetup({closed:true,audience:'research',productAudience:'research',privateResearch:true});
  const r=await s.product.detail(id);
  assert.equal(r.state,'AVAILABLE');assert.equal(r.privatePreview,true);assert.equal(r.publicationAllowed,false);
  assert.equal((await s.product.series(r.data.europeRef)).publicationAllowed,false);
  assert.equal((await s.product.toggle(id)).data.saved,true);
  assert.deepEqual(s.watchlist.reload(),[id]);
  assert.equal((await s.product.saved()).data.members.length,1);
  assert.equal((await s.product.toggle(id)).data.saved,false);
  assert.equal(s.store.get('vu-discover-watchlist-v1'),'["TESTUS"]');
});

test('aliases and duplicate provider-independent hits resolve exactly one usable detail',async()=>{
  const s=fixtureSetup(),original=s.client.search;
  s.client.search=async function(){const result=await original.apply(s.client,arguments);if(result.state==='AVAILABLE')result.data.results.push({...result.data.results[0]});return result;};
  for(const query of ['EUTEST','Synthetic Europe','DE0007164600','EUTEST.DE','XETR']){
    const result=await s.product.search(query);
    assert.equal(result.data.entries.length,1);assert.equal(result.data.entries[0].s,id);
    assert.equal((await s.product.detail(result.data.entries[0].s)).state,'AVAILABLE');
  }
  assert.equal(s.loads(),1);
});

test('Discover RAW basis stays separate from stricter certified analytics basis',async()=>{
  const s=fixtureSetup(),original=s.client.getReadiness;
  s.client.getReadiness=async function(){const result=await original.apply(s.client,arguments);result.data.priceBasis='CANONICAL_SPLIT_ADJUSTED';return result;};
  const result=await s.product.detail(id);
  assert.equal(result.state,'AVAILABLE');assert.equal(result.data.priceBasis,'RAW_UNADJUSTED');
  assert.equal(result.data.readiness.priceBasis,'CANONICAL_SPLIT_ADJUSTED');
});

for(const [field,value] of [['discoverPriceBasis','CANONICAL_SPLIT_ADJUSTED'],['DISCOVER_ELIGIBLE',false],['publicTier',0]])
  test('final permission '+field+' drift closes an already loaded chart',async()=>{
    const s=fixtureSetup(),original=s.client.getReadiness;let count=0;
    s.client.getReadiness=async function(){const result=await original.apply(s.client,arguments);if(++count>1)result.data[field]=value;return result;};
    const result=await s.product.detail(id);
    assert.equal(result.state,'UNAVAILABLE');assert.equal(result.publicationAllowed,false);
  });

test('a cached chart cannot retain the identity or latest quote of a changed listing',async()=>{
  const s=fixtureSetup();assert.equal((await s.product.detail(id)).state,'AVAILABLE');
  const original=s.client.getSecurity;
  s.client.getSecurity=async function(){const result=await original.apply(s.client,arguments);result.data.listingId='foreign_listing';return result;};
  assert.equal((await s.product.detail(id)).state,'UNAVAILABLE');
  assert.equal((await s.product.search('EUTEST')).data.entries.length,0);
});

test('caller mutation cannot turn the default public adapter into a private preview',async()=>{
  const s=fixtureSetup({closed:true,audience:'research'}),options={client:s.client,watchlist:s.watchlist,securityRefs:[id]};
  const product=Product.create(options);options.audience='research';options.privateResearch=true;
  assert.equal((await product.detail(id)).state,'UNAVAILABLE');assert.equal(product.privatePreview,false);
});

test('the next source-bound exchange session close expires Discover admission within 24 hours',async()=>{
  const s=fixtureSetup(),close=s.catalog.securities[0].listings[0].discoverChart.calendarProof.nextScheduledSession.close;
  const afterClose=new Date(Date.parse(close)+1).toISOString();let loads=0;
  const client=Core.create({usClient:{},catalog:s.catalog,rights,now:afterClose,loadSeries:async()=>{loads++;throw Error('expired proof must not load');}});
  const product=Product.create({client,watchlist:s.watchlist,securityRefs:[id],now:afterClose});
  assert.equal((await product.detail(id)).state,'UNAVAILABLE');assert.equal(loads,0);
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
        await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
        await page.addScriptTag({path:axePath});
        const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
        evidence.accessibility.push({name,violations:result.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}))});
        assert.deepEqual(result.violations.map(v=>v.id),[],'accessibility violations in '+name);
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
      async function connect(open,keepRoute=false,privateResearch=false){
        await page.addScriptTag({path:resolve(root,'core/europe-discover-eligibility.js')});
        await page.addScriptTag({path:resolve(root,'core/europe-market-data.js')});
        await page.evaluate(({data,id,rights,points,open,keepRoute,privateResearch,now,listingId})=>{
          const Core=VUCore.EuropeMarketData;window.__euLoads=0;
          const client=Core.create({usClient:{},catalog:data,rights:open&&!privateResearch?rights:{},audience:privateResearch?'research':'public',now,
            loadSeries:async request=>{window.__euLoads++;return {securityId:id,listingId,currency:'EUR',basis:request.basis,
              points,sessionContinuity:'VALIDATED',provenance:{evidenceRef:'synthetic-browser-series'}};}});
          VUDiscover.App.configureEurope({client,watchlist:Core.createWatchlist({storage:localStorage,catalog:data}),securityRefs:[id],audience:privateResearch?'research':'public',privateResearch,now});
          return keepRoute?VUDiscover.App.route():VUDiscover.App.selectUniverse('EUROPE');
        },{data:catalog(),id,rights,points:points(),open,keepRoute,privateResearch,now,listingId});
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
      assert.match(await page.locator('.dx-poster-preis').innerText(),/EUR|€/);
      await page.keyboard.press('/');await page.locator('input[type=search]').fill('EUTEST.DE');
      await page.getByRole('option').filter({hasText:'Synthetic Europe Equity'}).waitFor();
      assert.equal(await page.getByRole('option').count(),1);
      await accessibility('europe-search');
      await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
      await page.waitForURL('**/#/s/EUROPE/'+id);
      await page.waitForSelector('.dx-chart-hero-span');
      assert.match(await page.locator('.dx-chart-hero-span').innerText(),/unbereinigt/);
      assert.match(await page.locator('.dx-price b').innerText(),/EUR|€/);
      assert.equal(await page.locator('.dx-dhero-title h1').evaluate(node=>getComputedStyle(node).overflowWrap),'anywhere');
      assert.ok(await page.getByText(Product.QUANT_MISSING,{exact:true}).first().isVisible());
      assert.ok(await page.getByText(Product.TECHNICAL_MISSING,{exact:true}).first().isVisible());
      const line=await page.locator('.dx-range-line').getAttribute('d');
      assert.equal((line.match(/M/g)||[]).length,2,'quarantined gap must not become connected line');
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
      for(const route of ['welten','strategien','einzeln']){
        await page.evaluate(route=>{location.hash='#/'+route;},route);
        await page.waitForSelector('a[href="#/s/EUROPE/'+id+'"]');
      }
      assert.ok(!requests.some(path=>/data\/(rows|feeds)\/EUROPE/.test(path)));
      await connect(true,false,true);
      assert.ok(await page.getByText('Private Recherche-Vorschau · nicht öffentlich freigegeben.',{exact:true}).isVisible());
      assert.match(await page.locator('.dx-poster-preis').innerText(),/EUR|€/);
      assert.equal(await page.evaluate(async id=>(await VUDiscover.europeProduct.detail(id)).publicationAllowed,id),false);
      await accessibility('private-research-preview');
      assert.equal(evidence.providerRequests,0);
      evidence.passed=true;evidence.checks=['existing-us-detail-route','rights-closed-zero-loads','canonical-browse','duplicate-free-alias-search','keyboard-search-open-arrow-enter-escape','raw-basis-native-EUR','no-unqualified-US-technical-link','add-save-browser-reload-remove','explicit-europe-watchlist-route','dark-mode','critical-axe-checks','meaningful-basic-chart','gap-segments-preserved','exact-missing-analysis-messages','private-research-labelled-publication-closed','no-Europe-row-feed-deadend','existing-US-store-unchanged'];
      if(out)await writeFile(resolve(out,scenario.key+'.json'),JSON.stringify(evidence,null,2)+'\n');
    }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
  });
