import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), c=JSON.parse(readFileSync(new URL('../academy/content.json',import.meta.url)));
const M=require('../academy/model.js'), validate=require('../../scripts/technical/world/academy-validate.cjs');
const contracts={parseRoute:require('../engine/model.js').parseRoute,assistant:require('../engine/assistant.js'),templates:require('../engine/templates.js'),exists:p=>existsSync(new URL('../../'+p,import.meta.url))};
const clone=()=>structuredClone(c);
test('8 Pfade, 32 vollständige eindeutige Lektionen, Glossar, Fragen, Quellen und echte Praxisrouten',()=>{assert.deepEqual(validate(c,contracts),[]);});
test('Inhaltsgate erkennt beschädigte IDs, Referenzen, Links, Quiz und unerlaubte Inhalte',()=>{
 for(const mutate of [x=>x.lessons[1].id=x.lessons[0].id,x=>x.lessons[0].glossary=['unknown'],x=>x.targets.chart.href='javascript:alert(1)',x=>x.lessons[0].quiz.type='html',x=>x.lessons[0].quiz.answer='missing',x=>x.lessons[0].title='<img onerror=alert(1)>',x=>x.lessons[0].title='garantierte Gewinne',x=>x.lessons[0].practice.target='missing',x=>x.lessons[0].sources=['missing.md'],x=>x.lessons[1].foundations=x.lessons[0].foundations]){const bad=clone();mutate(bad);assert.ok(validate(bad,contracts).length);}
});
test('Lokaler Fortschritt: Versionsgrenze, unbekannte IDs, Dubletten, defektes JSON und Speichersperre',()=>{
 let value=null;const storage={getItem:()=>value,setItem:(key,v)=>{assert.equal(key,M.KEY);value=v;}};
 assert.deepEqual(M.read(storage,c),[]);assert.equal(M.save(storage,c,['struktur-1','struktur-1','unknown']),true);assert.deepEqual(M.read(storage,c),['struktur-1']);
 value='{';assert.deepEqual(M.read(storage,c),[]);
 for(const x of [{schemaVersion:2,contentVersion:1,completed:['struktur-1']},{schemaVersion:1,contentVersion:2,completed:['struktur-1']},{schemaVersion:1,contentVersion:1,completed:'struktur-1'}]){value=JSON.stringify(x);assert.deepEqual(M.read(storage,c),[]);}
 assert.deepEqual(M.read(null,c),[]);assert.equal(M.save(null,c,[]),false);
 assert.equal(M.save(storage,c,[]),true);assert.deepEqual(M.read(storage,c),[]);
});
test('Lernkontrolle akzeptiert genau die gültige richtige Antwort',()=>{for(const l of c.lessons){assert.equal(M.answer(l.quiz,l.quiz.answer),true);assert.equal(M.answer(l.quiz,'missing'),false);for(const a of l.quiz.choices)assert.equal(M.answer(l.quiz,a.id),a.id===l.quiz.answer);}});
test('Akademie nutzt keine Berechnungsengine, keine Textausführung und keinen Backend-Schreibzugriff',()=>{
 const view=readFileSync(new URL('../academy/view.js',import.meta.url),'utf8'), model=readFileSync(new URL('../academy/model.js',import.meta.url),'utf8');
 assert.doesNotMatch(view+model,/innerHTML|outerHTML|insertAdjacentHTML|\beval\(|new Function|Indicators\.|Formations\.|XMLHttpRequest|method:\s*['"]POST/);
 assert.equal((view.match(/fetch\(/g)||[]).length,1);assert.match(view,/fetch\('\/technical\/academy\/content.json'\)/);
 assert.equal(contracts.parseRoute('#/akademie/struktur-1').view,'academy');
});

test('Redaktion: mobiler Umfang, Gegenbeispiel je Pfad und klare Trennung von Befund und Vorteil',()=>{
 for(const l of c.lessons){
  const text=[l.question,...l.objectives,...l.foundations,l.example.text,...l.limits,l.quiz.prompt,...l.quiz.choices.map(x=>x.text),l.practice.instruction,l.visual.caption,...l.visual.labels].join(' ');
  const words=text.split(/\s+/).length;assert.ok(words>=120&&words<=450,l.id+': '+words);
  assert.match(readFileSync(new URL('../academy/view.js',import.meta.url),'utf8'),/kein Nachweis eines Handelsvorteils/);assert.ok(l.limits[0].length>60,l.id);
 }
 for(const p of c.paths)assert.ok(p.lessons.some(id=>c.lessons.find(l=>l.id===id).limits.length));
});
