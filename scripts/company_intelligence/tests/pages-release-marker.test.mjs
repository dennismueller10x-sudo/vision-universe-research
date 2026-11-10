/* Marker-Commit vor dem eigenen Pages-Dispatch (pages-release-marker.mjs) und seine Aufrufer.
 * Anlass 10.11.2026: Pages 42753904874 deployte neue Daten mit demselben Commit wie zuvor; deploy-pages nimmt den Commit als
 * Build-Version, ausgeliefert blieb der alte Stand. `env: GITHUB_SHA` am Deploy-Schritt wirkt nicht (Lauf 42763174678). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as M from '../pages-release-marker.mjs';
import {loadYamlFile} from './helpers/workflow-yaml.mjs';

const here=p=>fileURLToPath(new URL(p,import.meta.url));
const SHA='a'.repeat(40);
const err=status=>Object.assign(Error('HTTP '+status),{status});

function fakeGh({file=null,putErrors=[]}={}){
 const log={get:0,put:[]};
 return {log,gh:{
  get:async()=>{log.get++;return file;},
  put:async(path,body)=>{log.put.push({path,body});const e=putErrors.shift();if(e)throw err(e);return {commit:{sha:SHA}};}
 }};
}

test('PM-1 neue Datei: ohne sha auf main, Inhalt mit Grund und Lauf, Commit-SHA zurueck',async()=>{
 const {gh,log}=fakeGh();
 const r=await M.writeMarker({gh,reason:'refresh',runId:42,now:()=>new Date('2026-11-10T06:00:00Z')});
 assert.deepEqual(r,{status:'WRITTEN',commit:SHA,attempts:1});
 const {path,body}=log.put[0];
 assert.equal(path,M.MARKER_PATH);assert.equal(body.branch,'main');assert.equal(body.sha,undefined);
 assert.match(body.message,/^Pages-Release-Marker: refresh \(Lauf 42\)$/);
 const c=JSON.parse(Buffer.from(body.content,'base64').toString());
 assert.equal(c.reason,'refresh');assert.equal(c.runId,'42');assert.equal(c.at,'2026-11-10T06:00:00.000Z');
});

test('PM-2 vorhandene Datei: Aktualisierung mit deren sha (Vergleichswert gegen Wettlauf)',async()=>{
 const {gh,log}=fakeGh({file:{sha:'b'.repeat(40)}});
 assert.equal((await M.writeMarker({gh,reason:'universe-release',runId:1})).status,'WRITTEN');
 assert.equal(log.put[0].body.sha,'b'.repeat(40));
});

test('PM-3 Wettlauf (409/422): neu lesen und erneut schreiben, hoechstens 4 Versuche',async()=>{
 const ok=fakeGh({file:{sha:'c'.repeat(40)},putErrors:[409,422]});
 const r=await M.writeMarker({gh:ok.gh,reason:'refresh',runId:1,sleep:async()=>{}});
 assert.equal(r.status,'WRITTEN');assert.equal(r.attempts,3);assert.equal(ok.log.get,3,'vor jedem Versuch neu gelesen');
 const bad=fakeGh({putErrors:[409,409,409,409,409]});
 const rb=await M.writeMarker({gh:bad.gh,reason:'refresh',runId:1,sleep:async()=>{}});
 assert.equal(rb.status,'FAILED');assert.equal(bad.log.put.length,4);
});

test('PM-4 anderer Fehler (403, 500): sofort FAILED, kein Wiederholen; unbekannter Grund schreibt nichts',async()=>{
 for(const code of [403,500]){
  const f=fakeGh({putErrors:[code]});
  const r=await M.writeMarker({gh:f.gh,reason:'refresh',runId:1,sleep:async()=>{}});
  assert.equal(r.status,'FAILED');assert.equal(f.log.put.length,1);
 }
 const f=fakeGh();
 assert.equal((await M.writeMarker({gh:f.gh,reason:'irgendwas',runId:1})).status,'REASON_INVALID');assert.equal(f.log.put.length,0);
});

test('PM-5 Antwort ohne Commit-SHA gilt nicht als geschrieben',async()=>{
 const gh={get:async()=>null,put:async()=>({})};
 assert.equal((await M.writeMarker({gh,reason:'refresh',runId:1})).status,'NO_COMMIT');
});

test('PM-6 Skript: nur Contents-API auf main, kein git, kein R2, kein Gate',()=>{
 const code=readFileSync(here('../pages-release-marker.mjs'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(code,/'git'|s3-driver|VU_HISTORY|production-release|refresh-run|rollback/);
 assert.match(code,/repos\/\$\{repo\}\/contents\/\$\{path\}\?ref=main/);
 assert.match(code,/'--input','-'/);
});

/* --- Aufrufer: vor JEDEM eigenen Pages-Dispatch (Refresh, Universe-Release, Rueckweg) --- */
const refreshWf=loadYamlFile(here('../../../.github/workflows/company-intelligence-refresh.yml'));
const universeText=readFileSync(here('../../../.github/workflows/company-intelligence-universe-release.yml'),'utf8');

