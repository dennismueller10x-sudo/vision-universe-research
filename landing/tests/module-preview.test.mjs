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
  assert.match(index,/<!--NEWS:hero-->[\s\S]+<!--\/NEWS:hero-->/);
  for(const path of ['index.html',...SITE_PAGES]){
    const html=await readFile(resolve(output,path),'utf8');
    assert.doesNotMatch(html,/<style\b|<script(?![^>]*\bsrc=)[^>]*>/,`${path}: kein Inline-Stil oder -Skript (CSP)`);
    assert.doesNotMatch(html,/(?:src|poster)="https?:/,`${path}: keine fremden Bilder oder Filme`);
    assert.doesNotMatch(html,/href="#"/,`${path}: keine Platzhalter-Links`);
    assert.doesNotMatch(html.replace(/keine (?:Anlage)?[Ee]mpfehlung/g,''),/Empfehlung|Kaufsignal|Kursziel|\bSignal/,`${path}: Wortwahl`);
    assert.match(html,/Content-Security-Policy/,`${path}: CSP`);
    for(const m of html.matchAll(/(?:src|href|data-img|data-vid)="(\.{1,2}\/[^"?#]*\.(?:css|js|png|jpg|svg|mp4|woff2))(?:\?v=[0-9a-f]{16})?"/g))
      await readFile(resolve(output,path,'..',m[1]));
  }
});
