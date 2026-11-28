import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {overlay} from '../../scripts/ci/intraday-fastpath.mjs';
import {PLACEHOLDER,previewHtml,applyHeroPreview,heroPreviewFromData,refreshHeroPreview} from '../../scripts/ci/discover-hero-preview.mjs';
const R=createRequire(import.meta.url)('../engines/reihen.js');
const DD='discover'+'/data/',QM='quant'+'/data/market/';
const src=f=>readFileSync(new URL('../../'+f,import.meta.url),'utf8');
const card=(symbol,extra={})=>({symbol,companyName:symbol+' Inc.',sector:'Technology',metrics:{return12M:0.4},priceSeries:{path:'/x.json'},...extra});
test('Vorschau und Laufzeit wählen dieselbe Aktie aus denselben Daten',()=>{
 const hero={cards:[card('AAA',{metrics:{return12M:-0.9}}),card('BBB',{companyName:'Brookfield Infrastructure Partners L.P.',was:'Infrastruktur'})]},row={cards:[card('CCC')]};
 const cards=R.billboardCards(hero,row),p=R.heroPreview(hero,row);
 assert.deepEqual(cards.map(c=>c.symbol),['BBB','CCC'],'AAA fällt durch die Schaufenster-Regel');
 assert.equal(p.symbol,cards[0].symbol);assert.equal(p.name,R.shortName(cards[0]));assert.equal(p.sub,R.what(cards[0]));
 assert.equal(p.name,'Brookfield Infrastructure Partners');assert.equal(p.long,true);
 assert.equal(R.heroPreview({cards:[]},{cards:[]}),null);
});
test('Laufzeit nutzt die Engine: reihen.js und v3.js tragen keine eigene Auswahl und Texte mehr',()=>{
 const ui=src('discover/ui/reihen.js'),v3=src('discover/ui/v3.js');
 assert.match(ui,/function billboardCards\(hero, row\) \{ return R\(\)\.billboardCards\(hero, row\); \}/);
 assert.match(ui,/function shortName\(c\) \{ return R\(\)\.shortName\(c\); \}/);
 assert.match(v3,/function what\(c\) \{ return D\.Reihen\.what\(c\); \}/);assert.doesNotMatch(v3,/SECTOR_DE/);
});
test('Vorschau enthält weder Kurs noch Prozent noch Zahlenwerte der Aktie',()=>{
 const html=previewHtml(R.heroPreview({cards:[card('BBB',{plain:{story:'+40 % in 12 Monaten'},price:123.45})]},null));
 assert.doesNotMatch(html,/%|\d{2,}[.,]\d|12 Monaten/);assert.match(html,/dp-hero__id/);assert.match(html,/data-static/);
});
test('Platzhalter wird ersetzt, Vorschau ohne Karte lässt ihn stehen, fehlender Platzhalter bricht ab',()=>{
 const index=src('discover/index.html');
 assert(index.includes(PLACEHOLDER),'Quelle trägt den Platzhalter unverändert');
 const out=applyHeroPreview(index,{symbol:'A&B',name:'A<B>',long:false,sub:'x'});
 assert(!out.includes(PLACEHOLDER));assert(out.includes('<h2>A&lt;B&gt;</h2>'));assert.equal(applyHeroPreview(index,null),index);
 assert.throws(()=>applyHeroPreview('<p></p>',{symbol:'A',name:'A',sub:'x'}),/PLACEHOLDER_MISSING/);
});

