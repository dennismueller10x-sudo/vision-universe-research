import assert from 'node:assert/strict';

export async function showDiscover(page){
  await page.locator('.product-discover .product-card-copy').scrollIntoViewIfNeeded();
  await page.locator('#product-track').evaluate(e=>e.scrollTo({left:e.scrollWidth,behavior:'instant'}));
  await page.waitForFunction(()=>{const e=document.querySelector('#product-track');return e.scrollLeft>=e.scrollWidth-e.clientWidth-1;});
}
export async function checkProductGallery(page){
  assert.deepEqual(await page.locator('main>section').evaluateAll(es=>es.map(e=>e.id)),['hero','produkte','newsletter']);
  assert.equal(await page.locator('.browser').count(),0);
  assert.equal(await page.locator('.product-overview .phone .module-tile').count(),9);
  const track=page.locator('#product-track');
  const overflow=await track.evaluate(e=>e.scrollWidth>e.clientWidth+2);
  if(overflow){
    await page.locator('[data-product-next]').click();
    await page.waitForFunction(()=>document.querySelector('[data-product-next]').disabled);
    assert.equal(await page.locator('[data-product-prev]').isDisabled(),false);
    const bounds=await page.locator('.product-discover .phone').boundingBox(),outer=await track.boundingBox();
    assert.ok(bounds.x>=outer.x-1&&bounds.x+bounds.width<=outer.x+outer.width+1,'Selected iPhone is completely visible');
    await track.focus();await page.keyboard.press('Home');await page.waitForFunction(()=>document.querySelector('[data-product-prev]').disabled);
    await page.keyboard.press('End');await page.waitForFunction(()=>document.querySelector('[data-product-next]').disabled);
    await page.locator('[data-product-prev]').click();await page.waitForFunction(()=>document.querySelector('[data-product-prev]').disabled);
  }else assert.equal(await page.locator('.product-controls').isVisible(),false);
  assert.equal(await page.locator('#discover-deck .card[aria-hidden=false]').getAttribute('data-symbol'),'AMD');
  assert.match(await page.locator('[data-preview-feedback]').innerText(),/0 in dieser Vorschau/);
}
export async function checkTouchGallery(page){
  const cdp=await page.context().newCDPSession(page);
  async function swipe(selector,dx){
    await page.locator(selector).scrollIntoViewIfNeeded();
    const box=await page.locator(selector).boundingBox(),x=dx<0?Math.min(box.x+box.width-30,300):Math.max(box.x+30,100),y=box.y+box.height/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/10,y:y+1}]});await page.waitForTimeout(18);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  try{
    await swipe('.product-overview .product-card-copy',-180);
    await page.waitForFunction(()=>document.querySelector('[data-product-next]').disabled);
    assert.equal(await page.locator('#discover-deck .card[aria-hidden=false]').getAttribute('data-symbol'),'AMD');
    assert.match(await page.locator('[data-preview-feedback]').innerText(),/0 in dieser Vorschau/);
    await swipe('.product-discover .product-card-copy',180);
    await page.waitForFunction(()=>document.querySelector('[data-product-prev]').disabled);
  }finally{await cdp.detach();}
}
