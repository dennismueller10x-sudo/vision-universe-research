import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), c=JSON.parse(readFileSync(new URL('../academy/content.json',import.meta.url)));
const M=require('../academy/model.js'), A=require('../../scripts/technical/world/academy-audit-contract.cjs');
const clone=()=>structuredClone(c), memory=()=>{let value=null;return {getItem:()=>value,setItem:(_,v)=>{value=v;}};};
test('Unabhängiger Antwort- und Praxisvertrag deckt alle 32 Lektionen fachlich ab',()=>{assert.deepEqual(A.audit(c),[]);});
test('Alle schema-gültigen falschen Quizlösungen werden erkannt',()=>{
 for(const l of c.lessons){const bad=clone();const changed=bad.lessons.find(x=>x.id===l.id);changed.quiz.answer=changed.quiz.choices.find(x=>x.id!==changed.quiz.answer).id;assert.ok(A.audit(bad).some(e=>e==='answer meaning '+l.id),l.id);}
});
test('Existierendes, thematisch falsches Praxisziel und falsche echte Vorlagen-ID werden erkannt',()=>{
 for(const mutate of [x=>x.lessons.find(l=>l.id==='trend-2').practice.target='trendfolge',x=>x.targets.trendvorlage.href='#/vorlagen/high52',x=>x.lessons.find(l=>l.id==='routine-3').practice.target='kombination']){const bad=clone();mutate(bad);assert.ok(A.audit(bad).some(e=>e.startsWith('practice meaning')));}
});
test('Numerische Lehrbeispiele unabhängig nachgerechnet: SMA, RS-Differenz, MACD, True Range',()=>{
 assert.equal((100+102+104)/3,102);assert.equal(-5-(-10),5);assert.equal(-2-(-3),1);assert.equal(Math.max(106-104,Math.abs(106-100),Math.abs(104-100)),6);
 const text=id=>c.lessons.find(l=>l.id===id).quiz.choices.find(x=>x.id===c.lessons.find(l=>l.id===id).quiz.answer).text;
 assert.equal(text('trend-2'),'102');assert.match(text('trend-3'),/\+5 Prozentpunkte, absolut −5/);assert.match(text('momentum-3'),/^\+1/);assert.match(text('risiko-2'),/^6,/);
});
test('Schema-gültige Glossarabweichungen und Prognoseversprechen werden erkannt',()=>{
 for(const mutate of [x=>x.glossary.find(t=>t.id==='atr').definition='ATR ist nur Hoch minus Tief.',x=>x.glossary.find(t=>t.id==='macd').definition='MACD = EMA 26 minus EMA 12.',x=>x.lessons.find(l=>l.id==='momentum-2').foundations.push('RSI ist die Gewinnwahrscheinlichkeit.'),x=>x.lessons.find(l=>l.id==='breakout-2').foundations.push('Eine Bestätigung beweist einen zukünftigen Kursanstieg.'),x=>x.lessons.find(l=>l.id==='zeitrahmen-1').foundations[1]='SMA 200 gilt immer für 200 Wochen.',x=>x.lessons.find(l=>l.id==='wechsel-3').glossary=['formation']]){const bad=clone();mutate(bad);assert.ok(A.audit(bad).length);}
});
test('Einzelne Lektionsrevision invalidiert nur ihren Abschluss; Legacy-v1 bleibt für unveränderte Lektionen gültig',()=>{
 const store=memory(), old=clone();old.lessons.forEach(l=>l.version=1);
 M.save(store,old,['struktur-1','struktur-2']);assert.deepEqual(M.read(store,c),['struktur-2']);assert.equal(M.outdated(store,c),true);
 store.setItem('',JSON.stringify({schemaVersion:1,contentVersion:1,completed:['struktur-1','struktur-2']}));assert.deepEqual(M.read(store,c),['struktur-2']);
 M.save(store,c,['struktur-1','struktur-2']);assert.deepEqual(M.read(store,c),['struktur-1','struktur-2']);assert.equal(M.outdated(store,c),false);
 const next=clone();next.lessons.find(l=>l.id==='struktur-2').version++;assert.deepEqual(M.read(store,next),['struktur-1']);
 next.contentVersion++;assert.deepEqual(M.read(store,next),[]);
});
test('Wiederaufnahme verwirft veraltete Antworten und unsichere IDs statt sie zu übernehmen',()=>{
 const store=memory(), l=c.lessons[0], state={id:l.id,contentVersion:c.contentVersion,lessonVersion:l.version,choice:'a',checked:true,y:800};
 M.saveSession(store,state);assert.deepEqual(M.session(store,c),state);
 for(const update of [{id:'<script>'},{contentVersion:999},{lessonVersion:999}]){M.saveSession(store,{...state,...update});assert.equal(M.session(store,c),null);}
 M.saveSession(store,{...state,choice:'missing',checked:'yes',y:-1});const read=M.session(store,c);assert.equal(read.choice,null);assert.equal(read.checked,false);assert.equal(read.y,0);
 assert.equal(M.saveSession(null,state),false);assert.equal(M.session(null,c),null);
});
