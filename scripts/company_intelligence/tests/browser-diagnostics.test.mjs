/* browser-diagnostics.mjs: Befund der Zugangsschranke bei QA-Fehlern (Steuerung/BB 24.11.2026). Die Seitenfunktion laeuft hier gegen Stubs,
   kein Browser. Kernzusage: der Zugangsschluessel und das Passwort verlassen die Seite nie, nur version, expiresAt und die Kurzform des Verifiers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inPageAccessDiagnostics,accessGateDiagnostics,ACCESS_STORAGE_KEY,ACCESS_JS_PATH} from '../browser-diagnostics.mjs';

const SECRET_KEY='GEHEIMER-SCHLUESSEL-0123456789abcdef',VERIFIER='f00dfacecafebeef1234567890abcdef';
function stubPage({gate=true,stored=undefined,settings={version:3,verifier:VERIFIER,salt:'x'},errorText='Die Seite konnte nicht geladen werden. Bitte erneut laden.',errorHidden=true,js={status:200,lastModified:'Tue, 24 Nov 2026 01:00:00 GMT',etag:'"abc"'},jsThrows=false,now=1_795_500_000_000}={}){
 const el=(attrs={})=>({textContent:'',hidden:false,dataset:{},hasAttribute:n=>n==='hidden'&&!!attrs.hiddenAttr,getAttribute:n=>attrs[n]??null,...attrs});
 const nodes={
  '#research-access-gate':gate?el():null,
  '#research-access-error':gate?el({textContent:errorText,hidden:errorHidden,hiddenAttr:errorHidden}):null,
  '#research-access-settings':gate?el({textContent:typeof settings==='string'?settings:JSON.stringify(settings)}):null,
  '#v2-main':el({'aria-busy':'true'}),'.ci-company-intelligence':null,
  ['script[src*="'+ACCESS_JS_PATH+'"]']:gate?el({getAttribute:n=>n==='src'?ACCESS_JS_PATH+'?v=9':null}):null
 };
 const fetched=[];
 const g={document:{readyState:'complete',querySelector:s=>nodes[s]??null},
  localStorage:{getItem:k=>{assert.equal(k,ACCESS_STORAGE_KEY);return stored===undefined?null:stored;}},
  fetch:async(url,o)=>{fetched.push([url,o]);if(jsThrows){throw Object.assign(new Error('x'),{name:'TypeError'});}return {status:js.status,headers:{get:h=>({'last-modified':js.lastModified,etag:js.etag})[h]??null}};},
  Date:{now:()=>now}};
 return {fetched,evaluate:async(fn,arg)=>{const saved={};for(const k of Object.keys(g)){saved[k]=globalThis[k];Object.defineProperty(globalThis,k,{value:g[k],configurable:true,writable:true});}try{return await fn(arg);}finally{for(const k of Object.keys(g))Object.defineProperty(globalThis,k,{value:saved[k],configurable:true,writable:true});}}};
}
const run=async o=>{const p=stubPage(o);return {out:await accessGateDiagnostics(p),page:p};};
const everything=o=>JSON.stringify(o);

test('BD-1 Maske sichtbar: Version und erste 8 Zeichen des Verifiers, Eintrag nur mit version und expiresAt, Browserzeit, Antwortkoepfe, Fehlerelement',async()=>{
 const stored=JSON.stringify({version:3,key:SECRET_KEY,expiresAt:1_795_600_000_000});
 const {out,page}=await run({stored});
 assert.equal(out.gateShown,true);assert.equal(out.storageKeyPresent,true);assert.equal(out.browserNow,1_795_500_000_000);
 assert.deepEqual(out.gate.settings,{version:3,verifier8:VERIFIER.slice(0,8)});
 assert.deepEqual(out.gate.stored,{version:3,expiresAt:1_795_600_000_000});
 assert.deepEqual(out.gate.accessJs,{status:200,lastModified:'Tue, 24 Nov 2026 01:00:00 GMT',etag:'"abc"'});
 assert.deepEqual(out.accessError,{text:'Die Seite konnte nicht geladen werden. Bitte erneut laden.',hidden:true});
 assert.equal(page.fetched[0][0],ACCESS_JS_PATH+'?v=9','der tatsaechlich eingebundene Skript-Pfad wird geprueft');assert.equal(page.fetched[0][1].cache,'no-store');
});
test('BD-2 Der Zugangsschluessel und der volle Verifier verlassen die Seite nie (auch nicht bei kaputtem Eintrag)',async()=>{
 for(const stored of [JSON.stringify({version:3,key:SECRET_KEY,expiresAt:1}),JSON.stringify({key:SECRET_KEY}),'{kaputt '+SECRET_KEY]){
  const {out}=await run({stored});const s=everything(out);
  assert.ok(!s.includes(SECRET_KEY),'Schluessel im Befund: '+stored);assert.ok(!s.includes(VERIFIER),'voller Verifier im Befund');assert.ok(!s.includes('salt'));
 }
 const bad=(await run({stored:'{kaputt'})).out;assert.deepEqual(bad.gate.stored,{unreadable:true});assert.equal(bad.storageKeyPresent,true);
});
test('BD-3 Kein Eintrag: storageKeyPresent false, stored null; Fehlerelement sichtbar mit Text',async()=>{
 const {out}=await run({stored:undefined,errorHidden:false,errorText:'  Zugang abgelaufen  '});
 assert.equal(out.storageKeyPresent,false);assert.equal(out.gate.stored,null);assert.deepEqual(out.accessError,{text:'Zugang abgelaufen',hidden:false});
});
test('BD-4 Keine Maske: nur Grundbefund, kein gate-Block, kein Abruf von access.js',async()=>{
 const {out,page}=await run({gate:false,stored:JSON.stringify({version:3,key:SECRET_KEY,expiresAt:9})});
 assert.equal(out.gateShown,false);assert.equal(out.gate,undefined);assert.equal(out.accessError,null);assert.equal(page.fetched.length,0);assert.ok(!everything(out).includes(SECRET_KEY));
});
test('BD-5 Einstellungen unlesbar und Abruf scheitert: typisierte Ersatzwerte statt Absturz; Fehlertext wird gekuerzt',async()=>{
 const {out}=await run({settings:'kein json',jsThrows:true,errorText:'x'.repeat(500)});
 assert.deepEqual(out.gate.settings,{unreadable:true});assert.deepEqual(out.gate.accessJs,{error:'TypeError'});assert.equal(out.accessError.text.length,200);
});
test('BD-6 Fehler der Diagnose selbst verhindern den Fehlerbericht nie (null statt Ausnahme)',async()=>{
 assert.equal(await accessGateDiagnostics({evaluate:async()=>{throw new Error('Seite geschlossen');}}),null);
});
test('BD-7 Quelltext: Seitenfunktion selbststaendig, nur lesend, schreibt nie den Schluessel (Mutanten-Pruefung)',()=>{
 const src=readFileSync(new URL('../browser-diagnostics.mjs',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(src,/localStorage\.(setItem|removeItem|clear)/);assert.doesNotMatch(src,/\.key\b(?!Present)/,'o.key (der Schluessel) wird nirgends gelesen');
 assert.doesNotMatch(src,/console\.|writeFile/);
 const mutant=src.replace('{version:o?.version??null,expiresAt:','{key:o?.key,version:o?.version??null,expiresAt:');
 assert.notEqual(mutant,src);assert.match(mutant,/\.key\b/,'der Mutant (Schluessel im Befund) wuerde von BD-7 bzw. BD-2 erkannt');
});
