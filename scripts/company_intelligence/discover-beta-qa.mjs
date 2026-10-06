/* Actual packaged Discover/Quant pages and explicitly separate adversarial responses. */
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const arg=(k,f)=>{const i=process.argv.indexOf('--'+k);return i<0?f:process.argv[i+1]};
const base=arg('url','http://127.0.0.1:8783').replace(/\/$/,''),out=arg('out','/tmp/discover-beta-qa');
const candidate=JSON.parse(await readFile(arg('candidate','/tmp/release-candidate.json'),'utf8'));
const cohort=Object.values(candidate.inventory).flatMap(v=>v.tickers);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.CHROMIUM_PATH||undefined});
const cases=[],route=(product,ticker,preview=true)=>product==='quant'?`/quant/${preview?'?company-intelligence=preview':''}#/aktie/${ticker}`:`/discover/${preview?'?company-intelligence=preview':''}#/s/US_REAL/${ticker}`;
async function pageFor(product,ticker,width=390,preview=true){
 const page=await browser.newPage({viewport:{width,height:860}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/company-intelligence/data/'))requests.push(r.url())});
 await page.goto(base+route(product,ticker,preview),{waitUntil:'domcontentloaded'});
 if(preview)await page.waitForSelector('.ci-company-intelligence h2');else await page.waitForTimeout(1000);
 return {page,errors,requests};
}
async function mutate(page,change){await page.route('**/company-intelligence/data/**/iss_cik_0000320193.json',async r=>{const response=await r.fetch(),body=await response.json();change(body);await r.fulfill({response,json:body});});}
try{
 for(const product of ['discover','quant']){
  const tickers=product==='discover'?cohort:['AAPL','ACU','CHE','GOOG','GOOGL','ROOT','XPEV','VEON'];
  for(const ticker of tickers)for(const width of [390,430,768,1440]){
   const {page,errors,requests}=await pageFor(product,ticker,width),chapter=page.locator('.ci-company-intelligence'),text=await chapter.innerText();
   const expected=Object.values(candidate.inventory).find(v=>v.tickers.includes(ticker));
   assert(!text.includes('derzeit nicht verfügbar'),ticker+' consumer failed');
   assert.equal(await chapter.locator('.ci-profile[lang=de]').count(),expected.germanProfile?1:0,product+'/'+ticker+'/'+width+' profile');
   assert.equal(await chapter.getByRole('heading',{name:'Letzte Geschäftszahlen',exact:true}).count(),expected.financials==='AVAILABLE'?1:0,product+'/'+ticker+'/'+width+' financials '+text);
   if(expected.staleFinancials&&expected.financials==='AVAILABLE')assert(text.includes('Veraltete Geschäftszahlen'));
   assert(text.includes('keine Meldungen enthalten'));assert(text.includes('Kein bestätigter kommender Termin'));
   assert.equal(new Set(requests).size,3,product+'/'+ticker+' unique consumer paths');assert(requests.length<=6,product+'/'+ticker+' repeated mounts');assert.deepEqual(errors,[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await chapter.evaluate(e=>e.scrollWidth>e.clientWidth),false);
   assert.equal(await chapter.locator('a').evaluateAll(as=>as.every(a=>a.getBoundingClientRect().height>=44)),true);
   assert.equal(await chapter.evaluate(e=>parseFloat(getComputedStyle(e).paddingLeft)>=14),true);
   if(product==='discover'&&width===390&&['AAPL','ACU','CHE','ROOT','XPEV','VEON'].includes(ticker)){
    await chapter.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${product}-${ticker}-${width}-viewport.png`});
    // Long chapter capture omits fixed chrome only during capture. Navigation
    // is still present in the viewport evidence and in all layout assertions.
    await chapter.screenshot({path:`${out}/${product}-${ticker}-${width}-chapter.png`,style:'vu-navigation,.v2-skip,.dx-dock{visibility:hidden!important}'});
    await writeFile(`${out}/${product}-${ticker}.txt`,text);
   }
   cases.push({product,ticker,width,kind:'ACTUAL_CANDIDATE',status:'PASS'});await page.close();
  }
  const disabled=await pageFor(product,'AAPL',390,false);assert.equal(await disabled.page.locator('.ci-company-intelligence').count(),0);assert.deepEqual(disabled.requests,[]);await disabled.page.close();cases.push({product,kind:'DISABLED_ZERO_REQUESTS',status:'PASS'});
 }
 const attacks=['INDEX_MISSING','LOOKUP_MISMATCH','COMPANY_TIMESTAMP_MISMATCH','NO_PROFILE','STALE_FINANCIALS','DUPLICATES_AND_OLD_NEWS','CANCELLED_AND_PAST_EVENTS','DATE_ONLY_AND_SEPARATE_CALL','ESTIMATE_ONLY','BERLIN_DST','WEBCAST_AND_LETTER','UNSAFE_LINK','AMBIGUOUS_IDENTITY'];
 for(const product of ['discover','quant'])for(const attack of attacks){
  const page=await browser.newPage({viewport:{width:390,height:860}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cid='iss_cik_0000320193',future='2026-10-24';
  if(attack==='INDEX_MISSING')await page.route('**/company-intelligence/data/index.json',r=>r.fulfill({status:404,body:'{}'}));
  else if(attack==='LOOKUP_MISMATCH'||attack==='AMBIGUOUS_IDENTITY')await page.route('**/company-intelligence/data/**/lookup/AA.json',async r=>{const response=await r.fetch(),body=await response.json();if(attack==='LOOKUP_MISMATCH')body.generation='0'.repeat(24);else body.tickers.AAPL.push({companyId:'iss_cik_0000000001',instrumentId:'vu_12345678901234'});await r.fulfill({response,json:body});});
  else await mutate(page,body=>{
   if(attack==='COMPANY_TIMESTAMP_MISMATCH')body.generatedAt='2026-10-05T00:00:00Z';
   if(attack==='NO_PROFILE')delete body.companyProfile;
   if(attack==='STALE_FINANCIALS')body.latestFinancials.stale=true;
   if(attack==='DUPLICATES_AND_OLD_NEWS')body.news=[{companyId:cid,newsId:'a',eventType:'NEWS',headline:'Aktuelle belegte Meldung',publishedAt:body.generatedAt,canonicalUrl:'https://www.apple.com/newsroom/test/'},{companyId:cid,newsId:'b',eventType:'NEWS',headline:'Doppelter Titel',publishedAt:body.generatedAt,canonicalUrl:'https://www.apple.com/newsroom/test/'},{companyId:cid,newsId:'old',eventType:'NEWS',headline:'Historische Meldung',publishedAt:'2020-01-01T12:00:00Z',canonicalUrl:'https://www.apple.com/newsroom/old/'}];
   if(attack==='CANCELLED_AND_PAST_EVENTS')body.events=[{companyId:cid,eventType:'EARNINGS_CALL',confirmationStatus:'CONFIRMED',eventStatus:'CANCELLED',date:future,headline:'Abgesagter Call'},{companyId:cid,eventType:'EARNINGS_CALL',confirmationStatus:'CONFIRMED',date:'2020-01-01',headline:'Vergangener Call'}];
   if(attack==='DATE_ONLY_AND_SEPARATE_CALL')body.events=[{companyId:cid,eventType:'EARNINGS_SCHEDULED',confirmationStatus:'CONFIRMED',date:future,sourceUrl:'https://www.apple.com/'},{companyId:cid,eventType:'EARNINGS_CALL',confirmationStatus:'CONFIRMED',date:future,startsAt:'2026-10-24T23:30:00Z',sourceUrl:'https://www.apple.com/'}];
   if(attack==='ESTIMATE_ONLY')body.events=[{companyId:cid,eventType:'EARNINGS_ESTIMATED',confirmationStatus:'ESTIMATED',dateStart:'2026-10-20',dateEnd:'2026-11-01'}];
   if(attack==='BERLIN_DST')body.events=[{companyId:cid,eventType:'EARNINGS_CALL',confirmationStatus:'CONFIRMED',date:'2026-10-25',startsAt:'2026-10-25T01:30:00Z',sourceUrl:'https://www.apple.com/'}];
   if(attack==='WEBCAST_AND_LETTER'){body.calls=[{companyId:cid,eventId:'historic',date:'2026-09-01',eventType:'EARNINGS_CALL',webcastUrl:'https://www.apple.com/webcast/'}];body.materials=[{companyId:cid,type:'SHAREHOLDER_LETTER',url:'https://www.apple.com/letter/'}]}
   if(attack==='UNSAFE_LINK')body.materials=[{companyId:cid,type:'PRESENTATION',url:'javascript:window.__ciXss=true'},{companyId:cid,type:'PRESENTATION',url:'http://127.0.0.1/private'}];
  });
  await page.goto(base+route(product,'AAPL'));await page.waitForSelector('.ci-company-intelligence h2');const chapter=page.locator('.ci-company-intelligence'),text=await chapter.innerText();
  if(['INDEX_MISSING','LOOKUP_MISMATCH','COMPANY_TIMESTAMP_MISMATCH','AMBIGUOUS_IDENTITY'].includes(attack))assert(text.includes('derzeit nicht verfügbar'));
  if(attack==='NO_PROFILE')assert(text.includes('deutsche Beschreibung ist noch nicht verfügbar'));
  if(attack==='STALE_FINANCIALS')assert(text.includes('Veraltete Geschäftszahlen'));
  if(attack==='DUPLICATES_AND_OLD_NEWS'){assert.equal(await chapter.getByText('Aktuelle belegte Meldung',{exact:true}).count(),1);assert.equal(await chapter.getByText('Doppelter Titel',{exact:true}).count(),0);assert.equal(await chapter.getByText('Historische Meldung',{exact:true}).isVisible(),false)}
  if(attack==='CANCELLED_AND_PAST_EVENTS'){assert(!text.includes('Abgesagter Call'));assert(!text.includes('Vergangener Call'));assert.equal(await chapter.getByRole('heading',{name:'Nächste Termine',exact:true}).count(),0)}
  if(attack==='DATE_ONLY_AND_SEPARATE_CALL'){assert(text.includes('Ergebnisveröffentlichung'));assert(text.includes('Ergebnisgespräch'));assert(text.includes('Uhrzeit nicht angegeben'));assert(text.includes('25. Okt. 2026'));assert(text.includes('01:30'))}
  if(attack==='ESTIMATE_ONLY'){assert(text.includes('Kein bestätigter'));assert(text.includes('Geschätzter Berichtszeitraum'));assert(text.includes('kein bestätigter Termin'))}
  if(attack==='BERLIN_DST'){assert(text.includes('02:30'));assert(text.includes('MEZ'))}
  if(attack==='WEBCAST_AND_LETTER'){assert.equal(await chapter.getByRole('link',{name:'Webcast',exact:true}).count(),1);assert.equal(await chapter.getByRole('link',{name:'Aufzeichnung',exact:true}).count(),0);assert.equal(await chapter.getByRole('link',{name:'Unternehmenstranskript',exact:true}).count(),0);assert(text.includes('Aktionärsbrief'))}
  if(attack==='UNSAFE_LINK'){assert.equal(await chapter.locator('a[href^="javascript:"],a[href*="127.0.0.1"]').count(),0);assert.equal(await page.evaluate(()=>window.__ciXss),undefined)}
  assert.deepEqual(errors,[]);cases.push({product,kind:attack,status:'PASS'});await page.close();
 }
 const report={status:'PASS',generation:candidate.generation,actualCases:cases.filter(c=>c.kind==='ACTUAL_CANDIDATE').length,adversarialCases:cases.filter(c=>attacks.includes(c.kind)).length,cases};
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,generation:report.generation,actualCases:report.actualCases,adversarialCases:report.adversarialCases,total:cases.length}));
}finally{await browser.close()}
