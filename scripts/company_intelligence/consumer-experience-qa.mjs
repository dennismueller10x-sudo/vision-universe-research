/* Existing protected production only. Runner secret never enters reports/artifacts. */
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {accessStateFor,STORAGE_KEY} from '../access-gate/build.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const arg=(k,f)=>{const i=process.argv.indexOf('--'+k);return i<0?f:process.argv[i+1]};
const base=arg('url','https://research.visionuniverse.de').replace(/\/$/,''),out=arg('out','/tmp/consumer-experience'),version=arg('version','after');
const candidate=JSON.parse(await readFile('docs/company-intelligence/full-data-release-candidate.json','utf8'));
const live=base==='https://research.visionuniverse.de';
assert(live||base.startsWith('http://127.0.0.1:'),'APPROVED_PRODUCTION_OR_LOCAL_CANDIDATE_ONLY');
const release=live?await (await fetch(base+'/release-delivery.json?review='+Date.now())).json():null;
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.CHROMIUM_PATH||undefined});
const cases=[],examples=['TSLA','AAPL','NVDA','PLTR','XPEV'];await mkdir(out,{recursive:true});
try{
 if(live){const locked=await browser.newPage();await locked.goto(base+'/discover/#/s/US_REAL/AAPL');await locked.waitForSelector('#research-access-gate');assert.equal(await locked.locator('.ci-company-intelligence').count(),0);await locked.close();}
 async function reviewIssuer([cid,inventory]){for(const ticker of inventory.tickers){
  const combinations=version==='after'?['dark','light'].flatMap(theme=>[390,430,768,1440].map(width=>({theme,width}))):examples.includes(ticker)?[390,430,1440].map(width=>({theme:'dark',width})):[{theme:'dark',width:390}];
  for(const {theme,width} of combinations){
   const page=await browser.newPage({viewport:{width,height:860},colorScheme:theme}),errors=[],requests=[],payloads=[];
   if(process.env.RESEARCH_ACCESS_PASSWORD){const state=accessStateFor(process.env.RESEARCH_ACCESS_PASSWORD);await page.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:STORAGE_KEY,state});}
   await page.addInitScript(theme=>localStorage.setItem('vu-discover-theme-v1',theme),theme);
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/company-intelligence/data/'))requests.push(r.url())});
   page.on('response',r=>{if(r.url().includes(cid+'.json'))payloads.push(r.json())});
   await page.goto(base+'/discover/'+(live?'':'?company-intelligence=preview')+'#/s/US_REAL/'+ticker,{waitUntil:'domcontentloaded'});await page.waitForSelector('.ci-company-intelligence[aria-busy=false] h2');
   const chapter=page.locator('.ci-company-intelligence'),text=await chapter.innerText();const payload=await payloads[0];assert(payload&&payload.companyId===cid,ticker+' identity');
   assert(!text.includes('derzeit nicht verfügbar'),ticker+' unavailable');assert.deepEqual(errors,[]);assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,ticker+' page overflow');assert.equal(await chapter.evaluate(e=>e.scrollWidth>e.clientWidth),false,ticker+' chapter overflow');
   assert.equal(await page.locator('vu-navigation').count(),1);assert(requests.some(u=>u.includes(candidate.generation)),ticker+' generation');
   const links=await chapter.locator('a').evaluateAll(as=>as.map(a=>({url:a.href,visible:!!a.getBoundingClientRect().height,height:a.getBoundingClientRect().height})));
   const intelligence=chapter.locator('section.ci-block').filter({has:page.getByRole('heading',{name:version==='after'?'Aktuelles':'Neuigkeiten',exact:true})});
   const storyLinks=await intelligence.locator('a').evaluateAll(as=>as.map(a=>({url:a.href,visible:!!a.getBoundingClientRect().height})));
   const renderedNewsLinks=version==='after'?await chapter.locator('.ci-story[data-intelligence-type=NEWS]').evaluateAll(ns=>ns.map(n=>n.dataset.storyUrl)):storyLinks.map(a=>a.url);
   const newsURLs=new Set(payload.news.map(n=>n.canonicalUrl||n.sourceUrl));const visibleNews=new Set(storyLinks.filter(a=>a.visible&&newsURLs.has(a.url)).map(a=>a.url));
   if(version==='after'){
    assert.equal(await chapter.getAttribute('data-experience'),'v2');assert.equal(await chapter.locator('.ci-profile[lang=de]').count(),inventory.germanProfile?1:0);
    assert(!text.includes('keine Meldungen enthalten'));assert(!text.includes('Kein bestätigter kommender Termin'));assert(!text.includes('Quelle der Geschäftszahlen'));
    assert.equal(await chapter.locator('.ci-kpi').count()>0,inventory.financials==='AVAILABLE');
    assert.equal(await chapter.locator('details.ci-documents[open], details.ci-sources[open]').count(),0,'Evidence collapsed by default');
    assert(links.filter(a=>a.visible).every(a=>a.height>=44),'Visible links touch targets');
    if(inventory.staleFinancials&&inventory.financials==='AVAILABLE')assert(text.includes('Veraltete Geschäftszahlen'));
   }
   if(examples.includes(ticker)&&theme==='dark'&&[390,430,1440].includes(width)){
    await chapter.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${version}-${ticker}-${width}-dark-viewport.png`});
    await chapter.screenshot({path:`${out}/${version}-${ticker}-${width}-dark-chapter.png`,style:'vu-navigation,.v2-skip,.v2-dock{visibility:hidden!important}'});
   }
   const storyCount=await intelligence.locator('article.ci-story').count();
   cases.push({ticker,companyId:cid,width,theme,status:'PASS',generation:candidate.generation,consumerNews:payload.news.length,initiallyVisibleNews:visibleNews.size,consumerUniqueNewsURLs:newsURLs.size,newsRenderedIncludingSecondary:new Set(renderedNewsLinks.filter(u=>newsURLs.has(u))).size,renderedStoryElements:storyCount,headings:await chapter.locator('h3').allTextContents(),errors});
   if(width===390&&theme==='dark')await writeFile(`${out}/${ticker}-visible.txt`,text);await page.close();
  }
  console.log(ticker+' '+version+' PASS');
 }
 }
 const queue=Object.entries(candidate.inventory);await Promise.all(Array.from({length:3},async()=>{while(queue.length)await reviewIssuer(queue.shift());}));
 const outside=await browser.newPage();if(process.env.RESEARCH_ACCESS_PASSWORD){await outside.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:STORAGE_KEY,state:accessStateFor(process.env.RESEARCH_ACCESS_PASSWORD)});}const outsideRequests=[];outside.on('request',r=>{if(r.url().includes('/company-intelligence/data/'))outsideRequests.push(r.url())});await outside.goto(base+'/discover/#/s/US_REAL/ZZZZZ');await outside.waitForTimeout(1000);assert.equal(await outside.locator('.ci-company-intelligence').count(),0);assert.deepEqual(outsideRequests,[]);await outside.close();
 await writeFile(out+'/report.json',JSON.stringify({status:'PASS',version,origin:base,productionSHA:release?.sourceCommit,generation:candidate.generation,stocks:46,issuers:45,protectedAccess:live,cohortUnchanged:true,cases},null,2)+'\n');
}finally{await browser.close();}
