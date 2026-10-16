import assert from 'node:assert/strict';

// Real browser interactions, no provider traffic or test contacts.
export async function checkDiscoverSwipe(page) {
  const root=page.locator('.discover-preview');
  assert.equal(await root.isVisible(),true);
  const fit=await root.evaluate(e=>({scrollHeight:e.scrollHeight,height:e.clientHeight}));
  assert.ok(fit.scrollHeight<=fit.height+1,'Preview instructions and controls fit the phone without nested scrolling');
  for(const selector of ['[data-preview-swipe=left]','[data-preview-swipe=right]','[data-preview-reset]']){
    const box=await page.locator(selector).boundingBox();assert.ok(box.width>=44&&box.height>=44,'Mobile controls have usable touch targets');
  }
  const front=()=>page.locator('#discover-deck .card[aria-hidden="false"]');
  const waitFor=async symbol=>page.waitForFunction(symbol=>document.querySelector('#discover-deck .card[aria-hidden="false"]')?.dataset.symbol===symbol,symbol);
  const count=async expected=>assert.match(await page.locator('[data-preview-feedback]').innerText(),new RegExp(`${expected} in dieser Vorschau gemerkt`));
  assert.equal(await front().getAttribute('data-symbol'),'AMD');
  await count(0);
  await page.waitForTimeout(1700); // Research auto-swipes; this preview must not.
  assert.equal(await front().getAttribute('data-symbol'),'AMD');await count(0);
  await page.locator('[data-preview-swipe=right]').click();await waitFor('AAPL');await count(1);
  await page.locator('[data-preview-swipe=left]').click();await waitFor('MSFT');await count(1);
  await page.locator('#discover-deck').focus();
  await page.keyboard.press('ArrowRight');await waitFor('AMD');await count(2);
  await page.keyboard.press('ArrowRight');await waitFor('AAPL');await count(2); // Same company twice.
  await page.keyboard.press('ArrowRight');await waitFor('MSFT');await count(3);
  await page.locator('[data-preview-reset]').click();await waitFor('AMD');await count(0);
  await front().scrollIntoViewIfNeeded();
  const box=await front().boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+100,y+2,{steps:6});
  await page.locator('#discover-deck').dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse',isPrimary:true});
  await page.mouse.up();
  assert.equal(await front().getAttribute('data-symbol'),'AMD');await count(0);
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+110,y+2,{steps:6});await page.mouse.up();
  await waitFor('AAPL');await count(1);
  const next=await front().boundingBox();
  await page.mouse.move(next.x+next.width/2,next.y+next.height/2);await page.mouse.down();
  await page.mouse.move(next.x+next.width/2+4,next.y+next.height/2+90,{steps:6});await page.mouse.up();
  assert.equal(await front().getAttribute('data-symbol'),'AAPL');await count(1);
  assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);
  await page.reload();await waitFor('AMD');await count(0);
  await root.evaluate(e=>{
    const rows=[...e.querySelectorAll('*')].filter(n=>[...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim())).map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);
    rows.forEach(([n,size])=>{n.style.fontSize=size*2+'px';});
  });
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  await page.locator('[data-preview-reset]').click();await count(0);
  await page.reload();await waitFor('AMD');
  assert.equal(await page.locator('#email').isDisabled(),false);
}