test('PM-7 Refresh: Marker nach der Gate-Pruefung und vor dem Wartescript; Job darf schreiben',()=>{
 const job=refreshWf.jobs.refresh,run=job.steps.find(s=>s.id==='deploy_live').run;
 const closed=run.indexOf('refresh-publication.mjs closed'),marker=run.indexOf('pages-release-marker.mjs --reason refresh'),wait=run.indexOf('refresh-dispatch-wait.mjs --health');
 assert.ok(closed>=0&&closed<marker&&marker<wait,'Reihenfolge: Gate zu? -> Marker -> Dispatch');
 assert.match(run,/pages-release-marker\.mjs --reason refresh \|\| echo "::warning::/,'Marker-Fehler bricht die Auslieferung nicht ab');
 assert.deepEqual(job.permissions,{contents:'write',actions:'write'});
 assert.deepEqual(refreshWf.permissions,{contents:'read',actions:'write'},'Vorgabe der anderen Jobs bleibt lesend');
});

test('PM-8 Universe-Release: Marker vor beiden Wartescript-Aufrufen (Freischaltung und Rueckweg); Job darf schreiben',()=>{
 const waits=[...universeText.matchAll(/refresh-dispatch-wait\.mjs --expected/g)].map(m=>m.index);
 assert.equal(waits.length,2);
 for(const [reason,at] of [['universe-release',waits[0]],['universe-recovery',waits[1]]]){
  const m=universeText.lastIndexOf('pages-release-marker.mjs --reason '+reason,at);
  assert.ok(m>=0&&universeText.slice(m,at).split('\n').length===2,'Marker steht direkt vor dem Wartescript: '+reason);
 }
 assert.match(universeText,/\n  release:\n[\s\S]*?\n    permissions:\n      contents: write\n      actions: write\n/);
});

test('PM-9 pages-release.yml: kein wirkungsloses env GITHUB_SHA mehr am Deploy-Schritt',()=>{
 const t=readFileSync(here('../../../.github/workflows/pages-release.yml'),'utf8');
 assert.doesNotMatch(t,/^\s+GITHUB_SHA:/m);
});

test('PM-10 Marker schreibt mit dem GITHUB_TOKEN (kein App-Token: dessen Commit startete einen Pages-Push-Lauf)',()=>{
 const deploy=refreshWf.jobs.refresh.steps.find(s=>s.id==='deploy_live');
 assert.equal(deploy.env.GH_TOKEN,'${{ secrets.GITHUB_TOKEN }}');
 const tokens=[...universeText.matchAll(/GH_TOKEN: (.*)/g)].map(m=>m[1].trim());
 assert.ok(tokens.length>0&&tokens.every(t=>t==='${{ secrets.GITHUB_TOKEN }}'),'Universe-Release: nur GITHUB_TOKEN');
});
