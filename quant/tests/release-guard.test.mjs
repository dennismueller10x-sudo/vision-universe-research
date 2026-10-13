// Waechter fuer den Deployment-Wechsel (quant/ui/release-guard.js): Entscheidungen ohne Browser.
// Der Browserlauf mit Gate und beiden Engines steht in scripts/vu2/deploy-switch-qa.mjs.
import test, {mock, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Guard=require('../ui/release-guard.js');

const OWN='aaaaaaaaaaaaaaaa',NEXT='bbbbbbbbbbbbbbbb';
const keys=['document','fetch','sessionStorage','location','addEventListener'];
let saved,reloads,fetches,listeners,store,serverId;

class Field{
 constructor(o){Object.assign(this,{tagName:'INPUT',type:'text',id:'',name:'',value:'',defaultValue:'',checked:false,defaultChecked:false,events:[]},o);}
 dispatchEvent(e){this.events.push(e.type);return true;}
}
function dom({fields=[],active=null,withMeta=true}={}){
 const meta={getAttribute:n=>({content:OWN,'data-product':'quant'}[n])};
 const body={appended:[],appendChild(n){this.appended.push(n);},contains(n){return this.appended.includes(n);}};
 return {
  body,activeElement:active||body,
  querySelector:s=>s==='meta[name="vu-release"]'&&withMeta?meta:null,
  querySelectorAll:sel=>{const m=String(sel).match(/^\[name="(.*)"\]$/);return m?fields.filter(f=>f.name===m[1]):fields;},
  getElementById:id=>fields.find(f=>f.id===id)||null,
  createElement:tag=>({tagName:tag.toUpperCase(),style:{},children:[],setAttribute(){},addEventListener(){},appendChild(c){this.children.push(c);}})
 };
}
function install(document,{storage=true}={}){
 store=new Map();
 globalThis.document=document;
 globalThis.sessionStorage=storage?{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}:{getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');},removeItem(){throw new Error('blocked');}};
 globalThis.location={pathname:'/quant/',search:'',hash:'#/aktie/NVDA',reload(){reloads++;}};
 globalThis.addEventListener=(type,fn)=>{(listeners[type]=listeners[type]||[]).push(fn);};
}
beforeEach(()=>{
 saved=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 reloads=0;fetches=[];listeners={};serverId=OWN;
 mock.timers.enable({apis:['Date','setTimeout']});
 globalThis.fetch=async url=>{fetches.push(url);return {ok:true,json:async()=>({schema:'vu-release-id-1',products:{quant:serverId}})};};
 Guard.reset();
});
afterEach(()=>{
 mock.timers.reset();
 for(const k of keys){if(saved[k]===undefined)delete globalThis[k];else globalThis[k]=saved[k];}
});
const settles=async p=>{let done=false;p.then(()=>{done=true;},()=>{done=true;});await new Promise(r=>setImmediate(r));return done;};

test('ohne Kennung (Quelltext, Tests): keine Abfrage, kein Neuladen',async()=>{
 install(dom({withMeta:false}));
 await Guard.beforeLoad();await Guard.onMissing('/x.json.gz');
 assert.equal(fetches.length,0);assert.equal(reloads,0);assert.equal(Guard.known(),false);
});

test('gleicher Release: Nachladen und 404 laufen wie bisher, kein Neuladen',async()=>{
 install(dom());
 await Guard.beforeLoad();
 assert.equal(await Guard.onMissing('/quant/data/x.json.gz'),'SAME');
 assert.equal(reloads,0);
 assert.match(fetches[0],/^\/release-id\.json\?t=\d+$/);
});

test('neuer Release, keine Eingabe: einmal neu laden, Marke und Sicherung gesetzt, Nachladen laeuft nicht weiter',async()=>{
 const field=new Field({id:'q',value:'Apple',defaultValue:''});
 install(dom({fields:[field]}));
 serverId=NEXT;
 const pending=Guard.beforeLoad();
 assert.equal(await settles(pending),false,'der Aufruf darf nicht weiterlaufen, die Seite laedt neu');
 assert.equal(reloads,1);
 const mark=JSON.parse(store.get(Guard.MARK_KEY));
 assert.equal(mark.target,NEXT);
 assert.deepEqual(mark.snapshot,{href:'/quant/#/aktie/NVDA',fields:[{k:'#q',v:'Apple'}]});
 // weitere Aufrufe im selben Dokument loesen kein zweites Neuladen aus
 Guard.onMissing('/y.json.gz');await new Promise(r=>setImmediate(r));
 assert.equal(reloads,1);
});

test('neuer Release, Textfeld mit Inhalt im Fokus: kein Neuladen, Hinweis, Nachladen abgelehnt; der naechste Routenwechsel laedt neu',async()=>{
 const typing=new Field({id:'q',value:'App'});
 const d=dom({active:typing});install(d);
 serverId=NEXT;
 await assert.rejects(Guard.beforeLoad(),/RELEASE_STALE/);
 assert.equal(reloads,0);
 assert.equal(d.body.appended.length,1,'ein Hinweis mit Knopf');
 typing.value='';d.activeElement=d.body;
 listeners.hashchange.forEach(fn=>fn());
 assert.equal(reloads,1,'beim Routenwechsel ist die Eingabe abgeschlossen');
});

test('ein leeres Textfeld im Fokus ist keine Eingabe',async()=>{
 install(dom({active:new Field({id:'q',value:''})}));
 assert.equal(Guard.busy(),false);
 globalThis.document.activeElement=new Field({tagName:'TEXTAREA',value:'x'});
 assert.equal(Guard.busy(),true);
 globalThis.document.activeElement=new Field({tagName:'A'});
 assert.equal(Guard.busy(),false);
});

test('Schleifenschutz: dasselbe Ziel wird innerhalb von 10 Minuten nicht noch einmal neu geladen',async()=>{
 install(dom());
 store.set(Guard.MARK_KEY,JSON.stringify({target:NEXT,at:Date.now()-60000}));
 serverId=NEXT;
 await assert.rejects(Guard.beforeLoad(),/RELEASE_STALE/);
 assert.equal(reloads,0);
 // nach Ablauf der Frist ist ein neuer Versuch erlaubt
 Guard.reset();
 store.set(Guard.MARK_KEY,JSON.stringify({target:NEXT,at:Date.now()-Guard.LOOP_MS-1}));
 Guard.beforeLoad();await new Promise(r=>setImmediate(r));
 assert.equal(reloads,1);
});

test('ohne sessionStorage kein automatisches Neuladen (kein Schleifenschutz moeglich), nur der Hinweis',async()=>{
 const d=dom();install(d,{storage:false});
 serverId=NEXT;
 await assert.rejects(Guard.beforeLoad(),/RELEASE_STALE/);
 assert.equal(await Guard.onMissing('/x.json.gz'),'NEWER');
 assert.equal(reloads,0);assert.equal(d.body.appended.length,1);
});

test('Abfrage scheitert oder haengt: Fehler gilt wie bisher, nichts wird neu geladen',async()=>{
 install(dom());
 globalThis.fetch=async()=>{throw new Error('offline');};
 assert.equal(await Guard.onMissing('/x.json.gz'),'UNKNOWN');
 Guard.reset();
 globalThis.fetch=()=>new Promise(()=>{});
 const p=Guard.onMissing('/x.json.gz');
 mock.timers.tick(3001);
 assert.equal(await p,'UNKNOWN');
 assert.equal(reloads,0);
});

test('ein Befund gilt zwei Sekunden: gleichzeitige Aufrufe teilen eine Abfrage, danach wird neu gefragt',async()=>{
 install(dom());
 await Promise.all([Guard.beforeLoad(),Guard.onMissing('/a'),Guard.onMissing('/b')]);
 assert.equal(fetches.length,1);
 mock.timers.tick(1000);await Guard.beforeLoad();
 assert.equal(fetches.length,1,'nach 1 s gilt der Befund');
 mock.timers.tick(1500);await Guard.onMissing('/x');
 assert.equal(fetches.length,2,'nach 2,5 s wird neu gefragt: ein Release, der gerade kam, wird nicht uebersehen');
});

test('Sicherung und Wiederherstellung: Felder mit Aenderung, nicht Passwort/Datei/Unveraendertes',async()=>{
 const changed=new Field({id:'a',value:'12',defaultValue:''}),same=new Field({id:'b',value:'x',defaultValue:'x'});
 const secret=new Field({id:'c',type:'password',value:'geheim'}),check=new Field({name:'k',type:'checkbox',checked:true,defaultChecked:false});
 const anon=new Field({value:'ohne id'});
 const select=new Field({tagName:'SELECT',id:'s',value:'b',options:[{defaultSelected:true},{defaultSelected:false}],selectedIndex:1});
 install(dom({fields:[changed,same,secret,check,anon,select]}));
 const snap=Guard.snapshot();
 assert.deepEqual(snap.fields,[{k:'#a',v:'12'},{k:'[name="k"]',c:true},{k:'#s',v:'b'}]);
 // nach dem Neuladen: leere Felder derselben Kennung werden gefuellt und melden input/change
 const fresh=new Field({id:'a',value:'',defaultValue:''}),box=new Field({name:'k',type:'checkbox'}),sel=new Field({tagName:'SELECT',id:'s',value:'a'});
 install(dom({fields:[fresh,box,sel]}));
 Guard.restore(snap);
 assert.equal(fresh.value,'12');assert.deepEqual(fresh.events,['input','change']);
 assert.equal(box.checked,true);assert.equal(sel.value,'b');
});

test('Start nach dem Neuladen: erreicht der Tab die Zielkennung, faellt die Marke; sonst bleibt sie als Schleifenschutz',async()=>{
 install(dom());
 store.set(Guard.MARK_KEY,JSON.stringify({target:OWN,at:Date.now()-1000,snapshot:null}));
 Guard.watch();
 assert.equal(store.has(Guard.MARK_KEY),false,'Ziel erreicht');
 Guard.reset();
 store.set(Guard.MARK_KEY,JSON.stringify({target:NEXT,at:Date.now()-1000,snapshot:null}));
 Guard.watch();
 assert.equal(store.has(Guard.MARK_KEY),true,'veralteter Cache: die Marke schuetzt vor der Schleife');
});
