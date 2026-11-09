import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../../'+p,import.meta.url)));
const c=read('technical/academy/content.json'),ex=read('academy/data/experiences.json').experiences,worlds=read('academy/data/worlds.json').worlds,questions=read('academy/data/questions.json').questions;
test('Zentrale Academy registriert genau eine bestehende Strategie-Experience und keine Inhaltskopie',()=>{
 const entries=ex.filter(e=>e.world==='strategies-factors-evidence'&&e.status==='available');assert.equal(entries.length,1);
 const e=entries[0];assert.equal(e.id,'technical-strategies');assert.equal(e.path,'/technical/#/akademie');assert.equal(e.engine,null);assert.equal(e.contentSource,'/technical/academy/content.json');assert.equal(e.glossarySource,e.contentSource+'#/glossary');
 assert.equal(ex.filter(x=>x.path===e.path).length,1);assert.equal(new Set(ex.map(e=>e.id)).size,ex.length);
 assert.equal(existsSync(new URL('../../academy/experiences/technical-strategies/content.json',import.meta.url)),false);
 assert.equal(c.paths.length,8);assert.equal(c.lessons.length,32);
});
test('Welt, Einstiegsfrage und vorhandene Pilot-Experience bleiben konsistent',()=>{
 assert.equal(worlds.length,11);const w=worlds.find(w=>w.id==='strategies-factors-evidence');assert.equal(w.status,'available');assert.match(w.summary,/Weitere Themen.*im Aufbau/);
 assert.equal(questions.filter(q=>q.experienceId==='technical-strategies'&&q.worldId===w.id).length,1);
 const follow=ex.find(e=>e.id==='follow-the-money');assert.equal(follow.status,'available');assert.equal(follow.featured,true);assert.equal(follow.path,'/academy/experiences/follow-the-money/');assert.equal(follow.engine,'financial-model-engine');
 for(const q of questions)if(q.experienceId)assert.ok(ex.some(e=>e.id===q.experienceId));
});
test('Registry-Links und Inhalte sind sicher; Kurs besitzt einen Rückweg zur zentralen Academy',()=>{
 for(const e of ex){assert.ok(worlds.some(w=>w.id===e.world));if(e.status==='available')assert.match(e.path,/^\/(?:academy\/experiences\/[a-z-]+\/|technical\/#\/akademie)$/);}
 const view=readFileSync(new URL('../academy/view.js',import.meta.url),'utf8');assert.match(view,/link\('← Vision Universe Academy','\/academy\/'\)/);
 const app=readFileSync(new URL('../../academy/app.js',import.meta.url),'utf8');assert.match(app,/entries.length === 1/);assert.match(app,/if \(!destination\) card.addEventListener/);
});
