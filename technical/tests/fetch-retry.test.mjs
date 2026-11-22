import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
/* Vorübergehende 5xx beim Wechsel einer Auslieferung (Messung 20.11.2026) werden höchstens zweimal nachgeladen. */
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  var cache = {};'),source.indexOf('  function fetchGz'));
function lauf(antworten){
 const waits=[],calls=[];
 const context={Promise,Error,setTimeout:(f,ms)=>{waits.push(ms);f();},
  fetch:(p)=>{calls.push(p);const a=antworten.shift();return a instanceof Error?Promise.reject(a):Promise.resolve(a);}};
 vm.runInNewContext(code+';this.fetchJSON=fetchJSON',context);
 return {context,waits,calls};
}
const ok=(body)=>({ok:true,status:200,json:()=>Promise.resolve(body)});
const status=(n)=>({ok:false,status:n,json:()=>Promise.reject(new Error('kein JSON'))});
test('ein 503 wird nachgeladen und liefert danach die Daten',async()=>{
 const t=lauf([status(503),ok({a:1})]);
 assert.deepEqual(await t.context.fetchJSON('/x.json'),{a:1});
 assert.equal(t.calls.length,2);assert.deepEqual(t.waits,[400]);
});
test('ein Netzabbruch und ein 503 nacheinander werden überstanden',async()=>{
 const t=lauf([new Error('net'),status(503),ok({b:2})]);
 assert.deepEqual(await t.context.fetchJSON('/y.json'),{b:2});
 assert.deepEqual(t.waits,[400,1200]);
});
test('anhaltendes 5xx bleibt nach drei Versuchen ein Fehler',async()=>{
 const t=lauf([status(503),status(503),status(502)]);
 await assert.rejects(t.context.fetchJSON('/z.json'),/HTTP 502/);
 assert.equal(t.calls.length,3);
});
test('4xx wird nicht wiederholt',async()=>{
 const t=lauf([status(404),ok({})]);
 await assert.rejects(t.context.fetchJSON('/n.json'),/HTTP 404/);
 assert.equal(t.calls.length,1);assert.deepEqual(t.waits,[]);
});
