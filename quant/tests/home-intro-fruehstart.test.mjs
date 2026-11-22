import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quantHomeIntro,QUANT_INTRO_NWORD_DEFAULT} from '../../scripts/vu2/build-release.mjs';
const pages=readFileSync(new URL('../app/pages.js',import.meta.url),'utf8');
test('Frühstart: der Kopf der Quant-Startseite wird aus pages.js gefunden (war seit dem Zahlwort tot)',()=>{
 const intro=quantHomeIntro(pages);
 assert.ok(intro,'Kopf gefunden: sonst läuft stock-boot.js im Release nicht');
 assert.match(intro,/^<header class="qv3-intro"><p class="vu-ltag">Quant<\/p><h1 class="vu-lt">Was hat sich heute verändert\?<\/h1><p class="vu-lead">Jede Aktie hat ein Profil aus <span data-nword>[a-zäöü]+<\/span> Eigenschaften\./);
 assert.ok(intro.endsWith('</header>'));assert.doesNotMatch(intro,/nWordHtml|' \+/);
 assert.ok(intro.includes('<span data-nword>'+QUANT_INTRO_NWORD_DEFAULT+'</span>'));
});
test('Platzhalter stimmt mit nWordHtml() in pages.js überein; unbekannte Bausteine ergeben keinen Kopf',()=>{
 assert.match(pages,/function nWordHtml\(\) \{ return "<span data-nword>" \+ VM\.nWord\(\) \+ "<\/span>"; \}/);
 assert.equal(quantHomeIntro("page.append(frag('<header class=\"qv3-intro\"><p>' + other() + '</p></header>'));"),null);
 assert.equal(quantHomeIntro('nichts'),null);
 assert.equal(quantHomeIntro("page.append(frag('<header class=\"qv3-intro\"><h1>A</h1></header>'));"),'<header class="qv3-intro"><h1>A</h1></header>');
});
test('Früher Rahmen trägt schon die Klassen, die pages.js#home setzt (sonst Sprung um 4 px beim Übernehmen, CLS 0,018)',()=>{
 const boot=readFileSync(new URL('../app/stock-boot.js',import.meta.url),'utf8');
 assert.match(boot,/page=el\('div','q-home vu-ui qv3 qk qk2 qp'\)/);
 assert.match(pages,/page\.classList\.add\("qk", "qk2", "qp"\)/);
});
