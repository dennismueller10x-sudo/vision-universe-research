import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {build,root,SITE_PAGES} from '../scripts/build.mjs';

// Story-Website (Owner 17.11.2026). Bis dahin zeigte www eine zeitlose Vorschau ohne Finanzdaten; jetzt zeigt die
// Seite Beispiele aus der App. Jede Zahl trägt dann ihren Datenstand, nichts lädt von fremden Adressen.
const PRODUCTS=['discover','fundamental','technical','supertrader','vorsorge','screener','atlas','quant','hedgefonds','elliott','portfolios'];

test('Story-Website: alle Produkte, Originalsymbole, Datenstand, keine fremden Quellen oder Inline-Skripte',async()=>{
  const icons=JSON.parse(await readFile(resolve(root,'reference/product-icons-source.json'),'utf8'));
  assert.equal(createHash('sha256').update(await readFile(resolve(root,'assets/product-icons.svg'))).digest('hex'),icons.sha256);
  const output=resolve(root,'tests/output/modules');
  await build({output});
  const index=await readFile(resolve(output,'index.html'),'utf8');
  for(const id of PRODUCTS){
    assert.ok(index.includes(`id="k-${id}"`),`Kapitel ${id} auf der Startseite`);
    assert.ok(index.includes(`href="./produkte/${id}/"`),`Link zur Produktseite ${id}`);
    assert.ok(SITE_PAGES.includes(`produkte/${id}/index.html`),`Produktseite ${id} wird gebaut`);
  }
  assert.match(index,/Bald im App Store und bei Google Play/);
  assert.match(index,/Stand \d{2}\.\d{2}\.\d{4}/,'Beispielwerte nennen ihren Datenstand');
  assert.match(index,/<!--NEWS:pubs-->[\s\S]+<!--\/NEWS:pubs-->/);assert.match(index,/<!--NEWS:tv-->[\s\S]+<!--\/NEWS:tv-->/);
  for(const path of ['index.html',...SITE_PAGES]){
    const html=await readFile(resolve(output,path),'utf8');
    assert.doesNotMatch(html,/<style\b|<script(?![^>]*\bsrc=)[^>]*>/,`${path}: kein Inline-Stil oder -Skript (CSP)`);
    assert.doesNotMatch(html,/(?:src|poster)="https?:/,`${path}: keine fremden Bilder oder Filme`);
    assert.doesNotMatch(html,/href="#"/,`${path}: keine Platzhalter-Links`);
    assert.doesNotMatch(html.replace(/keine (?:Anlage)?[Ee]mpfehlung/g,''),/Empfehlung|Kaufsignal|Kursziel|\bSignal/,`${path}: Wortwahl`);
    assert.match(html,/Content-Security-Policy/,`${path}: CSP`);
    assert.doesNotMatch(html,/site-navigation|<vu-navigation>/,`${path}: keine research-Navigation (404 auf www)`);
    for(const m of html.matchAll(/(?:src|href|data-img|data-vid)="(\.{1,2}\/[^"?#]*\.(?:css|js|png|jpg|svg|mp4|woff2))(?:\?v=[0-9a-f]{16})?"/g))
      await readFile(resolve(output,path,'..',m[1]));
  }
});

// Landingpage /start/ (Owner 17.11.2026): kurz, ein Ziel. Das Formular ist Zeichen für Zeichen das der Startseite
// (nur der Datenschutz-Link zeigt eine Ebene höher) und wird beim Bau genauso freigeschaltet.
test('Landingpage /start/: dasselbe Anmeldeformular wie die Startseite, gleich freigeschaltet',async()=>{
  const form=html=>html.slice(html.indexOf('<form class="nl-form" id="newsletter-form"'),html.indexOf('</form>',html.indexOf('id="newsletter-form"'))+7);
  const src=await readFile(resolve(root,'index.html'),'utf8'),start=await readFile(resolve(root,'start/index.html'),'utf8');
  assert.equal(form(start),form(src).replace('href="./datenschutz/"','href="../datenschutz/"'));
  assert.ok(start.includes('src="../newsletter.js"'),'Formular-Skript');
  assert.ok(!start.includes('id="newsletter"'),'kein Newsletter-Fenster auf der Landingpage');
  const privacy=resolve(root,'tests/output/privacy-fixture.html');
  await (await import('node:fs/promises')).writeFile(privacy,'<!doctype html><html lang="de"><head><title>T</title></head><body>T</body></html>');
  const output=resolve(root,'tests/output/start-ready');
  await build({output,config:{mode:'public',liveFlowVerified:true,privacyReviewed:true,privacyHtmlPath:'tests/output/privacy-fixture.html'}});
  const built=await readFile(resolve(output,'start/index.html'),'utf8'),home=await readFile(resolve(output,'index.html'),'utf8');
  assert.match(built,/data-ready="true" action="\/api\/newsletter\/subscribe"/);
  assert.equal(form(built),form(home).replace('href="./datenschutz/"','href="../datenschutz/"'));
});

// Teilen (Owner 17.11.2026): jede Story-Seite hat ihr eigenes Vorschaubild, ihre eigene Beschreibung und ihre Adresse.
// Neu bauen mit: node scripts/share-images.mjs
test('Story-Seiten: eigenes Vorschaubild und eigene Beschreibung zum Teilen',async()=>{
  const seen=new Map(),descs=new Map();
  for(const path of ['index.html',...SITE_PAGES]){
    const html=await readFile(resolve(root,path),'utf8');
    const img=(html.match(/<meta property="og:image" content="https:\/\/www\.visionuniverse\.de\/(assets\/share\/[a-z-]+\.jpg)">/)||[])[1];
    assert.ok(img,`${path}: og:image aus assets/share/`);
    await readFile(resolve(root,img));
    assert.ok(!seen.has(img),`${path}: Vorschaubild schon bei ${seen.get(img)}`);seen.set(img,path);
    const desc=(html.match(/<meta property="og:description" content="([^"]+)">/)||[])[1];
    assert.ok(desc&&!descs.has(desc),`${path}: eigene Beschreibung`);descs.set(desc,path);
    assert.match(html,/<meta property="og:url" content="https:\/\/www\.visionuniverse\.de\//,`${path}: og:url`);
  }
});

