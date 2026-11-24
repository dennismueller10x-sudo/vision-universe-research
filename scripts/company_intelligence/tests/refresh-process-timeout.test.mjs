/* Prozess-Timeout des Python-Refresh haengt an den Zeitbudgets (Lauf 45483191760, 24.11.2026: publicMaxSeconds 1400 gegen festen Timeout 1200 s). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {processTimeoutMs,BASE_PROCESS_TIMEOUT_MS,PROCESS_RESERVE_MS} from '../refresh-run.mjs';
const cfg=n=>JSON.parse(readFileSync(new URL('../../../company-intelligence/config/'+n,import.meta.url),'utf8'));
const universe=cfg('universe-rollout.json'),refresh=cfg('continuous-refresh.json');
test('PT-1 Timeout deckt oeffentliches und SEC-Budget plus Reserve (Universum und Standard)',()=>{
 for(const c of [universe,refresh]){
  const need=(c.publicMaxSeconds+c.secMaxSeconds)*1000+300000;
  assert.ok(processTimeoutMs(refresh,c)>=need,'Timeout unter Budget+Reserve');
 }
 assert.equal(processTimeoutMs(refresh,universe),(universe.publicMaxSeconds+universe.secMaxSeconds)*1000+PROCESS_RESERVE_MS);
});
test('PT-2 nie unter dem bisherigen Wert, fehlende Felder fallen darauf zurueck',()=>{
 assert.equal(processTimeoutMs(),BASE_PROCESS_TIMEOUT_MS);
 assert.equal(processTimeoutMs(null,{}),BASE_PROCESS_TIMEOUT_MS);
 assert.equal(processTimeoutMs({publicMaxSeconds:10,secMaxSeconds:10}),BASE_PROCESS_TIMEOUT_MS);
});
test('PT-3 Mutant: der alte feste Wert wuerde das 1400-s-Budget abschneiden',()=>{
 assert.ok(BASE_PROCESS_TIMEOUT_MS<(universe.publicMaxSeconds+universe.secMaxSeconds)*1000+300000||universe.publicMaxSeconds<=900,'fester Timeout haette gereicht');
 assert.ok(processTimeoutMs(refresh,universe)>BASE_PROCESS_TIMEOUT_MS||universe.publicMaxSeconds<=900);
});
test('PT-4 Verdrahtung: der Refresh-Aufruf nutzt processTimeoutMs, der Reproduktionslauf bleibt beim Standard',()=>{
 const src=readFileSync(new URL('../refresh-run.mjs',import.meta.url),'utf8');
 assert.ok(src.includes("py('continuous_refresh.py',args,processTimeoutMs(refreshConfig,universe?universeConfig:null))"));
 assert.ok(src.includes("py('continuous_refresh.py',['--reproduce'"));
});
