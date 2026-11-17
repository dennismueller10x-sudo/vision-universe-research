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

// Home genau nach Prototyp „App-Konzept 2“ (#v-home, Owner 15.11.2026): Aufbau des Prototyps, nur Vorhandenes.
const visibleText=(html,code)=>[html.replace(/<script[\s\S]*?<\/script>|<!--[\s\S]*?-->|<[^>]+>/g,' '),...(code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm,'').match(/'[^'\n]*'/g)||[])].join(' ');
test('Home: Aufbau des Prototyps, Bausteine und alles Bisherige erreichbar',()=>{
  const html=read('willkommen/index.html'),code=read('willkommen/app.js');
  // Reihenfolge des Prototyps: große Karte, Story-Kreise, Markt heute, Deine Aktien, Dein Universe, Heute zu lesen;
  // darunter die zusätzlichen Blöcke: weitere Artikel, Kurz erklärt, Neuigkeiten, Weiter, Daten & Hinweise
  const order=['id="wk-goal"','id="wk-stories"','id="wk-markt"','id="wk-watch"','id="wk-products"','id="wk-read"','id="wk-read-more"','id="wk-hero-play"','id="wk-highlights"','id="wk-news"','id="wk-next"','id="wk-notes"'].map(x=>html.indexOf(x));
  assert(order.every((v,i)=>v>0&&(!i||v>order[i-1])),'Reihenfolge der Abschnitte');
  assert(html.indexOf('id="wk-title"')>html.indexOf('id="wk-goal"')&&html.indexOf('id="wk-title"')<html.indexOf('id="wk-stories"'),'Gruß steht in der großen Karte');
  for(const part of ['/assets/vu-ui.css?v=vu-ui-1.4.0','/assets/vu-ui.js?v=vu-ui-1.4.0','href="/mein-dashboard/"','href="/insights/"','href="/willkommen/start/"','href="/discover/#/maerkte"','id="wk-flash"','id="wk-hl-all"','id="wk-products-all"','id="wk-news-all"'])assert(html.includes(part),part);
  const main=html.slice(html.indexOf('<main'),html.indexOf('</main>'));
  assert(!/style="/.test(main)&&!/\son[a-z]+=/.test(main),'keine Inline-Styles und -Handler im Inhalt');
  assert(!html.includes('data-vu-bleed'),'#v-home ist im Prototyp keine bleed-Ansicht');
  // gemeinsame Bausteine statt eigener: Fenster, Logo, Kursbewegung, Hinweis, Weiter
  for(const part of ['.VUUI.popup(','U().popup(','U().closeSheet(','U().logo(','U().chg(','U().legal(','.VUUI.next('])assert(code.includes(part),part);
  assert(!/wk-sheet-panel|wk-sheet-close/.test(code),'kein eigenes Blatt mehr');
  // Aktien tragen data-vu-stock (Vorschau-Fenster des Rahmens) und einen normalen Link
  assert(code.includes('data-vu-stock="')&&code.includes('data-vu-stock-name="')&&code.includes('class="wk-st wk-tap" href="'));
  assert.equal(W.PRODUCTS.length,10,'alle zehn Module bleiben (hinter „Alle Module“)');
  assert.deepEqual(W.HOME_MODULES,['quant','supertrader','technical','fundamental','hedgefonds','screener']);
  for(const id of W.HOME_MODULES)assert(W.PRODUCTS.some(p=>p.id===id),id);
  // dieselben Konto-Aufrufe wie bisher; gelesen werden sonst nur veröffentlichte Dateien
  const calls=[...code.matchAll(/A\.get\('([^']+)'/g)].map(m=>m[1]).sort();
  assert.deepEqual([...new Set(calls)],['/v1/me','/v1/session','/v1/watchlist']);
  assert(!/A\.(post|patch)\(/.test(code)&&!/localStorage\.removeItem|sessionStorage/.test(code),'schreibt nichts ins Konto');
  assert(code.includes("INSIGHTS = '/insights/artikel.json'"));
  const files=[...code.matchAll(/= '(\/(?:quant|technical|supertrader)\/[^']+)'/g)].map(m=>m[1]);
  assert(files.length>=5);
  for(const file of files)assert(existsSync(new URL(file.slice(1),root)),file);
});

test('Home: Markt heute, Modulzahlen und Story-Kreise lesen die veröffentlichten Dateien',()=>{
  const json=p=>JSON.parse(read(p));
  const m=W.marketView(json('quant/data/market/intelligence/market-pulse.json'));
  assert(m&&m.label&&m.level>=1&&m.level<=m.levels&&m.share>=0&&m.share<=100&&m.rows.length>=2,'Market Pulse');
  assert.equal(W.marketView({kind:'X'}),null);assert.equal(W.marketView(null),null);
  const chips=W.indexChips(json('quant/data/market/multi-asset/snapshot.json'));
  assert(chips.length>=2&&chips.every(c=>typeof c.pct==='number'&&c.title.includes('Tracker')),'Märkte über ihre Tracker');
  assert.deepEqual(W.indexChips({instruments:[{instrument:{symbol:'SPY'},quote:{state:'CAPABILITY_GAP'}}]}),[]);
  const tech=W.moduleFacts.technical(json('technical/data/meta.json')),st=W.moduleFacts.supertrader(json('supertrader/data/sf-candidates/summary.json'));
  assert(tech&&/^[\d.]+$/.test(tech.value)&&tech.bars.length>=2);
  assert(st&&st.label.includes('Forschung, nicht zertifiziert'),'Supertrader-Zahl trägt das Forschungs-Etikett');
  assert.equal(W.moduleFacts.quant({schemaVersion:'x',cardCount:3}),null);
  assert.equal(W.moduleFacts.quant({schemaVersion:'quant-radar-home-1.0.0',cardCount:935,asOf:'2026-11-13',summary:{newSetups:67,newHighs:125}}).value,'935');
  const themes=read('discover/themes.js'),icons=read('assets/theme-icons.svg');
  for(const t of W.THEMES){
    assert(themes.includes("'"+t.slug+"'")&&themes.includes("'"+t.rowId+"'")&&icons.includes('id="'+t.slug+'"'),t.slug);
    const stats=W.themeStats(json('discover/data/rows/US_REAL/'+t.rowId+'.json'));
    assert(stats&&stats.up<=stats.total&&/im Plus/.test(stats.text),t.slug);
  }
  const list=W.storyList(m,json('insights/artikel.json'));
  assert.equal(list[0].id,'markt');assert(list.some(s=>s.kind==='aktie')&&list.some(s=>s.kind==='thema'));
  for(const s of list)for(const sl of s.slides||[])assert(sl.title&&sl.cta&&sl.cta.href.startsWith('/'),s.id);
  assert.deepEqual(W.storyList(null,null).map(s=>s.kind),['thema','thema']);
  assert.equal(W.signed(-1.34,1),'−1,3 %');assert.equal(W.formatShort('2026-11-06'),'06.11.2026');
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

test('Home: Tagesbewegung bei Minus rot, bei Plus neongrün – hell und dunkel, wie Discover, Ich, Quant und News (Owner 16.11.2026)',()=>{
  const css=read('willkommen/app.css'),js=read('willkommen/app.js');
  // „die Bewegung immer -rot plus grün“: dieselbe Regel wie .md .vu-chg--down (mein-dashboard/dashboard.css), ohne Schema-Einschränkung
  assert.match(css,/\n\.wk \.vu-chg--down\{background:#c4281c;color:#fff\}/);
  assert.doesNotMatch(css,/vu-chg--down\{background:#fff/,'Minus nicht mehr weiß im Dunkeln');
  assert.match(read('assets/vu-ui.css'),/\.vu-chg\{[^}]*background:var\(--vu-lime\);color:#000\}/,'Plus neongrün mit schwarzer Schrift');
  // Markt heute: vier Märkte, Minus rot mit weißer Schrift
  assert.match(js,/c\.pct > 0 \? ' class="is-up"' : c\.pct < 0 \? ' class="is-down"' : ''/);
  assert.match(css,/\.wk-mk-ix>span\.is-down\{background:#c4281c\}\.wk-mk-ix \.is-down small,\.wk-mk-ix \.is-down b\{color:#fff\}/);
  // Größte Bewegung in der Kopfkarte
  assert.match(js,/move\.classList\.toggle\('wk-pill--down', sum\.biggest\.pct < 0\)/);
  assert.match(css,/\.wk-pill\.wk-pill--down\{background:#c4281c;color:#fff\}/);
  // Kontrast Weiß auf #c4281c mindestens 4,5:1 (WCAG AA)
  const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
  assert.ok(1.05/(lum('#c4281c')+.05)>=4.5);
});
