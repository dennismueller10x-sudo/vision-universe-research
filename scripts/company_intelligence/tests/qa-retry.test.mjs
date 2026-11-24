/* Kandidaten-QA: genau eine Wiederholung nach Timeout, Inhaltspruefungen bleiben streng (Refresh 45261750453, 23.11.2026). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AssertionError} from 'node:assert';
import {runCaseWithOneRetry,isTimeout} from '../qa-retry.mjs';
const item={ticker:'TSLA',width:390,theme:'dark'};
const timeout=()=>Object.assign(new Error('page.waitForFunction: Timeout 90000ms exceeded.'),{name:'TimeoutError'});
const harness=plan=>{const calls=[],retries=[];return {calls,retries,run:async(c,attempt)=>{calls.push(attempt);const step=plan[calls.length-1];if(step instanceof Error)throw step;return step??'ok';},opt:{onRetry:(e,c)=>retries.push([e.name,c.ticker])}};};

test('QR-1 Timeout, dann Erfolg: zweiter Versuch mit Nummer 2, onRetry genau einmal',async()=>{
 const h=harness([timeout(),'zweiter']);
 assert.equal(await runCaseWithOneRetry(h.run,item,h.opt),'zweiter');
 assert.deepEqual(h.calls,[1,2]);assert.deepEqual(h.retries,[['TimeoutError','TSLA']]);
});
test('QR-2 zweimal Timeout: der Fehler des zweiten Versuchs bleibt, nie ein dritter Versuch',async()=>{
 const second=timeout();second.message='zweiter Timeout';
 const h=harness([timeout(),second,'darf nicht erreicht werden']);
 await assert.rejects(runCaseWithOneRetry(h.run,item,h.opt),/zweiter Timeout/);
 assert.deepEqual(h.calls,[1,2]);assert.equal(h.retries.length,1);
});
test('QR-3 inhaltliche Pruefung (AssertionError) und jeder andere Fehler: sofort, keine Wiederholung',async()=>{
 for(const err of [new AssertionError({message:'TSLA:profile'}),new Error('boom'),Object.assign(new Error('net'),{name:'FetchError'})]){
  const h=harness([err,'nie']);
  await assert.rejects(runCaseWithOneRetry(h.run,item,h.opt),e=>e===err);
  assert.deepEqual(h.calls,[1],err.name);assert.equal(h.retries.length,0);
 }
});
test('QR-4 Erfolg beim ersten Versuch: keine Wiederholung, kein onRetry',async()=>{
 const h=harness(['erster']);
 assert.equal(await runCaseWithOneRetry(h.run,item,h.opt),'erster');assert.deepEqual(h.calls,[1]);assert.equal(h.retries.length,0);
});
test('QR-5 isTimeout erkennt nur TimeoutError',()=>{
 assert.equal(isTimeout(timeout()),true);for(const e of [new Error('x'),new AssertionError({message:'a'}),null,undefined,{name:'Timeout'}])assert.equal(isTimeout(e),false);
});
test('QR-6 Verdrahtung in universe-browser-qa.mjs: Wiederholung, Diagnose und Bericht; Inhaltspruefungen unveraendert, Mutanten werden erkannt',async()=>{
 const src=readFileSync(new URL('../universe-browser-qa.mjs',import.meta.url),'utf8');
 assert.match(src,/import \{runCaseWithOneRetry\} from '\.\/qa-retry\.mjs'/);
 assert.match(src,/runCaseWithOneRetry\(runCase,c,\{onRetry:/);
 for(const needle of ['retriedAfterTimeout','liveReleaseChangedDuringQa','diagnosis:await diagnose(page)',"import {accessGateDiagnostics} from './browser-diagnostics.mjs'",'accessGateDiagnostics(page,{storageKey:STORAGE_KEY})'])assert.ok(src.includes(needle),needle);
 // Alle Inhaltspruefungen des Falls sind noch da (die Wiederholung darf nichts davon abschwaechen).
 for(const needle of ["ticker+':exact-reviewed-profile'","ticker+':overflow'","ticker+':estimated-window'","ticker+':valid-estimated-window-not-rendered'","assert(requests.every(r=>r.status===200))","assert.equal(requests,0,ticker+':ineligible-request')"])assert.ok(src.includes(needle),needle);
 // Mutant: wuerde jeder Fehler wiederholt, faellt QR-3 auf.
 const all=()=>true,h=harness([new AssertionError({message:'x'}),'nach Retry']);
 assert.equal(await runCaseWithOneRetry(h.run,item,{...h.opt,retriable:all}),'nach Retry');assert.deepEqual(h.calls,[1,2],'der Mutant verhaelt sich anders als QR-3');
});
