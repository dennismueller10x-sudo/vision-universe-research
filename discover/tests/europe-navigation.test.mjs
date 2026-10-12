import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';const source=await readFile(new URL('../ui/europe.js',import.meta.url),'utf8'),global={VUDiscover:{},QuantShell:{el:()=>{}}};vm.runInNewContext(source,{globalThis:global});const view=global.VUDiscover.EuropeView;
test('Discover never inserts a primary USA/Europe switch',()=>{for(const hash of ['','#/','#/u/US_REAL','#/s/EUROPE/ref_2GB_DE_XETR','#/watchlist'])assert.equal(view.navigationAllowed('EUROPE',hash),false);assert.equal(source.includes('data-europe-navigation'),false);});
test('explicit listing routes use their canonical region; home, search and watchlist return to global context',()=>{const ctx={universeId:'EUROPE'};for(const parts of [[],['watchlist'],['suche'],['welten'],['s','US_REAL','NVDA']]){assert.equal(view.bindRoute(parts,ctx),false);assert.equal(ctx.universeId,'US_REAL');assert.equal(view.handles(parts,ctx),false);}view.bindRoute(['s','EUROPE','ref_2GB_DE_XETR'],ctx);assert.equal(ctx.universeId,'EUROPE');assert.equal(view.handles(['s','EUROPE','ref_2GB_DE_XETR'],ctx),true);});

function europeView(){
  const D={},calls={ensure:0,connect:0,browse:0,messages:[]};
  const g={VUDiscover:D,QuantShell:{el:()=>({append(){},querySelectorAll:()=>[]})}};
  vm.runInNewContext(source,{globalThis:g,document:{title:''},setTimeout,Promise,Error});
  const ctx={universeId:'EUROPE'};let route=0;
  D.EuropeView.attachApp({ctx,route:()=>{route++;},isReady:()=>true});
  D.EuropeBootstrap={async ensure(){calls.ensure++;D.europePublicLoader={async connect(){calls.connect++;D.europeProduct={async browse(){calls.browse++;return {state:'UNAVAILABLE'};},async detail(){return {state:'UNAVAILABLE'};},async saved(){return {data:{members:[]}};}};}};return D.europePublicLoader;}};
  return {D,ctx,calls,message:(root,title)=>calls.messages.push(title)};
}
test('Hash-Wechsel auf eine Europa-Route ohne vorherige Suche holt das Verzeichnis und verbindet', async () => {
  for (const parts of [['c','EUROPE','all'],['s','EUROPE','ref_RHM_DE_XETR'],['watchlist','EUROPE']]) {
    const {D,ctx,calls,message}=europeView();
    assert.equal(D.europePublicLoader,undefined);
    await D.EuropeView.render({append(){}}, {parts,ctx,route(){},active:()=>true,message});
    assert.equal(calls.ensure,1,parts.join('/'));assert.equal(calls.connect,1,parts.join('/'));
    if(parts[0]==='c')assert.equal(calls.browse,1);
  }
});
test('Verlauf vor/zurueck und eingefuegter Link: wiederholte Europa-Routen holen das Verzeichnis nur einmal', async () => {
  const {D,calls,ctx,message}=europeView();
  for (let i=0;i<3;i++) await D.EuropeView.render({append(){}}, {parts:['c','EUROPE','all'],ctx,route(){},active:()=>true,message});
  assert.equal(calls.ensure,1);assert.equal(calls.connect,1);assert.equal(calls.browse,3);
});
test('selectUniverse(EUROPE) ohne Verzeichnis stoesst den Start an', async () => {
  const {D,calls}=europeView();
  globalThis.__h=null;
  await D.App.selectUniverse('EUROPE').catch(()=>{});
  assert.equal(calls.ensure,1);assert.equal(calls.connect,1);
});
