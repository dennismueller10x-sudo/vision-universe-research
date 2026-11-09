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
test('Alle 32 Lektionen besitzen drei vollständige, thematisch passende Lernszenen',()=>{
 const pilots=c.lessons.filter(l=>l.presentation);assert.equal(pilots.length,32);
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
 assert.match(source,/keine historischen Marktdaten/);
 const bad=structuredClone(c);bad.lessons[4].presentation.scenes[0].description='<img src=x onerror=alert(1)>';
 assert.ok(validate(bad,contracts).includes('markup'));
});
test('Jede zusätzliche Lektion hat eigene Grafiken; unsichere Zeichenbefehle werden verworfen',()=>{
 const lessons=c.lessons.filter(l=>l.presentation.kind==='diagram');assert.equal(lessons.length,29);
 assert.equal(new Set(lessons.map(l=>JSON.stringify(l.presentation.scenes[0].graphic))).size,29);
 for(const l of lessons){assert.equal(l.presentation.topic,l.id);for(const s of l.presentation.scenes)assert.ok(V.validGraphic(s.graphic),l.id);}
 for(const bad of [[{op:'image',href:'https://example.com'}],[{op:'text',x:20,y:30,text:'x',onclick:'alert(1)'}],[{op:'path',d:'url(javascript:alert(1))'}],[{op:'rect',x:350,y:20,w:100,h:20}],[{op:'point',x:NaN,y:30}]])assert.equal(V.validGraphic(bad),false);
 const bad=structuredClone(c);delete bad.lessons[0].presentation;assert.ok(validate(bad,contracts).includes('missing presentation struktur-1'));
});
test('Beschriftete OHLC-, Volumen-, MACD- und ATR-Grafiken stimmen mit den Lehrzahlen überein',()=>{
 const graph=(id,i=0)=>c.lessons.find(l=>l.id===id).presentation.scenes[i].graphic;
 const candle=graph('struktur-1').find(a=>a.op==='candle');
 const price=y=>106-(y-candle.high)/(candle.low-candle.high)*8;
 assert.equal(price(candle.open),100);assert.ok(Math.abs(price(candle.close)-103)<.05);
 const volume=graph('breakout-3').filter(a=>a.op==='rect');assert.equal(volume[1].h/volume[0].h,1.5);
 const macd=graph('momentum-3',1),zero=macd.find(a=>a.op==='line'&&a.cls==='ta-grid').y1;
 const lines=macd.filter(a=>a.op==='line'&&a.cls!=='ta-grid'),bar=macd.find(a=>a.op==='rect');
 assert.ok(lines.every(a=>a.y1>zero));assert.equal(lines[1].y1-lines[0].y1,bar.h);assert.equal(bar.y+bar.h,zero);
 const atr=graph('risiko-2'),range=atr.find(a=>a.op==='candle'),previous=atr.find(a=>a.op==='line').y1;
 assert.equal((previous-range.high)/(range.low-range.high),3); // TR 6 vs intraday range 2.
 assert.ok(atr.some(a=>a.text==='Max(2, 6, 4) = 6'));
});
test('Filter-Schnittmenge, Periodenzuordnung und Grenzen langer Wochenansichten sind im Lernbild korrekt',()=>{
 const graph=(id,i=0)=>c.lessons.find(l=>l.id===id).presentation.scenes[i].graphic;
 const venn=graph('routine-2'),boxes=venn.filter(a=>a.op==='rect'),member=venn.find(a=>a.text==='A');
 assert.ok(member.x>=Math.max(...boxes.map(a=>a.x))&&member.x+12<=Math.min(...boxes.map(a=>a.x+a.w)),'A must sit wholly inside both sets');
 const labels=graph('zeitrahmen-1',1).filter(a=>a.op==='text').map(a=>a.text);
 for(const value of ['SMA 200','SMA 40','SMA 10'])assert.ok(labels.includes(value));
 const history=graph('zeitrahmen-4',1);assert.ok(history.filter(a=>a.op==='candle').every(a=>a.x<180));assert.ok(history.some(a=>a.text==='Hoch/Tief fehlen'));
});
test('Primäre Kursgrafiken haben je Lektion eigene Geometrie statt bloß ausgetauschter Beschriftungen',()=>{
 const graphs=c.lessons.filter(l=>l.presentation.kind==='diagram').map(l=>l.presentation.scenes[0].graphic).filter(g=>g.some(a=>['path','candle'].includes(a.op)));
 const signatures=graphs.map(g=>JSON.stringify(g.filter(a=>a.op!=='text')));
 assert.equal(new Set(signatures).size,graphs.length);assert.equal(graphs.length,19);
});
