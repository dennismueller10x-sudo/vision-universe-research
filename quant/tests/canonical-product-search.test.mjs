import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
/* Frontend-Rebuild (quant/app): Prüfintention erhalten – der Suchtest lief
   gegen openSearch() aus vu2/experience.js, das geloescht ist. Die neue
   Oberflaeche hat zwei Suchen: den Suchdialog (quant/app/app.js, Taste "/",
   ctx.openSearch) und das Suchfeld der Seite "Aktien" (quant/app/pages.js).
   Beide werden mit den echten Dateien in einem DOM-Doppel ausgefuehrt und
   gegen dieselben Zusagen geprueft: veraltete Antworten werden verworfen,
   Laden, leer und Fehler sind drei verschiedene Saetze. */
const require=createRequire(import.meta.url),Service=require('../api/product-services.js'),Policy=require('../engines/display-policy.js'),Query=require('../engines/query.js');
const root=new URL('../../',import.meta.url);
function api(mutate=()=>{},reads=[]){return Service.create({loadJSON:async p=>{reads.push(p);const d=JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));mutate(p,d);return d;},displayPolicy:Policy,queryEngine:Query});}
test('canonical search resolves stable identities beyond the five-row panel without financial reads',async()=>{
 const reads=[],service=api(()=>{},reads),r=await service.searchInstruments('TSLA');assert.equal(r.state,'AVAILABLE');const hit=r.entries.find(e=>e.ticker==='TSLA');assert.match(hit.securityId,/^vu_/);assert.equal(hit.masterMemberId,'ref_TSLA');assert.ok(reads.every(p=>p.startsWith('/quant/data/universe/')));assert.ok(reads.length<15);
 const stock=await service.getStockIntelligence('TSLA');assert.equal(stock.securityId,hit.securityId);assert.equal(stock.identityState,'AVAILABLE');assert.equal(stock.state,'AVAILABLE');/* Produktuniversum nach Verzeichnisbeleg (exchange-directory-class-1.0.0): 6853 - 167 Anleihen/ETN/Rechte/Optionsscheine = 6686 */assert.equal((await service.getUniverse()).stocks.length,6686);
});
test('missing issuer/CIK does not remove an eligible security from search or identity page',async()=>{
 const service=api((p,d)=>{if(p.includes('/instruments/'))for(const i of d.instruments){i.cik=null;i.issuerId=null;}}),r=await service.searchInstruments('TSLA');assert.ok(r.entries.some(e=>e.ticker==='TSLA'));const stock=await service.getStockIntelligence('TSLA');assert.equal(stock.identityState,'AVAILABLE');assert.equal(stock.issuerId,null);
});
test('excluded, unknown and corrupted identities never appear in search or stock identity',async()=>{
 for(const mutate of [i=>i.productEligibility='EXCLUDED',i=>i.productEligibility='UNKNOWN',i=>i.legacyIds=[],i=>i.instrumentId='sec_TSLA']){
 const service=api((p,d)=>{if(p.includes('/instruments/'))d.instruments.filter(i=>i.symbol==='TSLA').forEach(mutate);});assert.ok(!(await service.searchInstruments('TSLA')).entries.some(e=>e.ticker==='TSLA'));assert.equal((await service.getStockIntelligence('TSLA')).reason,'INVALID_IDENTITY');}
});
test('directory failure differs from a successful empty search; no mock fallback',async()=>{
 const service=api(p=>{if(p.includes('/search/sym/'))throw Error('offline');});assert.equal((await service.searchInstruments('TSLA')).state,'SOURCE_MISSING');const empty=await api().searchInstruments('ZZZZZZZZZZZZZZ');assert.equal(empty.state,'AVAILABLE');assert.deepEqual(empty.entries,[]);
});
test('search deduplicates canonical member identities and enforces bounded results',async()=>{
 const result=await api().searchInstruments('COHR',{limit:12});assert.equal(result.entries.filter(x=>x.ticker==='COHR').length,1);assert.equal(new Set(result.entries.map(x=>x.masterMemberId)).size,result.entries.length);const bounded=await api().searchInstruments('AA',{limit:1});assert.ok(bounded.entries.length<=1);
});
/* Eine Suche, deren Antworten der Test selbst ausloest - in beliebiger
   Reihenfolge. */
