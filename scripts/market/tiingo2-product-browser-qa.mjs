// Exercise the real delivered canonical products. Reports contain statuses,
// identities and screenshot paths; never provider response bodies or bars.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
export async function runProductBrowserQa({site,readiness,out,engine='chromium',root=process.cwd()}){
 if(!['chromium','webkit'].includes(engine))throw Error('UNSUPPORTED_BROWSER_ENGINE');
 const bytes=await readFile(readiness),report=JSON.parse(bytes),rows=report.rows;
 if(!Array.isArray(rows)||!rows.length||new Set(rows.map(r=>r.ticker)).size!==rows.length)throw Error('ACTUAL_PRODUCT_READINESS_ROWS_REQUIRED');
 for(const r of rows)if(!/^[A-Z0-9][A-Z0-9.-]{0,11}$/.test(r.ticker)||!r.instrumentId||!r.securityId)throw Error('INVALID_READINESS_IDENTITY');
 site=resolve(site);root=resolve(root);out=resolve(out);await mkdir(out,{recursive:true});
 const checks=[],findings=[],mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
 const server=createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p.endsWith('/'))p+='index.html';const file=resolve(site,'.'+p);if(!file.startsWith(site+sep))throw Error('PATH');res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end('Not found');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const playwright=require('playwright');let browser;
 const check=(name,ok,details={})=>{const row={name,status:ok?'PASS':'FAIL',...details};checks.push(row);if(!ok)findings.push(row);};
 try{
  browser=await playwright[engine].launch({headless:true,...(engine==='chromium'&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(45000);
  await page.goto(origin+'/quant/#/aktien',{waitUntil:'domcontentloaded'});await page.locator('main#qx-main[data-ready="true"]').waitFor();
  await page.evaluate(()=>{window.__tiingo2QaApi=window.VUProductServices.create({loadJSON:window.QuantShell.loadJSON,displayPolicy:window.VUDisplayPolicy,queryEngine:window.VUQuery});window.__tiingo2QaSignals=window.__tiingo2QaApi.getSignals({lookback:20});window.__tiingo2QaScreener=fetch('/screener/data/universe-US_REAL.json').then(r=>{if(!r.ok)throw Error('SCREENER_DELIVERY_MISSING');return r.json();});});
  const protectedClasses=await page.evaluate(async()=>{const found={};for(const ticker of ['GOOG','GOOGL','BRK-A','BRK-B']){const result=await window.__tiingo2QaApi.searchInstruments(ticker,{limit:30});found[ticker]=result.entries.find(e=>e.ticker===ticker)?.instrumentId??null;}return found;});
  for(const [ticker,id]of Object.entries(protectedClasses))check('PROTECTED_SHARE_CLASS_SEARCH',!!id,{ticker});
  check('PROTECTED_SHARE_CLASS_DISTINCT_IDS',!!protectedClasses.GOOG&&!!protectedClasses['BRK-A']&&protectedClasses.GOOG!==protectedClasses.GOOGL&&protectedClasses['BRK-A']!==protectedClasses['BRK-B']);
  for(const r of rows){
   const proof=await page.evaluate(async r=>{
    const api=window.__tiingo2QaApi,search=await api.searchInstruments(r.ticker,{limit:30}),canonicalName=search.entries?.find(e=>e.ticker===r.ticker)?.name,named=await api.searchInstruments(canonicalName||r.companyName,{limit:30});
    const exact=list=>list.entries?.some(e=>e.ticker===r.ticker&&e.instrumentId===r.instrumentId&&e.masterMemberId===r.securityId);
    const stock=await api.getStockIntelligence(r.ticker),chart=stock.chart,validBars=chart?.state==='AVAILABLE'&&chart.bars?.length>0&&chart.bars.every((b,i,list)=>/^\d{4}-\d{2}-\d{2}$/.test(b.date)&&Number.isFinite(b.close)&&b.close>0&&(!i||b.date>list[i-1].date));
    const long=await api.getHistoricalPriceHistory(r.ticker,{range:'MAX'}),validLong=long.state==='AVAILABLE'&&long.bars?.length>0&&long.bars.every((b,i,list)=>Number.isFinite(b.close)&&b.close>0&&(!i||b.date>list[i-1].date));
    const factor=await api.getFactorEvidence(r.ticker),technical=await api.getTechnicalIntelligence(r.ticker),signals=await window.__tiingo2QaSignals;
    const screener=await window.__tiingo2QaScreener;let discoverIdentity=null;if(r.discover?.ready){const response=await fetch('/discover/data/stocks/US_REAL/'+r.ticker+'.json');if(response.ok){const d=await response.json();discoverIdentity=d.symbol===r.ticker&&d.securityId===r.securityId&&d.instrumentId===r.instrumentId&&d.dataMode==='real'&&d.provider==='tiingo';}else discoverIdentity=false;}
    return {symbolSearch:exact(search),nameSearch:exact(named),identity:stock.instrumentId===r.instrumentId&&stock.masterMemberId===r.securityId,issuerId:stock.issuerId??null,chart:!!validBars,chartState:chart?.state??null,validPrice:stock.price?.state==='AVAILABLE'&&Number.isFinite(stock.price.value)&&stock.price.value>0,long:!!validLong,longState:long.state,factorState:factor.state,availableFactorIds:(factor.factors||[]).filter(f=>f.state==='AVAILABLE').map(f=>f.id),compositeState:factor.composite?.state??null,compositeAllowed:factor.publication?.compositeAllowed===true,technicalState:technical.state,signalState:signals.results?.find(s=>s.ticker===r.ticker)?.state??'UNAVAILABLE',screenerMember:screener.cols?.s?.includes(r.ticker)===true,discoverIdentity};
   },r);
   check('CANONICAL_SYMBOL_SEARCH',proof.symbolSearch,{ticker:r.ticker});check('CANONICAL_ISSUER_SEARCH',proof.nameSearch,{ticker:r.ticker});check('CANONICAL_DETAIL_IDENTITY',proof.identity,{ticker:r.ticker});
   if(Object.hasOwn(r,'companyId')||Object.hasOwn(r,'issuerId'))check('CANONICAL_DETAIL_ISSUER_IDENTITY',proof.issuerId===(r.companyId??r.issuerId??null),{ticker:r.ticker});
   let preservedBaseline=false;const existing=r.chart?.baselinePublished;
   if(!r.chart?.ready&&proof.chart&&existing?.state==='PRESERVED_BASELINE'&&existing.source==='EXISTING_PUBLISHED_BASELINE'&&existing.freshValidationIncluded===false&&existing.dailyPath?.split('/').at(-1)===r.securityId+'.json'&&/^\/quant\/data\/market\/(?:discover-series(?:-long)?|golden-preview\/daily)\/ref_[A-Z0-9._-]+\.json$/.test(existing.dailyPath||'')){
    const original=await readFile(resolve(root,'.'+existing.dailyPath)),delivered=await readFile(resolve(site,'.'+existing.dailyPath));
    const source=JSON.parse(original);preservedBaseline=source.securityId===r.securityId&&createHash('sha256').update(original).digest('hex')===existing.dailyArtifactSha256&&JSON.stringify(source)===JSON.stringify(JSON.parse(delivered));
   }
   check('DECLARED_CHART_READINESS',r.chart?.ready?proof.chart:!proof.chart||preservedBaseline,{ticker:r.ticker,state:proof.chartState,freshReady:r.chart?.ready===true,preservedBaseline,freshValidationState:r.chart?.freshValidationState??null});
   if(r.chart?.ready||r.chart?.priceReady)check('VALID_DELIVERED_PRICE',proof.validPrice,{ticker:r.ticker,chartReady:r.chart?.ready===true});
   if(r.chart?.longReady)check('DECLARED_MAX_HISTORY_READINESS',proof.long,{ticker:r.ticker,state:proof.longState});
   if(!r.chart?.longReady&&existing?.longPath){
    let valid=false;if(existing.state==='PRESERVED_BASELINE'&&existing.freshValidationIncluded===false&&existing.longPath==='/quant/data/market/discover-series-long/'+r.securityId+'.json'){
     const source=await readFile(resolve(root,'.'+existing.longPath)),delivered=await readFile(resolve(site,'.'+existing.longPath));
     valid=proof.long&&JSON.parse(source).securityId===r.securityId&&createHash('sha256').update(source).digest('hex')===existing.longArtifactSha256&&JSON.stringify(JSON.parse(source))===JSON.stringify(JSON.parse(delivered));
    }check('PRESERVED_BASELINE_MAX_HISTORY',valid,{ticker:r.ticker,state:proof.longState,freshCertified:false});
   }
   if(r.quant?.canonicalEvidence?.verified)check('CANONICAL_FACTOR_EVIDENCE',proof.factorState==='AVAILABLE',{ticker:r.ticker,state:proof.factorState});
   if(r.quant?.availableFactors?.length)check('DECLARED_FACTOR_AVAILABILITY',r.quant.availableFactors.every(id=>proof.availableFactorIds.includes(id)),{ticker:r.ticker});
   if(r.quant?.fullQuantScoreState==='BLOCKED_BY_EXISTING_METHODOLOGY')check('FULL_QUANT_METHODOLOGY_GATE',!proof.compositeAllowed&&proof.compositeState!=='AVAILABLE',{ticker:r.ticker,state:proof.compositeState});
   if(r.supertrader?.ready){check('CONDITIONAL_TECHNICAL_WORKSPACE',proof.technicalState==='AVAILABLE',{ticker:r.ticker,state:proof.technicalState});check('CONDITIONAL_SIGNAL_EVIDENCE',proof.signalState==='AVAILABLE',{ticker:r.ticker,state:proof.signalState});}
   if(r.screener?.ready)check('DELIVERED_SCREENER_MEMBERSHIP',proof.screenerMember,{ticker:r.ticker});
   if(r.discover?.ready)check('DELIVERED_DISCOVER_IDENTITY',proof.discoverIdentity===true,{ticker:r.ticker});
   if(r.logo?.status==='LOGO_VALID'){
    const path=r.logo.canonicalPath;if(typeof path!=='string')check('LOGO_VALID_ASSET',false,{ticker:r.ticker});else{const valid=await page.evaluate(async path=>{const img=new Image();return new Promise(resolve=>{img.onload=()=>resolve(img.naturalWidth>0&&img.naturalHeight>0);img.onerror=()=>resolve(false);img.src=path.startsWith('/')?path:'/'+path;});},path);check('LOGO_VALID_ASSET',valid,{ticker:r.ticker});}
   }
  }
  const symbols=rows.map(r=>r.ticker),watch=await page.evaluate(async symbols=>{window.VUWatchlistWorkspace.save(localStorage,symbols);const loaded=window.VUWatchlistWorkspace.load(localStorage),model=await window.__tiingo2QaApi.getWatchlistIntelligence(loaded);return {saved:loaded,members:model.members.map(m=>({ticker:m.ticker,instrumentId:m.instrumentId,masterMemberId:m.masterMemberId,state:m.state}))};},symbols);
  check('ALL_SCOPED_WATCHLIST_SELECTION',JSON.stringify(watch.saved)===JSON.stringify(symbols));
  for(const r of rows)check('ALL_SCOPED_WATCHLIST_CANONICAL_PAYLOAD',watch.members.some(m=>m.ticker===r.ticker&&m.instrumentId===r.instrumentId&&m.masterMemberId===r.securityId),{ticker:r.ticker});
  await page.reload();await page.locator('main#qx-main[data-ready="true"]').waitFor();check('WATCHLIST_RELOAD_PERSISTENCE',await page.evaluate(symbols=>JSON.stringify(window.VUWatchlistWorkspace.load(localStorage))===JSON.stringify(symbols),symbols));
  const targets=[...new Set(['DNA','CART','CRCL','FIG',rows.find(r=>r.logo?.status!=='LOGO_VALID')?.ticker,rows.find(r=>r.supertrader?.ready)?.ticker].filter(t=>rows.some(r=>r.ticker===t)))];
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:900});
   for(const ticker of targets){await page.goto(origin+'/quant/#/aktie/'+ticker);await page.locator('main#qx-main[data-ready="true"]').waitFor();check('VISIBLE_STOCK_DETAIL',await page.locator('main#qx-main').innerText().then(t=>t.includes(ticker)),{ticker,width});
    const row=rows.find(r=>r.ticker===ticker),button=page.locator('button.qx-watch');await button.waitFor();
    const canonicalIssuer=Object.hasOwn(row,'companyId')||Object.hasOwn(row,'issuerId')?(row.companyId??row.issuerId??null):await page.evaluate(async ticker=>{const api=window.VUProductServices.create({loadJSON:window.QuantShell.loadJSON,displayPolicy:window.VUDisplayPolicy,queryEngine:window.VUQuery});return (await api.getStockIntelligence(ticker)).issuerId??null;},ticker);
    const expected={ticker,listingId:row.instrumentId,securityId:row.securityId,companyId:canonicalIssuer};
    if(await button.getAttribute('aria-pressed')==='true')await button.click();await button.click();
    const storage=await page.evaluate(ticker=>({binding:window.QX.watch.identities()[ticker]??null,rawBinding:JSON.parse(localStorage.getItem('vu.quant.watchlist.identities.v1')||'{}')[ticker]??null,legacy:JSON.parse(localStorage.getItem('vu.quant.watchlist.v1')||'[]')}),ticker);
    check('VISIBLE_HERO_CANONICAL_WATCHLIST_BINDING',JSON.stringify(storage.binding)===JSON.stringify(expected)&&JSON.stringify(storage.rawBinding)===JSON.stringify(expected),{ticker,width});
    check('VISIBLE_HERO_LEGACY_WATCHLIST_RETAINED',Array.isArray(storage.legacy)&&storage.legacy.every(t=>typeof t==='string')&&storage.legacy.includes(ticker),{ticker,width});
    await page.reload();await page.locator('main#qx-main[data-ready="true"]').waitFor();check('VISIBLE_WATCHLIST_RELOAD',await page.locator('button.qx-watch').getAttribute('aria-pressed')==='true',{ticker,width});
    const persisted=await page.evaluate(ticker=>window.QX.watch.identities()[ticker]??null,ticker);check('VISIBLE_HERO_CANONICAL_BINDING_RELOAD',JSON.stringify(persisted)===JSON.stringify(expected),{ticker,width});
    await page.locator('button.qx-watch').click();const removed=await page.evaluate(ticker=>({binding:JSON.parse(localStorage.getItem('vu.quant.watchlist.identities.v1')||'{}')[ticker]??null,selected:window.QX.watch.has(ticker)}),ticker);check('VISIBLE_HERO_CANONICAL_BINDING_REMOVAL',removed.binding===null&&!removed.selected,{ticker,width});
    await page.locator('button.qx-watch').click();
    await page.screenshot({path:join(out,`${engine}-${width}-${ticker}.png`),fullPage:true});
   }
   for(const [route,selector] of [['/discover/#/','main#v2-main'],['/discover/#/maerkte','main#v2-main'],['/supertrader/','main#st-main']]){await page.goto(origin+route);await page.waitForFunction(s=>document.querySelector(s)?.innerText.length>200,selector);const text=await page.locator(selector).innerText();check('PROTECTED_PRODUCT_RENDER',!text.includes('konnte nicht geladen werden')&&!text.includes('Daten sind gerade nicht erreichbar'),{route,width});}
  }
  check('BROWSER_RUNTIME_ERRORS',errors.length===0,{errors});await context.close();
 }catch(e){findings.push({name:'BROWSER_EXECUTION',status:'FAIL',message:e.message});}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
 const result={schemaVersion:'tiingo2-product-browser-qa-1',engine,runId:report.runId??null,sourceReadinessSha256:createHash('sha256').update(bytes).digest('hex'),scopedTitles:rows.length,checks,findings,productionWrites:0};await writeFile(join(out,`tiingo2_product_browser_${engine}.json`),JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>{if(v.startsWith('--'))a.push([v.slice(2),all[i+1]]);return a;},[]));runProductBrowserQa(args).then(r=>{console.log(JSON.stringify({engine:r.engine,titles:r.scopedTitles,checks:r.checks.length,findings:r.findings.length}));if(r.findings.length)process.exitCode=1;}).catch(e=>{console.error(e.message);process.exitCode=1;});}