/* Schnellweg (Steuerung 21.11.2026, Option 2): Das Overlay zieht die Vorschau nach; FP-6b bleibt unveraendert. */
const world=(first)=>{
 const repo=mkdtempSync(join(tmpdir(),'hp-repo-')),site=mkdtempSync(join(tmpdir(),'hp-site-')),w=(base,f,o)=>{mkdirSync(join(base,f,'..'),{recursive:true});writeFileSync(join(base,f),typeof o==='string'?o:JSON.stringify(o));};
 const put=(base,sym)=>{
  w(base,DD+'meta.json',{home:[{universeId:'US_REAL',chunks:['/'+DD+'home/US_REAL.json']}]});
  w(base,DD+'home/US_REAL.json',{surfaces:[{type:'hero',cards:[card(sym,{companyName:sym+' Holdings Inc.'})]}]});
  w(base,DD+'rows/US_REAL/im-blick.json',{cards:[card('ZZZ')]});
 };
 w(repo,QM+'intraday/index.json','{"dataSession":"x"}');
 execFileSync('git',['init','-q'],{cwd:repo});execFileSync('git',['-c','user.name=t','-c','user.email=t@t','commit','-q','--allow-empty','-m','x'],{cwd:repo});
 w(site,'discover/index.html','<head></head><main id="v2-main">'+PLACEHOLDER+'</main>');
 put(site,first);
 put(repo,first);
 mkdirSync(join(repo,QM.slice(0,-1)),{recursive:true});writeFileSync(join(repo,QM+'foo.json'),'{}');
 return {repo,site,put};
};
const L=(...p)=>p.map(pfad=>({st:'M',pfad}));
test('Overlay: Vorschau gleich heroPreview(aktuelle Daten), nur wenn eine Quelle im Paket steckt',async()=>{
 const {repo,site,put}=world('OLD');
 await refreshHeroPreview(site,L(DD+'meta.json'));
 const first=readFileSync(join(site,'discover/index.html'),'utf8');
 assert.match(first,/<h2>OLD<\/h2>/);
 put(repo,'NEW');put(site,'NEW');
 const m=await overlay(repo,site,L(DD+'rows/US_REAL/im-blick.json'));
 const html=readFileSync(join(site,'discover/index.html'),'utf8'),p=await heroPreviewFromData(site);
 assert.equal(m.heroPreview,'WRITTEN');assert.equal(p.name,'NEW');assert.equal(html,applyHeroPreview(first,p),'Vorschau = heroPreview(Daten im Paket)');
 const before=readFileSync(join(site,'discover/index.html'),'utf8');
 assert.equal((await overlay(repo,site,L(QM+'foo.json'))).heroPreview,'UNCHANGED');
 assert.equal(readFileSync(join(site,'discover/index.html'),'utf8'),before,'ohne Quelle im Paket bleibt index.html byte-gleich');
});
test('Overlay: schlaegt die Vorschau fehl, wird sie entfernt, der Schnellweg bricht nicht ab',async()=>{
 const {repo,site}=world('OLD');
 await refreshHeroPreview(site,L(DD+'meta.json'));
 writeFileSync(join(repo,DD+'meta.json'),'{kaputt');
 const m=await overlay(repo,site,L(DD+'meta.json'));
 const html=readFileSync(join(site,'discover/index.html'),'utf8');
 assert.equal(m.heroPreview,'RESET');assert(html.includes(PLACEHOLDER));assert(!html.includes('<h2>OLD</h2>'),'keine alte Vorschau');
 writeFileSync(join(site,'discover/index.html'),'<p>ohne Platzhalter</p>');
 assert.equal((await overlay(repo,site,L(DD+'meta.json'))).heroPreview,'FAILED');
});
test('Voll-Bau und Schnellweg benutzen dieselbe Funktion: die Vorschau altert nicht gegen den nächsten Voll-Release',()=>{
 const build=src('scripts/vu2/build-release.mjs'),fast=src('scripts/ci/intraday-fastpath.mjs');
 assert.match(build,/import\('\.\.\/ci\/discover-hero-preview\.mjs'\)[^\n]*writeDiscoverHeroPreview\(\{root,output\}\)/,'Voll-Bau schreibt sie aus den Repository-Daten');
 assert.match(fast,/import \{refreshHeroPreview\} from '\.\/discover-hero-preview\.mjs'/);assert.match(fast,/await refreshHeroPreview\(site, liste\)/);
 assert.throws(()=>src('scripts/vu2/discover-hero-preview.mjs'),/ENOENT/,'Modul liegt außerhalb der Bau-Quellen von FP-6 (scripts/ci)');
});

