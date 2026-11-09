/* Rueckweg des Universe-Release (Pruefung Steuerung 09.11.2026 zu #1744: BLOCKER, MAJOR 3). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scopeServed,main} from '../served-scope.mjs';

const wf=readFileSync(new URL('../../../.github/workflows/company-intelligence-universe-release.yml',import.meta.url),'utf8');
const stepText=name=>{const i=wf.indexOf('- name: '+name);assert.ok(i>=0,name);const j=wf.indexOf('\n      - ',i+10);return wf.slice(i,j<0?undefined:j);};

test('RC-1 Rueckweg oeffnet das Gate wieder, verfolgt den eigenen Pages-Lauf und belegt 46/45 live',()=>{
 const s=stepText('Fail closed to immutable 46 scope on material production failure');
 const order=['universe-release.mjs rollback','production-release.mjs enable','refresh-dispatch-wait.mjs --expected "$gen"','served-scope.mjs --expected "$gen" --stocks 46 --issuers 45'].map(x=>s.indexOf(x));
 assert.ok(order.every(i=>i>0),order.join(','));
 assert.deepEqual([...order].sort((a,b)=>a-b),order,'Reihenfolge: rollback, enable, warten, Live-Nachweis');
 // scheitert rollback, wird nichts geoeffnet: nur Dispatch und Exit mit dem Fehler
 const fail=s.slice(s.indexOf('if [ "$recovery_status" -ne 0 ]'),s.indexOf('production-release.mjs enable'));
 assert.match(fail,/gh workflow run pages-release\.yml --ref main\n\s*exit "\$recovery_status"/);
 assert.match(s,/timeout-minutes: 50/);
});

test('RC-2 Zeitbudget: Job 180 min, Warte-Schritte mit eigenem Limit, Abruf mit Timeout',()=>{
 assert.match(wf,/timeout-minutes: 180/);
 assert.match(stepText('Deploy existing Pages and wait for exact consumer generation'),/timeout-minutes: 65/);
 const d=stepText('Deploy existing Pages and wait for exact consumer generation');
 assert.ok((d.match(/AbortSignal\.timeout\(15000\)/g)||[]).length>=2,'jeder fetch mit Timeout');
 assert.match(d,/10\*60000/);
 // 65 (Pages) + 50 (Rueckweg) + bisher gemessene 32 min bis zum Pages-Schritt bleiben unter 180
 assert.ok(65+50+32<180);
});

test('RC-3 served-scope: nur exakte Generation mit 46/45 und PASS gilt als belegt',async()=>{
 const g='f'.repeat(24),want={generation:g,stocks:46,issuers:45};
 assert.deepEqual(scopeServed({status:'PASS',generation:g,cohortStocks:46,issuers:45},want),{ok:true,reason:null});
 assert.equal(scopeServed({status:'PASS',generation:'0'.repeat(24),cohortStocks:46,issuers:45},want).reason,'GENERATION_MISMATCH');
 assert.equal(scopeServed({status:'PASS',generation:g,cohortStocks:5091,issuers:4934},want).reason,'SCOPE_MISMATCH');
 assert.equal(scopeServed(null,want).reason,'DELIVERY_NOT_JSON');
 assert.equal((await main(['--expected','zz','--stocks','46','--issuers','45'],async()=>{throw Error('kein Abruf');})).reason,'USAGE');
 assert.equal((await main(['--expected',g,'--stocks','46','--issuers','45'],async()=>({ok:false}))).ok,false);
 assert.equal((await main(['--expected',g,'--stocks','46','--issuers','45'],async()=>({ok:true,json:async()=>({status:'PASS',generation:g,cohortStocks:46,issuers:45})}))).ok,true);
});
