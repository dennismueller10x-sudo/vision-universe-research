import assert from 'node:assert/strict';
// Startseite (Owner 22.11.2026): Marketing-Seite. Oben Claim, Satz, Knopf, Store-Logos und das App-Telefon;
// darunter die elf Bereiche als Kacheln (öffnen ihr Kapitel), Schritte, Geräte, Magazin und Report, News, Filme, Social, Fragen;
// die Anmeldung am Ende.
export async function checkIphonePreview(page){
  const viewport=page.viewportSize();
  assert.match(await page.locator('h1').innerText(),/Aktien und Finanzen/);
  const stores=page.locator('#start .fh-stores img');assert.equal(await stores.count(),2,'App Store und Google Play im Einstieg');
  const first=await stores.first().boundingBox();assert.ok(first&&first.y<viewport.height*1.2,'Store-Logos im ersten Bildschirm');
  assert.equal(await page.locator('#start a[href="#newsletter"]').count(),1,'Knopf zur Anmeldung im Einstieg');
  assert.equal(await page.locator('#start .hlnews,#start .hlc').count(),0,'keine News im Einstieg');
  for(const id of ['discover','fundamental','technical','supertrader','vorsorge','screener','atlas','quant','hedgefonds','elliott','portfolios']){
    assert.equal(await page.locator('#k-'+id).count(),1,'Kapitel '+id);
    assert.equal(await page.locator(`.vw-tile[data-open="k-${id}"][href="./produkte/${id}/"]`).count(),1,'Kachel '+id);
  }
  assert.equal(await page.locator('.pubs .pub').count(),2,'Aktienmagazin und Aktienreport als eigener Abschnitt');
  assert.ok(await page.locator('#news .vw-card').count()>=3,'mindestens drei Tagesnews');
  assert.equal(await page.locator('#news .mbt').count(),1,'Marktbriefing in den News');
  const ids=await page.locator('main section[id]').evaluateAll(es=>es.map(e=>e.id));
  assert.equal(ids[ids.length-1],'newsletter','Anmeldung ist der letzte Abschnitt');
  assert.equal(await page.locator('#newsletter #newsletter-form').count(),1);
  assert.equal(await page.locator('iframe,video').count(),0,'Filme erst beim Antippen');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),viewport.width);
  // Kachel öffnet ihr Kapitel an Ort und Stelle und gibt es beim Schließen zurück (ohne JavaScript führt sie zur Produktseite).
  if(await page.locator('html[data-home]').count()===0)return;
  await page.locator('.vw-tile[data-open="k-quant"]').click();
  assert.equal(await page.locator('.vw-pan #k-quant').count(),1,'Kapitel Quant geöffnet');
  assert.equal(await page.locator('.vw-tile[data-open="k-quant"]').getAttribute('aria-expanded'),'true');
  await page.locator('.vw-pan .px').click();
  assert.equal(await page.locator('.vw-pan').count(),0);assert.equal(await page.locator('.chapters #k-quant').count(),1,'Kapitel zurück');
  await page.evaluate(()=>scrollTo(0,0));
}