/* Kopf der Top-10-Sektion (24.11.2026): Vorschau und Laufzeit teilen eine Funktion und einen Text. */
import {top10PreviewHtml} from '../../scripts/ci/discover-hero-preview.mjs';
test('Top-10-Kopf: Laufzeit und Vorschau bauen ihn aus derselben Engine-Funktion, wortgleich',()=>{
 const ui=src('discover/ui/reihen.js');
 assert.match(ui,/sec\.innerHTML = R\(\)\.top10Head\(cards\.length, rowHref\('im-blick'\)\);/,'top10Section nutzt die Engine-Funktion');
 assert.doesNotMatch(ui,/Rang nach der Regel/,'der Satz steht nur noch in der Engine');
 const gold='<div class="dr-head dp-sh"><div class="dr-head__t"><h2>Top 10 heute</h2><a href="#/c/US_REAL/im-blick" aria-label="Alle 10 Aktien: Heute im Blick">Alle 10 ›</a></div>'+
  '<p>Rang nach der Regel „Heute im Blick“: Ereignisse des letzten Handelstags und Stärke über 12 Monate.</p></div>';
 assert.equal(R.top10Head(10,'#/c/US_REAL/im-blick'),gold,'Markup wie vorher protoHead (Golden)');
 const p=R.heroPreview({cards:[card('BBB')]},{cards:[card('CCC'),card('DDD')]});
 assert.equal(p.top10,2,'Anzahl wie showcaseCards(row.cards, 10) der Laufzeit');
 assert.equal(top10PreviewHtml(p),R.top10Head(2,R.TOP10.href));
 assert.equal(top10PreviewHtml(null),'');assert.equal(top10PreviewHtml({...p,top10:0}),'');
 const text=h=>h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 assert.equal(text(top10PreviewHtml(p)),text(R.top10Head(2,'#/c/US_REAL/im-blick')));
 assert.match(top10PreviewHtml(p),/Rang nach der Regel „Heute im Blick“: Ereignisse des letzten Handelstags und Stärke über 12 Monate\./);
});
test('Top-10-Kopf: Adresse der Vorschau gilt auch zur Laufzeit (keine Themenwelt "im-blick"), Platz im HTML',()=>{
 assert.doesNotMatch(src('discover/themes.js'),/['"]im-blick['"]/,'rowHref("im-blick") bleibt #/c/US_REAL/im-blick');
 const index=src('discover/index.html');
 /* Der Platz steht in einem Rahmen mit den Klassen der echten Startseite: alle Kopfstile hängen an .dp-home (reihen.css), sonst ist der Absatz kleiner als der spätere echte. */
 assert.match(index,/<div class="v2-journey dr-home dp-home"><section class="dr-sec dr-sec--top10 dr-slot" data-static-top aria-label="Top 10 heute"><!--top10-head--><!--\/top10-head--><\/section><\/div>/);
 assert.match(src('discover/ui/reihen.css'),/\.dp-home \.dp-sh p\{margin:4px 0 0;font-size:12\.5px\}/,'die Stile des Kopfs hängen an .dp-home');
 assert.match(src('discover/ui/reihen.js'),/body = h\('div', 'v2-journey dr-home dp-home'\)/,'derselbe Rahmen wie zur Laufzeit');
 const p=R.heroPreview({cards:[card('BBB')]},{cards:[card('CCC')]});
 const out=applyHeroPreview(index,p);
 assert(out.includes('<!--top10-head-->'+R.top10Head(1,R.TOP10.href)+'<!--/top10-head-->'));
 assert.equal(applyHeroPreview(out,null),index,'ohne Vorschau wieder der leere Platz, nie ein alter Kopf');
 const home=src('discover/home.js'),ui=src('discover/ui/reihen.js');
 assert.match(home,/n !== topBox\) n\.remove\(\)/);assert.match(home,/topWait: top/);assert.match(ui,/if \(topBox\) topBox\.remove\(\)/);
 assert.match(ui,/var topSlot = top0 \|\| h\('div', 'dr-slot'\)/);
});

/* Der statische Kopf bleibt als Knoten stehen (25.11.2026): live gibt es genau eine echte Zeichnung (Monitor-Ereignisse: vu-fx-ready 3,7 s, danach vu-home-drawn);
   ein neu gebauter Kopf ersetzte den früh gemalten Absatz (2,1 s) durch einen etwas größeren und zählte als späterer LCP-Kandidat (3,6 s). */
test('Top-10-Sektion übernimmt den statischen Kopf als denselben Knoten statt ihn neu zu bauen',()=>{
 const ui=src('discover/ui/reihen.js');
 assert.match(ui,/function top10Section\(row, ctx, slot\)/);
 assert.match(ui,/var keep = slot && slot\.querySelector\('\.dr-head'\) \? slot : null;/);
 assert.match(ui,/if \(!keep\) sec\.innerHTML = R\(\)\.top10Head\(/,'ohne statischen Platz weiter die Engine-Funktion');
 assert.match(ui,/var t = imBlick && top10Section\(imBlick, ctx, topSlot\);/);
 assert.match(ui,/if \(t === topSlot\) topSlot\.classList\.remove\('dr-slot'\); else if \(t\) topSlot\.replaceWith\(t\); else topSlot\.remove\(\);/);
});
