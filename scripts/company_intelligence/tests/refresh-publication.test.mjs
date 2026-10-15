import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationPlan,awaitConsistentPublication,readPlanFromEnv,PUBLICATION_DEFAULTS} from '../refresh-publication.mjs';

/* Nachgestellt aus den Refresh-Laeufen 38630050363 (20:12 UTC) und 38652800358 (23:14 UTC) vom 14.10.2026.
   Fastly ignoriert die Query im Cache-Schluessel (max-age=600); delivery.json und refresh.json koennen deshalb
   bis zu zehn Minuten aus verschiedenen Deployments stammen. Ist das Gate DISABLED, fehlt delivery.json ganz. */
const NEW='1ed01ec518e68b9a1da7fc39',OLD='71dc0485476cfa74e59f7fc3',MIN=60000;
const gate=state=>({read:async()=>Buffer.from(JSON.stringify({schema:1,state,generation:'g',approvalId:'a'})),approvalId:'a',generation:'g'});
function clock(){let t=0;return {now:()=>t,sleep:async ms=>{t+=ms;}};}
const json=(body,status=200)=>({ok:status===200,status,headers:new Map(),json:async()=>{if(typeof body==='string')throw SyntaxError('html');return body;}});
// Antworten je Datei als Funktion der Zeit seit Beginn (ms).
function edges(c,{delivery,refresh}){let n=0;return async url=>{n++;const t=c.now();return url.includes('company-intelligence-delivery.json')?delivery(t,n):refresh(t,n);};}

test('closed gate (DISABLED or STAGED): no live verification and no fail-closed rollback for a private refresh',async()=>{
 assert.equal((await publicationPlan(gate('DISABLED'))).mode,'GATE_CLOSED');
 assert.equal((await publicationPlan(gate('STAGED'))).mode,'GATE_CLOSED');
 assert.equal((await publicationPlan(gate('AVAILABLE'))).mode,'VERIFY');
 // Unklarer Zustand bleibt streng: verifizieren (und bei Fehlschlag wie bisher fail-closed).
 assert.equal((await publicationPlan({read:async()=>{throw Error('r2');},approvalId:'a',generation:'g'})).mode,'VERIFY');
 assert.equal((await publicationPlan({read:async()=>null,approvalId:'a',generation:'g'})).mode,'VERIFY');
 assert.equal((await publicationPlan({read:async()=>Buffer.from('{"schema":1,"state":"DISABLED","generation":"other","approvalId":"a"}'),approvalId:'a',generation:'g'})).mode,'VERIFY');
 assert.equal((await publicationPlan(null)).mode,'VERIFY');
});

test('plan without storage credentials keeps the strict VERIFY path',async()=>{
 const saved={...process.env};for(const k of Object.keys(process.env))if(k.startsWith('VU_HISTORY_S3_'))delete process.env[k];
 try{assert.equal((await readPlanFromEnv()).mode,'VERIFY');}finally{Object.assign(process.env,saved);}
});

test('mixed Fastly edges (run 38630050363): one matching delivery is not a publication proof',async()=>{
 const c=clock();
 // delivery: einmal neu, dann wieder alt (anderer Edge-Knoten), ab 5 min stabil neu; refresh.json sofort neu.
 const fetch=edges(c,{delivery:t=>json({generation:t===0||t>=5*MIN?NEW:OLD}),refresh:()=>json({generation:NEW})});
 const r=await awaitConsistentPublication(NEW,{fetch,...c});
 assert.equal(r.status,'PUBLISHED');
 // Erst nach einem vollen Cache-Fenster ohne Abweichung, gemessen ab der letzten Abweichung.
 assert.ok(c.now()>=5*MIN+PUBLICATION_DEFAULTS.stableMs,String(c.now()));
 assert.ok(r.mismatches>0);assert.equal(r.firstMismatch.delivery,OLD);assert.equal(r.firstMismatch.refresh,NEW);
});

