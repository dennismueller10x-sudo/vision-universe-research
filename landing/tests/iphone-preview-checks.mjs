import assert from 'node:assert/strict';
import {modules} from '../scripts/module-preview.mjs';
export async function checkIphonePreview(page){
  assert.deepEqual(await page.locator('main>section').evaluateAll(es=>es.map(e=>e.id)),['hero','newsletter']);
  assert.equal(await page.locator('.phone').count(),1);
  assert.equal(await page.locator('.browser,#product-track,.discover-preview,iframe').count(),0);
  assert.equal(await page.locator('.hero-badge').innerText(),'App bald verfügbar');
  assert.deepEqual(await page.locator('.module-tile>span').allTextContents(),modules.map(([,label])=>label));
  assert.equal(await page.locator('.module-tile a,.module-tile button,.phone input').count(),0);
  const layout=await page.locator('.module-launch-grid').evaluate(e=>({columns:getComputedStyle(e).gridTemplateColumns.split(' ').length}));
  assert.equal(layout.columns,2);
  for(const label of await page.locator('.module-tile>span').all()){
    const fits=await label.evaluate(e=>{
      const range=document.createRange();range.selectNodeContents(e);
      const box=range.getBoundingClientRect(),tile=e.parentElement.getBoundingClientRect(),screen=e.closest('.screen').getBoundingClientRect();
      return e.scrollWidth<=e.clientWidth+1&&box.left>=tile.left&&box.right<=tile.right+1&&box.top>=screen.top&&box.bottom<=screen.bottom;
    });
    assert.ok(fits,'Product name must be complete inside its tile and screen: '+await label.textContent());
  }
  const phone=await page.locator('.phone').boundingBox(),newsletter=await page.locator('#newsletter .nl-box').boundingBox();
  const viewport=page.viewportSize();
  assert.ok(Math.abs(phone.x+phone.width/2-viewport.width/2)<=1,'iPhone centered on every viewport');
  assert.ok(newsletter.y>=phone.y+phone.height&&newsletter.y-phone.y-phone.height<50,'Signup directly below the iPhone');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),viewport.width);
}
