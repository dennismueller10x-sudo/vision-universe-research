import assert from 'node:assert/strict';
// Story-Website (Owner 17.11.2026): ersetzt die frühere Einzel-iPhone-Vorschau.
// Oben sofort als App erkennbar, darunter „Heute neu“; alle Produkte als Kapitel; die Anmeldung am Ende.
export async function checkIphonePreview(page){
  const viewport=page.viewportSize();
  assert.match(await page.locator('h1').innerText(),/Aktien und Finanzen/);
  assert.match(await page.locator('.apptag').first().innerText(),/App für iPhone und Android/);
  const stores=page.locator('#start .stores img');assert.ok(await stores.count()>=2,'App Store und Google Play im ersten Abschnitt');
  const first=await stores.first().boundingBox();assert.ok(first&&first.y<viewport.height*2.2,'Store-Logos weit oben');
  assert.equal(await page.locator('.hlfix .hlm').count(),2,'Aktienmagazin und Aktienreport fest unter den Tagesnews');
  assert.ok(await page.locator('.hlnews .hlc').count()>=3,'mindestens drei Tagesnews');
  for(const id of ['discover','fundamental','technical','supertrader','vorsorge','screener','atlas','quant','hedgefonds','elliott','portfolios'])
    assert.equal(await page.locator('#k-'+id).count(),1,'Kapitel '+id);
  assert.equal(await page.locator('.jbar a[href="#k-technical"]').count(),1,'Sprungleiste führt auf der Seite zu den Kapiteln');
  const ids=await page.locator('main section[id]').evaluateAll(es=>es.map(e=>e.id));
  assert.equal(ids[ids.length-1],'newsletter','Anmeldung ist der letzte Abschnitt');
  assert.equal(await page.locator('#newsletter #newsletter-form').count(),1);
  assert.equal(await page.locator('iframe,video').count(),0,'Filme erst beim Antippen');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),viewport.width);
}
