// Code-Kennung je Produkt (scripts/vu2/release-id.mjs): aendert sich mit dem Code, nicht mit Daten.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {stampRelease,stampTrees,productId,linkedAssets,stripMeta,withMeta,PRODUCTS,STAMP_ONLY} from '../../scripts/vu2/release-id.mjs';

const repo=resolve(fileURLToPath(import.meta.url),'../../..');
async function put(site,path,text){await mkdir(join(site,path,'..'),{recursive:true});await writeFile(join(site,path),text);}
async function site(){
 const dir=await mkdtemp(join(tmpdir(),'release-id-'));
 await put(dir,'quant/index.html','<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/quant/app/app.css"></head><body><script src="/quant/release-bundle.js?v=abc"></script></body></html>');
 await put(dir,'quant/app/app.css','a{}');
 await put(dir,'quant/release-bundle.js','var bundle=1;');
 await put(dir,'quant/app/page-chartbild.js','var lazy=1;');   // nicht verlinkt, wird bei Bedarf nachgeladen
 await put(dir,'quant/data/product/x.json','{"d":1}');
 await put(dir,'discover/index.html','<!doctype html><html><head><meta charset="utf-8"></head><body><template id="dx-lazy-detail"><script src="/discover/ui/detail.js?v=1"></script></template><script src="/discover/app.js"></script></body></html>');
 await put(dir,'discover/app.js','var app=1;');
 await put(dir,'discover/ui/detail.js','var detail=1;');
 await put(dir,'discover/ui/tests/skip.test.js','ignored');
 await put(dir,'discover/data/meta.json','{"d":1}');
 await put(dir,'core/europe-market-data.js','var core=1;');   // von europe-bootstrap.js zur Laufzeit nachgeladen
 return dir;
}

