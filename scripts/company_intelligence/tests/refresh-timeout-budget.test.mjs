/* Zeitbudget gegen Prozess-Timeout (Lauf 45483191760, 24.11.2026: publicMaxSeconds 1400 lief gegen den Python-Timeout von 1200 s in refresh-run.mjs).
   refresh-run.mjs ist eine Belegdatei und wird hier nur gelesen. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const src=read('../refresh-run.mjs');
const universe=JSON.parse(read('../../../company-intelligence/config/universe-rollout.json'));
const standard=JSON.parse(read('../../../company-intelligence/config/continuous-refresh.json'));
// Prozess-Timeout des Refresh-Aufrufs: die Standardvorgabe in py(...) (timeout:<ms>).
const pyBody=src.match(/function py\(script,args\)\{[^\n]*?timeout:(\d+)/);
const processTimeoutMs=Number(pyBody?.[1]);
const RESERVE_MS=120000;
test('TB-1 der Prozess-Timeout wird aus refresh-run.mjs gelesen',()=>{
 assert.ok(Number.isFinite(processTimeoutMs)&&processTimeoutMs>=600000,'Timeout nicht gefunden: '+pyBody?.[0]);
});
test('TB-2 publicMaxSeconds plus 120 s Reserve bleibt unter dem Prozess-Timeout (Universum und Standard)',()=>{
 for(const [name,c] of [['universe-rollout',universe],['continuous-refresh',standard]])
  assert.ok(c.publicMaxSeconds*1000+RESERVE_MS<processTimeoutMs,name+': publicMaxSeconds '+c.publicMaxSeconds+' s gegen Timeout '+processTimeoutMs/1000+' s');
});
test('TB-3 Anfragebudget des Universums bleibt 320 (Entscheidung 24.11.2026), Zeitbudget 1020 s',()=>{
 assert.equal(universe.publicRequestBudget,320);
 assert.equal(universe.publicMaxSeconds,1020);
});
test('TB-4 Mutant: 1400 s haette den Timeout gerissen',()=>{
 assert.ok(1400*1000+RESERVE_MS>=processTimeoutMs);
});
