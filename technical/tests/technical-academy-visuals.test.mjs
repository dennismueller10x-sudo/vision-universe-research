import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),c=JSON.parse(readFileSync(new URL('../academy/content.json',import.meta.url)));
const V=require('../academy/visuals.js'),M=require('../academy/model.js'),validate=require('../../scripts/technical/world/academy-validate.cjs');
const contracts={parseRoute:require('../engine/model.js').parseRoute,assistant:require('../engine/assistant.js'),templates:require('../engine/templates.js'),exists:p=>existsSync(new URL('../../'+p,import.meta.url))};

test('Alle 32 auditierten Fachinhalte, Fragen, Glossar und Praxisziele bleiben erhalten',()=>{
 const core=structuredClone(c);core.lessons.forEach(l=>delete l.presentation);
 assert.equal(createHash('sha256').update(JSON.stringify(core)).digest('hex'),'543a2a4f9259cb11d6edfdb8535487f83deba469e77d2a43c706bf3739d32ff5');
});
test('Genau drei thematisch passende Piloten, je drei vollständige Lernszenen',()=>{
 const pilots=c.lessons.filter(l=>l.presentation);assert.deepEqual(pilots.map(l=>l.id),['trend-1','breakout-2','momentum-2']);
 for(const l of pilots)assert.equal(V.valid(l.presentation),true);
 assert.deepEqual(validate(c,contracts),[]);
 for(const mutate of [p=>p.version=2,p=>p.kind='toString',p=>p.scenes.pop(),p=>p.scenes[0]=null,p=>p.scenes[1].id=p.scenes[0].id,p=>p.scenes[0].description='',p=>p.scenes[0].observed=null]){
  const p=structuredClone(pilots[0].presentation);mutate(p);assert.equal(V.valid(p),false);
 }
 const bad=structuredClone(c);bad.lessons.find(l=>l.id==='trend-1').presentation=c.lessons.find(l=>l.id==='momentum-2').presentation;
 assert.ok(validate(bad,contracts).includes('presentation topic trend-1'));
});
test('Präsentation allein verwirft weder Abschluss noch gespeicherte Quiz-Antwort',()=>{
 for(const l of c.lessons.filter(l=>l.presentation)){
  const before=structuredClone(c);before.lessons.forEach(x=>delete x.presentation);let progress,session;
  const storage={getItem:k=>k===M.KEY?progress:session,setItem:(k,v)=>{if(k===M.KEY)progress=v;else session=v;}};
  M.save(storage,before,[l.id]);M.saveSession(storage,{id:l.id,contentVersion:c.contentVersion,lessonVersion:l.version,choice:l.quiz.answer,checked:true,y:100});
  assert.deepEqual(M.read(storage,c),[l.id]);assert.equal(M.outdated(storage,c),false);assert.equal(M.session(storage,c).choice,l.quiz.answer);
 }
});
test('Wiederaufnahme akzeptiert nur eine Szene der betreffenden Lektion',()=>{
 const lesson=c.lessons.find(l=>l.id==='trend-1');let value;
 const storage={getItem:()=>value,setItem:(_,v)=>{value=v;}};
 const state={id:lesson.id,contentVersion:c.contentVersion,lessonVersion:lesson.version,choice:'a',checked:true,y:100};
 M.saveSession(storage,{...state,scene:'filter'});assert.equal(M.session(storage,c).scene,'filter');
 for(const scene of ['scale','<script>',null]){M.saveSession(storage,{...state,scene});assert.equal(M.session(storage,c).scene,undefined);assert.equal(M.session(storage,c).choice,'a');}
});
test('Lehrbilder trennen Messung, Regelprüfung und Zukunft; RSI-Konventionen bleiben unverändert',()=>{
 const p=id=>c.lessons.find(l=>l.id===id).presentation;
 assert.match(p('trend-1').scenes[1].meaning,/einzelne Lagefilter.*Vorbehalt/);
 assert.match(p('breakout-2').scenes[1].meaning,/typabhängige Regel.*keine neue Schwelle/);
 assert.match(p('breakout-2').scenes[2].meaning,/keinen künftigen Erfolg/);
 assert.match(p('momentum-2').scenes[0].meaning,/Oberhalb 70.*unterhalb 30.*keine Kauf- oder Verkaufsanweisungen/);
 assert.match(p('momentum-2').scenes[1].meaning,/erzwingt keinen fallenden/);
 assert.match(p('momentum-2').scenes[2].meaning,/kein Beweis.*keine relative Stärke gegenüber SPY/);
});
test('Visual-Renderer führt Inhalte nur als Text aus und lädt weder Kurse noch Indikator-Engines',()=>{
 const source=readFileSync(new URL('../academy/visuals.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/innerHTML|outerHTML|insertAdjacentHTML|\beval\(|new Function|\bfetch\(|XMLHttpRequest|Indicators\.|Formations\.|compute\(/);
 assert.match(source,/keine historischen oder berechneten Werte/);
 const bad=structuredClone(c);bad.lessons[4].presentation.scenes[0].description='<img src=x onerror=alert(1)>';
 assert.ok(validate(bad,contracts).includes('markup'));
});
