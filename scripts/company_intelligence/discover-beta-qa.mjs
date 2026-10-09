/* Actual packaged Discover/Quant pages and explicitly separate adversarial responses. */
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {runtimeCandidate} from './runtime-candidate.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const arg=(k,f)=>{const i=process.argv.indexOf('--'+k);return i<0?f:process.argv[i+1]};
const base=arg('url','http://127.0.0.1:8783').replace(/\/$/,''),out=arg('out','/tmp/discover-beta-qa');
let candidate=JSON.parse(await readFile(arg('candidate','/tmp/release-candidate.json'),'utf8'));
const phase=arg('phase','all');assert(['all','actual','adversarial','dark'].includes(phase));
const production=process.argv.includes('--production');
if(production&&base==='https://research.visionuniverse.de')candidate=(await runtimeCandidate(base)).candidate;
const cohort=Object.values(candidate.inventory).flatMap(v=>v.tickers);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.CHROMIUM_PATH||undefined});
const cases=[],route=(product,ticker,preview=true)=>product==='quant'?`/quant/${preview&&!production?'?company-intelligence=preview':''}#/aktie/${ticker}`:`/discover/${preview&&!production?'?company-intelligence=preview':''}#/s/US_REAL/${ticker}`;
async function pageFor(product,ticker,width=390,preview=true){
 const page=await browser.newPage({viewport:{width,height:860}}),errors=[],requests=[];
 if(process.env.RESEARCH_ACCESS_PASSWORD){const {accessStateFor,STORAGE_KEY}=await import('../access-gate/build.mjs');await page.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:STORAGE_KEY,state:accessStateFor(process.env.RESEARCH_ACCESS_PASSWORD)});}
 if(phase==='dark')await page.addInitScript(()=>localStorage.setItem('vu-discover-theme-v1','dark'));
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/company-intelligence/data/'))requests.push(r.url())});
 await page.goto(base+route(product,ticker,preview),{waitUntil:'domcontentloaded'});
 if(preview)await page.waitForSelector('.ci-company-intelligence h2');else await page.waitForTimeout(1000);
 return {page,errors,requests};
}
async function mutate(page,change){await page.route('**/company-intelligence/data/**/iss_cik_0000320193.json',async r=>{const response=await r.fetch(),body=await response.json();change(body);await r.fulfill({response,json:body});});}
try{
 for(const product of (phase==='adversarial'?[]:phase==='dark'?['discover']:['discover','quant'])){
  const tickers=phase==='dark'?['AAPL','XPEV','NVDA','ROOT']:product==='discover'?cohort:['AAPL','ACU','CHE','GOOG','GOOGL','ROOT','XPEV','VEON'];
  for(const ticker of tickers)for(const width of (phase==='dark'?[390,430]:[390,430,768,1440])){
   const {page,errors,requests}=await pageFor(product,ticker,width),chapter=page.locator('.ci-company-intelligence'),text=await chapter.innerText();
   const expected=Object.values(candidate.inventory).find(v=>v.tickers.includes(ticker));
   assert(!text.includes('derzeit nicht verfügbar'),ticker+' consumer failed');
   assert.equal(await chapter.locator('.ci-profile[lang=de]').count(),expected.germanProfile?1:0,product+'/'+ticker+'/'+width+' profile');
   assert.equal(await chapter.getByRole('heading',{name:'Geschäftszahlen',exact:true}).count(),expected.financials==='AVAILABLE'?1:0,product+'/'+ticker+'/'+width+' financials '+text);
   if(expected.staleFinancials&&expected.financials==='AVAILABLE')assert(text.includes('Veraltete Geschäftszahlen'));
   assert(!text.includes('keine Meldungen enthalten'));
   assert.equal(await chapter.locator('details.ci-documents[open],details.ci-sources[open]').count(),0);
   assert(!text.includes('Kein bestätigter kommender Termin'));
   if(expected.confirmedUpcoming)assert(text.includes('Bestätigt'));
   assert(!text.includes('erweiterte Nachrichten- und Terminbestand ist hier noch nicht verfügbar'));
   assert.equal(await chapter.locator('a').evaluateAll(as=>as.every(a=>a.href.startsWith('https://')&&!/globenewswire|businesswire|prnewswire|newsfilecorp|accessnewswire/.test(a.href))),true);
   if(ticker==='CHE'){assert(text.includes('Ergebnisveröffentlichung')&&text.includes('Ergebnisgespräch'));assert(text.includes('28. Okt. 2026')&&text.includes('15:00')&&text.includes('MEZ'));assert(text.includes('Uhrzeit nicht angegeben'));}
   if(ticker==='AFRM'){assert(text.includes('Ergebnisveröffentlichung')&&text.includes('Ergebnisgespräch'));assert(text.includes('5. Nov. 2026')&&text.includes('23:00')&&text.includes('MEZ'));assert(text.includes('Uhrzeit nicht angegeben'));}
   if(ticker==='AFL')assert(text.includes('Telefonkonferenz'));
   const data=await (await page.request.get(requests.find(u=>u.endsWith('/'+Object.entries(candidate.inventory).find(([,v])=>v.tickers.includes(ticker))[0]+'.json')))).json();
   const eligible=[...data.news,...data.earnings.filter(e=>!e.isAmendment),...data.materialEvents.filter(e=>['HIGH','CRITICAL'].includes(e.importance))].some(e=>{const d=Date.parse(e.publishedAt||e.date);return Number.isFinite(d)&&d<=Date.now()&&Date.now()-d<=90*86400000;});
   assert.equal(await chapter.getByRole('heading',{name:'Aktuelles',exact:true}).count(),eligible?1:0,'Honest dated intelligence section');
   assert.equal(new Set(requests).size,3,product+'/'+ticker+' unique consumer paths');assert(requests.length<=6,product+'/'+ticker+' repeated mounts');assert.deepEqual(errors,[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await chapter.evaluate(e=>e.scrollWidth>e.clientWidth),false);
   assert.equal(await chapter.locator('a').evaluateAll(as=>as.filter(a=>a.getBoundingClientRect().height>0).every(a=>a.getBoundingClientRect().height>=44)),true);
   assert.equal(await chapter.evaluate(e=>parseFloat(getComputedStyle(e).paddingLeft)>=14),true);
   if(phase==='dark'){assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');if(ticker==='XPEV'){assert(text.includes('CNY'));assert(!text.includes('USD'));}await page.screenshot({path:`${out}/${product}-${ticker}-${width}-dark-viewport.png`});}
   if(product==='discover'&&width===390&&['AAPL','ACU','CHE','ROOT','XPEV','VEON'].includes(ticker)){
    await chapter.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${product}-${ticker}-${width}-viewport.png`});
    // Long chapter capture omits fixed chrome only during capture. Navigation
    // is still present in the viewport evidence and in all layout assertions.
    await chapter.screenshot({path:`${out}/${product}-${ticker}-${width}-chapter.png`,style:'vu-navigation,.v2-skip,.v2-dock{visibility:hidden!important}'});
    await writeFile(`${out}/${product}-${ticker}.txt`,text);
   }
   if(product==='discover'&&width===390)await writeFile(`${out}/${ticker}-visible.txt`,text);
   cases.push({product,ticker,width,kind:'ACTUAL_CANDIDATE',status:'PASS'});if(width===1440)console.log(product+' '+ticker+' responsive PASS');await page.close();
  }
  const disabled=await pageFor(product,production?'ZZZZZ':'AAPL',390,false);assert.equal(await disabled.page.locator('.ci-company-intelligence').count(),0);assert.deepEqual(disabled.requests,[]);await disabled.page.close();cases.push({product,kind:production?'OUT_OF_COHORT_ZERO_REQUESTS':'DISABLED_ZERO_REQUESTS',status:'PASS'});
 }
 const attacks=['TRANSIENT_503_RECOVERY','PERMANENT_503_FAIL_CLOSED','INDEX_MISSING','LOOKUP_MISMATCH','COMPANY_TIMESTAMP_MISMATCH','NO_PROFILE','STALE_FINANCIALS','DUPLICATES_AND_OLD_NEWS','CANCELLED_AND_PAST_EVENTS','DATE_ONLY_AND_SEPARATE_CALL','ESTIMATE_ONLY','BERLIN_DST','WEBCAST_AND_LETTER','UNSAFE_LINK','AMBIGUOUS_IDENTITY','ANNUAL_WHAT_CHANGED','UNKNOWN_COMPARISON','CANCELLED_CALL','SHARES_REQUIRE_CONTEXT','ANNUAL_REPORT_LABEL','UNDATED_NEWS_NO_TRUNCATION'];
 for(const product of (phase==='actual'||phase==='dark'?[]:['discover','quant']))for(const attack of attacks){
  const page=await browser.newPage({viewport:{width:390,height:860}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cid='iss_cik_0000320193',future='2026-10-24';
  let transientAttempts=0;
  if(attack==='TRANSIENT_503_RECOVERY'||attack==='PERMANENT_503_FAIL_CLOSED')await page.route('**/company-intelligence/data/**/'+cid+'.json',async r=>{transientAttempts++;if(attack==='PERMANENT_503_FAIL_CLOSED'||transientAttempts===1)await r.fulfill({status:503,body:'Temporary upstream failure'});else await r.continue();});
  else if(attack==='INDEX_MISSING')await page.route('**/company-intelligence/data/index.json',r=>r.fulfill({status:404,body:'{}'}));
  else if(attack==='LOOKUP_MISMATCH'||attack==='AMBIGUOUS_IDENTITY')await page.route('**/company-intelligence/data/**/lookup/AA.json',async r=>{const response=await r.fetch(),body=await response.json();if(attack==='LOOKUP_MISMATCH')body.generation='0'.repeat(24);else body.tickers.AAPL.push({companyId:'iss_cik_0000000001',instrumentId:'vu_12345678901234'});await r.fulfill({response,json:body});});
  else await mutate(page,body=>{
   if(attack==='COMPANY_TIMESTAMP_MISMATCH')body.generatedAt='2026-10-05T00:00:00Z';
   if(attack==='NO_PROFILE')delete body.companyProfile;
   if(attack==='STALE_FINANCIALS')body.latestFinancials.stale=true;
   if(attack==='DUPLICATES_AND_OLD_NEWS'){body.earnings=[];body.materialEvents=[];}
   if(attack==='DUPLICATES_AND_OLD_NEWS')body.news=[{companyId:cid,newsId:'a',eventType:'NEWS',headline:'Aktuelle belegte Meldung',publishedAt:body.generatedAt,canonicalUrl:'https://www.apple.com/newsroom/test/'},{companyId:cid,newsId:'b',eventType:'NEWS',headline:'Doppelter Titel',publishedAt:body.generatedAt,canonicalUrl:'https://www.apple.com/newsroom/test/'},{companyId:cid,newsId:'old',eventType:'NEWS',headline:'Historische Meldung',publishedAt:'2020-01-01T12:00:00Z',canonicalUrl:'https://www.apple.com/newsroom/old/'}];
   if(attack==='CANCELLED_AND_PAST_EVENTS')body.events=[{companyId:cid,eventType:'EARNINGS_CALL',confirmationStatus:'CONFIRMED',eventStatus:'CANCELLED',date:future,headline:'Abgesagter Call'},{companyId:cid,eventType:'EARNINGS_CALL',confirmationStatus:'CONFIRMED',date:'2020-01-01',headline:'Vergangener Call'}];
   if(attack==='DATE_ONLY_AND_SEPARATE_CALL')body.events=[{companyId:cid,eventType:'EARNINGS_SCHEDULED',confirmationStatus:'CONFIRMED',date:future,sourceUrl:'https://www.apple.com/'},{companyId:cid,eventType:'EARNINGS_CALL',confirmationStatus:'CONFIRMED',date:future,startsAt:'2026-10-24T23:30:00Z',sourceUrl:'https://www.apple.com/'}];
   if(attack==='ESTIMATE_ONLY')body.events=[{companyId:cid,eventType:'EARNINGS_ESTIMATED',confirmationStatus:'ESTIMATED',dateStart:'2026-10-20',dateEnd:'2026-11-01'}];
   if(attack==='BERLIN_DST')body.events=[{companyId:cid,eventType:'EARNINGS_CALL',confirmationStatus:'CONFIRMED',date:'2026-10-25',startsAt:'2026-10-25T01:30:00Z',sourceUrl:'https://www.apple.com/'}];
  if(attack==='WEBCAST_AND_LETTER'){body.calls=[{companyId:cid,eventId:'historic',date:'2026-09-01',eventType:'EARNINGS_CALL',webcastUrl:'https://www.apple.com/webcast/'}];body.materials=[{companyId:cid,type:'SHAREHOLDER_LETTER',url:'https://www.apple.com/letter/'}]}
   if(attack==='UNSAFE_LINK')body.materials=[{companyId:cid,type:'PRESENTATION',url:'javascript:window.__ciXss=true'},{companyId:cid,type:'PRESENTATION',url:'http://127.0.0.1/private'}];
   if(attack==='ANNUAL_WHAT_CHANGED'){body.latestFinancials.fiscalQuarter=null;body.latestFinancials.periodType='FY';body.latestFinancials.fiscalYear=2025;body.latestFinancials.metrics.gross_margin={current:{value:42,unit:'percent'},changePercentagePoints:2};body.latestFinancials.whatChanged=[{metric:'gross_margin',comparison:'PREVIOUS_YEAR',absolute:2,unit:'percentage_points'}];}
   if(attack==='UNKNOWN_COMPARISON')body.latestFinancials.whatChanged=[{metric:'revenue',comparison:'UNKNOWN',previous:1,current:2,unit:'USD'}];
   if(attack==='SHARES_REQUIRE_CONTEXT')body.latestFinancials.whatChanged=[{metric:'shares_outstanding',comparison:'YEAR_AGO_QUARTER',classification:'NOT_COMPARABLE',interpretation:'SHARE_COUNT_CHANGE_REQUIRES_SPLIT_ISSUANCE_BUYBACK_CONTEXT',previous:100,current:300,unit:'shares'}];
   if(attack==='ANNUAL_REPORT_LABEL'){body.materials=[{companyId:cid,type:'FINANCIAL_REPORT',label:'Company_2025AnnualReport.pdf2025 Annual Report',date:null,url:'https://www.apple.com/annual/2025.pdf'}];body.earningsBundles=[];body.filings=[];}
   if(attack==='UNDATED_NEWS_NO_TRUNCATION'){body.news=Array.from({length:20},(_,i)=>({companyId:cid,newsId:'unknown-'+i,eventType:'NEWS',headline:'Belegte undatierte Meldung '+i,publishedAt:null,observedAt:body.generatedAt,canonicalUrl:'https://www.apple.com/undated/'+i}));body.earnings=[];body.materialEvents=[];}
   if(attack==='CANCELLED_CALL')body.calls=[{companyId:cid,eventId:'cancelled',date:'2026-09-01',status:'CANCELLED',webcastUrl:'https://www.apple.com/cancelled/'}];
  });
  await page.goto(base+route(product,'AAPL'));await page.waitForSelector('.ci-company-intelligence h2');const chapter=page.locator('.ci-company-intelligence'),text=await chapter.innerText();
  if(['INDEX_MISSING','LOOKUP_MISMATCH','COMPANY_TIMESTAMP_MISMATCH','AMBIGUOUS_IDENTITY'].includes(attack))assert(text.includes('derzeit nicht verfügbar'));
  if(attack==='TRANSIENT_503_RECOVERY'){assert(!text.includes('derzeit nicht verfügbar'));assert.equal(transientAttempts,2);assert.equal(await chapter.getByRole('heading',{name:'Geschäftszahlen',exact:true}).count(),1);}
  if(attack==='PERMANENT_503_FAIL_CLOSED'){assert(text.includes('derzeit nicht verfügbar'));assert.equal(transientAttempts,3);assert.equal(await chapter.locator('.ci-kpi').count(),0);}
  if(attack==='NO_PROFILE')assert(text.includes('deutsche Beschreibung ist noch nicht verfügbar'));
  if(attack==='STALE_FINANCIALS')assert(text.includes('Veraltete Geschäftszahlen'));
  if(attack==='DUPLICATES_AND_OLD_NEWS'){assert.equal(await chapter.getByRole('link',{name:'Aktuelle belegte Meldung',exact:true}).count(),1);assert.equal(await chapter.getByText('Doppelter Titel',{exact:true}).count(),0);assert.equal(await chapter.getByRole('link',{name:'Historische Meldung',exact:true}).isVisible(),false)}
  if(attack==='CANCELLED_AND_PAST_EVENTS'){assert(!text.includes('Abgesagter Call'));assert(!text.includes('Vergangener Call'));assert.equal(await chapter.getByRole('heading',{name:'Als Nächstes',exact:true}).count(),0)}
  if(attack==='DATE_ONLY_AND_SEPARATE_CALL'){assert(text.includes('Ergebnisveröffentlichung'));assert(text.includes('Ergebnisgespräch'));assert(text.includes('Uhrzeit nicht angegeben'));assert(text.includes('25. Okt. 2026'));assert(text.includes('01:30'))}
  if(attack==='ESTIMATE_ONLY'){assert(text.includes('Geschätzt'));assert(text.includes('Geschätzter Berichtszeitraum'));assert(text.includes('Basierend auf dem bisherigen Berichtsrhythmus.'));assert(!text.includes('Bestätigt'));await chapter.locator('details.ci-sources > summary').click();assert((await chapter.innerText()).includes('keine bestätigten Termine'));}
  if(attack==='BERLIN_DST'){assert(text.includes('02:30'));assert(text.includes('MEZ'))}
  if(['WEBCAST_AND_LETTER','ANNUAL_REPORT_LABEL'].includes(attack))await chapter.locator('details.ci-documents > summary').click();
  if(attack==='WEBCAST_AND_LETTER'){assert.equal(await chapter.getByRole('link',{name:'Webcast',exact:true}).count(),1);assert.equal(await chapter.getByRole('link',{name:'Aufzeichnung',exact:true}).count(),0);assert.equal(await chapter.getByRole('link',{name:'Unternehmenstranskript',exact:true}).count(),0);assert((await chapter.innerText()).includes('Aktionärsbrief'))}
  if(attack==='UNSAFE_LINK'){assert.equal(await chapter.locator('a[href^="javascript:"],a[href*="127.0.0.1"]').count(),0);assert.equal(await page.evaluate(()=>window.__ciXss),undefined)}
  if(attack==='ANNUAL_WHAT_CHANGED'){assert(text.includes('Geschäftsjahr 2025'));assert.equal(await chapter.getByRole('heading',{name:'Was hat sich verändert?',exact:true}).count(),1);assert(text.includes('+2 Prozentpunkte')&&text.includes('Vorjahr'));assert(!text.includes('2 Prozentpunkte zum Vorjahresquartal'));}
  if(attack==='UNKNOWN_COMPARISON')assert.equal(await chapter.getByRole('heading',{name:'Was hat sich verändert?',exact:true}).count(),0);
  if(attack==='SHARES_REQUIRE_CONTEXT'){assert(!text.includes('Aktienanzahl:'));assert.equal(await chapter.getByRole('heading',{name:'Was hat sich verändert?',exact:true}).count(),0);}
  if(attack==='ANNUAL_REPORT_LABEL'){assert.equal(await chapter.getByRole('link',{name:'Jahresbericht 2025',exact:true}).count(),1);assert((await chapter.innerText()).includes('Veröffentlichungsdatum nicht angegeben'));}
  if(attack==='UNDATED_NEWS_NO_TRUNCATION'){assert.equal(await chapter.getByRole('heading',{name:'Aktuelles',exact:true}).count(),0);const docs=chapter.locator('details.ci-documents');assert.equal(await docs.getAttribute('open'),null);await docs.locator(':scope > summary').click();await docs.locator('details > summary').click();assert.equal(await docs.locator('a[href*="/undated/"]').count(),20);assert.equal(await docs.locator('a[href*="/undated/"]').evaluateAll(as=>as.every(a=>a.getBoundingClientRect().height>=44)),true);assert((await docs.innerText()).includes('Veröffentlichungsdatum nicht angegeben'));}
  if(attack==='CANCELLED_CALL'){assert.equal(await chapter.getByRole('heading',{name:'Calls / Webcasts',exact:true}).count(),0);assert.equal(await chapter.locator('a[href*="/cancelled/"]').count(),0);}
  assert.deepEqual(errors,[]);cases.push({product,kind:attack,status:'PASS'});console.log(product+' '+attack+' PASS');await page.close();
 }
 const report={status:'PASS',phase,generation:candidate.generation,actualCases:cases.filter(c=>c.kind==='ACTUAL_CANDIDATE').length,adversarialCases:cases.filter(c=>attacks.includes(c.kind)).length,cases};
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,generation:report.generation,actualCases:report.actualCases,adversarialCases:report.adversarialCases,total:cases.length}));
}finally{await browser.close()}