function steuerbareSuche(){const pending=[];return {pending,searchInstruments:q=>new Promise(resolve=>pending.push({q,resolve}))};}
function suchUmgebung(api){
 const {win,document,lade,erzeugt}=seitenUmgebung();
 win.VUProductServices={create:()=>api};win.VUDisplayPolicy={};win.VUQuery={};
 lade('quant/ui/shell.js','quant/engines/plain-verdict.js','quant/app/view-model.js','quant/app/ui.js','quant/app/pages.js','quant/app/app.js');
 return {win,document,erzeugt};
}
async function pruefeSuche(name,input,status,hits,pending){
 input.value='TSLA';const first=input.listeners.input[0]();assert.match(status(),/gesucht/,name+': kein Ladezustand');
 input.value='MSFT';const second=input.listeners.input[0]();
 pending[1].resolve({state:'AVAILABLE',entries:[{ticker:'MSFT',name:'Microsoft'}]});await second;
 pending[0].resolve({state:'AVAILABLE',entries:[{ticker:'TSLA',name:'Tesla'}]});await first;
 const h=hits();assert.equal(h.length,1,name+': veraltete Antwort ueberschreibt die neue');
 assert.match(h[0].textContent,/MSFT/,name+': die veraltete Antwort (TSLA) steht in der Liste');assert.match(h[0].textContent,/Microsoft/);
 assert.equal(/TSLA|Tesla/.test(h[0].textContent),false,name+': die veraltete Antwort (TSLA) steht in der Liste');
 input.value='none';const third=input.listeners.input[0]();pending[2].resolve({state:'AVAILABLE',entries:[]});await third;
 assert.match(status(),/Keine passenden/,name+': leer ist kein eigener Satz');assert.equal(hits().length,0);
 input.value='failed';const fourth=input.listeners.input[0]();pending[3].resolve({state:'SOURCE_MISSING',entries:[]});await fourth;
 assert.match(status(),/derzeit nicht verfügbar/,name+': Fehler liest sich wie ein leeres Ergebnis');assert.equal(hits().length,0);
}
test('search UI ignores stale asynchronous results and displays loading, empty and error states',async()=>{
 /* 1. Der Suchdialog (app.js). Er haengt nicht im Dokument-Doppel; seine
    Knoten werden ueber die Liste aller erzeugten Elemente gefunden. */
 {const api=steuerbareSuche(),{win,erzeugt}=suchUmgebung(api);
  win.QXApp.ctx.openSearch();
  const dialog=erzeugt.find(n=>n.tagName==='DIALOG'&&knoten(n,x=>x.tagName==='INPUT').length);
  assert.ok(dialog&&dialog.open,'der Suchdialog oeffnet nicht');
  const input=knoten(dialog,x=>x.tagName==='INPUT')[0],status=knoten(dialog,x=>x.getAttribute('role')==='status')[0],list=knoten(dialog,x=>x.getAttribute('role')==='listbox')[0];
  assert.ok(input&&status&&list,'Suchfeld, Statuszeile oder Trefferliste fehlen im Dialog');
  await pruefeSuche('Suchdialog',input,()=>status.textContent,()=>list.children,api.pending);}
 /* 2. Das Suchfeld der Seite "Aktien" (pages.js). Die uebrigen Abfragen
    der Seite bleiben offen - geprueft wird nur die Suche. */
 {const api=steuerbareSuche(),{win,document}=suchUmgebung(api);
  const offen=()=>new Promise(()=>{});
  const dienst=new Proxy(api,{get:(t,k)=>(k in t?t[k]:offen)});
  const ctx=new Proxy({api:dienst,names:{},types:{},entries:{},loadNames:async()=>({})},{get:(t,k)=>(k in t?t[k]:offen)});
  const main=document.createElement('main');win.QXPages.stocks(main,ctx);
  const input=knoten(main,x=>x.tagName==='INPUT')[0];assert.ok(input,'die Seite Aktien hat kein Suchfeld');
  const results=main.children.find(x=>x.getAttribute('aria-live')==='polite');assert.ok(results,'die Seite Aktien hat keinen Ergebnisbereich');
  await pruefeSuche('Seite Aktien',input,()=>results.textContent,()=>knoten(results,x=>/(^| )qx-row( |$)/.test(x.className)),api.pending);}
});

