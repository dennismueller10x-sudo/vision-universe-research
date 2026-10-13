// Code-Kennung je Produkt (scripts/vu2/release-id.mjs): aendert sich mit dem Code, nicht mit Daten.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {stampRelease,productId,linkedAssets,stripMeta,withMeta,PRODUCTS} from '../../scripts/vu2/release-id.mjs';

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