for(const deployMin of [3,5,7,10,15]){
 test(`production defaults: deploy after ${deployMin} min plus stale edges for a full max-age still publishes`,async()=>{
  const c=clock(),deploy=deployMin*MIN,staleUntil=deploy+PUBLICATION_DEFAULTS.cacheMs;
  // Vor dem Deploy ueberall alt; danach liefert bis max-age jede dritte Anfrage noch den alten Stand.
  const answer=(t,n)=>json({generation:t<deploy?OLD:t<staleUntil&&n%3===0?OLD:NEW});
  const r=await awaitConsistentPublication(NEW,{fetch:edges(c,{delivery:answer,refresh:answer}),...c});
  assert.equal(r.status,'PUBLISHED');assert.ok(c.now()>=staleUntil,String(c.now()));
 });
}

test('a later deployment that reverts the generation restarts the stability window',async()=>{
 const c=clock();
 const fetch=edges(c,{delivery:t=>json({generation:t>=400000&&t<420000?OLD:NEW}),refresh:()=>json({generation:NEW})});
 await awaitConsistentPublication(NEW,{fetch,...c});
 assert.ok(c.now()>=420000+PUBLICATION_DEFAULTS.stableMs,String(c.now()));
});

test('gate closed while verifying (run 38652800358): delivery never appears, SLO fails after the propagation deadline',async()=>{
 const c=clock();
 const fetch=edges(c,{delivery:()=>json('<!doctype html>',200),refresh:()=>json('<!doctype html>',200)});
 await assert.rejects(awaitConsistentPublication('76112ebf14a6be3dc1b24874',{fetch,...c}),e=>{
  assert.equal(e.message,'PRODUCTION_PUBLICATION_SLO_FAILED');assert.equal(e.evidence.firstSeenMs,null);assert.equal(e.evidence.lastMismatch.delivery,null);return true;});
 assert.equal(c.now(),PUBLICATION_DEFAULTS.propagationMs);
});

test('a stale pair that never converges fails after first sight plus settle time; no partial acceptance',async()=>{
 const c=clock();
 const fetch=edges(c,{delivery:()=>json({generation:OLD}),refresh:()=>json({generation:NEW})});
 await assert.rejects(awaitConsistentPublication(NEW,{fetch,...c}),e=>{assert.equal(e.evidence.firstSeenMs,0);return /PRODUCTION_PUBLICATION_SLO_FAILED/.test(e.message);});
 const {cacheMs,stableMs,reserveMs}=PUBLICATION_DEFAULTS;assert.equal(c.now(),cacheMs+stableMs+reserveMs);
});

test('network errors are mismatches: they restart the window and never count as published',async()=>{
 const c=clock();
 const fetch=async url=>{if(c.now()<120000&&url.includes('refresh.json'))throw Error('reset');return json({generation:NEW});};
 const r=await awaitConsistentPublication(NEW,{fetch,...c});
 assert.equal(r.status,'PUBLISHED');assert.ok(c.now()>=120000+PUBLICATION_DEFAULTS.stableMs,String(c.now()));assert.equal(r.firstMismatch.refresh,null);
 const always=async()=>{throw Error('reset');};
 await assert.rejects(awaitConsistentPublication(NEW,{fetch:always,...clock()}),/PRODUCTION_PUBLICATION_SLO_FAILED/);
});

test('worst case stays inside the step budget',()=>{
 const {propagationMs,cacheMs,stableMs,reserveMs}=PUBLICATION_DEFAULTS;
 // Erste Sichtung spaetestens bei propagationMs, danach settle; Schritt-Timeout im Workflow: 50 min.
 assert.ok(propagationMs+cacheMs+stableMs+reserveMs<=42*MIN);
});

test('refuses to run without an expected generation',async()=>{
 await assert.rejects(awaitConsistentPublication(undefined,{fetch:async()=>json({generation:NEW}),...clock()}),/EXPECTED_GENERATION_REQUIRED/);
});
