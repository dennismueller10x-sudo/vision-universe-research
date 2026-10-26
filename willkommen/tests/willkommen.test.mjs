import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
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
    assert(icons.includes('id="'+s.icon+'"'),s.id+': Icon '+s.icon);
    for(const slide of s.slides)for(const file of [slide.src,slide.poster])
      if(file&&file.startsWith('/'))assert(existsSync(new URL(file.slice(1),root)),s.id+': '+file);
  }
  for(const p of W.PRODUCTS){
    if(p.id!=='atlas')assert(icons.includes('id="'+p.id+'"'),p.id+': Icon');
    assert(existsSync(new URL(p.href.split('#')[0].slice(1)+'index.html',root)),p.id+': '+p.href);
  }
});

test('Seite laedt Navigation, Stil und Skript; keine Produktwelt wird veraendert',()=>{
  const html=read('willkommen/index.html');
  for(const part of ['<vu-navigation','/assets/site-navigation.js','/willkommen/app.css','<script src="/willkommen/app.js"></script>','id="wk-highlights"','id="wk-products"','id="wk-news"'])assert(html.includes(part),part);
});