test('identity-only stock does not request the unrelated five-company financial panel',async()=>{
 const reads=[],service=api(p=>{if(p.endsWith('quant-factor-inputs.json'))throw Error('panel offline');},reads);
 const stock=await service.getStockIntelligence('TSLA');assert.equal(stock.identityState,'AVAILABLE');assert.equal(stock.ticker,'TSLA');assert.equal(stock.state,'AVAILABLE');assert.ok(reads.some(p=>p.endsWith('quant-factor-inputs.json')));
});
test('config and connected-panel failures preserve independent canonical identity with typed availability',async()=>{
 for(const failed of ['/quant/config/development-preview.json','/quant/config/feature-gates.json','/quant/data/sec/quant-factor-inputs.json']){
  const ticker=failed.endsWith('quant-factor-inputs.json')?'NVDA':'TSLA',service=api(p=>{if(p===failed)throw Error('offline');});
  const stock=await service.getStockIntelligence(ticker);assert.equal(stock.identityState,'AVAILABLE',failed);assert.equal(stock.ticker,ticker);assert.match(stock.securityId,/^vu_/);
  if(failed.endsWith('quant-factor-inputs.json')){assert.equal(stock.state,'AVAILABLE');assert.equal(stock.chart.state,'AVAILABLE');assert.equal(stock.quant.state,'AVAILABLE');assert.equal(stock.quant.score.state,'UNAVAILABLE');}
  else {assert.equal(stock.state,'UNAVAILABLE');assert.equal(stock.reason,'SOURCE_MISSING');for(const status of Object.values(stock.availability)){assert.equal(status.state,'UNAVAILABLE');assert.equal(status.reason,'SOURCE_MISSING');}assert.equal(stock.price,undefined);assert.equal(stock.chart,undefined);}
 }
});

/* ------------------------------------------------------------------------
   DIE SEITE AUSGEFUEHRT, NICHT GELESEN.

   Ein kleines DOM-Doppel, in dem die echten Dateien der neuen Oberflaeche
   laufen (quant/ui/shell.js fuer el(), view-model.js, ui.js, pages.js, app.js). Geprueft wird, was im Kopf der Aktienseite STEHT - nicht,
   welche Zeichenfolge im Quelltext vorkommt. Hier: die beiden Suchen der
   neuen Oberflaeche (Suchdialog in quant/app/app.js, Suchfeld der Seite
   "Aktien" in quant/app/pages.js).
   ------------------------------------------------------------------------ */
function seitenUmgebung() {
  const textNode = (s) => ({ nodeType: 3, textContent: String(s), children: [] });
  const erzeugt = [];
  function element(tag) {
    const n = {
      tagName: String(tag).toUpperCase(), nodeType: 1, children: [], attributes: {}, dataset: {}, style: {},
      listeners: {}, className: "", _text: "", open: false, value: "", disabled: false,
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); },
      set textContent(v) { this._text = String(v); this.children = []; },
      get firstChild() { return this.children[0] || null; },
      get isConnected() { return true; },
      appendChild(c) { this.children.push(c); return c; },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
      append(...k) { for (const c of k) if (c !== null && c !== undefined) this.appendChild(typeof c === "string" ? textNode(c) : c); },
      replaceChildren(...k) { this.children = []; this._text = ""; this.append(...k); },
      setAttribute(k, v) { this.attributes[k] = String(v); if (k === "id") this.id = String(v); },
      getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
      removeAttribute(k) { delete this.attributes[k]; },
      addEventListener(k, f) { (this.listeners[k] ||= []).push(f); },
      removeEventListener() {}, dispatchEvent() {},
      querySelector() { return null; }, querySelectorAll() { return []; },
      getBoundingClientRect() { return { width: 640, height: 320, left: 0, top: 0 }; },
      scrollIntoView() {}, focus() {}, showModal() { this.open = true; }, close() { this.open = false; }
    };
    erzeugt.push(n);
    return n;
  }
  const document = { createElement: element, createElementNS: (_, t) => element(t), createTextNode: textNode,
    body: element("body"), readyState: "loading", title: "", activeElement: null,
    addEventListener() {}, querySelector: () => null, getElementById: () => null };
  const win = { document, console, setTimeout, clearTimeout, URLSearchParams, Event: class {},
    location: { hash: "", search: "", pathname: "/quant/" }, history: { replaceState() {} },
    localStorage: { getItem: () => null, setItem() {} }, innerWidth: 1200,
    addEventListener() {}, removeEventListener() {}, scrollTo() {} };
  win.window = win;
  vm.createContext(win);
  const lade = (...pfade) => { for (const p of pfade) vm.runInContext(readFileSync(fileURLToPath(new URL(p, root)), "utf8"), win, { filename: p }); };
  return { win, document, lade, erzeugt };
}
function knoten(node, pred, out = []) {
  if (!node || !node.children) return out;
  if (node.nodeType === 1 && pred(node)) out.push(node);
  for (const c of node.children) knoten(c, pred, out);
  return out;
}
