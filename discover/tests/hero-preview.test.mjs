import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PLACEHOLDER,previewHtml,applyHeroPreview} from '../../scripts/vu2/discover-hero-preview.mjs';
const R=createRequire(import.meta.url)('../engines/reihen.js');
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
