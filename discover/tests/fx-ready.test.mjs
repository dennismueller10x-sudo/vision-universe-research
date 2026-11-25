import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
/* vu-fx-ready (Kurse nach dem ersten Zeichnen) baut die Startseite nur neu, wenn beim Zeichnen ein Betrag ohne Umrechnung herauskam. */
test('vu-fx-ready: Neuaufbau nur bei unumgerechneten Beträgen, Währungswechsel bleibt unbedingt',()=>{
 assert.match(app,/document\.addEventListener\('vu-fx-ready',\(\)=>\{if\(fxStale\)route\(1\);\}\);/);
 assert.match(app,/document\.addEventListener\('vu-currency-change',\(\)=>route\(1\)\);/,'der Wechsel der Anzeigewährung zeichnet weiter immer neu');
 assert.doesNotMatch(app,/addEventListener\('vu-fx-ready',\(\)=>route\(1\)\)/);
});
test('Zustand fxStale: zwei Abgriffe am Vertrag (money, metric), Rücksetzen bei jeder Route, nur conversionAvailable === false zählt',()=>{
 assert.match(app,/\['money','metric'\]\.forEach\(name=>/);
 assert.match(app,/result&&result\.conversionAvailable===false\)fxStale=true/);
 assert.match(app,/const id=\+\+generation,active=\(\)=>generation===id;fxStale=false;/);
 assert.match(app,/boot\(\)\.catch\(\(\)=>\{[^}]*\}\);\s*watchFx\(\);/,'der Abgriff steht direkt nach dem Start des Bootstraps, vor der ersten Route');
});
test('Abgriff verändert keine Werte: Ergebnis wird unverändert zurückgegeben (Simulation des Wrappers)',()=>{
 const body=/function watchFx\(\)\{([\s\S]*?)\n  \}/.exec(app)[1];
 const mk=conv=>({money:()=>({conversionAvailable:conv,formatted:'x'}),metric:()=>({converts:false})});
 const run=layer=>{let stale=false;const fn=new Function('global','setStale',body.replace(/fxStale=true/,'setStale()'));fn({VUFx:{layer}},()=>{stale=true;});return ()=>stale;};
 const a=mk(false),orig=a.money(),sa=run(a);assert.deepEqual(a.money(),orig);assert.equal(sa(),true);
 const b=mk(true),sb=run(b);b.money();b.metric();assert.equal(sb(),false,'umgerechnet und nicht umzurechnen zählt nicht als Rückstand');
});