test('Kennungen: je Produkt 16 Hex, Meta-Tag nach dem Zeichensatz, release-id.json',async()=>{
 const dir=await site();
 try{
  const report=await stampRelease(dir,{commit:'c0ffee'});
  assert.equal(report.schema,'vu-release-id-1');assert.equal(report.commit,'c0ffee');
  assert.match(report.products.quant,/^[0-9a-f]{16}$/);assert.match(report.products.discover,/^[0-9a-f]{16}$/);
  assert.notEqual(report.products.quant,report.products.discover);
  assert.deepEqual(JSON.parse(await readFile(join(dir,'release-id.json'),'utf8')),report);
  const html=await readFile(join(dir,'quant/index.html'),'utf8');
  assert.match(html,/<meta charset="utf-8">\n<meta name="vu-release" data-product="quant" content="[0-9a-f]{16}">/);
  assert.equal((html.match(/name="vu-release"/g)||[]).length,1);
  assert.ok(html.indexOf('vu-release')<html.indexOf('<script'),'die Kennung steht vor allen Skripten');
  // Jedes verlinkte Asset traegt den Hash seiner ausgelieferten Bytes (ein altes ?v=abc wird ersetzt)
  const digest=async f=>createHash('sha256').update(await readFile(join(dir,f))).digest('hex').slice(0,16);
  assert.ok(html.includes('/quant/app/app.css?v='+await digest('quant/app/app.css')));
  assert.ok(html.includes('/quant/release-bundle.js?v='+await digest('quant/release-bundle.js')));
  const discover=await readFile(join(dir,'discover/index.html'),'utf8');
  assert.ok(discover.includes('/discover/ui/detail.js?v='+await digest('discover/ui/detail.js')),'Skripte in <template> ebenso');
  assert.ok(discover.includes('/discover/app.js?v='+await digest('discover/app.js')));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Kennung bleibt bei Daten gleich und aendert sich mit verlinktem und nachgeladenem Code',async()=>{
 const dir=await site();
 try{
  const base=await stampRelease(dir);
  await put(dir,'quant/data/product/x.json','{"d":2}');await put(dir,'discover/data/meta.json','{"d":2}');
  assert.deepEqual((await stampRelease(dir)).products,base.products,'Daten aendern die Kennung nicht, die Kennung ist wiederholbar (ein Meta-Tag)');
  await put(dir,'quant/app/page-chartbild.js','var lazy=2;');
  const lazy=await stampRelease(dir);
  assert.notEqual(lazy.products.quant,base.products.quant,'nachgeladenes Quant-Skript');assert.equal(lazy.products.discover,base.products.discover);
  await put(dir,'discover/ui/detail.js','var detail=2;');
  const detail=await stampRelease(dir);
  assert.notEqual(detail.products.discover,lazy.products.discover,'Skript einer Discover-Gruppe im <template>');
  await put(dir,'core/europe-market-data.js','var core=2;');
  assert.notEqual((await stampRelease(dir)).products.discover,detail.products.discover,'core/ gehoert zur Discover-Kennung (Laufzeit-Skripte)');
  await put(dir,'quant/release-bundle.js','var bundle=2;');
  assert.notEqual((await stampRelease(dir)).products.quant,detail.products.quant,'verlinktes Buendel');
  await put(dir,'discover/ui/tests/skip.test.js','geaendert');
  assert.equal(await productId(dir,'discover'),(await stampRelease(dir)).products.discover,'Tests zaehlen nicht');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('ein verlinktes, aber fehlendes Skript bricht den Lauf ab; ein Release ohne Discover stempelt Quant allein',async()=>{
 const dir=await site();
 try{
  await put(dir,'discover/index.html','<html><head></head><body><script src="/discover/gone.js"></script></body></html>');
  await assert.rejects(stampRelease(dir),/RELEASE_ID_ASSET_MISSING:discover\/gone\.js/);
  await rm(join(dir,'discover/index.html'));
  const report=await stampRelease(dir);
  assert.deepEqual(Object.keys(report.products),['quant']);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Hilfsfunktionen: Verweise ohne Query, Meta ersetzen',()=>{
 assert.deepEqual([...linkedAssets('<script src="/a/b.js?v=1"></script><link href="/c.css" rel="stylesheet"><a href="/x.html"><script src="https://cdn/x.js">')].sort(),['a/b.js','c.css']);
 const once=withMeta('<head><title>t</title></head>','quant','0123456789abcdef');
 assert.match(once,/^<head>\n<meta name="vu-release" data-product="quant" content="0123456789abcdef"><title>/);
 assert.equal(stripMeta(withMeta(once,'quant','fedcba9876543210')),stripMeta(once));
 assert.throws(()=>withMeta('<p>kein Kopf</p>','quant','0123456789abcdef'),/RELEASE_ID_NO_HEAD/);
});

test('die echten Seiten: jedes verlinkte Skript und Stilblatt von Quant und Discover existiert im Repository',async()=>{
 for(const [key,{page}] of Object.entries(PRODUCTS)){
  const html=await readFile(join(repo,page),'utf8');
  const missing=[...linkedAssets(html)].filter(f=>!existsSync(join(repo,f)));
  assert.deepEqual(missing,[],key+': verlinkte Dateien fehlen (die Pipeline bricht sonst ab)');
 }
});

// Supertrader: Nur-Stempel-Baum (mehrere Seiten, kein Meta-Tag, kein Eintrag in release-id.json)
const ST_PAGE=(title,extra='')=>'<!doctype html><html><head><meta charset="utf-8"><title>'+title+'</title><link rel="stylesheet" href="/assets/site-navigation.css"><link rel="stylesheet" href="/supertrader/assets/supertrader.css"></head><body><script src="/assets/site-navigation.js"></script><script src="/supertrader/assets/st-chart.js"></script><script src="/supertrader/assets/supertrader.js"></script>'+extra+'</body></html>';
async function stSite(){
 const dir=await site();
 await put(dir,'assets/site-navigation.css','n{}');await put(dir,'assets/site-navigation.js','var nav=1;');
 await put(dir,'supertrader/assets/st-chart.js','var chart=1;');await put(dir,'supertrader/assets/supertrader.js','var st=1;');await put(dir,'supertrader/assets/supertrader.css','s{}');
 for(const p of ['supertrader/index.html','supertrader/signals/index.html','supertrader/stock/AAPL/index.html','supertrader/stock/MSFT/index.html'])await put(dir,p,ST_PAGE(p));
 await put(dir,'supertrader/data/x.json','{"d":1}');
 return dir;
}
const digestOf=async(dir,f)=>createHash('sha256').update(await readFile(join(dir,f))).digest('hex').slice(0,16);
const stPages=['supertrader/index.html','supertrader/signals/index.html','supertrader/stock/AAPL/index.html','supertrader/stock/MSFT/index.html'];

test('Supertrader: jede Seite des Baums traegt den Hash der ausgelieferten Bytes, ohne Meta-Tag und ohne release-id-Eintrag',async()=>{
 const dir=await stSite();
 try{
  assert.deepEqual(STAMP_ONLY,['supertrader']);assert.ok(!('supertrader' in PRODUCTS),'kein Produkt: kein Waechter, keine Kennung');
  const report=await stampRelease(dir,{commit:'c0ffee'});
  assert.deepEqual(Object.keys(report.products),['quant','discover'],'release-id.json unveraendert im Format');
  assert.deepEqual(JSON.parse(await readFile(join(dir,'release-id.json'),'utf8')),report);
  for(const p of stPages){
   const html=await readFile(join(dir,p),'utf8');
   for(const f of ['supertrader/assets/st-chart.js','supertrader/assets/supertrader.js','supertrader/assets/supertrader.css','assets/site-navigation.js','assets/site-navigation.css'])
    assert.ok(html.includes('/'+f+'?v='+await digestOf(dir,f)),p+': '+f);
   assert.ok(!html.includes('vu-release'),p+': kein Meta-Tag');
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Supertrader: wiederholbar; Hashes aendern sich nur mit dem Code, nicht mit Daten oder Seitentext',async()=>{
 const dir=await stSite();
 try{
  await stampRelease(dir);
  const once=await Promise.all(stPages.map(p=>readFile(join(dir,p),'utf8')));
  assert.deepEqual(await stampTrees(dir),{pages:4,changed:0},'zweiter Lauf aendert nichts');
  await stampRelease(dir);
  assert.deepEqual(await Promise.all(stPages.map(p=>readFile(join(dir,p),'utf8'))),once);
  await put(dir,'supertrader/data/x.json','{"d":2}');
  assert.equal((await stampTrees(dir)).changed,0,'reine Datenaenderung');
  await put(dir,'supertrader/assets/st-chart.js','var chart=2;');
  assert.equal((await stampTrees(dir)).changed,4,'Codeaenderung erreicht jede Seite');
  const h=await readFile(join(dir,'supertrader/stock/MSFT/index.html'),'utf8');
  assert.ok(h.includes('/supertrader/assets/st-chart.js?v='+await digestOf(dir,'supertrader/assets/st-chart.js')));
  assert.ok(h.includes('/supertrader/assets/supertrader.js?v='+await digestOf(dir,'supertrader/assets/supertrader.js')),'unveraendert, aber im Hash der eigenen Bytes');
  assert.ok(!h.includes('?v=?v='));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Supertrader: fehlendes Asset bricht ab; ein Release ohne Supertrader-Baum stempelt nichts',async()=>{
 const dir=await stSite();
 try{
  await rm(join(dir,'supertrader/assets/supertrader.css'));
  await assert.rejects(stampTrees(dir),/RELEASE_ID_ASSET_MISSING:supertrader\/assets\/supertrader\.css/);
  assert.deepEqual(await stampTrees(dir,['gibt-es-nicht']),{pages:0,changed:0});
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('die echten Supertrader-Seiten verweisen nur absolut auf JS/CSS (relative Pfade blieben ungestempelt)',async()=>{
 const {readdir}=await import('node:fs/promises');
 const pages=[];
 const walk=async rel=>{for(const e of await readdir(join(repo,rel),{withFileTypes:true})){const p=rel+'/'+e.name;if(e.isDirectory())await walk(p);else if(e.name.endsWith('.html'))pages.push(p);}};
 await walk('supertrader');
 assert.ok(pages.length>0);
 const ANY=/\b(?:src|href)\s*=\s*["']([^"'#?]*\.(?:js|css))(?:\?[^"']*)?["']/g;
 const bad=[];
 for(const p of pages){const html=await readFile(join(repo,p),'utf8');for(const m of html.matchAll(ANY))if(!m[1].startsWith('/')||!existsSync(join(repo,m[1])))bad.push(p+' '+m[1]);}
 assert.deepEqual(bad.slice(0,5),[],'relative oder fehlende JS/CSS-Verweise in Supertrader-Seiten');
});
