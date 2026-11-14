import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const W=require('../app.js');
const root=new URL('../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const stories=JSON.parse(read('willkommen/config/stories.json'));
const news=JSON.parse(read('willkommen/config/news.json'));

test('Highlights: Konfiguration gueltig, jede Story 15 bis 45 s',()=>{
  assert.deepEqual(W.validateStories(stories),[]);
  for(const s of stories.stories){const d=W.storyDuration(s);assert(d>=W.MIN_S&&d<=W.MAX_S,s.id+': '+d+' s');}
});

test('Highlights: validateStories erkennt Fehler',()=>{
  assert.deepEqual(W.validateStories({}),['stories fehlt']);
  const errors=W.validateStories({stories:[{id:'a',title:'A',product:'A',rev:1,slides:[{type:'card',title:'x',duration:60}]},{id:'a',title:'',rev:0,slides:[{type:'gif',duration:20,cta:{label:'x',href:'https://example.com'}}]}]}).join('\n');
  for(const part of ['ausserhalb','id doppelt','title fehlt','product fehlt','rev muss','type muss','cta braucht'])assert(errors.includes(part),part);
});

test('Neuigkeiten: Konfiguration gueltig, Sortierung angeheftet und neueste zuerst',()=>{
  assert.deepEqual(W.validateNews(news),[]);
  assert(W.validateNews({items:[{id:'x',date:'26.10.2026',title:'',text:'',link:{label:'a',href:'//evil.example'}}]}).length>=4);
  const sorted=W.sortNews([{id:'a',date:'2026-01-01'},{id:'b',date:'2026-03-01'},{id:'c',date:'2025-01-01',pinned:true},{id:'d',date:'2026-03-01'}]);
  assert.deepEqual(sorted.map(x=>x.id),['c','b','d','a']);
  assert.equal(W.formatDate('2026-10-05'),'5. Oktober 2026');
});

test('Gruss nach Tageszeit',()=>{
  assert.deepEqual([3,8,14,20].map(W.greeting),['Gute Nacht','Guten Morgen','Guten Tag','Guten Abend']);
});

test('Icons, Produktziele und lokale Medien existieren',()=>{
  const icons=read('assets/product-icons.svg');
  for(const s of stories.stories){
    if(s.icon!=='atlas')assert(icons.includes('id="'+s.icon+'"'),s.id+': Icon '+s.icon);
    for(const slide of s.slides)for(const file of [slide.src,slide.poster])
      if(file&&file.startsWith('/'))assert(existsSync(new URL(file.slice(1),root)),s.id+': '+file);
  }
  for(const p of W.PRODUCTS){
    if(p.id!=='atlas')assert(icons.includes('id="'+p.id+'"'),p.id+': Icon');
    assert(existsSync(new URL(p.href.split('#')[0].slice(1)+'index.html',root)),p.id+': '+p.href);
    if(p.art)assert(existsSync(new URL(p.art.slice(1),root)),p.id+': Bild '+p.art);
  }
});

test('Seite laedt Navigation, Stil und Skript; keine Produktwelt wird veraendert',()=>{
  const html=read('willkommen/index.html');
  for(const part of ['<vu-navigation','/assets/site-navigation.js','/willkommen/app.css','<script src="/willkommen/app.js"></script>','id="wk-highlights"','id="wk-products"','id="wk-news"'])assert(html.includes(part),part);
});

test('Videos: versionierter Name, Rezept im Studio, hoechstens 6 MB',()=>{
  for(const s of stories.stories)for(const slide of s.slides){
    if(slide.type!=='video'||!slide.src.startsWith('/assets/stories/'))continue;
    const m=slide.src.match(/^\/assets\/stories\/([a-z0-9-]+)-v(\d+)\.mp4$/);
    assert(m,s.id+': Name <id>-v<version>.mp4 erwartet: '+slide.src);
    const recipe=JSON.parse(read('studio/stories/'+m[1]+'/story.json'));
    assert.equal(recipe.id,m[1]);assert.equal(String(recipe.version),m[2],s.id+': Version im Rezept passt nicht zur Datei');
    assert(statSync(new URL(slide.src.slice(1),root)).size<=6e6,s.id+': Video groesser als 6 MB');
    assert(recipe.voice&&existsSync(new URL('studio/stories/'+m[1]+'/'+recipe.voice.file,root)),s.id+': Erklaervideos haben einen Sprecher (voice im Rezept)');
  }
});

// Home nach App-Konzept 2 (Owner 14.11.2026): nur Darstellung, nur Vorhandenes.
const visibleText=(html,code)=>[html.replace(/<script[\s\S]*?<\/script>|<!--[\s\S]*?-->|<[^>]+>/g,' '),...(code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm,'').match(/'[^'\n]*'/g)||[])].join(' ');
test('Home: Aufbau, Bausteine und alles Bisherige erreichbar',()=>{
  const html=read('willkommen/index.html'),code=read('willkommen/app.js');
  // Reihenfolge von oben: Gruss, Ziel, Deine Aktien, Dein Universe, Heute zu lesen, Kurz erklaert, Neuigkeiten, Weiter
  const order=['id="wk-title"','id="wk-goal"','id="wk-watch"','id="wk-products"','id="wk-read"','id="wk-hero-play"','id="wk-highlights"','id="wk-news"','id="wk-next"'].map(x=>html.indexOf(x));
  assert(order.every((v,i)=>v>0&&(!i||v>order[i-1])),'Reihenfolge der Abschnitte');
  for(const part of ['/assets/vu-ui.css?v=vu-ui-1.4.0','/assets/vu-ui.js?v=vu-ui-1.4.0','href="/mein-dashboard/"','href="/insights/"','href="/willkommen/start/"','id="wk-flash"','id="wk-hl-all"','id="wk-products-all"','id="wk-news-all"'])assert(html.includes(part),part);
  const main=html.slice(html.indexOf('<main'),html.indexOf('</main>'));
  assert(!/style="/.test(main)&&!/\son[a-z]+=/.test(main),'keine Inline-Styles und -Handler im Inhalt');
  // gemeinsame Bausteine statt eigener: Fenster, Schiene, Ring, Kachel, Weiter
  for(const part of ['.VUUI.popup(','U.rail(','U.ring(','U.tap(','U.chg(','.VUUI.next('])assert(code.includes(part),part);
  assert(!/wk-sheet-panel|wk-sheet-close/.test(code),'kein eigenes Blatt mehr');
  assert.equal(W.PRODUCTS.length,10,'alle zehn Module bleiben');
  // dieselben Quellen wie bisher, dazu nur die oeffentliche Artikelliste
  const calls=[...code.matchAll(/A\.get\('([^']+)'/g)].map(m=>m[1]).sort();
  assert.deepEqual([...new Set(calls)],['/v1/me','/v1/session','/v1/watchlist']);
  assert(!/A\.(post|patch)\(/.test(code)&&!/localStorage\.removeItem|sessionStorage/.test(code),'schreibt nichts ins Konto');
  assert(code.includes("INSIGHTS = '/insights/artikel.json'"));
});

test('Home: Artikelliste der Insights passt zu dem, was die Seite liest',()=>{
  const list=JSON.parse(read('insights/artikel.json')).artikel;
  assert(Array.isArray(list)&&list.length>0);
  for(const a of list.slice(0,4)){
    assert(a.titel&&/^\d{4}-\d{2}-\d{2}$/.test(a.datum)&&/^\/insights\/[a-z0-9-]+\/$/.test(a.href),a.slug);
    if(a.bild)assert(a.bild.startsWith('/')&&existsSync(new URL(a.bild.slice(1),root)),a.slug+': Bild');
  }
});

test('Home: nichts Erfundenes, Wortwahl nach docs/legal/WORTWAHL.md',()=>{
  const text=visibleText(read('willkommen/index.html'),read('willkommen/app.js')).toLowerCase();
  // Funktionen des Prototyps, die es nicht gibt, stehen nicht auf der Seite (auch nicht als Platzhalter)
  for(const word of ['tagesrunde','punkte','stufe ','abzeichen','schätz mal','quiz','community','deine woche','in folge','wochenkarte'])assert(!text.includes(word),'nicht vorhanden: '+word);
  const legal=JSON.parse(read('assets/legal-notices.json'));
  const avoid=(legal.wording||[]).flatMap(w=>String(w.avoid||'').replace(/\([^)]*\)/g,'').split(/,| \/ /)).map(a=>a.trim().toLowerCase()).filter(a=>a.length>3);
  assert(avoid.length>10);
  for(const a of [...avoid,'für dich'])assert(!new RegExp('(^|[^a-zäöüß])'+a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'($|[^a-zäöüß])').test(text),'vermeiden: '+a);
});
