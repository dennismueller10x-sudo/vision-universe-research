import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';

const legacyKey='vu.quant.watchlist.v1',identityKey='vu.quant.watchlist.identities.v1';
const source=readFileSync(resolve('quant/app/ui.js'),'utf8');
const stock=(ticker='DNA',extra={})=>({ticker,state:'AVAILABLE',identityState:'AVAILABLE',instrumentId:'vu_30192a5417e20b',securityId:'vu_30192a5417e20b',masterMemberId:'ref_'+ticker,issuerId:'iss_cik_0001752724',name:'Canonical Company',...extra});
const binding=s=>({ticker:s.ticker,listingId:s.instrumentId,securityId:s.masterMemberId,companyId:s.issuerId??null});
const plain=v=>JSON.parse(JSON.stringify(v));
function harness(initial={}){
 const data=new Map(Object.entries(initial)),writes=[],nodes=[];
 const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{writes.push(key);data.set(key,String(value));}};
 const el=(tag,attrs={},children=[])=>{
  const node={tag,attrs:{...attrs},children:[...children],listeners:{},textContent:attrs.text||'',append(...items){this.children.push(...items.filter(Boolean));},replaceChildren(...items){this.children=items;},setAttribute(key,value){this.attrs[key]=value;},addEventListener(event,handler){this.listeners[event]=handler;}};
  nodes.push(node);return node;
 };
 const window={localStorage:storage,QuantShell:{el}},context={window,document:{title:''}};
 runInNewContext(source,context);
 return {window,context,storage,data,writes,nodes,el,watch:window.QX.watch};
}

test('reading legacy selections and identity metadata never migrates or rewrites existing user storage',()=>{
 const s=stock(),raw='[ "DNA", "KEEP" ]',aux=JSON.stringify({DNA:binding(s),GHOST:binding(stock('GHOST'))});
 const h=harness({[legacyKey]:raw,[identityKey]:aux});
 assert.deepEqual(plain(h.watch.list()),['DNA','KEEP']);assert.equal(h.watch.has('DNA'),true);
 assert.deepEqual(plain(h.watch.identities()),{DNA:binding(s)});
 assert.equal(h.data.get(legacyKey),raw);assert.equal(h.data.get(identityKey),aux);assert.deepEqual(h.writes,[]);
 for(const corrupt of ['broken','[]','null']){
  const c=harness({[legacyKey]:raw,[identityKey]:corrupt});assert.deepEqual(plain(c.watch.identities()),{});
  assert.equal(c.data.get(identityKey),corrupt);assert.deepEqual(c.writes,[]);
 }
});

test('actual stock hero click keeps the legacy ticker array and stores exact canonical listing/security/company IDs',async()=>{
 const s=stock(),h=harness({[legacyKey]:'["KEEP"]'});
 // Stop after the real hero is attached; the independent browser smoke owns
 // the rest of the page and its product-data renderers.
 h.window.VUQuantViewModel={identityNote(){throw Error('TEST_HERO_ATTACHED');}};
 runInNewContext(readFileSync(resolve('quant/app/page-stock.js'),'utf8'),h.context);
 const main=h.el('main');
 await assert.rejects(h.window.QXStock.render(main,'DNA',{api:{getIntelligenceBrief:async()=>({sources:{stock:s}})},loadNames:async()=>null,entries:{}}),/TEST_HERO_ATTACHED/);
 const button=h.nodes.find(node=>node.tag==='button'&&node.attrs.class?.includes('qx-watch'));
 assert.ok(button);assert.equal(button.attrs['aria-pressed'],'false');button.listeners.click();
 assert.deepEqual(JSON.parse(h.data.get(legacyKey)),['DNA','KEEP']);
 assert.deepEqual(JSON.parse(h.data.get(identityKey)),{DNA:binding(s)});assert.equal(button.attrs['aria-pressed'],'true');
 button.listeners.click();assert.deepEqual(JSON.parse(h.data.get(legacyKey)),['KEEP']);
 assert.deepEqual(JSON.parse(h.data.get(identityKey)),{});assert.equal(button.attrs['aria-pressed'],'false');
});

test('missing SEC mapping remains an honest null company ID; missing or conflicting listing identity creates no binding',()=>{
 const h=harness(),s=stock('IPO',{issuerId:null});assert.equal(h.watch.toggle('IPO',s),true);
 assert.deepEqual(plain(h.watch.identities()),{IPO:binding(s)});
 for(const input of [undefined,null,stock('OTHER'),stock('DNA',{instrumentId:null}),stock('DNA',{masterMemberId:null}),stock('DNA',{securityId:'vu_deadbeef'}),stock('DNA',{identityState:'UNAVAILABLE'}),stock('DNA',{issuerId:'invented_company'})]){
  const c=harness();assert.equal(c.watch.toggle('DNA',input),true);
  assert.deepEqual(JSON.parse(c.data.get(legacyKey)),['DNA']);assert.deepEqual(plain(c.watch.identities()),{});
 }
});

test('removal and fifty-selection limit prune canonical bindings with no phantom persisted IDs',()=>{
 const symbols=Array.from({length:50},(_,i)=>'T'+String(i).padStart(2,'0'));
 const identities=Object.fromEntries(symbols.map(ticker=>[ticker,binding(stock(ticker))]));
 const h=harness({[legacyKey]:JSON.stringify(symbols),[identityKey]:JSON.stringify(identities)});
 h.watch.toggle('DNA',stock());const selected=JSON.parse(h.data.get(legacyKey)),saved=JSON.parse(h.data.get(identityKey));
 assert.equal(selected.length,50);assert.equal(selected[0],'DNA');assert.ok(!selected.includes('T49'));assert.equal(saved.T49,undefined);
 assert.deepEqual(Object.keys(saved).sort(),[...selected].sort());
 h.watch.toggle('T00');assert.equal(JSON.parse(h.data.get(identityKey)).T00,undefined);
 const before=h.data.get(identityKey);h.storage.setItem=(key,value)=>{if(key===legacyKey)throw Error('QUOTA');h.data.set(key,value);};
 assert.equal(h.watch.toggle('FAIL',stock('FAIL')),false);assert.equal(h.data.get(identityKey),before);assert.equal(h.watch.identities().FAIL,undefined);
});
