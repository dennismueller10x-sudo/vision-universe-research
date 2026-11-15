// Startseite der Website (Owner-Freigabe 14.11.2026, „Website-Mock-up 3“). Ersetzt die Prüfung der früheren
// Coming-soon-Vorlage (ein iPhone mit zehn Modulnamen, Formular direkt darunter) durch die gleichwertigen
// Anforderungen der neuen Seite: eine Bühne mit einem Gerät, zwölf vollständige Modulnamen, die Anmeldung als
// eigener Abschnitt mit dem unveränderten Formular, kein horizontaler Überlauf.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root} from '../scripts/build.mjs';

export const site=JSON.parse(await readFile(resolve(root,'site/pages.json'),'utf8'));
export async function checkStartPage(page){
  assert.equal((await page.locator('h1').textContent()).replace(/\s+/g,' ').trim(),'Die Börse ist laut. Wir bringen Ordnung hinein.');
  assert.equal(await page.locator('h1').count(),1);
  assert.equal(await page.locator('.heroX .soon').innerText(),'App bald verfügbar · zum Start kostenlos');
  // One stage with one device; the film is the muted app concept, nothing embedded or interactive inside it.
  assert.equal(await page.locator('.heroX .stg .dev').count(),1);
  assert.equal(await page.locator('.heroX video[data-autoplay][muted][playsinline][poster]').count(),1);
  assert.equal(await page.locator('.browser,#product-track,.discover-preview,iframe').count(),0);
  assert.equal(await page.locator('.stg a,.stg button,.stg input').count(),0);
  // Twelve modules, each with its complete name on one line and a real link to its page.
  const tiles=page.locator('main section:not(#fuer-wen) .bento a.t[href*="module/"]');
  assert.deepEqual(await tiles.locator('.tn').allTextContents(),site.modules.map(m=>m.name));
  assert.deepEqual(await tiles.evaluateAll(es=>es.map(e=>e.getAttribute('href'))),site.modules.map(m=>`./module/${m.id}/`));
  for(const label of await tiles.locator('.tn').all()){
    const fits=await label.evaluate(e=>{
      const range=document.createRange();range.selectNodeContents(e);
      const box=range.getBoundingClientRect(),tile=e.closest('.t').getBoundingClientRect();
      return box.height<=parseFloat(getComputedStyle(e).fontSize)*1.6&&box.left>=tile.left&&box.right<=tile.right+1;
    });
    assert.ok(fits,'Module name must be complete inside its tile: '+await label.textContent());
  }
  // The signup is the closing section of the page and carries the form.
  assert.equal(await page.locator('main>section').last().getAttribute('id'),'newsletter');
  assert.equal(await page.locator('#newsletter #newsletter-form').count(),1);
  assert.equal(await page.locator('#newsletter h2').innerText(),'Sei beim Start dabei.');
  assert.equal(await page.locator('form').count(),1);
  const viewport=page.viewportSize();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),viewport.width);
}
