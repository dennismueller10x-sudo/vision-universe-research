// Beleg: docs/reports/browser-qa-20261109.md; docs/reports/browser-qa-20261109-belege.json
import assert from 'node:assert/strict';
import {navigate} from '../quality/browser-navigation.mjs';

// A default-state assertion needs a new visitor, not storage cleared while old
// details/toggle handlers are still running. Preserve normal storage and SW
// behavior within this context, including the persistence assertion below.
export async function assertStockTitle({browser,base,width=390,colorScheme='dark',key='stock',screenshot=async()=>{}}) {
 const context=await browser.newContext({viewport:{width,height:844},colorScheme,hasTouch:true,isMobile:true,deviceScaleFactor:1});
 try {
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await navigate(page,base+'/discover/#/s/US_REAL/NVDA',{waitUntil:'networkidle'});await page.locator('.dv3-titel .dv3-story').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.dv3-titel .dv3-ep').length===7);
  assert.equal(await page.locator('.dv3-story .dv3-story-r').count(),3,'Story in three sentences');
  const eps=page.locator('.dv3-titel .dv3-ep');assert.equal(await eps.count(),7,'Seven chapters');
  assert.equal(await page.locator('.dv3-titel .dv3-ep[open]').count(),0,'Chapters closed by default');
  assert.equal(await page.locator('.dv3-titel').getByText(/Was dafür spricht|was dagegen|In einem Satz|Auf einen Blick|anderen Welten/).count(),0,'Old blocks are gone');
  assert(await page.locator('#dv3-reihen .dv3-rk2').count()>=1,'Rows of the stock');
  assert.equal(await page.locator('.dv3-rowctx, .dv3-endcard').count(),0,'No onward bar without origin');
  assert(/\$/.test(await page.locator('.dx-chart-hero-preis > b').first().innerText()),'Head price in dollars');
  await eps.nth(2).locator('summary').click();assert.equal(await eps.nth(2).getAttribute('open'),'');await screenshot(page,key+'-stock-chapter');
  await page.reload({waitUntil:'networkidle'});await page.locator('.dv3-titel .dv3-story').waitFor();
  assert.equal(await page.locator('.dv3-titel .dv3-ep').nth(2).getAttribute('open'),'','Opened chapter persists on reload');
  await navigate(page,base+'/discover/#/s/US_REAL/NVDA?reihe=langfristige-compounder',{waitUntil:'networkidle'});await page.reload({waitUntil:'networkidle'});
  await page.locator('.dv3-rowctx').waitFor();assert(/\d+ von \d/.test(await page.locator('.dv3-rowctx').innerText()),'Row position');
  await page.locator('.dv3-endcard').scrollIntoViewIfNeeded();await screenshot(page,key+'-stock-from-row');
  const nh=await page.locator('.dv3-endcard .dv3-endcard-a a').first().getAttribute('href');assert(/\?reihe=langfristige-compounder$/.test(nh),'Next keeps the row: '+nh);

  assert.deepEqual(errors,[],'No uncaught page errors in fresh visitor');
 } finally { await context.close(); }
}
