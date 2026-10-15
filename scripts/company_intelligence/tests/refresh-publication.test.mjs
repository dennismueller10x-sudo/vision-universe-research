import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationPlan,awaitConsistentPublication} from '../refresh-publication.mjs';

/* Nachgestellt aus den Refresh-Laeufen 38630050363 (20:12 UTC) und 38652800358 (23:14 UTC) vom 14.10.2026.
   Fastly ignoriert die Query im Cache-Schluessel (max-age=600); delivery.json und refresh.json koennen deshalb
   bis zu zehn Minuten aus verschiedenen Deployments stammen. Ist das Gate DISABLED, fehlt delivery.json ganz. */
const NEW='1ed01ec518e68b9a1da7fc39',OLD='71dc0485476cfa74e59f7fc3';
const gate=state=>({read:async()=>Buffer.from(JSON.stringify({schema:1,state,generation:'g',approvalId:'a'})),approvalId:'a',generation:'g'});
function clock(){let t=0;return {now:()=>t,sleep:async ms=>{t+=ms;}};}
const json=(body,status=200)=>({ok:status===200,status,headers:new Map(),json:async()=>{if(typeof body==='string')throw SyntaxError('html');return body;}});
// Antworten je Datei als Funktion der Zeit seit Beginn (ms).
function edges(c,{delivery,refresh}){return async url=>{const t=c.now();return url.includes('company-intelligence-delivery.json')?delivery(t):refresh(t);};}

test('gate DISABLED: no production verification and no fail-closed rollback for a private refresh',async()=>{
 assert.equal((await publicationPlan(gate('DISABLED'))).mode,'GATE_CLOSED');
 assert.equal((await publicationPlan(gate('AVAILABLE'))).mode,'VERIFY');
 // Unklarer Zustand bleibt streng: verifizieren (und bei Fehlschlag wie bisher fail-closed).
 assert.equal((await publicationPlan({read:async()=>{throw Error('r2');},approvalId:'a',generation:'g'})).mode,'VERIFY');
 assert.equal((await publicationPlan({read:async()=>null,approvalId:'a',generation:'g'})).mode,'VERIFY');
 assert.equal((await publicationPlan(gate('STAGED'))).mode,'VERIFY');
 assert.equal((await publicationPlan(null)).mode,'VERIFY');
});

test('mixed Fastly edges (run 38630050363): one matching delivery is not a publication proof',async()=>{
 const c=clock();
 // delivery: einmal neu, dann wieder alt (anderer Edge-Knoten), ab 5 min stabil neu; refresh.json sofort neu.
 const fetch=edges(c,{delivery:t=>json({generation:t===0||t>=300000?NEW:OLD}),refresh:()=>json({generation:NEW})});
 const r=await awaitConsistentPublication(NEW,{fetch,...c,intervalMs:10000,stableMs:630000,maxMs:1800000});
 assert.equal(r.status,'PUBLISHED');
 // Erst nach einem vollen Cache-Fenster ohne Abweichung, gemessen ab der letzten Abweichung.
 assert.ok(c.now()>=300000+630000,String(c.now()));
 assert.ok(r.mismatches>0,'mixed state is counted');assert.equal(r.firstMismatch.delivery,OLD);assert.equal(r.firstMismatch.refresh,NEW);
});

test('a later deployment that reverts the generation restarts the stability window',async()=>{
 const c=clock();
 const fetch=edges(c,{delivery:t=>json({generation:t>=400000&&t<420000?OLD:NEW}),refresh:()=>json({generation:NEW})});
 await awaitConsistentPublication(NEW,{fetch,...c,intervalMs:10000,stableMs:630000,maxMs:1800000});
 assert.ok(c.now()>=420000+630000,String(c.now()));
});

test('gate closed while verifying (run 38652800358): delivery absent fails the SLO with evidence',async()=>{
 const c=clock();
 const fetch=edges(c,{delivery:()=>json('<!doctype html>',200),refresh:()=>json('<!doctype html>',200)});
 await assert.rejects(awaitConsistentPublication('76112ebf14a6be3dc1b24874',{fetch,...c,intervalMs:10000,stableMs:630000,maxMs:900000}),e=>{
  assert.equal(e.message,'PRODUCTION_PUBLICATION_SLO_FAILED');assert.ok(e.evidence.observations.length>0);assert.equal(e.evidence.observations.at(-1).delivery,null);return true;});
 assert.ok(c.now()>=900000&&c.now()<=900000+10000);
});

test('a stale pair that never converges fails after the hard deadline; no partial acceptance',async()=>{
 const c=clock();
 const fetch=edges(c,{delivery:()=>json({generation:OLD}),refresh:()=>json({generation:NEW})});
 await assert.rejects(awaitConsistentPublication(NEW,{fetch,...c,intervalMs:10000,stableMs:630000,maxMs:1800000}),/PRODUCTION_PUBLICATION_SLO_FAILED/);
});

test('network errors are mismatches: they restart the window and never count as published',async()=>{
 const c=clock();
 const fetch=async url=>{if(c.now()<120000&&url.includes('refresh.json'))throw Error('reset');return json({generation:NEW});};
 const r=await awaitConsistentPublication(NEW,{fetch,...c,intervalMs:10000,stableMs:60000,maxMs:600000});
 assert.equal(r.status,'PUBLISHED');assert.ok(c.now()>=120000+60000,String(c.now()));assert.equal(r.firstMismatch.refresh,null);
 const always=async()=>{throw Error('reset');};
 await assert.rejects(awaitConsistentPublication(NEW,{fetch:always,...clock(),intervalMs:10000,stableMs:60000,maxMs:300000}),/PRODUCTION_PUBLICATION_SLO_FAILED/);
});

test('refuses to run without an expected generation',async()=>{
 await assert.rejects(awaitConsistentPublication(undefined,{fetch:async()=>json({generation:NEW}),...clock()}),/EXPECTED_GENERATION_REQUIRED/);
});
